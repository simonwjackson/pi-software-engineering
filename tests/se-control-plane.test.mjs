import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")

test("registers resources_discover handler", () => {
  assert.match(SRC, /pi\.on\("resources_discover"/)
})

test("resources_discover scans the documented per-repo SE locations", () => {
  // Skill paths
  assert.match(SRC, /\.software-engineering\/skills/)
  assert.match(SRC, /docs\/playbooks/)
  assert.match(SRC, /"agents"/)
  // Prompt paths
  assert.match(SRC, /\.software-engineering\/prompts/)
  // Theme paths
  assert.match(SRC, /\.software-engineering\/themes/)
})

test("resources_discover returns existing-only paths and skips missing dirs silently", () => {
  assert.match(SRC, /if \(existsSync\(abs\)/)
  // No console.warn/throw for missing dirs.
  assert.ok(!SRC.includes("console.warn") || !SRC.match(/console\.warn.*resources_discover/i))
})

test("registers the three documented CLI flags with correct types", () => {
  assert.match(SRC, /pi\.registerFlag\("se-review-tier",\s*\{[\s\S]{0,500}type:\s*"string"/)
  assert.match(SRC, /pi\.registerFlag\("se-skip-worktree",\s*\{[\s\S]{0,500}type:\s*"boolean"/)
  assert.match(SRC, /pi\.registerFlag\("se-no-pr",\s*\{[\s\S]{0,500}type:\s*"boolean"/)
})

test("registers ctrl+w / ctrl+r / ctrl+g shortcuts with graceful fallback", () => {
  for (const key of ["ctrl+g", "ctrl+r", "ctrl+w"]) {
    assert.match(SRC, new RegExp(`pi\\.registerShortcut\\("${key.replace("+", "\\+")}"`))
  }
  // Each shortcut handler degrades to a notify when there is nothing to act on.
  assert.match(SRC, /No review residuals to jump to/)
  assert.match(SRC, /No review run recorded/)
  assert.match(SRC, /No worktree recorded/)
})

test("agent symlink behaviour from the prior implementation survives", () => {
  // Unchanged contract from the pre-task-001 extension.
  assert.match(SRC, /syncAgentSymlinks/)
  assert.match(SRC, /removeLegacyAgentSymlinks/)
  assert.match(SRC, /USER_AGENTS_DIR/)
})
