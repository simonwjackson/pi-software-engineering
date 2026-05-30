import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("se-state.ts declares the canonical SE entry types", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-state.ts"), "utf8")
  const required = [
    "se:phase",
    "se:worktree",
    "se:test-state",
    "se:review-finding",
    "se:review-residual-resolved",
    "se:repro",
    "se:plan-draft",
    "se:backlog",
    "se:backlog:promoted",
    "se:backlog:removed",
  ]
  for (const t of required) {
    assert.match(src, new RegExp(`"${t}"`), `se-state.ts missing entry type literal ${t}`)
  }
})

test("se-state.ts exports the typed read/write helpers", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-state.ts"), "utf8")
  const required = [
    "export function appendSE",
    "export function readAllSE",
    "export function readLatestSE",
    "export function setPhase",
    "export function getPhase",
    "export function setWorktree",
    "export function getWorktree",
    "export function setTestState",
    "export function getLastTestState",
    "export function addBacklog",
    "export function readBacklogAll",
    "export function readBacklogActive",
    "export function nextBacklogId",
    "export function promoteBacklog",
    "export function removeBacklog",
    "export function readReviewResiduals",
    "export function snapshotSEState",
  ]
  for (const sig of required) {
    assert.ok(src.includes(sig), `se-state.ts missing: ${sig}`)
  }
})

test("software-engineering.ts registers the documented SE tools", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  const required = [
    "backlog_add",
    "backlog_list",
    "backlog_promote",
    "backlog_remove",
    "backlog_export",
    "se_read_residuals",
  ]
  for (const tool of required) {
    assert.match(src, new RegExp(`name:\\s*"${tool}"`), `software-engineering.ts missing tool ${tool}`)
  }
})

test("software-engineering.ts replays SE state on session_start", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /pi\.on\("session_start"/, "no session_start handler")
  assert.match(src, /snapshotSEState\(ctx\)/, "session_start does not call snapshotSEState")
  assert.match(src, /ctx\.ui\.setStatus/, "session_start does not surface state via setStatus")
})

test("backlog export round-trip: rendered markdown round-trips the canonical fields", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const item = {
    id: "task-007",
    title: "Park gnarly thing",
    status: "to-do",
    priority: "high",
    labels: ["follow-up", "se-debug"],
    source: "se-debug",
    why: "Because reasons.",
    acceptance: ["Observable A", "Observable B"],
    related: ["src/foo.ts", "#123"],
    notes: "Investigate later.",
    createdAt: "2026-05-29T12:00:00.000Z",
    context: { branch: "feat/foo", commit: "abc1234" },
  }
  const md = mod.renderBacklogMarkdown(item)
  assert.match(md, /^---\nid: task-007\n/)
  assert.match(md, /title: Park gnarly thing/)
  assert.match(md, /status: To Do/)
  assert.match(md, /priority: high/)
  assert.match(md, /labels:\n {2}- follow-up\n {2}- se-debug/)
  assert.match(md, /source: se-debug/)
  assert.match(md, /branch: feat\/foo/)
  assert.match(md, /commit: abc1234/)
  assert.match(md, /# Park gnarly thing/)
  assert.match(md, /## Why it matters/)
  assert.match(md, /## Acceptance Criteria/)
  assert.match(md, /- \[ \] Observable A/)
  assert.match(md, /## Related/)
  assert.match(md, /- `src\/foo\.ts`/)
  assert.match(md, /## Notes/)
})

test("backlogFilename uses task-id + slug + .md", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const name = mod.backlogFilename({
    id: "task-042",
    title: "Refactor the Whatsit module: phase 2",
    status: "to-do",
    createdAt: "2026-01-01T00:00:00.000Z",
  })
  assert.equal(name, "task-042 - refactor-the-whatsit-module-phase-2.md")
})

test("se-state read/write round-trip via an in-memory sessionManager mock", async () => {
  const mod = await import("../extensions/se-state.ts")
  const entries = []
  const fakePi = {
    appendEntry: (customType, data) => {
      entries.push({ customType, data })
    },
  }
  const fakeCtx = {
    sessionManager: { getEntries: () => entries },
  }

  // phase
  mod.setPhase(fakePi, "phase-2", "slice-A")
  const phase = mod.getPhase(fakeCtx)
  assert.equal(phase.phase, "phase-2")
  assert.equal(phase.sliceId, "slice-A")
  assert.ok(phase.recordedAt)

  // backlog: allocation, list, promote, remove
  const item1 = mod.addBacklog(fakePi, fakeCtx, { title: "First", status: "to-do" })
  assert.equal(item1.id, "task-001")
  const item2 = mod.addBacklog(fakePi, fakeCtx, { title: "Second", status: "to-do" })
  assert.equal(item2.id, "task-002")

  let active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.length, 2)

  mod.promoteBacklog(fakePi, "task-001", "se-work")
  active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.find(i => i.id === "task-001").status, "in-progress")

  mod.removeBacklog(fakePi, "task-002", "no longer needed")
  active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.length, 1)
  assert.equal(active[0].id, "task-001")

  // Removed id is never reused.
  const item3 = mod.addBacklog(fakePi, fakeCtx, { title: "Third", status: "to-do" })
  assert.equal(item3.id, "task-003")

  // Floor honours .next-id values higher than seen ids.
  const item4 = mod.addBacklog(fakePi, fakeCtx, { title: "Fourth", status: "to-do" }, 100)
  assert.equal(item4.id, "task-100")
})

test("readReviewResiduals excludes pre-existing and advisory by default", async () => {
  const mod = await import("../extensions/se-state.ts")
  const entries = [
    {
      customType: "se:review-finding",
      data: {
        kind: "code",
        title: "Pre-existing dust",
        severity: "P2",
        autofix_class: "manual",
        confidence: 75,
        why_it_matters: "x",
        evidence: ["e"],
        pre_existing: true,
        source: "se-code-review:s1",
      },
    },
    {
      customType: "se:review-finding",
      data: {
        kind: "code",
        title: "Advisory only",
        severity: "P3",
        autofix_class: "advisory",
        confidence: 75,
        why_it_matters: "x",
        evidence: ["e"],
        source: "se-code-review:s2",
      },
    },
    {
      customType: "se:review-finding",
      data: {
        kind: "code",
        title: "Real residual",
        severity: "P1",
        autofix_class: "manual",
        confidence: 75,
        why_it_matters: "x",
        evidence: ["e"],
        file: "src/a.ts",
        source: "se-code-review:s3",
      },
    },
  ]
  const ctx = { sessionManager: { getEntries: () => entries } }

  const defaultResiduals = mod.readReviewResiduals(ctx)
  assert.equal(defaultResiduals.length, 1)
  assert.equal(defaultResiduals[0].title, "Real residual")

  const wider = mod.readReviewResiduals(ctx, { includePreExisting: true, includeAdvisory: true })
  assert.equal(wider.length, 3)
})
