import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = () => readFileSync(resolve(ROOT, "extensions/se-tools/se-gemini-imagegen.ts"), "utf8")

test("se-gemini-imagegen.ts exports registerGeminiImageTools", () => {
  assert.match(SRC(), /export function registerGeminiImageTools/)
})

test("se-tools/index.ts wires up registerGeminiImageTools", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-tools/index.ts"), "utf8")
  assert.match(src, /registerGeminiImageTools/)
})

test("registers the three documented gemini_image_* tools", () => {
  for (const t of ["gemini_image_generate", "gemini_image_edit", "gemini_image_compose"]) {
    assert.match(SRC(), new RegExp(`name:\\s*"${t}"`), `missing tool ${t}`)
  }
})

test("each tool delegates to its matching python script under skills/se-gemini-imagegen/scripts/", () => {
  const src = SRC()
  for (const rel of [
    "skills/se-gemini-imagegen/scripts/generate_image.py",
    "skills/se-gemini-imagegen/scripts/edit_image.py",
    "skills/se-gemini-imagegen/scripts/compose_images.py",
  ]) {
    const base = rel.split("/").pop()
    assert.ok(src.includes(base), `wrapper missing script reference: ${base}`)
    assert.ok(existsSync(resolve(ROOT, rel)), `script must stay on disk: ${rel}`)
  }
})

test("gemini_image_generate schema: prompt + output (required) + spreads optional flags", () => {
  const src = SRC()
  const block = src.slice(src.indexOf('"gemini_image_generate"'))
  assert.match(block, /prompt:\s*Type\.String/)
  assert.match(block, /output:\s*Type\.String/)
  // Optional model/aspect/size come from a shared spread.
  assert.match(block, /\.\.\.optionalFlagsSchema/)
})

test("optionalFlagsSchema defines model, aspect, size as Type.Optional", () => {
  const src = SRC()
  const block = src.slice(src.indexOf("optionalFlagsSchema"))
  assert.match(block, /model:\s*Type\.Optional/)
  assert.match(block, /aspect:\s*Type\.Optional/)
  assert.match(block, /size:\s*Type\.Optional/)
})

test("gemini_image_edit schema: input + instruction + output (required)", () => {
  const src = SRC()
  const block = src.slice(src.indexOf('"gemini_image_edit"'))
  assert.match(block, /input:\s*Type\.String/)
  assert.match(block, /instruction:\s*Type\.String/)
  assert.match(block, /output:\s*Type\.String/)
})

test("gemini_image_compose schema: instruction + output + images array (required)", () => {
  const src = SRC()
  const block = src.slice(src.indexOf('"gemini_image_compose"'))
  assert.match(block, /instruction:\s*Type\.String/)
  assert.match(block, /output:\s*Type\.String/)
  assert.match(block, /images:\s*Type\.Array\(\s*Type\.String/)
})

test("runs the python scripts via python3 (via the shared runPython helper)", () => {
  const src = SRC()
  // Tools may share a helper that invokes python3 once; check the helper exists.
  assert.match(src, /python3/)
  assert.match(src, /function runPython/)
})

test("each tool surfaces script errors via isError + stderr", () => {
  const src = SRC()
  const isErrorCount = (src.match(/isError:\s*true/g) ?? []).length
  assert.ok(isErrorCount >= 3, `expected at least 3 isError paths, got ${isErrorCount}`)
})

test("each tool's promptGuidelines names itself, and GEMINI_API_KEY pre-flight is documented", () => {
  const src = SRC()
  for (const t of ["gemini_image_generate", "gemini_image_edit", "gemini_image_compose"]) {
    const block = new RegExp(`name:\\s*"${t}"[\\s\\S]{0,4000}?promptGuidelines:`, "m")
    assert.match(src, block, `${t} block missing promptGuidelines`)
  }
  // The GEMINI_API_KEY pre-flight is documented at least once.
  assert.match(src, /GEMINI_API_KEY/)
})

test("se-gemini-imagegen SKILL.md mentions the three registered tools by name", () => {
  const src = readFileSync(resolve(ROOT, "skills/se-gemini-imagegen/SKILL.md"), "utf8")
  for (const t of ["gemini_image_generate", "gemini_image_edit", "gemini_image_compose"]) {
    assert.match(src, new RegExp(t), `SKILL.md should mention ${t}`)
  }
})
