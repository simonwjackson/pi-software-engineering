---
id: task-008
title: Wrap subagent persona fan-out as deterministic SE commands
status: To Do
priority: medium
labels:
  - pi-native
  - subagents
  - review
  - commands
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Wrap subagent persona fan-out as deterministic SE commands

## Context

The package already bundles `pi-subagents` and ships ~50 SE persona agents under `agents/se-*-reviewer.md`, `agents/se-*-researcher.md`, etc. Today the way to fan a review out across personas is for the LLM to read `se-code-review` or `se-doc-review`'s SKILL.md, decide which personas to invoke, and template `subagent.tasks: [...]` calls correctly. That's a lot of LLM reasoning for what is, mechanically, the same recipe every time.

Pi makes this much smaller. `pi.registerCommand` plus direct calls to the bundled `pi-subagents` extension can collapse persona fan-out into one slash command per review type:

- `/se-review` — run the `se-code-review` Tier 2 persona set against the current diff/PR. Optional flag for which personas. Default persona set encoded in the command.
- `/se-doc-review` — same shape for `se-doc-review`'s persona set.
- `/se-research <topic>` — fan out research agents (`se-best-practices-researcher`, `se-framework-docs-researcher`, `se-web-researcher`, `se-repo-research-analyst`) with a single argument.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #39, #40, #41. Subagent invocation shapes documented in `node_modules/pi-subagents/skills/pi-subagents/SKILL.md`.

This is **not** about replacing the SKILL.md prose — `se-code-review`'s detailed walkthrough, finding-merge logic, and triage UI all stay. The command is the deterministic entry that gathers context, dispatches the agents, and hands the merged output back to the existing skill prose for triage.

## Why it matters

- **One reliable entry point** — `/se-review` works the same every time. No "did the LLM remember which personas to call?"
- **Discoverable** — `pi command list` (and autocomplete) surfaces `/se-review` without requiring the user to read the skill first.
- **Easier composition** — the command can be invoked from other extensions, shortcuts (task-004), or scripts without needing the LLM in the loop.
- **Independent of substrate** — doesn't depend on task-001. The subagent extension already manages its own state.

## Acceptance Criteria

- [ ] `/se-review` registered, takes an optional persona filter (default: full Tier 2 set for the current diff scope), dispatches via `pi-subagents`' programmatic API or RPC, and hands the merged result to `se-code-review`'s synthesis flow.
- [ ] `/se-doc-review` registered with the analogous shape for the documentation reviewer persona set.
- [ ] `/se-research <topic>` registered, fans out the research-agent set with the given topic, and emits a research digest using `se-best-practices-researcher`'s synthesis format.
- [ ] Each command shows `argument-hint:` and a clear description in autocomplete.
- [ ] Default persona sets are defined in one place (a small TS module in `extensions/se-subagent/`) so updating the default is one edit, not a sweep.
- [ ] Each command gracefully degrades when `pi-subagents` is not loaded (the extension might be filtered out via settings) — notify the user instead of erroring.
- [ ] SKILL.md updates for `se-code-review` and `se-doc-review` mention the commands as the preferred entry point, while keeping the synthesis/triage prose intact.
- [ ] `npm test` and `npm run check` still pass.

## Related

- `extensions/se-subagent/` (new) or extension growth in `software-engineering.ts`
- `skills/se-code-review/SKILL.md`
- `skills/se-doc-review/SKILL.md`
- `agents/se-*-reviewer.md`
- `agents/se-*-researcher.md`
- `node_modules/pi-subagents/skills/pi-subagents/SKILL.md`
- `~/.pi/docs/se-pi-upgrades.md` (items #39, #40, #41)

## Notes

Be careful not to recreate `pi-subagents`. The command is a thin wrapper: gather inputs, define the persona list, invoke `pi-subagents`, hand off the result. If the command starts growing parallel-execution logic, finding-merge logic, or its own state model, stop — that work belongs in `pi-subagents` upstream.

Some personas might fan out differently for a feature PR vs a docs-only PR. The first version should keep the persona set static and let the SKILL.md still reason about scope; smarter scoping is a follow-up.
