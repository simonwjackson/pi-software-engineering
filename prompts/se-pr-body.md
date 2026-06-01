---
description: Compose and publish a PR body via the SE contract
argument-hint: "<pr-title-or-branch>"
---
Compose the PR body for: $@

There is one source of truth for PR bodies: `skills/se-work/references/pr-description-writing.md`. Read it and follow Step Pre-A through Step H. Do not use an alternative section layout — the structure below is enforced.

## How to publish

Publish with the `se_pr_publish` tool, never a raw `gh pr create` / `gh pr edit --body` (the `se-pr-gate` guard blocks those). The tool refuses a body that violates the contract and computes diff anchors itself, so:

- Write every file reference as a `{{file:<path>}}` placeholder. Never hand-compute a sha256 anchor.
- Pass the honest `risk` level (`low` / `low-medium` / `medium` / `high`). `medium` and `high` require a `## Post-Deploy Monitoring` section.
- Set `trivial: true` only for typo / dep-bump / one-line-config PRs.

## Required shape (from the guide)

Assemble in this order (skip a section only when the guide says it does not apply):

1. **Risk line first.** `**Risk: <level>.** <one sentence on what to weigh>` — the literal first line for any non-trivial PR.
2. `---` thematic break, then `##` sections with `---` between major sections.
3. `## Context` (before-state), `## What this changes` (after-state, lead with value).
4. Mechanism / consumer-impact / scope-hold sections as the change warrants. Link load-bearing files with `{{file:<path>}}`.
5. `## Post-Deploy Monitoring & Validation` for medium/high risk: validation window, healthy signals, rollback triggers.
6. Optional folded `<details>` sections (decision timeline, review fixes) for medium+ risk.
7. Software Engineering badge block (the tool requires it):

```markdown
---

[![Software Engineering](https://img.shields.io/badge/Built_with-Software_Engineering-6366f1)](https://github.com/simonwjackson/pi-software-engineering)
![Pi](https://img.shields.io/badge/Pi-5B21B6)
```

Fill each section honestly — leave a section out entirely rather than padding it. Use the self-skeptical voice from the guide: mark carried-forward verification claims as carried-forward, and name design choices as choices.
