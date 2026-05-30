import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("se-tools/index.ts wires up registerSeTools", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/index.ts"), "utf8")
  assert.match(src, /export function registerSeTools/)
  assert.match(src, /registerCleanGoneTool/)
  assert.match(src, /registerSessionTools/)
})

test("se-clean-gone tool wraps the existing skill script", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-clean-gone.ts"), "utf8")
  assert.match(src, /name:\s*"se_clean_gone"/)
  assert.match(src, /skills\/se-clean-gone-branches\/scripts\/clean-gone/)
  // dryRun defaults to true
  assert.match(src, /dryRun !== false/)
})

test("se-clean-gone TypeBox parameters cover dryRun and includeWorktrees", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-clean-gone.ts"), "utf8")
  assert.match(src, /dryRun:\s*Type\.Optional\(\s*Type\.Boolean/)
  assert.match(src, /includeWorktrees:\s*Type\.Optional\(\s*Type\.Boolean/)
})

test("se-sessions registers the three documented tools", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-sessions.ts"), "utf8")
  for (const t of ["se_session_list", "se_session_skeleton", "se_session_errors"]) {
    assert.match(src, new RegExp(`name:\\s*"${t}"`), `missing tool ${t}`)
  }
})

test("se_session_list TypeBox parameters cover repo, since, platform", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-sessions.ts"), "utf8")
  assert.match(src, /repo:\s*Type\.String/)
  assert.match(src, /since:\s*Type\.Optional\(\s*Type\.Integer/)
  assert.match(src, /Type\.Literal\("claude"\)/)
  assert.match(src, /Type\.Literal\("codex"\)/)
  assert.match(src, /Type\.Literal\("cursor"\)/)
})

test("tool wrappers reference existing skill scripts on disk", () => {
  const skillScripts = [
    "skills/se-clean-gone-branches/scripts/clean-gone",
    "skills/se-session-inventory/scripts/discover-sessions.sh",
    "skills/se-session-extract/scripts/extract-skeleton.py",
    "skills/se-session-extract/scripts/extract-errors.py",
  ]
  for (const rel of skillScripts) {
    assert.ok(existsSync(resolve(ROOT, rel)), `expected script on disk: ${rel}`)
  }
})

test("software-engineering.ts calls registerSeTools from the extension entry point", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /import \{ registerSeTools \} from "\.\/se-tools\/index\.ts"/)
  assert.match(src, /registerSeTools\(pi, PACKAGE_ROOT\)/)
})

test("wrapped skills' SKILL.md prose mentions the registered tool name", () => {
  for (const [path, tool] of [
    ["skills/se-clean-gone-branches/SKILL.md", "se_clean_gone"],
    ["skills/se-session-inventory/SKILL.md", "se_session_list"],
    ["skills/se-session-extract/SKILL.md", "se_session_skeleton"],
  ]) {
    const src = readFileSync(resolve(ROOT, path), "utf8")
    assert.match(src, new RegExp(tool), `${path} should mention ${tool}`)
  }
})

test("scripts stay on disk as fallback (not deleted by the wrapping)", () => {
  // Reinforce the contract: lifting to a tool keeps the script as fallback.
  for (const rel of [
    "skills/se-clean-gone-branches/scripts/clean-gone",
    "skills/se-session-inventory/scripts/discover-sessions.sh",
    "skills/se-session-extract/scripts/extract-skeleton.py",
  ]) {
    assert.ok(existsSync(resolve(ROOT, rel)), `script must stay on disk: ${rel}`)
  }
})
