---
id: task-015
title: Wrap local bash to capture test-runner exit state into `se:test-state`
status: To Do
priority: high
labels:
  - pi-native
  - extension
  - bash
  - state
  - guardrails
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Wrap local bash to capture test-runner exit state into `se:test-state`

## Context

Task-001 establishes the SE session-log substrate including `se:test-state` as one of the canonical entry types. Task-012 (`se_atomic_commit`) reads `se:test-state` to refuse RED commits. Nothing in the backlog *populates* `se:test-state`. Without a producer, the RED-block is a guardrail with no signal.

Pi's `user_bash` interception via `createLocalBashOperations()` lets an extension wrap the builtin bash with pre/post hooks while preserving normal execution. The wrapper observes every shell invocation, identifies test-runner calls by command prefix, and on completion writes a typed entry:

```ts
pi.appendEntry("se:test-state", {
  exitCode: number,
  runner: "npm" | "pytest" | "mise" | "cargo" | "go" | "bun" | "rspec" | "jest" | "vitest" | "other",
  command: string,            // verbatim user command, redacted of obvious secrets
  durationMs: number,
  cwd: string,                // repo-relative
  ts: string,                 // ISO-8601
})
```

Detection is intentionally simple: command-prefix matching against a configurable runner table. Default table covers the common runners (`npm test`, `npm run test*`, `pnpm test`, `yarn test`, `bun test`, `pytest`, `python -m pytest`, `mise run test*`, `cargo test`, `go test`, `rspec`, `bin/rails test*`, `jest`, `vitest`). Repos extend the table via settings.

False positives are cheap (an extra entry the consumer can filter); false negatives are the failure mode that matters (no entry means task-012 can't enforce). The detection table errs on the side of capture.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #11 (RED-state guardrail substrate) and #15 (`createLocalBashOperations` wrapper). `user_bash` interception shapes and `createLocalBashOperations` semantics in `~/.pi/docs/pi-package-expert-guide.md` §4 ("user_bash interception").

This task is **not** the same as task-001 — that defines the entry shape and reader/writer helpers. This task is the first non-trivial producer that proves the substrate is shaped right for real-time telemetry.

This task is **not** the same as guardrail enforcement (task-012, task-013) — those *read* the state. This task *writes* it.

## Why it matters

- **Closes the RED-block loop** — task-012 is meaningless without a producer; this is that producer. Without it, "block commit while RED" is a contract with no signal.
- **General-purpose telemetry surface** — once test-state is captured, `/se-status` (task-016) shows "last test pass at 14:23"; `before_agent_start` injection (task-011) tells the model the current colour; future skills can ask "when did this last go green?" without re-running tests.
- **Tiny implementation** — wrapper + matcher table + appendEntry. ~80 lines.
- **Proves the bash-wrapping pattern** — the same `createLocalBashOperations` shape underlies several future guardrails (test-runner observation, secret redaction, custom telemetry). Landing one clean instance derisks the rest.

## Acceptance Criteria

- [ ] `software-engineering.ts` returns `{ operations: createLocalBashOperations({ before, after }) }` from a `user_bash` handler (or the documented equivalent), preserving normal execution semantics in the non-test path.
- [ ] The `before` hook records the start timestamp and matches the command against a default runner table. The `after` hook writes `pi.appendEntry("se:test-state", ...)` with the fields above whenever the matched flag is set.
- [ ] The runner table covers the default set listed in Context. Repos extend it via a `softwareEngineering.testRunners` array in settings (verbatim prefixes; documented in README).
- [ ] Commands are recorded verbatim except for obvious secret tokens — minimum filter: redact long base64-looking values (`[A-Za-z0-9+/]{32,}`) and anything matching `(?i)(token|key|secret|password|bearer)=\S+`. Document the filter and let users extend it via settings.
- [ ] When `pi.appendEntry` is not available (Pi runtime old, extension running in print mode), the wrapper logs a one-time notice and skips the entry — it does not break bash.
- [ ] When the same test command runs multiple times in a session, every run appends a new entry. Consumers read the latest by sort order; this writer does not deduplicate.
- [ ] The wrapper is side-effect-free in the non-test path — non-matching commands flow through `createLocalBashOperations` without extra observation.
- [ ] Survives `withSession` / session replacement: handler captures no `pi`/`ctx` references across awaits; pulls them fresh on each invocation.
- [ ] README documents the new behavior, the default runner table, the settings keys, and the redaction filter.
- [ ] Tests cover: matching prefix → entry written with correct fields; non-matching prefix → no entry, normal exit; long-running test exit reflected in `durationMs`; bash failure surfaces normally even if entry write fails (resilience over telemetry).
- [ ] `npm test` and `npm run check` still pass.

## Related

- `extensions/software-engineering.ts`
- task-001 (defines `se:test-state` entry shape and writer helpers)
- task-012 (consumer: `se_atomic_commit` reads `se:test-state` for RED-block)
- task-013 (sibling guardrail pattern; same substrate, different entry type)
- task-016 (consumer: `/se-status` surfaces last test result)
- task-011 (consumer: `before_agent_start` injects last test colour)
- `~/.pi/docs/se-pi-upgrades.md` (items #11, #15)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 user_bash interception)

## Notes

Hard-blocked on task-001 for the entry shape and the writer helper. If task-001 ships a typed `writeTestState({...})` helper, this task uses it rather than calling `pi.appendEntry` directly — keeps the typed-substrate contract in one place.

Detection is the only design choice with teeth. Prefix matching is dumb but predictable; a smarter detector (parsing AST, sniffing package.json scripts, watching child process names) is appealing and almost always wrong because false negatives are the real failure mode. Start dumb; extend the table per repo if needed.

Open question for implementation, not now: should non-test-related commands also produce entries (e.g. `se:bash-run` for arbitrary observability)? Probably no — the substrate is for *named*, *consumed* state, not a generic audit log. If audit becomes a real need, capture it as its own item with a different entry type.

Resist the urge to extend this wrapper with policy enforcement. The wrapper *observes*. Refusal lives in `tool_call` handlers (task-012, task-013), where the substrate it produces is already available. Mixing observation and refusal in one place couples them in ways that make later changes harder.
