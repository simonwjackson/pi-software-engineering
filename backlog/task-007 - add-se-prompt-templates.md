---
id: task-007
title: Add SE prompt templates for the common entry points
status: To Do
priority: low
labels:
  - pi-native
  - prompts
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

# Add SE prompt templates for the common entry points

## Context

Pi's prompt-template resource (`prompts/` dir, `pi.prompts` in `package.json`) is currently empty for this package. The only prompts in the tarball come from `node_modules/pi-subagents/prompts`. Prompt templates are pure markdown with `$1`/`$@`/`${@:N}` argument expansion — no extension code, no schema, no runtime cost beyond file load.

Several SE skills have a "common starting shape" the user types out by hand or pastes from memory every time. Templating those buys ergonomic improvement for zero implementation risk.

Candidates from `~/.pi/docs/se-pi-upgrades.md` items #31–#35:

- `/se-plan-brief <topic>` — emit a planning brief skeleton from `$@` so the user can fill in and hand to `se-plan`.
- `/se-brainstorm-seed <topic>` — kick off `se-brainstorm` with a structured seed instead of a cold prompt.
- `/se-debug-repro <symptom>` — prompt the LLM to write a repro before fixing (reinforces `se-debug`'s "no edits before diagnosis" principle).
- `/se-pr-body <pr-title-or-branch>` — emit a PR body skeleton with the SE conventions (Known Residuals, Post-Deploy Monitoring, Software Engineered badge).
- `/se-residual-ticket <finding>` — turn a residual finding into a tracker-ready issue body with the SE finding format.

Pi's prompt-template discovery is non-recursive inside `prompts/`, so they all sit flat in `prompts/`.

## Why it matters

- **Zero implementation risk** — pure markdown, no JS, no schemas, no extension hooks.
- **Real shortcut for repetitive starting shapes** — every PR description that wants the SE conventions gets them right.
- **Reinforces SE principles by example** — `/se-debug-repro` showing the repro-first shape is more durable than skill prose alone.
- **Free discoverability** — Pi's autocomplete surfaces `/se-*` prompts alongside skills automatically.
- **Easy to delete** — if a template doesn't get used, removing it is a one-file change.

## Acceptance Criteria

- [ ] `prompts/` directory added at the package root with at least the five templates above. Each `.md` file has frontmatter with `description:` and `argument-hint:` per Pi conventions.
- [ ] `pi.prompts` in `package.json` includes `./prompts` so the templates ship in the npm tarball.
- [ ] Each template uses `$@`, `$1`, etc. correctly and degrades gracefully when invoked with no arguments (the template body still makes sense as a generic prompt).
- [ ] Templates produce skill-compatible prompts — e.g. `/se-plan-brief foo` produces something `se-plan` would accept as its initial brief, not a freeform paragraph the LLM has to reshape.
- [ ] README documents the templates briefly: invocation form, expected arguments, which downstream skill they pair with.
- [ ] `npm run check` shows the new prompt files in the tarball, and `pi list` reflects them after a local install.

## Related

- `prompts/` (new)
- `package.json` (`pi.prompts`)
- `README.md`
- `skills/se-plan/SKILL.md` (downstream of `/se-plan-brief`)
- `skills/se-brainstorm/SKILL.md` (downstream of `/se-brainstorm-seed`)
- `skills/se-debug/SKILL.md` (downstream of `/se-debug-repro`)
- `skills/se-work/references/pr-description-writing.md` (input shape for `/se-pr-body`)
- `skills/se-code-review/references/` (input shape for `/se-residual-ticket`)
- `~/.pi/docs/se-pi-upgrades.md` (items #31–#35)
- `~/.pi/docs/pi-package-expert-guide.md` (§6 Prompt Templates)

## Notes

Don't over-design these. Each template should be a minimal skeleton, not a wizard. If a template grows past ~30 lines, it's probably trying to be a skill — promote it to one instead of bloating the template.

If during implementation the user hasn't actually wanted any of these in practice, ship only the ones that match real friction. Five was the suggested set, not the required set.
