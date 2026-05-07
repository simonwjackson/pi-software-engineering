import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface VerifyCommandDiscovery {
  command: string | null
  source: string
  confidence: "high" | "medium" | "none"
}

const PREFERRED_NPM_SCRIPTS = ["ci", "test", "check", "verify", "lint"]
const PREFERRED_MISE_TASKS = ["ci", "test", "check", "verify"]

function readText(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null
  } catch {
    return null
  }
}

function discoverFromPackageJson(cwd: string): VerifyCommandDiscovery | null {
  const body = readText(join(cwd, "package.json"))
  if (!body) return null

  try {
    const packageJson = JSON.parse(body) as { scripts?: Record<string, string> }
    const scripts = packageJson.scripts ?? {}
    for (const scriptName of PREFERRED_NPM_SCRIPTS) {
      if (scripts[scriptName]) {
        return {
          command: scriptName === "test" ? "npm test" : `npm run ${scriptName}`,
          source: `package.json scripts.${scriptName}`,
          confidence: scriptName === "ci" || scriptName === "test" ? "high" : "medium",
        }
      }
    }
  } catch {
    return null
  }

  return null
}

function discoverFromMise(cwd: string): VerifyCommandDiscovery | null {
  const body = readText(join(cwd, "mise.toml"))
  if (!body) return null

  for (const taskName of PREFERRED_MISE_TASKS) {
    const escaped = taskName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const taskPattern = new RegExp(`(?:^|\\n)\\s*\\[tasks\\.${escaped}\\]`)
    if (taskPattern.test(body)) {
      return {
        command: `mise run ${taskName}`,
        source: `mise.toml tasks.${taskName}`,
        confidence: taskName === "ci" || taskName === "test" ? "high" : "medium",
      }
    }
  }

  return null
}

function discoverFromRepoGuidance(cwd: string): VerifyCommandDiscovery | null {
  const candidates = ["AGENTS.md", "README.md"]
  const commandPattern = /`([^`]*(?:npm test|npm run ci|npm run test|mise run ci|mise run test|pnpm test|bun test|yarn test|pytest|go test \.\/\.\.\.)[^`]*)`/g

  for (const fileName of candidates) {
    const body = readText(join(cwd, fileName))
    if (!body) continue

    const fencedCommands = Array.from(body.matchAll(commandPattern))
    const command = fencedCommands[0]?.[1]?.trim()
    if (command) return { command, source: fileName, confidence: "medium" }
  }

  return null
}

function extractFrontmatter(planMarkdown: string): string | null {
  const match = planMarkdown.match(/^---\n([\s\S]*?)\n---\n/)
  return match?.[1] ?? null
}

function parseFrontmatterVerifyCommand(frontmatter: string): string | null {
  const topLevel = frontmatter.match(/^verify_command:\s*(.+?)\s*$/m)
  if (topLevel) return stripQuotes(topLevel[1])

  const nested = frontmatter.match(/^loop:\s*\n(?:[^\S\n]+.*\n)*?[^\S\n]+verify_command:\s*(.+?)\s*$/m)
  if (nested) return stripQuotes(nested[1])

  return null
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "").trim()
}

function parseHandoffVerifyCommand(planMarkdown: string): string | null {
  const handoffMatch = planMarkdown.match(/##\s+Execution Handoff[\s\S]*?(?=\n##\s|$)/i)
  const section = handoffMatch?.[0] ?? planMarkdown

  const labelMatch = section.match(/(?:\*\*Verification command:?\*\*|Verification command:?)\s*[`"']?([^`"'\n]+)[`"']?/i)
  if (labelMatch) return stripQuotes(labelMatch[1])

  return null
}

export function discoverVerifyCommandFromPlan(planMarkdown: string): VerifyCommandDiscovery | null {
  const frontmatter = extractFrontmatter(planMarkdown)
  if (frontmatter) {
    const fromFrontmatter = parseFrontmatterVerifyCommand(frontmatter)
    if (fromFrontmatter) return { command: fromFrontmatter, source: "plan frontmatter verify_command", confidence: "high" }
  }

  const fromHandoff = parseHandoffVerifyCommand(planMarkdown)
  if (fromHandoff) return { command: fromHandoff, source: "plan Execution Handoff", confidence: "high" }

  return null
}

export function discoverVerifyCommand(cwd: string, planMarkdown?: string): VerifyCommandDiscovery {
  if (planMarkdown) {
    const fromPlan = discoverVerifyCommandFromPlan(planMarkdown)
    if (fromPlan) return fromPlan
  }

  return discoverFromPackageJson(cwd)
    ?? discoverFromMise(cwd)
    ?? discoverFromRepoGuidance(cwd)
    ?? { command: null, source: "not found", confidence: "none" }
}

export function parseLoopArgs(rawArgs: string): { planPath?: string; verifyCommand?: string; error?: string } {
  const trimmed = rawArgs.trim()
  if (!trimmed) return { error: "Usage: /se-work-loop <plan-path> [--verify-command \"command\"]" }

  const verifyMatch = trimmed.match(/\s--verify-command\s+(?:"([^"]+)"|'([^']+)'|([^\s].*))$/)
  const verifyCommand = verifyMatch?.[1] ?? verifyMatch?.[2] ?? verifyMatch?.[3]
  const planPart = verifyMatch ? trimmed.slice(0, verifyMatch.index).trim() : trimmed

  if (!planPart) return { error: "Usage: /se-work-loop <plan-path> [--verify-command \"command\"]" }
  return { planPath: planPart.replace(/^"|"$/g, ""), verifyCommand: verifyCommand?.trim() }
}
