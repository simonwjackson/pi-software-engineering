import { test } from "node:test"
import { strict as assert } from "node:assert"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

function mkTmpRepo() {
  return mkdtempSync(join(tmpdir(), "se-backlog-disk-"))
}

test("se-state.ts declares the canonical SE entry types", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-state.ts"), "utf8")
  const required = [
    "se:phase",
    "se:worktree",
    "se:test-state",
    "se:review-finding",
    "se:review-residual-resolved",
    "se:repro",
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
    id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
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
  assert.match(md, /^---\nid: 01KT7BEG3WWXEW1CNFD7MMK5GA\n/)
  assert.match(md, /slug: park-gnarly-thing/)
  assert.match(md, /origin: parked/)
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

test("backlogFilename uses work id + slug + .md", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const name = mod.backlogFilename({
    id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
    title: "Refactor the Whatsit module: phase 2",
    status: "to-do",
    createdAt: "2026-01-01T00:00:00.000Z",
  })
  assert.equal(name, "01KT7BEG3WWXEW1CNFD7MMK5GA-refactor-the-whatsit-module-phase-2.md")
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
  assert.match(item1.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  const item2 = mod.addBacklog(fakePi, fakeCtx, { title: "Second", status: "to-do" })
  assert.match(item2.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  assert.notEqual(item1.id, item2.id)

  let active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.length, 2)

  mod.promoteBacklog(fakePi, item1.id, "se-work")
  active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.find(i => i.id === item1.id).status, "in-progress")

  mod.removeBacklog(fakePi, item2.id, "no longer needed")
  active = mod.readBacklogActive(fakeCtx)
  assert.equal(active.length, 1)
  assert.equal(active[0].id, item1.id)

  // Removed ids are not reused because every add mints a fresh ULID.
  const item3 = mod.addBacklog(fakePi, fakeCtx, { title: "Third", status: "to-do" })
  assert.match(item3.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  assert.notEqual(item3.id, item2.id)

  // Counter floors are ignored in the work layout; IDs remain ULIDs.
  const item4 = mod.addBacklog(fakePi, fakeCtx, { title: "Fourth", status: "to-do" }, 100)
  assert.match(item4.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
})

// ---------------------------------------------------------------------------
// Cross-session backlog visibility via work/items/parking-lot disk sync.
// ---------------------------------------------------------------------------

test("writeBacklogItem renders a parking-lot file", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const cwd = mkTmpRepo()
  try {
    const item = {
      id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
      title: "Park gnarly thing",
      status: "to-do",
      priority: "high",
      labels: ["follow-up"],
      createdAt: "2026-05-30T12:00:00.000Z",
    }
    const path = mod.writeBacklogItem(item, { cwd })
    assert.ok(existsSync(path), "file should exist")
    const md = readFileSync(path, "utf8")
    assert.equal(path, resolve(cwd, "work", "items", "parking-lot", "01KT7BEG3WWXEW1CNFD7MMK5GA-park-gnarly-thing.md"))
    assert.match(md, /^---\nid: 01KT7BEG3WWXEW1CNFD7MMK5GA\n/)
    assert.match(md, /origin: parked/)
    assert.match(md, /status: To Do/)
    assert.equal(existsSync(resolve(cwd, "backlog", ".next-id")), false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("writeBacklogItem replaces an older slug for the same id", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const cwd = mkTmpRepo()
  try {
    const a = {
      id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
      title: "Old title",
      status: "to-do",
      createdAt: "2026-05-30T12:00:00.000Z",
    }
    mod.writeBacklogItem(a, { cwd })
    const b = { ...a, title: "New title" }
    mod.writeBacklogItem(b, { cwd })
    const dir = resolve(cwd, "work", "items", "parking-lot")
    const files = readdirSync(dir).filter(n => n.endsWith(".md"))
    assert.equal(files.length, 1, "only one .md file should remain for the id")
    assert.match(files[0], /new-title/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("patchBacklogStatus updates only the frontmatter status line", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const cwd = mkTmpRepo()
  try {
    mod.writeBacklogItem(
      {
        id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
        title: "Promote me",
        status: "to-do",
        createdAt: "2026-05-30T12:00:00.000Z",
      },
      { cwd },
    )
    const patched = mod.patchBacklogStatus("01KT7BEG3WWXEW1CNFD7MMK5GA", "in-progress", { cwd })
    assert.ok(patched, "should return the patched path")
    const md = readFileSync(patched, "utf8")
    assert.match(md, /status: In Progress/)
    assert.doesNotMatch(md, /status: To Do/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("removeBacklogFile deletes the file for the given id", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const cwd = mkTmpRepo()
  try {
    const path = mod.writeBacklogItem(
      {
        id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
        title: "Doomed",
        status: "to-do",
        createdAt: "2026-05-30T12:00:00.000Z",
      },
      { cwd },
    )
    assert.ok(existsSync(path))
    const removed = mod.removeBacklogFile("01KT7BEG3WWXEW1CNFD7MMK5GA", { cwd })
    assert.equal(removed, path)
    assert.equal(existsSync(path), false)
    // Second remove returns undefined cleanly.
    assert.equal(mod.removeBacklogFile("01KT7BEG3WWXEW1CNFD7MMK5GA", { cwd }), undefined)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("readBacklogDir returns items written by a different session", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  const cwd = mkTmpRepo()
  try {
    // Simulate "session A" writing two items.
    mod.writeBacklogItem(
      {
        id: "01KT7BEG3WWXEW1CNFD7MMK5GA",
        title: "First",
        status: "to-do",
        priority: "high",
        labels: ["x"],
        createdAt: "2026-05-30T12:00:00.000Z",
      },
      { cwd },
    )
    mod.writeBacklogItem(
      {
        id: "01KT7BEG3XS1CS74GARG22YM7R",
        title: "Second",
        status: "in-progress",
        priority: "low",
        createdAt: "2026-05-30T12:01:00.000Z",
      },
      { cwd },
    )
    // "Session B" reads with a fresh empty in-memory session log.
    const items = mod.readBacklogDir({ cwd })
    assert.equal(items.length, 2)
    assert.equal(items[0].id, "01KT7BEG3WWXEW1CNFD7MMK5GA")
    assert.equal(items[0].status, "to-do")
    assert.equal(items[0].priority, "high")
    assert.deepEqual(items[0].labels, ["x"])
    assert.equal(items[1].id, "01KT7BEG3XS1CS74GARG22YM7R")
    assert.equal(items[1].status, "in-progress")
    assert.equal(items[1].priority, "low")
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("parseBacklogFrontmatter ignores non-backlog files and malformed input", async () => {
  const mod = await import("../extensions/se-state-backlog-export.ts")
  assert.equal(mod.parseBacklogFrontmatter(""), undefined)
  assert.equal(mod.parseBacklogFrontmatter("# not a backlog file"), undefined)
  assert.equal(
    mod.parseBacklogFrontmatter("---\nid: 01KT7BEG3WWXEW1CNFD7MMK5GA\n---\n"),
    undefined,
    "missing required fields rejected",
  )
})

test("backlog_list documents that it reads disk too (task-017)", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(
    src,
    /Reads both the current session log and on-disk work\/items\/parking-lot\/ files/,
    "backlog_list description does not advertise cross-session disk read",
  )
  assert.match(src, /readBacklogDir\(\{ cwd: ctx\.cwd \}\)/, "backlog_list does not call readBacklogDir")
})

test("backlog mutation tools wire to disk helpers (task-017)", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /writeBacklogItem\(created, \{ cwd: ctx\.cwd \}\)/)
  assert.match(src, /patchBacklogStatus\(p\.id, "in-progress", \{ cwd: ctx\.cwd \}\)/)
  assert.match(src, /removeBacklogFile\(p\.id, \{ cwd: ctx\.cwd \}\)/)
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
