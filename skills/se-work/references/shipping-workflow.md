# Shipping Workflow

This file contains the shipping workflow (Phase 3-4). It is loaded when all Phase 2 tasks are complete and execution transitions to quality check.

## Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per AGENTS.md)
   # Use linting-agent before pushing to origin
   ```

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

6. **Prepare Operational Validation Plan** (REQUIRED)
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change.
   - Include concrete:
     - Log queries/search terms
     - Metrics or dashboards to watch
     - Expected healthy signals
     - Failure signals and rollback/mitigation trigger
     - Validation window and owner
   - If there is truly no production/runtime impact, still include the section with: `No additional operational monitoring required` and a one-line reason.

## Phase 4: Ship It

1. **Prepare Evidence Context**

   Do not invoke `se-demo-reel` directly in this step. Evidence capture belongs to the PR creation or PR description update flow, where the final PR diff and description context are available.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output). The commit/PR workflow will ask whether to capture evidence only when evidence is possible.

2. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  ->  status: completed
   ```

3. **Commit, Push, and Create Pull Request**

   Read `references/commit-pr-workflow.md` to handle any remaining atomic commits, pushing, and PR creation. Creating or updating a PR is the default shipping path for `/se-work`; only skip the PR when the user explicitly asks not to publish one. Do not use the local-only commit path unless the user explicitly requests it.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so the commit/PR workflow can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 6)
   - Any "Known Residuals" accepted in the Phase 3 Residual Work Gate, rendered as a dedicated section in the PR body with severity, file:line, and title per finding

   After creation/update, show the PR to the user by reporting the URL. If the harness can safely open a browser, also run:

   ```bash
   gh pr view --web
   ```

4. **Monitor Pull Request Gates**

   After the PR exists, poll GitHub until the PR is ready to merge, blocked, or the session times out. Watch both review approval and GitHub Actions/status checks; approval alone is not enough.

   Prefer the Pi PR supervisor extension when available:

   ```text
   tool: github_pr_supervise
   inputs: { pr: <number-or-url>, mergeWhenReady: false }
   ```

   It gates on review approval, status-check rollup, and mergeability. If the PR supervisor tool is unavailable, use the GitHub CLI/API from the worktree:

   ```bash
   gh pr view --json url,number,reviewDecision,mergeStateStatus,statusCheckRollup,headRefName,baseRefName
   gh pr checks --watch --interval 30
   ```

   If individual Actions runs fail and the harness provides `github_actions_supervise`, use it for the failed run IDs to summarize failed jobs/steps before returning to implementation.

   Gate states:
   - **Ready**: `reviewDecision` is `APPROVED`, required checks/actions are successful, and GitHub reports the PR mergeable or clean enough for the chosen merge strategy.
   - **Needs changes**: a review requests changes, checks fail, or Actions fail. Fix in the same worktree, add atomic follow-up commits, push, and resume polling.
   - **Waiting**: reviews or checks are still pending. Keep the PR URL visible and continue polling when the user asks, or stop with a clear pending status if the session should end.

5. **Merge Approved Pull Request**

   Default merge strategy is rebase through GitHub. Prefer the Pi PR supervisor extension when available:

   ```text
   tool: github_pr_supervise
   inputs: { pr: <number-or-url>, mergeWhenReady: true, enableAutoMerge: true, cleanupWorktree: false }
   ```

   If the PR supervisor tool is unavailable, use GitHub CLI:

   ```bash
   gh pr merge --rebase --delete-branch
   ```

   Never use classic merge commits for `/se-work` shipping. Rebase merge preserves the atomic commit stack without adding a noisy merge commit and respects GitHub branch protection. If the repository has auto-merge enabled and checks/reviews are still pending, prefer:

   ```bash
   gh pr merge --auto --rebase --delete-branch
   ```

   Use a local fast-forward merge only when the user explicitly requests it and branch protection permits direct pushes:

   ```bash
   git fetch origin
   git switch <base-branch>
   git merge --ff-only <feature-branch>
   git push origin <base-branch>
   git push origin --delete <feature-branch>
   ```

   If rebase merge is unavailable because repository settings disallow it, stop and report the repository configuration issue instead of falling back to a classic merge commit.

6. **Clean Up Worktree**

   After the PR is merged, closed as unneeded, or the user explicitly says the work is done and no more local changes are needed, clean up the local worktree and feature branch. Do not remove a worktree that still contains uncommitted or unpushed changes.

   Prefer the Pi PR supervisor extension when it is available and no further local commands need to run from the worktree:

   ```text
   tool: github_pr_supervise
   inputs: { pr: <number-or-url>, cleanupWorktree: true }
   ```

   Otherwise, clean up from outside the worktree:

   ```bash
   git status --short
   cd <main-checkout>
   git worktree remove .worktrees/<branch-name>
   git fetch --prune origin
   git branch -d <branch-name>
   ```

   If cleanup fails, report the exact reason and the path that needs manual cleanup. Do not force-delete (`-D` or `--force`) unless the user explicitly confirms after seeing the unmerged/uncommitted state.

7. **Notify User**
   - Summarize what was completed
   - Link to the PR
   - State whether it was merged, auto-merge was enabled, or it is waiting on review/checks
   - Confirm whether the remote branch and local worktree were cleaned up
   - Note any follow-up work needed
   - Suggest next steps if applicable

## Quality Checklist

Before creating PR, verify:

- [ ] All clarifying questions asked and answered
- [ ] All tasks marked completed
- [ ] Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Evidence decision handled by `references/commit-pr-workflow.md` when the change has observable behavior
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Code review completed (Tier 1 harness-native or Tier 2 `se-code-review`)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] PR description includes Software Engineered badge with accurate model and harness
- [ ] PR approval and GitHub Actions/status checks have been polled and reported
- [ ] Merge strategy is rebase/auto-rebase, never classic merge
- [ ] Local worktree cleanup is complete after merge/close, or explicitly deferred because the PR is still waiting

## Code Review Tiers

Every change gets reviewed. Default to Tier 1; escalate to Tier 2 only on a concrete signal. Tier 2 is materially more expensive in time and tokens.

**Tier 1 -- harness-native code review (default).** Run your built-in code review command or skill (e.g., `/review` in Claude Code). Address blocking and suggested findings inline. If the current harness has no built-in code review command or skill, escalate to Tier 2 -- Tier 1 cannot run.

**Tier 2 -- `se-code-review` (escalation).** Invoke `se-code-review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work routes through the Residual Work Gate.

Escalate to Tier 2 when any of these holds:
- Sensitive surface touched (auth/authz, payments/billing, data migrations or backfills, cryptography or secrets, security-relevant config, public API or library contracts, dependency manifests)
- Large and diffuse change (>=400 changed lines AND >3 directories or 2 subsystems)
- Very large change (>=1,000 changed lines)
- Plan or task explicitly requests a full / deep / thorough code review
