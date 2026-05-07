---
name: se-work-loop
description: Run a saved SE plan through fresh-context implementation-unit iterations with durable local state and verification gates. Use when a plan has multiple U-ID implementation units and should keep going across child sessions until verification passes.
argument-hint: "<plan-path> [--verify-command \"command\"]"
---

# SE Work Loop

Run a saved `se-plan` document through repeated fresh-context implementation-unit iterations.

Use regular `se-work` for short or interactive work. Use `se-work-loop` when a plan has several U-ID units and the main chat should stay compact while child sessions do the detailed implementation work.

## Command Surface

```text
/se-work-loop <plan-path> [--verify-command "command"]
/se-work-loop-status [id]
/se-work-loop-stop <id>
/se-work-loop-resume <id>
/se-work-loop-probe
```

`/se-work-loop` starts a loop. The other commands are intentionally separate slash commands so they are discoverable and do not hide behavior behind opaque subcommands.

## Verification Command

Every loop needs a target-project verification command before durable state is created.

- If the user provides `--verify-command`, use it.
- Otherwise the extension attempts to discover one from project conventions such as `package.json` scripts, `mise.toml`, `AGENTS.md`, or `README.md`.
- If discovery is unknown or ambiguous, the loop does **not** create a state file. Ask the user to re-run with `--verify-command`.

Examples:

```text
/se-work-loop docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md --verify-command "node --test tests/se-loop-*.test.mjs"
/se-work-loop-status
/se-work-loop-stop 20260506T120000Z-feat-add-native-se-work-loop
/se-work-loop-resume 20260506T120000Z-feat-add-native-se-work-loop
```

## Context Model

The parent chat stays small. The loop controller:

1. Parses the plan's `### U<N>.` implementation units.
2. Persists loop state under `.context/software-engineering/se-work-loop/<id>/`.
3. Creates a fresh child session for the current runnable U-ID.
4. Sends only the plan path, current unit fields, loop state path, and verification command to the child.
5. Records a compact summary and verification result to disk.
6. Advances, pauses, blocks, or completes based on the persisted state.

The plan remains a decision artifact. Do not edit the plan body to track progress.

## State Files

Loop state is local scratch state and should not be committed:

```text
.context/software-engineering/se-work-loop/<id>/
  state.json
  events.jsonl
```

`state.json` is the durable source of truth. The conversation is not durable storage.

## Runtime Probe

Run `/se-work-loop-probe` when validating a new Pi version. It checks whether the runtime exposes the child-session API needed by the loop. A full smoke test should still start a tiny sample plan to verify prompt delivery and completion observation.

## Failure Modes

- **No U-IDs found**: run `se-plan` or update the plan to use `### U1. Name` headings.
- **No verify command found**: re-run with `--verify-command "..."`.
- **Verification failed**: inspect `/se-work-loop-status <id>`, fix the blocker, then `/se-work-loop-resume <id>`.
- **Plan changed while paused**: resume reconciles U-IDs and blocks if saved units disappeared.
