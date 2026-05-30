/**
 * Backlog on-disk export.
 *
 * The session log is the source of truth for backlog items at runtime; this
 * module renders the active items to `backlog/task-NNN - <slug>.md` on
 * demand, preserving the existing on-disk format for portability and
 * Git-based audit. Export is a deliberate user-triggered action — never
 * background churn.
 *
 * `backlog/.next-id` continues to be the source of truth for ID allocation
 * **at export time**: if the file's value is higher than any id seen in the
 * log, that floor is honoured for the next allocation.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { BacklogItemPayload } from "./se-state.ts"

const DEFAULT_DIR = "backlog"
const NEXT_ID_FILE = ".next-id"

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function isoDate(s?: string): string {
  if (!s) return new Date().toISOString().slice(0, 10)
  return s.slice(0, 10)
}

function yamlList(items: string[] | undefined, indent: number): string {
  if (!items || items.length === 0) return "[]"
  const pad = " ".repeat(indent)
  return "\n" + items.map(i => `${pad}- ${i}`).join("\n")
}

function yamlString(s: string | undefined): string {
  if (s === undefined || s === null) return '""'
  if (s === "") return '""'
  if (/[:#"'\n]/.test(s)) {
    return JSON.stringify(s)
  }
  return s
}

export function renderBacklogMarkdown(item: BacklogItemPayload): string {
  const fm: string[] = []
  fm.push("---")
  fm.push(`id: ${item.id}`)
  fm.push(`title: ${yamlString(item.title)}`)
  fm.push(`status: ${yamlStatus(item.status)}`)
  fm.push(`priority: ${item.priority ?? "medium"}`)
  fm.push(`labels:${yamlList(item.labels, 2)}`)
  fm.push(`created: ${isoDate(item.createdAt)}`)
  if (item.source) fm.push(`source: ${item.source}`)
  if (item.context && Object.keys(item.context).length > 0) {
    fm.push("context:")
    if (item.context.cwd) fm.push(`  cwd: ${item.context.cwd}`)
    if (item.context.branch) fm.push(`  branch: ${item.context.branch}`)
    if (item.context.commit) fm.push(`  commit: ${item.context.commit}`)
    if (item.context.repo) fm.push(`  repo: ${item.context.repo}`)
    if (item.context.piSession) fm.push(`  pi_session: ${item.context.piSession}`)
    if (item.context.invokedBy) fm.push(`  invoked_by: ${item.context.invokedBy}`)
    if (item.context.issueRef) fm.push(`  issue_ref: ${yamlString(item.context.issueRef)}`)
  }
  fm.push("---")

  const body: string[] = []
  body.push("")
  body.push(`# ${item.title}`)
  if (item.why) {
    body.push("")
    body.push("## Why it matters")
    body.push("")
    body.push(item.why)
  }
  if (item.acceptance && item.acceptance.length > 0) {
    body.push("")
    body.push("## Acceptance Criteria")
    body.push("")
    for (const a of item.acceptance) body.push(`- [ ] ${a}`)
  }
  if (item.related && item.related.length > 0) {
    body.push("")
    body.push("## Related")
    body.push("")
    for (const r of item.related) body.push(`- \`${r}\``)
  }
  if (item.notes) {
    body.push("")
    body.push("## Notes")
    body.push("")
    body.push(item.notes)
  }
  body.push("")

  return fm.join("\n") + "\n" + body.join("\n")
}

function yamlStatus(s: string): string {
  // Match the existing on-disk style: title-cased status values.
  switch (s) {
    case "to-do":
      return "To Do"
    case "in-progress":
      return "In Progress"
    case "done":
      return "Done"
    default:
      return s
  }
}

export function backlogFilename(item: BacklogItemPayload): string {
  return `${item.id} - ${slug(item.title)}.md`
}

export interface ExportResult {
  dir: string
  written: string[]
  skipped: string[]
  nextId: string
}

/**
 * Write each active item to `<dir>/task-NNN - <slug>.md`. Files that
 * already exist are overwritten only when `overwrite: true`.
 *
 * Returns the list of paths written and the new value of `<dir>/.next-id`.
 */
export function exportBacklog(
  items: BacklogItemPayload[],
  opts: { dir?: string; cwd?: string; overwrite?: boolean } = {},
): ExportResult {
  const cwd = opts.cwd ?? process.cwd()
  const dirRel = opts.dir ?? DEFAULT_DIR
  const dir = resolve(cwd, dirRel)
  mkdirSync(dir, { recursive: true })

  const written: string[] = []
  const skipped: string[] = []

  let maxN = 0
  if (existsSync(resolve(dir, NEXT_ID_FILE))) {
    const raw = readFileSync(resolve(dir, NEXT_ID_FILE), "utf8").trim()
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) maxN = Math.max(maxN, n - 1)
  }

  // Honor any pre-existing files: their ids are claimed even if not in the log.
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const m = /^task-(\d+)\s*-/i.exec(name)
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
    }
  }

  for (const item of items) {
    const name = backlogFilename(item)
    const filePath = resolve(dir, name)
    if (existsSync(filePath) && !opts.overwrite) {
      skipped.push(filePath)
      continue
    }
    writeFileSync(filePath, renderBacklogMarkdown(item))
    written.push(filePath)
    const m = /^task-(\d+)$/.exec(item.id)
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }

  const nextN = maxN + 1
  writeFileSync(resolve(dir, NEXT_ID_FILE), String(nextN) + "\n")
  return {
    dir,
    written,
    skipped,
    nextId: `task-${nextN.toString().padStart(3, "0")}`,
  }
}

/**
 * Read `backlog/.next-id` and return the integer floor for allocation.
 * 0 if unreadable or missing.
 */
export function readNextIdFloor(opts: { dir?: string; cwd?: string } = {}): number {
  const cwd = opts.cwd ?? process.cwd()
  const dir = resolve(cwd, opts.dir ?? DEFAULT_DIR)
  const path = resolve(dir, NEXT_ID_FILE)
  if (!existsSync(path)) return 0
  try {
    const raw = readFileSync(path, "utf8").trim()
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}
