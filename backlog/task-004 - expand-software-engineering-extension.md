---
id: task-004
title: Expand `software-engineering.ts` into a real SE control plane
status: To Do
priority: medium
labels:
  - pi-native
  - extension
  - discovery
  - ux
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Expand `software-engineering.ts` into a real SE control plane

## Context

`extensions/software-engineering.ts` is currently a one-trick pony: it symlinks subagent files into `~/.pi/agent/agents/` on session start. That's it. The extension surface — the only piece of code in this package that runs deterministic logic at the harness level — is almost entirely unused.

Three orthogonal upgrades that share this file:

- **`resources_discover` for per-repo skills** (#1) — scan cwd for `.software-engineering/skills/`, project `docs/playbooks/`, `agents/` dirs and return them as `skillPaths` from a `resources_discover` handler. Today the user has to manually point settings at every project skill dir.
- **`registerShortcut` for the workflow hotpath** (#4) — `ctrl+w` cycle worktree, `ctrl+r` re-run last review, `ctrl+g` jump to next residual finding. Mirrors what `se-resolve-pr-feedback` already does via scripts.
- **`registerFlag` for SE config knobs** (#5) — `--se-review-tier=2`, `--se-skip-worktree`, `--se-no-pr` so the harness sees SE intent as flags instead of prose routing.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #1, #4, #5. Extension-API shapes in `~/.pi/docs/pi-package-expert-guide.md` §4.

Two adjacent extension upgrades are deliberately excluded:

- The ambient status widget (#3) needs the session-log substrate from task-001 to have anything meaningful to display. Defer.
- `registerProvider` for a cheap-judge model (#6) is its own decision with config-schema and billing implications. Captured separately as task-006.

## Why it matters

- **Per-repo skills without settings.json churn** — every repo can grow its own playbooks and `software-engineering.ts` picks them up automatically. This is the single biggest UX upgrade for power users of the suite.
- **Keyboard-driven SE flow** — the existing scripts already encode the hotpath; lifting them into shortcuts removes a layer of context-switching.
- **Flags beat prose for intent routing** — `--se-review-tier=2` is unambiguous; "tier 2 review please" requires the LLM to map it to the right skill section.
- **Single file, single PR** — all three changes touch one extension file with similar shapes (`pi.on`, `pi.registerShortcut`, `pi.registerFlag`) and similar test approach.

## Acceptance Criteria

- [ ] A `resources_discover` handler is added to `software-engineering.ts` that scans the current `ctx.cwd` for the documented project locations (`.software-engineering/skills/`, `docs/playbooks/`, `agents/`) and returns existing-only paths in `skillPaths`/`promptPaths`/`themePaths`. Missing dirs are skipped silently — no warnings, no creation.
- [ ] Shortcut handlers for at least: `ctrl+w` (cycle worktree), `ctrl+r` (re-run last review), `ctrl+g` (jump to next residual finding). Handlers degrade gracefully when there is no last review or no residual to jump to — they notify the user instead of erroring.
- [ ] Flag definitions for at least `--se-review-tier`, `--se-skip-worktree`, `--se-no-pr`. Flag values are surfaced through a small typed config object the rest of the extension and the skills can consult.
- [ ] The README documents the new shortcuts and flags, including the auto-discovered project skill locations.
- [ ] No regression on the existing subagent-symlink behaviour from session 0 — symlinks are still created, legacy symlinks still cleaned up.
- [ ] The discovery handler is idempotent across `/reload` and survives `withSession` replacement without holding captured `ctx`/`pi` references — only fresh `ctx` arguments inside handlers.

## Related

- `extensions/software-engineering.ts`
- `README.md`
- `~/.pi/docs/se-pi-upgrades.md` (items #1, #4, #5)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 ExtensionAPI, esp. `resources_discover`, `registerShortcut`, `registerFlag`)

## Notes

When the shortcuts need to read SE state (e.g. "what was the last review?", "is there a residual to jump to?"), they will depend on task-001's session-log substrate. Land the shortcut wiring with safe fallbacks (notify "no last review recorded") so this task can ship before task-001, then revisit the shortcut bodies once the substrate exists.

`registerFlag` interacts with intent routing in `/se-work` — the existing prose-based intent routing in `skills/se-work/SKILL.md` should defer to the flag values when present. Plan the small SKILL.md edit alongside the flag registration.
