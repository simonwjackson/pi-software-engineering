---
id: task-002
title: Sweep skill frontmatter — compatibility, allowed-tools, disable-model-invocation, argument-hint
status: To Do
priority: medium
labels:
  - pi-native
  - skills
  - frontmatter
  - cleanup
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Sweep skill frontmatter — compatibility, allowed-tools, disable-model-invocation, argument-hint

## Context

Pi's skill frontmatter has four optional fields the `/se-*` skills don't use today, and each one would meaningfully improve how the suite behaves inside Pi:

- `compatibility:` — declares external dependencies (e.g. `gh`, `npm`, `mise`, Python, Bun) so Pi can surface a missing-dependency warning instead of letting the skill fail mid-run.
- `allowed-tools:` — scopes a skill's tool surface (e.g. `se-clean-gone-branches: bash` only). Tighter footprint, fewer accidents, less prompt-injection blast radius.
- `disable-model-invocation: true` — hides a skill from the system-prompt auto-invocation surface while still allowing manual `/skill:name`. Power-user-only skills like `se-compound-refresh`, `se-session-extract`, and `se-session-inventory` currently waste system-prompt tokens on every session.
- `argument-hint:` — every skill auto-registers as `/skill:name`, but autocomplete is useless without an argument-hint. Today most SE skills have none.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #7, #8, #9, #30. Frontmatter rules and field semantics in `~/.pi/docs/pi-package-expert-guide.md` §5.

This is a single coherent change: one PR sweeping every SKILL.md, no behavioural changes, easy to review.

## Why it matters

- **Smaller system prompt** — dropping ~3KB of auto-invocation noise for power-user skills directly buys token budget back for every session.
- **Failing fast on missing deps** — today a skill that needs `gh` will start, partially run, then fail somewhere in the middle. `compatibility:` lets Pi tell the user up-front.
- **Discoverability** — `argument-hint` makes `/skill:name` autocomplete a real entry point, not a guess-the-args puzzle.
- **Defence in depth** — `allowed-tools:` is cheap to add and limits the worst case when a skill's prose gets manipulated.
- **Zero-risk change** — all four fields are warn-on-violation, not fail-on-violation. The sweep can land incrementally without breaking anything.

## Acceptance Criteria

- [ ] Every SKILL.md under `skills/` declares `compatibility:` listing the real external tools it depends on (or explicitly states "none" if pure prose).
- [ ] Every SKILL.md whose tool surface is narrow declares `allowed-tools:` (initial pass at minimum: `se-clean-gone-branches`, `se-session-extract`, `se-session-inventory`, `se-resolve-pr-feedback`, `se-clean-gone-branches`).
- [ ] `se-compound-refresh`, `se-session-extract`, and `se-session-inventory` declare `disable-model-invocation: true` and the README documents that they are `/skill:name`-only.
- [ ] Every SKILL.md auto-registered as `/skill:name` defines `argument-hint:` describing the expected invocation shape. Skills that take no arguments declare `argument-hint: ""` to make the no-arg case explicit.
- [ ] A short note added to the README and to `docs/` (or wherever the contributor guide lives) explains the frontmatter conventions so new skills follow them.
- [ ] No behavioural regression — running each touched skill at least once after the sweep produces the same output as before.

## Related

- `skills/**/SKILL.md`
- `~/.pi/docs/se-pi-upgrades.md` (items #7, #8, #9, #30)
- `~/.pi/docs/pi-package-expert-guide.md` (§5)
- `README.md`

## Notes

This task is intentionally a sweep, not a per-skill audit. If during the sweep a skill clearly needs deeper rework (e.g. its description is the actual reason it never auto-invokes), capture that separately rather than expanding this task.

`allowed-tools:` is marked experimental in the Pi docs — the field is honoured, but the exact semantics may evolve. Track this as a known caveat in the contributor note, and prefer slightly looser declarations over false-narrow ones.
