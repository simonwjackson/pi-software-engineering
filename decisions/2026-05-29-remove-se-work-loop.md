# Decision: remove the native `se-work-loop` extension and skill

Date: 2026-05-29
Status: Accepted
Tracks: backlog/task-005

## Context

The package shipped a native loop controller (`extensions/se-loop/` with
`/se-work-loop*` commands and `skills/se-work-loop/SKILL.md`) for running
saved plans through fresh-context implementation-unit iterations with durable
state and verification gates.

Recent state was contradictory:

- `extensions/se-loop/` source kept, but the extension was **not** wired into
  `pi.extensions` in `package.json`, so Pi never registered the commands at
  session start.
- `skills/se-work-loop/SKILL.md` existed but was hidden behind a `skills/.ignore`
  entry, so the LLM never saw the skill description.
- `README.md` still documented `/se-work-loop` as a real feature.
- `tests/se-loop-*.mjs` (6 files, ~20 tests) still ran against the parser /
  state-store internals.

The user had already de-facto removed the loop at the runtime level (no
extension registration, no skill exposure) without finishing the cleanup.

## Decision

**Remove `se-work-loop` entirely.** The implementation is dead at runtime,
the documentation lies, and parallel mechanisms (`pi-subagents` for
fresh-context delegation; `/se-work`'s own subagent dispatch for
parallel implementation-unit execution) already cover the same ground with
less surface area.

## Removed

- `extensions/se-loop/` (10 files: background-runner, controller, index,
  manager-overlay, observer, plan-parser, runtime-probe, state-store,
  verification, verify-command-discovery)
- `skills/se-work-loop/SKILL.md`
- `skills/.ignore` (no longer needed once the file it was hiding is gone)
- `docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md`
- `docs/plans/dummy-loop-plan.md`
- `docs/examples/se-work-loop-sample-plan.md`
- `tests/se-loop-*.mjs` (6 files)
- README "SE Work Loop" section
- `skills/se-plan/SKILL.md` frontmatter mention rewritten to describe
  `verify_command` as a general-purpose plan-level verification gate
  rather than a loop-specific field.

## Preserved ideas (for any future re-attempt)

The loop encoded real design knowledge worth holding onto even if the code
goes:

- **Plan as implementation units**: parsing `U1`, `U2`, ... headings with
  per-unit `Goal`, `Files`, `Patterns`, `Verification` metadata. `se-plan`'s
  Implementation Units section preserves this shape.
- **`verify_command` as plan-level gate**: the idea that a plan can declare
  the project's completion check up front and any downstream automation
  (loop, subagent, CI) can consume it. Now reflected in `skills/se-plan`'s
  rewritten `verify_command` comment.
- **Fresh-context iteration**: handed off to `pi-subagents`, which provides
  the same property via `context: "fresh"` on subagent dispatches.
- **Durable state for resumability**: the state-store pattern (file-backed
  `.context/software-engineering/se-work-loop/`) generalizes into the SE
  session-log substrate planned in `backlog/task-001`. The pattern is not
  lost; it moves to `pi.appendEntry`.

If the loop is ever re-attempted, it should:

1. Live behind a single extension command rather than 8 slash commands.
2. Use `pi.appendEntry` for durable state, not a custom file substrate.
3. Use `pi-subagents` for child sessions, not `bun x` shell spawns.
4. Re-validate against a real long-running plan that needed the property
   "main chat stays compact while N units execute in fresh children".

## Consequences

- ~50KB of TypeScript and ~20KB of skill/docs surface deleted.
- 6 test files removed; `npm test` baseline drops from 20 to ~9 tests
  (the surviving ones cover parts of the package unrelated to the loop).
- Users who had `/se-work-loop` in muscle memory will get "command not found".
- The next package version is a breaking change for that subset.
