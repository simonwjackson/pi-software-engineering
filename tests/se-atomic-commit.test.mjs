import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")

test("registers se_atomic_commit tool", () => {
  assert.match(SRC, /name:\s*"se_atomic_commit"/)
})

test("se_atomic_commit declares the documented Conventional Commit type union", () => {
  for (const t of ["feat", "fix", "refactor", "test", "docs", "chore", "build", "ci", "perf", "style"]) {
    assert.match(SRC, new RegExp(`Type\\.Literal\\("${t}"\\)`), `missing type: ${t}`)
  }
})

test("se_atomic_commit subject is bounded and required", () => {
  // Subject parameter: minLength: 1 and maxLength: 72
  const sliceStart = SRC.indexOf("name: \"se_atomic_commit\"")
  const slice = SRC.slice(sliceStart, sliceStart + 5000)
  assert.match(slice, /subject:\s*Type\.String\(\{[\s\S]{0,400}maxLength:\s*72/)
})

test("se_atomic_commit rejects multi-purpose subject markers", () => {
  for (const marker of ["and also", "; ", " + ", " & "]) {
    assert.ok(SRC.includes(JSON.stringify(marker)), `forbidden token table missing: ${marker}`)
  }
})

test("se_atomic_commit reads se:test-state and se:worktree", () => {
  assert.match(SRC, /SE_ENTRY_TYPES\.TEST_STATE/)
  assert.match(SRC, /SE_ENTRY_TYPES\.WORKTREE/)
})

test("se_atomic_commit refuses RED commits unless allowRed is set", () => {
  assert.match(SRC, /color === "red" && !p\.allowRed/)
  assert.match(SRC, /se_atomic_commit refused: last test run is RED/)
})

test("se_atomic_commit refuses paths outside the active worktree", () => {
  assert.match(SRC, /path '\$\{path\}' is outside the active worktree/)
})

test("se_atomic_commit annotates the body with a RED-state footer when allowRed is true", () => {
  assert.match(SRC, /Committing RED: last test/)
})

test("se_atomic_commit returns sha + diff stat in details", () => {
  assert.match(SRC, /details: \{ sha, header, paths: p\.paths, stat, message \}/)
})

test("promptGuidelines explicitly names se_atomic_commit and bash fallback", () => {
  assert.match(SRC, /Use se_atomic_commit whenever committing code in \/se-work/)
})

test("se-work SKILL.md commit workflow references se_atomic_commit", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-work/SKILL.md"), "utf8")
  assert.match(src, /se_atomic_commit/, "se-work SKILL.md should mention se_atomic_commit in the commit workflow")
})
