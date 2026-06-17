import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const REVIEWER_MODEL = "openai-codex/gpt-5.5"

test("all reviewer agent frontmatter pins openai-codex/gpt-5.5", () => {
  const agentDir = resolve(ROOT, "agents")
  const reviewerFiles = readdirSync(agentDir).filter((name) => name.endsWith("reviewer.md"))

  assert.ok(reviewerFiles.length >= 20, "expected reviewer agent files")

  for (const file of reviewerFiles) {
    const src = readFileSync(resolve(agentDir, file), "utf8")
    assert.match(src, new RegExp(`^model: ${REVIEWER_MODEL.replace(".", "\\.")}$`, "m"), `${file} must use ${REVIEWER_MODEL}`)
  }
})

test("review workflows dispatch reviewers on openai-codex/gpt-5.5", () => {
  for (const file of [
    "skills/se-code-review/SKILL.md",
    "skills/se-doc-review/SKILL.md",
    "skills/se-simplify-code/SKILL.md",
  ]) {
    const src = readFileSync(resolve(ROOT, file), "utf8")
    assert.match(src, /gpt-5\.5/, `${file} should mention openai-codex/gpt-5.5`)
    assert.doesNotMatch(src, /gpt-5\.4|model: "sonnet"|claude-sonnet-4-6|claude-haiku-4-5/, `${file} should not mention stale reviewer model guidance`)
  }
})
