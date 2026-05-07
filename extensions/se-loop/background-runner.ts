import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { resolve } from "node:path"
import { buildUnitPrompt, runtimeState, statePathFor } from "./controller.ts"
import { completedUnitIds, appendLoopEvent, loadLoopState, loopLocation, saveLoopState, updateUnitStatus, type WorkLoopState } from "./state-store.ts"
import { nextRunnableUnit, parsePlanMarkdown } from "./plan-parser.ts"
import { runVerifyCommand, verifyUnitFiles } from "./verification.ts"
import { readFileSync } from "node:fs"

interface ChildRunResult {
  exitCode: number | null
  stderr: string
  finalOutput: string
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

export function piSpawnSpec(args: string[]): { command: string; args: string[] } {
  const override = process.env.SE_WORK_LOOP_PI_COMMAND?.trim()
  if (override) {
    return {
      command: "bash",
      args: ["-lc", `${override} ${args.map(shellQuote).join(" ")}`],
    }
  }

  return {
    command: "nix",
    args: ["shell", "nixpkgs#bun", "nixpkgs#nodejs", "--command", "bun", "x", "@mariozechner/pi-coding-agent", ...args],
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function runBackgroundChild(input: { cwd: string; prompt: string; logPath: string }): Promise<ChildRunResult> {
  return new Promise(resolveResult => {
    const log = createWriteStream(input.logPath, { flags: "w" })
    const spec = piSpawnSpec(["--mode", "json", "-p", input.prompt])
    const child = spawn(spec.command, spec.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })

    let stdoutBuffer = ""
    let stderr = ""
    let finalOutput = ""
    let settled = false
    let finalDrainTimer: NodeJS.Timeout | undefined

    const settle = (exitCode: number | null) => {
      if (settled) return
      settled = true
      if (finalDrainTimer) clearTimeout(finalDrainTimer)
      log.end()
      resolveResult({ exitCode, stderr, finalOutput })
    }

    const startFinalDrain = () => {
      if (finalDrainTimer || settled) return
      finalDrainTimer = setTimeout(() => {
        if (!settled) child.kill("SIGTERM")
      }, 1500)
      finalDrainTimer.unref?.()
    }

    const processStdoutLine = (line: string) => {
      if (!line.trim()) return
      log.write(`${line}\n`)
      let event: { type?: string; message?: { role?: string; content?: unknown; errorMessage?: string; stopReason?: string } }
      try {
        event = JSON.parse(line)
      } catch {
        finalOutput = line.trim() || finalOutput
        return
      }

      if (event.type !== "message_end" || !event.message) return
      const text = extractTextContent(event.message.content)
      if (text) finalOutput = text
      if (event.message.role === "assistant" && event.message.stopReason === "stop" && !event.message.errorMessage) {
        startFinalDrain()
      }
    }

    child.stdout.on("data", chunk => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() ?? ""
      for (const line of lines) processStdoutLine(line)
    })

    child.stderr.on("data", chunk => {
      const text = chunk.toString()
      stderr += text
      log.write(text)
    })

    child.on("error", error => {
      stderr += error instanceof Error ? error.message : String(error)
      settle(1)
    })

    child.on("close", exitCode => {
      if (stdoutBuffer.trim()) processStdoutLine(stdoutBuffer)
      settle(exitCode)
    })
  })
}

function latestState(state: WorkLoopState): WorkLoopState {
  try {
    return loadLoopState(state.cwd, state.id)
  } catch {
    return state
  }
}

export async function runLoopInBackground(initialState: WorkLoopState): Promise<WorkLoopState> {
  const globalState = runtimeState()
  if (globalState.runningLoopId && globalState.runningLoopId !== initialState.id) {
    return appendLoopEvent({ ...initialState, status: "blocked" }, {
      type: "background_start_rejected",
      message: `Another SE work loop is already running: ${globalState.runningLoopId}`,
    })
  }

  globalState.runningLoopId = initialState.id
  globalState.stopRequested = false

  let state = saveLoopState({ ...initialState, status: "active", stopRequested: false })
  const parsed = parsePlanMarkdown(readFileSync(state.planPath, "utf8"))

  try {
    while (state.status === "active") {
      state = latestState(state)
      if (globalState.stopRequested || state.stopRequested) {
        state = appendLoopEvent({ ...state, status: "paused", stopRequested: false }, { type: "paused", message: "Stop requested; paused before next background iteration." })
        break
      }

      const unit = nextRunnableUnit(parsed.units, completedUnitIds(state))
      if (!unit) {
        const completionResult = await runVerifyCommand(state.cwd, state.verifyCommand)
        if (!completionResult.ok) {
          state = appendLoopEvent({ ...state, status: "blocked", currentUnitId: null }, { type: "completion_gate_failed", message: completionResult.summary })
          break
        }
        state = appendLoopEvent({ ...state, status: "complete", currentUnitId: null }, { type: "complete", message: completionResult.summary })
        break
      }

      state = updateUnitStatus({ ...state, currentUnitId: unit.id, iterationCount: state.iterationCount + 1 }, unit.id, "in_progress")
      state = appendLoopEvent(state, { type: "background_iteration_started", unitId: unit.id, message: `Starting ${unit.id}. ${unit.title}` })

      const location = loopLocation(state.cwd, state.id)
      const prompt = buildUnitPrompt({
        planPath: resolve(state.cwd, state.planPath),
        statePath: statePathFor(state),
        unit,
        verifyCommand: state.verifyCommand,
      })
      const childResult = await runBackgroundChild({
        cwd: state.cwd,
        prompt,
        logPath: resolve(location.loopDir, `background-${unit.id}.log`),
      })

      if (childResult.exitCode !== 0 && !childResult.finalOutput) {
        const message = childResult.stderr.trim() || `Background child exited with code ${childResult.exitCode}`
        state = updateUnitStatus({ ...state, status: "blocked" }, unit.id, "blocked", { error: message })
        state = appendLoopEvent(state, { type: "background_child_failed", unitId: unit.id, message })
        break
      }

      const fileCheck = verifyUnitFiles(state.cwd, unit)
      if (!fileCheck.ok) {
        state = updateUnitStatus({ ...state, status: "blocked" }, unit.id, "blocked", { summary: childResult.finalOutput, error: fileCheck.summary })
        state = appendLoopEvent(state, { type: "file_check_failed", unitId: unit.id, message: fileCheck.summary })
        break
      }

      state = updateUnitStatus(state, unit.id, "completed", { summary: childResult.finalOutput })
      state = appendLoopEvent(state, { type: "unit_completed", unitId: unit.id, message: fileCheck.summary })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state = appendLoopEvent({ ...latestState(state), status: "blocked" }, { type: "background_error", message })
  } finally {
    if (globalState.runningLoopId === initialState.id) globalState.runningLoopId = null
    globalState.resolveIteration = null
  }

  return state
}
