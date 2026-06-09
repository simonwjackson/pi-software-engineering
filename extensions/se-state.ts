/**
 * SE session-log state substrate.
 *
 * Typed helpers around pi.appendEntry / ctx.sessionManager.getEntries for
 * the catalogue of SE entry types. This module is NOT loaded as an
 * extension (it has no default export); it's a shared utility imported by
 * extensions/software-engineering.ts and extensions/se-review.ts.
 *
 * Design: append-only session log plus `work/items/parking-lot/` disk sync for parked work.
 *
 * - Session log is the source of truth for SE runtime state. No
 *   .context/software-engineering/ scratch files.
 * - All entries are append-only. The "current value" is derived by reading
 *   newest-to-oldest and stopping at the first matching record.
 * - Backlog items live in the log; the on-disk `work/items/parking-lot/` directory
 *   is the cross-session parking-lot view for ungraduated work.
 *
 * Reference: docs/SE-STATE.md
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"
import { mintId } from "./work-items.ts"

// ---------------------------------------------------------------------------
// Entry-type catalogue
// ---------------------------------------------------------------------------

export const SE_ENTRY_TYPES = {
  PHASE: "se:phase",
  WORKTREE: "se:worktree",
  TEST_STATE: "se:test-state",
  REVIEW_FINDING: "se:review-finding", // shared with extensions/se-review.ts
  REVIEW_RESIDUAL_RESOLVED: "se:review-residual-resolved",
  REPRO: "se:repro",
  BACKLOG: "se:backlog",
  BACKLOG_PROMOTED: "se:backlog:promoted",
  BACKLOG_REMOVED: "se:backlog:removed",
} as const

export type SEEntryType = (typeof SE_ENTRY_TYPES)[keyof typeof SE_ENTRY_TYPES]

// ---------------------------------------------------------------------------
// Generic readers
// ---------------------------------------------------------------------------

interface RawSessionEntry {
  type?: string
  customType?: string
  data?: unknown
  details?: unknown
}

/**
 * Read all entries of the given customType, oldest first.
 */
export function readAllSE<T>(ctx: ExtensionContext, customType: SEEntryType): T[] {
  try {
    const raw = ctx.sessionManager.getEntries?.() ?? []
    const matches: T[] = []
    for (const r of raw) {
      const entry = r as RawSessionEntry
      if (entry?.customType !== customType) continue
      // pi.appendEntry writes data; sendMessage writes details. Prefer data.
      const payload = (entry.data ?? entry.details) as T | undefined
      if (payload === undefined || payload === null) continue
      matches.push(payload)
    }
    return matches
  } catch {
    return []
  }
}

/**
 * Read the most recent entry of the given customType, or undefined.
 */
export function readLatestSE<T>(ctx: ExtensionContext, customType: SEEntryType): T | undefined {
  const all = readAllSE<T>(ctx, customType)
  return all.length === 0 ? undefined : all[all.length - 1]
}

/**
 * Generic append.
 */
export function appendSE<T>(pi: ExtensionAPI, customType: SEEntryType, data: T): void {
  try {
    pi.appendEntry(customType, data)
  } catch {
    // appendEntry must never block the caller.
  }
}

// ---------------------------------------------------------------------------
// Typed wrappers: phase
// ---------------------------------------------------------------------------

export type Phase = "phase-0" | "phase-1" | "phase-2" | "phase-3" | "phase-4" | "done"

export interface PhaseEntry {
  phase: Phase
  sliceId?: string
  recordedAt: string
}

export function setPhase(pi: ExtensionAPI, phase: Phase, sliceId?: string): void {
  const entry: PhaseEntry = { phase, recordedAt: new Date().toISOString() }
  if (sliceId) entry.sliceId = sliceId
  appendSE(pi, SE_ENTRY_TYPES.PHASE, entry)
}

export function getPhase(ctx: ExtensionContext): PhaseEntry | undefined {
  return readLatestSE<PhaseEntry>(ctx, SE_ENTRY_TYPES.PHASE)
}

// ---------------------------------------------------------------------------
// Typed wrappers: worktree
// ---------------------------------------------------------------------------

export interface WorktreeEntry {
  path: string
  branch: string
  recordedAt: string
}

export function setWorktree(pi: ExtensionAPI, path: string, branch: string): void {
  appendSE(pi, SE_ENTRY_TYPES.WORKTREE, { path, branch, recordedAt: new Date().toISOString() })
}

export function getWorktree(ctx: ExtensionContext): WorktreeEntry | undefined {
  return readLatestSE<WorktreeEntry>(ctx, SE_ENTRY_TYPES.WORKTREE)
}

// ---------------------------------------------------------------------------
// Typed wrappers: test-state
// ---------------------------------------------------------------------------

export type TestColor = "green" | "red" | "unknown"

export interface TestStateEntry {
  color: TestColor
  command: string
  exitCode: number
  durationMs?: number
  recordedAt: string
}

export function setTestState(
  pi: ExtensionAPI,
  command: string,
  exitCode: number,
  durationMs?: number,
): void {
  const color: TestColor = exitCode === 0 ? "green" : "red"
  appendSE(pi, SE_ENTRY_TYPES.TEST_STATE, {
    color,
    command,
    exitCode,
    durationMs,
    recordedAt: new Date().toISOString(),
  })
}

export function getLastTestState(ctx: ExtensionContext): TestStateEntry | undefined {
  return readLatestSE<TestStateEntry>(ctx, SE_ENTRY_TYPES.TEST_STATE)
}

// ---------------------------------------------------------------------------
// Typed wrappers: backlog
// ---------------------------------------------------------------------------

export type BacklogStatus = "to-do" | "in-progress" | "done"

export interface BacklogItemPayload {
  /** Stable time-sortable work id (ULID). */
  id: string
  title: string
  status: BacklogStatus
  priority?: "low" | "medium" | "high"
  labels?: string[]
  source?: string
  why?: string
  acceptance?: string[]
  related?: string[]
  notes?: string
  context?: {
    cwd?: string
    branch?: string
    commit?: string
    repo?: string
    piSession?: string
    invokedBy?: string
    issueRef?: string
  }
  createdAt: string
}

export interface BacklogPromotedEntry {
  id: string
  target: "se-work" | "se-plan" | "se-debug" | "other"
  note?: string
  recordedAt: string
}

export interface BacklogRemovedEntry {
  id: string
  reason: string
  recordedAt: string
}

/**
 * All known backlog items by id, latest write per id wins. Includes
 * promoted and removed items unless filtered.
 */
export function readBacklogAll(ctx: ExtensionContext): Map<string, BacklogItemPayload> {
  const all = readAllSE<BacklogItemPayload>(ctx, SE_ENTRY_TYPES.BACKLOG)
  const byId = new Map<string, BacklogItemPayload>()
  for (const item of all) {
    byId.set(item.id, item)
  }
  return byId
}

/**
 * Active backlog: items not removed. Promoted items remain visible with
 * status updated to "in-progress" via promotion entries.
 */
export function readBacklogActive(ctx: ExtensionContext): BacklogItemPayload[] {
  const byId = readBacklogAll(ctx)
  const removed = new Set(
    readAllSE<BacklogRemovedEntry>(ctx, SE_ENTRY_TYPES.BACKLOG_REMOVED).map(e => e.id),
  )
  const promoted = readAllSE<BacklogPromotedEntry>(ctx, SE_ENTRY_TYPES.BACKLOG_PROMOTED)
  const promotedById = new Map<string, BacklogPromotedEntry>()
  for (const p of promoted) promotedById.set(p.id, p)

  const out: BacklogItemPayload[] = []
  for (const [id, item] of byId.entries()) {
    if (removed.has(id)) continue
    const p = promotedById.get(id)
    if (p && item.status === "to-do") {
      out.push({ ...item, status: "in-progress" })
    } else {
      out.push(item)
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

/**
 * Mint a coordination-free time-sortable id for parked work.
 *
 * The historical `floor` parameter is intentionally ignored: work items use
 * ULIDs rather than repo-local counters, so concurrent worktrees never fight
 * over `.next-id` or a max-scan allocation.
 */
export function nextBacklogId(_ctx: ExtensionContext, _floor?: number): string {
  return mintId()
}

export function addBacklog(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  partial: Omit<BacklogItemPayload, "id" | "createdAt"> & { id?: string; createdAt?: string },
  floor?: number,
): BacklogItemPayload {
  const id = partial.id ?? nextBacklogId(ctx, floor)
  const createdAt = partial.createdAt ?? new Date().toISOString()
  const item: BacklogItemPayload = { ...partial, id, createdAt }
  appendSE(pi, SE_ENTRY_TYPES.BACKLOG, item)
  return item
}

export function promoteBacklog(
  pi: ExtensionAPI,
  id: string,
  target: BacklogPromotedEntry["target"],
  note?: string,
): void {
  appendSE(pi, SE_ENTRY_TYPES.BACKLOG_PROMOTED, {
    id,
    target,
    note,
    recordedAt: new Date().toISOString(),
  })
}

export function removeBacklog(pi: ExtensionAPI, id: string, reason: string): void {
  appendSE(pi, SE_ENTRY_TYPES.BACKLOG_REMOVED, {
    id,
    reason,
    recordedAt: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------------
// Typed wrappers: review residuals
// ---------------------------------------------------------------------------

export interface ReviewFindingPayload {
  kind: "code" | "doc"
  title: string
  severity: "P0" | "P1" | "P2" | "P3"
  why_it_matters: string
  autofix_class: "safe_auto" | "gated_auto" | "manual" | "advisory"
  confidence: number
  evidence: string[]
  file?: string
  line?: number
  owner?: string
  requires_verification?: boolean
  pre_existing?: boolean
  section?: string
  finding_type?: string
  suggested_fix?: string
  source?: string
  recordedAt?: string
}

export interface ReviewResidualResolved {
  /** Stable key identifying the finding being resolved.
   *  Convention: `${source ?? "?"}|${file ?? section ?? "?"}|${title}` */
  key: string
  resolution: "applied" | "dismissed" | "filed"
  note?: string
  recordedAt: string
}

function residualKey(f: ReviewFindingPayload): string {
  return `${f.source ?? "?"}|${f.file ?? f.section ?? "?"}|${f.title}`
}

/**
 * Read pending review residuals: emitted findings not yet marked resolved.
 * pre_existing findings and advisory findings are excluded by default.
 */
export function readReviewResiduals(
  ctx: ExtensionContext,
  opts: { includePreExisting?: boolean; includeAdvisory?: boolean } = {},
): ReviewFindingPayload[] {
  const findings = readAllSE<ReviewFindingPayload>(ctx, SE_ENTRY_TYPES.REVIEW_FINDING)
  const resolved = new Set(
    readAllSE<ReviewResidualResolved>(ctx, SE_ENTRY_TYPES.REVIEW_RESIDUAL_RESOLVED).map(e => e.key),
  )
  return findings.filter(f => {
    if (resolved.has(residualKey(f))) return false
    if (!opts.includePreExisting && f.pre_existing) return false
    if (!opts.includeAdvisory && f.autofix_class === "advisory") return false
    return true
  })
}

export function resolveReviewResidual(
  pi: ExtensionAPI,
  key: string,
  resolution: ReviewResidualResolved["resolution"],
  note?: string,
): void {
  appendSE(pi, SE_ENTRY_TYPES.REVIEW_RESIDUAL_RESOLVED, {
    key,
    resolution,
    note,
    recordedAt: new Date().toISOString(),
  })
}

export function reviewFindingKey(f: ReviewFindingPayload): string {
  return residualKey(f)
}

// ---------------------------------------------------------------------------
// Catalogue of all readable state — useful for /se-status (task-016) and
// before_agent_start injection (task-011).
// ---------------------------------------------------------------------------

export interface SEStateSnapshot {
  phase?: PhaseEntry
  worktree?: WorktreeEntry
  testState?: TestStateEntry
  backlogActive: BacklogItemPayload[]
  reviewResiduals: ReviewFindingPayload[]
}

export function snapshotSEState(ctx: ExtensionContext): SEStateSnapshot {
  return {
    phase: getPhase(ctx),
    worktree: getWorktree(ctx),
    testState: getLastTestState(ctx),
    backlogActive: readBacklogActive(ctx),
    reviewResiduals: readReviewResiduals(ctx),
  }
}
