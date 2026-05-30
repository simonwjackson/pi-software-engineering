import { execSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { isBashToolResult } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

import {
  addBacklog,
  appendSE,
  promoteBacklog,
  readAllSE,
  readBacklogActive,
  readLatestSE,
  readReviewResiduals,
  removeBacklog,
  reviewFindingKey,
  setTestState,
  snapshotSEState,
  SE_ENTRY_TYPES,
  type BacklogItemPayload,
} from "./se-state.ts"
import {
  exportBacklog,
  patchBacklogStatus,
  readBacklogDir,
  readNextIdFloor,
  removeBacklogFile,
  writeBacklogItem,
} from "./se-state-backlog-export.ts"
import {
  classifyTestCommand,
  redactSecrets,
  type TestRunnerMatch,
} from "./se-test-detect.ts"
import { registerSeTools } from "./se-tools/index.ts"
import { registerSeSubagentCommands } from "./se-subagent/index.ts"

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

const ReadStateSchema = Type.Object({
  verbose: Type.Optional(
    Type.Boolean({
      description: "Include recent entries (last 5 per type) in addition to current values.",
    }),
  ),
})

// ---------------------------------------------------------------------------
// State rendering helpers (shared by /se-status, widget, se_read_state)
// ---------------------------------------------------------------------------

function colorGlyph(color: "green" | "red" | "unknown" | undefined): string {
  switch (color) {
    case "green":
      return "✓"
    case "red":
      return "✗"
    default:
      return "?"
  }
}

function shortTime(iso: string | undefined): string {
  if (!iso) return ""
  // Render HH:MM in local time.
  try {
    const d = new Date(iso)
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    return `${hh}:${mm}`
  } catch {
    return ""
  }
}

interface SnapshotShape {
  phase?: { phase: string; sliceId?: string; recordedAt: string }
  worktree?: { path: string; branch: string; recordedAt: string }
  testState?: { color: "green" | "red" | "unknown"; command: string; exitCode: number; durationMs?: number; recordedAt: string }
  backlogActive: { id: string; title: string; status: string; priority?: string }[]
  reviewResiduals: { title: string; severity: string; file?: string; section?: string }[]
}

function renderWidgetLine(s: SnapshotShape): string {
  const parts: string[] = []
  if (s.phase) parts.push(s.phase.phase)
  if (s.worktree) parts.push(s.worktree.branch)
  if (s.reviewResiduals.length > 0) {
    parts.push(`${s.reviewResiduals.length} residual${s.reviewResiduals.length === 1 ? "" : "s"}`)
  }
  if (s.backlogActive.length > 0) parts.push(`backlog:${s.backlogActive.length}`)
  if (s.testState) {
    const when = shortTime(s.testState.recordedAt)
    parts.push(`test ${when} ${colorGlyph(s.testState.color)}`)
  }
  return parts.length > 0 ? `SE: ${parts.join(" · ")}` : ""
}

function renderStatusBlock(s: SnapshotShape, verbose: boolean): string {
  const lines: string[] = []
  if (s.phase) {
    lines.push(`Phase: ${s.phase.phase}${s.phase.sliceId ? " (" + s.phase.sliceId + ")" : ""}  @ ${s.phase.recordedAt}`)
  } else {
    lines.push("Phase: (none recorded yet)")
  }
  if (s.worktree) {
    lines.push(`Worktree: ${s.worktree.branch}  → ${s.worktree.path}  @ ${s.worktree.recordedAt}`)
  } else {
    lines.push("Worktree: (none recorded yet)")
  }
  if (s.testState) {
    const dur = s.testState.durationMs ? ` (${s.testState.durationMs}ms)` : ""
    lines.push(
      `Last test: ${s.testState.color.toUpperCase()} ${colorGlyph(s.testState.color)}  exit=${s.testState.exitCode}${dur}  @ ${s.testState.recordedAt}`,
    )
    lines.push(`           cmd: ${s.testState.command}`)
  } else {
    lines.push("Last test: (none recorded yet)")
  }
  if (s.reviewResiduals.length > 0) {
    lines.push(`Review residuals: ${s.reviewResiduals.length} open`)
    if (verbose) {
      for (const r of s.reviewResiduals.slice(0, 5)) {
        const loc = r.file ?? r.section ?? ""
        lines.push(`  - [${r.severity}] ${r.title}${loc ? " (" + loc + ")" : ""}`)
      }
    }
  } else {
    lines.push("Review residuals: 0")
  }
  if (s.backlogActive.length > 0) {
    lines.push(`Backlog: ${s.backlogActive.length} active`)
    if (verbose) {
      for (const b of s.backlogActive.slice(0, 5)) {
        lines.push(`  - ${b.id} (${b.status}): ${b.title}`)
      }
    }
  } else {
    lines.push("Backlog: 0 active")
  }
  return lines.join("\n")
}

function isEmptySnapshot(s: SnapshotShape): boolean {
  return !s.phase && !s.worktree && !s.testState && s.backlogActive.length === 0 && s.reviewResiduals.length === 0
}

const EMPTY_STATE_HINT =
  "No SE state recorded yet.\n" +
  "Likely first action:\n" +
  "  • /se-plan  — if you're starting from a fresh idea\n" +
  "  • /skill:se-worktree  — if you're picking up an existing branch\n" +
  "  • just start coding  — phase, worktree, test-state will populate as you go"

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function softwareEngineeringExtension(pi: ExtensionAPI) {
  // -- se-judge model provider (task-006) ---------------------------------
  // Optional cheap-judge provider for review/judge calls (se-code-review
  // Tier 2 personas, se-doc-review, se-optimize, se-product-pulse). The
  // user opts in by setting SE_JUDGE_MODEL plus the supporting env vars;
  // skill prose then explicitly routes judge calls through 'se-judge'.
  // When not configured, registration is skipped silently and SE skills
  // fall through to the primary model.
  registerJudgeProvider(pi)

  // -- scripty-skill tool wrappers (task-003) ------------------------------
  registerSeTools(pi, PACKAGE_ROOT)

  // -- subagent fan-out commands (task-008) --------------------------------
  registerSeSubagentCommands(pi)

  // -- backlog_add ----------------------------------------------------------
  pi.registerTool({
    name: "backlog_add",
    label: "Backlog: Add",
    description:
      "Capture a deferred-but-actionable engineering follow-up into the SE backlog. Writes a session-log entry AND a backlog/<id> - <slug>.md file so the item is visible to other sessions immediately. Use ambiently from other SE skills; do not interrupt the parent skill's flow to ask whether to capture.",
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
      // task-017: also write to disk so other sessions see this item.
      if (ctx?.cwd) {
        try {
          writeBacklogItem(created, { cwd: ctx.cwd })
        } catch {
          /* disk write is best-effort; session log remains authoritative */
        }
      }
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
      "List active SE backlog items. Reads both the current session log and on-disk backlog/ files (so items added in other sessions are visible). Optionally filter by status, label, or source.",
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
      // task-017: merge session log (current-session truth) with on-disk
      // files (cross-session truth). Per-id, session log wins because it
      // holds the freshest in-flight status changes for this session.
      const sessionItems = readBacklogActive(ctx)
      const sessionIds = new Set(sessionItems.map(i => i.id))
      const diskItems = readBacklogDir({ cwd: ctx.cwd })
      const merged: BacklogItemPayload[] = [...sessionItems]
      for (const d of diskItems) {
        if (!sessionIds.has(d.id)) merged.push(d)
      }
      merged.sort((a, b) => a.id.localeCompare(b.id))
      let items = merged
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
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as typeof BacklogPromoteSchema.static
      promoteBacklog(pi, p.id, p.target, p.note)
      // task-017: keep disk in sync so other sessions see the promotion.
      if (ctx?.cwd) {
        try {
          patchBacklogStatus(p.id, "in-progress", { cwd: ctx.cwd })
        } catch {
          /* best-effort */
        }
      }
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
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as typeof BacklogRemoveSchema.static
      removeBacklog(pi, p.id, p.reason)
      // task-017: drop the disk file too so it disappears from other sessions.
      if (ctx?.cwd) {
        try {
          removeBacklogFile(p.id, { cwd: ctx.cwd })
        } catch {
          /* best-effort */
        }
      }
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

  // -- CLI flags ------------------------------------------------------------
  pi.registerFlag("se-review-tier", {
    description: "Force SE review tier: '1' or '2'. Overrides /se-work's prose-based tier selection.",
    type: "string",
  })
  pi.registerFlag("se-skip-worktree", {
    description: "Skip the default worktree isolation step in /se-work. Use only for read-only investigations.",
    type: "boolean",
    default: false,
  })
  pi.registerFlag("se-no-pr", {
    description: "After /se-work completes, do not open a PR — commit and stop. Mirrors 'no PRs, just commit' intent.",
    type: "boolean",
    default: false,
  })
  pi.registerFlag("se-debug-strict", {
    description:
      "Enable the no-edits-before-repro guardrail: refuse edit/write/multi_edit on code paths until a se:repro entry is recorded. Use with /skill:se-debug.",
    type: "boolean",
    default: false,
  })

  // -- se_capture_repro tool ------------------------------------------------
  pi.registerTool({
    name: "se_capture_repro",
    label: "SE: Capture repro",
    description:
      "Record a reproduction for the current bug before editing any code. The harness uses the recorded repro to unblock the no-edits-before-repro guardrail. Use this whenever you've reproduced a defect and are about to start fixing it.",
    promptSnippet: "Record symptom, steps, observed, expected for the active debug session",
    promptGuidelines: [
      "Call se_capture_repro after reproducing a bug and BEFORE making any code change. The no-edits-before-repro guardrail blocks edits until this tool has been called once in the session.",
      "Provide concrete observed and expected values (not just 'fails' / 'works'). Include the minimal steps that reliably reproduce the defect.",
      "Use environment to record runtime details (Node version, OS, branch) when the bug is environment-sensitive.",
    ],
    parameters: Type.Object({
      symptom: Type.String({
        description: "One-sentence description of the user-visible defect.",
        minLength: 1,
      }),
      reproduction_steps: Type.String({
        description: "Numbered or plain-text steps that reliably reproduce the defect.",
        minLength: 1,
      }),
      observed: Type.String({
        description: "What actually happens when the steps run.",
        minLength: 1,
      }),
      expected: Type.String({
        description: "What should happen when the steps run.",
        minLength: 1,
      }),
      environment: Type.Optional(
        Type.String({
          description: "Runtime details (Node version, OS, branch) when environment-sensitive.",
        }),
      ),
      references: Type.Optional(
        Type.Array(Type.String(), {
          description: "Repo-relative paths or issue references. Never absolute paths.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const p = params as {
        symptom: string
        reproduction_steps: string
        observed: string
        expected: string
        environment?: string
        references?: string[]
      }
      appendSE(pi, SE_ENTRY_TYPES.REPRO, {
        ...p,
        recordedAt: new Date().toISOString(),
      })
      return {
        content: [
          {
            type: "text",
            text: `Repro recorded: ${p.symptom}\n  observed: ${p.observed}\n  expected: ${p.expected}\n\nEdits are now unblocked for this session.`,
          },
        ],
      }
    },
  })

  // -- se_atomic_commit tool ----------------------------------------------
  // Sanctioned commit path for /se-work code commits. Validates the
  // conventional-commit shape, refuses RED commits unless allowRed is set,
  // and rejects path arguments that fall outside the active worktree.
  pi.registerTool({
    name: "se_atomic_commit",
    label: "SE: Atomic commit",
    description:
      "Stage the listed paths and create one atomic conventional-commit. Refuses to commit while the slice is RED unless allowRed is set with a documented reason. The single sanctioned commit path for /se-work code commits.",
    promptSnippet: "Commit one atomic slice with a validated Conventional Commit message",
    promptGuidelines: [
      "Use se_atomic_commit whenever committing code in /se-work. Use the bash tool's `git commit` only for vendored/generated commits where the convention does not apply, and document the reason in the body.",
      "One purpose per commit. If the slice still has untests-passing changes or is still RED, split into smaller commits or refactor the slice before calling this tool.",
      "Pass allowRed only when committing a deliberate WIP / known-broken state with a documented reason. The tool annotates the commit body with a RED-state footer when allowRed is true.",
    ],
    parameters: Type.Object({
      type: Type.Union(
        [
          Type.Literal("feat"),
          Type.Literal("fix"),
          Type.Literal("refactor"),
          Type.Literal("test"),
          Type.Literal("docs"),
          Type.Literal("chore"),
          Type.Literal("build"),
          Type.Literal("ci"),
          Type.Literal("perf"),
          Type.Literal("style"),
        ],
        { description: "Conventional Commit type." },
      ),
      scope: Type.Optional(
        Type.String({
          description: "Optional kebab-case scope (e.g. 'se-state', 'se-loop', 'packaging').",
          pattern: "^[a-z0-9][a-z0-9-]*$",
          maxLength: 40,
        }),
      ),
      subject: Type.String({
        description: "Imperative-mood subject line, ≤72 chars, no 'and also'.",
        minLength: 1,
        maxLength: 72,
      }),
      body: Type.Optional(
        Type.String({
          description: "Optional body paragraph(s). Use blank lines between paragraphs.",
        }),
      ),
      paths: Type.Array(Type.String(), {
        description: "Repo-relative paths to stage. Must be a non-empty array; never use '.' or globs.",
        minItems: 1,
      }),
      allowRed: Type.Optional(
        Type.Boolean({
          description: "Override the RED-state refusal. Must be paired with a body explaining why. Default false.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) {
        return { content: [{ type: "text", text: "No session context" }], isError: true }
      }
      const p = params as {
        type: string
        scope?: string
        subject: string
        body?: string
        paths: string[]
        allowRed?: boolean
      }

      // -- Subject sanity ("and also" and double-purpose markers).
      const subject = p.subject.trim()
      const FORBIDDEN_TOKENS = ["and also", " + ", "; ", " & "]
      for (const tok of FORBIDDEN_TOKENS) {
        if (subject.toLowerCase().includes(tok)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `se_atomic_commit refused: subject contains multi-purpose marker '${tok}'. Split into multiple commits or rewrite the subject to name one purpose.`,
              },
            ],
          }
        }
      }

      // -- Worktree scoping check.
      const wt = readLatestSE<{ path: string; branch: string }>(ctx, SE_ENTRY_TYPES.WORKTREE)
      const cwd = ctx.cwd
      if (wt && wt.path) {
        const wtAbs = resolve(wt.path)
        for (const path of p.paths) {
          const abs = resolve(cwd, path)
          const rel = relative(wtAbs, abs)
          if (rel.startsWith("..") || rel.startsWith("/")) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `se_atomic_commit refused: path '${path}' is outside the active worktree (${wt.path}). Move the change into the worktree or pass --se-skip-worktree if you really mean to commit outside it.`,
                },
              ],
            }
          }
        }
      }

      // -- RED-state check.
      const test = readLatestSE<{ color: "green" | "red" | "unknown"; command: string; recordedAt: string }>(
        ctx,
        SE_ENTRY_TYPES.TEST_STATE,
      )
      if (test && test.color === "red" && !p.allowRed) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `se_atomic_commit refused: last test run is RED (${test.command} @ ${test.recordedAt}). Either fix the slice and re-run the test, split into smaller commits where each is GREEN, or pass allowRed=true with a documented body explaining the deliberate WIP.`,
            },
          ],
        }
      }

      // -- Compose the message.
      const header = p.scope ? `${p.type}(${p.scope}): ${subject}` : `${p.type}: ${subject}`
      const bodyLines: string[] = []
      if (p.body) {
        bodyLines.push("")
        bodyLines.push(p.body.trim())
      }
      if (p.allowRed && test?.color === "red") {
        bodyLines.push("")
        bodyLines.push(`Committing RED: last test ${test.command} at ${test.recordedAt} reported exit ${test.exitCode}. Documented intentional WIP.`)
      }
      const message = [header, ...bodyLines].join("\n")

      // -- Stage and commit.
      try {
        execSync(`git add -- ${p.paths.map(s => JSON.stringify(s)).join(" ")}`, { cwd, stdio: "pipe" })
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: "pipe" })
      } catch (e: unknown) {
        const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string }
        const out = (err.stderr ?? err.stdout ?? Buffer.from(err.message ?? "")).toString().trim()
        return {
          isError: true,
          content: [
            { type: "text", text: `se_atomic_commit failed:\n${out}` },
          ],
        }
      }

      // -- Read back what we committed for the renderer.
      let sha = ""
      let stat = ""
      try {
        sha = execSync("git rev-parse HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim()
          .slice(0, 12)
        stat = execSync("git show --stat --format= HEAD | tail -1", { cwd, stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim()
      } catch {
        // best-effort; commit succeeded, just couldn't summarize
      }

      return {
        content: [
          {
            type: "text",
            text: `[${sha}] ${header}${stat ? "\n  " + stat : ""}`,
          },
        ],
        details: { sha, header, paths: p.paths, stat, message },
      }
    },
  })

  // -- no-edits-before-repro gate ------------------------------------------
  // Active when --se-debug-strict is set. Defers to a doc-path bypass and
  // checks for any se:repro entry in the current session log.
  const GUARDED_TOOLS = new Set(["edit", "write", "multi_edit"])
  const DOC_PATH_PATTERNS: RegExp[] = [
    /^docs\//,
    /\.md$/i,
    /\.markdown$/i,
    /\.mdx$/i,
    /\.rst$/i,
    /\.txt$/i,
    /(^|\/)README\b/i,
    /(^|\/)CHANGELOG\b/i,
  ]

  function isDocPath(path: string): boolean {
    for (const pat of DOC_PATH_PATTERNS) if (pat.test(path)) return true
    return false
  }

  pi.on("tool_call", async (event, ctx) => {
    if (!GUARDED_TOOLS.has(event.toolName)) return
    if (pi.getFlag("se-debug-strict") !== true) return
    const target = (event.input as { file_path?: string; path?: string }).file_path
      ?? (event.input as { file_path?: string; path?: string }).path
      ?? ""
    if (target && isDocPath(target)) return
    if (!ctx) return
    const repros = readAllSE<unknown>(ctx, SE_ENTRY_TYPES.REPRO)
    if (repros.length > 0) return
    return {
      block: true,
      reason:
        "se-debug: capture a repro before editing code. Run the /se-debug-repro prompt or call the `se_capture_repro` tool, then retry. Pass --se-debug-strict=false to disable the gate for this session.",
    }
  })

  // -- resources_discover: per-repo SE skills/prompts/themes ----------------
  // Scans ctx.cwd for documented project locations and returns existing-only
  // paths so Pi can load per-repo SE content without settings.json churn.
  pi.on("resources_discover", async (event, _ctx) => {
    const cwd = event.cwd
    const skillPaths: string[] = []
    const promptPaths: string[] = []
    const themePaths: string[] = []
    for (const rel of [".software-engineering/skills", "docs/playbooks", "agents"]) {
      const abs = resolve(cwd, rel)
      if (existsSync(abs) && lstatSync(abs).isDirectory()) skillPaths.push(abs)
    }
    for (const rel of [".software-engineering/prompts"]) {
      const abs = resolve(cwd, rel)
      if (existsSync(abs) && lstatSync(abs).isDirectory()) promptPaths.push(abs)
    }
    for (const rel of [".software-engineering/themes"]) {
      const abs = resolve(cwd, rel)
      if (existsSync(abs) && lstatSync(abs).isDirectory()) themePaths.push(abs)
    }
    return { skillPaths, promptPaths, themePaths }
  })

  // -- keyboard shortcuts ---------------------------------------------------
  // Graceful fallback: handlers degrade to a notify when no state to act on.
  // Shortcuts use alt+* to avoid colliding with Pi built-ins:
  // ctrl+g is reserved, ctrl+r = app.session.rename, ctrl+w =
  // tui.editor.deleteWordBackward. alt+s/r/w are unused at v0.77.
  pi.registerShortcut("alt+s", {
    description: "SE: jump to next review residual",
    handler: ctx => {
      const residuals = readReviewResiduals(ctx)
      if (!ctx.hasUI) return
      if (residuals.length === 0) {
        ctx.ui.notify("No review residuals to jump to.", "info")
        return
      }
      const first = residuals[0]
      const loc = first.file ? `${first.file}${first.line ? ":" + first.line : ""}` : first.section ?? ""
      ctx.ui.notify(`Next residual: [${first.severity}] ${first.title}${loc ? " " + loc : ""}`, "info")
    },
  })

  pi.registerShortcut("alt+r", {
    description: "SE: show last review summary",
    handler: ctx => {
      const residuals = readReviewResiduals(ctx)
      if (!ctx.hasUI) return
      if (residuals.length === 0) {
        ctx.ui.notify("No review run recorded for this session yet. Run /se-review when ready.", "info")
        return
      }
      const sev: Record<string, number> = {}
      for (const r of residuals) sev[r.severity] = (sev[r.severity] ?? 0) + 1
      const summary = Object.entries(sev)
        .map(([s, n]) => `${s}:${n}`)
        .join(" · ")
      ctx.ui.notify(`Last review: ${residuals.length} residual(s) — ${summary}`, "info")
    },
  })

  pi.registerShortcut("alt+w", {
    description: "SE: show current worktree binding",
    handler: ctx => {
      const snap = snapshotSEState(ctx) as SnapshotShape
      if (!ctx.hasUI) return
      if (!snap.worktree) {
        ctx.ui.notify("No worktree recorded. Use /skill:se-worktree to set one up.", "info")
        return
      }
      ctx.ui.notify(`Worktree: ${snap.worktree.branch} → ${snap.worktree.path}`, "info")
    },
  })

  // -- /se-status command --------------------------------------------------
  pi.registerCommand("se-status", {
    description: "Print the current SE state: phase, worktree, last test colour, residuals, backlog.",
    argumentHint: "[--verbose]",
    handler: async (args, ctx) => {
      const verbose = (args ?? "").trim() === "--verbose"
      const snap = snapshotSEState(ctx) as SnapshotShape
      const body = isEmptySnapshot(snap) ? EMPTY_STATE_HINT : renderStatusBlock(snap, verbose)
      if (ctx.hasUI) {
        ctx.ui.notify(body, "info")
      } else {
        // Print mode: write to stdout.
        process.stdout.write(body + "\n")
      }
    },
  })

  // -- se_read_state tool --------------------------------------------------
  pi.registerTool({
    name: "se_read_state",
    label: "SE: Read state",
    description:
      "Return the current SE state (phase, worktree, last test result, active backlog, unresolved review residuals) as a structured object. Use this instead of asking the user or guessing — the substrate is the source of truth.",
    promptSnippet: "Read current SE state",
    promptGuidelines: [
      "Use se_read_state to check current SE phase / worktree / residuals / last test result before deciding the next action.",
      "Call se_read_state at the start of any SE skill that branches on phase or test-state; do not re-derive state from chat.",
      "Pass verbose=true only when the user explicitly asks for recent entries; the default summary is enough for decision-making.",
    ],
    parameters: ReadStateSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) {
        return { content: [{ type: "text", text: "No session context" }], isError: true }
      }
      const p = params as typeof ReadStateSchema.static
      const snap = snapshotSEState(ctx) as SnapshotShape
      const text = isEmptySnapshot(snap) ? EMPTY_STATE_HINT : renderStatusBlock(snap, p.verbose ?? false)
      return {
        content: [{ type: "text", text }],
        details: snap,
      }
    },
  })

  // -- before_agent_start: inject SE state into systemPrompt --------------
  // The status block is appended to the chained systemPrompt so the model
  // treats it as durable context for the turn. Empty state emits nothing
  // (no per-turn 'no SE state' noise).
  pi.on("before_agent_start", async (_event, ctx) => {
    const snap = snapshotSEState(ctx) as SnapshotShape
    if (isEmptySnapshot(snap)) return
    const block = renderInjectedSEContextBlock(snap)
    if (!block) return
    return { systemPrompt: block }
  })

  // -- bash test-state observer --------------------------------------------
  // Records se:test-state entries whenever an LLM-driven bash call (or
  // user_bash) matches the test-runner table. Observation only — refusal
  // lives in tool_call guardrails (task-012, task-013).
  const bashStartTimes = new Map<string, number>()

  pi.on("tool_call", async event => {
    if (event.toolName !== "bash") return
    bashStartTimes.set(event.toolCallId, Date.now())
  })

  pi.on("tool_result", async event => {
    if (!isBashToolResult(event)) return
    const startedAt = bashStartTimes.get(event.toolCallId)
    bashStartTimes.delete(event.toolCallId)
    const command = (event.input as { command?: string }).command ?? ""
    if (!command) return
    const match: TestRunnerMatch | undefined = classifyTestCommand(command)
    if (!match) return
    const exitCode = event.isError ? 1 : 0
    const durationMs = startedAt ? Date.now() - startedAt : undefined
    setTestState(pi, redactSecrets(command), exitCode, durationMs)
  })

  pi.on("user_bash", async event => {
    // For direct user `!command`, observe but never modify execution.
    // Pi runs the command via its default path; we just sniff the prefix.
    const match = classifyTestCommand(event.command)
    if (!match) return
    // We have no exit code at this point (no result event for user_bash).
    // Record an entry indicating a user-driven test run *was attempted*.
    // Consumers should not treat this as a definitive RED/GREEN signal.
    setTestState(pi, redactSecrets(event.command), -1, undefined)
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

    // SE state replay — surface the widget on startup/resume so users can
    // see what state survived /compact / /fork without typing anything.
    if (event.reason === "startup" || event.reason === "resume") {
      refreshSEWidget(ctx)
    }
  })

  // Refresh the widget after every state-mutating tool. Cheap (one snapshot
  // read) and predictable. tool_result handler fires after the entry has
  // been appended, so the read sees the new value.
  pi.on("tool_result", async (event, ctx) => {
    if (!ctx?.hasUI) return
    const mutatingTools = new Set([
      "backlog_add",
      "backlog_promote",
      "backlog_remove",
      "backlog_export",
      "se_review_finding",
    ])
    if (mutatingTools.has(event.toolName)) refreshSEWidget(ctx)
  })
}

/**
 * Compose the per-turn SE context block injected via before_agent_start.
 * Bounded in size: counts for residuals/backlog, top item summary only.
 */
function renderInjectedSEContextBlock(s: SnapshotShape): string {
  const lines: string[] = ["<se-state>"]
  if (s.phase) {
    lines.push(`phase: ${s.phase.phase}${s.phase.sliceId ? " (" + s.phase.sliceId + ")" : ""}`)
  }
  if (s.worktree) {
    lines.push(`worktree: ${s.worktree.branch}`)
  }
  if (s.testState) {
    const when = shortTime(s.testState.recordedAt)
    lines.push(`last_test: ${s.testState.color} (exit ${s.testState.exitCode}) at ${when}`)
  }
  if (s.reviewResiduals.length > 0) {
    lines.push(
      `review_residuals: ${s.reviewResiduals.length} open — call se_read_residuals for the full list, or /se-status for a summary`,
    )
  }
  if (s.backlogActive.length > 0) {
    lines.push(
      `backlog: ${s.backlogActive.length} active — call backlog_list for the full set`,
    )
  }
  lines.push("</se-state>")
  return lines.length > 2 ? lines.join("\n") : ""
}

/**
 * Optionally register a 'se-judge' provider when the SE_JUDGE_MODEL
 * environment variable is set. The provider's baseUrl/api/apiKey come
 * from sibling env vars; if any required piece is missing the function
 * returns silently and SE skills fall through to the primary model.
 *
 * Required: SE_JUDGE_MODEL (model id).
 * Defaults: SE_JUDGE_API = openai-chat-completions,
 *           SE_JUDGE_BASE_URL = (none, must be set for non-default APIs),
 *           SE_JUDGE_API_KEY = literal key or $ENV_NAME reference.
 */
function registerJudgeProvider(pi: ExtensionAPI): void {
  const model = process.env.SE_JUDGE_MODEL
  if (!model) return
  const api = (process.env.SE_JUDGE_API ?? "openai-chat-completions") as
    | "openai-chat-completions"
    | "openai-responses"
    | "anthropic-messages"
  const baseUrl = process.env.SE_JUDGE_BASE_URL
  const apiKey = process.env.SE_JUDGE_API_KEY
  const contextWindow = process.env.SE_JUDGE_CONTEXT_WINDOW
    ? parseInt(process.env.SE_JUDGE_CONTEXT_WINDOW, 10)
    : 128000
  const maxTokens = process.env.SE_JUDGE_MAX_TOKENS
    ? parseInt(process.env.SE_JUDGE_MAX_TOKENS, 10)
    : 4096
  try {
    pi.registerProvider("se-judge", {
      baseUrl,
      apiKey,
      api,
      models: [
        {
          id: model,
          name: `SE Judge (${model})`,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow,
          maxTokens,
        },
      ],
    })
  } catch {
    // Provider registration is best-effort. If the runtime rejects the
    // shape (older Pi versions, missing baseUrl for a remote api), skill
    // prose will fall through to the primary model.
  }
}

function refreshSEWidget(ctx: { hasUI: boolean; ui: { setStatus?: (k: string, v: string) => void; setWidget?: (k: string, lines: string[]) => void } } & Parameters<typeof snapshotSEState>[0]): void {
  if (!ctx.hasUI) return
  const snap = snapshotSEState(ctx) as SnapshotShape
  const line = renderWidgetLine(snap)
  // Prefer setWidget when available (full bottom widget); fall back to
  // setStatus (single token) for older Pi runtimes.
  if (ctx.ui.setWidget) {
    ctx.ui.setWidget("se", line ? [line] : [])
  } else if (ctx.ui.setStatus) {
    ctx.ui.setStatus("se", line)
  }
}
