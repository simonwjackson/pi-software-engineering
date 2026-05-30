import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("se-pulse.ts exists and exports registerPulseTool", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /export function registerPulseTool/)
})

test("se-tools/index.ts wires up registerPulseTool", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/index.ts"), "utf8")
  assert.match(src, /registerPulseTool/)
})

test("pulse_report tool is registered with TypeBox schema", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /name:\s*"pulse_report"/)
  assert.match(src, /parameters:\s*Type\.Object/)
})

test("pulse_report parameters include window, markdown, and optional title", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /window:\s*Type\.String/)
  assert.match(src, /markdown:\s*Type\.String/)
  assert.match(src, /title:\s*Type\.Optional/)
})

test("pulse_report writes under docs/pulse-reports/", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /docs\/pulse-reports/)
})

test("pulse_report uses deterministic ISO-prefixed filename", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  // ISO date (YYYY-MM-DD) plus the window argument forms the filename stem.
  assert.match(src, /toISOString/)
})

test("pulse_report mkdirs the output directory when missing", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /mkdirSync/)
  assert.match(src, /recursive:\s*true/)
})

test("pulse_report validates window argument (rejects empty)", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  // Schema declares minLength on window so an empty string is rejected.
  assert.match(src, /window:\s*Type\.String\(\{\s*minLength:\s*1/)
})

test("pulse_report promptGuidelines name the tool explicitly", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/se-pulse.ts"), "utf8")
  assert.match(src, /promptGuidelines:/)
  assert.match(src, /pulse_report/)
})

test("se-product-pulse SKILL.md mentions pulse_report by name", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-product-pulse/SKILL.md"), "utf8")
  assert.match(src, /pulse_report/)
})

test("se-product-pulse SKILL.md is unchanged below the surface — references/ still present", () => {
  // Wrapper doesn't replace the prose, just gives it a typed save surface.
  assert.ok(existsSync(resolve(ROOT, "skills/se-product-pulse/references")))
})
