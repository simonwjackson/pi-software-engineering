import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync, statSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"))

test("pi.image is set to a durable raw.githubusercontent URL pointing at docs/gallery/card.png", () => {
  const url = PKG.pi?.image
  assert.ok(url, "pi.image is missing")
  assert.match(url, /^https:\/\/raw\.githubusercontent\.com\//, "pi.image must be a raw GH URL")
  assert.match(url, /docs\/gallery\/card\.png$/, "pi.image must point at the in-repo asset")
})

test("gallery card asset exists on disk at the URL's relative path", () => {
  const url = PKG.pi.image
  const rel = url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, "")
  assert.ok(existsSync(resolve(ROOT, rel)), `gallery asset missing on disk: ${rel}`)
})

test("gallery card.png is a real PNG (signature) and non-trivial in size", () => {
  const buf = readFileSync(resolve(ROOT, "docs/gallery/card.png"))
  // PNG magic bytes.
  assert.equal(buf[0], 0x89)
  assert.equal(buf[1], 0x50)
  assert.equal(buf[2], 0x4e)
  assert.equal(buf[3], 0x47)
  // Modest minimum size — empty/corrupt PNGs are tiny.
  const size = statSync(resolve(ROOT, "docs/gallery/card.png")).size
  assert.ok(size > 20000, `expected card.png > 20KB, got ${size}`)
})

test("docs/gallery is included in package.json files (ships in the npm tarball)", () => {
  const files = PKG.files ?? []
  assert.ok(
    files.some(f => f === "docs/gallery" || f === "docs/gallery/"),
    `package.json files should include 'docs/gallery': ${files.join(", ")}`,
  )
})

test("source SVG stays in-repo alongside the PNG so regens are reproducible", () => {
  assert.ok(existsSync(resolve(ROOT, "docs/gallery/card.svg")))
})
