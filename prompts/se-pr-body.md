---
description: Emit a PR body skeleton with the SE conventions
argument-hint: "<pr-title-or-branch>"
---
Draft the PR body for: $@

Follow the SE PR conventions. Fill each section honestly — leave a section out entirely rather than padding it.

## Summary

One paragraph: what changed, why, and the smallest observable effect.

## Why this approach

If the change required a design decision worth surfacing in review, name the alternatives you considered and the trade-off.

## Verification

- Tests added / updated: (list with file paths)
- Manual verification: (commands run, screenshots if visual, before/after if numeric)
- Test suite: `npm test` (or the repo's equivalent) reports `<n> passed, 0 failed` on the head commit.

## Known Residuals

Findings the review surfaced that did not get fixed in this PR, with the user's explicit decision to accept and proceed. One bullet per residual:

- `[severity] title` (`file:line` or `section`) — why deferred, owner/next step.

Omit the section entirely if no residuals were accepted.

## Post-Deploy Monitoring

Anything to watch after merge: log signals, dashboard panels, error budgets, customer reports. Omit if the change is purely internal.

## Related

Issue refs, planning docs, prior PRs.

---

*Software Engineered with [pi-software-engineering](https://github.com/simonwjackson/pi-software-engineering).*
