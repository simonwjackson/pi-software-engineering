import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("software-engineering.ts registers a before_agent_start handler", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /pi\.on\("before_agent_start"/, "before_agent_start handler not registered")
})

test("before_agent_start uses snapshotSEState and returns systemPrompt", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  // Inside the handler we read state via snapshotSEState.
  assert.match(src, /snapshotSEState\(ctx\)/)
  // The injection returns systemPrompt (chained).
  assert.match(src, /return\s*\{\s*systemPrompt:/)
})

test("before_agent_start returns nothing on empty state (no per-turn noise)", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  // The handler explicitly early-returns when the snapshot is empty.
  assert.match(src, /if \(isEmptySnapshot\(snap\)\) return/)
})

test("injected block is bounded: summarizes residuals and backlog as counts", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /review_residuals: \$\{s\.reviewResiduals\.length\}/)
  assert.match(src, /backlog: \$\{s\.backlogActive\.length\}/)
})

test("injected block uses an <se-state> envelope so the model can recognise it", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /"<se-state>"/)
  assert.match(src, /"<\/se-state>"/)
})
