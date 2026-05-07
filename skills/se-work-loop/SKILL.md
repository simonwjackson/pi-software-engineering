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
/se-work-loop-background <plan-path> [--verify-command "command"]
/se-work-loop-status [id]
/se-work-loop-stop <id>
/se-work-loop-resume <id>
/se-work-loop-probe
```

`/se-work-loop` starts an attached loop and awaits completion in the invoking command. `/se-work-loop-background` starts the same process-local loop without awaiting completion, then returns control so the user can inspect/stop it later. The other commands are intentionally separate slash commands so they are discoverable and do not hide behavior behind opaque subcommands.

## Verification Model

The loop has two distinct gates:

- **Per-unit file gate** — after each unit's child session ends, the controller checks the unit's declared `Files:` paths exist in the working tree. This is a cheap, deterministic per-iteration health check. If any expected file is missing, the loop blocks on that unit.
- **End-of-loop completion gate** — after the last dependency-ready unit completes, the controller runs the loop-level verify command once. If it passes, the loop is `complete`; if it fails, the loop is `blocked`.

The loop-level verify command does **not** run after every unit. That avoids a common pitfall where a completion-shape command (e.g. `grep -q 'U2 complete' tmp/file`) would block U1 simply because U2 has not run yet.

## Verification Command

Every loop needs a target-project verification command before durable state is created. The loop resolves it in this order, stopping at the first hit:

1. `--verify-command "<command>"` flag on the slash command.
2. `verify_command:` (or nested `loop.verify_command:`) in the plan's YAML frontmatter.
3. `**Verification command:** <command>` inside an `## Execution Handoff` section in the plan body.
4. Auto-discovery from `package.json` scripts, `mise.toml`, `AGENTS.md`, or `README.md`.
5. If none match, the loop refuses to create durable state and prints the resolution order so the user can fix it once.

The goal: plans authored for `/se-work-loop` should already carry their verify command so users do not have to type it.

Example plan frontmatter:

```yaml
---
title: feat: example
status: active
verify_command: "node --test tests/*.test.mjs"
---
```

Or in the plan body:

```md
## Execution Handoff

**Recommended loop command:** `/se-work-loop docs/plans/example.md`

**Verification command:** `node --test tests/*.test.mjs`
```

Examples:

```text
/se-work-loop docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md --verify-command "node --test tests/se-loop-*.test.mjs"
/se-work-loop-background docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md
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
5. Records a compact summary and per-unit file check result to disk.
6. Runs the loop-level verify command once after all units complete.
7. Advances, pauses, blocks, or completes based on the persisted state.

Background MVP note: `/se-work-loop-background` is process-local. It spawns each child Pi run with `nix shell nixpkgs#bun nixpkgs#nodejs --command bun x @mariozechner/pi-coding-agent` instead of `ctx.newSession()`, so it should not replace the live foreground TUI session. Override the launcher with `SE_WORK_LOOP_PI_COMMAND` if the local environment needs a different Pi invocation. It does not yet spawn a daemon runner that survives Pi process exit/restart.

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
