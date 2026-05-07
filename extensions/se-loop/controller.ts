import { readFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import type { AgentEndEvent, ExtensionCommandContext } from "@mariozechner/pi-coding-agent"
import { nextRunnableUnit, parsePlanMarkdown, type LoopUnit } from "./plan-parser.ts"
import { appendLoopEvent, completedUnitIds, createInitialState, loadLoopState, resolveLoopState, saveLoopState, updateUnitStatus, type WorkLoopState } from "./state-store.ts"
import { verifyUnit } from "./verification.ts"

interface IterationResult {
  lastMessage: string
  messages: AgentEndEvent["messages"]
}

interface RuntimeState {
  resolveIteration: ((result: IterationResult) => void) | null
  runningLoopId: string | null
  stopRequested: boolean
}

const STATE_KEY = Symbol.for("@simonwjackson/pi-software-engineering.se-loop")

export function runtimeState(): RuntimeState {
  const global = globalThis as Record<symbol, RuntimeState | undefined>
  global[STATE_KEY] ??= { resolveIteration: null, runningLoopId: null, stopRequested: false }
  return global[STATE_KEY]
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .filter((part): part is { type: "text"; text: string } => {
      return !!part && typeof part === "object" && "type" in part && "text" in part && part.type === "text" && typeof part.text === "string"
    })
    .map(part => part.text)
    .join("\n")
    .trim()
}

export function handleAgentEnd(event: AgentEndEvent) {
  const state = runtimeState()
  if (!state.resolveIteration) return

  const lastAssistant = [...event.messages]
    .reverse()
    .find(message => message.role === "assistant")
  const lastMessage = extractTextContent(lastAssistant?.content)
  const resolve = state.resolveIteration
  state.resolveIteration = null
  resolve({ lastMessage, messages: event.messages })
}

export function buildUnitPrompt(input: { planPath: string; statePath: string; unit: LoopUnit; verifyCommand: string }): string {
  const unit = input.unit
  const fileList = [
    ...unit.files.create.map(path => `Create: ${path}`),
    ...unit.files.modify.map(path => `Modify: ${path}`),
    ...unit.files.test.map(path => `Test: ${path}`),
    ...unit.files.other,
  ]

  return `You are running one fresh-context SE work-loop iteration.

Use the se-work discipline, but focus ONLY on this implementation unit. Do not implement other units unless strictly required by this unit's dependencies.

Plan: ${input.planPath}
Loop state: ${input.statePath}
Current unit: ${unit.id}. ${unit.title}

Goal:
${unit.goal || "(not specified)"}

Dependencies:
${unit.dependencies.length ? unit.dependencies.join(", ") : "None"}

Files:
${fileList.length ? fileList.map(path => `- ${path}`).join("\n") : "- (none listed)"}

Approach:
${unit.approach || "(not specified)"}

Execution note:
${unit.executionNote || "(none)"}

Patterns to follow:
${unit.patternsToFollow.length ? unit.patternsToFollow.map(pattern => `- ${pattern}`).join("\n") : "- (none listed)"}

Test scenarios:
${unit.testScenarios.length ? unit.testScenarios.map(scenario => `- ${scenario}`).join("\n") : "- (none listed)"}

Verification for this unit:
${unit.verification.length ? unit.verification.map(item => `- ${item}`).join("\n") : "- Use the loop-level verify command."}

Loop-level verify command, run by the controller after your turn:
${input.verifyCommand}

When this unit is complete, end with a concise summary containing:
- files changed
- tests or checks run
- whether ${unit.id} is complete
- any blockers
`
}

function statePathFor(state: WorkLoopState): string {
  return resolve(state.cwd, ".context", "software-engineering", "se-work-loop", state.id, "state.json")
}

function findUnit(units: LoopUnit[], unitId: string | null | undefined): LoopUnit | null {
  if (!unitId) return null
  return units.find(unit => unit.id === unitId) ?? null
}

function nextUnitFromState(state: WorkLoopState, units: LoopUnit[]): LoopUnit | null {
  const completed = completedUnitIds(state)
  return nextRunnableUnit(units, completed)
}

export async function runLoop(ctx: ExtensionCommandContext, initialState: WorkLoopState): Promise<WorkLoopState> {
  const globalState = runtimeState()
  if (globalState.runningLoopId && globalState.runningLoopId !== initialState.id) {
    ctx.ui.notify(`Another SE work loop is already running: ${globalState.runningLoopId}`, "warning")
    return initialState
  }

  globalState.runningLoopId = initialState.id
  globalState.stopRequested = false

  let state = saveLoopState({ ...initialState, status: "active", stopRequested: false })
  const planMarkdown = readFileSync(state.planPath, "utf8")
  const parsed = parsePlanMarkdown(planMarkdown)

  try {
    while (state.status === "active") {
      if (globalState.stopRequested || state.stopRequested) {
        state = appendLoopEvent({ ...state, status: "paused", stopRequested: false }, { type: "paused", message: "Stop requested; paused before next iteration." })
        ctx.ui.notify(`SE work loop paused: ${state.id}`, "info")
        break
      }

      const unit = nextUnitFromState(state, parsed.units)
      if (!unit) {
        state = appendLoopEvent({ ...state, status: "complete", currentUnitId: null }, { type: "complete", message: "All dependency-ready units completed." })
        ctx.ui.notify(`SE work loop complete: ${state.id}`, "info")
        break
      }

      state = updateUnitStatus({ ...state, currentUnitId: unit.id, iterationCount: state.iterationCount + 1 }, unit.id, "in_progress")
      state = appendLoopEvent(state, { type: "iteration_started", unitId: unit.id, message: `Starting ${unit.id}. ${unit.title}` })
      ctx.ui.setStatus?.("se-work-loop", `SE loop ${state.id}: ${unit.id}`)

      const iterationResult = new Promise<IterationResult>(resolve => {
        globalState.resolveIteration = resolve
      })

      const parentSession = state.controllerSessionFile ?? ctx.sessionManager.getSessionFile?.()
      const child = await ctx.newSession({
        ...(parentSession ? { parentSession } : {}),
        withSession: async replacementCtx => {
          const prompt = buildUnitPrompt({
            planPath: relative(replacementCtx.cwd, state.planPath),
            statePath: statePathFor(state),
            unit,
            verifyCommand: state.verifyCommand,
          })
          void replacementCtx.sendUserMessage(prompt)
        },
      })

      if (child.cancelled) {
        globalState.resolveIteration = null
        state = appendLoopEvent({ ...state, status: "paused" }, { type: "cancelled", unitId: unit.id, message: "Child session creation was cancelled." })
        ctx.ui.notify("SE work loop paused: child session creation was cancelled", "warning")
        break
      }

      const result = await iterationResult
      const verified = await verifyUnit(state.cwd, unit, state.verifyCommand)
      if (!verified.ok) {
        state = updateUnitStatus({ ...state, status: "blocked" }, unit.id, "blocked", { summary: result.lastMessage, error: verified.summary })
        state = appendLoopEvent(state, { type: "verification_failed", unitId: unit.id, message: verified.summary })
        ctx.ui.notify(`SE work loop blocked on ${unit.id}: ${verified.summary}`, "warning")
        break
      }

      state = updateUnitStatus(state, unit.id, "completed", { summary: result.lastMessage })
      state = appendLoopEvent(state, { type: "unit_completed", unitId: unit.id, message: verified.summary })
      ctx.ui.notify(`SE work loop completed ${unit.id}`, "info")
    }
  } finally {
    if (globalState.runningLoopId === initialState.id) globalState.runningLoopId = null
    globalState.resolveIteration = null
    ctx.ui.setStatus?.("se-work-loop", "")
  }

  return state
}

export function reconcileStateWithPlan(state: WorkLoopState, units: LoopUnit[]): WorkLoopState {
  const planUnitIds = new Set(units.map(unit => unit.id))
  const missing = state.units.filter(unit => !planUnitIds.has(unit.id))
  if (missing.length === 0) return state

  return appendLoopEvent({ ...state, status: "blocked" }, {
    type: "plan_mismatch",
    message: `Plan no longer contains saved unit(s): ${missing.map(unit => unit.id).join(", ")}`,
  })
}

export function markStopRequested(cwd: string, id?: string): WorkLoopState | null {
  const state = resolveLoopState(cwd, id)
  if (!state) return null
  runtimeState().stopRequested = true
  return saveLoopState({ ...state, stopRequested: true, status: state.status === "active" ? "active" : "paused" })
}

export function createStateFromPlan(input: {
  cwd: string
  planPath: string
  verifyCommand: string
  controllerSessionFile?: string | null
}): WorkLoopState {
  const resolvedPlanPath = resolve(input.cwd, input.planPath)
  const parsed = parsePlanMarkdown(readFileSync(resolvedPlanPath, "utf8"))
  return createInitialState({
    cwd: input.cwd,
    planPath: resolvedPlanPath,
    planTitle: parsed.title,
    verifyCommand: input.verifyCommand,
    units: parsed.units.map(unit => ({ id: unit.id, title: unit.title })),
    controllerSessionFile: input.controllerSessionFile,
  })
}

export function currentUnitForState(state: WorkLoopState): string {
  return state.currentUnitId ?? state.units.find(unit => unit.status !== "completed")?.id ?? "none"
}
