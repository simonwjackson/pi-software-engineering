import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export type LoopStatus = "active" | "paused" | "blocked" | "complete" | "cancelled"
export type UnitStatus = "pending" | "in_progress" | "completed" | "blocked"

export interface StoredUnitState {
  id: string
  title: string
  status: UnitStatus
  attempts: number
  lastSummary?: string
  lastError?: string
  updatedAt?: string
}

export interface LoopEvent {
  at: string
  type: string
  message: string
  unitId?: string
}

export interface WorkLoopState {
  id: string
  status: LoopStatus
  cwd: string
  planPath: string
  planTitle: string
  verifyCommand: string
  controllerSessionFile?: string | null
  activeIterationSessionFile?: string | null
  currentUnitId?: string | null
  stopRequested: boolean
  iterationCount: number
  units: StoredUnitState[]
  events: LoopEvent[]
  createdAt: string
  updatedAt: string
}

export interface StateLocation {
  rootDir: string
  loopDir: string
  statePath: string
  eventsPath: string
}

export function loopRoot(cwd: string): string {
  return join(cwd, ".context", "software-engineering", "se-work-loop")
}

export function loopLocation(cwd: string, id: string): StateLocation {
  const rootDir = loopRoot(cwd)
  const loopDir = join(rootDir, id)
  return {
    rootDir,
    loopDir,
    statePath: join(loopDir, "state.json"),
    eventsPath: join(loopDir, "events.jsonl"),
  }
}

export function createLoopId(planTitle: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  const slug = planTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || "se-work-loop"

  return `${stamp}-${slug}`
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function writeJsonVerified(path: string, value: unknown) {
  ensureDir(dirname(path))
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  const body = `${JSON.stringify(value, null, 2)}\n`
  writeFileSync(tmpPath, body, "utf8")
  const readBack = readFileSync(tmpPath, "utf8")
  if (readBack !== body) throw new Error(`Failed to verify write for ${path}`)
  renameSync(tmpPath, path)
}

export function saveLoopState(state: WorkLoopState): WorkLoopState {
  const updated = { ...state, updatedAt: new Date().toISOString() }
  const location = loopLocation(updated.cwd, updated.id)
  writeJsonVerified(location.statePath, updated)
  return updated
}

export function appendLoopEvent(state: WorkLoopState, event: Omit<LoopEvent, "at">): WorkLoopState {
  const nextEvent = { at: new Date().toISOString(), ...event }
  const location = loopLocation(state.cwd, state.id)
  ensureDir(location.loopDir)
  writeFileSync(location.eventsPath, `${JSON.stringify(nextEvent)}\n`, { encoding: "utf8", flag: "a" })
  return saveLoopState({ ...state, events: [...state.events.slice(-49), nextEvent] })
}

export function loadLoopState(cwd: string, id: string): WorkLoopState {
  const location = loopLocation(cwd, id)
  if (!existsSync(location.statePath)) throw new Error(`Loop state not found: ${id}`)
  return JSON.parse(readFileSync(location.statePath, "utf8")) as WorkLoopState
}

export function listLoopStates(cwd: string): WorkLoopState[] {
  const root = loopRoot(cwd)
  if (!existsSync(root)) return []

  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      try {
        return loadLoopState(cwd, entry.name)
      } catch {
        return null
      }
    })
    .filter((state): state is WorkLoopState => state !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function resolveLoopState(cwd: string, id?: string): WorkLoopState | null {
  if (id) return loadLoopState(cwd, id)
  return listLoopStates(cwd).find(state => ["active", "paused", "blocked"].includes(state.status)) ?? null
}

export function createInitialState(input: {
  cwd: string
  planPath: string
  planTitle: string
  verifyCommand: string
  units: Array<{ id: string; title: string }>
  controllerSessionFile?: string | null
}): WorkLoopState {
  const now = new Date().toISOString()
  const state: WorkLoopState = {
    id: createLoopId(input.planTitle),
    status: "paused",
    cwd: resolve(input.cwd),
    planPath: resolve(input.cwd, input.planPath),
    planTitle: input.planTitle,
    verifyCommand: input.verifyCommand,
    controllerSessionFile: input.controllerSessionFile ?? null,
    activeIterationSessionFile: null,
    currentUnitId: null,
    stopRequested: false,
    iterationCount: 0,
    units: input.units.map(unit => ({ id: unit.id, title: unit.title, status: "pending", attempts: 0 })),
    events: [],
    createdAt: now,
    updatedAt: now,
  }

  return saveLoopState(state)
}

export function updateUnitStatus(
  state: WorkLoopState,
  unitId: string,
  status: UnitStatus,
  details: { summary?: string; error?: string } = {},
): WorkLoopState {
  return saveLoopState({
    ...state,
    currentUnitId: status === "in_progress" ? unitId : state.currentUnitId,
    units: state.units.map(unit => unit.id === unitId
      ? {
          ...unit,
          status,
          attempts: status === "in_progress" ? unit.attempts + 1 : unit.attempts,
          lastSummary: details.summary ?? unit.lastSummary,
          lastError: details.error,
          updatedAt: new Date().toISOString(),
        }
      : unit),
  })
}

export function completedUnitIds(state: WorkLoopState): Set<string> {
  return new Set(state.units.filter(unit => unit.status === "completed").map(unit => unit.id))
}
