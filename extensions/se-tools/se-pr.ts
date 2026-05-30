/**
 * Pi tool wrappers for skills/se-resolve-pr-feedback.
 *
 * The skill ships four bash scripts that orchestrate GitHub review-comment
 * walks via gh CLI + the GraphQL API. Each is a thin typed wrapper around
 * one script. The scripts stay on disk as fallback / direct invocation.
 *
 * | Tool                  | Wraps                        | Mutates? |
 * |-----------------------|------------------------------|----------|
 * | pr_comments_list      | scripts/get-pr-comments      | read     |
 * | pr_thread_get         | scripts/get-thread-for-comment | read   |
 * | pr_thread_reply       | scripts/reply-to-pr-thread   | write    |
 * | pr_thread_resolve     | scripts/resolve-pr-thread    | write    |
 *
 * Each wrapper:
 *   - Validates required IDs at the harness boundary via TypeBox
 *   - Resolves to an absolute script path relative to packageRoot
 *   - Surfaces script failures as isError + stderr text rather than
 *     letting an unhandled exception bubble
 *   - Returns the script's stdout in text content and a parsed shape
 *     in details when the script emits JSON
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

function runScript(
  scriptPath: string,
  args: string[],
  cwd: string,
  input?: string,
): { ok: true; stdout: string } | { ok: false; stderr: string } {
  if (!existsSync(scriptPath)) {
    return { ok: false, stderr: `script missing at ${scriptPath}` }
  }
  try {
    const out = execFileSync("bash", [scriptPath, ...args], {
      cwd,
      encoding: "utf8",
      input: input,
      stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    })
    return { ok: true, stdout: out.toString() }
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string }
    const stderr = (err.stderr ?? "").toString().trim() || (err.message ?? String(e))
    return { ok: false, stderr }
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function repoArg(owner?: string, repo?: string): string[] {
  if (owner && repo) return [`${owner}/${repo}`]
  return []
}

export function registerPrTools(pi: ExtensionAPI, packageRoot: string): void {
  const SCRIPTS = {
    list: resolve(packageRoot, "skills/se-resolve-pr-feedback/scripts/get-pr-comments"),
    threadGet: resolve(packageRoot, "skills/se-resolve-pr-feedback/scripts/get-thread-for-comment"),
    reply: resolve(packageRoot, "skills/se-resolve-pr-feedback/scripts/reply-to-pr-thread"),
    resolve: resolve(packageRoot, "skills/se-resolve-pr-feedback/scripts/resolve-pr-thread"),
  }

  // ---- pr_comments_list -------------------------------------------------
  pi.registerTool({
    name: "pr_comments_list",
    label: "PR: List review comments",
    description:
      "List review comments on a GitHub PR via gh CLI. Wraps the se-resolve-pr-feedback get-pr-comments script. Owner/repo are autodetected from the cwd when omitted.",
    promptSnippet: "List GitHub PR review comments",
    promptGuidelines: [
      "Call pr_comments_list as the first step when the user asks to address PR review feedback. The output identifies comment node IDs needed by pr_thread_get.",
      "Omit owner/repo when the working directory is inside the target repo; gh autodetects. Pass them explicitly only for cross-repo flows.",
      "This tool is read-only; safe to call repeatedly while triaging.",
    ],
    parameters: Type.Object({
      pr: Type.Integer({ minimum: 1, description: "Pull request number." }),
      owner: Type.Optional(Type.String({ description: "GitHub owner. Optional; autodetected." })),
      repo: Type.Optional(Type.String({ description: "GitHub repo name. Optional; autodetected." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { pr: number; owner?: string; repo?: string }
      const cwd = ctx?.cwd ?? process.cwd()
      const result = runScript(SCRIPTS.list, [String(p.pr), ...repoArg(p.owner, p.repo)], cwd)
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `pr_comments_list failed: ${result.stderr}` }],
        }
      }
      const parsed = tryParseJson(result.stdout)
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { pr: p.pr, parsed: parsed ?? null },
      }
    },
  })

  // ---- pr_thread_get ----------------------------------------------------
  pi.registerTool({
    name: "pr_thread_get",
    label: "PR: Get thread for comment",
    description:
      "Resolve a PR review-comment node ID to its parent review thread. Wraps get-thread-for-comment. Returns thread ID and full comment chain.",
    promptSnippet: "Get the review thread for a PR comment",
    promptGuidelines: [
      "Call pr_thread_get after pr_comments_list to fetch the full conversation under a comment before drafting a reply.",
      "Pass the comment's node ID (typically PRRC_...) from pr_comments_list output. This is the GraphQL node ID, not the integer ID.",
      "Read-only; the output's thread ID is what pr_thread_reply / pr_thread_resolve consume next.",
    ],
    parameters: Type.Object({
      pr: Type.Integer({ minimum: 1, description: "Pull request number." }),
      commentNodeId: Type.String({
        minLength: 1,
        description: "Comment GraphQL node ID (e.g. PRRC_kwDOP_gZVc6ySv89).",
      }),
      owner: Type.Optional(Type.String({ description: "GitHub owner. Optional; autodetected." })),
      repo: Type.Optional(Type.String({ description: "GitHub repo name. Optional; autodetected." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { pr: number; commentNodeId: string; owner?: string; repo?: string }
      const cwd = ctx?.cwd ?? process.cwd()
      const result = runScript(
        SCRIPTS.threadGet,
        [String(p.pr), p.commentNodeId, ...repoArg(p.owner, p.repo)],
        cwd,
      )
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `pr_thread_get failed: ${result.stderr}` }],
        }
      }
      const parsed = tryParseJson(result.stdout)
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { pr: p.pr, commentNodeId: p.commentNodeId, parsed: parsed ?? null },
      }
    },
  })

  // ---- pr_thread_reply --------------------------------------------------
  pi.registerTool({
    name: "pr_thread_reply",
    label: "PR: Reply to review thread",
    description:
      "Post a reply to a PR review thread. Wraps reply-to-pr-thread; body is piped to the script via stdin to avoid shell escaping issues with markdown.",
    promptSnippet: "Reply to a PR review thread",
    promptGuidelines: [
      "Call pr_thread_reply only after pr_thread_get has loaded the thread and the user (or your own routing) has decided the reply text. This mutates the PR.",
      "Pass the threadId from pr_thread_get output. The body field is sent to the script via stdin so markdown with quotes/newlines/backticks is safe.",
      "Do not chain pr_thread_resolve in the same call — keep reply and resolve as separate explicit actions so the user can read and approve replies before threads close.",
    ],
    parameters: Type.Object({
      threadId: Type.String({
        minLength: 1,
        description: "PR review thread GraphQL ID (e.g. PRRT_kwDOABC123).",
      }),
      body: Type.String({ minLength: 1, description: "Reply body in markdown." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { threadId: string; body: string }
      const cwd = ctx?.cwd ?? process.cwd()
      const result = runScript(SCRIPTS.reply, [p.threadId], cwd, p.body)
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `pr_thread_reply failed: ${result.stderr}` }],
        }
      }
      return {
        content: [{ type: "text", text: result.stdout || `Replied to ${p.threadId}.` }],
        details: { threadId: p.threadId, replied: true },
      }
    },
  })

  // ---- pr_thread_resolve ------------------------------------------------
  pi.registerTool({
    name: "pr_thread_resolve",
    label: "PR: Resolve review thread",
    description:
      "Mark a PR review thread as resolved. Wraps resolve-pr-thread. Does not post a comment; the thread is silently marked resolved.",
    promptSnippet: "Resolve a PR review thread",
    promptGuidelines: [
      "Call pr_thread_resolve only after the user has confirmed the thread is addressed and any explanatory reply has already been posted via pr_thread_reply.",
      "Pass the threadId from pr_thread_get output. The mutation is idempotent: resolving an already-resolved thread succeeds.",
      "Do not batch resolves across many threads in one call sequence without surfacing them; reviewers expect to see each acknowledgement.",
    ],
    parameters: Type.Object({
      threadId: Type.String({
        minLength: 1,
        description: "PR review thread GraphQL ID (e.g. PRRT_kwDOABC123).",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { threadId: string }
      const cwd = ctx?.cwd ?? process.cwd()
      const result = runScript(SCRIPTS.resolve, [p.threadId], cwd)
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `pr_thread_resolve failed: ${result.stderr}` }],
        }
      }
      const parsed = tryParseJson(result.stdout)
      return {
        content: [{ type: "text", text: result.stdout || `Resolved ${p.threadId}.` }],
        details: { threadId: p.threadId, resolved: true, parsed: parsed ?? null },
      }
    },
  })
}
