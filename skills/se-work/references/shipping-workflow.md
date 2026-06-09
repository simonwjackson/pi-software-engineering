# Shipping Workflow

This file contains the shipping workflow (Phase 3-4). It is loaded when all Phase 2 tasks are complete and execution transitions to quality check.

## Phase 3: Quality Check

1. **Run Core Local Quality Checks**

   Always run locally before finishing or integrating:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run typechecker / static analyzer when the project has one
   # Examples: npm run typecheck, tsc --noEmit, mypy, cargo check, go test ./...

   # Run formatter and linting per AGENTS.md / project docs
   ```

   If any test, type/static check, formatter, or linter fails, fix it before proceeding. Do not publish, integrate, or call the work complete with known local failures.

2. **Simplify** (Claude Code only; REQUIRED for >=30 changed lines)

   Before code review, run the `/simplify` skill on the change to consolidate duplicated patterns, remove dead code, and improve reuse. Skip when the diff is purely mechanical (formatting, dependency bumps, lint fixes, generated artifacts) -- simplification has no useful yield on those.

   On other harnesses, proceed directly to code review.

3. **Code Review** (REQUIRED)

   Every change gets reviewed before shipping. Default to Tier 1 and escalate to Tier 2 only when a concrete signal calls for it. Tier 2 is materially more expensive in time and tokens -- pay that cost when a signal justifies it, not as a default.

   **Tier 1 -- harness-native code review (default).** Run your built-in code review command or skill (e.g., `/review` in Claude Code). Address blocking and suggested findings inline before Final Validation. Skip the Residual Work Gate. If the current harness has no built-in code review command or skill, escalate to Tier 2 -- Tier 1 cannot run, and "Every change gets reviewed" still applies.

   **Tier 2 -- `se-code-review` (escalation).** Invoke the `se-code-review` skill with `mode:autofix`, passing `plan:<path>` when known. Then proceed to the Residual Work Gate.

   Escalate to Tier 2 when **any** of the following is true:

   - **Sensitive surface touched.** The diff modifies any of: authentication or authorization, payments or billing, data migrations or backfills, cryptography or secret handling, security-relevant configuration, public API or library contracts, or dependency manifests.
   - **Large and diffuse change.** The diff exceeds >=400 changed lines **and** spans more than 3 directories or 2 distinct subsystems. Either alone is a soft signal; together they are an escalation trigger.
   - **Very large change.** The diff exceeds >=1,000 changed lines regardless of diffusion.
   - **Plan or task explicitly requests it.** The plan, the originating task, or another instruction in scope calls for a full / deep / thorough code review.

   When the change is small, concentrated, and outside the sensitive surface list, Tier 1 is sufficient -- do not escalate "to be safe."

4. **Residual Work Gate** (REQUIRED when Tier 2 ran)

   After Tier 2 code review completes, inspect the Residual Actionable Work summary it returned (or read the run artifact directly if the summary was not emitted). If one or more residual `downstream-resolver` findings remain, do not proceed to Final Validation until the user decides how to handle them.

   **Pi-native residuals read.** When the `se_read_residuals` tool is registered (provided by `extensions/software-engineering.ts` once `extensions/se-review.ts` has emitted `se_review_finding` calls into the session log), call it with no arguments to get the structured, deduplicated residual set instead of re-parsing the review report. The tool excludes pre-existing and advisory findings by default; pass `includePreExisting: true` or `includeAdvisory: true` to widen. Persisting residuals through the session log means they survive `/compact` and `/fork`, and downstream skills like `se-resolve-pr-feedback` read the same set without re-running review.

   Ask the user using the platform's blocking question tool (`AskUserQuestion` in Claude Code with `ToolSearch select:AskUserQuestion` pre-loaded if needed, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension)). Fall back to numbered options in chat only when the harness genuinely lacks a blocking tool. Never silently skip the gate.

   Stem: `Code review found N residual finding(s) the skill did not auto-fix. How should the agent proceed?`

   Options (four or fewer, self-contained labels):
   - `Apply/fix now` — loop back into review with focused fixes; the agent investigates each finding, applies changes where safe, and re-runs review.
   - `File tickets via project tracker` — load `references/tracker-defer.md` in Interactive mode; the agent files tickets in the project's detected tracker (or `gh` fallback, or leaves them in the report if no sink exists) and proceeds to Final Validation.
   - `Accept and proceed` — record the residual findings verbatim in a durable "Known Residuals" sink before shipping. If a PR will be created or updated in Phase 4, include them in the PR description's "Known Residuals" section (the agent owns this through `references/commit-pr-workflow.md`). If the user later chooses the local-only commit path, create `docs/residual-review-findings/<branch-or-head-sha>.md`, include the accepted findings and source review-run context, stage it with the relevant atomic commit, and mention the file path in the final summary. The user has acknowledged the risk, but the findings must not live only in the transient session.
   - `Stop — do not ship` — abort the shipping workflow. The user will handle findings manually before re-invoking.

   Skip this gate entirely when the review reported `Residual actionable work: none.` or when only Tier 1 was used. Do not proceed past this gate on an `Accept and proceed` decision until the agent has recorded whether the durable sink is `PR Known Residuals` or `docs/residual-review-findings/<branch-or-head-sha>.md`.

5. **Final Validation**
   - All tasks marked completed
   - Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - If the plan has a `Requirements` section (or legacy `Requirements Trace`), verify each requirement is satisfied by the completed work
   - If any `Deferred to Implementation` questions were noted, confirm they were resolved during execution

6. **Prepare Operational Validation Notes** (when useful)
   - If the change has production/runtime impact, capture concise validation notes for the final summary: metrics/logs to watch, expected healthy signal, failure signal, and rollback/mitigation trigger.
   - If the developer explicitly asked for a PR, these notes become the PR description's `## Post-Deploy Monitoring & Validation` section.
   - If there is truly no production/runtime impact, say so in the final summary.

## Phase 4: Finish It

1. **Prepare Evidence Context**

   Do not invoke `se-demo-reel` directly in this step. Evidence capture belongs to the PR creation or PR description update flow, where the final PR diff and description context are available.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output). The commit/PR workflow will ask whether to capture evidence only when evidence is possible.

2. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  ->  status: completed
   ```

3. **Commit Remaining Atomic Slices**

   Create any remaining local atomic commits using the commit-only path in `references/commit-pr-workflow.md`. Do not push or open a PR unless the developer explicitly requested publication.

   Include only coherent, verified slices. If the work already produced atomic commits during Phase 2, commit only remaining plan-status, residual-doc, or final polish slices.

4. **Local Fast-Forward / Rebase Integration**

   After all local quality checks are green and commits are atomic, the agent is free to integrate local work back into the main branch with a fast-forward or rebase flow. Do not push unless explicitly asked.

   - If already on the main/default branch: no integration step is needed; report that work is complete on the current branch.
   - If in a worktree or non-default work branch: rebase the work onto the current local main/default branch if needed, then fast-forward main/default to the completed work.
   - If rebase conflicts occur: stop, surface the conflicting files, explain the attempted integration path, and ask for direction. Do not hand-resolve ambiguous conflicts silently.
   - Never create a classic merge commit.

   Example shape (adapt to the repo's default branch and worktree paths):

   ```bash
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   default_branch=${default_branch:-main}
   work_branch=$(git branch --show-current)

   git rebase "$default_branch"        # in the work checkout, only when needed
   cd <main-checkout>
   git merge --ff-only "$work_branch"  # fast-forward local main/default
   ```

   If the repository uses trunk style and the work was done directly on the default branch, the successful local commits are the integration.

5. **Publish Only When Explicitly Requested**

   If the developer explicitly asked to push, open/update a PR, or publish, read `references/commit-pr-workflow.md` and run its Publish / PR workflow. Otherwise skip GitHub publication entirely.

   When providing context for an explicit PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so the commit/PR workflow can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation notes (see Phase 3 Step 6)
   - Any "Known Residuals" accepted in the Phase 3 Residual Work Gate, rendered as a dedicated section in the PR body with severity, file:line, and title per finding

6. **Close Completed Backlog Item**

   If this work was promoted from a backlog item, close it once local integration is complete and verification is green. Use the Pi backlog tool when available:

   ```text
   tool: backlog_remove
   inputs: { id: <task-id>, reason: "Completed and locally integrated in <commit-or-branch>" }
   ```

   If the tool is unavailable, delete the matching `work/items/parking-lot/<id>-<slug>.md` file for ungraduated parked work in the same atomic commit as the final workflow cleanup and mention the removal in the final summary. For graduated work, archive the whole `work/items/active/<id>-<slug>/` folder to `work/items/.archive/<id>-<slug>/` with a terminal reason in `work.md`. Do not remove unrelated parked items. If the completed work produced durable lessons, first capture them with `se-compound`; the backlog item is not the long-term record.

7. **Optional PR Publication Addendum**

   Run this only when the developer explicitly asked to push/open/update a PR. After the PR exists, poll GitHub until the PR is ready, blocked, or the session times out. Watch both review approval and GitHub Actions/status checks; approval alone is not enough.

   Prefer the Pi PR supervisor extension when available:

   ```text
   tool: github_pr_supervise
   inputs: { pr: <number-or-url>, mergeWhenReady: false }
   ```

   If the PR supervisor tool is unavailable, use the GitHub CLI/API from the worktree:

   ```bash
   gh pr view --json url,number,reviewDecision,mergeStateStatus,statusCheckRollup,headRefName,baseRefName
   gh pr checks --watch --interval 30
   ```

   Merge only when the developer explicitly asked for merge/auto-merge. Use GitHub rebase/auto-rebase; never use classic merge commits.

8. **Clean Up Worktree**

   After local integration is complete, any completed backlog item is closed, and no more local changes are needed, clean up the local worktree when one was used. For explicitly requested PR publication, cleanup may wait until the PR is merged/closed. Do not remove a worktree that still contains uncommitted or unpushed changes.

   ```bash
   git status --short
   cd <main-checkout>
   git worktree remove .worktrees/<branch-name>
   git fetch --prune origin
   git branch -d <branch-name>
   ```

   If cleanup fails, report the exact reason and the path that needs manual cleanup. Do not force-delete (`-D` or `--force`) unless the user explicitly confirms after seeing the unmerged/uncommitted state.

9. **Plain-English Completion Summary**

   Finish with progressive disclosure:

   1. **TL;DR** — one short paragraph or 3 bullets naming what changed and whether it is integrated locally.
   2. **Verification** — exact local tests/typechecks/lint/format commands run and their pass/fail status.
   3. **Integration status** — current branch/main status, commit hashes, and whether anything was pushed (normally: not pushed).
   4. **Issues encountered** — surface problems hit along the way and how they were solved. If none, say so.
   5. **Significant code changes** — show only high-level snippets, type/interface shapes, or function signatures that are important to understand the work. Avoid dumping large diffs.
   6. **Backlog / follow-ups / residuals** — completed backlog item closed, new backlog items captured, known residuals, or "none".

## Quality Checklist

Before finishing locally or publishing, verify:

- [ ] All clarifying questions asked and answered
- [ ] All tasks marked completed
- [ ] Testing addressed -- local tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
- [ ] Typechecker/static analyzer passes when the project has one
- [ ] Formatter and linting pass
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Commit messages follow conventional format
- [ ] Code review completed (Tier 1 harness-native or Tier 2 `se-code-review`)
- [ ] Local integration is complete via current-branch commits, fast-forward, or rebase; no classic merge commit
- [ ] Nothing was pushed and no PR was opened unless explicitly requested
- [ ] Completed source backlog item is removed/closed when this work came from backlog
- [ ] Local worktree cleanup is complete when appropriate, or explicitly deferred
- [ ] Final summary uses progressive disclosure and includes verification, backlog closure status, issues/resolutions, and significant snippets/types

## Code Review Tiers

Every change gets reviewed. Default to Tier 1; escalate to Tier 2 only on a concrete signal. Tier 2 is materially more expensive in time and tokens.

**Tier 1 -- harness-native code review (default).** Run your built-in code review command or skill (e.g., `/review` in Claude Code). Address blocking and suggested findings inline. If the current harness has no built-in code review command or skill, escalate to Tier 2 -- Tier 1 cannot run.

**Tier 2 -- `se-code-review` (escalation).** Invoke `se-code-review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work routes through the Residual Work Gate.

Escalate to Tier 2 when any of these holds:
- Sensitive surface touched (auth/authz, payments/billing, data migrations or backfills, cryptography or secrets, security-relevant config, public API or library contracts, dependency manifests)
- Large and diffuse change (>=400 changed lines AND >3 directories or 2 subsystems)
- Very large change (>=1,000 changed lines)
- Plan or task explicitly requests a full / deep / thorough code review
