import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/se-plan/index.ts"), "utf8")

test("se-plan registers /se-plan command", () => {
  assert.match(SRC, /pi\.registerCommand\("se-plan"/)
})

test("/se-plan supports --resume to reload prior answers from the substrate", () => {
  assert.match(SRC, /args.*=== "--resume"/)
  assert.match(SRC, /readAllSE.*PLAN_DRAFT/)
})

test("/se-plan persists each answer to se:plan-draft after it's recorded", () => {
  // The handler appends each answer via appendSE inside the per-step loop.
  assert.match(SRC, /appendSE<PlanDraftStep>\(pi, SE_ENTRY_TYPES\.PLAN_DRAFT,/)
})

test("/se-plan persists the final brief separately for retrieval", () => {
  assert.match(SRC, /appendSE<PlanDraftFinal>/)
  assert.match(SRC, /step:\s*"final-brief"/)
})

test("/se-plan degrades cleanly on cancellation (no partial half-final entry)", () => {
  assert.match(SRC, /\/se-plan cancelled/)
})

test("/se-plan requires UI; falls back with a notify in non-interactive modes", () => {
  assert.match(SRC, /!ctx\.hasUI/)
  assert.match(SRC, /requires the interactive UI/)
})

test("/se-plan handler walks the documented step set", () => {
  // The STEPS array covers the documented brief sections.
  const required = ["topic", "problem", "outcome", "scope-in", "scope-out", "open-questions", "entry-slice", "constraints"]
  for (const key of required) {
    assert.match(SRC, new RegExp(`key:\\s*"${key}"`), `missing step: ${key}`)
  }
})

test("/se-plan can hand the brief back to /skill:se-plan for the deep breakdown", () => {
  assert.match(SRC, /\/skill:se-plan/)
  assert.match(SRC, /pi\.sendUserMessage\(prompt, \{ deliverAs: "nextTurn" \}\)/)
})

test("software-engineering.ts registers /se-plan at startup", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /import \{ registerSePlanCommand \}/)
  assert.match(src, /registerSePlanCommand\(pi\)/)
})
