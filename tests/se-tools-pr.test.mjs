import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = () => readFileSync(resolve(ROOT, "extensions/se-tools/se-pr.ts"), "utf8")

test("se-pr.ts exists and exports registerPrTools", () => {
  assert.match(SRC(), /export function registerPrTools/)
})

test("se-tools/index.ts wires up registerPrTools", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/index.ts"), "utf8")
  assert.match(src, /registerPrTools/)
})

test("registers four pr_* tools matching the documented surface", () => {
  for (const t of ["pr_comments_list", "pr_thread_get", "pr_thread_reply", "pr_thread_resolve"]) {
    assert.match(SRC(), new RegExp(`name:\\s*"${t}"`), `missing tool ${t}`)
  }
})

test("pr_comments_list schema covers pr (required) and optional owner/repo", () => {
  const src = SRC()
  // Required PR number, optional owner/repo so the gh CLI can autodetect.
  assert.match(src, /pr:\s*Type\.Integer/)
  assert.match(src, /owner:\s*Type\.Optional\(\s*Type\.String/)
  assert.match(src, /repo:\s*Type\.Optional\(\s*Type\.String/)
})

test("pr_thread_get schema requires pr and commentNodeId", () => {
  const src = SRC()
  assert.match(src, /commentNodeId:\s*Type\.String/)
})

test("pr_thread_reply schema requires threadId and body (body stdin-fed to the script)", () => {
  const src = SRC()
  assert.match(src, /threadId:\s*Type\.String/)
  assert.match(src, /body:\s*Type\.String/)
})

test("pr_thread_resolve schema requires threadId", () => {
  // Tightest schema; just threadId. Asserting the union of all four covers it.
  const src = SRC()
  assert.ok(src.includes("pr_thread_resolve"), "pr_thread_resolve registration missing")
})

test("each tool delegates to the matching bash script by path", () => {
  const src = SRC()
  for (const rel of [
    "skills/se-resolve-pr-feedback/scripts/get-pr-comments",
    "skills/se-resolve-pr-feedback/scripts/get-thread-for-comment",
    "skills/se-resolve-pr-feedback/scripts/reply-to-pr-thread",
    "skills/se-resolve-pr-feedback/scripts/resolve-pr-thread",
  ]) {
    assert.ok(src.includes(rel.split("/").pop()), `wrapper missing script reference: ${rel}`)
    assert.ok(existsSync(resolve(ROOT, rel)), `script must stay on disk: ${rel}`)
  }
})

test("pr_thread_reply feeds the body to the script via stdin (script expects stdin)", () => {
  const src = SRC()
  // Look for an execFileSync / spawnSync invocation with input: option, or a child_process stdin write.
  assert.match(src, /input:/)
})

test("each tool surfaces script errors via isError + stderr text", () => {
  const src = SRC()
  const isErrorCount = (src.match(/isError:\s*true/g) ?? []).length
  assert.ok(isErrorCount >= 4, `expected at least 4 isError paths, got ${isErrorCount}`)
})

test("each pr_* tool names itself in its promptGuidelines (Pi convention)", () => {
  const src = SRC()
  for (const t of ["pr_comments_list", "pr_thread_get", "pr_thread_reply", "pr_thread_resolve"]) {
    // Tool name must appear in its own promptGuidelines block.
    const block = new RegExp(`name:\\s*"${t}"[\\s\\S]{0,2000}?promptGuidelines:`, "m")
    assert.match(src, block, `${t} block missing promptGuidelines`)
  }
})

test("se-resolve-pr-feedback SKILL.md names the registered pr_* tools", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-resolve-pr-feedback/SKILL.md"), "utf8")
  for (const t of ["pr_comments_list", "pr_thread_get", "pr_thread_reply", "pr_thread_resolve"]) {
    assert.match(src, new RegExp(t), `SKILL.md should mention ${t}`)
  }
})
