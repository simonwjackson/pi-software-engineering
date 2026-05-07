---
name: se-challenge-plan
description: Stress-test an implementation plan or proposed approach against project context, domain language, existing decisions, risks, sequencing, and test strategy. Use when the user wants to challenge a plan, sharpen an approach before implementation, or identify hidden assumptions before work starts.
---

# Challenge Plan

Stress-test an existing plan or proposed approach before implementation. This complements `se-plan` and `se-doc-review`: it does not create a plan from scratch and it does not run a full multi-persona document review. It asks focused questions that expose hidden assumptions, weak sequencing, missing tests, migration risks, and undocumented decisions.

## Operating rules

- Ask one question at a time and wait for the user's answer.
- For each question, provide your recommended answer or likely trade-off.
- If a question can be answered by reading the codebase or project docs, investigate instead of asking.
- Use the project's established domain language. Do not invent synonyms for known concepts.
- Challenge assumptions without adopting a hostile tone.
- If docs need updating, propose the update and the likely project-specific location. Do not silently write documentation unless requested.

## Context to inspect

Before questioning, read enough context to avoid asking blind questions:

- the plan or proposed approach being challenged
- project instruction files and README files that govern the affected area
- relevant requirements, feature briefs, plans, architecture docs, and decision records in whatever shape this project uses
- relevant `docs/solutions/` entries when present
- nearby implementation and tests for the area being changed

Do not require a fixed glossary file or fixed decision-record directory. Respect the project's existing documentation shape.

## Challenge areas

Probe the plan across these dimensions:

1. **Assumptions** — What must be true for this plan to work? Which assumptions are unverified?
2. **Scope boundaries** — What is explicitly out of scope? What adjacent work is likely to creep in?
3. **Sequencing** — Does the order reduce risk? Are prerequisites, migrations, or compatibility windows missing?
4. **Public contracts** — Which user-facing, API-facing, CLI-facing, or agent-facing contracts change? Are tests aimed at behavior through those contracts?
5. **Failure modes** — What happens on partial failure, retries, cancellation, stale state, or external-service failure?
6. **Migration risk** — Can old and new behavior coexist? Is the plan intentionally big-bang? What rollback exists?
7. **Shared language** — Are names aligned with the project's domain terms? Are fuzzy terms hiding multiple concepts?
8. **Decision rationale** — Which non-obvious trade-offs need durable documentation so future maintainers do not re-litigate them?
9. **Verification** — Are the test commands and manual checks sufficient for the behavior and risk profile?

## Conversation shape

Start with a concise readback:

- what the plan is trying to accomplish
- the most important constraints you found
- the highest-risk assumption or gap

Then ask the single highest-leverage question first. Continue only after the user answers.

When an answer creates a decision, restate the decision and note whether it affects scope, sequencing, tests, migration, or documentation.
