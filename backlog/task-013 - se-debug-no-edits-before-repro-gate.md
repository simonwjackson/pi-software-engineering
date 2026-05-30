---
id: task-013
title: Enforce `se-debug`'s "no edits before diagnosis" via `tool_call` gate
status: To Do
priority: medium
labels:
  - pi-native
  - guardrails
  - lifecycle
  - se-debug
created: 2026-05-29
source: user
context:
  cwd: .
  branch: main
  commit: b69c9f7
  repo: simonwjackson/pi-software-engineering
  invoked_by: user
---

# Enforce `se-debug`'s "no edits before diagnosis" via `tool_call` gate

## Context

`se-debug` codifies a strong, repeatedly-violated principle: **capture a reproduction before editing code**. Today the principle is prose. The LLM reads it when `se-debug` is the active skill, often skims it, and frequently goes straight to `edit`/`write` based on a guess at the cause. The harness has no way to refuse the edit, so the discipline lives entirely on whether the model remembers to follow it.

Pi can lift this from prose to a deterministic gate. A `tool_call` handler in `software-engineering.ts` inspects incoming `edit` / `write` (and possibly `multi_edit`) calls. If the active session has no `se:repro` entry recorded (set via `pi.appendEntry("se:repro", { symptom, steps, observed, expected })`), the handler returns `{ block: true, reason: "se-debug: capture a repro before editing. Run /se-debug-repro or call the `se_capture_repro` tool." }`.

The matching capture path:

- The prompt template from task-007 (`/se-debug-repro <symptom>`) becomes the user-facing way to dictate a repro and trigger the appendEntry.
- A small `se_capture_repro` tool (registered alongside the gate) is the model-facing way: TypeBox-validated repro fields, single `appendEntry` write, returns confirmation.
- Either path satisfies the gate.

Bypass exists for legitimate cases (typo fixes, rename refactors, docs-only edits where there is nothing to reproduce). Two shapes to consider:

- A `--se-allow-no-repro` flag (task-004) opens edits for the session.
- A `softwareEngineering.requireRepro: true|false` setting toggles the gate at the package level (default: enforced only when `se-debug` is the active skill, off otherwise).

Reference: `~/.pi/docs/se-pi-upgrades.md` Tier 3 item #1 ("se-debug: no-edits-before-repro gate"). Tool-call interception semantics and `block` return shape in `~/.pi/docs/pi-package-expert-guide.md` §4 (tool_call event, lifecycle table).

This composes with — but is independent of — the broader guardrail set:

- task-012 enforces atomic-commit invariants on `git commit` calls.
- This task enforces repro-before-edit on `edit`/`write` calls.
- Both use the same substrate (`pi.appendEntry` from task-001) and the same refusal pattern.

## Why it matters

- **Retires the most-violated SE principle** — "diagnose before fixing" stops being a thing the model has to remember and starts being a thing the harness enforces.
- **Compounds with task-007** — the `/se-debug-repro` prompt template is the natural unblock path. The two land as a pair: the gate refuses, the template fills the gap, the user moves on.
- **Token diet for `se-debug`** — once the gate exists, a meaningful chunk of `se-debug` SKILL.md prose ("first reproduce", "do not edit before…") collapses to "the harness will refuse edits until a repro is recorded".
- **Visible failure mode by design** — the model sees a structured refusal with the unblock command. That feedback teaches the right shape faster than skill prose ever did.
- **Cheap implementation** — one `tool_call` handler, one small tool, one entry-shape decision. Fits in a single PR with task-007 if scheduled together.

## Acceptance Criteria

- [ ] A `tool_call` handler in `software-engineering.ts` inspects calls to `edit`, `write`, and `multi_edit`. When the gate condition is active (see scope below) and no `se:repro` entry exists in the session, the handler returns `{ block: true, reason: "…" }` with a message that names both the `se_capture_repro` tool and the `/se-debug-repro` prompt template.
- [ ] A `se_capture_repro` tool is registered with TypeBox schema covering: `symptom` (string, required), `reproduction_steps` (string, required, multiline), `observed` (string, required), `expected` (string, required), `environment` (optional string), `references` (optional string array of repo-relative paths). `execute` validates, calls `pi.appendEntry("se:repro", {...})`, and returns confirmation.
- [ ] Gate scope is configurable. Default: gate is active only when `se-debug` is the most recently invoked skill in the session (read from session log) **or** when `softwareEngineering.requireRepro` is `true` in settings. Document both modes in the README.
- [ ] Bypass paths exist and are documented:
  - `softwareEngineering.requireRepro: false` (default for repos that don't want the gate at all).
  - A per-session flag (registered via task-004 if available, otherwise via a one-shot `se_repro_bypass` tool) that disables the gate until the next session.
  - Edits where the operation is clearly non-code (e.g. writes inside `docs/`, `*.md`) are not gated. The non-code path list is configurable.
- [ ] The handler is side-effect-free in the non-blocked path: when allowed, it does not mutate `event.input`, does not write to the session log, does not call out to anything.
- [ ] The handler survives `withSession` / session replacement: no captured `pi`/`ctx`/`sessionManager` references.
- [ ] `se-debug` SKILL.md is updated in the same PR: the "no edits before diagnosis" section shrinks to "the harness will refuse edits to non-doc paths until you record a repro; use `/se-debug-repro` or the `se_capture_repro` tool".
- [ ] Tests cover: gate active with no repro → blocked; gate active with repro → allowed; gate inactive → allowed; doc-path write with gate active → allowed; `se_capture_repro` writes an entry that the gate then accepts.
- [ ] `npm test` and `npm run check` still pass.

## Related

- `extensions/software-engineering.ts` (handler + tool registration)
- `skills/se-debug/SKILL.md`
- task-001 (`pi.appendEntry` substrate; defines `se:repro` entry shape)
- task-007 (`/se-debug-repro` prompt template; user-facing capture path)
- task-004 (`registerFlag` for the `--se-allow-no-repro` bypass)
- task-012 (sibling guardrail on `git commit`; same substrate, same refusal pattern)
- `~/.pi/docs/se-pi-upgrades.md` (Tier 3 item #1)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 tool_call event, `block`, `pi.appendEntry`)

## Notes

Hard-blocked on task-001 for the substrate. The handler needs a typed reader for `se:repro` entries, and the `se_capture_repro` tool needs the typed writer. Do not ship a stubbed version against ad-hoc JSON entries — the substrate is meant to centralize entry shapes, and bypassing it here invites drift.

Order with task-007: ship the prompt template first (lower risk, zero blocking), then the gate. Users get the convenience without the friction during the changeover, and when the gate lands they already have the unblock path under their fingers.

Open question for implementation, not now: should the gate respect a "scratch session" mode where the user has explicitly said "I'm hacking, not debugging"? Probably yes via the session flag, but the boundary between scratch and real debugging is fuzzy. Default to enforcement; let users opt out.

If `multi_edit` becomes a builtin first-class tool name in a future Pi release, ensure the handler list updates with it. Track that as a follow-up rather than over-generalising the matcher now.
