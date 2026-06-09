# Decision: colocated `work/items/active/<id>/` layout as the unit of organization

Date: 2026-06-02
Status: Accepted (design) — implementation pending
Tracks: se-backlog, se-brainstorm, se-ideate, se-plan, se-work, se-debug
Sandbox: ~/code/sandbox/bazzar (reference repo for migration + tooling validation)

## Context

SE artifacts are filed by **type**, not by the thing being built:

```
backlog/<id> - <slug>.md
docs/ideation/<topic>.md
docs/brainstorms/<topic>-requirements.md
docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md
docs/solutions/...
```

A plan and its originating backlog item sit in different top-level folders,
under different naming schemes, with no shared key. Nothing physically
connects an initiative's ideation, requirements, plan, and parked item. The
backlog (`se-backlog`) is a local addition to this package, not inherited from
upstream compound-engineering, and today its integration with the rest of the
pipeline is ambient-by-convention: each skill drops a one-line "you could defer
this with `se-backlog`" nudge in prose, and `se-work` happens to close items.
The loop is real but loose.

Two problems compound:

1. **Disconnection** — related artifacts can't be found together.
2. **Backlog-centric assumptions** — work that starts at `se-brainstorm` or
   `se-debug` (never parked) has no obvious home in a backlog-keyed scheme.

## Decision

Make the **initiative** the unit of organization, keyed by a **stable
time-sortable id**, with all of its artifacts colocated under `work/items/active/`:

```
work/
├── active/                        # graduated active initiatives
│   ├── 01JABC2X-oauth-login/      # parked first → has item.md
│   │   ├── work.md                #   spine record: id, slug, origin, parent-id, status, reason
│   │   ├── item.md                #   optional inhabitant (backlog content), not the spine
│   │   ├── requirements.md
│   │   └── plan.md                #   contains many implementation units (the LLM-sized tasks)
│   │
│   ├── 01JABD9K-fix-token-refresh/ # debug-origin, never parked → no item.md
│   │   ├── work.md
│   │   ├── repro.md
│   │   └── plan.md
│   │
│   └── 01JABE5M-dashboard-redesign/ # brainstormed directly → no item.md
│       ├── work.md
│       ├── requirements.md
│       └── plan.md
│
├── parking-lot/                   # ungraduated candidates: one file per item (decision 15)
│   ├── 01JABZ1-add-foo-source.md  #   standard single front-matter block + body
│   └── 01JABZ2-add-bar-source.md
│
└── .archive/
    └── 01JAA0Q7-legacy-export/    # terminal state, git mv'd here, id retired
        └── work.md                #   status: Dropped|Shipped|Superseded(→id) + date
```

Ids are **time-sortable (ULID/KSUID)**, not sequential — see decision 3.

### Decisions locked (interview, 2026-06-02)

1. **Full unification (with two explicit exclusions).** One `work/items/active/<id>/` tree at
   **repo root** is the source of truth for initiative-scoped artifacts —
   replaces `backlog/` + `docs/plans/` + `docs/brainstorms/`. **Excluded:**
   `docs/solutions/` stays a separate cross-cutting knowledge base (decision 13),
   and `docs/ideation/` collapses into the parking lot rather than into
   `work/items/active/<id>/` (decision 14).

2. **The id is the spine; the backlog item is optional.** The folder and its id
   exist because *work exists*, not because something was parked. `item.md` is
   one possible inhabitant — present when the work was parked first, absent for
   brainstorm/debug-origin work. "Has a backlog item" is *derived* by checking
   for `item.md`, never assumed.

3. **Time-sortable ids (ULID/KSUID), not sequential.** `work/items/active/01JABC2X-oauth-login/`.
   Multi-worktree parallelism is a first-class priority, and a tracked counter
   (`.next-id`) collides silently across concurrent worktree branches (same id,
   different slugs, no git conflict). A coordination-free time-sortable id is
   stable from birth, collision-free across worktrees, roughly chronological via
   its timestamp prefix, and needs no central state. The id is the universal,
   origin-agnostic spine; the slug is cosmetic. **Supersedes the earlier
   "zero-padded numeric ids" choice.**

4. **Graduate on first artifact.** Cheap capture is a single zero-prompt *file
   write* to `work/items/parking-lot/<id>-<slug>.md` (decision 15). A folder is born
   only when the first real artifact (`requirements.md` / `plan.md` / `repro.md`,
   or the parked file moved out into `item.md`) is written — at which point
   `work.md` is also created. Promote records *intent*; it does not create a
   folder. No empty folders, ever.

5. **Id generator, not a coordinating allocator.** The shared `work_item_open`
   seam (backlog/brainstorm/plan/debug all call it) simply *mints* a fresh
   time-sortable id — no counter, no scan, no coordination. "Never reuse" is
   guaranteed by the generator, not by scanning. **Supersedes the earlier
   "hoisted allocator scans active + archive + .next-id" choice** — that whole
   concurrency problem is dissolved by decision 3.

6. **Archive, never delete, on a reasoned terminal state.** Graduated folders
   hold real decision history, so `backlog_remove`-style deletion is replaced by
   `git mv work/items/active/<id>-* work/items/.archive/<id>-*`. Archiving flips `status:` +
   `reason:` in `work.md` *before* the move. Terminal reason is **mandatory**:
   `Shipped | Dropped | Superseded(→id)`. Ungraduated parking-lot blocks stay
   cheap and are simply removed (no archive). Reversible: un-archive is the move
   back.

7. **Reference by id only.** Durable references (commits, PRs, plans) point at
   the stable id, never the slug/path, so `git mv` on archive doesn't break
   links. `git log --follow` preserves history across the move.

8. **Hard-cut for consumers; no compat shim, no shipped migrator.** The skills +
   extension only know `work/items/active/<id>/`. Consuming repos reorganize manually.
   Simplest code, roughest upgrade — accepted deliberately.

9. **Migrate `bazzar` first** (the sandbox at `~/code/sandbox/bazzar`) as the
   reference implementation: validate the tooling there, big-bang migrate its
   real `backlog/` + `docs/plans/` into `work/items/active/<id>/`, sweep terminal ones to
   `work/items/.archive/`. The skills repo migrates its own artifacts later, once the
   approach is proven in bazzar.

10. **All SE consumers.** This becomes the package default, not a personal
    convention. Skill prose and the extension change for everyone.

11. **Per-folder `work.md` is the metadata spine.** A uniform, always-present
    (from graduation) record carrying id, slug, origin (which of the 3 entry
    points), epic parent-id, status, and terminal-reason. Serves active AND
    terminal states, keeps the two close paths identical, and is the queryable
    home for "list active work" / epic grouping / archive views. `item.md` stays
    the *optional* backlog-content inhabitant alongside it.

12. **Two tiers of granularity, sized for LLM execution — see below.**

13. **`docs/solutions/` stays separate and global.** Compounded learnings
    (`se-compound`) are reusable knowledge meant to be found by *future,
    unrelated* work — not owned by one initiative, and never buried inside an
    archived `work/items/active/<id>/`. A work-item may *link* a solution by id; it does not
    contain it. Solutions remain a flat cross-cutting knowledge base.

14. **Ideation IS the parking lot.** `se-ideate` emits its ranked candidates as
    one file per candidate into `work/items/parking-lot/` (decision 15) — each a
    candidate work-item carrying its rank/rationale. `docs/ideation/` is retired;
    there is no separate ideation store. Promotion graduates one candidate into a
    `work/items/active/<id>/` folder (the same graduate-on-first-artifact path as any parked
    item). The parking lot is therefore an *ordered candidate pool*, fed by both
    ambient capture and ideation runs.

15. **Parking lot is one file per item, not a single multi-block file.**
    `work/items/parking-lot/<id>-<slug>.md`, each a *standard* single YAML
    front-matter block + markdown body. **Supersedes the earlier "front-matter
    block per entry in `parking-lot.md`" choice**, which was decided *before*
    multi-worktree parallelism was prioritized (decision 3). A single shared file
    reintroduces the exact concurrent-worktree merge-conflict that killed the
    `.next-id` counter, needs a hand-rolled multi-block parser (`---` is
    ambiguously delimiter/thematic-break/separator), and has no per-item history.
    One file per item is conflict-free on capture (unique filename), parseable by
    any front-matter tool, has per-item git history, and is **symmetric with
    graduated items** — graduation is `git mv work/items/parking-lot/<id>-<slug>.md
    work/items/active/<id>-<slug>/item.md` + write `work.md`. A single readable list is a
    regenerated *view*, not the storage format; rank/priority is a field, not
    file position. This is the "Backlog.md-style" the `se-backlog` skill already
    claims.

## Granularity (sized for 100%-LLM execution)

The human epic/story/task hierarchy exists to coordinate *people*; it doesn't
transfer to a single-model executor whose binding constraint is **coherence in
one pass**. Two tiers only:

| Tier | What it is | Where it lives | Sizing rule |
|---|---|---|---|
| **Work-item** | the initiative — has requirements + a plan | `work/items/active/<id>/` folder (owns the id) | ~3–8 implementation units; must fit one coherent `se-plan` / one `se-work` campaign. Bigger → split into multiple work-items under an epic. |
| **Implementation unit** | a vertical slice inside the plan (the LLM-sized "task") | a section of `plan.md` (no id, no folder) | one vertical slice / one observable behavior, sized to land as a **single clean atomic commit**. Can't be one commit → split. Not independently testable/committable → fold up. |

Relationship is **one-to-many**: one work-item's `plan.md` holds several
implementation units; `se-work` turns each into one atomic commit.

**Epic = optional parent-id grouping, not a separate artifact.** When work
genuinely can't be one coherent plan, it becomes several sibling work-items that
carry a `parent-id` (in `work.md`) pointing at an epic work-item. The epic owns
narrative/requirements; its children own the executable plans. No nested folder
trees — grouping is by reference.

## Lifecycle

```
Two entry points:
  (a) park → work/items/parking-lot/<id>-<slug>.md → (first artifact) → git mv to work/items/active/<id>/item.md
  (b) brainstorm/plan/debug directly         → folder born at first artifact WITHOUT item.md

Either way: id minted once → artifacts accrete → git mv to work/items/.archive/ on
a reasoned terminal state. Id retired forever; ids are never reused.
```

## Gotchas to design against

- **Ids are coordination-free — do not reintroduce a counter.** The whole point
  of decision 3 is that no central `.next-id` exists. Any "scan for the max" or
  shared counter silently breaks multi-worktree parallelism. The generator's
  uniqueness is the only guarantee needed.
- **`work.md` must be written atomically at graduation** and kept the single
  source of truth for status/origin/parent-id — don't let status drift into
  content files.
- **Every glob must exclude `work/items/.archive/` by default.** Plan listing, pulse
  reports, `se-sessions`, "list active work" — all skip archived unless asked.
- **`backlog_list` ≠ "list work-items."** Backlog view = items with `item.md`
  (or still in `work/items/parking-lot/`). Initiative view = all folders. Keep distinct.
- **Promotion is backlog-subset only.** Un-parked work is born graduated; there
  is nothing to promote. `backlog_promote` operates only on the
  `item.md`/parking-lot subset. Promote is not a universal gate.
- **Never auto-stub `item.md`.** Forcing an empty `item.md` into every folder
  recreates the backlog-centric assumption we are rejecting, and produces
  empty-file noise. Create sibling files lazily.
- **Two close paths stay uniform.** A folder with `item.md` and one without
  archive identically — keyed on folder/id, not on the backlog item.
- **Migration is judgment-heavy.** Existing plans use date-NNN names with no
  shared id; reconnecting related artifacts is not a pure `git mv`.
- **Plan naming reconciliation.** Drop the in-folder date-NNN prefix; the folder
  carries identity. Don't let two numbering systems diverge.
- **Reason required at close.** An archive with no terminal reason loses
  information; `Shipped | Dropped | Superseded(→id)` is mandatory.

## Implementation surface (for the follow-up)

- **Extension/tooling:** add a `work_item_open` seam that mints a time-sortable
  id and writes `work.md` at graduation; add a `work_item_close` (archive) seam
  that flips status+reason then `git mv`s to `work/items/.archive/`; repoint
  `backlog_add`/`_list`/`_promote`/`_remove`/`_export` at `work/items/active/<id>/` and the
  `work/items/parking-lot/<id>-<slug>.md` per-item files. No counter, no scan.
- **Skill prose:** `se-backlog`, `se-brainstorm`, `se-ideate`, `se-plan`,
  `se-work`, `se-debug` — adopt `work/items/active/<id>/` paths, the three-origin model,
  graduate-on-first-artifact, id-only references, archive-on-terminal-state.
- **Migration pass:** this repo's `backlog/` + `docs/plans/` + `docs/brainstorms/`
  + `docs/ideation/` → `work/items/active/<id>/` (+ `work/items/.archive/`).
- **Glob audit:** every consumer of the old flat dirs (pulse reports,
  `se-sessions`, plan listing, review tooling) must learn `work/items/active/<id>/` and
  exclude `work/items/.archive/`.

## Resolved (interview, 2026-06-02, second pass)

- **Parking-lot entry shape:** one standard front-matter file per item at
  `work/items/parking-lot/<id>-<slug>.md`, moved into `item.md` on graduation
  (decision 15 — reversed the original single-file block shape for
  worktree-concurrency and standard-format reasons).
- **Terminal-reason home:** per-folder `work.md` (decision 11) — uniform for
  both origins; archiving flips its `status:`/`reason:` before `git mv`.
- **Allocator concurrency:** dissolved — time-sortable ids (decision 3) need no
  coordination; multi-worktree parallelism is safe by construction.
- **Granularity:** two tiers, epic-as-parent-id, implementation-unit =
  one-atomic-commit vertical slice (see Granularity section).

## Open questions (resolve while implementing)

- Exact `work.md` field schema (front-matter keys, allowed `status`/`origin`
  enums, `parent-id` format).
- ULID vs KSUID (vs other time-sortable scheme) and slug-length conventions.
- Whether `parent-id` epic links are validated/repaired by tooling or left as
  free references.
- How the parking lot tolerates ideation volume (an `se-ideate` run can emit
  dozens of candidates) — cap at top-N, or accept many files in
  `work/items/parking-lot/`.
