/**
 * se-review extension
 *
 * Registers the `se_review_finding` tool so se-code-review and se-doc-review
 * skills can emit each review finding as a structured, harness-rendered card
 * instead of loose prose. Findings are persisted to the session log via
 * pi.appendEntry under customType "se:review-finding" so that future SE
 * surfaces (e.g. /se-residuals) can read them back without re-parsing chat.
 *
 * Aligns with:
 *   - skills/se-code-review/references/findings-schema.json
 *   - skills/se-doc-review/references/findings-schema.json
 *
 * Severity scale: P0..P3 (the project's existing scale).
 * Confidence anchors: 0 | 25 | 50 | 75 | 100.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent"
import { Text } from "@mariozechner/pi-tui"
import { Type, type Static, type TUnsafe } from "@sinclair/typebox"

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const
type Severity = (typeof SEVERITIES)[number]

const AUTOFIX_CLASSES = ["safe_auto", "gated_auto", "manual", "advisory"] as const
type AutofixClass = (typeof AUTOFIX_CLASSES)[number]

const OWNERS = ["review-fixer", "downstream-resolver", "human", "release"] as const
type Owner = (typeof OWNERS)[number]

const FINDING_KINDS = ["code", "doc"] as const
type FindingKind = (typeof FINDING_KINDS)[number]

const FINDING_TYPES = ["error", "omission"] as const
type FindingType = (typeof FINDING_TYPES)[number]

const CONFIDENCE_VALUES = [0, 25, 50, 75, 100] as const
type Confidence = (typeof CONFIDENCE_VALUES)[number]

/**
 * Flat `{ type: "string", enum: [...] }` JSON Schema instead of the
 * `anyOf`/`oneOf` shape that `Type.Union([Type.Literal()])` produces. Google's
 * function-calling API rejects the union form. Local copy of pi-ai's helper
 * to avoid taking a hard peer dep for one shim.
 */
function StringEnum<const T extends readonly string[]>(
  values: T,
  options?: { description?: string; default?: T[number] },
): TUnsafe<T[number]> {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...(options?.description ? { description: options.description } : {}),
    ...(options?.default !== undefined ? { default: options.default } : {}),
  })
}

function IntEnum<const T extends readonly number[]>(
  values: T,
  options?: { description?: string; default?: T[number] },
): TUnsafe<T[number]> {
  return Type.Unsafe<T[number]>({
    type: "integer",
    enum: [...values],
    ...(options?.description ? { description: options.description } : {}),
    ...(options?.default !== undefined ? { default: options.default } : {}),
  })
}

const FindingSchema = Type.Object({
  kind: StringEnum(FINDING_KINDS, {
    description:
      "What was reviewed. 'code' = code-review finding from se-code-review; 'doc' = document-review finding from se-doc-review.",
  }),
  title: Type.String({
    description: "Short, specific issue title. 10 words or fewer. Lead with a verb when proposing a fix.",
    maxLength: 100,
  }),
  severity: StringEnum(SEVERITIES, {
    description:
      "P0 = critical breakage / exploit / data loss. P1 = high-impact defect or breaking contract. P2 = moderate (edge case, perf regression, maintainability trap). P3 = low-impact, narrow improvement.",
  }),
  why_it_matters: Type.String({
    description:
      "Impact and failure mode -- not 'what is wrong' but 'what breaks if not addressed'. Keep concrete.",
  }),
  autofix_class: StringEnum(AUTOFIX_CLASSES, {
    description:
      "Routing class. safe_auto = mechanical fix the in-skill fixer can apply silently. gated_auto = concrete fix that changes behavior/contracts/permissions and needs approval. manual = needs design decision. advisory = report-only, no code change. doc-review must not use 'advisory'.",
  }),
  confidence: IntEnum(CONFIDENCE_VALUES, {
    description:
      "Anchored confidence. Use exactly one of 0, 25, 50, 75, 100. Report only 75+ (or 50+ for P0). 75 = double-checked, will affect users/runtime in normal usage. 100 = verifiable from code/doc alone.",
  }),
  evidence: Type.Array(Type.String(), {
    description:
      "Code- or document-grounded evidence: snippets, line refs, quoted document text, or pattern descriptions. At least 1 item.",
    minItems: 1,
  }),

  // Code-finding fields (required when kind == "code").
  file: Type.Optional(
    Type.String({
      description: "Code findings: relative file path from repository root.",
    }),
  ),
  line: Type.Optional(
    Type.Integer({
      description: "Code findings: 1-indexed primary line number.",
      minimum: 1,
    }),
  ),
  owner: Type.Optional(
    StringEnum(OWNERS, {
      description:
        "Code findings: who should own the next action. review-fixer (in-skill fixer), downstream-resolver (residual work), human (judgment call), release (operational follow-up).",
    }),
  ),
  requires_verification: Type.Optional(
    Type.Boolean({
      description:
        "Code findings: whether any fix must be re-verified with targeted tests or a follow-up review pass.",
    }),
  ),
  pre_existing: Type.Optional(
    Type.Boolean({
      description: "Code findings: true if this issue exists in unchanged code unrelated to the current diff.",
    }),
  ),

  // Doc-finding fields (required when kind == "doc").
  section: Type.Optional(
    Type.String({
      description: "Doc findings: document section where the issue appears (e.g., 'Requirements Trace', 'Implementation Unit 3').",
    }),
  ),
  finding_type: Type.Optional(
    StringEnum(FINDING_TYPES, {
      description:
        "Doc findings: 'error' (mistake in what the doc says) or 'omission' (something the doc forgot to say).",
    }),
  ),

  // Shared optional fields.
  suggested_fix: Type.Optional(
    Type.String({
      description:
        "Concrete minimal fix the reviewer can defend from the diff and surrounding code. Omit only when no code/doc change is reachable from review context.",
    }),
  ),
  source: Type.Optional(
    Type.String({
      description:
        "Provenance: which skill+persona produced the finding (e.g., 'se-code-review:security-reviewer'). Helps synthesis and triage.",
    }),
  ),
})

export type ReviewFinding = Static<typeof FindingSchema>

interface PersistedReviewFinding extends ReviewFinding {
  recordedAt: string
}

interface ReviewFindingEntryShape {
  type?: string
  customType?: string
  data?: PersistedReviewFinding
}

const REVIEW_FINDING_ENTRY_TYPE = "se:review-finding"

const SEVERITY_ICON: Record<Severity, string> = {
  P0: "■",
  P1: "▲",
  P2: "●",
  P3: "○",
}

const FINDING_TYPE_ICON: Record<FindingType, string> = {
  error: "✗",
  omission: "○",
}

function severityFg(theme: Theme, severity: Severity): (s: string) => string {
  switch (severity) {
    case "P0":
    case "P1":
      return s => theme.fg("error", s)
    case "P2":
      return s => theme.fg("warning", s)
    case "P3":
      return s => theme.fg("muted", s)
  }
}

function autofixFg(theme: Theme, autofixClass: AutofixClass): (s: string) => string {
  switch (autofixClass) {
    case "safe_auto":
      return s => theme.fg("success", s)
    case "gated_auto":
      return s => theme.fg("warning", s)
    case "manual":
      return s => theme.fg("accent", s)
    case "advisory":
      return s => theme.fg("muted", s)
  }
}

function locationText(finding: ReviewFinding): string {
  if (finding.kind === "code") {
    if (!finding.file) return ""
    return finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file
  }
  return finding.section ?? ""
}

function summaryText(finding: ReviewFinding): string {
  const loc = locationText(finding)
  return [
    `[${finding.severity}]`,
    finding.title,
    loc ? `(${loc})` : "",
    `<${finding.autofix_class}@${finding.confidence}>`,
  ]
    .filter(Boolean)
    .join(" ")
}

function isPersistedReviewFinding(value: unknown): value is PersistedReviewFinding {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<PersistedReviewFinding>
  return (
    typeof v.title === "string"
    && typeof v.severity === "string"
    && (SEVERITIES as readonly string[]).includes(v.severity)
    && typeof v.kind === "string"
    && (FINDING_KINDS as readonly string[]).includes(v.kind)
  )
}

function collectPersistedFindings(ctx: ExtensionContext): PersistedReviewFinding[] {
  try {
    const entries = ctx.sessionManager.getEntries?.() ?? []
    const findings: PersistedReviewFinding[] = []
    for (const raw of entries) {
      const entry = raw as ReviewFindingEntryShape
      if (entry?.customType !== REVIEW_FINDING_ENTRY_TYPE) continue
      if (isPersistedReviewFinding(entry.data)) findings.push(entry.data)
    }
    return findings
  } catch {
    return []
  }
}

function severityCountSummary(findings: readonly PersistedReviewFinding[]): string {
  const counts = new Map<Severity, number>()
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1)
  const parts: string[] = []
  for (const s of SEVERITIES) {
    const n = counts.get(s)
    if (n) parts.push(`${s}:${n}`)
  }
  return parts.join(" ")
}

export default function seReviewExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "se_review_finding",
    label: "Review Finding",
    description:
      "Emit a single structured review finding from se-code-review or se-doc-review. The harness renders it with severity color, location, and autofix routing badges, and persists it to the session log so /se-residuals can read it later. Use one tool call per distinct finding instead of dumping findings in prose.",
    promptSnippet:
      "Emit one structured review finding (kind, severity, title, location, why_it_matters, autofix_class, confidence, evidence)",
    promptGuidelines: [
      "Call se_review_finding once per distinct review finding during interactive output of se-code-review and se-doc-review. One tool call per finding, not one call carrying multiple findings.",
      "Set kind to 'code' for se-code-review findings and 'doc' for se-doc-review findings. For code findings, include file and line; for doc findings, include section and finding_type.",
      "Use the P0..P3 severity scale and one of the five confidence anchors (0, 25, 50, 75, 100). Only emit findings at confidence 75+ (or 50+ for P0 per the project's reporting threshold).",
      "Set autofix_class to safe_auto, gated_auto, manual, or advisory. Bias toward safe_auto when the rubric permits; misclassifying mechanical fixes as gated_auto produces unnecessary triage. advisory is for code findings only.",
      "Pass source as '<skill>:<persona>' when synthesizing per-persona findings (e.g. 'se-code-review:security-reviewer') so triage knows the origin.",
      "Do not call se_review_finding from headless or JSON output modes -- in those modes the structured artifact is the contract. Use this tool only when presenting findings interactively to the user.",
    ],
    parameters: FindingSchema,
    async execute(_toolCallId, params) {
      const finding = params as ReviewFinding
      const persisted: PersistedReviewFinding = {
        ...finding,
        recordedAt: new Date().toISOString(),
      }
      try {
        pi.appendEntry(REVIEW_FINDING_ENTRY_TYPE, persisted)
      } catch {
        // appendEntry must not block the tool's success path.
      }
      return {
        content: [{ type: "text", text: summaryText(finding) }],
        details: persisted,
      }
    },
    renderCall(args, theme) {
      const finding = (args ?? {}) as Partial<ReviewFinding>
      const severity = (finding.severity as Severity | undefined) ?? "P2"
      const color = severityFg(theme, severity)
      const icon = SEVERITY_ICON[severity]
      const title = typeof finding.title === "string" ? finding.title : ""
      const loc = locationText(finding as ReviewFinding)
      const locText = loc ? ` ${theme.fg("mdCode", loc)}` : ""
      return new Text(
        `${color(`${icon} ${severity}`)} ${theme.bold(title)}${locText}`,
        0,
        0,
      )
    },
    renderResult(result, options, theme) {
      const details = result.details as PersistedReviewFinding | undefined
      if (!details) return new Text(theme.fg("muted", "(no finding details)"), 0, 0)

      const sevColor = severityFg(theme, details.severity)
      const sevIcon = SEVERITY_ICON[details.severity]
      const fxColor = autofixFg(theme, details.autofix_class)
      const loc = locationText(details)

      const lines: string[] = []

      // Header: severity badge + title.
      lines.push(
        `${sevColor(`${sevIcon} ${details.severity}`)} ${theme.bold(details.title)}`,
      )

      // Subheader: location + kind/finding_type + pre_existing flag.
      const subParts: string[] = []
      if (loc) subParts.push(theme.fg("mdCode", loc))
      if (details.kind === "doc" && details.finding_type) {
        subParts.push(theme.fg("dim", `${FINDING_TYPE_ICON[details.finding_type]} ${details.finding_type}`))
      }
      if (details.kind === "code" && details.pre_existing) {
        subParts.push(theme.fg("dim", "pre-existing"))
      }
      if (subParts.length > 0) lines.push(`  ${subParts.join(theme.fg("dim", "  ·  "))}`)

      // Body: why_it_matters.
      lines.push(`  ${theme.fg("text", details.why_it_matters)}`)

      // Suggested fix.
      if (details.suggested_fix) {
        lines.push(`  ${theme.fg("mdQuote", "↳ fix:")} ${theme.fg("text", details.suggested_fix)}`)
      }

      // Routing badges + provenance + verification flag.
      const badges: string[] = []
      badges.push(fxColor(details.autofix_class))
      if (details.kind === "code" && details.owner) badges.push(theme.fg("accent", details.owner))
      badges.push(theme.fg("dim", `${details.confidence}%`))
      if (details.requires_verification) badges.push(theme.fg("warning", "verify"))
      if (details.source) badges.push(theme.fg("muted", details.source))
      lines.push(`  ${badges.join(theme.fg("dim", "  ·  "))}`)

      // Evidence (expanded only).
      if (options.expanded && details.evidence.length > 0) {
        lines.push(theme.fg("dim", "  evidence:"))
        for (const e of details.evidence) {
          for (const evLine of e.split("\n")) {
            lines.push(`    ${theme.fg("dim", "│")} ${theme.fg("mdCode", evLine)}`)
          }
        }
      } else if (!options.expanded && details.evidence.length > 0) {
        lines.push(`  ${theme.fg("dim", `${details.evidence.length} evidence item(s)`)}`)
      }

      return new Text(lines.join("\n"), 0, 0)
    },
  })

  pi.on("session_start", async (event, ctx) => {
    if (!ctx.hasUI) return
    if (event.reason !== "startup" && event.reason !== "resume") return
    const findings = collectPersistedFindings(ctx)
    if (findings.length === 0) {
      ctx.ui.setStatus?.("se-review", "")
      return
    }
    const summary = severityCountSummary(findings)
    ctx.ui.setStatus?.(
      "se-review",
      `${findings.length} review finding${findings.length === 1 ? "" : "s"}${summary ? ` · ${summary}` : ""}`,
    )
  })
}
