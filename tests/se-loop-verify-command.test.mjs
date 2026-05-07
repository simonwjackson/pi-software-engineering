import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { discoverVerifyCommand, discoverVerifyCommandFromPlan, parseLoopArgs } from "../extensions/se-loop/verify-command-discovery.ts"

test("parses --verify-command with quotes", () => {
  assert.deepEqual(
    parseLoopArgs('docs/plan.md --verify-command "node --test tests/*.mjs"'),
    { planPath: "docs/plan.md", verifyCommand: "node --test tests/*.mjs" },
  )
})

test("reads top-level frontmatter verify_command", () => {
  const plan = '---\ntitle: x\nverify_command: "test -f tmp/x.txt"\n---\n# x\n'
  const result = discoverVerifyCommandFromPlan(plan)
  assert.equal(result?.command, "test -f tmp/x.txt")
  assert.equal(result?.source, "plan frontmatter verify_command")
})

test("reads nested loop.verify_command", () => {
  const plan = '---\ntitle: x\nloop:\n  verify_command: "npm test"\n---\n# x\n'
  const result = discoverVerifyCommandFromPlan(plan)
  assert.equal(result?.command, "npm test")
})

test("reads Execution Handoff verification command", () => {
  const plan = `---\ntitle: x\n---\n\n# x\n\n## Execution Handoff\n\n**Verification command:** \`mise run ci\`\n`
  const result = discoverVerifyCommandFromPlan(plan)
  assert.equal(result?.command, "mise run ci")
  assert.equal(result?.source, "plan Execution Handoff")
})

test("plan source beats repo discovery", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-verify-"))
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }))
    const plan = '---\ntitle: x\nverify_command: "echo hi"\n---\n# x\n'
    assert.equal(discoverVerifyCommand(cwd, plan).command, "echo hi")
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("falls back to repo discovery when plan has no verify command", () => {
  const cwd = mkdtempSync(join(tmpdir(), "se-loop-verify-"))
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }))
    assert.equal(discoverVerifyCommand(cwd, "# nothing\n").command, "npm test")
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
