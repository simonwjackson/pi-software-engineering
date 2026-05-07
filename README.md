# pi-software-engineering

Software Engineering workflows, skills, reviewer personas, and subagent support for the Pi coding agent.

## Install

```bash
pi install git:github.com/simonwjackson/pi-software-engineering
```

This package includes:

- SE workflow skills under `skills/`
- SE reviewer/research subagents under `agents/`
- selected engineering skills adapted from Matt Pocock's `skills` project
- `pi-subagents` as a bundled dependency from https://github.com/nicobailon/pi-subagents
- a small extension that exposes packaged SE agents to `pi-subagents` through managed symlinks in `~/.pi/agent/agents`
- a native SE work-loop extension for running saved plans through fresh-context implementation-unit iterations

## SE Work Loop

For long-running implementation plans, the package provides a native loop controller rather than depending on an external Ralph-style package.

```text
/se-work-loop <plan-path> [--verify-command "command"]
/se-work-loop-background <plan-path> [--verify-command "command"]
/se-work-loop-status [id]
/se-work-loop-stop <id>
/se-work-loop-resume <id>
/se-work-loop-dismiss <id>
/se-work-loop-manager
```

The loop parses `se-plan` implementation units (`U1`, `U2`, ...), runs each unit in a fresh child session, persists progress under `.context/software-engineering/se-work-loop/`, and gates advancement on file checks plus a target-project verification command. If no `--verify-command` is supplied, the extension tries to discover one from project conventions before creating durable loop state.

Use regular `se-work` for short or interactive work; use `se-work-loop` when the main chat should stay compact while multiple plan units run across fresh contexts. Use `se-work-loop-background` for the same process-local loop behavior without awaiting completion in the invoking command; it spawns child Pi runs through `nix shell nixpkgs#bun nixpkgs#nodejs --command bun x @mariozechner/pi-coding-agent` so the live TUI session is not replaced. Active/paused/blocked loops appear in a small below-editor widget and status token; `/se-work-loop-manager` can stop/resume/dismiss loops and press `l` to observe the selected loop's active child log. Override the launcher with `SE_WORK_LOOP_PI_COMMAND` when needed.

## Development

The package is intentionally broad. Add future Software Engineering workflows, review personas, research agents, and automation here rather than scattering `se-*` resources directly under `~/.pi/agent`.

Package agents are canonical in `agents/`. Package skills are canonical in `skills/`.

## Attribution

The `se-tdd`, `se-prototype`, `se-zoom-out`, `se-architecture-improvement`, and `se-challenge-plan` skills are adapted from Matt Pocock's MIT-licensed engineering skills: https://github.com/mattpocock/skills.
