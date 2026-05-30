/**
 * /se-review, /se-doc-review, /se-research command wrappers.
 *
 * Pi command surfaces that kick off subagent persona fan-outs through
 * the bundled pi-subagents extension. The commands are the deterministic
 * entry point (discoverable via autocomplete and the command list); the
 * actual dispatch and synthesis stays in the SKILL.md prose so the
 * skill's triage UI, finding-merge, and renderer wiring keep working.
 *
 * Implementation shape:
 * - Command handler validates the persona filter argument.
 * - Hands control to the matching skill via pi.sendUserMessage with
 *   a structured prompt that names the persona set explicitly.
 * - The LLM picks up next turn and runs the skill's existing
 *   subagent.tasks fan-out with the named personas.
 *
 * This keeps SKILL.md prose authoritative (no parallel implementation
 * of the synthesis flow) while exposing a one-stroke entry point.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

import {
  DEFAULT_CODE_REVIEW_PERSONAS,
  DEFAULT_DOC_REVIEW_PERSONAS,
  DEFAULT_RESEARCH_AGENTS,
} from "./personas.ts"

function parsePersonaFilter(args: string | undefined, defaults: readonly string[]): readonly string[] {
  if (!args) return defaults
  const trimmed = args.trim()
  if (!trimmed) return defaults
  return trimmed
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
}

export function registerSeSubagentCommands(pi: ExtensionAPI): void {
  pi.registerCommand("se-review", {
    description:
      "Run se-code-review Tier 2 with the default reviewer persona set against the current diff or PR. Pass a comma-separated persona filter to narrow.",
    argumentHint: "[persona1,persona2,...]",
    handler: async (args, ctx) => {
      const personas = parsePersonaFilter(args, DEFAULT_CODE_REVIEW_PERSONAS)
      const prompt = [
        "Run /skill:se-code-review at Tier 2 with the following persona set:",
        personas.map(p => `  - ${p}`).join("\n"),
        "",
        "Use the pi-subagents subagent tool with parallel tasks (one per persona). Each persona reviews the current diff or staged PR scope independently and returns structured JSON findings. After all personas complete, run the skill's synthesis/dedup/triage flow to produce the final report.",
        args && args.trim()
          ? `(persona filter from /se-review argument: ${args.trim()})`
          : "(default persona set; pass a comma-separated filter to /se-review to narrow)",
      ].join("\n")
      try {
        await ctx.waitForIdle?.()
        pi.sendUserMessage(prompt, { deliverAs: "nextTurn" })
        ctx.ui?.notify?.(`/se-review dispatched: ${personas.length} persona(s)`, "info")
      } catch {
        ctx.ui?.notify?.(
          "/se-review: pi-subagents not available — fall back to invoking /skill:se-code-review directly.",
          "warning",
        )
      }
    },
  })

  pi.registerCommand("se-doc-review", {
    description:
      "Run se-doc-review with the default document-reviewer persona set against the current document. Pass a persona filter to narrow.",
    argumentHint: "[persona1,persona2,...]",
    handler: async (args, ctx) => {
      const personas = parsePersonaFilter(args, DEFAULT_DOC_REVIEW_PERSONAS)
      const prompt = [
        "Run /skill:se-doc-review with the following persona set:",
        personas.map(p => `  - ${p}`).join("\n"),
        "",
        "Use the pi-subagents subagent tool with parallel tasks (one per persona). Each persona reviews the current document independently and returns structured JSON findings. After all personas complete, run the skill's synthesis/dedup/triage flow to produce the final report.",
        args && args.trim()
          ? `(persona filter from /se-doc-review argument: ${args.trim()})`
          : "(default persona set; pass a comma-separated filter to /se-doc-review to narrow)",
      ].join("\n")
      try {
        await ctx.waitForIdle?.()
        pi.sendUserMessage(prompt, { deliverAs: "nextTurn" })
        ctx.ui?.notify?.(`/se-doc-review dispatched: ${personas.length} persona(s)`, "info")
      } catch {
        ctx.ui?.notify?.(
          "/se-doc-review: pi-subagents not available — fall back to invoking /skill:se-doc-review directly.",
          "warning",
        )
      }
    },
  })

  pi.registerCommand("se-research", {
    description:
      "Fan out research agents (best-practices, framework docs, web, repo) on a single topic. Returns a research digest synthesized in the best-practices-researcher format.",
    argumentHint: "<topic>",
    handler: async (args, ctx) => {
      const topic = (args ?? "").trim()
      if (!topic) {
        ctx.ui?.notify?.(
          "/se-research: provide a topic. Usage: /se-research <topic>",
          "warning",
        )
        return
      }
      const agents = DEFAULT_RESEARCH_AGENTS
      const prompt = [
        `Run a parallel research fan-out on topic: ${topic}`,
        "",
        "Agents:",
        agents.map(a => `  - ${a}`).join("\n"),
        "",
        "Use the pi-subagents subagent tool with parallel tasks (one per agent). Each agent researches the topic from its angle and returns structured notes. After all agents complete, synthesize the results using the se-best-practices-researcher digest format.",
      ].join("\n")
      try {
        await ctx.waitForIdle?.()
        pi.sendUserMessage(prompt, { deliverAs: "nextTurn" })
        ctx.ui?.notify?.(`/se-research dispatched: ${agents.length} agent(s)`, "info")
      } catch {
        ctx.ui?.notify?.(
          "/se-research: pi-subagents not available — fall back to invoking the research agents manually.",
          "warning",
        )
      }
    },
  })
}
