---
name: se-backlog
description: Ambient engineering backlog skill for capturing, reviewing, refining, promoting, and pruning durable follow-up work in a repo-local Backlog.md-style backlog. Use when the user says to park something, add it to the backlog, save for later, show deferred work, turn a backlog item into work, clean up stale backlog items, or when another SE skill discovers useful out-of-scope work that should not be folded into the current atomic commit.
compatibility: git
argument-hint: [capture | review | promote | prune] [topic]
---

# Engineering Backlog

Maintain a durable, repo-local backlog for real engineering follow-up work that is useful but outside the current scope.

This is a **skill**, not a command-line interface. The user should not need to say `add`, `list`, `promote`, or remember subcommands. Infer the intent from the conversation and act naturally.

## Purpose

The backlog is the package's parking lot for actionable engineering work discovered during planning, debugging, implementation, review, or maintenance.

It exists to protect the rest of the SE workflow:

- Atomic commits stay focused because out-of-scope work is captured instead of smuggled into the current slice.
- Plans stay decision artifacts instead of growing miscellaneous todo sections.
- Strategy stays strategic instead of becoming a feature queue.
- Follow-up work survives context windows, branches, and sessions.

## Interaction Method

When asking the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors. Never silently skip the question.

Ask only when the item value, destination, duplicate handling, promotion target, or destructive prune action is ambiguous.

## Storage

Use a Backlog.md-style repo-local markdown backlog.

Detection order:

1. If the repo already has Backlog.md configuration (`backlog.config.yml`, `backlog/config.yml`, `.backlog/config.yml`) or an existing backlog directory (`backlog/`, `.backlog/`), follow the existing location and file conventions.
2. Otherwise, create `backlog/` at the repository root.
3. Do not put backlog items under `docs/`. Documentation is durable knowledge; backlog is operational work intake.
4. Do not put durable backlog items under `.context/software-engineering/`. That location is local scratch/resume state and may be ignored by git.

If an installed Backlog.md CLI or MCP is clearly configured for the repo, you may use it internally to preserve metadata. Do not expose the interaction as a command-style workflow to the user. If the CLI is unavailable, write markdown files directly.

Default direct-write layout when no stronger convention exists:

```text
backlog/
  task-001 - short-title.md
  task-002 - another-follow-up.md
```

Allocate the next numeric ID from `backlog/.next-id` (a single integer, committed to the repo). Create it seeded to `1` when missing, or to one above the highest existing `task-*` file when migrating an existing backlog. Increment it on every capture. **Never decrement, never reuse a retired ID** — references in commits, PRs, and plans must keep pointing at exactly one thing. Keep filenames repo-portable: lowercase slug, no absolute paths.

## Item Format

Preserve an existing repo's backlog item format when one is present. For a new backlog, use this structure:

```md
---
id: task-001
title: Short action-oriented title
status: To Do
priority: medium
labels:
  - follow-up
created: YYYY-MM-DD
source: se-work | se-debug | se-code-review | se-plan | user | other
context:
  cwd: .
  branch: feat/example-branch
  commit: a1b2c3d
  repo: owner/name
  pi_session: 019e5d76-4269-727d-ad39-64a67e06a241
  invoked_by: se-debug
  issue_ref: "#123"
---

# Short action-oriented title

## Context

What was noticed, where it came from, and any relevant links/files/PRs.

## Why it matters

The cost, risk, user impact, or compounding value of doing this later.

## Acceptance Criteria

- [ ] Observable condition that proves the item is complete
- [ ] Test, doc, cleanup, or verification expectation when applicable

## Related

- `repo/relative/path.ext`
- PR/issue/session reference if known

## Notes

Additional investigation notes. Keep this short; promote to a plan when it grows.
```

## Intent Inference

Infer one of these intents from the user's language and the current SE workflow. Do not require the user to name a mode.

### Capture

Triggered by phrases like:

- "park this"
- "add this to the backlog"
- "save this for later"
- "put this in the bucket"
- "we should follow up on this"
- another skill finds real but out-of-scope work

Capture only if the item is actionable and worth preserving. If the value is unclear, ask one concise question: "Should I keep this as backlog follow-up or drop it?"

Do not capture:

- vague wishes with no action
- personal reminders unrelated to the repo
- work that belongs in the current atomic commit
- durable knowledge that belongs in `docs/solutions/` via `se-compound`
- strategy/roadmap direction that belongs in `STRATEGY.md`

### Review

Triggered by phrases like:

- "what's in the backlog?"
- "what did we defer?"
- "show me parked work"
- "what should I pick up next?"

Read the backlog and summarize open items by status/priority/source. Keep the summary short and decision-oriented. Do not dump every file unless the user asks.

### Refine

Triggered when the user wants to clarify an existing item, add acceptance criteria, add context, or make it ready for execution.

Refinement should make an item plan-ready but not turn it into a full implementation plan. If the item needs sequencing, risk analysis, or multi-unit breakdown, recommend promoting it to `se-plan`.

### Promote

Triggered by phrases like:

- "turn that into work"
- "let's do this backlog item"
- "plan this backlog item"
- "pick up task-012"

Promotion path:

- If small and clear: hand it to `se-work` as the work description.
- If multi-step, ambiguous, or architectural: hand it to `se-plan` first.
- If it is a bug: hand it to `se-debug` unless the root cause is already known.

When promoting, mark the backlog item as `In Progress` or add a note linking to the plan/branch/PR. Do not delete the item until the work lands or the user explicitly prunes it.

### Prune

Triggered by phrases like:

- "clean up the backlog"
- "prune stale items"
- "close old deferred work"

Review stale items and recommend keep / promote / remove. Ask before any destructive removal. The default disposition for items the user agrees are no longer relevant is **removal**, per the Lifecycle section below — not a long-lived `Dropped` status.

## Lifecycle

The backlog is a parking lot, not a record. Completed and abandoned items are **removed**, not archived. Git history (`git log -- backlog/`) is the audit trail.

**Remove when:**

- The work has landed (PR merged, commit pushed, behavior verified).
- The user explicitly drops the item as no longer relevant.
- The item has been folded into another backlog item or a plan that supersedes it.

**Do not remove while:**

- The item is in-flight (promoted to `se-work` / `se-plan` / `se-debug` but not yet landed). Keep it with `status: In Progress` and a link to the branch/PR until the work lands.
- A PR, plan, or commit message references the item and the reference is still load-bearing.

**Before removing a completed item, promote any durable knowledge it produced** — reusable patterns, gotchas, decisions, non-obvious context — to `docs/solutions/` via `se-compound`. The solution doc is the record; the backlog file is not.

**ID handling on removal:** the file goes, the ID does not come back. `backlog/.next-id` is never decremented. A future `task-042` will never collide with a removed `task-042`.

**Confirmation before destructive removal:** when removing more than one item at a time, or when removing an item that has any external reference (PR, plan, commit) the skill knows about, ask the user once with the list before deleting.

Report removals as a short line: `Removed: task-007 (landed in #142), task-011 (dropped: superseded by task-019)`.

## Capture Rules

When capturing a new item, **inspect the backlog directory before writing**. The default assumption is that a related item may already exist; creating a new file is a deliberate choice made after looking, not a reflex.

1. Identify the smallest **meaningful** follow-up — see Right-Sizing below. Smaller is not automatically better.
2. Write a draft title that starts with a verb. Hold it; do not write the file yet.
3. **Pre-capture inspection** — see Inspect Before Writing below. List the backlog directory and read every item whose title, labels, related paths, or filename slug overlap with the new candidate.
4. Decide one of three outcomes:
   - **New item** — nothing in the backlog covers this; create a new file.
   - **Extend** — an existing item is the same work or naturally absorbs this finding; add the new context, acceptance criteria, related paths, and a dated note to that file instead.
   - **Consolidate** — two or more existing items plus the new finding would realistically be done together; merge them per Right-Sizing.
5. For new items only: include source context (current skill, plan/PR/issue if known, why it was deferred), acceptance criteria that describe observable completion, and repo-relative related paths. Never use absolute paths.
6. Run the Context Capture probes below and fill the `context:` block with whatever is readily available. Omit fields that don't apply.
7. Report the path created or updated, the outcome chosen (new / extended / consolidated), and a one-line summary.

## Inspect Before Writing

The pre-capture inspection is cheap and bounded. Its purpose is to make a deliberate new-vs-extend-vs-consolidate decision, not to audit the whole backlog.

**Procedure:**

1. List the backlog directory (`ls backlog/` or the configured location). This is always cheap.
2. Identify **overlap candidates** — existing items that share any of:
   - Word stems with the draft title or filename slug.
   - Labels the new item would carry.
   - Related file paths the new item would touch.
   - The same module/seam, source skill, or root cause noticed elsewhere.
3. Read each overlap candidate's frontmatter (especially `labels`, `context.cwd`, `context.branch`) and the Context / Acceptance Criteria / Related sections. Do not read items that show no overlap signal.
4. If nothing overlaps, proceed to create a new item.
5. If overlap is real, choose **extend** or **consolidate** per Right-Sizing. Prefer extending one existing item over consolidating several when the choice is close — fewer merges is fewer chances to lose specifics.

**Bounds:**

- Do not read every file in the backlog. Filename + frontmatter scanning is enough to pick overlap candidates.
- If the backlog has so many items that even the overlap-candidate read is expensive, that is a signal to prune, not a reason to skip the inspection.
- Do not run the inspection during Review, Refine, Promote, or Prune — those flows already work from the directory contents.

**When extending an existing item:**

- Expand the title only if the broader scope is now correct; do not over-generalize away the specifics.
- Append to Acceptance Criteria and Related rather than rewriting them.
- Add a dated note under Context or Notes summarizing the new discovery and which session/skill found it (the existing `context:` block stays as the original capture's point-in-time snapshot — do not overwrite it).
- Bump `status` only if the new finding actually changes readiness; do not churn metadata.

## Right-Sizing

The goal is durable follow-up, not granular bookkeeping. Over-fragmenting the backlog into many tiny items wastes time at every later stage — review, promote, and the work itself — because each item carries its own framing, acceptance criteria, and switching cost. Prefer one item that captures a coherent swing of work over several items that would land together anyway.

**Consolidate into one item when the candidates share at least one of:**

- The same module, file cluster, or architectural seam.
- The same investigation or design decision (resolving one resolves the others).
- A realistic single PR or single working session.
- The same test surface — the criteria that prove one done would naturally prove the others.
- The same root cause noticed in multiple places.

When consolidating, expand the existing item's title to name the broader scope, append the new specifics to Acceptance Criteria and Related, and add a short note in Context describing the additional discovery. Do not lose the specifics by over-generalizing the title.

**Keep as separate items when:**

- They would land in different commits or PRs in any realistic plan.
- They depend on different decisions and one could be done while the other is still being deliberated.
- One is load-bearing for ongoing work and the other is genuinely "someday/maybe".
- Bundling them would produce an item too large for a single `se-work` swing and would require `se-plan` just to break it back up.

**Heuristic for the in-between case:** if you would honestly merge them at promotion time anyway, merge them now. If you would honestly split them at promotion time anyway, keep them split now.

This bias toward consolidation does not override the Capture filters above — vague wishes, durable knowledge, and strategy direction still don't belong in the backlog at any granularity.

## Context Capture

When creating an item, fill the optional `context:` frontmatter block from cheap, deterministic probes. The goal is to record context that is **already available**, not to investigate.

**Rules:**

- Only run at capture time, never during review, refine, promote, or prune.
- All fields are optional. Omit any field whose probe fails, returns empty, or doesn't apply. An item with no `context:` block is still valid.
- Probes must be bounded and cheap: a handful of shell commands, no network calls, no walking the repo, no reading the session history.
- Path-shaped fields are repo-relative or session-relative — never absolute.
- If a calling skill already knows a field (its own name, the user's framing, an issue ID from context), it should pass it in rather than letting the probe guess.

**Probes:**

| Field | Probe | Notes |
|---|---|---|
| `cwd` | repo-relative path of current dir, or `.` at repo root | from `git rev-parse --show-prefix` |
| `branch` | `git rev-parse --abbrev-ref HEAD` | omit if detached HEAD or not a git repo |
| `commit` | `git rev-parse --short HEAD` | short SHA at capture time |
| `repo` | parse `git remote get-url origin` to `owner/name` | omit if no `origin` or unparseable |
| `pi_session` | see Pi session probe below | only when `PI_CODING_AGENT=true` |
| `invoked_by` | passed in by the calling skill | falls back to the `source:` field |
| `issue_ref` | passed in, or parsed from branch name (e.g. `fix/123-foo` → `#123`, `feat/AB-456-foo` → `AB-456`) | omit if ambiguous |

**Pi session probe:**

Pi does not export the current session ID. The session jsonl path is deterministic, so the ID can be recovered cheaply when `PI_CODING_AGENT=true`:

1. Session directory = `$PI_CODING_AGENT_SESSION_DIR` if set, otherwise `${PI_AGENT_DIR:-$HOME/.pi/agent}/sessions/--<encoded-cwd>--` where `<encoded-cwd>` is the absolute cwd with leading `/` stripped and `/`, `\`, `:` replaced by `-`.
2. The live session is the most recently modified `<ISO-timestamp>_<ULID>.jsonl` in that directory.
3. Record the ULID only (the part after the underscore, without `.jsonl`). Do not record the full path — it isn't portable across machines or session-dir reconfiguration.
4. If the directory doesn't exist or contains no jsonl files, omit `pi_session` silently. Do not create the directory.

**What not to do:**

- Do not record a "current document" field. Pi has no such concept; inferring it from the session history is searching, not probing.
- Do not run probes during review or prune — stored `context:` is point-in-time at capture and is not refreshed.
- Do not block capture on a failing probe. Silent omission is the default.

## Ecosystem Integration

Other SE skills should use this skill ambiently.

**When invoked by another SE skill, capture autonomously by default.** Do not interrupt the parent skill's flow to ask whether to capture. Only ask the user when the item's value, destination, or duplicate handling is genuinely ambiguous — never to confirm that capture itself should happen. Report the result as a single line so the parent skill can continue.

- `se-work`: when useful out-of-scope work appears, capture it in the backlog instead of expanding the current atomic commit.
- `se-debug`: when prevention/audit/refactor follow-up is real but not part of the immediate fix, capture it in the backlog after the diagnosis or fix.
- `se-code-review`: capture residual findings the user accepts but defers, when they don't warrant immediate fixes or tracker tickets.
- `se-plan`: when a requirement or idea is explicitly deferred beyond the plan's scope, capture it as backlog instead of burying it in prose.
- `se-compound`: use backlog for future work; use `docs/solutions/` for reusable knowledge. Do not confuse the two.
- `se-strategy`: strategy defines direction and tracks; backlog stores actionable work. Do not use backlog as a substitute for strategy.

## Output Style

Be concise. The user usually wants confidence that the follow-up was captured, not a full report.

For capture, respond with:

```md
Captured in backlog: `backlog/task-001 - short-title.md`

Why it matters: one sentence.
```

For review, respond with a grouped summary and suggested next item.

For promote, say where control should go next (`se-work`, `se-plan`, or `se-debug`) and why.
