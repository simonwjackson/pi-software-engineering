---
name: se-work
description: Execute work efficiently while maintaining quality and finishing features, defaulting to TDD/ATDD for behavior-bearing coding work
argument-hint: "[Plan doc path or description of work. Blank to auto use latest plan doc]"
compatibility: gh, npm, go, Rails, pytest, git
---

# Work Execution Command

Execute work efficiently while maintaining quality and finishing features.

## Introduction

This command takes a work document (plan or specification) or a bare prompt describing the work, and executes it systematically. The focus is on **shipping complete features** by understanding requirements quickly, following existing patterns, and maintaining quality throughout. For behavior-bearing coding work, `/se-work` defaults to ATDD/TDD: prove the desired behavior with a failing public-contract test first, implement the smallest vertical slice that passes, then refactor while green.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Invocation Intent Routing

Before entering the implementation workflow, classify the user's intent from `<input_document>` and the surrounding request.

| Intent | Signals | Route |
|--------|---------|-------|
| **Implementation** | plan path, spec path, feature/fix/refactor request, or bare prompt describing code/doc work | Run the Execution Workflow below. Preserve ATDD/TDD defaults and atomic commit discipline throughout implementation. |
| **Commit-only** | "commit", "save my changes", "create a commit", or explicit local-only commit request | Read `references/commit-pr-workflow.md` and run its Commit-only workflow. Do not run Phase 0-2 implementation unless the user also asked for code changes. |
| **Ship / PR** | "ship this", "open a PR", "commit and PR", "push and create PR", or a completed implementation ready for publication | Run Phase 3-4 if quality checks have not already run, then read `references/commit-pr-workflow.md` for the final commit/push/PR mechanics. |
| **PR description** | "write/draft/update/refresh PR description", "describe this PR", or a PR URL/number with description intent | Read `references/commit-pr-workflow.md` and run its Description-only or Description update workflow. Do not mutate git state unless the user explicitly asks. |

When intent is mixed, prefer the fuller lifecycle: implementation before commit, quality checks before PR, PR monitoring after PR creation. Do not collapse `/se-work` into an end-of-session commit tool; its core shape is still test-first vertical slices with atomic commits as slices turn green.

## Execution Workflow

### Phase 0: Input Triage

Determine how to proceed based on what was provided in `<input_document>`.

**Plan document** (input is a file path to an existing plan or specification) → skip to Phase 1.

**Bare prompt** (input is a description of work, not a file path):

1. **Scan the work area**

   - Identify files likely to change based on the prompt
   - Identify the public interface or acceptance surface the behavior should be verified through
   - Find existing test files for those areas (search for test/spec files that import, reference, or share names with the implementation files)
   - Note local patterns and conventions in the affected areas

2. **Assess complexity and route**

   | Complexity | Signals | Action |
   |-----------|---------|--------|
   | **Trivial** | 1-2 files, no behavioral change (typo, config, rename) | Proceed to Phase 1 step 2 (environment setup), then implement directly — no task list, no execution loop. Apply Test Discovery if the change touches behavior-bearing code |
   | **Small / Medium** | Clear scope, under ~10 files | Build a task list from discovery. Proceed to Phase 1 step 2 |
   | **Large** | Cross-cutting, architectural decisions, 10+ files, touches auth/payments/migrations | Inform the user this would benefit from `/se-brainstorm` or `/se-plan` to surface edge cases and scope boundaries. Honor their choice. If proceeding, build a task list and continue to Phase 1 step 2 |

---

### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_

   - Read the work document completely
   - Treat the plan as a decision artifact, not an execution script
   - If the plan includes sections such as `Implementation Units`, `Work Breakdown`, `Requirements` (or legacy `Requirements Trace`), `Files`, `Test Scenarios`, or `Verification`, use those as the primary source material for execution
   - Check for `Execution note` on each implementation unit — these carry the plan's execution posture signal for that unit (for example, test-first or characterization-first). Note them when creating tasks.
   - Check for a `Deferred to Implementation` or `Implementation-Time Unknowns` section — these are questions the planner intentionally left for you to resolve during execution. Note them before starting so they inform your approach rather than surprising you mid-task
   - Check for a `Scope Boundaries` section — these are explicit non-goals. Refer back to them if implementation starts pulling you toward adjacent work
   - Review any references or links provided in the plan
   - Default behavior-bearing coding units to ATDD/TDD even when the plan has no `Execution note`; if the user explicitly asks for test-first, characterization-first, pragmatic/no-test-first, or spike execution in this session, honor that request when it does not conflict with safety or verification requirements
   - If anything is unclear or ambiguous, ask clarifying questions now
   - If clarifying questions were needed above, get user approval on the resolved answers. If no clarifications were needed, proceed without a separate approval step — plan scope is the plan's authority, not something to renegotiate
   - **Do not skip this** - better to ask questions now than build the wrong thing
   - **Do not edit the plan body during execution.** The plan is a decision artifact; progress lives in git commits and the task tracker. The only plan mutation during se-work is the final `status: active → completed` flip at shipping (see `references/shipping-workflow.md` Phase 4 Step 2). Legacy plans may contain `- [ ]` / `- [x]` marks on unit headings — ignore them as state; per-unit completion is determined during execution by reading the current file state.

2. **Setup Environment**

   **Pi-native state read.** If the `se_read_state` tool is registered (provided by `extensions/software-engineering.ts`), call it once before doing any environment detection. It returns the current SE phase, worktree binding, last test colour, open review residuals, and active backlog — read from the session log, surviving `/compact`, `/fork`, and restart. Use the returned phase to decide whether to resume mid-flow rather than re-running Phase 0 triage. If the tool is not registered, fall through to the git-based detection below.

   First, check the current branch:

   ```bash
   current_branch=$(git branch --show-current)
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

   # Fallback if remote HEAD isn't set
   if [ -z "$default_branch" ]; then
     default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   fi
   ```

   **Default: do all work in a dedicated worktree.** The main checkout stays clean for coordination, review, and future work. A normal `/se-work` execution should not edit the default branch checkout directly.

   First, detect whether the current checkout is already a linked worktree:

   ```bash
   git worktree list --porcelain
   git rev-parse --show-toplevel
   ```

   **If already inside the correct feature worktree:** continue there after confirming the branch name is meaningful.

   **If on the default branch or in the main checkout:** create a worktree before editing files:

   ```bash
   skill: se-worktree
   # The skill creates .worktrees/<branch-name> from the remote default branch
   cd .worktrees/<branch-name>
   ```

   Use a meaningful branch name based on the plan title or work description (e.g., `feat/user-authentication`, `fix/email-validation`). Avoid opaque names like `worktree-jolly-beaming-raven`.

   **If already on a feature branch in the main checkout:** prefer moving the work into a dedicated worktree before continuing. If no local-only changes exist, create a worktree for that branch and switch to it. If local changes already exist, either move them into the worktree or ask before continuing in-place. Continuing in the main checkout requires explicit user confirmation.

   **If the branch name is meaningless or auto-generated:** rename it before creating or continuing the worktree:

   ```bash
   git branch -m <meaningful-name>
   ```

   **Exceptions:** Only skip worktree isolation when the repository does not support worktrees, the task is a read-only investigation, or the user explicitly says to work in the current checkout. Record the reason before proceeding. Never commit directly to the default branch without explicit permission.

3. **Create Task List** _(skip if Phase 0 already built one, or if Phase 0 routed as Trivial)_
   - Use the platform's task tracking tool (`the platform's task-tracking primitive`/`the platform's task-tracking primitive`/`the platform's task-tracking primitive` in Claude Code, `update_plan` in Codex, or the equivalent on other harnesses) to break the plan into actionable tasks
   - Derive tasks from the plan's implementation units, dependencies, files, test targets, and verification criteria
   - When the plan defines U-IDs for Implementation Units, preserve the unit's U-ID as a prefix in the task subject (e.g., "U3: Add parser coverage"). This keeps blocker references, deferred-work notes, and final summaries anchored to the same identifier the plan uses, so progress and traceability remain unambiguous across plan edits
   - Carry each unit's `Execution note` into the task when present
   - If a behavior-bearing unit has no `Execution note`, assign a default posture before implementation: ATDD for user-visible/cross-layer behavior, TDD for domain/service/CLI behavior, reproduction-test-first for bugs, characterization-first for legacy behavior changes or refactors
   - For each unit, read the `Patterns to follow` field before implementing — these point to specific files or conventions to mirror
   - Use each unit's `Verification` field as the primary "done" signal for that task
   - Do not expect the plan to contain implementation code, micro-step TDD instructions, or exact shell commands
   - Include dependencies between tasks
   - Prioritize based on what needs to be done first
   - Include testing and quality check tasks
   - Keep tasks specific and completable

4. **Choose Execution Strategy**

   After creating the task list, decide how to execute based on the plan's size and dependency structure:

   | Strategy | When to use |
   |----------|-------------|
   | **Inline** | 1-2 small tasks, or tasks needing user interaction mid-flight. **Default for bare-prompt work** — bare prompts rarely produce enough structured context to justify subagent dispatch |
   | **Serial subagents** | 3+ tasks with dependencies between them. Each subagent gets a fresh context window focused on one unit — prevents context degradation across many tasks. Requires plan-unit metadata (Goal, Files, Approach, Test scenarios) |
   | **Parallel subagents** | 3+ tasks that pass the Parallel Safety Check (below). Dispatch independent units simultaneously, run dependent units after their prerequisites complete. Requires plan-unit metadata |

   **Parallel Safety Check** — required before choosing parallel dispatch:

   1. Build a file-to-unit mapping from every candidate unit's `Files:` section (Create, Modify, and Test paths)
   2. Check for intersection — any file path appearing in 2+ units means overlap
   3. **If overlap is found AND worktree isolation is unavailable**: downgrade to serial subagents. Log the reason (e.g., "Units 2 and 4 share `config/routes.rb` — using serial dispatch"). Serial subagents still provide context-window isolation without shared-directory write races.
   4. **If overlap is found AND worktree isolation is available**: parallel dispatch is still safe — subagents work in isolation, and the overlap surfaces as a predictable merge conflict the orchestrator handles via the post-batch flow below. Log the predicted overlap so the post-batch flow knows which merges to expect conflicts on.

   Even with no file overlap, parallel subagents sharing the orchestrator's working directory face git index contention (concurrent staging/committing corrupts the index) and test interference (concurrent test runs pick up each other's in-progress changes). Worktree isolation eliminates both; the shared-directory fallback constraints below mitigate them.

   **Subagent isolation** — give each parallel subagent its own working tree:
   - **Claude Code (`Agent` tool):** pass `isolation: "worktree"` and `run_in_background: true`. The harness creates a per-subagent worktree under `.claude/worktrees/agent-<id>` on its own branch. Verify `.claude/worktrees/` is gitignored before relying on this.
   - **Other platforms** without built-in worktree isolation (e.g., Codex `spawn_agent`, Pi `subagent`): subagents share the orchestrator's directory.

   **Subagent dispatch** uses your available subagent or task spawning mechanism. For each unit, give the subagent:
   - The full plan file path (for overall context)
   - The specific unit's Goal, Files, Approach, Execution note, Patterns, Test scenarios, and Verification
   - Any resolved deferred questions relevant to that unit
   - Instruction to check whether the unit's test scenarios cover all applicable categories (happy paths, edge cases, error paths, integration) and supplement gaps before writing tests
   - Instruction to use the default `/se-work` execution posture: write a failing public-contract test first for behavior-bearing work, verify it fails for the expected reason, implement the smallest passing vertical slice, then refactor while green; skip test-first only for documented exceptions

   **Shared-directory fallback constraints** — apply only when worktree isolation is unavailable:
   - Instruct each subagent: "Do not stage files (`git add`), create commits, or run the project test suite. The orchestrator handles testing, staging, and committing after all parallel units complete."
   - These constraints prevent git index contention and test interference between concurrent subagents.
   - With worktree isolation active, omit these constraints — subagents may stage, commit atomic slices, and run relevant tests within their own worktree branch.

   **Permission mode:** Omit the `mode` parameter when dispatching subagents so the user's configured permission settings apply. Do not pass `mode: "auto"` — it overrides user-level settings like `bypassPermissions`.

   **After each subagent completes (serial mode):**
   1. Review the subagent's diff — verify changes match the unit's scope and `Files:` list
   2. Run the relevant test suite to confirm the tree is healthy
   3. If tests fail, diagnose and fix before proceeding — do not dispatch dependent units on a broken tree
   4. Update the task list (do not edit the plan body — progress is carried by the commit)
   5. Dispatch the next unit

   **After all parallel subagents in a batch complete (worktree-isolated mode):**
   1. Wait for every subagent in the current parallel batch to finish.
   2. For each completed subagent, in dependency order: review the worktree's diff against the orchestrator's branch and check that any subagent commits are atomic. If the subagent did not commit its own work, stage and commit atomic slices inside that worktree.
   3. Merge each subagent's branch into the orchestrator's branch sequentially in dependency order. **If a merge conflict surfaces, abort the merge (`git merge --abort`) and re-dispatch the conflicting unit serially against the now-merged tree** — hand-resolving silently picks a side and discards one unit's intent. (Predicted overlap from the Parallel Safety Check surfaces here as a conflict, not as silent data loss in shared-directory mode.)
   4. After each merge, run the relevant test suite. If tests fail, diagnose and fix before merging the next branch.
   5. Update the task list (progress is carried by the merge commits).
   6. After merging, remove each subagent's worktree and delete its branch. Use the absolute path and branch name returned in the subagent's result.
      - Unlock the worktree first — the harness locks per-subagent worktrees: `git worktree unlock <absolute-path>`
      - Remove the worktree: `git worktree remove <absolute-path>`
      - Delete the branch: `git branch -d <branch-name>` (the branch outlives the worktree by default and accumulates as orphans if not cleaned up; `-d` lowercase refuses to delete unmerged branches, which is the safety we want — if it fails, investigate before forcing)
   7. Dispatch the next batch of independent units, or the next dependent unit.

   **After all parallel subagents in a batch complete (shared-directory fallback):**
   1. Wait for every subagent in the current parallel batch to finish before acting on any of their results
   2. Cross-check for discovered file collisions: compare the actual files modified by all subagents in the batch (not just their declared `Files:` lists). Subagents may create or modify files not anticipated during planning — this is expected, since plans describe *what* not *how*. A collision only matters when 2+ subagents in the same batch modified the same file. In a shared working directory, only the last writer's version survives — the other unit's changes to that file are lost. If a collision is detected: commit all non-colliding files from all units first, then re-run the affected units serially for the shared file so each builds on the other's committed work
   3. For each completed unit, in dependency order: review the diff, split mixed concerns when needed, run the relevant test suite, stage only one atomic slice at a time, and commit with a conventional message derived from that slice's purpose
   4. If tests fail while preparing a slice, diagnose and fix before committing it; if a post-commit verification failure appears, fix it before committing or merging the next slice
   5. Update the task list (do not edit the plan body — progress is carried by the commits just made)
   6. Dispatch the next batch of independent units, or the next dependent unit

### Phase 2: Execute

1. **Task Execution Loop**

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in-progress
     - Read any referenced files from the plan or discovered during Phase 0
     - **If the unit's work is already present and matches the plan's intent** (files exist with the expected capability, or the unit's `Verification` criteria are already satisfied by the current code), the work has likely shipped on a prior branch or session. Verify it matches, mark the task complete, and move on. Do not silently reimplement.
     - Look for similar patterns in codebase
     - Find existing test files for implementation files being changed (Test Discovery — see below)
     - Choose the task's execution posture from the Default Execution Posture table below
     - For behavior-bearing changes, write or update the next failing public-contract test before implementation and verify it fails for the expected reason
     - Implement the smallest vertical slice following existing conventions until the test passes
     - Refactor only while green; add, update, or remove tests to match the behavior change (see Test Discovery below)
     - Run System-Wide Test Check (see below)
     - Run tests after changes
     - Assess testing coverage: did this task change behavior? If yes, were tests written or updated? If no tests were added, is the justification deliberate (e.g., pure config, no behavioral change)?
     - Mark task as completed
     - Create or defer an atomic commit according to the Atomic Commits rules below
   ```

   When a unit carries an `Execution note`, honor it. For units without an `Execution note`, default to test-first execution when the task changes behavior.

   **Default Execution Posture**

   | Work type | Default posture |
   |-----------|-----------------|
   | New user-visible behavior, endpoint behavior, CLI behavior, or cross-layer feature | **ATDD first**: write an acceptance/integration test through the public boundary, verify RED, implement the thinnest end-to-end slice, then use inner TDD cycles as needed |
   | Domain/service logic or parser/adapter behavior | **TDD**: one observable behavior test, verify RED, minimal implementation, verify GREEN, repeat |
   | Bug fix | **Reproduction test first**: write the smallest test that fails for the reported bug, verify RED for the expected reason, then fix |
   | Legacy behavior change | **Characterization-first**: capture current behavior through the public contract, then add the desired failing behavior test before changing code |
   | Pure refactor | **Existing/characterization coverage first**: prove current behavior is covered before moving code; do not change behavior |
   | Docs, comments, mechanical rename, generated output, pure config, pure styling, exploratory spike | **Pragmatic**: skip test-first, state the reason, and verify with the most relevant real command/check |

   Guardrails for execution posture:
   - Do not write the test and implementation in the same step when working test-first
   - Do not skip verifying that a new test fails for the expected reason before implementing the fix or feature
   - Do not write all tests first and all implementation second; work in vertical slices, one behavior at a time
   - Do not over-implement beyond the current behavior slice when working test-first
   - Prefer tests through public interfaces and real implementations; no implementation-coupled tests or faux `Mock*`/`Stub*`/`Fake*` seams
   - Ask the user only when the public interface, acceptance behavior, or test priority is ambiguous; do not pause for approval before every test when the plan already defines the behavior
   - Skip test-first discipline only for the pragmatic exceptions above, and record the reason in the task summary

   **Test Discovery** — Before implementing changes to a file, find its existing test files (search for test/spec files that import, reference, or share naming patterns with the implementation file). When a plan specifies test scenarios or test files, start there, then check for additional test coverage the plan may not have enumerated. Changes to implementation files should be accompanied by corresponding test updates — new tests for new behavior, modified tests for changed behavior, removed or updated tests for deleted behavior.

   **Test Scenario Completeness** — Before writing tests for a feature-bearing unit, check whether the plan's `Test scenarios` cover all categories that apply to this unit. If a category is missing or scenarios are vague (e.g., "validates correctly" without naming inputs and expected outcomes), supplement from the unit's own context before writing tests:

   | Category | When it applies | How to derive if missing |
   |----------|----------------|------------------------|
   | **Happy path** | Always for feature-bearing units | Read the unit's Goal and Approach for core input/output pairs |
   | **Edge cases** | When the unit has meaningful boundaries (inputs, state, concurrency) | Identify boundary values, empty/nil inputs, and concurrent access patterns |
   | **Error/failure paths** | When the unit has failure modes (validation, external calls, permissions) | Enumerate invalid inputs the unit should reject, permission/auth denials it should enforce, and downstream failures it should handle |
   | **Integration** | When the unit crosses layers (callbacks, middleware, multi-service) | Identify the cross-layer chain and write a scenario that exercises it without mocks |

   **System-Wide Test Check** — Before marking a task done, pause and ask:

   | Question | What to do |
   |----------|------------|
   | **What fires when this runs?** Callbacks, middleware, observers, event handlers — trace two levels out from your change. | Read the actual code (not docs) for callbacks on models you touch, middleware in the request chain, `after_*` hooks. |
   | **Do my tests exercise the real chain?** If every dependency is mocked, the test proves your logic works *in isolation* — it says nothing about the interaction. | Write at least one integration test that uses real objects through the full callback/middleware chain. No mocks for the layers that interact. |
   | **Can failure leave orphaned state?** If your code persists state (DB row, cache, file) before calling an external service, what happens when the service fails? Does retry create duplicates? | Trace the failure path with real objects. If state is created before the risky call, test that failure cleans up or that retry is idempotent. |
   | **What other interfaces expose this?** Mixins, DSLs, alternative entry points (Agent vs Chat vs ChatMethods). | Grep for the method/behavior in related classes. If parity is needed, add it now — not as a follow-up. |
   | **Do error strategies align across layers?** Retry middleware + application fallback + framework error handling — do they conflict or create double execution? | List the specific error classes at each layer. Verify your rescue list matches what the lower layer actually raises. |

   **When to skip:** Leaf-node changes with no callbacks, no state persistence, no parallel interfaces. If the change is purely additive (new helper method, new view partial), the check takes 10 seconds and the answer is "nothing fires, skip."

   **When this matters most:** Any change that touches models with callbacks, error handling with fallback/retry, or functionality exposed through multiple interfaces.


2. **Atomic Commits**

   Every commit should be one coherent, independently understandable unit of change. Atomic means conceptually indivisible, not necessarily tiny: one behavior slice may touch production code, tests, fixtures, docs, and config when all of those changes are required for that slice.

   **Atomic commit requirements:**
   - One purpose per commit; the message should not need "and also"
   - Include the tests, fixtures, docs, migrations, generated artifacts, and config changes required by that purpose
   - Exclude unrelated cleanup, opportunistic refactors, formatting churn, and drive-by fixes unless they are necessary for the commit's purpose
   - Leave the repository working at that commit; relevant tests and checks must pass before committing
   - Be reviewable and revertable on its own without removing unrelated work
   - Never commit a RED state, broken build, or speculative/WIP scaffold as a normal commit

   **Commit boundary heuristics:**

   | Commit when... | Split or wait when... |
   |----------------|----------------------|
   | One acceptance behavior or TDD slice is GREEN | The slice is still RED or only partially implemented |
   | One bug reproduction + fix is complete | The commit message would need "and also" |
   | One refactor preserves behavior with tests passing | Refactor and behavior change are tangled but can be separated |
   | One mechanical migration step is complete and verified | Formatting or cleanup touches files unrelated to the purpose |
   | About to switch contexts or attempt risky work after a clean slice | The change would need a "WIP" or "partial" message |

   If the plan has Implementation Units, use them as a starting guide for commit boundaries — but adapt based on what you find during implementation. A unit might need multiple atomic commits if it contains several behavior slices, or multiple small units might land together only when they form one inseparable purpose. Use each unit's Goal to inform the commit message.

   **Commit workflow:**

   **Pi-native path (preferred when registered):** call the `se_atomic_commit` tool with typed `type`, optional `scope`, `subject`, optional `body`, and `paths`. The tool validates the conventional-commit format, refuses subjects containing `and also` / `;` / `+`, refuses paths outside the active worktree, and refuses to commit while `se:test-state` is RED unless you pass `allowRed: true` with a documented `body` explaining the deliberate WIP. The tool's schema is the source of truth for what a valid commit looks like; you do not need to re-derive the format here. Use this for every code commit during /se-work.

   **Bash fallback** (when `se_atomic_commit` is not registered, or for vendored/generated commits where the convention does not apply — document why in the body):

   ```bash
   # 1. Inspect the full diff and identify the exact atomic slice to commit
   git diff

   # 2. Verify relevant tests/checks pass for that slice
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # 3. Stage only files or hunks belonging to this atomic slice (not `git add .`)
   git add <files related to this atomic slice>
   # Use interactive staging when a file contains mixed concerns:
   git add -p <file with mixed changes>

   # 4. Review the staged diff before committing
   git diff --cached

   # 5. Commit with a conventional message naming the single purpose
   git commit -m "feat(scope): describe one completed behavior"
   ```

   **Handling mixed changes:** If unrelated edits accumulated while working, separate them before committing. Use `git add -p`, split files, or temporarily park unrelated work. Do not hide unrelated changes inside a commit because they are already in the working tree.

   **Handling merge conflicts:** If conflicts arise during rebasing or merging, resolve them immediately. Atomic commits make conflict resolution easier because each commit has a single intent.

   **Note:** Atomic commits use clean conventional messages without attribution footers. The final Phase 4 commit/PR includes the full attribution.

   **Parallel subagent mode:** Commit ownership is split by isolation mode (see Phase 1 Step 4):
   - **Worktree-isolated:** subagents may stage and commit atomic slices inside their own worktree branch; the orchestrator reviews each commit for single-purpose scope before merging those branches in dependency order after the batch.
   - **Shared-directory fallback:** subagents do not commit; the orchestrator stages and commits each atomic slice after the entire parallel batch completes.

3. **Follow Existing Patterns**

   - The plan should reference similar code - read those files first
   - Match naming conventions exactly
   - Reuse existing components where possible
   - Follow project coding standards (see AGENTS.md; use CLAUDE.md only if the repo still keeps a compatibility shim)
   - When in doubt, grep for similar implementations

4. **Test Continuously**

   - Run relevant tests after each significant change
   - Don't wait until the end to test
   - Fix failures immediately
   - Add new tests for new behavior, update tests for changed behavior, remove tests for deleted behavior
   - **Unit tests with mocks prove logic in isolation. Integration tests with real objects prove the layers work together.** If your change touches callbacks, middleware, or error handling — you need both.

5. **Simplify as You Go**

   After completing a cluster of related implementation units (or every 2-3 units), review recently changed files for simplification opportunities — consolidate duplicated patterns, extract shared helpers, and improve code reuse and efficiency. This is especially valuable when using subagents, since each agent works with isolated context and can't see patterns emerging across units.

   Don't simplify after every single unit — early patterns may look duplicated but diverge intentionally in later units. Wait for a natural phase boundary or when you notice accumulated complexity.

   If a `/simplify` skill or equivalent is available, use it. Otherwise, review the changed files yourself for reuse and consolidation opportunities.

6. **Figma Design Sync** (if applicable)

   For UI work with Figma designs:

   - Implement components following design specs
   - Use se-figma-design-sync agent iteratively to compare
   - Fix visual differences identified
   - Repeat until implementation matches design

6. **Track Progress**
   - Keep the task list updated as you complete tasks
   - Note any blockers or unexpected discoveries
   - When useful follow-up work is real but outside the current atomic slice, use `se-backlog` to capture it instead of expanding scope or hiding it in the commit
   - Create new tasks only when scope legitimately expands within the current work; otherwise backlog the follow-up
   - Keep user informed of major milestones
   - When the plan defines U-IDs for Implementation Units, or the plan or origin document carries stable R-IDs (and optionally A/F/AE IDs), reference them in blockers, deferred-work notes, task summaries, and final verification — not routine status updates. U-IDs anchor units across plan edits; R/A/F/AE anchor product intent across the brainstorm-plan handoff. Use the IDs the plan supplies and do not invent ones it does not. This preserves traceability without burying signal under noise.

### Phase 3-4: Quality Check and Finishing Work

When all Phase 2 tasks are complete and execution transitions to quality check, you must read `references/shipping-workflow.md` for the full shipping workflow.Do not skip this.

## Key Principles

### Start Fast, Execute Faster

- Get clarification once at the start, then execute
- Don't wait for perfect understanding - ask questions and move
- The goal is to **finish the feature**, not create perfect process

### The Plan is Your Guide

- Work documents should reference similar code and patterns
- Load those references and follow them
- Don't reinvent - match what exists

### Test As You Go

- Run tests after each change, not at the end
- Fix failures immediately
- Continuous testing prevents big surprises

### Quality is Built In

- Follow existing patterns
- Write tests for new code
- Run linting before pushing
- Commit only atomic, working slices that are reviewable and revertable on their own
- Work in a dedicated worktree by default; keep the main checkout clean
- Review every change — inline for simple additive work, full review for everything else

### Ship Complete Features

- Mark all tasks completed before moving on
- Push to GitHub and create/update the PR by default
- Poll PR approval and GitHub Actions/status checks; fix failures before merging
- Merge with GitHub rebase/auto-rebase only — never classic merge commits
- Clean up the local worktree and feature branch after merge/close
- Don't leave features 80% done
- A finished feature that ships beats a perfect feature that doesn't

## Common Pitfalls to Avoid

- **Analysis paralysis** - Don't overthink, read the plan and execute
- **Skipping clarifying questions** - Ask now, not after building wrong thing
- **Ignoring plan references** - The plan has links for a reason
- **Testing at the end** - Test continuously or suffer later
- **Working in the main checkout by default** - Create or switch to a dedicated worktree before editing files
- **Stopping at PR creation** - Show the PR, then monitor approval and checks instead of disappearing after `gh pr create`
- **Classic merge commits** - Use rebase merge or auto-rebase; stop if the repository only allows classic merge
- **Leaking worktrees** - Remove merged/closed worktrees and local branches once the work is done
- **Mixed-purpose commits** - Do not combine unrelated behavior, cleanup, formatting, and drive-by fixes because they happened in the same session
- **Losing follow-ups** - If a worthwhile follow-up is out of scope, capture it with `se-backlog` rather than relying on chat memory
- **Using `git add .` reflexively** - Inspect and stage only the files or hunks that belong to the atomic slice
- **Forgetting to track progress** - Update task status as you go or lose track of what's done
- **80% done syndrome** - Finish the feature, don't move on early
- **Skipping review** - Every change gets reviewed; only the depth varies
- **Re-scoping the plan into human-time phases** - The plan's Implementation Units define the scope of execution. Do not estimate human-hours per unit, propose multi-day breakdowns, or ask the user to pick a subset of units for "this session". Agents execute at agent speed, and context-window pressure is addressed by subagent dispatch (Phase 1 Step 4), not by phased sessions. If a plan-file input is genuinely too large for a single execution, say so plainly and suggest the user return to `/se-plan` to reduce scope — don't invent session phases as a workaround. For bare-prompt input, Phase 0's Large routing already handles oversized work
