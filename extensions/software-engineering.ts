import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGE_AGENTS_DIR = resolve(PACKAGE_ROOT, "agents")
const USER_AGENTS_DIR = resolve(homedir(), ".pi", "agent", "agents")
const LEGACY_AGENT_PREFIX = "c" + "e-"

function agentFiles(): readonly string[] {
  return readdirSync(PACKAGE_AGENTS_DIR)
    .filter(name => name.startsWith("se-") && name.endsWith(".md"))
    .sort()
    .map(name => resolve(PACKAGE_AGENTS_DIR, name))
}

function isPackageSymlink(path: string, target: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false
    return realpathSync(path) === realpathSync(target)
  } catch {
    return false
  }
}

function describeExistingSymlink(path: string): string {
  try {
    return readlinkSync(path)
  } catch {
    return "unknown target"
  }
}

function removeLegacyAgentSymlinks(): number {
  if (!existsSync(USER_AGENTS_DIR)) return 0

  let removed = 0

  for (const name of readdirSync(USER_AGENTS_DIR)) {
    if (!name.startsWith(LEGACY_AGENT_PREFIX) || !name.endsWith(".md")) continue

    const target = resolve(USER_AGENTS_DIR, name)
    try {
      if (!lstatSync(target).isSymbolicLink()) continue
      unlinkSync(target)
      removed += 1
    } catch {
      // Leave unreadable or concurrently-removed entries alone.
    }
  }

  return removed
}

function syncAgentSymlinks(): { linked: number; removedLegacy: number; conflicts: string[] } {
  mkdirSync(USER_AGENTS_DIR, { recursive: true })

  const removedLegacy = removeLegacyAgentSymlinks()
  let linked = 0
  const conflicts: string[] = []

  for (const source of agentFiles()) {
    const target = resolve(USER_AGENTS_DIR, basename(source))

    if (!existsSync(target)) {
      symlinkSync(source, target)
      linked += 1
      continue
    }

    if (isPackageSymlink(target, source)) {
      continue
    }

    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) {
      conflicts.push(`${target} already points at ${describeExistingSymlink(target)}`)
    } else {
      conflicts.push(`${target} already exists and is not a symlink`)
    }
  }

  return { linked, removedLegacy, conflicts }
}

export default function softwareEngineeringExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const { linked, removedLegacy, conflicts } = syncAgentSymlinks()

    if (!ctx.hasUI) return

    if (linked > 0) {
      ctx.ui.notify(`Software Engineering linked ${linked} SE subagent(s)`, "info")
    }

    if (removedLegacy > 0) {
      ctx.ui.notify(`Software Engineering removed ${removedLegacy} legacy subagent symlink(s)`, "info")
    }

    if (conflicts.length > 0) {
      ctx.ui.notify(
        `Software Engineering left ${conflicts.length} existing SE subagent file(s) untouched`,
        "warning",
      )
    }
  })
}
