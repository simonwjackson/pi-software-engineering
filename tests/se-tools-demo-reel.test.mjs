import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = () => readFileSync(resolve(ROOT, "extensions/se-tools/se-demo-reel.ts"), "utf8")

test("se-demo-reel.ts exists and exports registerDemoReelTool", () => {
  assert.match(SRC(), /export function registerDemoReelTool/)
})

test("se-tools/index.ts wires up registerDemoReelTool", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/index.ts"), "utf8")
  assert.match(src, /registerDemoReelTool/)
})

test("capture_demo tool is registered with TypeBox schema", () => {
  assert.match(SRC(), /name:\s*"capture_demo"/)
  assert.match(SRC(), /parameters:\s*Type\.Object/)
})

test("subcommand parameter is a Union of the documented script subcommands", () => {
  const src = SRC()
  for (const sub of [
    "preflight",
    "detect",
    "recommend",
    "stitch",
    "screenshot-reel",
    "terminal-recording",
    "preview",
    "upload",
    "save-local",
  ]) {
    assert.match(src, new RegExp(`Type\\.Literal\\("${sub}"\\)`), `missing subcommand literal: ${sub}`)
  }
})

test("argv parameter is an optional string array (passthrough to the script)", () => {
  const src = SRC()
  assert.match(src, /argv:\s*Type\.Optional\(\s*Type\.Array\(\s*Type\.String/)
})

test("delegates to capture-demo.py at the documented path", () => {
  const src = SRC()
  assert.match(src, /skills\/se-demo-reel\/scripts\/capture-demo\.py/)
  assert.ok(existsSync(resolve(ROOT, "skills/se-demo-reel/scripts/capture-demo.py")))
})

test("invokes python3 with the script path + subcommand + argv", () => {
  const src = SRC()
  assert.match(src, /python3/)
})

test("capture_demo surfaces script errors via isError + stderr", () => {
  const src = SRC()
  assert.match(src, /isError:\s*true/)
})

test("capture_demo promptGuidelines name the tool explicitly and document subcommand routing", () => {
  const src = SRC()
  assert.match(src, /promptGuidelines:/)
  assert.match(src, /capture_demo/)
  // Routing hint: preflight before any capture.
  assert.match(src, /preflight/)
})

test("se-demo-reel SKILL.md mentions capture_demo by name", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-demo-reel/SKILL.md"), "utf8")
  assert.match(src, /capture_demo/)
})

test("capture-demo.py stays on disk as fallback", () => {
  assert.ok(existsSync(resolve(ROOT, "skills/se-demo-reel/scripts/capture-demo.py")))
})
