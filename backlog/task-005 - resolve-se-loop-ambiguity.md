---
id: task-005
title: Resolve the `se-loop` extension/skill ambiguity
status: To Do
priority: medium
labels:
  - cleanup
  - extension
  - decision
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Resolve the `se-loop` extension/skill ambiguity

## Context

The package currently ships the `se-loop` extension (`extensions/se-loop/`) which registers a family of slash commands — `/se-work-loop`, `/se-work-loop-background`, `/se-work-loop-status`, `/se-work-loop-stop`, `/se-work-loop-resume`, `/se-work-loop-dismiss`, `/se-work-loop-manager`, `/se-work-loop-probe` — and the corresponding `skills/se-work-loop/SKILL.md` describes them to the LLM.

But `skills/.ignore` excludes the `se-work-loop` skill from auto-discovery:

```
# Disabled locally: do not expose the native SE work loop skill.
se-work-loop/
```

The result is contradictory: the extension and its commands are alive and registered on every session, but the skill that documents them to the LLM is hidden. Users get the commands but the LLM has no idea they exist; the LLM might recommend `/se-work-loop` from its training data and find that it works, or it might never reach for it.

Reference: `~/.pi/docs/se-pi-upgrades.md` item #45.

This needs one of three deliberate decisions, not the current accidental middle ground:

1. **Commit to the loop** — remove `skills/.ignore`, ship the skill, document the commands in the README, and treat `se-work-loop` as a first-class SE feature.
2. **Remove the loop** — delete the `extensions/se-loop/` tree, the commands, the skill, the `docs/examples/se-work-loop-sample-plan.md` reference, and the tests. Recover ~70KB of package surface area.
3. **Mark it experimental** — keep both, but rename the skill `se-work-loop-experimental`, set `disable-model-invocation: true`, document the experimental status in the README, and put the decision on a calendar (e.g. revisit in 90 days).

The user already shows ambivalence: the `pi.extensions` block in `package.json` still references `./extensions/se-loop/index.ts` indirectly through the `software-engineering.ts` extension's package, but recent edits to `package.json` removed an unrelated se-loop extension path. The local `.ignore` is the smoking gun that says "I don't want this surfaced but I haven't ripped it out."

## Why it matters

- **Decision hygiene** — the middle ground actively misleads users and the LLM about what the package supports.
- **Token budget** — if the loop is hidden from the LLM, the extension still loads ~50KB of TypeScript per session for no reason.
- **README accuracy** — current README docs `/se-work-loop` as a real feature. If `.ignore` hides it, the README lies.
- **Maintenance cost** — the loop has its own tests, sample plans, and state-store; carrying it half-alive doubles the maintenance for no benefit.

## Acceptance Criteria

- [ ] An explicit decision is recorded — commit to it, remove it, or mark experimental. The decision lives in the README or `docs/decisions/`, not just in commit messages.
- [ ] Implementation matches the decision:
  - **If commit**: `skills/.ignore` removed (or just the `se-work-loop/` line); SKILL.md polished; README's `/se-work-loop` section updated to current state.
  - **If remove**: `extensions/se-loop/` deleted, `skills/se-work-loop/` deleted, `docs/examples/se-work-loop-sample-plan.md` deleted, `docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md` archived (move to `docs/plans/archived/` or delete with a note in the decision doc), `tests/` cleaned up (loop tests removed), `README.md` section removed, `package.json` files entries pruned.
  - **If experimental**: `skills/se-work-loop/` renamed to `skills/se-work-loop-experimental/`, frontmatter sets `disable-model-invocation: true`, README clearly marks the feature experimental with a revisit date.
- [ ] `npm test` and `npm run check` pass cleanly without lingering references to the deleted/renamed parts.
- [ ] No dangling references in other skills (`skills/se-work/`, `skills/se-plan/`) to `/se-work-loop` if it was removed.

## Related

- `extensions/se-loop/`
- `skills/se-work-loop/SKILL.md`
- `skills/.ignore`
- `docs/examples/se-work-loop-sample-plan.md`
- `docs/plans/2026-05-06-001-feat-native-se-work-loop-plan.md`
- `tests/` (loop-related tests)
- `README.md`
- `package.json` (`files`, `pi.extensions`)
- `~/.pi/docs/se-pi-upgrades.md` (item #45)

## Notes

Recommend running this through `se-brainstorm` (or a short `se-plan`) rather than `se-work` — the choice between commit/remove/experimental is a decision artifact more than an implementation task, and the right answer depends on whether the user has ever actually used `/se-work-loop` in anger.

If the decision is "remove", consider whether the underlying ideas (parsing plans into implementation units, durable verify state, fresh-context iteration) should be re-captured as a backlog item for a smaller, simpler future implementation. Don't lose the design knowledge with the code.
