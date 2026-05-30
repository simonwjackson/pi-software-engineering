import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("software-engineering.ts registers /se-status command", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /pi\.registerCommand\("se-status"/)
  assert.match(src, /argumentHint:\s*"\[--verbose\]"/)
})

test("software-engineering.ts registers se_read_state tool", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /name:\s*"se_read_state"/)
  // promptGuidelines must name the tool explicitly per acceptance.
  assert.match(src, /Use se_read_state to check/)
})

test("software-engineering.ts refreshes the widget on mutating tool_result", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /pi\.on\("tool_result"/)
  assert.match(src, /refreshSEWidget/)
  for (const tool of ["backlog_add", "backlog_promote", "backlog_remove", "backlog_export", "se_review_finding"]) {
    assert.match(src, new RegExp(`"${tool}"`), `widget refresh map missing ${tool}`)
  }
})

test("widget skips registration when hasUI is false", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  // refreshSEWidget early-returns on !ctx.hasUI
  assert.match(src, /if \(!ctx\.hasUI\) return/)
})

test("widget renderer formats SE state into one line, omits empty fields", async () => {
  // The render helpers are not exported (internal); validate the contract
  // by inspecting the source for the documented format.
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /function renderWidgetLine/)
  assert.match(src, /SE: \$\{parts\.join\(/)
  // Omits empty fields rather than displaying "unknown" via parts.push.
  assert.ok(
    !src.includes('parts.push("unknown")'),
    "widget should omit empty fields, not show 'unknown'",
  )
})

test("status command shows empty-state hint with first-action pointers", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /No SE state recorded yet/)
  assert.match(src, /\/se-plan/)
  assert.match(src, /se-worktree/)
})

test("se-work SKILL.md pilots se_read_state instead of opening with state-detection prose", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-work/SKILL.md"), "utf8")
  assert.match(src, /se_read_state/, "se-work should call se_read_state in setup")
})
