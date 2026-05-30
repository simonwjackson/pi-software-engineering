---
id: task-006
title: Add a cheap-judge model provider for SE review/judge calls
status: To Do
priority: medium
labels:
  - pi-native
  - extension
  - cost
  - review
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Add a cheap-judge model provider for SE review/judge calls

## Context

Several SE skills ("judge" calls inside `se-code-review`, `se-doc-review`, `se-optimize`, `se-product-pulse`) do work that doesn't need the user's primary expensive model: scoring rubrics, checking against a fixed template, summarising long inputs against a short prompt. Today they all run against whatever model the user is currently using, which is fine for occasional use and wasteful when an SE workflow fans out into many parallel judge calls.

Pi's `pi.registerProvider(name, cfg)` lets an extension register a runtime model provider that other code in the same session can target by name. SE skills could explicitly route judge calls to `se-judge` instead of the default model, and the user picks once (in settings) what `se-judge` actually points at.

Reference: `~/.pi/docs/se-pi-upgrades.md` item #6. Provider registration shape in `~/.pi/docs/pi-package-expert-guide.md` §4 (`pi.registerProvider`).

This is its own decision, separate from the discovery/shortcut/flag work in task-004:

- It needs a configuration shape (what does the user set, where, in what schema?).
- It introduces a billing-relevant cross-cutting concern.
- It changes how SE skills talk about model selection — the SKILL.md prose for review skills needs to mention "judge model" as a separate concept.

## Why it matters

- **Cost control** — parallel persona review fan-out (task-008) becomes affordable when each persona runs against a cheap judge instead of the user's frontier model.
- **Throughput** — cheap models are often faster; reviews that don't need deep reasoning return sooner.
- **Skill clarity** — making the judge model explicit forces each skill to decide which calls are judgement vs reasoning. That's a useful exercise.
- **User control with a sane default** — power users configure `se-judge` precisely; everyone else gets a reasonable default.

## Acceptance Criteria

- [ ] `software-engineering.ts` registers a provider named `se-judge` (final name TBD during design). The provider reads its underlying model from package config (settings.json key like `softwareEngineering.judgeModel`), with a documented fallback.
- [ ] A documented config schema and example in the README: how to point `se-judge` at a specific provider+model, what the default is, when SE skills will use it.
- [ ] At least one SE skill — recommend `se-code-review` for Tier 2 persona calls — is updated to route its judge calls through `se-judge` explicitly. The skill's prose explains that the judge model is intentionally cheaper.
- [ ] When the configured judge model is not available (no API key, provider missing), SE skills fall back to the user's primary model with a one-time notify per session, not silent fallback and not a hard fail.
- [ ] The judge provider is registered before any handler that might use it — practically, in the default-export bootstrap so it's ready by `resources_discover`.
- [ ] No regression: when the judge model is not configured, every existing SE skill behaves as it does today.

## Related

- `extensions/software-engineering.ts`
- `skills/se-code-review/SKILL.md` (pilot consumer)
- `skills/se-doc-review/SKILL.md` (later consumer)
- `skills/se-optimize/SKILL.md` (later consumer)
- `skills/se-product-pulse/SKILL.md` (later consumer)
- `README.md`
- `~/.pi/docs/se-pi-upgrades.md` (item #6)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 `registerProvider`)

## Notes

This task is bigger than it looks. The implementation is small; the design questions are the bulk:

- Does `se-judge` model selection follow the same provider/model abstraction Pi already uses, or does SE add its own?
- Do skills opt into the judge provider, or does the SE extension intercept calls and rewrite them?
- How do user preferences and per-skill overrides interact?

Recommend planning this via `se-plan` rather than `se-work`. The risk of getting the abstraction wrong is much higher than the risk of getting the implementation wrong, and once SKILL.md prose starts referencing `se-judge`, the contract is hard to walk back.
