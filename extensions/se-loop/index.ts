import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent"
import { createStateFromPlan, currentUnitForState, handleAgentEnd, markStopRequested, reconcileStateWithPlan, runLoop } from "./controller.ts"
import { parsePlanMarkdown } from "./plan-parser.ts"
import { runRuntimeProbe } from "./runtime-probe.ts"
import { loadLoopState, resolveLoopState } from "./state-store.ts"
import { discoverVerifyCommand, parseLoopArgs } from "./verify-command-discovery.ts"

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info") {
  ctx.ui.notify(message, level)
}

function loopIdArg(args: string): string | undefined {
  return args.trim() || undefined
}

function formatStatus(cwd: string, id?: string): string {
  const state = id ? loadLoopState(cwd, id) : resolveLoopState(cwd, undefined)
  if (!state) return "No SE work loop state found."

  const completed = state.units.filter(unit => unit.status === "completed").length
  return [
    `SE work loop: ${state.id}`,
    `Status: ${state.status}`,
    `Plan: ${state.planPath}`,
    `Current unit: ${currentUnitForState(state)}`,
    `Progress: ${completed}/${state.units.length}`,
    `Verify command: ${state.verifyCommand}`,
    state.events.at(-1) ? `Latest: ${state.events.at(-1)?.message}` : null,
  ].filter(Boolean).join("\n")
}

async function startLoop(args: string, ctx: ExtensionCommandContext) {
  const parsedArgs = parseLoopArgs(args)
  if (parsedArgs.error || !parsedArgs.planPath) {
    notify(ctx, parsedArgs.error ?? "Missing plan path", "error")
    return
  }

  const planPath = resolve(ctx.cwd, parsedArgs.planPath)
  let plan
  try {
    plan = parsePlanMarkdown(readFileSync(planPath, "utf8"))
  } catch (error) {
    notify(ctx, error instanceof Error ? error.message : String(error), "error")
    return
  }

  const verifyDiscovery = parsedArgs.verifyCommand
    ? { command: parsedArgs.verifyCommand, source: "--verify-command", confidence: "high" as const }
    : discoverVerifyCommand(ctx.cwd)

  if (!verifyDiscovery.command) {
    notify(
      ctx,
      "Could not discover a target-project verify command. Re-run with `--verify-command \"<command>\"` so the loop has a concrete completion gate before it creates state.",
      "warning",
    )
    return
  }

  const probe = await runRuntimeProbe(ctx)
  if (!probe.ok) {
    notify(ctx, probe.message, "error")
    return
  }

  const controllerSessionFile = ctx.sessionManager.getSessionFile?.() ?? null
  let state = createStateFromPlan({
    cwd: ctx.cwd,
    planPath,
    verifyCommand: verifyDiscovery.command,
    controllerSessionFile,
  })
  state = reconcileStateWithPlan(state, plan.units)

  notify(ctx, `Starting SE work loop ${state.id} with verify command from ${verifyDiscovery.source}: ${verifyDiscovery.command}`, "info")
  await runLoop(ctx, state)
}

async function resumeLoop(args: string, ctx: ExtensionCommandContext) {
  const id = loopIdArg(args)
  const state = resolveLoopState(ctx.cwd, id)
  if (!state) {
    notify(ctx, id ? `SE work loop not found: ${id}` : "No resumable SE work loop found", "warning")
    return
  }

  const parsed = parsePlanMarkdown(readFileSync(state.planPath, "utf8"))
  const reconciled = reconcileStateWithPlan({ ...state, status: "active", stopRequested: false }, parsed.units)
  if (reconciled.status === "blocked") {
    notify(ctx, `Cannot resume ${state.id}: ${reconciled.events.at(-1)?.message}`, "warning")
    return
  }

  notify(ctx, `Resuming SE work loop ${state.id}`, "info")
  await runLoop(ctx, reconciled)
}

export default function seLoopExtension(pi: ExtensionAPI) {
  pi.on("agent_end", async event => {
    handleAgentEnd(event)
  })

  pi.registerCommand("se-work-loop", {
    description: "Run an SE plan through fresh-context implementation-unit iterations",
    handler: async (args, ctx) => startLoop(args ?? "", ctx),
  })

  pi.registerCommand("se-work-loop-status", {
    description: "Show SE work-loop status",
    handler: async (args, ctx) => {
      try {
        notify(ctx, formatStatus(ctx.cwd, loopIdArg(args ?? "")), "info")
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), "error")
      }
    },
  })

  pi.registerCommand("se-work-loop-stop", {
    description: "Gracefully stop an active SE work loop after the current iteration",
    handler: async (args, ctx) => {
      const state = markStopRequested(ctx.cwd, loopIdArg(args ?? ""))
      notify(ctx, state ? `Stop requested for SE work loop ${state.id}` : "No SE work loop found to stop", state ? "info" : "warning")
    },
  })

  pi.registerCommand("se-work-loop-resume", {
    description: "Resume a paused or blocked SE work loop",
    handler: async (args, ctx) => resumeLoop(args ?? "", ctx),
  })

  pi.registerCommand("se-work-loop-probe", {
    description: "Check whether this Pi runtime exposes child-session APIs needed by se-work-loop",
    handler: async (_args, ctx) => {
      const result = await runRuntimeProbe(ctx)
      notify(ctx, result.message, result.ok ? "info" : "error")
    },
  })
}
