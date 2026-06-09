---
id: 01KSRGFP0DK5109FZ5AFMRNGV0
slug: guided-se-plan-command
title: Replace `se-plan` prose runbook with a guided `/se-plan` command
origin: parked
legacy: task-014
status: Dropped
priority: medium
labels:
  - pi-native
  - commands
  - ux
  - se-plan
  - lifecycle
created: 2026-05-29
source: user
context:
---

# Replace `se-plan` prose runbook with a guided `/se-plan` command

## Dropped

Dropped on 2026-05-30 at user request. The native `/se-plan` command conflicted with the desired surface: planning should remain the `se-plan` skill (`/skill:se-plan`) rather than a separate non-skill command. The implementation was removed from `extensions/se-plan/`, `extensions/software-engineering.ts`, README/docs, and tests; `skills/se-plan/SKILL.md` remains intact.

## Context

`skills/se-plan/SKILL.md` is the largest single file in the package at ~66KB. Most of it is a prose-encoded interview the model is supposed to run with the user: scope, constraints, decisions, sequencing, test strategy, risk, rollback. The skill is well-shaped, but every session that uses it pays the system-prompt cost of loading a description that points at a 66KB body the model then has to re-read each time it runs the interview.

Pi can collapse this into a deterministic command. `pi.registerCommand("se-plan", ...)` opens a guided session via `ctx.ui.custom` (or a sequence of `ctx.ui.input` / `ctx.ui.select` calls in the simpler shape) that walks the user through the same interview steps. Each answer is:

1. Persisted to `pi.appendEntry("se:plan-draft", { step, answer, timestamp })` so the draft survives `/compact`, `/fork`, and reloads.
2. Available to a subsequent `pi.sendUserMessage` that hands the structured brief to the LLM for synthesis (still inside the existing skill's synthesis prose — this command replaces the *interview*, not the synthesis).

At the end of the flow, the command writes the structured plan file to the project (`docs/plans/<slug>.md` or whatever the repo's existing convention is) and keeps a session-log copy. The plan stops being a thing the LLM has to remember to write down — the command writes it.

Reference: `~/.pi/docs/se-pi-upgrades.md` Tier 3 item #4 ("`/se-plan` as a guided session command"). `ctx.ui.custom`, `ctx.ui.input`, `ctx.ui.select` shapes and `pi.sendUserMessage` semantics in `~/.pi/docs/pi-package-expert-guide.md` §4.

This replaces the dropped one-shot planning prompt-template idea from task-007 with an interactive interview that captures structured answers, persists them, and writes a file. The command is the path for users who want to be walked through a plan brief rather than expanding a one-shot skeleton.

This is also **not** the same as the subagent-command wrapping in task-008. That work makes review fan-out deterministic by wrapping `pi-subagents` calls. This work makes the planning interview deterministic by replacing the interview with a UI flow.

## Why it matters

- **Largest single prose retirement in the suite** — `se-plan` SKILL.md is the biggest skill file; the guided command lets it shrink to "the interview is the command; the synthesis lives here". Big system-prompt diet.
- **Plan state becomes portable** — today a half-finished plan is lost when the session compacts or forks. With `pi.appendEntry` persistence, you can pick up an in-progress plan in a fresh session by replaying entries.
- **Concrete entry point** — "ask the LLM to plan" today; "run `/se-plan`" tomorrow. Same with autocomplete, no skill-priming required.
- **First non-trivial consumer of `ctx.ui.custom`** — proves out the interactive overlay pattern for the rest of the suite (`/se-residuals` triage, `/se-brainstorm` seed, etc.).
- **Composes with state injection** — task-011 will inject "active plan draft: step 4 of 7" into every turn once both land. The model sees plan progress without anyone telling it to look.

## Acceptance Criteria

- [ ] `/se-plan` registered as a slash command with `description:` and `argument-hint: "[<slug>]"`. Invoking with no args starts a fresh plan; invoking with a slug resumes an existing draft from the session log.
- [ ] The interactive flow walks the user through at least: target outcome, scope (in/out), constraints, key decisions, sequencing, test strategy, risk, rollback. Step order and labels mirror the structure already present in `skills/se-plan/SKILL.md`.
- [ ] Each step persists its answer via `pi.appendEntry("se:plan-draft", { slug, step, answer })` immediately on submit. Backing out and restarting reads existing entries for the slug and pre-fills.
- [ ] Two implementation shapes are evaluated during design — `ctx.ui.custom` overlay vs sequence of `ctx.ui.input`/`select` prompts — and the chosen shape is documented in the PR. Prefer the simpler shape unless the overlay buys clear UX wins.
- [ ] On flow completion, the command writes a structured plan file to the project under the repo's plan convention (detect `docs/plans/` first; create if missing). Filename is `<YYYY-MM-DD>-<slug>.md`. The file's frontmatter records the slug, status, the command that created it, and pointers back to the session log.
- [ ] The command graceful-exits at any step (Esc cancels, no partial file written). On graceful exit, the draft entries remain in the session log so the user can resume.
- [ ] The command survives `withSession` / session replacement: it uses fresh `ctx` per handler invocation, captures no `pi`/`ctx`/`sessionManager` references across awaits where session replacement is possible.
- [ ] `skills/se-plan/SKILL.md` is updated in the same PR: the interview prose shrinks to "use `/se-plan`; this skill's body documents the synthesis logic that runs *after* the interview". The synthesis section stays intact.
- [ ] `npm test` and `npm run check` still pass. New tests cover: fresh run writes a file; resumed run picks up where left off; graceful exit leaves no partial file; existing plan detection respects the repo's convention.

## Related

- `extensions/se-commands/` (new) or growth in `software-engineering.ts`
- `skills/se-plan/SKILL.md`
- `skills/se-plan/references/universal-planning.md` (input source for the interview steps)
- task-001 (`pi.appendEntry` substrate, `se:plan-draft` entry shape)
- task-011 (`before_agent_start` injection that surfaces in-progress plan state)
- `~/.pi/docs/se-pi-upgrades.md` (Tier 3 item #4)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 ExtensionAPI, `ctx.ui.custom`, `pi.sendUserMessage`, `pi.appendEntry`)

## Notes

Hard-blocked on task-001 for the substrate. The plan-draft entry shape is meaningful enough that defining it here, ahead of task-001's catalogue, will create drift. Wait.

Scope discipline: this command replaces the *interview*. The synthesis — the part where the LLM takes the structured answers and produces the plan body — stays in `se-plan` skill prose. Resist the urge to template the synthesis too; the LLM still adds value there.

Open question for implementation, not now: should the command optionally hand off to `se-brainstorm` when the user can't answer the scope question? Probably yes, but only after the brainstorm side has its own command (or its skill prose is shaped to receive a structured prompt). Capture as a follow-up if it doesn't make the first cut.

The size of `skills/se-plan/SKILL.md` is itself a reason to plan this via `se-plan` rather than `se-work` — the migration of prose to UI flow has many small decisions about which step to keep, which to collapse, and which to drop. The skill walkthroughs and the synthesis logic each deserve a deliberate read-through, not a fast pass.

If during implementation the command starts re-implementing logic that already lives in synthesis prose (e.g. risk classification, sequencing heuristics), stop. That's a signal the boundary has shifted and the synthesis prose is the right home; keep the command focused on capture, not analysis.
