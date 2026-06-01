import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
const GUIDE = readFileSync(resolve(ROOT, "skills/se-work/references/pr-description-writing.md"), "utf8")
const WORKFLOW = readFileSync(resolve(ROOT, "skills/se-work/references/commit-pr-workflow.md"), "utf8")
const PROMPT = readFileSync(resolve(ROOT, "prompts/se-pr-body.md"), "utf8")

test("registers se_pr_publish as the sanctioned PR body path", () => {
  assert.match(SRC, /name:\s*"se_pr_publish"/)
  assert.match(SRC, /single sanctioned path for `gh pr create` \/ `gh pr edit --body`/)
})

test("se_pr_publish requires body, risk, and create/edit mode", () => {
  const sliceStart = SRC.indexOf("name: \"se_pr_publish\"")
  const slice = SRC.slice(sliceStart, sliceStart + 7000)
  assert.match(slice, /mode:\s*Type\.Optional/)
  assert.match(slice, /body:\s*Type\.String\(/)
  for (const risk of ["low", "low-medium", "medium", "high"]) {
    assert.match(slice, new RegExp(`Type\\.Literal\\("${risk}"\\)`), `missing risk literal: ${risk}`)
  }
})

test("se_pr_publish expands file placeholders and validates bodies", () => {
  assert.match(SRC, /expandFilePlaceholders/)
  assert.match(SRC, /validatePrBody/)
  assert.match(SRC, /hasFilePlaceholders/)
  assert.match(SRC, /renderPrViolations/)
})

test("se-pr-gate blocks raw gh PR body creation and edits", () => {
  assert.match(SRC, /registerFlag\("se-pr-gate"/)
  assert.match(SRC, /gh\\s\+pr\\s\+create/)
  assert.match(SRC, /gh\\s\+pr\\s\+edit/)
  assert.match(SRC, /--body\(-file\)?/)
  assert.match(SRC, /route PR bodies through the se_pr_publish tool/)
})

test("the PR description guide names se_pr_publish and placeholder links", () => {
  assert.match(GUIDE, /Publishing is gated — `se_pr_publish`/)
  assert.match(GUIDE, /\{\{file:<path>\}\}/)
  assert.match(GUIDE, /do not build these links by hand/i)
})

test("commit workflow routes create and edit through se_pr_publish", () => {
  assert.match(WORKFLOW, /Default path \(Pi\): the `se_pr_publish` tool/)
  assert.match(WORKFLOW, /New PR: `se_pr_publish`/)
  assert.match(WORKFLOW, /Existing PR:.*`se_pr_publish`/s)
})

test("the se-pr-body prompt defers to the canonical guide", () => {
  assert.match(PROMPT, /one source of truth for PR bodies/)
  assert.match(PROMPT, /skills\/se-work\/references\/pr-description-writing\.md/)
  assert.match(PROMPT, /Publish with the `se_pr_publish` tool/)
})
