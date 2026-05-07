import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { completedUnitIds, createInitialState, listLoopStates, loadLoopState, loopLocation, saveLoopState, updateUnitStatus } from "../extensions/se-loop/state-store.ts"

test("creates, saves, and reloads loop state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-state-"))
  try {
    const state = createInitialState({
      cwd,
      planPath: "docs/plans/example.md",
      planTitle: "feat: Example",
      verifyCommand: "node --test",
      units: [{ id: "U1", title: "First" }],
    })

    const location = loopLocation(cwd, state.id)
    const loaded = loadLoopState(cwd, state.id)

    assert.equal(loaded.id, state.id)
    assert.equal(loaded.verifyCommand, "node --test")
    assert.equal(location.statePath.endsWith("state.json"), true)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("updates unit status and completed ID set", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-state-"))
  try {
    const state = createInitialState({
      cwd,
      planPath: "docs/plans/example.md",
      planTitle: "feat: Example",
      verifyCommand: "node --test",
      units: [{ id: "U1", title: "First" }],
    })

    const updated = updateUnitStatus(state, "U1", "completed", { summary: "done" })
    const loaded = loadLoopState(cwd, updated.id)

    assert.equal(loaded.units[0].status, "completed")
    assert.deepEqual(Array.from(completedUnitIds(loaded)), ["U1"])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("lists loop states", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-state-"))
  try {
    const first = createInitialState({
      cwd,
      planPath: "docs/plans/one.md",
      planTitle: "feat: One",
      verifyCommand: "node --test",
      units: [{ id: "U1", title: "First" }],
    })
    const second = createInitialState({
      cwd,
      planPath: "docs/plans/two.md",
      planTitle: "feat: Two",
      verifyCommand: "node --test",
      units: [{ id: "U1", title: "First" }],
    })

    assert.deepEqual(new Set(listLoopStates(cwd).map(state => state.id)), new Set([first.id, second.id]))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
