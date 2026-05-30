import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")

test("software-engineering.ts wires registerJudgeProvider at startup", () => {
  assert.match(SRC, /registerJudgeProvider\(pi\)/)
  assert.match(SRC, /function registerJudgeProvider/)
})

test("judge provider is opt-in via SE_JUDGE_MODEL", () => {
  assert.match(SRC, /process\.env\.SE_JUDGE_MODEL/)
  // Function returns silently if model is not set.
  assert.match(SRC, /if \(!model\) return/)
})

test("judge provider reads supporting env vars", () => {
  assert.match(SRC, /SE_JUDGE_API/)
  assert.match(SRC, /SE_JUDGE_BASE_URL/)
  assert.match(SRC, /SE_JUDGE_API_KEY/)
  assert.match(SRC, /SE_JUDGE_CONTEXT_WINDOW/)
  assert.match(SRC, /SE_JUDGE_MAX_TOKENS/)
})

test("judge provider registers with name 'se-judge'", () => {
  assert.match(SRC, /pi\.registerProvider\("se-judge",/)
})

test("judge provider catches errors so missing-config does not crash startup", () => {
  const sliceStart = SRC.indexOf("function registerJudgeProvider")
  const slice = SRC.slice(sliceStart, sliceStart + 3000)
  // try / registerProvider / catch all appear; ordering proves the wrap.
  assert.ok(slice.includes("try {"), "missing try {")
  assert.ok(slice.includes("registerProvider"), "missing registerProvider call")
  assert.ok(slice.includes("} catch"), "missing catch clause")
  const tryIdx = slice.indexOf("try {")
  const regIdx = slice.indexOf("registerProvider", tryIdx)
  const catchIdx = slice.indexOf("} catch", regIdx)
  assert.ok(
    tryIdx < regIdx && regIdx < catchIdx,
    "expected ordering: try { ... registerProvider ... } catch",
  )
})

test("se-code-review SKILL.md documents the se-judge opt-in", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-code-review/SKILL.md"), "utf8")
  assert.match(src, /se-judge/)
  assert.match(src, /SE_JUDGE_MODEL/)
  // Skill prose calls out the fallback explicitly so behavior is unchanged when judge is absent.
  assert.match(src, /fall through to the primary model/)
})

test("README documents SE_JUDGE_* environment variables", () => {
  const src = readFileSync(resolve(ROOT, "README.md"), "utf8")
  assert.match(src, /SE_JUDGE_MODEL/)
  assert.match(src, /SE_JUDGE_API/)
  assert.match(src, /SE_JUDGE_BASE_URL/)
})
