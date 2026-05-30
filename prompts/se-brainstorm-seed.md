---
description: Kick off /se-brainstorm with a structured seed instead of a cold prompt
argument-hint: "<topic>"
---
Run `/se-brainstorm` on: $@

Treat the topic as a seed, not the answer. Before you generate ideas:

1. Restate the topic in your own words. Surface ambiguities you'd like to resolve before brainstorming.
2. Identify the primary user / stakeholder and the observable outcome being optimised for.
3. Name 2-3 existing approaches in this codebase (or comparable codebases) that are adjacent to the topic — what do they get right, what falls short for this need?

Then generate 5-8 candidate directions. For each:

- One-sentence summary.
- Strongest argument for.
- Most likely failure mode.
- A concrete next probe (read X, sketch Y, write a 10-line spike) that would shift your confidence one way or the other.

Close with: "Which direction do you want to pull on next?"
