---
id: 01KSRGFP02WJBDFB4RCWC1ABM8
slug: lift-scripty-skills-to-pi-tools
title: Lift scripty SE skills to `pi.registerTool` wrappers
origin: parked
legacy: task-003
status: To Do
priority: high
labels:
  - pi-native
  - tools
  - skills
  - architecture
created: 2026-05-29
source: user
context:
---

# Lift scripty SE skills to `pi.registerTool` wrappers

## Context

Several SE skills are mechanical recipes hidden in prose. The skill text tells the LLM to run a script under `skills/<skill>/scripts/` via `bash`, with the right path and arguments, and parse the output back into context. This is the wrong abstraction for Pi:

- The LLM has to template a bash invocation correctly every time.
- Arguments aren't validated before the work runs.
- Output is unstructured text that the next LLM turn has to re-parse.
- The skill prose grows to explain how to invoke the script instead of when to use it.

Pi tools (`pi.registerTool` with TypeBox schemas, `prepareArguments`, `renderCall`, `renderResult`) collapse this into a single typed call surface. Same script does the work; the LLM picks the action by name from a typed menu.

Affected skills (in order of expected lift effort):

- `se-clean-gone-branches` — `scripts/clean-gone` already exists. Tool params: `{ dryRun, includeWorktrees }`.
- `se-session-inventory` + `se-session-extract` — both have Python helpers. Combine into a small tool catalogue: `se_session_list`, `se_session_skeleton`, `se_session_errors`. Params include `{ repo, since?, platform? }`.
- `se-resolve-pr-feedback` — three bash scripts (`get-pr-comments`, `get-thread-for-comment`, `reply-to-pr-thread`, `resolve-pr-thread`). Tool catalogue: `pr_comments_list`, `pr_thread_get`, `pr_thread_reply`, `pr_thread_resolve`.
- `se-demo-reel` — Python `capture-demo.py`. Tool: `capture_demo`. `renderResult` surfaces the output path; harness UIs with media support can render inline.
- `se-gemini-imagegen` — five Python scripts (generate, edit, compose, multi-turn). Tool catalogue: `gemini_image_generate`, `gemini_image_edit`, `gemini_image_compose`.
- `se-product-pulse` — report generation. Tool: `pulse_report`. Pairs naturally with a `customType: "pulse_report"` renderer.
- `se-test-browser`, `se-test-xcode` — wrap with `test_browser`, `test_xcode`. Structured target params.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #16, #17, #20, #21, #22, #23, #24. Tool-registration patterns and `prepareArguments`/`renderCall`/`renderResult` shapes in `~/.pi/docs/pi-package-expert-guide.md` §4.

`se-worktree` (item #19) deliberately is **not** in scope here. It overlaps with task-001's `se:worktree` session-log entry and should land after that substrate exists.

## Why it matters

- **Fewer LLM template errors** — typed schemas catch bad arguments at the harness boundary instead of mid-script.
- **Cleaner skill prose** — SKILL.md shrinks to "use the `se_clean_gone` tool when the user wants to clean up dead branches" instead of teaching bash invocation.
- **Better rendering** — `renderResult` can show structured output (tables, file paths, error highlights) without the LLM re-parsing.
- **Establishes the pattern** — once one wrapper lands well, the rest follow the same shape. The first wrapper is the load-bearing one.
- **Independent of task-001** — none of these skills depend on the session-log substrate, so the work can start immediately.

## Acceptance Criteria

- [ ] One pilot tool wrapper lands first (recommend `se_clean_gone`) with full plumbing: TypeBox schema, `prepareArguments`, `execute` calling the existing script, `renderResult` for the table output.
- [ ] The pilot SKILL.md (`se-clean-gone-branches`) is updated to instruct the LLM to use the tool, not the script directly. The script stays on disk for fallback / direct invocation.
- [ ] Following the pilot's pattern: `se_session_*` tools, `pr_*` tools, `capture_demo`, `gemini_image_*` tools, `pulse_report`, `test_browser`, `test_xcode` are each registered with their own TypeBox schemas.
- [ ] Each lifted skill's SKILL.md is updated to reference the registered tool by name (`promptGuidelines` bullets included where helpful), per the convention "always name your tool explicitly in each bullet" from the Pi guide.
- [ ] Tool definitions live in `extensions/se-tools/` (one file per skill) and are registered by the `software-engineering.ts` extension on session start.
- [ ] No behavioural regression: each affected skill's behaviour through the tool surface matches the previous script invocation, verified by running each at least once end-to-end.
- [ ] Existing tests pass (`npm test`) and `npm run check` reports the new tool files in the tarball.
- [ ] Contributor note in the README describes the convention: "scripty SE skills should expose their work as a registered tool; the script stays as a fallback."

## Related

- `extensions/software-engineering.ts`
- `extensions/se-tools/` (new)
- `skills/se-clean-gone-branches/SKILL.md` + `scripts/clean-gone`
- `skills/se-session-extract/SKILL.md` + `scripts/`
- `skills/se-session-inventory/SKILL.md` + `scripts/`
- `skills/se-resolve-pr-feedback/SKILL.md` + `scripts/`
- `skills/se-demo-reel/SKILL.md` + `scripts/capture-demo.py`
- `skills/se-gemini-imagegen/SKILL.md` + `scripts/`
- `skills/se-product-pulse/SKILL.md`
- `skills/se-test-browser/SKILL.md`
- `skills/se-test-xcode/SKILL.md`
- `~/.pi/docs/se-pi-upgrades.md` (items #16, #17, #20, #21, #22, #23, #24)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 custom tools)

## Notes

Land the pilot first and pause. Once the wrapper shape is proven (TypeBox schema, prepareArguments, renderCall/renderResult, where the code lives, how the SKILL.md prose changes), the remaining wrappers should be quick — but they share enough decisions with the pilot that mistakes in the first one would propagate.

`se-worktree` is intentionally excluded because its tool wrapper should write to `se:worktree` session-log entries from task-001. Capture the worktree tool separately once task-001 has landed.

If a skill turns out to have so little surface area that wrapping it is overkill (e.g. a single one-line script), skip it for now and note why in the PR description — don't force every script through the tool surface.
