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
- an `se-review` extension that registers the `se_review_finding` tool for structured review-finding emission
- an ambient `se-backlog` skill for durable Backlog.md-style follow-up capture

Decision records for retired surfaces live under `decisions/`.

## Power-user skills

Three skills are `/skill:name`-only and intentionally hidden from auto-invocation to keep the system prompt small:

- `/skill:se-compound-refresh` — sweep stale docs under `docs/solutions/`
- `/skill:se-session-extract` — extract a single session file (used by session-research agents)
- `/skill:se-session-inventory` — enumerate session files across platforms (used by session-research agents)

## Development

The package is intentionally broad. Add future Software Engineering workflows, review personas, research agents, and automation here rather than scattering `se-*` resources directly under `~/.pi/agent`.

Package agents are canonical in `agents/`. Package skills are canonical in `skills/`.

### Skill frontmatter conventions

Every `skills/<name>/SKILL.md` should declare:

- `name:` — the skill identifier; conventionally matches the directory name.
- `description:` — what the skill does and **when** to use it. ≤1024 chars. Specificity directly controls auto-invocation accuracy.
- `compatibility:` — comma-separated external tools the skill expects to be on PATH (e.g. `gh, npm, git`), or `none` for pure-prose skills. Lets Pi surface a missing-dependency warning instead of failing mid-run.
- `argument-hint:` — the autocomplete hint shown when the skill is invoked as `/skill:name`. Use `""` (empty string) when the skill takes no arguments — declaring it explicitly makes the no-arg case discoverable.
- `allowed-tools:` *(optional, experimental)* — space-delimited list of tool names the skill is allowed to use (e.g. `bash`, `read bash`). Apply when a skill's tool surface is narrow; prefer slightly looser declarations to avoid blocking real work.
- `disable-model-invocation: true` *(optional)* — hide from system-prompt auto-invocation while keeping `/skill:name` available. Use for power-user skills that should not be automatically reached for.

New skills should follow these conventions before merge.

## Attribution

The `se-prototype`, `se-zoom-out`, `se-architecture-improvement`, and `se-challenge-plan` skills are adapted from Matt Pocock's MIT-licensed engineering skills: https://github.com/mattpocock/skills.
