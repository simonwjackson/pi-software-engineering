export interface LoopUnitFiles {
  create: string[]
  modify: string[]
  test: string[]
  other: string[]
}

export interface LoopUnit {
  id: string
  title: string
  goal: string
  requirements: string
  dependencies: string[]
  files: LoopUnitFiles
  approach: string
  executionNote: string
  patternsToFollow: string[]
  testScenarios: string[]
  verification: string[]
  raw: string
}

export interface ParsedPlan {
  title: string
  units: LoopUnit[]
}

export class PlanParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanParseError"
  }
}

const UNIT_HEADING = /^###\s+(U\d+)\.\s+(.+)\s*$/gm
const FIELD_HEADING = /^\*\*([^*]+):\*\*\s*(.*)$/

function compactLines(value: string): string {
  return value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n")
}

function parseList(value: string): string[] {
  return value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
}

function parseDependencies(value: string): string[] {
  const compact = compactLines(value)
  if (!compact || /^none$/i.test(compact)) return []
  return Array.from(new Set(compact.match(/\bU\d+\b/g) ?? []))
}

function parseFiles(value: string): LoopUnitFiles {
  const files: LoopUnitFiles = { create: [], modify: [], test: [], other: [] }

  for (const item of parseList(value)) {
    const match = item.match(/^(Create|Modify|Test):\s*`?([^`]+?)`?\s*$/i)
    if (!match) {
      files.other.push(item.replace(/^`|`$/g, ""))
      continue
    }

    const bucket = match[1].toLowerCase() as keyof LoopUnitFiles
    const rawPaths = match[2]
      .split(/,\s*/)
      .map(path => path.trim().replace(/^`|`$/g, ""))
      .filter(Boolean)

    files[bucket].push(...rawPaths)
  }

  return files
}

function parseFields(raw: string): Map<string, string> {
  const fields = new Map<string, string>()
  const lines = raw.split("\n")
  let currentKey: string | null = null
  let currentValue: string[] = []

  function flush() {
    if (!currentKey) return
    fields.set(currentKey, currentValue.join("\n").trim())
  }

  for (const line of lines) {
    const match = line.match(FIELD_HEADING)
    if (match) {
      flush()
      currentKey = match[1].trim().toLowerCase()
      currentValue = [match[2] ?? ""]
      continue
    }

    if (currentKey) currentValue.push(line)
  }

  flush()
  return fields
}

function parseUnit(id: string, title: string, raw: string): LoopUnit {
  const fields = parseFields(raw)
  const get = (name: string) => fields.get(name.toLowerCase()) ?? ""

  return {
    id,
    title: title.trim(),
    goal: compactLines(get("Goal")),
    requirements: compactLines(get("Requirements")),
    dependencies: parseDependencies(get("Dependencies")),
    files: parseFiles(get("Files")),
    approach: compactLines(get("Approach")),
    executionNote: compactLines(get("Execution note")),
    patternsToFollow: parseList(get("Patterns to follow")),
    testScenarios: parseList(get("Test scenarios")),
    verification: parseList(get("Verification")),
    raw: raw.trim(),
  }
}

export function parsePlanMarkdown(markdown: string): ParsedPlan {
  const title = markdown.match(/^#\s+(.+)\s*$/m)?.[1]?.trim() ?? "Untitled plan"
  const matches = Array.from(markdown.matchAll(UNIT_HEADING))

  if (matches.length === 0) {
    throw new PlanParseError("No implementation units found. Expected headings like `### U1. Name`.")
  }

  const units = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index ?? markdown.length : markdown.length
    return parseUnit(match[1], match[2], markdown.slice(start, end))
  })

  const seen = new Set<string>()
  for (const unit of units) {
    if (seen.has(unit.id)) throw new PlanParseError(`Duplicate implementation unit ID: ${unit.id}`)
    seen.add(unit.id)
  }

  return { title, units }
}

export function nextRunnableUnit(units: LoopUnit[], completedIds: Set<string>): LoopUnit | null {
  return units.find(unit => {
    if (completedIds.has(unit.id)) return false
    return unit.dependencies.every(dependency => completedIds.has(dependency))
  }) ?? null
}

export function unitFilePaths(unit: LoopUnit): string[] {
  return Array.from(new Set([
    ...unit.files.create,
    ...unit.files.modify,
    ...unit.files.test,
    ...unit.files.other,
  ].filter(Boolean)))
}
