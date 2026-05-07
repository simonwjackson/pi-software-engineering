import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { runVerifyCommand, verifyUnitFiles } from "../extensions/se-loop/verification.ts"

const fakeUnit = (files) => ({
  id: "U1",
  title: "Fake",
  goal: "",
  requirements: "",
  dependencies: [],
  files: { create: files, modify: [], test: [], other: [] },
  approach: "",
  executionNote: "",
  patternsToFollow: [],
  testScenarios: [],
  verification: [],
  raw: "",
})

test("verifyUnitFiles passes when all files exist", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-verify-"))
  try {
    writeFileSync(join(cwd, "out.txt"), "hi")
    const result = verifyUnitFiles(cwd, fakeUnit(["out.txt"]))
    assert.equal(result.ok, true)
    assert.deepEqual(result.missingFiles, [])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("verifyUnitFiles reports missing files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-verify-"))
  try {
    const result = verifyUnitFiles(cwd, fakeUnit(["missing.txt"]))
    assert.equal(result.ok, false)
    assert.deepEqual(result.missingFiles, ["missing.txt"])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("runVerifyCommand passes on success and fails on non-zero exit", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-verify-"))
  try {
    const passing = await runVerifyCommand(cwd, "true")
    assert.equal(passing.ok, true)

    const failing = await runVerifyCommand(cwd, "false")
    assert.equal(failing.ok, false)
    assert.match(failing.summary, /Verification failed/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
