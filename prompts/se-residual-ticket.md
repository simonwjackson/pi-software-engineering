---
description: Turn a residual review finding into a tracker-ready issue body
argument-hint: "<finding>"
---
Turn the following residual finding into a tracker-ready issue body: $@

Use the SE finding format. Fill in concretely from the review context; do not invent severity or autofix routing.

## Summary

One sentence: what is wrong, what breaks if not addressed.

## Severity

`P0` | `P1` | `P2` | `P3` (use the same scale as the review that surfaced this).

## Location

- File: `<repo-relative-path>:<line>` (for code findings)
- Section: `<doc-section>` (for doc findings)

## Why it matters

Concrete failure mode. Not "should be cleaner" — name the user-visible or runtime cost of leaving this unaddressed.

## Reproduction or evidence

Code snippet, document quote, or pattern description that proves the finding. Should be enough that a reviewer can verify without re-running the review.

## Suggested fix

The minimal concrete change that addresses this. Mark `safe_auto` / `gated_auto` / `manual` as in the review.

## Acceptance criteria

- [ ] Observable condition that proves the fix is complete.
- [ ] Test, doc, or verification expectation.

## Source

Which review run / persona / SE session surfaced this. Helps triage if multiple reviews disagree.
