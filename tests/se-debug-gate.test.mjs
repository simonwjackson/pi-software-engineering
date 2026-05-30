import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")

test("registers --se-debug-strict flag", () => {
  assert.match(SRC, /pi\.registerFlag\("se-debug-strict",\s*\{[\s\S]{0,500}type:\s*"boolean"/)
})

test("registers se_capture_repro tool with the documented schema", () => {
  assert.match(SRC, /name:\s*"se_capture_repro"/)
  for (const field of ["symptom", "reproduction_steps", "observed", "expected"]) {
    assert.match(SRC, new RegExp(`${field}:\\s*Type\\.String\\(`), `missing required field: ${field}`)
  }
  // Required fields have minLength: 1
  const sliceStart = SRC.indexOf("name: \"se_capture_repro\"")
  const slice = SRC.slice(sliceStart, sliceStart + 4000)
  const minLength1Count = (slice.match(/minLength:\s*1/g) ?? []).length
  assert.ok(minLength1Count >= 4, "expected the four required strings to declare minLength:1")
})

test("se_capture_repro writes via the substrate (REPRO entry type)", () => {
  assert.match(SRC, /SE_ENTRY_TYPES\.REPRO/)
})

test("gate registers a tool_call handler covering edit, write, multi_edit", () => {
  assert.match(SRC, /GUARDED_TOOLS = new Set\(\["edit", "write", "multi_edit"\]\)/)
  assert.match(SRC, /pi\.on\("tool_call"/)
})

test("gate only fires when --se-debug-strict is true", () => {
  assert.match(SRC, /pi\.getFlag\("se-debug-strict"\) !== true/)
})

test("gate exempts documentation paths from the block", () => {
  // docs/, *.md, *.markdown, *.mdx, *.rst, *.txt, README*, CHANGELOG*
  assert.match(SRC, /\/\^docs\\\//)
  assert.match(SRC, /\\\.md\$/)
  assert.match(SRC, /README\\b/)
  assert.match(SRC, /CHANGELOG\\b/)
})

test("gate returns block:true with a self-describing reason", () => {
  assert.match(SRC, /block:\s*true/)
  assert.match(SRC, /se-debug: capture a repro before editing code/)
  // The reason names both the tool and the prompt template so the model can act.
  assert.match(SRC, /se_capture_repro/)
  assert.match(SRC, /\/se-debug-repro/)
})

test("se-debug SKILL.md references the harness-enforced gate", () => {
  const skill = readFileSync(resolve(ROOT, "skills/se-debug/SKILL.md"), "utf8")
  assert.match(skill, /--se-debug-strict/)
  assert.match(skill, /se_capture_repro/)
})
