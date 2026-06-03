/**
 * Work-item lifecycle: colocated `work/<id>-<slug>/` folders keyed by a
 * time-sortable ULID. Implements decisions/2026-06-02-colocated-work-item-layout.md.
 *
 * Coordination-free by construction: ids are minted, never counted, so
 * concurrent worktrees never collide. No `.next-id`, no max-scan. The repo
 * `root` is always passed in, so this module is product-agnostic — it works
 * against any repo, not just this one.
 */

import { spawnSync } from "node:child_process"
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

// ---------------------------------------------------------------------------
// ULID (Crockford base32, 48-bit ms timestamp + 80-bit randomness = 26 chars).
// Lexicographic order == chronological order, with no central coordination.
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" // no I L O U

function encodeTime(ms: number, len: number): string {
  let out = ""
  for (let i = len - 1; i >= 0; i--) {
    const mod = ms % 32
    out = CROCKFORD[mod] + out
    ms = (ms - mod) / 32
  }
  return out
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < len; i++) out += CROCKFORD[bytes[i] % 32]
  return out
}

/** Mint a fresh ULID. `now` is injectable so tests are deterministic. */
export function mintId(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16)
}

/** Recover the creation timestamp encoded in a ULID's time prefix. */
export function idTimestamp(id: string): Date {
  let ms = 0
  for (const ch of id.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(ch)
  return new Date(ms)
}

// ---------------------------------------------------------------------------
// work.md — the per-folder metadata spine. Flat front-matter; one source of
// truth for status/origin/parent so it never drifts into content files.
// ---------------------------------------------------------------------------

export type Origin = "parked" | "ideated" | "brainstormed" | "planned" | "debugged"
export type Status = "active" | "shipped" | "dropped" | "superseded"

export interface WorkItemMeta {
  id: string
  slug: string
  title: string
  origin: Origin
  status: Status
  reason: string | null
  parent: string | null
  created: string
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

export function serializeWorkMd(meta: WorkItemMeta): string {
  const line = (k: string, v: string | null) => `${k}: ${v ?? ""}`
  return [
    "---",
    line("id", meta.id),
    line("slug", meta.slug),
    line("title", meta.title),
    line("origin", meta.origin),
    line("status", meta.status),
    line("reason", meta.reason),
    line("parent", meta.parent),
    line("created", meta.created),
    "---",
    "",
    `# ${meta.title}`,
    "",
  ].join("\n")
}

export function parseWorkMd(text: string): WorkItemMeta {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) throw new Error("work.md: missing front-matter block")
  const fields: Record<string, string> = {}
  for (const raw of m[1].split("\n")) {
    const idx = raw.indexOf(":")
    if (idx === -1) continue
    fields[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim()
  }
  const req = (k: string) => {
    if (!fields[k]) throw new Error(`work.md: missing required field '${k}'`)
    return fields[k]
  }
  return {
    id: req("id"),
    slug: req("slug"),
    title: req("title"),
    origin: req("origin") as Origin,
    status: req("status") as Status,
    reason: fields.reason ? fields.reason : null,
    parent: fields.parent ? fields.parent : null,
    created: req("created"),
  }
}

// ---------------------------------------------------------------------------
// Lifecycle operations over a repo root's work/ tree.
// ---------------------------------------------------------------------------

export const ACTIVE_DIR = "work"
export const ARCHIVE_DIR = "work/.archive"

const folderName = (meta: Pick<WorkItemMeta, "id" | "slug">) => `${meta.id}-${meta.slug}`

export interface OpenInput {
  title: string
  origin: Origin
  parent?: string | null
  now?: number
}

export interface OpenResult {
  meta: WorkItemMeta
  dir: string
}

/** Graduate a work-item: mint id, create the folder, write work.md. */
export async function openWorkItem(root: string, input: OpenInput): Promise<OpenResult> {
  const id = mintId(input.now ?? Date.now())
  const slug = slugify(input.title)
  const meta: WorkItemMeta = {
    id,
    slug,
    title: input.title,
    origin: input.origin,
    status: "active",
    reason: null,
    parent: input.parent ?? null,
    created: idTimestamp(id).toISOString(),
  }
  const dir = join(root, ACTIVE_DIR, folderName(meta))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "work.md"), serializeWorkMd(meta))
  return { meta, dir }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/** List active work-items (work/* excluding the .archive directory). */
export async function listActive(root: string): Promise<WorkItemMeta[]> {
  const base = join(root, ACTIVE_DIR)
  if (!(await isDir(base))) return []
  const out: WorkItemMeta[] = []
  for (const entry of await readdir(base)) {
    if (entry.startsWith(".")) continue // excludes .archive and dotfiles
    try {
      out.push(parseWorkMd(await readFile(join(base, entry, "work.md"), "utf8")))
    } catch {
      // folders without a work.md are not active work-items
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id)) // chronological via ULID
}

export interface CloseInput {
  status: Exclude<Status, "active">
  reason: string
}

/** Move helper: prefer `git mv` to preserve history, fall back to fs rename. */
async function moveFolder(root: string, from: string, to: string): Promise<void> {
  const res = spawnSync("git", ["mv", from, to], { cwd: root, stdio: "ignore" })
  if (res.status === 0) return
  await rename(from, to)
}

/** Archive a work-item: flip status+reason in work.md, then move to .archive. */
export async function closeWorkItem(root: string, id: string, input: CloseInput): Promise<string> {
  if (!input.reason?.trim()) throw new Error("closeWorkItem: a terminal reason is mandatory")
  const base = join(root, ACTIVE_DIR)
  const match = (await readdir(base)).find((e) => e.startsWith(`${id}-`))
  if (!match) throw new Error(`closeWorkItem: no active work-item with id ${id}`)
  const from = join(base, match)
  const meta = parseWorkMd(await readFile(join(from, "work.md"), "utf8"))
  meta.status = input.status
  meta.reason = input.reason.trim()
  await writeFile(join(from, "work.md"), serializeWorkMd(meta))
  await mkdir(join(root, ARCHIVE_DIR), { recursive: true })
  const to = join(root, ARCHIVE_DIR, match)
  await moveFolder(root, from, to)
  return to
}
