# SE Session-Log State

The SE skills suite stores runtime state in the **Pi session log** via
`pi.appendEntry`, not in scratch files under `.context/software-engineering/`
or tracked markdown files like `Backlog.md`.

## Why

Pi's session log survives `/compact`, `/fork`, restart, and worktree changes.
The model only reads entries that a tool deliberately surfaces — they don't
count against context budget. Worktree merge conflicts on SE files disappear
because the SE files don't exist.

## Entry-type catalogue

Owned by `extensions/se-state.ts`. Add new entry types here, not in
individual skills.

| Type | Producer | Consumer |
|---|---|---|
| `se:phase` | `se-work` (future) | `/se-status`, before_agent_start |
| `se:worktree` | `se-worktree` / `se-work` (future) | guardrails, status |
| `se:test-state` | bash wrapper (task-015) | atomic-commit guardrail (task-012), status |
| `se:repro` | `se-debug` (task-013) | edit guardrail |
| `se:backlog` | `backlog_add` tool | `backlog_list`, `backlog_export`, before_agent_start |
| `se:backlog:promoted` | `backlog_promote` tool | `backlog_list` |
| `se:backlog:removed` | `backlog_remove` tool | `backlog_list` (filter) |
| `se:review-finding` | `se_review_finding` tool (extensions/se-review.ts) | `se_read_residuals` |
| `se:review-residual-resolved` | future `se_resolve_residual` tool | `se_read_residuals` (filter) |

Entry shape: `{ customType: "se:..." , data: <typed-payload> }`. The reader
helpers in `se-state.ts` accept both `data` and `details` for compatibility
with `pi.sendMessage`-emitted entries.

## Helpers

```ts
import { setPhase, getPhase, addBacklog, readBacklogActive,
         readReviewResiduals, snapshotSEState } from "./se-state.ts"
```

- `appendSE / readAllSE / readLatestSE` — generic.
- `setPhase / getPhase`, `setWorktree / getWorktree`, `setTestState /
  getLastTestState` — typed wrappers.
- `addBacklog / readBacklogAll / readBacklogActive / promoteBacklog /
  removeBacklog / nextBacklogId` — backlog domain.
- `readReviewResiduals / resolveReviewResidual / reviewFindingKey` —
  review residuals derived from `se:review-finding` entries.
- `snapshotSEState(ctx)` — read-everything view used by `session_start`
  status, before_agent_start injection, and `/se-status`.

`se-state.ts` is not loaded as an extension — it has no default export and
is imported by `software-engineering.ts` and `se-review.ts` via relative
path.

## Backlog on-disk export

`extensions/se-state-backlog-export.ts` renders the active backlog set to
`backlog/<id> - <slug>.md`, preserving the existing on-disk format. Export
is reached only by explicit user action through the `backlog_export` tool
— never auto-triggered. `backlog/.next-id` is updated to the maximum id
seen across the session log and the on-disk files.

## Adding a new SE state type

1. Add the entry-type literal to `SE_ENTRY_TYPES` in `extensions/se-state.ts`.
2. Add a typed payload interface (with `recordedAt` as the timestamp).
3. Add a `setX` writer and `getX` (or `readAllX`) reader.
4. Add the type to `snapshotSEState` if `/se-status` and before_agent_start
   should surface it.
5. Register a tool in `software-engineering.ts` if the LLM needs to write
   or read it directly. Pure-internal state types don't need a tool surface.
6. Update this doc.

## What not to put here

- Durable knowledge — that's `docs/solutions/` via `se-compound`.
- Strategy / direction — that's `STRATEGY.md` via `se-strategy`.
- Plan artifacts — plans live as committed markdown files; only plan-draft
  state (in-progress interview answers) belongs in the log.
- Secrets — entries are persisted to disk under the session jsonl path and
  can be replayed by anyone with read access.
