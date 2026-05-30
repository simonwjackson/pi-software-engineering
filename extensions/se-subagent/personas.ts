/**
 * Default persona sets for the se-review / se-doc-review / se-research
 * commands. Defined in one place so updating the default is one edit,
 * not a sweep across multiple call sites.
 *
 * Agent names mirror the markdown files under agents/ and the bundled
 * pi-subagents lookup directory.
 */

export const DEFAULT_CODE_REVIEW_PERSONAS = [
  "se-coherence-reviewer",
  "se-correctness-reviewer",
  "se-security-reviewer",
  "se-testing-reviewer",
  "se-maintainability-reviewer",
  "se-reliability-reviewer",
  "se-performance-reviewer",
  "se-scope-guardian-reviewer",
] as const

export const DEFAULT_DOC_REVIEW_PERSONAS = [
  "se-adversarial-document-reviewer",
  "se-coherence-reviewer",
  "se-scope-guardian-reviewer",
  "se-feasibility-reviewer",
] as const

export const DEFAULT_RESEARCH_AGENTS = [
  "se-best-practices-researcher",
  "se-framework-docs-researcher",
  "se-web-researcher",
  "se-repo-research-analyst",
] as const

export type CodeReviewPersona = (typeof DEFAULT_CODE_REVIEW_PERSONAS)[number]
export type DocReviewPersona = (typeof DEFAULT_DOC_REVIEW_PERSONAS)[number]
export type ResearchAgent = (typeof DEFAULT_RESEARCH_AGENTS)[number]
