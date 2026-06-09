---
id: 01KSRGFP0A6YR2HJ21Z0WZ5M6V
slug: inject-se-state-via-before-agent-start
title: Inject SE state into every turn via `before_agent_start`
origin: parked
legacy: task-011
status: To Do
priority: medium
labels:
  - pi-native
  - extension
  - context
  - lifecycle
created: 2026-05-29
source: user
context:
---

# Inject SE state into every turn via `before_agent_start`

## Context

Once task-001 lands and SE state (`se:phase`, `se:worktree`, `se:test-state`, `se:review-residuals`, `se:backlog`) lives in the Pi session log, the LLM still doesn't *see* it unless a skill prose-instructs it to "check current phase" or "look at the residual list". That's the pattern this package uses today, and it has two failure modes: the prose may not fire (no matching skill loaded), or it fires but the LLM does the lookup unreliably.

Pi provides a deterministic alternative: `pi.on("before_agent_start", ...)` returning `{ message, systemPrompt }` runs once per turn, before the model sees anything. The `software-engineering.ts` extension can read the latest values from the session-log substrate (helpers introduced by task-001), format a compact status block, and append it to the system prompt or inject it as a hidden context message.

The result is that every turn starts with the model knowing:

```
Current SE state:
- Phase: GREEN (slice S3, last test pass 14:23)
- Worktree: .worktrees/feat-cleanup-foo  (branch feat/cleanup-foo)
- Residuals: 2 open (1 high, 1 medium) — use /se-residuals to triage
- Active review tier: 2
```

…without any SE skill having to instruct it to check.

Reference: `~/.pi/docs/se-pi-upgrades.md` Tier 2 item #1 ("State-aware `before_agent_start` injection"). Extension-API shape and lifecycle semantics in `~/.pi/docs/pi-package-expert-guide.md` §4 (lifecycle table, `before_agent_start` returning `{ message, systemPrompt }`).

This item is intentionally narrow: surface existing state into model context. It does *not* include:

- Defining new entry types — those come from task-001 and its downstream items.
- Acting on state in handlers — that's guardrails (rebase-only, RED-block, etc.), captured later.
- UI surfaces — `/se-status` and the ambient widget are different items.

## Why it matters

- **Prose diet** — every SE skill that today says "first check the current phase / worktree / residuals" can drop those instructions. The system prompt token cost is paid once per turn, not once per skill load.
- **Reliability** — the LLM stops missing the lookup when no SE skill is active. State becomes ambient context, not a thing the model has to remember to fetch.
- **Composes with future work** — when guardrails arrive (block commit while RED, block merge with residuals), the LLM already knows the relevant state, so refusals make sense to it without extra prose.
- **Cheap to add** — once task-001's helpers exist, this handler is ~30 lines.

## Acceptance Criteria

- [ ] A `before_agent_start` handler is registered in `software-engineering.ts` that reads the SE state catalogue introduced by task-001 and formats a compact, deterministic status block.
- [ ] The status block is appended to the chained `systemPrompt` (preferred) or returned as a `message` with a clearly marked custom type — pick one approach in the implementation and document it.
- [ ] Empty state is handled gracefully: when no SE entries exist yet, the handler returns nothing (do not pollute every turn with "no SE state recorded").
- [ ] The handler is idempotent and side-effect-free. It reads from `ctx.sessionManager.getEntries()` (or the task-001 helpers) and never writes.
- [ ] The handler is bounded in size — never inject more than a small fixed budget of tokens. Long residual lists are summarized to counts; full lists are accessed via the existing tools/commands.
- [ ] Survives `withSession` / session replacement: the handler captures no `pi`/`ctx`/`sessionManager` references, only uses the fresh arguments per invocation.
- [ ] At least one SE skill's "first check current state" prose is removed in the same PR, demonstrating the prose-diet benefit and proving the injection is sufficient.
- [ ] `npm test` and `npm run check` still pass; no new on-disk state created by this change.

## Related

- `extensions/software-engineering.ts`
- task-001 (substrate + helpers)
- task-004 (sibling extension expansion: discovery, shortcuts, flags)
- `~/.pi/docs/se-pi-upgrades.md` (Tier 2 item #1)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 lifecycle, `before_agent_start`)

## Notes

Hard-blocked on task-001 — there is nothing meaningful to inject until the typed SE state substrate exists. Do not start this before task-001 ships, or it will invent its own state shape that has to be reconciled later.

Open question for implementation, not now: whether the injected block goes into `systemPrompt` (model treats it as durable context, more likely to be respected over a long turn) or as a `message` with a `customType` that a renderer can surface visually (better UX, but the model may treat it as ephemeral). Decide during implementation by comparing one short turn each way.

When deciding what to include, bias toward fields that the next likely action will need (phase, worktree, residual counts, test state). Resist the urge to dump everything — the token budget per turn is the constraint that keeps this useful.
