# pi-software-engineering

Software Engineering workflows, skills, reviewer personas, and subagent support for the Pi coding agent.

## Install

```bash
pi install git:github.com/simonwjackson/pi-software-engineering
```

This package includes:

- SE workflow skills under `skills/`
- SE reviewer/research subagents under `agents/`
- selected engineering skills adapted from Matt Pocock's `skills` project
- `pi-subagents` as a bundled dependency from https://github.com/nicobailon/pi-subagents
- a small extension that exposes packaged SE agents to `pi-subagents` through managed symlinks in `~/.pi/agent/agents`
- an `se-review` extension that registers the `se_review_finding` tool for structured review-finding emission
- session-log-backed SE state (`se:phase`, `se:worktree`, `se:test-state`, `se:review-finding`, `se:backlog`, ...) so runtime state survives `/compact`, `/fork`, and worktree changes
- backlog tools (`backlog_add`, `backlog_list`, `backlog_promote`, `backlog_remove`, `backlog_export`) backed by the session log; `backlog/` is an explicit export target, not the primary store
- an `se_read_residuals` tool that reads the unresolved review-finding set for downstream skills (`se-work` shipping workflow, `se-resolve-pr-feedback`)
- automatic test-runner observation: bash invocations that match the runner table (`npm test`, `pytest`, `cargo test`, `bun test`, `mise run test*`, `bin/rails test`, `go test`, `rspec`, `jest`, `vitest`, `node --test`, ...) populate `se:test-state` so downstream guardrails can refuse RED-state commits

Decision records for retired surfaces live under `decisions/`. The SE state
substrate and entry-type catalogue are documented in `docs/SE-STATE.md`.

## Power-user skills

Three skills are `/skill:name`-only and intentionally hidden from auto-invocation to keep the system prompt small:

- `/skill:se-compound-refresh` — sweep stale docs under `docs/solutions/`
- `/skill:se-session-extract` — extract a single session file (used by session-research agents)
- `/skill:se-session-inventory` — enumerate session files across platforms (used by session-research agents)

## Development

The package is intentionally broad. Add future Software Engineering workflows, review personas, research agents, and automation here rather than scattering `se-*` resources directly under `~/.pi/agent`.

Package agents are canonical in `agents/`. Package skills are canonical in `skills/`.

### Cheap judge model (optional)

Several SE skills (`se-code-review` Tier 2 personas, `se-doc-review`,
`se-optimize`, `se-product-pulse`) do work that doesn't need the user's
primary frontier model: scoring rubrics, checking against a fixed
template, summarising long inputs against a short prompt. The package
registers an optional `se-judge` provider for those calls when configured.

Opt in via environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `SE_JUDGE_MODEL` | **Required.** Model id at the underlying provider. | unset — provider not registered |
| `SE_JUDGE_API` | One of `openai-chat-completions`, `openai-responses`, `anthropic-messages`. | `openai-chat-completions` |
| `SE_JUDGE_BASE_URL` | Provider base URL. Required for non-default APIs. | unset |
| `SE_JUDGE_API_KEY` | API key string or `$ENV_NAME` reference. | unset |
| `SE_JUDGE_CONTEXT_WINDOW` | Override declared context window. | 128000 |
| `SE_JUDGE_MAX_TOKENS` | Override declared max output tokens. | 4096 |

When `SE_JUDGE_MODEL` is unset, the provider is not registered and SE
skills fall through to the user's primary model. Skills that route
through `se-judge` (currently `se-code-review`) do so as a deliberate
intent expressed in their prose, not by changing the default model.

### Per-repo SE resources

The `software-engineering` extension auto-discovers project-specific SE
resources from the working directory on every `session_start` and `/reload`:

| Layout | Resource kind |
|---|---|
| `.software-engineering/skills/` | skills |
| `docs/playbooks/` | skills |
| `agents/` | skills |
| `.software-engineering/prompts/` | prompt templates |
| `.software-engineering/themes/` | themes |

Missing directories are skipped silently. Add any subset to a repo and they
are loaded without touching `settings.json`.

### Subagent fan-out commands

| Command | Dispatches | Default agents |
|---|---|---|
| `/se-review [persona-filter]` | `se-code-review` Tier 2 | coherence, correctness, security, testing, maintainability, reliability, performance, scope-guardian |
| `/se-doc-review [persona-filter]` | `se-doc-review` | adversarial-document, coherence, scope-guardian, feasibility |
| `/se-research <topic>` | research fan-out | best-practices, framework-docs, web, repo-research |

Each command parses an optional comma-separated persona filter (default:
full set), builds a structured `pi.sendUserMessage` prompt that names the
persona set explicitly, and hands control to the existing skill prose for
dispatch and synthesis via `pi-subagents`. Default persona sets are
centralised in `extensions/se-subagent/personas.ts` so updating the
default is one edit.

When `pi-subagents` is filtered out via settings, the commands notify the
user and recommend invoking the underlying skill directly instead of
erroring.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `ctrl+g` | Show next review residual (`/se-residuals` triage UI is planned) |
| `ctrl+r` | Summarise the last review run by severity counts |
| `ctrl+w` | Show current worktree binding |

All three degrade gracefully — if there's nothing to act on (no review,
no worktree, no residuals), the shortcut notifies the user instead of
erroring.

### CLI flags

| Flag | Effect |
|---|---|
| `--se-review-tier=<1\|2>` | Force SE review tier; overrides `/se-work`'s prose-based selection |
| `--se-skip-worktree` | Skip worktree isolation in `/se-work`. Use only for read-only investigations |
| `--se-no-pr` | After `/se-work` completes, commit and stop (no PR) |

Flag values are readable via `pi.getFlag(name)` inside the extension and
through downstream skill prose.

### Theme: `se-review`

A theme tuned for review/finding readability ships under `themes/se-review.json`:

- Severity-colored headings (red → high, orange → medium, blue → low).
- Strong `toolDiffAdded` / `toolDiffRemoved` contrast for review patches.
- Distinctive `mdCode` / `mdLink` colors for `file:line` references.
- Soft `customMessageBg` so structured findings stand apart from prose.

Select it via `/settings` or `"theme": "se-review"` in `~/.pi/agent/settings.json`.

### Prompt templates

Five `/se-*` prompt templates ship under `prompts/`:

| Template | Pairs with | Purpose |
|---|---|---|
| `/se-plan-brief <topic>` | `se-plan` | Planning brief skeleton ready to hand to /se-plan |
| `/se-brainstorm-seed <topic>` | `se-brainstorm` | Structured seed for ideation |
| `/se-debug-repro <symptom>` | `se-debug` | Reinforces no-edits-before-diagnosis; cues the `se_capture_repro` tool |
| `/se-pr-body <pr-title-or-branch>` | `se-work` shipping | PR body skeleton with SE conventions |
| `/se-residual-ticket <finding>` | `se-code-review`, `se-doc-review` | Turn a residual finding into a tracker-ready issue body |

All five accept an optional argument via `$@` and degrade gracefully when invoked with no argument.

### Test-runner observation

The `software-engineering` extension observes every `bash` tool result and
writes a `se:test-state` entry whenever the command matches a test-runner
prefix. Default runner table:

| Runner | Prefixes |
|---|---|
| npm | `npm test`, `npm run test*` |
| pnpm / yarn | `pnpm test`, `pnpm run test*`, `yarn test`, `yarn run test*` |
| bun | `bun test`, `bun run test*` |
| pytest | `pytest`, `python -m pytest`, `python3 -m pytest` |
| mise | `mise run test*`, `mise run ci` |
| cargo / go | `cargo test`, `go test` |
| Ruby | `rspec`, `bundle exec rspec`, `bin/rails test`, `rails test`, `bundle exec rails test` |
| jest / vitest | `jest`, `npx jest`, `vitest`, `npx vitest` |
| node | `node --test` |

Matching is prefix-based with delimiter tolerance: `npm run test:integration`,
`cargo test --release`, and `CI=1 time -p npm test` all classify correctly.

Commands are recorded verbatim except for obvious secret tokens: `KEY=value`,
`SECRET=value`, `TOKEN=value`, `BEARER=value`, `--password value`,
`--token value`, and 32+-char base64-looking values are replaced with
`<redacted>`.

Observation only. Refusal lives in the `tool_call` guardrails (see backlog
tasks 012 and 013). The producer is independently shippable so the
guardrails always have signal when they land.

### Skill frontmatter conventions

Every `skills/<name>/SKILL.md` should declare:

- `name:` — the skill identifier; conventionally matches the directory name.
- `description:` — what the skill does and **when** to use it. ≤1024 chars. Specificity directly controls auto-invocation accuracy.
- `compatibility:` — comma-separated external tools the skill expects to be on PATH (e.g. `gh, npm, git`), or `none` for pure-prose skills. Lets Pi surface a missing-dependency warning instead of failing mid-run.
- `argument-hint:` — the autocomplete hint shown when the skill is invoked as `/skill:name`. Use `""` (empty string) when the skill takes no arguments — declaring it explicitly makes the no-arg case discoverable.
- `allowed-tools:` *(optional, experimental)* — space-delimited list of tool names the skill is allowed to use (e.g. `bash`, `read bash`). Apply when a skill's tool surface is narrow; prefer slightly looser declarations to avoid blocking real work.
- `disable-model-invocation: true` *(optional)* — hide from system-prompt auto-invocation while keeping `/skill:name` available. Use for power-user skills that should not be automatically reached for.

New skills should follow these conventions before merge.

## Attribution

The `se-prototype`, `se-zoom-out`, `se-architecture-improvement`, and `se-challenge-plan` skills are adapted from Matt Pocock's MIT-licensed engineering skills: https://github.com/mattpocock/skills.
