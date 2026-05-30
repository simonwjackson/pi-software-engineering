/**
 * Pi tool wrappers for skills/se-session-inventory and
 * skills/se-session-extract.
 *
 * Wraps the bash + Python scripts these skills already ship as typed
 * registered tools:
 *
 * - se_session_list(repo, since?, platform?) -> session file paths
 * - se_session_skeleton(sessionPath) -> condensed skeleton
 * - se_session_errors(sessionPath) -> extracted error signals
 *
 * Scripts stay on disk as the canonical implementation; these wrappers
 * surface a typed call API.
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

export function registerSessionTools(pi: ExtensionAPI, packageRoot: string): void {
  const discoverScript = resolve(
    packageRoot,
    "skills/se-session-inventory/scripts/discover-sessions.sh",
  )
  const metadataScript = resolve(
    packageRoot,
    "skills/se-session-inventory/scripts/extract-metadata.py",
  )
  const skeletonScript = resolve(
    packageRoot,
    "skills/se-session-extract/scripts/extract-skeleton.py",
  )
  const errorsScript = resolve(
    packageRoot,
    "skills/se-session-extract/scripts/extract-errors.py",
  )

  function checkScript(path: string, toolName: string) {
    if (!existsSync(path)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `${toolName}: script missing at ${path}. Reinstall the package or run the bash fallback.`,
          },
        ],
      }
    }
    return undefined
  }

  pi.registerTool({
    name: "se_session_list",
    label: "SE: List session files",
    description:
      "Enumerate coding-agent session files for a repository across Claude Code, Codex, and Cursor. Returns paths and basic metadata. Wraps the se-session-inventory skill scripts.",
    promptSnippet: "List session files for a repo across platforms",
    promptGuidelines: [
      "Use se_session_list when researching past coding-agent sessions for a specific repository, e.g. 'what did we try before in repo X?', 'list recent sessions for this repo'.",
      "Use since to narrow the window (default 7 days). Use platform to restrict to claude / codex / cursor only.",
    ],
    parameters: Type.Object({
      repo: Type.String({
        description: "Repo folder name as it appears on disk (e.g. 'pi-software-engineering').",
        minLength: 1,
      }),
      since: Type.Optional(
        Type.Integer({
          description: "Window in days. Files older than this are skipped. Default 7.",
          minimum: 1,
        }),
      ),
      platform: Type.Optional(
        Type.Union([Type.Literal("claude"), Type.Literal("codex"), Type.Literal("cursor")], {
          description: "Restrict to one platform. Omit to search all.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const missing = checkScript(discoverScript, "se_session_list")
      if (missing) return missing
      const p = params as { repo: string; since?: number; platform?: "claude" | "codex" | "cursor" }
      const days = p.since ?? 7
      const args = [discoverScript, p.repo, String(days)]
      if (p.platform) {
        args.push("--platform", p.platform)
      }
      try {
        const out = execFileSync("bash", args, {
          cwd: ctx?.cwd ?? process.cwd(),
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        })
        const paths = out.trim().split("\n").filter(Boolean)
        return {
          content: [
            {
              type: "text",
              text: paths.length
                ? `Found ${paths.length} session file(s):\n${paths.map(p => "  " + p).join("\n")}`
                : `No session files found for ${p.repo} within ${days} day(s).`,
            },
          ],
          details: { paths, count: paths.length, repo: p.repo, since: days, platform: p.platform ?? "all" },
        }
      } catch (e) {
        const err = e as { stderr?: Buffer; message?: string }
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `se_session_list failed: ${(err.stderr ?? Buffer.from(err.message ?? "")).toString().trim()}`,
            },
          ],
        }
      }
    },
  })

  pi.registerTool({
    name: "se_session_skeleton",
    label: "SE: Session skeleton",
    description:
      "Extract a condensed conversation skeleton from a coding-agent session file (Claude Code, Codex, or Cursor). Auto-detects platform. Returns user messages, assistant text, and collapsed tool-call summaries.",
    promptSnippet: "Condense a session file into a readable skeleton",
    promptGuidelines: [
      "Use se_session_skeleton after se_session_list has identified a candidate session worth inspecting.",
      "Do not call se_session_skeleton without a concrete path; if the user did not give one, use se_session_list first.",
    ],
    parameters: Type.Object({
      sessionPath: Type.String({
        description: "Absolute path to a session jsonl file (Claude Code), session.json (Codex), or .cursor session.",
        minLength: 1,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const missing = checkScript(skeletonScript, "se_session_skeleton")
      if (missing) return missing
      const p = params as { sessionPath: string }
      try {
        const out = execFileSync("bash", ["-c", `cat ${JSON.stringify(p.sessionPath)} | python3 ${JSON.stringify(skeletonScript)}`], {
          cwd: ctx?.cwd ?? process.cwd(),
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        })
        return {
          content: [{ type: "text", text: out }],
          details: { sessionPath: p.sessionPath, bytes: out.length },
        }
      } catch (e) {
        const err = e as { stderr?: Buffer; message?: string }
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `se_session_skeleton failed: ${(err.stderr ?? Buffer.from(err.message ?? "")).toString().trim()}`,
            },
          ],
        }
      }
    },
  })

  pi.registerTool({
    name: "se_session_errors",
    label: "SE: Session error signals",
    description:
      "Extract error / failure signals from a coding-agent session file. Returns the lines that indicate failed tool calls, exceptions, and refusals.",
    promptSnippet: "Pull error signals from a session file",
    promptGuidelines: [
      "Use se_session_errors when debugging what went wrong in a past session, or when triaging recurring failure patterns across sessions.",
    ],
    parameters: Type.Object({
      sessionPath: Type.String({
        description: "Absolute path to a session jsonl/json file.",
        minLength: 1,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const missing = checkScript(errorsScript, "se_session_errors")
      if (missing) return missing
      const p = params as { sessionPath: string }
      try {
        const out = execFileSync("bash", ["-c", `cat ${JSON.stringify(p.sessionPath)} | python3 ${JSON.stringify(errorsScript)}`], {
          cwd: ctx?.cwd ?? process.cwd(),
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        })
        return {
          content: [{ type: "text", text: out.trim() || "(no error signals)" }],
          details: { sessionPath: p.sessionPath, bytes: out.length },
        }
      } catch (e) {
        const err = e as { stderr?: Buffer; message?: string }
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `se_session_errors failed: ${(err.stderr ?? Buffer.from(err.message ?? "")).toString().trim()}`,
            },
          ],
        }
      }
    },
  })
}
