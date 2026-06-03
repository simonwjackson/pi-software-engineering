import { test } from "node:test"
import { strict as assert } from "node:assert"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  closeWorkItem,
  idTimestamp,
  listActive,
  mintId,
  openWorkItem,
  parseWorkMd,
  serializeWorkMd,
  slugify,
} from "../extensions/work-items.ts"

function mkRoot() {
  return mkdtempSync(join(tmpdir(), "work-items-"))
}

function exists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

test("ulid: unique, time-sortable, and round-trips its timestamp", () => {
  const t0 = Date.UTC(2026, 5, 2, 12, 0, 0)
  const a = mintId(t0)
  const b = mintId(t0 + 1)
  const c = mintId(t0 + 1000)
  assert.equal(a.length, 26)
  assert.equal(new Set([a, b, c]).size, 3)
  assert.deepEqual([c, a, b].sort(), [a, b, c]) // lexicographic == chronological
  assert.equal(idTimestamp(a).getTime(), t0)
})

test("ulid: 1000 mints at the same instant never collide", () => {
  const now = Date.now()
  const ids = new Set(Array.from({ length: 1000 }, () => mintId(now)))
  assert.equal(ids.size, 1000)
})

test("slugify: lowercases, dashes, trims, and caps length", () => {
  assert.equal(slugify("Extract shared source plugin helpers"), "extract-shared-source-plugin-helpers")
  assert.equal(slugify("  Weird!! Chars__here  "), "weird-chars-here")
})

test("work.md: serialize -> parse round-trips, terminal reason survives", () => {
  const meta = {
    id: mintId(),
    slug: "oauth-login",
    title: "OAuth login",
    origin: "brainstormed",
    status: "superseded",
    reason: "folded into 01ABC",
    parent: "01EPIC",
    created: new Date().toISOString(),
  }
  assert.deepEqual(parseWorkMd(serializeWorkMd(meta)), meta)
})

test("open: graduates a folder with an active work.md", async () => {
  const root = mkRoot()
  try {
    const { meta, dir } = await openWorkItem(root, {
      title: "Extract shared source plugin helpers",
      origin: "parked",
    })
    assert.ok(dir.endsWith(`${meta.id}-extract-shared-source-plugin-helpers`))
    const parsed = parseWorkMd(readFileSync(join(dir, "work.md"), "utf8"))
    assert.equal(parsed.status, "active")
    assert.equal(parsed.origin, "parked")
    assert.equal(parsed.reason, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("listActive: returns active items, excludes .archive and folders without work.md", async () => {
  const root = mkRoot()
  try {
    await openWorkItem(root, { title: "First thing", origin: "planned", now: 1 })
    await openWorkItem(root, { title: "Second thing", origin: "debugged", now: 2 })
    mkdirSync(join(root, "work", "not-a-work-item"), { recursive: true })
    const active = await listActive(root)
    assert.deepEqual(
      active.map((m) => m.title),
      ["First thing", "Second thing"],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("close: flips status+reason, moves to .archive, drops from active list", async () => {
  const root = mkRoot()
  try {
    const { meta } = await openWorkItem(root, { title: "Shippable feature", origin: "brainstormed" })
    const archived = await closeWorkItem(root, meta.id, { status: "shipped", reason: "merged to main" })
    assert.equal((await listActive(root)).length, 0)
    assert.equal(exists(join(root, "work", `${meta.id}-shippable-feature`)), false)
    const archivedMeta = parseWorkMd(readFileSync(join(archived, "work.md"), "utf8"))
    assert.equal(archivedMeta.status, "shipped")
    assert.equal(archivedMeta.reason, "merged to main")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("close: refuses a blank terminal reason", async () => {
  const root = mkRoot()
  try {
    const { meta } = await openWorkItem(root, { title: "Needs a reason", origin: "parked" })
    await assert.rejects(
      () => closeWorkItem(root, meta.id, { status: "dropped", reason: "  " }),
      /reason is mandatory/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("id is retired: archived ids remain discoverable so they are never reused", async () => {
  const root = mkRoot()
  try {
    const { meta } = await openWorkItem(root, { title: "Old work", origin: "parked" })
    await closeWorkItem(root, meta.id, { status: "dropped", reason: "obsolete" })
    const archived = readdirSync(join(root, "work", ".archive"))
    assert.ok(archived.some((e) => e.startsWith(`${meta.id}-`)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
