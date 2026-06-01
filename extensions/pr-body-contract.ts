import { createHash } from "node:crypto"

/**
 * PR body structural contract (task: PR-body gate).
 *
 * The PR description guide (skills/se-work/references/pr-description-writing.md)
 * is a mechanical contract, not a loose checklist. Historically it lived only
 * as prose: the model read it, treated it as advisory, and shipped bodies that
 * skipped the risk line, the thematic breaks, the monitoring section, the badge
 * block, or used hand-computed (and sometimes wrong) diff-anchor links.
 *
 * This module turns the load-bearing parts of that contract into pure,
 * deterministic checks so the `se_pr_publish` tool can refuse a non-compliant
 * body at the harness boundary — the same posture `se_atomic_commit` takes for
 * RED commits. It also OWNS diff-anchor computation: callers place a
 * `{{file:<path>}}` placeholder and the tool expands it into a correct
 * clickable Files-Changed link, so a model never computes a sha256 by hand.
 *
 * Everything here is pure and side-effect free; the gh shell-out lives in the
 * tool that imports this module.
 */

export type RiskLevel = "low" | "low-medium" | "medium" | "high"

export interface PrBodyContractOptions {
  /** Risk level the author declared. Drives which sections are mandatory. */
  readonly risk: RiskLevel
  /**
   * Trivial PRs (typo, dep bump, one-line config) may ship a single-paragraph
   * body: no risk line, no headings, no thematic breaks. The badge is still
   * required. Defaults to false.
   */
  readonly trivial?: boolean
  /**
   * Override the monitoring-section requirement. When omitted, monitoring is
   * required for medium and high risk (per shipping-workflow.md).
   */
  readonly requireMonitoring?: boolean
}

export interface PrBodyViolation {
  readonly rule: string
  readonly message: string
}

export interface PrLinkContext {
  readonly owner: string
  readonly repo: string
  readonly pr: number
}

const RISK_PREFIX = "**Risk:"

/** Lowercase hex SHA-256 of a file path string (UTF-8, no trailing newline). */
export function diffAnchor(path: string): string {
  return createHash("sha256").update(path, "utf8").digest("hex")
}

/** A clickable Files-Changed diff-anchor link with the path as code text. */
export function fileDiffLink(ctx: PrLinkContext, path: string): string {
  const clean = path.trim()
  return `[\`${clean}\`](https://github.com/${ctx.owner}/${ctx.repo}/pull/${ctx.pr}/files#diff-${diffAnchor(clean)})`
}

const FILE_PLACEHOLDER = /\{\{file:([^}]+)\}\}/g

/** True when the body still contains an unexpanded {{file:...}} placeholder. */
export function hasFilePlaceholders(body: string): boolean {
  FILE_PLACEHOLDER.lastIndex = 0
  return FILE_PLACEHOLDER.test(body)
}

/** Replace every {{file:<path>}} with a correct diff-anchor link. */
export function expandFilePlaceholders(body: string, ctx: PrLinkContext): string {
  return body.replace(FILE_PLACEHOLDER, (_m, p1: string) => fileDiffLink(ctx, p1))
}

// [`<text>`](<url>/pull/<n>/files#diff-<64 hex>)
const ANCHOR_LINK = /\[`([^`]+)`\]\((https?:\/\/[^)]*?\/pull\/\d+\/files#diff-([0-9a-f]{64}))\)/g

export interface AnchorMismatch {
  readonly path: string
  readonly expected: string
  readonly found: string
}

/**
 * Find diff-anchor links whose hash does not match sha256(linkText). Only
 * link texts that look like file paths (contain a dot or slash, no spaces) are
 * checked, so prose links are not false-flagged.
 */
export function findAnchorMismatches(body: string): AnchorMismatch[] {
  const out: AnchorMismatch[] = []
  ANCHOR_LINK.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ANCHOR_LINK.exec(body)) !== null) {
    const text = m[1].trim()
    const found = m[3]
    const looksLikePath = !/\s/.test(text) && /[./]/.test(text)
    if (!looksLikePath) continue
    const expected = diffAnchor(text)
    if (found !== expected) out.push({ path: text, expected, found })
  }
  return out
}

/**
 * Validate a PR body against the structural contract. Returns a list of
 * violations (empty means compliant). Pure: no expansion, no I/O. Callers that
 * use {{file:}} placeholders should expand them first when a PR number is
 * known, then validate the expanded body.
 */
export function validatePrBody(body: string, opts: PrBodyContractOptions): PrBodyViolation[] {
  const violations: PrBodyViolation[] = []
  const trivial = opts.trivial === true
  const lines = body.split("\n")
  const firstNonEmpty = lines.find(l => l.trim() !== "") ?? ""
  const hasHeadings = /^##\s+/m.test(body)

  if (!trivial && !firstNonEmpty.trimStart().startsWith(RISK_PREFIX)) {
    violations.push({
      rule: "risk-line-first",
      message: `The first line of a non-trivial PR body must be the risk line: \`${RISK_PREFIX} <level>.** <one sentence>\`. Set trivial=true only for typo/dep-bump/one-line-config PRs.`,
    })
  }

  if (!trivial && hasHeadings && !/^---\s*$/m.test(body)) {
    violations.push({
      rule: "thematic-breaks",
      message: "Body uses `##` headings but has no `---` thematic breaks between major sections. Add `---` separators (see Step E of pr-description-writing.md).",
    })
  }

  if (!/Built_with-Software_Engineering/.test(body)) {
    violations.push({
      rule: "badge",
      message: "Missing the Software Engineering badge block. Append the `Built_with-Software_Engineering` shields.io badge (Step G, section 17 of pr-description-writing.md).",
    })
  }

  const requireMonitoring = opts.requireMonitoring ?? (opts.risk === "medium" || opts.risk === "high")
  if (requireMonitoring && !/^##\s+Post-Deploy Monitoring/m.test(body)) {
    violations.push({
      rule: "monitoring",
      message: "Risk is medium/high (or monitoring was explicitly required) but there is no `## Post-Deploy Monitoring` section. Add one with validation window, healthy signals, and rollback triggers (shipping-workflow.md).",
    })
  }

  for (const mismatch of findAnchorMismatches(body)) {
    violations.push({
      rule: "anchor-mismatch",
      message: `Diff anchor for \`${mismatch.path}\` is wrong (found ${mismatch.found.slice(0, 12)}…, expected ${mismatch.expected.slice(0, 12)}…). Do not hand-compute anchors; write \`{{file:${mismatch.path}}}\` and let se_pr_publish compute it.`,
    })
  }

  for (const line of lines) {
    if (/^\s*(?:[-*+]\s+)?#\d+\b/.test(line)) {
      violations.push({
        rule: "bare-issue-ref",
        message: `Line starts with a bare \`#NN\` which GitHub auto-links as an issue reference: "${line.trim().slice(0, 50)}". Use \`org/repo#NN\` or a full URL.`,
      })
      break
    }
  }

  return violations
}
