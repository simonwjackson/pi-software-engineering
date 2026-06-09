---
id: 01KSRGFP0F23NKV4RFJVM0PP2W
slug: se-status-command-widget-reader
title: Ship `/se-status`, the ambient SE widget, and a `se_read_state` tool
origin: parked
legacy: task-016
status: To Do
priority: high
labels:
  - pi-native
  - extension
  - commands
  - ux
  - tools
created: 2026-05-29
source: user
context:
---

# Ship `/se-status`, the ambient SE widget, and a `se_read_state` tool

## Context

Task-001 introduces the SE session-log substrate. Task-004 expands the extension with discovery, shortcuts, and flags but explicitly defers the ambient status widget ("needs the session-log substrate from task-001 to have anything meaningful to display"). Task-011 injects state into the model's context via `before_agent_start`. None of those make the state *visible to the user* and none expose it to skill prose as a callable tool.

Three coupled surfaces close that gap. They share the same readers, the same data shape, and the same blockers (task-001), so they land together:

1. **`/se-status` command** — `pi.registerCommand("se-status", ...)` prints the current SE state inline: phase, worktree binding, last test colour + timestamp, open residual counts, active plan draft, recent atomic commits. Pure read, no LLM call, no side effects.

2. **Ambient widget** — `ctx.ui.setWidget("se", ...)` shows a compact bottom widget with the same fields in single-line form (e.g. `SE: GREEN · feat/foo · 2 residuals · test 14:23 ✓`). The widget refreshes on entry writes and on `session_start`. Users with `hasUI: false` (print/JSON mode) get no widget — only the command output.

3. **`se_read_state` tool** — `pi.registerTool({ name: "se_read_state", ... })` returns the same data as a structured object the LLM can read directly. TypeBox return shape mirrors the catalogue. `promptGuidelines` names the tool explicitly so skill prose can drop "first check the session log" and instead say "call `se_read_state` if you need current phase / worktree / residuals".

All three read through task-001's substrate helpers. None writes. None depends on which entry types exist at the time — fields are optional, empty state degrades to empty strings.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #3 (ambient widget), #25 (`/se-status`). Widget/status semantics in `~/.pi/docs/pi-package-expert-guide.md` §4 (`ctx.ui.setStatus`, `ctx.ui.setWidget`, `pi.registerCommand`).

This task is **not** the same as task-011 — that injects state into the model's *context*; this exposes it to the *user* and to the *tool surface*. The two compose: task-011 makes the model see; this makes the user see and the LLM ask.

This task is **not** the same as task-008's `/se-review` or task-014's `/se-plan` — those are interactive flows that *change* state. This is read-only.

## Why it matters

- **First user-visible payoff of the substrate** — without `/se-status` and the widget, task-001's value is invisible to the user. Skills consume the state; users have no surface to inspect it. This closes the loop.
- **Cheap to ship once substrate exists** — ~150 lines total across three thin surfaces, all reading the same helpers. Most effort is widget layout and the renderer.
- **Reduces "did we lose state?" friction** — the most common SE failure mode after `/compact` is the user wondering whether phase/worktree are still tracked. The widget answers that ambiently; `/se-status` answers it explicitly.
- **`se_read_state` retires skill prose** — most `/se-*` skills today open with "first check the current phase / worktree / residuals". With the tool registered, that prose collapses to one line and the LLM is told to call the tool by name.
- **Composes with everything that follows** — keyboard shortcuts (task-004), state-aware injection (task-011), guardrails (task-012, task-013), residual triage (planned), all benefit from having a tested read path.

## Acceptance Criteria

- [ ] `pi.registerCommand("se-status", { description, argumentHint: "[--verbose]", handler })` is registered. Default output is one short block per entry type with current values. `--verbose` includes recent entries (last N per type) instead of just current.
- [ ] The command degrades to a "no SE state recorded yet" message when the substrate is empty, with a pointer to the most likely first action (`/se-plan`, `/se-worktree`, or "start coding — state will appear as you go").
- [ ] `ctx.ui.setWidget("se", ...)` is registered on `session_start` and re-evaluated on entry writes (or on a small debounce). The widget body is one line: `SE: <phase> · <branch> · <residual-count> residuals · test <hh:mm> <colour-glyph>`. Empty fields are omitted, not shown as `unknown`.
- [ ] The widget is registered only when `ctx.hasUI` is true. Print/JSON modes skip widget registration silently. The command works in all modes.
- [ ] `pi.registerTool({ name: "se_read_state", ... })` returns a typed object with optional fields for each entry type, plus an optional `recent` map keyed by type containing the last N entries when called with `{ verbose: true }`. TypeBox return shape is documented in the readme and mirrors task-001's catalogue.
- [ ] `se_read_state`'s `promptGuidelines` includes at least one bullet that names the tool explicitly: "Use `se_read_state` to check current SE phase / worktree / residuals / last test result before deciding the next action."
- [ ] All three surfaces read from task-001's helper functions, not from `ctx.sessionManager.getEntries()` directly. The substrate owns the parsing; consumers only see typed objects.
- [ ] Survives `withSession` / session replacement: handlers capture no `pi`/`ctx`/`sessionManager` references across awaits.
- [ ] At least one consumer skill is updated in the same PR to drop its "first check current state" prose and instead call `se_read_state`. Recommend `/se-work` SKILL.md as the pilot — it sits at the top of the fanout and benefits most from the diet.
- [ ] Tests cover: empty-state command output is the documented message; non-empty state renders the expected fields; widget skips registration when `hasUI` is false; `se_read_state` returns the catalogued shape; `--verbose` includes the recent entries.
- [ ] `npm test` and `npm run check` still pass.

## Related

- `extensions/software-engineering.ts`
- `skills/se-work/SKILL.md` (pilot consumer)
- task-001 (substrate + helpers; this task reads through them)
- task-004 (sibling extension expansion; shortcuts will reuse the same readers)
- task-011 (sibling consumer: injects state into model context)
- task-015 (producer: populates `se:test-state` that this surfaces)
- task-012 (independent consumer: refuses commits using the same substrate)
- `~/.pi/docs/se-pi-upgrades.md` (items #3, #25)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 ExtensionAPI, `setWidget`, `registerCommand`, `registerTool`)

## Notes

Hard-blocked on task-001 for the helpers. Do not implement direct `getEntries()` parsing here — that re-couples consumers to the entry shape and defeats the substrate's purpose. If task-001 is delayed, this task waits.

Open question for implementation, not now: should the widget include a one-glyph indicator of "stale" state (e.g. test-state older than a configurable window)? Probably yes for test-state and worktree freshness, but stale-detection is a policy decision that affects what users trust. Ship the bare widget first; revisit stale indicators after a couple of real sessions.

Resist the urge to make `/se-status` interactive. It's a read. The residual triage overlay, the phase-flip command, the worktree picker — those are separate surfaces with their own items. Mixing them into `/se-status` makes the read path slow and ambiguous.

The widget's refresh strategy is the trickiest piece. Naïve: re-read substrate on every entry write. Robust: subscribe to substrate changes through a helper exposed by task-001 (`onEntryChange`). Prefer the helper if task-001 ships it; fall back to polling at session-tick frequency if not.
