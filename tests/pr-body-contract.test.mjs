import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"

import {
  diffAnchor,
  expandFilePlaceholders,
  fileDiffLink,
  findAnchorMismatches,
  hasFilePlaceholders,
  validatePrBody,
} from "../extensions/pr-body-contract.ts"

const CTX = { owner: "simonwjackson", repo: "korri", pr: 21 }

function sha(path) {
  return createHash("sha256").update(path, "utf8").digest("hex")
}

const BADGE =
  "[![Software Engineering](https://img.shields.io/badge/Built_with-Software_Engineering-6366f1)](https://github.com/simonwjackson/pi-software-engineering)"

function compliantBody(risk) {
  const monitoring =
    risk === "medium" || risk === "high"
      ? "\n## Post-Deploy Monitoring & Validation\n\nWatch the first run.\n\n---\n"
      : ""
  return [
    `**Risk: ${risk}.** Weigh the cache trust boundary.`,
    "",
    "---",
    "",
    "## Context",
    "",
    "Before this, builds were slow.",
    monitoring,
    BADGE,
  ].join("\n")
}

const rules = body_opts => validatePrBody(...body_opts).map(v => v.rule)

test("diffAnchor computes lowercase hex sha256 of the path", () => {
  assert.equal(diffAnchor("flake.nix"), sha("flake.nix"))
  assert.equal(diffAnchor("nix/korri-rocknix-rootfs.nix"), sha("nix/korri-rocknix-rootfs.nix"))
})

test("fileDiffLink builds a clickable diff-anchor link with path code text", () => {
  assert.equal(
    fileDiffLink(CTX, "flake.nix"),
    `[\`flake.nix\`](https://github.com/simonwjackson/korri/pull/21/files#diff-${sha("flake.nix")})`,
  )
})

test("placeholders are detected and expanded into correct links", () => {
  const body = "See {{file:flake.nix}} and {{file:nix/korri-rocknix-rootfs.nix}}."
  assert.equal(hasFilePlaceholders(body), true)
  const expanded = expandFilePlaceholders(body, CTX)
  assert.equal(hasFilePlaceholders(expanded), false)
  assert.ok(expanded.includes(`#diff-${sha("flake.nix")}`))
  assert.ok(expanded.includes(`#diff-${sha("nix/korri-rocknix-rootfs.nix")}`))
})

test("findAnchorMismatches flags a wrong hand-written anchor", () => {
  const wrong = "0".repeat(64)
  const body = `See [\`flake.nix\`](https://github.com/o/r/pull/3/files#diff-${wrong}).`
  const mismatches = findAnchorMismatches(body)
  assert.equal(mismatches.length, 1)
  assert.equal(mismatches[0].path, "flake.nix")
  assert.equal(mismatches[0].expected, sha("flake.nix"))
})

test("findAnchorMismatches passes a correct anchor and ignores prose links", () => {
  assert.equal(findAnchorMismatches(fileDiffLink(CTX, "flake.nix")).length, 0)
  const wrong = "0".repeat(64)
  const prose = `[\`see this section\`](https://github.com/o/r/pull/3/files#diff-${wrong})`
  assert.equal(findAnchorMismatches(prose).length, 0)
})

test("a compliant body passes for each risk level", () => {
  for (const risk of ["low", "low-medium", "medium", "high"]) {
    assert.deepEqual(validatePrBody(compliantBody(risk), { risk }), [])
  }
})

test("non-trivial body requires the risk line first", () => {
  const body = `## Summary\n\nDid a thing.\n\n---\n\n${BADGE}`
  assert.ok(rules([body, { risk: "low-medium" }]).includes("risk-line-first"))
})

test("trivial body skips the risk line but still needs the badge", () => {
  assert.deepEqual(validatePrBody(`Bump dep to 2.0.\n\n${BADGE}`, { risk: "low", trivial: true }), [])
  assert.ok(rules(["Bump dep to 2.0.", { risk: "low", trivial: true }]).includes("badge"))
})

test("headings require thematic breaks", () => {
  const body = `**Risk: medium.** x\n\n## Context\n\ntext\n\n## Post-Deploy Monitoring\n\nwatch\n\n${BADGE}`
  assert.ok(rules([body, { risk: "medium" }]).includes("thematic-breaks"))
})

test("monitoring section required for medium/high, not low", () => {
  const body = `**Risk: medium.** x\n\n---\n\n## Context\n\ntext\n\n${BADGE}`
  assert.ok(rules([body, { risk: "medium" }]).includes("monitoring"))
  assert.ok(!rules([body, { risk: "low" }]).includes("monitoring"))
})

test("bare #NN issue references are flagged", () => {
  const body = `${compliantBody("low")}\n\n- #12 do the thing`
  assert.ok(rules([body, { risk: "low" }]).includes("bare-issue-ref"))
})

test("a mismatched diff anchor fails an otherwise compliant body", () => {
  const wrong = "0".repeat(64)
  const body = `${compliantBody("low")}\n\nSee [\`flake.nix\`](https://github.com/o/r/pull/3/files#diff-${wrong}).`
  assert.ok(rules([body, { risk: "low" }]).includes("anchor-mismatch"))
})
