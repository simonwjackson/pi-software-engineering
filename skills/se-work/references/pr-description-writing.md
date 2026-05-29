# PR Description Writing

How to resolve the right commit range and compose a PR title and body. Loaded on demand by `se-work` commit/PR callers — do not load earlier.

Step Pre-A resolves the commit range, diff, and (for existing PRs) the current PR body. Steps A through H assume Pre-A's outputs are in context.

---

## Step Pre-A: Resolve the PR commit range and diff

Determine which commits and diff the description should cover. Run this first; Steps A and beyond assume the commit list and full diff are in context.

### Mode

- **Current-branch mode.** Describe HEAD vs the repo's default base. Used when the caller has no explicit PR reference (the Ship / PR workflow in `commit-pr-workflow.md`, or description-only mode without a PR ref).
- **PR mode.** Describe a specific PR's commit range. Used by DU-3 (the existing PR on the current branch) and description-only mode (the user pasted a PR URL/number). The PR ref may be a bare number, `#NN`, `pr:NN`, or a full URL — the caller passes it to `gh pr view <ref>` directly. (`gh pr view` accepts numbers and URLs natively; `#NN` and `pr:NN` need the `#` or `pr:` stripped before passing.)

### Resolve PR metadata (PR mode and current-branch-with-existing-PR)

```bash
gh pr view [<ref>] --json baseRefName,headRefOid,baseRefOid,headRepository,headRepositoryOwner,isCrossRepository,url,body,state
```

If the returned `state` is not `OPEN`, report `"PR <number> is <state>; cannot generate description"` and exit gracefully — do not invent a description.

### Detect the base branch and remote

For PR mode (or current-branch mode with an existing PR), use `baseRefName` from the metadata above. For current-branch mode without an existing PR, resolve in priority order:

1. **Caller-supplied base** (if the caller passed `base:<ref>`) — use verbatim. The ref must resolve locally.
2. **Repo default branch** — `git rev-parse --abbrev-ref origin/HEAD`, strip `origin/` prefix.
3. **GitHub metadata** — `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`.
4. **Common names** — try `main`, `master`, `develop`, `trunk` in order via `git rev-parse --verify origin/<candidate>`.

If none resolve, ask the user to specify the base branch.

For the **base remote**, parse `owner/repo` from the PR URL (or use the repo of the current checkout in current-branch mode without a PR) and match against `git remote -v` fetch URLs (handle both `git@github.com:owner/repo` and `https://github.com/owner/repo` forms; strip `.git`). The matching remote name is `<base-remote>`. **If no remote matches** (fork-based PR with no `upstream` remote), do NOT default to `origin` — `origin` would diff against the wrong base. Skip directly to Case B.

### Case A — base remote matched, attempt local git

**Only fetch when the refs aren't already local.** Skipping the fetch when refs resolve locally preserves offline / restricted-network / expired-auth workability — a common case when re-running the skill on a branch that's already been fetched recently.

```bash
PR_HEAD_SHA=<headRefOid>   # for current-branch mode, use HEAD instead

if ! git rev-parse --verify <base-remote>/<baseRefName> >/dev/null 2>&1 \
  || ! git rev-parse --verify $PR_HEAD_SHA >/dev/null 2>&1; then
  git fetch --no-tags <base-remote> <baseRefName> $PR_HEAD_SHA
fi

MERGE_BASE=$(git merge-base <base-remote>/<baseRefName> $PR_HEAD_SHA) \
  && echo '=== COMMITS ===' && git log --oneline "$MERGE_BASE..$PR_HEAD_SHA" \
  && echo '=== DIFF ===' && git diff "$MERGE_BASE...$PR_HEAD_SHA"
```

For current-branch mode, `$PR_HEAD_SHA` is `HEAD` which is always local, so only the base ref needs fetching. Using the explicit `$PR_HEAD_SHA` in downstream commands avoids `FETCH_HEAD`'s multi-ref ordering problem.

If `git merge-base` itself fails (shallow clone with insufficient history, or genuinely unrelated histories), do not press on — fall through to Case B and let the API path produce the diff and commits.

### Case A inner fallback — SHA fetch rejected

Some GHES configurations disallow fetching non-tip SHAs. If the SHA fetch is rejected (PR mode only — current-branch mode uses HEAD which is always local), fall back to fetching the PR head via `refs/pull/<number>/head`:

```bash
git fetch --no-tags <base-remote> "refs/pull/<number>/head"
PR_HEAD_SHA=$(awk '/refs\/pull\/[0-9]+\/head/ {print $1; exit}' "$(git rev-parse --git-dir)/FETCH_HEAD")
```

Then re-run the merge-base + log + diff with the new `$PR_HEAD_SHA`.

### Case B — API only

Use Case B when:
- No local remote matches the PR's base repo (fork-PR, cross-repo PR), OR
- Case A's fetches all fail (offline, restricted network, expired auth, GHES quirks blocking both SHA and `refs/pull/N/head`).

Skip local git entirely:

```bash
gh pr diff <ref>
gh pr view <ref> --json commits --jq '.commits[] | [.oid[0:7], .messageHeadline] | @tsv'
```

Note in the user-facing output that the API fallback was used.

### Empty range

If the resulting commit list is empty (HEAD already merged into the base, or the branch has no unique commits), report `"No commits to describe"` and exit gracefully — do not invent a description.

---

## Step A: Classify commits

Scan the commit list and classify each commit:

- **Feature commits** -- implement the PR's purpose (new functionality, intentional refactors, design changes). These drive the description.
- **Fix-up commits** -- iteration work (code review fixes, lint fixes, test fixes, rebase resolutions, style cleanups). Invisible to the reader.

When sizing the description, mentally subtract fix-up commits: a branch with 12 commits but 9 fix-ups is a 3-commit PR.

---

## Step B: Decide on evidence

Decide whether to include an evidence section in the body.

**Evidence is possible** when the diff changes observable behavior demonstrable from the workspace: UI, CLI output, API behavior with runnable code, generated artifacts, or workflow output.

**Evidence is not possible** for:
- Docs-only, markdown-only, changelog-only, release metadata, CI/config-only, test-only, or pure internal refactors
- Behavior requiring unavailable credentials, paid/cloud services, bot tokens, deploy-only infrastructure, or hardware not provided

**Decision logic:**

1. **Existing PR body contains a `## Demo` or `## Screenshots` section with image embeds:** preserve it verbatim unless the user's focus asks to refresh or remove it. Include the preserved block in the body.
2. **No existing evidence block:** omit the evidence section entirely unless the caller already captured evidence and passed it in (e.g., a `se-demo-reel` URL).

Do not label test output as "Demo" or "Screenshots". Place any preserved evidence block before the Software Engineering badge.

---

## Step C: Frame the narrative

Articulate the PR's narrative frame:

1. **Risk**: One line. `low` / `low–medium` / `medium` / `high`. What are the design judgments, unverified claims, or held scope items the reviewer should weigh? This is the absolute first line of the body for any non-trivial PR — it lets the reviewer make the trust-or-read-code decision before reading anything else.
2. **Before**: What was broken, limited, or impossible? (One sentence.)
3. **After**: What's now possible or improved? (One sentence.)
4. **Scope rationale** (only if 2+ separable-looking concerns): Why do these ship together? (One sentence.)

This frame becomes the opening. For small+simple PRs, the "after" sentence (preceded by the Risk line) may be the entire description.

### Risk line calibration

The Risk line is an honest triage call. It commits the AI to a judgment the reviewer can disagree with.

- **low** — no design judgments worth scrutinizing, no unverified claims, no held scope. Mechanical refactor, typo, dep bump, doc fix. Reviewer will skim and merge.
- **low–medium** — 1–3 design choices with reasonable alternatives, OR one validation claim carried forward from a prior session, OR one deliberate scope hold for sequencing reasons. Reviewer can probably trust the AI but should scan the inline callouts.
- **medium** — multiple design judgments, OR a contract change with downstream consumers, OR partial verification (some claims unrun). Reviewer should scan the body and probably spot-check one named file.
- **high** — load-bearing architecture change, irreversible operation, security-touching change, OR significant unverified claims, OR scope expanded beyond the original brief. Reviewer should read the code; the body's job is to make that read efficient.

Calibrate honestly. A `high` line that turns out to be `low` after review trains the reviewer to ignore the next high. A `low` that turns out to be `high` is the worse failure mode.

---

## Step D: Size the change

Assess size (files, diff volume) and complexity (design decisions, trade-offs, cross-cutting concerns) to select description depth:

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | Short narrative, ~3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame (before/after/scope), then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + up to 3-5 design-decision callouts + 1-2 sentence test summary + key docs links. Target ~100 lines, cap ~150. For PRs with many mechanisms, use a Summary-level table to list them; do NOT create an H3 subsection per mechanism. Reviewers scrutinize decisions, not inventories — the diff and spec files carry the detail. If you find yourself writing 10+ subsections, consolidate to a table. |
| Performance improvement | Include before/after measurements if available. Markdown table works well. |

When in doubt, shorter is better. Match description weight to change weight. Large PRs need MORE selectivity, not MORE content.

### Shape selection (risk × size)

After sizing, select a body shape. The shape determines whether the Decisions / Claims / Held-scope content appears as structured sections or woven into prose.

| Risk        | Size                                  | Shape                                                                                                                                                                              |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low         | small + simple                        | 1–2 sentences. Risk line + after-sentence may be the entire body.                                                                                                                  |
| low         | small + non-trivial                   | Tightened narrative under 2–3 headings. No triage block.                                                                                                                            |
| low–medium  | any                                   | **Default: tightened narrative.** Headings, separators, inline bolded callouts for decisions worth a glance. Decision timeline folded.                                              |
| medium      | medium                                | Tightened narrative + structured triage block (`## Decisions worth a glance` / `## Claims worth checking` / `## Deliberately not done`). Decision timeline folded.                  |
| medium–high | large or architecturally significant  | Structured triage block at top + narrative for the design story + visuals. Multiple folded reference sections (Decision timeline, layout/asserts, review fixes).                    |
| high        | any                                   | Full structured top + narrative reasoning + visuals + all folded reference sections. The body's job is to make a code read efficient, not to substitute for one.                    |

The **tightened narrative** is the default for most AI-implemented PRs because it makes the AI's reasoning visible *as reasoning* — the reviewer can disagree with a sentence, which is harder to do with a bullet. Switch to **structured-on-top** when there are more than ~4 calls worth flagging (prose doesn't carry that many cleanly) or when the reviewer's likely first action is "what should I scrutinize, listed."

---

## Step E: Apply writing principles

### Writing voice

If the repo has documented style preferences in context, follow those. Otherwise:

- Active voice. No em dashes or `--` substitutes; use periods, commas, colons, or parentheses.
- Vary sentence length. Never three similar-length sentences in a row.
- Do not make a claim and immediately explain it. Trust the reader.
- Plain English. Technical jargon fine; business jargon never.
- No filler: "it's worth noting", "importantly", "essentially", "in order to", "leverage", "utilize."
- Digits for numbers ("3 files"), not words ("three files").

### Writing principles

- **Lead with value**: Open with what's now possible or fixed, not what was moved around. The subtler failure is leading with the mechanism ("Replace the hardcoded capture block with a tiered skill") instead of the outcome ("Evidence capture now works for CLI tools and libraries, not just web apps").
- **No orphaned opening paragraphs**: If the description uses `##` headings anywhere, the opening must also be under a heading (e.g., `## Summary`). For short descriptions with no sections, a bare paragraph is fine.
- **Describe the net result, not the journey**: The description covers the end state, not how you got there. No iteration history, debugging steps, intermediate failures, or bugs found and fixed during development. This applies equally when regenerating for an existing PR: rewrite from the current state, not as a log of what changed since the last version. Exception: process details critical to understand a design choice.
- **When commits conflict, trust the final diff**: The commit list is supporting context, not the source of truth. If commits describe intermediate steps later revised or reverted, describe the end state from the full branch diff.
- **Explain the non-obvious**: If the diff is self-explanatory, don't narrate it. Spend space on things the diff doesn't show: why this approach, what was rejected, what the reviewer should watch.
- **Use structure when it earns its keep**: Headers, bullets, and tables aid comprehension, not mandatory template sections.
- **Markdown tables for data**: Before/after comparisons, performance numbers, or option trade-offs communicate well as tables.
- **No empty sections**: If a section doesn't apply, omit it. No "N/A" or "None."
- **Test plan — only when non-obvious**: Include when testing requires edge cases the reviewer wouldn't think of, hard-to-verify behavior, or specific setup. Omit when "run the tests" is the only useful guidance. When the branch adds test files, name them with what they cover.
- **No Commits section**: GitHub already shows the commit list in its own tab. A Commits section in the PR body duplicates that without adding context. Omit unless the commits need annotations explaining their ordering or shipping rationale.
- **No Review / process section**: Do not include a section describing how the reviewer should review (checklists of things to look at, process bullets). Process doesn't help the reviewer evaluate code. Call out specific non-obvious things to scrutinize inline with the change that warrants it.

### Visual communication

Include a visual aid only when the change is structurally complex enough that a reviewer would struggle to reconstruct the mental model from prose alone.

**The core distinction — structure vs. parallel variation:**

- Use a **Mermaid diagram** when the change has **topology** — components with directed relationships (calls, flows, dependencies, state transitions, data paths). Diagrams express "A talks to B, B talks to C, C does not talk back to A" in a way tables cannot.
- Use a **markdown table** when the change has **parallel variation of a single shape** — N things that share the same attributes but differ in their values. Tables express "option 1 costs X, option 2 costs Y, option 3 costs Z" cleanly.

Architecture changes are almost always topology (components + edges), so Mermaid is usually the right call — a table of "components that interact" loses the edges and becomes a flat list. Reserve tables for genuinely parallel data: before/after measurements, option trade-offs, flag matrices, config enumerations.

**When to include (prefer Mermaid, not a table, for architecture/flow):**

| PR changes... | Visual aid |
|---|---|
| Architecture touching 3+ interacting components (the components have *directed relationships* — who calls whom, who owns what, which skill delegates to which) | **Mermaid** component or interaction diagram. Do not substitute a table — tables cannot show edges. |
| Multi-step workflow or data flow with non-obvious sequencing | **Mermaid** flow diagram |
| State machine with 3+ states and non-trivial transitions | **Mermaid** state diagram |
| Data model changes with 3+ related entities | **Mermaid** ERD |
| Before/after performance or behavioral measurements (same metric, different values) | **Markdown table** |
| Option or flag trade-offs (same attributes evaluated across variants) | **Markdown table** |
| Feature matrix / compatibility grid | **Markdown table** |

**When in doubt, ask: "Does the information have edges (A → B) or does it have rows (attribute × variant)?"** Edges → Mermaid. Rows → table. Architecture has edges almost by definition.

**When to skip any visual:**
- Sizing routes to "1-2 sentences"
- Prose already communicates clearly
- The diagram would just restate the diff visually
- Mechanical changes (renames, dep bumps, config, formatting)

**Format details:**
- **Mermaid** (default for topology). 5-10 nodes typical, up to 15 for genuinely complex changes. Use `TB` direction. Source should be readable as fallback.
- **ASCII diagrams** for annotated flows needing rich in-box content. 80-column max.
- **Markdown tables** for parallel-variation data only.
- Place inline at point of relevance, not in a separate section.
- Prose is authoritative when it conflicts with a visual.

Verify generated diagrams against the change before including.

### Self-skeptical voice (AI-authored PRs)

When the AI implemented the change, the description is a report to a supervisor, not a marketing artifact. Honesty about uncertainty is what makes the description useful as a triage instrument.

- **Mark claim provenance.** If a verification claim was carried forward from a prior session rather than re-run, say so explicitly: `"X (run on YYYY-MM-DD) is referenced from a prior note, not re-run this session."` Do not promote unverified claims to the top of the body as live evidence.
- **Name design choices as choices.** When the AI made a call with a reasonable alternative, name the alternative and the reason for the choice. `"Default is X; flip to Y if you'd prefer per-device opt-in."` This gives the reviewer a one-line escape hatch instead of forcing a code dive to disagree.
- **Distinguish what was done from what was held.** Sequencing decisions belong in the body, not buried as TODOs in code.
- **Avoid marketing phrasing for unverified work.** "Validated", "verified", "tested" carry provenance. Use them only when you ran the check in this session. For carried-forward signals use "carried forward", "byte-identical to the recipe that produced X", "reference checks unchanged."
- **Defend chosen positions in writing, not by deferring to authority.** If a decision was made because a user asked, the body should still defend why the new position is correct — not just say "user asked." If the feedback was wrong and the AI pushed back successfully, that defense also belongs in the body.

### File mentions are clickable

Whenever the body names a real file path more than once, or the file is the load-bearing artifact for the change, link it. The link target depends on whether the file is *in this PR's diff* or *referenced but unchanged*.

**Default: diff anchor.** For files modified, created, or deleted in this PR, link to the file's anchor in the Files Changed tab:

```
[`<path>`](https://github.com/<owner>/<repo>/pull/<N>/files#diff-<sha256-of-path>)
```

The anchor is the lowercase hex SHA-256 of the file path string (UTF-8, no newline). One line of shell to compute it:

```bash
printf '%s' '<path>' | sha256sum | awk '{print $1}'
```

Clicking the link drops the reviewer directly onto that file's diff in the PR view — the highest-value affordance for a triaging reviewer.

**Fallback: blob URL.** For files *referenced but not modified* in this PR (e.g. "`X.nix` stays in the import path because pinned consumer still depends on it"), the diff anchor would 404. Link to the file as it exists on the PR's head branch instead:

```
[`<path>`](https://github.com/<owner>/<repo>/blob/<head-branch>/<path>)
```

Use the PR's `headRefName` (from `gh pr view --json headRefName`) as the branch segment. Branch names with slashes work — GitHub disambiguates against existing refs.

**Mechanics:**

- Determine which files are in the PR's diff once: `gh pr diff <N> --name-only` (or use the diff already gathered in Step Pre-A).
- Use backticks inside the link text so the path renders as code.
- Do not link file paths inside fenced code blocks (markdown won't render the link).
- Link the prominent mentions, not every inline reference. Aim for: the "if you read one file" pointer, top-of-section "lives in X" / "declared in Y" callouts, scope-hold mentions, and consumer-side references when they name real files.

### Headings and separators

For any PR that uses the tightened-narrative or structured shape (low–medium risk or higher), use `##` headings per section and `---` thematic breaks between major sections. This adds scaffolding the reviewer can navigate, and breaks up dense prose without sacrificing voice. Trivial PRs (single-paragraph bodies) skip both.

### Numbering and references

Never prefix list items with `#` in PR descriptions — GitHub interprets `#1`, `#2` as issue references and auto-links them.

When referencing actual GitHub issues or PRs, use `org/repo#123` or the full URL. Never use bare `#123` unless verified.

### Applying user focus

If the user provided a focus hint (e.g., "emphasize the benchmarks", "this needs to read as a migration not a feature"), incorporate it alongside the diff-derived narrative. Treat focus as steering, not override: do not invent content the diff does not support, and do not suppress important content the diff demands simply because focus did not mention it. When focus and diff materially disagree (e.g., focus says "include benchmarking" but the diff has no benchmarks), surface the conflict to the user rather than fabricating content.

---

## Step F: Compose the title

Title format: `type: description` or `type(scope): description`.

- **Type** is chosen by intent, not file extension or diff shape. `feat` for new functionality, `fix` for a bug fix, `refactor` for a behavior-preserving change, `docs` for doc-only, `chore` for tooling/maintenance, `perf` for performance, `test` for test-only. Where `fix` and `feat` could both seem to fit, default to `fix`: a change that remedies broken or missing behavior is `fix` even when implemented by adding code. Reserve `feat` for capabilities the user could not previously accomplish. The user may override.
- **Scope** (optional) is the narrowest useful label: a skill/agent name, CLI area, or shared area. Omit when no single label adds clarity.
- **Description** is imperative, lowercase, under 72 characters total. No trailing period.
- If the repo has commit-title conventions visible in recent commits, match them.

Breaking changes use `!` (e.g., `feat!: ...`) or document in the body with a `BREAKING CHANGE:` footer. Do not apply either marker without explicit user confirmation — they trigger automated major-version bumps in some release tooling.

---

## Step G: Compose the body

Assemble the body in this order. Skip any section that doesn't apply; include the rest in this sequence.

1. **Risk line.** First line of the body. Bold prefix, one sentence: `**Risk: <level>.** <what to weigh in one sentence>`. Required for low–medium and above. Optional for low + small.

2. **Thematic break.** `---` after the Risk line for any PR with `##` sections.

3. **`## Context`** (1–3 sentences). The before-state in plain English. Skip for trivial PRs.

4. **`## What this changes`** (or similar). The after-state. Lead with what's now possible or fixed, not what was moved around.

5. **Architecture / boundary diagram.** Mermaid, when the change has topology (components + edges). Inline at point of relevance, not a separate section. See the visual-communication subsection of Step E for the topology-vs-table choice.

6. **`## The new option surface`** (or `## The new API`, `## The new schema`, etc.). The shape callers see. A code block showing the interface, immediately followed by a paragraph of inline bolded callouts on the decisions worth a glance:
   - `**<option> defaults to <value>** — <reason>; <one-line flip suggestion>.`
   - Bold the option name + chosen value, not the whole sentence.
   - 2–4 callouts maximum. If there are more than 4, switch to a structured `## Decisions worth a glance` block of bullets above the code.

7. **`## Mechanism`** (when the PR adds non-trivial logic — e.g. `## Bootstrap`, `## Migration`, `## Reconciler`). One paragraph naming the file it lives in (link the path) and the load-bearing properties (ordering, idempotency, failure mode, retries).

8. **`## Consumer impact`** (when the PR changes a contract that has callers). A before/after code block showing what a caller's call site looks like. Mark "illustrative" if the after-side ships in a future PR.

9. **`## Scope hold`** (when something was deliberately not done). One paragraph naming what was held, what depends on it being held, and where the cleanup ships.

10. **`## Verification asterisk`** (or inline). Claims that were carried forward rather than re-run, partial verification, environment caveats. Self-skeptical voice rules from Step E apply.

11. **If you read one file.** A bolded one-liner pointing to the single most important file to read, with a link. Place after the last visible section and before the folded details. Skip for trivial PRs or when no single file dominates.

12. **`<details>` Decision timeline.** Folded. Numbered list of choice points, each with `chose / considered / why`. Include 5–10 entries for medium+ risk. Skip for trivial PRs.

    ```markdown
    <details>
    <summary><strong>Decision timeline</strong></summary>

    1. **<question>?**
       - considered: <alternative>
       - chose: <chosen>
       - why: <one-line reason>
    </details>
    ```

13. **`<details>` Review fixes** (only when a review-and-fix cycle happened in this session). Folded. Each entry names the source of the feedback, what changed, the commit, and why the new position is correct.

    ```markdown
    <details>
    <summary><strong>Review fixes</strong></summary>

    1. **<source>: "<concern>"**
       - changed: <what>
       - commit: <sha-or-link>
       - why right: <one line> (or "applied without strong opinion")
    </details>
    ```

    Sources to distinguish: user comment, automated review (CI/lint/contract check), self-review (AI noticed on re-read). "Why right" matters even when the AI flipped its position — the body defends the new position, not the act of accepting feedback.

14. **`<details>` Scaffolding** (e.g. `Module layout, systemd ordering, contract assertions`). Folded reference material: file tree diffs, ordering diagrams, full assertion lists, configuration enumerations. Anything useful for spot-checking but not for triage.

15. **Test plan.** Only when non-obvious per Step E. Omit when "run the tests" is the only useful guidance.

16. **Evidence block.** From Step B, if present. Do not fabricate.

17. **Software Engineering badge.** From below.

The visible body (sections 1–11) answers "should I read the code?" The folded sections (12–14) answer "where did you get that?" and "what does the scaffolding look like?" once the reviewer has decided to dig in.

**Badge:**

```markdown
---

[![Software Engineering](https://img.shields.io/badge/Built_with-Software_Engineering-6366f1)](https://github.com/simonwjackson/pi-software-engineering)
![HARNESS](https://img.shields.io/badge/MODEL_SLUG-COLOR?logo=LOGO&logoColor=white)
```

**Harness lookup:**

| Harness | `LOGO` | `COLOR` |
|---------|--------|---------|
| Claude Code | `claude` | `D97757` |
| Codex | (omit logo param) | `000000` |
| Gemini CLI | `googlegemini` | `4285F4` |

**Model slug:** Replace spaces with underscores. Append context window and thinking level in parentheses if known. URL-encode literal parens as `%28` and `%29` — unencoded `(` and `)` inside a markdown image URL break some commit-message parsers (notably release-please's conventional-commits parser, which fails the whole commit on encountering them and silently skips it from the changelog). Examples: `Opus_4.6_%281M,_Extended_Thinking%29`, `Sonnet_4.6_%28200K%29`, `Gemini_3.1_Pro`.

---

## Step H: Compression pass

Before applying, re-read the composed body and apply these cuts:

- If any body section restates content already in the `## Summary`, remove it. The Summary plus the diff should carry the reader.
- If "Testing" or "Test plan" has more than 2 paragraphs, compress to bullets.
- If a "Commits" section enumerates the commit log, remove it — GitHub shows it in its own tab.
- If a "Review" or process-oriented section lists how to review, remove it. Move any truly non-obvious review hints inline with the relevant change.
- If the body has 5+ H3 subsections that each describe one mechanism, consolidate them into a single table row per mechanism under one header. Reserve prose H3 callouts for 2-3 genuine design decisions.
- If the body exceeds the sizing-table target by more than 30%, compress the longest non-Summary section by half.
- If the Risk line is `low` but the body has structured triage sections (`## Decisions worth a glance` etc.), demote them to inline bolded callouts in the surface paragraph.
- If the Risk line is `high` but the body lacks a Decision timeline or an "If you read one file" pointer, add them. High-risk PRs need both provenance and a focused-read target.
- If file paths in visible prose are not linked, link the prominent ones — diff anchors (`/pull/N/files#diff-<sha256(path)>`) for files in the PR's diff, blob URLs on the head branch for files referenced but unchanged. Skip paths inside code fences.
- If a Decision timeline entry's `why` is "user asked for it" without further reasoning, the AI is dodging — replace with the real defense of the chosen position, or remove the entry.
- If the body uses any `##` headings but lacks `---` thematic breaks between major sections, add them. Visual scaffolding matters for triage.
- If a verification claim uses "validated" or "verified" but was carried forward from a prior session rather than re-run, downgrade to "carried forward" or "reference checks unchanged" and surface the provenance.

**Value-lead check.** Re-read the first sentence of the Summary. If it describes what was moved around, renamed, or added ("This PR introduces three-tier autofix..."), rewrite to lead with what's now possible or what was broken and is now fixed ("Document reviews previously produced 14+ findings requiring user judgment; this PR cuts that to 4-6.").

Large PRs benefit from selectivity, not comprehensiveness.
