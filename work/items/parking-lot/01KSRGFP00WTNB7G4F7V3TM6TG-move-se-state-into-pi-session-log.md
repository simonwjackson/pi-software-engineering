---
id: 01KSRGFP00WTNB7G4F7V3TM6TG
slug: move-se-state-into-pi-session-log
title: Move SE state and the backlog itself off-disk into the Pi session log
origin: parked
legacy: task-001
status: To Do
priority: high
labels:
  - pi-native
  - architecture
  - state
  - se-backlog
  - se-work
created: 2026-05-29
source: user
context:
---

# Move SE state and the backlog itself off-disk into the Pi session log

## Context

The `/se-*` suite was built before this package became a Pi package. SE state today lives in three different and unreliable places:

- Scratch markdown under `.context/software-engineering/` (worktree, phase, residual review findings, resume hints).
- Tracked Markdown like `Backlog.md` / `backlog/` (this skill's storage).
- Whatever the LLM remembers in the current conversation.

All three break across `/compact`, `/fork`, session restart, and worktrees. The tracked `Backlog.md` pattern additionally forces every park/promote/prune into a Git change, which discourages pruning and causes worktree-level merge conflicts.

Pi provides a first-class substrate for exactly this kind of state: `pi.appendEntry(customType, data)` writes typed entries into the session log. They don't enter the LLM context window, they survive `/compact` and `/fork`, and they rebuild on `session_start` from `ctx.sessionManager.getEntries()`.

Reference notes:

- `~/.pi/docs/se-pi-upgrades.md` items #2 (SE state substrate) and #18 (backlog over `pi.appendEntry`).
- `~/.pi/docs/pi-package-expert-guide.md` §4 — `pi.appendEntry`, `session_start` replay, custom-type message renderers.
- Existing exemplar: `node_modules/pi-subagents` uses session-log entries for run state.

These two upgrades are intentionally captured together. #2 is the storage substrate; #18 is the first concrete consumer and the proof that the substrate is well-shaped. Splitting them risks landing #2 with no caller and #18 with no substrate to call.

## Why it matters

- **Resilience** — SE state stops evaporating at `/compact`, `/fork`, restart, or token-limit churn. Today, a `/compact` halfway through `/se-work` Phase 3 silently loses phase, worktree binding, and residual findings.
- **Zero repo noise** — no `.context/software-engineering/` scratch dir to gitignore, no `Backlog.md` commits, no worktree-level merge conflicts on shared SE files.
- **Token budget** — state stops sitting inside the LLM context window. The model only sees what an SE tool deliberately surfaces.
- **Cross-skill leverage** — once one `se:*` entry exists, guardrails (rebase-only, no-RED-commit, worktree-scoped writes, residual-blocked merge) and the `/se-status` family all have a typed input to read instead of inferring from prose.
- **Right substrate for the right job** — the session log is the right home for state that is per-workstream, cheap to lose, and useful to look up fast. That covers most of what SE skills currently scribble into files.

## Acceptance Criteria

- [ ] The `software-engineering.ts` extension defines a small typed catalogue of SE entry types and one helper per type that wraps `pi.appendEntry` and re-reads the latest value via `ctx.sessionManager.getEntries()`. Initial set covers at minimum: `se:phase`, `se:worktree`, `se:test-state`, `se:review-residuals`, `se:backlog`, `se:backlog:promoted`.
- [ ] On `session_start` the extension replays its own entries and rebuilds in-memory state before the first turn runs. Replay is deterministic — last entry per (type, id) wins.
- [ ] `/compact` and `/fork` are exercised end-to-end and SE state survives both (worktree binding, current phase, backlog items still visible afterwards).
- [ ] The `se-backlog` skill stops being a Markdown-file workflow by default. Capture, list, refine, promote, and prune all go through three new registered tools (`backlog_add`, `backlog_list`, `backlog_promote`) backed by `se:backlog` / `se:backlog:promoted` entries. TypeBox schemas reject malformed items at the harness boundary, not in skill prose.
- [ ] An explicit, optional `backlog_export` path writes the live entry set to `work/items/parking-lot/<id>-<slug>.md` files on demand, preserving the parking-lot format for portability and Git-based audit. Export is a deliberate action, not background churn.
- [ ] Parking-lot IDs are coordination-free ULIDs; no `.next-id` file or repo-local counter is introduced.
- [ ] The `se-backlog` SKILL.md is updated so its "Storage" and "Lifecycle" sections describe the session-log-first model and treat the on-disk backlog as an export target, not the primary store.
- [ ] At least one other SE skill is migrated to the new substrate as a second consumer — most likely `se-work` for `se:phase` and `se:worktree`, or the residual-findings gate in `references/shipping-workflow.md` for `se:review-residuals`. The second consumer proves the entry catalogue and helpers generalize beyond backlog.
- [ ] A short note in `docs/` (or the package README) tells future contributors: SE state lives in the session log; the `software-engineering.ts` extension owns the entry catalogue; new SE skills should add a typed entry rather than a scratch file.
- [ ] No new files appear under `.context/software-engineering/` for the migrated state types in normal operation.

## Related

- `extensions/software-engineering.ts`
- `skills/se-backlog/SKILL.md`
- `skills/se-work/SKILL.md`
- `skills/se-work/references/shipping-workflow.md`
- `node_modules/pi-subagents/src/extension/` — exemplar of session-log-backed state
- `~/.pi/docs/se-pi-upgrades.md` (items #2 and #18)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 ExtensionAPI, especially `appendEntry`, `session_start`, custom-type renderers)

## Notes

This is a substrate change. It will likely produce follow-up backlog items once the entry catalogue exists — guardrails (`/se-pi-upgrades.md` #10–#14), the `/se-status` family (#25–#28), and the `review_finding` custom message type (#36) all become natural next steps once typed SE state is queryable. Do not pre-capture those here; let them surface as separate items after this one lands, so the right-sizing decision is made with the substrate in hand.

Open question to resolve during planning, not now: whether the on-disk `backlog/` directory should be auto-exported on every mutation (familiar Git-tracked feel, but reintroduces churn) or only on explicit `backlog_export` (cleaner, but requires user intent to share across machines). Recommend planning this via `se-plan` rather than `se-work` because of that decision plus the cross-skill migration scope.
