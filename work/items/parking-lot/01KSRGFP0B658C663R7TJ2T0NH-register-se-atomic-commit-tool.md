---
id: 01KSRGFP0B658C663R7TJ2T0NH
slug: register-se-atomic-commit-tool
title: Register `se_atomic_commit` tool with conventional-commit and RED-state enforcement
origin: parked
legacy: task-012
status: To Do
priority: high
labels:
  - pi-native
  - tools
  - guardrails
  - se-work
  - se-commit
created: 2026-05-29
source: user
context:
---

# Register `se_atomic_commit` tool with conventional-commit and RED-state enforcement

## Context

`/se-work` (which absorbed `/se-commit` and `/se-commit-push-pr`) encodes strong atomic-commit rules in prose:

- One purpose per commit; no "and also" / "fix and refactor" titles.
- Conventional Commits format: `type(scope): subject`.
- Include the tests / fixtures / docs that belong with the change.
- Never commit while the slice is RED.
- Split the slice into smaller commits if it is still RED at split time.

All of these are LLM-enforced today. The model formats the message, decides whether the slice is GREEN, and remembers to split. When the model forgets or hurries, the invariants fail silently — there is nothing in the harness to refuse a bad commit.

Pi can enforce all of these deterministically by replacing the model's free-form `bash` `git commit -m "..."` call with a registered tool:

- TypeBox schema rejects malformed titles (length, "and also", missing type) at the harness boundary.
- `prepareArguments` normalizes spacing, validates scope characters, sets defaults.
- `execute` consults the session-log state from task-001 (`se:test-state`, `se:worktree`) and refuses to run while RED unless an explicit override is present.
- `renderResult` shows the commit + diff stat inline, paving the way for the `customType: "atomic_commit"` renderer separately.

The tool is the only sanctioned commit path for code commits in `/se-work`. The skill prose tells the LLM "use the `se_atomic_commit` tool for any code commit; use `bash` only for vendored/generated commits where the policy explicitly does not apply (and document why in the commit body)."

Reference: `~/.pi/docs/se-pi-upgrades.md` Tier 2 item #3 ("`se_atomic_commit` tool"). Tool-registration patterns, `prepareArguments`, `renderCall`, `renderResult`, and `promptGuidelines` semantics in `~/.pi/docs/pi-package-expert-guide.md` §4.

This is **not** the same as bash interception (`tool_call` rewrite on `git commit -m`). That approach is captured under the broader guardrails item (not yet in the backlog). The tool approach is cleaner because:

- The LLM never has to template a shell command.
- Validation runs on typed args, not on parsed bash strings.
- Failure modes are tool errors with structured detail, not refused bash commands.

If bash interception lands later, it covers the residual case where the LLM bypasses the tool (e.g. a vendored-deps commit) and still tries an "and also" title.

## Why it matters

- **Invariant enforcement at the harness boundary** — "one purpose per commit" and "no RED commit" stop being trust-the-LLM rules.
- **Clean SKILL.md** — `/se-work`'s commit prose shrinks to "use the tool"; the conventional-commit rules live in the tool schema, not in prose the LLM has to read every turn.
- **Composes with the substrate** — RED-state check is exactly the kind of thing task-001's `se:test-state` exists for. This is the first non-backlog consumer that proves the substrate generalizes.
- **First step toward `customType: "atomic_commit"` rendering** — `renderResult` here establishes the structured output the message renderer will format.

## Acceptance Criteria

- [ ] A `se_atomic_commit` tool is registered with a TypeBox schema covering at minimum: `type` (enum: feat / fix / refactor / test / docs / chore / build / ci / perf / style), optional `scope` (kebab-case word), `subject` (≤72 chars, no `and also` / `;`), optional `body`, `paths` (non-empty string array), optional `allowRed` (default false).
- [ ] `prepareArguments` trims whitespace, lowercases `type`, validates scope characters, and rejects subjects containing prohibited tokens before `execute` runs.
- [ ] `execute` runs `git add <paths>` then `git commit` with the formatted Conventional Commit message. It reads `se:test-state` and `se:worktree` from task-001's helpers and refuses with a clear, structured error when:
  - The slice is RED and `allowRed` is not set.
  - Any of `paths` is outside the active worktree.
- [ ] When `allowRed` is set, the commit body gains a footer line documenting that the commit landed RED and why, so the audit trail is preserved.
- [ ] `renderResult` returns the commit SHA, short title, and a one-line diff stat. The output shape is stable enough that the future `customType: "atomic_commit"` renderer (`~/.pi/docs/se-pi-upgrades.md` #38) can format it without re-deriving fields.
- [ ] `promptGuidelines` includes at least one bullet that names `se_atomic_commit` explicitly, per the Pi guide convention ("Use `se_atomic_commit` whenever committing code in `/se-work`. Use the `bash` tool's `git commit` only for vendored/generated commits where the convention does not apply, and document the reason in the body.").
- [ ] `/se-work` SKILL.md and `skills/se-work/references/commit-pr-workflow.md` are updated so the canonical commit path is the tool. The prose stops re-deriving conventional-commit format rules and instead points at the tool's schema.
- [ ] Existing tests pass (`npm test`) and the new tool ships in the tarball (`npm run check`).

## Related

- `skills/se-work/SKILL.md`
- `skills/se-work/references/commit-pr-workflow.md`
- `extensions/se-tools/` (new, established by task-003 if it lands first; otherwise create here)
- task-001 (`se:test-state`, `se:worktree` helpers)
- task-003 (tool-registration pattern, same `extensions/se-tools/` directory)
- task-008 (different shape — commands, not tools)
- `~/.pi/docs/se-pi-upgrades.md` (Tier 2 item #3, also #11 RED guardrail, #13 commit-title rewrite, #38 atomic-commit renderer)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 custom tools, `promptGuidelines`)

## Notes

Hard-blocked on task-001 for the RED-state and worktree-scope checks. The tool can technically ship as a pure formatter first (skipping the state checks) and gain the enforcement after task-001 lands — but resist that path unless task-001 is a long way off. Shipping enforcement-shaped behavior with enforcement-stubbed-out invites the model to learn the wrong boundary.

If task-003 ships first, follow its `extensions/se-tools/` layout and `prepareArguments` / `renderResult` shape. If this ships first, treat it as the pilot for that directory and write the contributor note about the convention.

Open question for implementation, not now: whether `paths` should be required or default to the current `git diff --cached` staged set. Required is cleaner (the tool says exactly what it commits); cached-by-default is more ergonomic for a model that has already staged. Decide during the pilot.
