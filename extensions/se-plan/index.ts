/**
 * /se-plan guided command.
 *
 * Walks the user through a short interview that produces a planning
 * brief in the shape /skill:se-plan expects. Answers are persisted to
 * the SE substrate via appendSE(SE_ENTRY_TYPES.PLAN_DRAFT, ...) after
 * every step, so the draft survives /compact, /fork, and restart.
 *
 * Scope decision: this command captures the *brief* (Phase 0-2 of
 * /skill:se-plan), not the deep interview. The full SKILL.md flow stays
 * for users who want guided deepening; this command is the fast path
 * for users who already know what they want to plan and just need a
 * well-shaped brief to hand off.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

import { appendSE, readAllSE, SE_ENTRY_TYPES } from "../se-state.ts"

interface PlanDraftStep {
  step: string
  answer: string
  recordedAt: string
}

interface PlanDraftFinal {
  step: "final-brief"
  brief: string
  recordedAt: string
}

const STEPS: Array<{ key: string; prompt: string; placeholder: string; required: boolean }> = [
  {
    key: "topic",
    prompt: "What is the plan about? (one sentence)",
    placeholder: "e.g. extract a stable analytics-events module",
    required: true,
  },
  {
    key: "problem",
    prompt: "What problem or opportunity does this address?",
    placeholder: "Who is hurting today, and how?",
    required: true,
  },
  {
    key: "outcome",
    prompt: "What does the world look like if this lands well? (observable changes)",
    placeholder: "e.g. event names checked at compile time",
    required: true,
  },
  {
    key: "constraints",
    prompt: "Hard constraints to respect (security, perf, contracts, deadline)?",
    placeholder: "e.g. must not change wire format",
    required: false,
  },
  {
    key: "scope-in",
    prompt: "In-scope: list the work the plan should cover.",
    placeholder: "e.g. extract module, migrate two call sites, add types",
    required: true,
  },
  {
    key: "scope-out",
    prompt: "Out-of-scope: list the adjacent work the plan should NOT cover.",
    placeholder: "e.g. UI changes, breaking on-disk events",
    required: false,
  },
  {
    key: "open-questions",
    prompt: "Open questions the planner should resolve (one per line)?",
    placeholder: "Anything blocking unit breakdown",
    required: false,
  },
  {
    key: "entry-slice",
    prompt: "Suggested smallest valuable vertical slice to start with?",
    placeholder: "(skip if you want the planner to choose)",
    required: false,
  },
]

function renderBrief(answers: Map<string, string>): string {
  const lines: string[] = []
  lines.push(`# Plan brief: ${answers.get("topic") ?? "(untitled)"}`)
  lines.push("")
  lines.push("## Problem statement")
  lines.push("")
  lines.push(answers.get("problem")?.trim() || "_(not provided)_")
  lines.push("")
  lines.push("## Desired outcome")
  lines.push("")
  lines.push(answers.get("outcome")?.trim() || "_(not provided)_")
  lines.push("")
  lines.push("## Scope")
  lines.push("")
  lines.push("**In-scope:**")
  for (const item of (answers.get("scope-in") ?? "").split("\n").map(s => s.trim()).filter(Boolean)) {
    lines.push(`- ${item}`)
  }
  if (!answers.get("scope-in")) lines.push("- _(not provided)_")
  lines.push("")
  if (answers.get("scope-out")?.trim()) {
    lines.push("**Out-of-scope:**")
    for (const item of (answers.get("scope-out") ?? "").split("\n").map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${item}`)
    }
    lines.push("")
  }
  if (answers.get("constraints")?.trim()) {
    lines.push("## Constraints")
    lines.push("")
    lines.push(answers.get("constraints")!.trim())
    lines.push("")
  }
  if (answers.get("open-questions")?.trim()) {
    lines.push("## Open questions")
    lines.push("")
    for (const q of answers.get("open-questions")!.split("\n").map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${q}`)
    }
    lines.push("")
  }
  if (answers.get("entry-slice")?.trim()) {
    lines.push("## Suggested entry slice")
    lines.push("")
    lines.push(answers.get("entry-slice")!.trim())
    lines.push("")
  }
  lines.push("---")
  lines.push("")
  lines.push("Hand this brief to `/skill:se-plan` for the full Implementation Units breakdown.")
  return lines.join("\n")
}

export function registerSePlanCommand(pi: ExtensionAPI): void {
  pi.registerCommand("se-plan", {
    description:
      "Walk through a guided planning brief interview. Answers persist to the session log so the draft survives /compact and /fork. Hand the resulting brief to /skill:se-plan for the deep Implementation Units breakdown.",
    argumentHint: "[--resume]",
    handler: async (args, ctx) => {
      const resume = (args ?? "").trim() === "--resume"
      if (!ctx.hasUI) {
        ctx.ui?.notify?.(
          "/se-plan requires the interactive UI. Use /skill:se-plan directly in print/JSON modes.",
          "warning",
        )
        return
      }

      // Restore prior answers when --resume was passed; otherwise start fresh.
      const prior = resume
        ? new Map(readAllSE<PlanDraftStep>(ctx, SE_ENTRY_TYPES.PLAN_DRAFT)
            .filter(e => e.step !== "final-brief")
            .map(e => [e.step, e.answer]))
        : new Map<string, string>()

      if (resume && prior.size > 0) {
        ctx.ui.notify(`Resuming /se-plan draft (${prior.size} prior answer(s)).`, "info")
      }

      const answers = new Map<string, string>(prior)
      for (const step of STEPS) {
        if (answers.has(step.key)) continue
        const existing = answers.get(step.key) ?? ""
        const value = await ctx.ui.input(step.prompt, existing || step.placeholder, {
          timeout: 10 * 60 * 1000,
        })
        if (value === undefined) {
          ctx.ui.notify("/se-plan cancelled. Run /se-plan --resume to continue.", "warning")
          return
        }
        if (step.required && !value.trim()) {
          ctx.ui.notify(`/se-plan: ${step.key} is required. Run /se-plan --resume to retry.`, "warning")
          return
        }
        answers.set(step.key, value)
        appendSE<PlanDraftStep>(pi, SE_ENTRY_TYPES.PLAN_DRAFT, {
          step: step.key,
          answer: value,
          recordedAt: new Date().toISOString(),
        })
      }

      const brief = renderBrief(answers)
      appendSE<PlanDraftFinal>(pi, SE_ENTRY_TYPES.PLAN_DRAFT, {
        step: "final-brief",
        brief,
        recordedAt: new Date().toISOString(),
      })

      const send = await ctx.ui.confirm(
        "Brief ready",
        "Send the brief to /skill:se-plan for the deep Implementation Units breakdown?",
      )
      if (send) {
        const prompt = [
          "Run /skill:se-plan on the following brief produced by /se-plan:",
          "",
          brief,
        ].join("\n")
        try {
          await ctx.waitForIdle?.()
          pi.sendUserMessage(prompt, { deliverAs: "nextTurn" })
          ctx.ui.notify("/se-plan brief dispatched to /skill:se-plan.", "info")
        } catch {
          ctx.ui.notify(
            "/se-plan: failed to dispatch to /skill:se-plan. The brief is persisted in the session log.",
            "warning",
          )
        }
      } else {
        ctx.ui.notify("/se-plan brief saved in the session log. Run /skill:se-plan when ready.", "info")
      }
    },
  })
}
