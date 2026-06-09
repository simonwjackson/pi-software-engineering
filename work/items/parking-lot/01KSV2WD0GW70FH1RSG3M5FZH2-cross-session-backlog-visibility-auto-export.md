---
id: 01KSV2WD0GW70FH1RSG3M5FZH2
slug: cross-session-backlog-visibility-auto-export
title: Make backlog cross-session-visible via auto-export on mutation
origin: parked
legacy: task-017
status: To Do
priority: high
labels:
  - se-backlog
  - cross-session
  - substrate
created: 2026-05-30
source: user
context:
---

# Make backlog cross-session-visible via auto-export on mutation

## Context

Today the SE backlog uses the current session's log as the sole source of truth at runtime. `backlog_add`, `backlog_promote`, `backlog_remove` write `se:backlog*` entries via `pi.appendEntry`; `backlog_list` reads them back via `ctx.sessionManager.getEntries()`. The on-disk `backlog/<id> - <slug>.md` files are created only when the user explicitly calls `backlog_export`, and `backlog_list` never reads them back.

The consequence: **items added in session A are invisible to session B**, even when both sessions run inside the same repo and the user has been actively using the backlog. New sessions start blind. Promotions and removals made in another session do not propagate.

This was flagged as the open question in `./01KSRGFP00WTNB7G4F7V3TM6TG-move-se-state-into-pi-session-log`:

> "whether the on-disk `backlog/` directory should be auto-exported on every mutation (familiar Git-tracked feel, but reintroduces churn) or only on explicit `backlog_export` (cleaner, but requires user intent to share across machines)."

That question was resolved at the time in favor of "explicit only." After living with the resulting cross-session blindness, the user has decided the churn is the lesser evil.

## Decision

Auto-export on every backlog mutation. The on-disk `backlog/<id> - <slug>.md` files become the cross-session source of truth. Session log entries remain the runtime substrate for the current session, but `backlog_list` reads disk first so new sessions see what other sessions captured.

## Why it matters

- Cross-session visibility is the primary value the backlog tooling is supposed to provide. Today it does not deliver that.
- Users currently get the worst of both designs: explicit-export friction *and* per-session siloing.
- Auto-export pays a small, predictable cost (one file write per mutation) for a feature the current model cannot provide at all.

## Acceptance Criteria

- [ ] `backlog_add` writes the new item's `backlog/<id> - <slug>.md` file immediately after appending the session-log entry. No batched export; one file write per call.
- [ ] `backlog_promote` re-renders the affected item's disk file so status reflects `in-progress`.
- [ ] `backlog_remove` deletes the affected item's disk file (or moves it to a tombstone — design decision during planning). Removal is recorded both in the session log (existing behavior) and on disk.
- [ ] `backlog_list` reads on-disk files in the repo's `backlog/` directory and merges them with the current session's log entries. Latest write per `id` wins; the merge rule is documented in `se-state.ts`.
- [ ] The existing explicit `backlog_export` tool remains available for bulk re-render / repair scenarios (e.g. after manual edits to entries) and is **not** removed.
- [ ] `backlog/.next-id` is updated on every `backlog_add` that allocates a new id, not only on explicit export. Allocation respects both the on-disk floor and any ids visible in the session log.
- [ ] Tests in `tests/se-state.test.mjs` (or a new sibling test file) cover:
  - `backlog_add` produces a disk file matching `renderBacklogMarkdown` output.
  - `backlog_list` returns items written to disk by a different "session" (simulated by writing files without corresponding session-log entries).
  - Latest-wins merge when both disk and session log hold an entry for the same id.
  - `backlog_remove` removes the disk file (or tombstones it, per the chosen design).
- [ ] `skills/se-backlog/SKILL.md` storage/lifecycle sections are updated to describe the disk-first cross-session model and the surviving role of `backlog_export`.
- [ ] `docs/SE-STATE.md` is updated to note this is the one SE entry type whose disk artifact is intentionally the cross-session source of truth, and why this is the exception not the rule for `se:*` entries.

## Trade-offs to keep visible

- This reintroduces the Git churn task-001 explicitly avoided: every park/promote/prune becomes a working-tree change. Worktree-level merge conflicts on shared `backlog/` files are now possible again. The user has accepted this trade.
- All other `se:*` state remains session-log-only. The backlog is the documented exception, not a precedent for moving other state to disk.

## Related

- `extensions/software-engineering.ts` (backlog_add/list/promote/remove tools)
- `extensions/se-state.ts` (`readBacklogActive`, `addBacklog`, `promoteBacklog`, `removeBacklog`)
- `extensions/se-state-backlog-export.ts` (`renderBacklogMarkdown`, `backlogFilename`, `exportBacklog`)
- `skills/se-backlog/SKILL.md`
- `docs/SE-STATE.md`
- `./01KSRGFP00WTNB7G4F7V3TM6TG-move-se-state-into-pi-session-log - move-se-state-into-pi-session-log.md` (the prior open question)

## Notes

Recommend planning via `/se-plan` rather than going straight to `/se-work` — the remove-vs-tombstone decision, the merge-rule wording, and the cross-skill prompt-guideline updates benefit from a planning pass before TDD begins.
