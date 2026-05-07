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

## Development

The package is intentionally broad. Add future Software Engineering workflows, review personas, research agents, and automation here rather than scattering `se-*` resources directly under `~/.pi/agent`.

Package agents are canonical in `agents/`. Package skills are canonical in `skills/`.

## Attribution

The `tdd`, `prototype`, `zoom-out`, `architecture-improvement`, and `challenge-plan` skills are adapted from Matt Pocock's MIT-licensed engineering skills: https://github.com/mattpocock/skills.
