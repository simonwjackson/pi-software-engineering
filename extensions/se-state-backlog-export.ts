/**
 * Parking-lot disk sync for backlog items.
 *
 * The session log is the runtime source of truth, and `work/items/parking-lot/` is
 * the cross-session, Git-tracked storage view for ungraduated parked work.
 * Each item is one standard front-matter markdown file named
 * `<ulid>-<slug>.md`; no `.next-id`, no counter, no shared parking-lot file.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { BacklogItemPayload, BacklogStatus } from "./se-state.ts"

const DEFAULT_DIR = "work/items/parking-lot"

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
  fm.push(`slug: ${slug(item.title)}`)
  fm.push(`title: ${yamlString(item.title)}`)
  fm.push("origin: parked")
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
  return `${item.id}-${slug(item.title)}.md`
}

export interface ExportResult {
  dir: string
  written: string[]
  skipped: string[]
  nextId: string | null
}

/**
 * Write each active item to `<dir>/<ulid>-<slug>.md`. Files that already
 * exist are overwritten only when `overwrite: true`.
 *
 * Returns the list of paths written. `nextId` is always null because the
 * work layout uses coordination-free ULIDs instead of a counter.
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

  for (const item of items) {
    const name = backlogFilename(item)
    const filePath = resolve(dir, name)
    if (existsSync(filePath) && !opts.overwrite) {
      skipped.push(filePath)
      continue
    }
    writeFileSync(filePath, renderBacklogMarkdown(item))
    written.push(filePath)
  }

  return { dir, written, skipped, nextId: null }
}

/** Historical compatibility no-op. ULID allocation has no counter floor. */
export function readNextIdFloor(_opts: { dir?: string; cwd?: string } = {}): number {
  return 0
}

// ---------------------------------------------------------------------------
// Cross-session sync: one file per parked item in `work/items/parking-lot/`.
//
// The session log remains the per-session runtime substrate, but every
// backlog mutation also touches the on-disk parking-lot file so a different
// session sees the same ungraduated work without requiring explicit export.
// ---------------------------------------------------------------------------

function backlogDirPath(opts: { dir?: string; cwd?: string }): string {
  const cwd = opts.cwd ?? process.cwd()
  return resolve(cwd, opts.dir ?? DEFAULT_DIR)
}

function findFileById(dir: string, id: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const prefix = `${id}-`
  for (const name of readdirSync(dir)) {
    if (name.startsWith(prefix) && name.endsWith(".md")) {
      return resolve(dir, name)
    }
  }
  return undefined
}

/**
 * Write a single backlog item to `<dir>/<id>-<slug>.md`, overwriting any
 * existing file for the same id (filename slug may change if the title
 * changed; the old file is removed in that case).
 */
export function writeBacklogItem(
  item: BacklogItemPayload,
  opts: { dir?: string; cwd?: string } = {},
): string {
  const dir = backlogDirPath(opts)
  mkdirSync(dir, { recursive: true })
  // If a file for this id exists under a different slug, remove it.
  const existing = findFileById(dir, item.id)
  const target = resolve(dir, backlogFilename(item))
  if (existing && existing !== target) {
    try {
      rmSync(existing)
    } catch {
      /* ignore */
    }
  }
  writeFileSync(target, renderBacklogMarkdown(item))
  return target
}

/**
 * Patch the `status:` line of the frontmatter for the given id. Used by
 * `backlog_promote` so a different session reading the file sees the new
 * status without needing the full item payload.
 *
 * Returns the path that was patched, or undefined if no file matches.
 */
export function patchBacklogStatus(
  id: string,
  status: BacklogStatus,
  opts: { dir?: string; cwd?: string } = {},
): string | undefined {
  const dir = backlogDirPath(opts)
  const path = findFileById(dir, id)
  if (!path) return undefined
  const original = readFileSync(path, "utf8")
  const lines = original.split("\n")
  if (lines[0] !== "---") return undefined
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i
      break
    }
  }
  if (end === -1) return undefined
  const want = yamlStatus(status)
  let patched = false
  for (let i = 1; i < end; i++) {
    if (/^status:\s/.test(lines[i])) {
      lines[i] = `status: ${want}`
      patched = true
      break
    }
  }
  if (!patched) return undefined
  writeFileSync(path, lines.join("\n"))
  return path
}

/**
 * Delete the on-disk file for the given id. Returns the path removed, or
 * undefined if no file matched.
 */
export function removeBacklogFile(
  id: string,
  opts: { dir?: string; cwd?: string } = {},
): string | undefined {
  const dir = backlogDirPath(opts)
  const path = findFileById(dir, id)
  if (!path) return undefined
  try {
    rmSync(path)
    return path
  } catch {
    return undefined
  }
}

/**
 * Parse just the YAML frontmatter of a rendered backlog markdown file.
 * Only the fields used by `backlog_list` are extracted; the rest are
 * ignored. Returns undefined if the file is not a recognized backlog
 * document.
 */
export function parseBacklogFrontmatter(
  content: string,
): BacklogItemPayload | undefined {
  const lines = content.split("\n")
  if (lines[0] !== "---") return undefined
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i
      break
    }
  }
  if (end === -1) return undefined
  const fm: Record<string, string> = {}
  const labels: string[] = []
  let i = 1
  while (i < end) {
    const line = lines[i]
    const m = /^([a-z_][a-z0-9_]*):\s*(.*)$/i.exec(line)
    if (m) {
      const key = m[1]
      const value = m[2]
      if (key === "labels" && (value === "" || value === "[]")) {
        // Either inline `[]` or a multiline list that starts on the next line.
        if (value === "") {
          let j = i + 1
          while (j < end && /^\s+-\s+/.test(lines[j])) {
            labels.push(lines[j].replace(/^\s+-\s+/, ""))
            j++
          }
          i = j
          continue
        }
      } else {
        fm[key] = unquoteYamlString(value)
      }
    }
    i++
  }
  if (!fm.id || !fm.title || !fm.status) return undefined
  const status = parseStatus(fm.status)
  if (!status) return undefined
  const priority = fm.priority === "low" || fm.priority === "high" ? fm.priority : "medium"
  const created = fm.created ? `${fm.created}T00:00:00.000Z` : new Date().toISOString()
  const item: BacklogItemPayload = {
    id: fm.id,
    title: fm.title,
    status,
    priority,
    labels,
    createdAt: created,
  }
  if (fm.source) item.source = fm.source
  return item
}

function unquoteYamlString(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function parseStatus(s: string): BacklogStatus | undefined {
  switch (s.trim()) {
    case "To Do":
    case "to-do":
      return "to-do"
    case "In Progress":
    case "in-progress":
      return "in-progress"
    case "Done":
    case "done":
      return "done"
    default:
      return undefined
  }
}

/**
 * Enumerate parking-lot markdown files in `<cwd>/<dir>` and return their
 * parsed frontmatter as `BacklogItemPayload` items.
 *
 * Files that fail to parse are skipped silently — this is a best-effort
 * cross-session read, not a strict validator.
 */
export function readBacklogDir(
  opts: { dir?: string; cwd?: string } = {},
): BacklogItemPayload[] {
  const dir = backlogDirPath(opts)
  if (!existsSync(dir)) return []
  const out: BacklogItemPayload[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue
    try {
      const content = readFileSync(resolve(dir, name), "utf8")
      const item = parseBacklogFrontmatter(content)
      if (item) out.push(item)
    } catch {
      /* ignore unreadable files */
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}
