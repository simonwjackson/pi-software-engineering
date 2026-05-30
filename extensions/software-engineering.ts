import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

import {
  addBacklog,
  promoteBacklog,
  readBacklogActive,
  readReviewResiduals,
  removeBacklog,
  reviewFindingKey,
  snapshotSEState,
  type BacklogItemPayload,
} from "./se-state.ts"
import { exportBacklog, readNextIdFloor } from "./se-state-backlog-export.ts"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGE_AGENTS_DIR = resolve(PACKAGE_ROOT, "agents")
const USER_AGENTS_DIR = resolve(homedir(), ".pi", "agent", "agents")
const LEGACY_AGENT_PREFIX = "c" + "e-"

// ---------------------------------------------------------------------------
// Agent symlink management (unchanged from prior implementation)
// ---------------------------------------------------------------------------

function agentFiles(): readonly string[] {
  return readdirSync(PACKAGE_AGENTS_DIR)
    .filter(name => name.startsWith("se-") && name.endsWith(".md"))
    .sort()
    .map(name => resolve(PACKAGE_AGENTS_DIR, name))
}

function isPackageSymlink(path: string, target: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false
    return realpathSync(path) === realpathSync(target)
  } catch {
    return false
  }
}

function describeExistingSymlink(path: string): string {
  try {
    return readlinkSync(path)
  } catch {
    return "unknown target"
  }
}

function removeLegacyAgentSymlinks(): number {
  if (!existsSync(USER_AGENTS_DIR)) return 0
  let removed = 0
  for (const name of readdirSync(USER_AGENTS_DIR)) {
    if (!name.startsWith(LEGACY_AGENT_PREFIX) || !name.endsWith(".md")) continue
    const target = resolve(USER_AGENTS_DIR, name)
    try {
      if (!lstatSync(target).isSymbolicLink()) continue
      unlinkSync(target)
      removed += 1
    } catch {
      // Leave unreadable or concurrently-removed entries alone.
    }
  }
  return removed
}

function syncAgentSymlinks(): { linked: number; removedLegacy: number; conflicts: string[] } {
  mkdirSync(USER_AGENTS_DIR, { recursive: true })
  const removedLegacy = removeLegacyAgentSymlinks()
  let linked = 0
  const conflicts: string[] = []
  for (const source of agentFiles()) {
    const target = resolve(USER_AGENTS_DIR, basename(source))
    if (!existsSync(target)) {
      symlinkSync(source, target)
      linked += 1
      continue
    }
    if (isPackageSymlink(target, source)) continue
    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) {
      conflicts.push(`${target} already points at ${describeExistingSymlink(target)}`)
    } else {
      conflicts.push(`${target} already exists and is not a symlink`)
    }
  }
  return { linked, removedLegacy, conflicts }
}

// ---------------------------------------------------------------------------
// SE state tools
// ---------------------------------------------------------------------------

const BacklogContext = Type.Object({
  cwd: Type.Optional(Type.String()),
  branch: Type.Optional(Type.String()),
  commit: Type.Optional(Type.String()),
  repo: Type.Optional(Type.String()),
  piSession: Type.Optional(Type.String()),
  invokedBy: Type.Optional(Type.String()),
  issueRef: Type.Optional(Type.String()),
})

const BacklogAddSchema = Type.Object({
  title: Type.String({
    description: "Short, verb-led title summarising the deferred work. Required.",
    minLength: 1,
    maxLength: 120,
  }),
  why: Type.Optional(
    Type.String({
      description: "One paragraph describing why this matters — cost, risk, user impact, or compounding value of doing it later.",
    }),
  ),
  acceptance: Type.Optional(
    Type.Array(Type.String(), {
      description: "Bullet list of observable conditions that prove the item is complete.",
    }),
  ),
  related: Type.Optional(
    Type.Array(Type.String(), {
      description: "Repo-relative paths, PR/issue refs, or session references. Never absolute paths.",
    }),
  ),
  labels: Type.Optional(Type.Array(Type.String())),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
  ),
  source: Type.Optional(
    Type.String({
      description: "Which skill discovered the item (e.g. 'se-work', 'se-debug', 'user').",
    }),
  ),
  notes: Type.Optional(Type.String()),
  context: Type.Optional(BacklogContext),
  id: Type.Optional(
    Type.String({
      description: "Override id when migrating from on-disk items. Normally omit and let the tool allocate.",
    }),
  ),
})

const BacklogListSchema = Type.Object({
  status: Type.Optional(
    Type.Union([Type.Literal("to-do"), Type.Literal("in-progress"), Type.Literal("done")]),
  ),
  label: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()),
})

const BacklogPromoteSchema = Type.Object({
  id: Type.String({ description: "Backlog item id (e.g. 'task-007')." }),
  target: Type.Union(
    [
      Type.Literal("se-work"),
      Type.Literal("se-plan"),
      Type.Literal("se-debug"),
      Type.Literal("other"),
    ],
    {
      description: "Where control should go next.",
    },
  ),
  note: Type.Optional(Type.String()),
})

const BacklogRemoveSchema = Type.Object({
  id: Type.String(),
  reason: Type.String({
    description: "Why the item is being removed. Recorded in the session log for audit.",
    minLength: 1,
  }),
})

const BacklogExportSchema = Type.Object({
  dir: Type.Optional(
    Type.String({
      description: "Repo-relative target directory. Defaults to 'backlog'.",
    }),
  ),
  overwrite: Type.Optional(
    Type.Boolean({
      description: "Overwrite existing files with the same id. Default false.",
    }),
  ),
})

const ResidualsReadSchema = Type.Object({
  includePreExisting: Type.Optional(Type.Boolean()),
  includeAdvisory: Type.Optional(Type.Boolean()),
})

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function softwareEngineeringExtension(pi: ExtensionAPI) {
  // -- backlog_add ----------------------------------------------------------
  pi.registerTool({
    name: "backlog_add",
    label: "Backlog: Add",
    description:
      "Capture a deferred-but-actionable engineering follow-up into the SE backlog (session-log entry, optionally exported to backlog/<id>.md later). Use ambiently from other SE skills; do not interrupt the parent skill's flow to ask whether to capture.",
    promptSnippet: "Capture a deferred follow-up into the SE backlog",
    promptGuidelines: [
      "Call backlog_add when the user says 'park this', 'add to the backlog', 'save for later', or when another SE skill discovers real but out-of-scope work.",
      "Use backlog_add only for actionable engineering work. Do not capture vague wishes, durable knowledge (those go to docs/solutions/ via se-compound), or strategy direction (STRATEGY.md).",
      "Set source to the discovering skill (e.g. 'se-work', 'se-debug', 'user') when known.",
      "Prefer extending an existing item over creating a new one when the scope overlaps — pass id to update or use backlog_promote to mark in-progress.",
    ],
    parameters: BacklogAddSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as typeof BacklogAddSchema.static
      const floor = readNextIdFloor({ cwd: ctx?.cwd })
      const partial: Omit<BacklogItemPayload, "id" | "createdAt"> & {
        id?: string
        createdAt?: string
      } = {
        title: p.title,
        status: "to-do",
        priority: p.priority ?? "medium",
        labels: p.labels,
        source: p.source,
        why: p.why,
        acceptance: p.acceptance,
        related: p.related,
        notes: p.notes,
        context: p.context,
      }
      if (p.id) partial.id = p.id
      const created = ctx
        ? addBacklog(pi, ctx, partial, floor)
        : addBacklog(pi, { sessionManager: { getEntries: () => [] } } as never, partial, floor)
      return {
        content: [
          {
            type: "text",
            text: `Captured ${created.id}: ${created.title}`,
          },
        ],
        details: created,
      }
    },
  })

  // -- backlog_list ---------------------------------------------------------
  pi.registerTool({
    name: "backlog_list",
    label: "Backlog: List",
    description:
      "List active SE backlog items. Reads the session log (does not touch the on-disk backlog/ directory). Optionally filter by status, label, or source.",
    promptSnippet: "List active SE backlog items",
    promptGuidelines: [
      "Call backlog_list when the user asks 'what's in the backlog', 'what did we defer', 'show parked work', or wants to pick up an item next.",
      "Default to listing all active items (status='to-do' OR 'in-progress'); filter only when the user is specific.",
    ],
    parameters: BacklogListSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) {
        return { content: [{ type: "text", text: "No session context" }], isError: true }
      }
      const p = params as typeof BacklogListSchema.static
      let items = readBacklogActive(ctx)
      if (p.status) items = items.filter(i => i.status === p.status)
      if (p.label) items = items.filter(i => (i.labels ?? []).includes(p.label!))
      if (p.source) items = items.filter(i => i.source === p.source)
      const summary = items.length
        ? items.map(i => `- ${i.id} (${i.status}, ${i.priority ?? "medium"}): ${i.title}`).join("\n")
        : "(no active backlog items)"
      return {
        content: [{ type: "text", text: summary }],
        details: { items, count: items.length },
      }
    },
  })

  // -- backlog_promote ------------------------------------------------------
  pi.registerTool({
    name: "backlog_promote",
    label: "Backlog: Promote",
    description:
      "Mark a backlog item as promoted to active execution. Records target (se-work, se-plan, se-debug, or other). Does not remove the item — promotion entries are append-only audit and update status to 'in-progress' on read.",
    promptSnippet: "Promote a backlog item into active work",
    promptGuidelines: [
      "Use backlog_promote when the user says 'turn that into work', 'plan this backlog item', or 'pick up task-NNN'.",
      "Choose target by item shape: small and clear → 'se-work'; multi-step or architectural → 'se-plan'; bug → 'se-debug'.",
    ],
    parameters: BacklogPromoteSchema,
    async execute(_toolCallId, params) {
      const p = params as typeof BacklogPromoteSchema.static
      promoteBacklog(pi, p.id, p.target, p.note)
      return {
        content: [
          {
            type: "text",
            text: `${p.id} promoted to ${p.target}${p.note ? ` — ${p.note}` : ""}`,
          },
        ],
        details: { id: p.id, target: p.target, note: p.note },
      }
    },
  })

  // -- backlog_remove -------------------------------------------------------
  pi.registerTool({
    name: "backlog_remove",
    label: "Backlog: Remove",
    description:
      "Remove a backlog item by id. Append-only — recorded as a removal entry, the item id is never reused. Use after the work has landed or the user has explicitly dropped it.",
    promptSnippet: "Remove a landed or dropped backlog item",
    promptGuidelines: [
      "Use backlog_remove when the work has landed (PR merged) or the user explicitly drops the item.",
      "Provide a meaningful reason: 'landed in #142', 'superseded by task-019', 'no longer relevant'. The reason is persisted to the session log.",
    ],
    parameters: BacklogRemoveSchema,
    async execute(_toolCallId, params) {
      const p = params as typeof BacklogRemoveSchema.static
      removeBacklog(pi, p.id, p.reason)
      return {
        content: [{ type: "text", text: `Removed ${p.id} — ${p.reason}` }],
        details: { id: p.id, reason: p.reason },
      }
    },
  })

  // -- backlog_export -------------------------------------------------------
  pi.registerTool({
    name: "backlog_export",
    label: "Backlog: Export to disk",
    description:
      "Render active backlog items to backlog/<id> - <slug>.md files, preserving the existing on-disk format for portability and Git-based audit. Use when the user explicitly asks to share the backlog across machines or commit the current set. Skips files that already exist unless overwrite is true.",
    promptSnippet: "Export the active backlog to backlog/ markdown files",
    promptGuidelines: [
      "Use backlog_export only on explicit user intent (e.g. 'export the backlog', 'write backlog to disk', 'commit the current backlog'). Do not auto-export after every mutation.",
      "Pass overwrite=true only when the user wants to regenerate existing files (e.g. after editing items in the log).",
    ],
    parameters: BacklogExportSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) {
        return { content: [{ type: "text", text: "No session context" }], isError: true }
      }
      const p = params as typeof BacklogExportSchema.static
      const items = readBacklogActive(ctx)
      const res = exportBacklog(items, { dir: p.dir, cwd: ctx.cwd, overwrite: p.overwrite })
      const lines = [
        `Exported ${res.written.length} item(s) to ${res.dir}`,
        res.skipped.length > 0 ? `Skipped ${res.skipped.length} existing file(s); pass overwrite=true to replace` : "",
        `Next id: ${res.nextId}`,
      ].filter(Boolean)
      return { content: [{ type: "text", text: lines.join("\n") }], details: res }
    },
  })

  // -- se_read_residuals ----------------------------------------------------
  // Second consumer: proves the entry catalogue generalizes beyond backlog.
  // Reads se:review-finding entries (written by extensions/se-review.ts)
  // and filters by se:review-residual-resolved entries.
  pi.registerTool({
    name: "se_read_residuals",
    label: "SE: Read review residuals",
    description:
      "Read the current set of unresolved review findings from the session log. Used by se-work's shipping workflow and se-resolve-pr-feedback to gate on residuals before merging. Source data is written by se-code-review and se-doc-review via the se_review_finding tool.",
    promptSnippet: "Read pending review findings",
    promptGuidelines: [
      "Call se_read_residuals before recommending a PR merge or marking a slice complete. Pre-existing and advisory findings are excluded by default.",
      "Call once per turn; the result reflects the entire session log up to the latest tool turn.",
    ],
    parameters: ResidualsReadSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) {
        return { content: [{ type: "text", text: "No session context" }], isError: true }
      }
      const p = params as typeof ResidualsReadSchema.static
      const residuals = readReviewResiduals(ctx, {
        includePreExisting: p.includePreExisting,
        includeAdvisory: p.includeAdvisory,
      })
      const lines = residuals.length
        ? residuals
            .map(
              r =>
                `- [${r.severity}] ${r.title} ${r.file ? `(${r.file}${r.line ? ":" + r.line : ""})` : r.section ? `(${r.section})` : ""} <${r.autofix_class}@${r.confidence}> ${r.source ?? ""}`,
            )
            .join("\n")
        : "(no unresolved residuals)"
      return {
        content: [{ type: "text", text: lines }],
        details: {
          count: residuals.length,
          residuals: residuals.map(r => ({ ...r, _key: reviewFindingKey(r) })),
        },
      }
    },
  })

  // -- session_start: agent symlinks + SE state replay ----------------------
  pi.on("session_start", async (event, ctx) => {
    const { linked, removedLegacy, conflicts } = syncAgentSymlinks()

    if (!ctx.hasUI) return

    if (linked > 0) {
      ctx.ui.notify(`Software Engineering linked ${linked} SE subagent(s)`, "info")
    }
    if (removedLegacy > 0) {
      ctx.ui.notify(`Software Engineering removed ${removedLegacy} legacy subagent symlink(s)`, "info")
    }
    if (conflicts.length > 0) {
      ctx.ui.notify(
        `Software Engineering left ${conflicts.length} existing SE subagent file(s) untouched`,
        "warning",
      )
    }

    // SE state replay — surface a short status line on startup so the user
    // and any subsequent skill prose can see what state survived /compact /
    // /fork. Phase/test-state widget proper is task-016.
    if (event.reason === "startup" || event.reason === "resume") {
      const snap = snapshotSEState(ctx)
      const parts: string[] = []
      if (snap.phase) parts.push(`phase=${snap.phase.phase}`)
      if (snap.worktree) parts.push(`worktree=${snap.worktree.branch}`)
      if (snap.testState) parts.push(`tests=${snap.testState.color}`)
      if (snap.backlogActive.length > 0) parts.push(`backlog=${snap.backlogActive.length}`)
      if (snap.reviewResiduals.length > 0) parts.push(`residuals=${snap.reviewResiduals.length}`)
      ctx.ui.setStatus?.("se", parts.length > 0 ? parts.join(" · ") : "")
    }
  })
}
