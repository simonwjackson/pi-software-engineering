# Commit, Push, and Pull Request Workflow

This reference is loaded by `se-work` when the user's intent is to commit, ship, open/update a pull request, or draft/update a PR description. It is also loaded from the Phase 4 shipping workflow after implementation, quality checks, and review are complete.

This workflow does **not** replace `se-work`'s execution discipline. The atomic commit rules in `../SKILL.md` remain authoritative: commit only coherent, working, reviewable slices; include the tests/docs/config required for that slice; exclude unrelated cleanup; verify before committing; never hide mixed concerns behind `git add .`.

## Asking the user

When this reference says "ask the user", use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting the question in chat only when no blocking tool exists in the harness or the call errors. Never silently skip the question.

## Intent modes

Select one mode from the user's request and current git state.

| Mode | Use when | Behavior |
|---|---|---|
| **Commit-only** | User says "commit", "save my changes", or explicitly asks for local-only commit | Create atomic commit(s), report hashes, stop. Do not push or create a PR. |
| **Ship / PR** | User says "ship", "open a PR", "commit and PR", or Phase 4 calls this workflow | Create any remaining atomic commits, push, create/update the PR, then return the PR URL. |
| **Description-only** | User asks only to write/draft/describe a PR | Generate title/body from the PR or branch diff and print it. Do not edit git state unless the user asks. |
| **Description update** | User asks to update/refresh/rewrite an existing PR description | Find the open PR, compose the replacement body, preview, confirm, then apply with `gh pr edit`. |

## Context

Gather context once unless the harness already injected equivalent data:

```bash
printf '=== STATUS ===\n'; git status
printf '\n=== DIFF ===\n'; git diff HEAD
printf '\n=== BRANCH ===\n'; git branch --show-current
printf '\n=== LOG ===\n'; git log --oneline -10
printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'
printf '\n=== PR_CHECK ===\n'; gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'
```

Resolve the default branch by stripping `origin/` from `git rev-parse --abbrev-ref origin/HEAD`. If unresolved, try:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

Fall back to `main` only if both fail.

## Commit-only workflow

1. If the working tree is clean, report that there is nothing to commit and stop.
2. If detached, ask whether to create a feature branch. If declined, continue only if the user explicitly wants a detached commit.
3. If on the default branch, warn and ask whether to create a feature branch first. Never commit directly to the default branch without explicit permission.
4. Determine the message convention:
   - documented repo convention already in context
   - recent commit history
   - default: conventional commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, `build`)
5. Split the current diff into atomic slices using `se-work`'s atomic commit rules. Use file-level grouping when clean; use `git add -p` when a file contains mixed concerns.
6. For each slice:
   - run the relevant verification for that slice
   - stage only the slice's files/hunks
   - inspect `git diff --cached`
   - commit with a message that names the one purpose
7. Run `git status`, then report commit hash(es) and subject(s).

## Ship / PR workflow

### 1. Resolve branch and state

If detached, ask to create a feature branch. Stop if the user declines.

If the working tree is clean:

1. Check upstream:
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{u}
   ```
2. If upstream exists, check for unpushed commits:
   ```bash
   git log <upstream>..HEAD --oneline
   ```
3. Route:
   - default branch with unpushed commits or no upstream: ask to create a feature branch; pushing default directly is not supported
   - default branch, all pushed, no open PR: report no feature branch work and stop
   - feature branch, no upstream: continue to push
   - feature branch, unpushed commits: continue to push
   - feature branch, all pushed, no open PR: skip commit/push and create PR
   - feature branch, all pushed, open PR: ask whether to refresh the PR description; otherwise report up to date

### 2. Branch if needed

If on the default branch and commits/changes need to move to a feature branch, read `references/branch-creation.md` and follow its decision flow. It handles stale local base, unpushed commits on local base, and uncommitted changes that collide with the fresh remote base.

### 3. Create any remaining atomic commits

Use the same commit-only workflow above, with two additions:

- When Phase 4 called this workflow after implementation, most slices should already be committed. Commit only remaining plan-status, residual-doc, or final polish slices.
- Keep `se-work`'s atomic boundaries. Do not squash a carefully built TDD/ATDD commit stack into one end-of-session commit.

### 4. Push

```bash
git push -u origin HEAD
```

### 5. Generate the PR title and body

Read `references/pr-description-writing.md` once and run it in current-branch mode by default, or PR mode when updating/describing a specific PR.

Before composition, decide evidence:

- If the user explicitly asked for evidence, attempt capture when useful.
- If the authored changes are clearly non-observable, skip evidence without asking.
- If the branch changes observable behavior and evidence is possible, ask whether to capture evidence, use existing evidence, or skip.
- Evidence capture, when selected, is handled by `se-demo-reel`; splice the returned URL/path into the body as instructed by `pr-description-writing.md`.

Include any Phase 3 context passed by `shipping-workflow.md`: testing notes, operational validation, design links, and accepted Known Residuals.

### 6. Create or update the PR

Write the body to a temp file and pass it with `--body-file`. Never pipe stdin, use `--body-file -`, or use `--body "$(cat ...)"`.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/se-pr-body.XXXXXX") && cat > "$BODY_FILE" <<'__SE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__SE_PR_BODY_END__
```

For a new PR:

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"
```

For an existing PR, preview before applying:

- report the new title and length
- quote the first two summary sentences
- report total body line count
- ask whether to apply

If confirmed:

```bash
gh pr edit --title "<TITLE>" --body-file "$BODY_FILE"
```

### 7. Report

Output the PR URL. If the harness can safely open a browser, also run:

```bash
gh pr view --web
```

## Description update workflow

1. Confirm the user wants to update the PR description for this branch.
2. Find the open PR with `gh pr view --json url,title,state`.
3. Read `references/pr-description-writing.md` once and run it in PR mode using the PR URL.
4. Apply any user focus as steering, not override. Do not fabricate content the diff does not support.
5. Preserve existing `## Demo` or `## Screenshots` blocks unless the user asks to refresh/remove them.
6. Preview the new title, summary lead, and body length. Ask before applying.
7. Apply with `gh pr edit --body-file` as above and report the PR URL.

## Description-only workflow

1. Read `references/pr-description-writing.md` once.
2. If the user provided a PR URL/number, run in PR mode; otherwise run in current-branch mode.
3. Print the title and body. Do not create temp files, commit, push, or edit the PR unless the user explicitly asks.
