import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dirname, "..")

test("software-engineering.ts has a default export", () => {
  const src = readFileSync(resolve(REPO_ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /export default function/, "software-engineering.ts must default-export an extension function")
})

test("se-review.ts has a default export and registers se_review_finding", () => {
  const src = readFileSync(resolve(REPO_ROOT, "extensions/se-review.ts"), "utf8")
  assert.match(src, /export default function/, "se-review.ts must default-export an extension function")
  assert.match(src, /name:\s*"se_review_finding"/, "se-review.ts must register a tool named se_review_finding")
  assert.match(src, /pi\.appendEntry\(/, "se-review.ts must persist findings to the session log")
})

test("package.json points pi.extensions at extant files only", () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  const extPaths = pkg?.pi?.extensions ?? []
  assert.ok(extPaths.length > 0, "package.json must declare at least one pi.extensions path")
  for (const p of extPaths) {
    assert.ok(existsSync(resolve(REPO_ROOT, p)), `pi.extensions path missing on disk: ${p}`)
  }
})

test("package.json peer-deps use the @mariozechner namespace (Pi runtime resolver)", () => {
  // Note: Pi v0.77 runtime still publishes under @mariozechner/* despite the
  // @earendil-works alias appearing in the nix-store layout. Extensions loaded
  // from a user's pi install must import @mariozechner/* names or the require
  // resolver throws "Cannot find module ...". See task-009 rollback in commit
  // history.
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  const peers = Object.keys(pkg.peerDependencies ?? {})
  for (const name of peers) {
    assert.ok(
      name.startsWith("@mariozechner/") || name === "@sinclair/typebox",
      `peer-dep ${name} should use @mariozechner/ namespace or @sinclair/typebox (runtime resolution)`,
    )
  }
})
