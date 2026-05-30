/**
 * Pi tool wrapper for skills/se-clean-gone-branches.
 *
 * The skill ships scripts/clean-gone which lists local branches whose
 * remote tracking branch is gone. This tool registers a typed surface so
 * the LLM picks the action by name and the harness validates dryRun /
 * includeWorktrees rather than letting the LLM template the shell call.
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

export function registerCleanGoneTool(pi: ExtensionAPI, packageRoot: string): void {
  const scriptPath = resolve(packageRoot, "skills/se-clean-gone-branches/scripts/clean-gone")

  pi.registerTool({
    name: "se_clean_gone",
    label: "SE: Clean gone branches",
    description:
      "List (and optionally delete) local Git branches whose remote tracking branch is gone. Wraps the se-clean-gone-branches skill's clean-gone script with typed parameters.",
    promptSnippet: "List or delete local branches whose remote is gone",
    promptGuidelines: [
      "Call se_clean_gone when the user says 'clean up branches', 'delete gone branches', 'prune local branches', or asks to remove stale branches whose remote is gone.",
      "Default to dryRun=true and present the list to the user before any deletion. Pass dryRun=false only after explicit confirmation.",
      "Pass includeWorktrees=true to also remove associated worktrees; without it, branches with active worktrees are skipped.",
    ],
    parameters: Type.Object({
      dryRun: Type.Optional(
        Type.Boolean({
          description: "When true (default), list candidates without deleting them.",
        }),
      ),
      includeWorktrees: Type.Optional(
        Type.Boolean({
          description: "When true, also remove worktrees associated with gone branches.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd()
      if (!existsSync(scriptPath)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `se_clean_gone: script missing at ${scriptPath}. Reinstall the package or run the bash fallback.`,
            },
          ],
        }
      }
      const p = params as { dryRun?: boolean; includeWorktrees?: boolean }
      const dryRun = p.dryRun !== false // default true
      try {
        const out = execFileSync("bash", [scriptPath], { cwd, encoding: "utf8" }).trim()
        const branches = out ? out.split("\n").filter(Boolean) : []
        if (branches.length === 0) {
          return {
            content: [{ type: "text", text: "No gone branches found." }],
            details: { branches: [], dryRun, includeWorktrees: !!p.includeWorktrees, deleted: [] },
          }
        }
        if (dryRun) {
          return {
            content: [
              {
                type: "text",
                text: `Found ${branches.length} gone branch(es):\n${branches.map(b => "  - " + b).join("\n")}\n\nPass dryRun=false to delete.`,
              },
            ],
            details: { branches, dryRun: true, includeWorktrees: !!p.includeWorktrees, deleted: [] },
          }
        }
        const deleted: string[] = []
        const failed: { branch: string; reason: string }[] = []
        for (const branch of branches) {
          if (p.includeWorktrees) {
            try {
              const wtList = execFileSync("git", ["worktree", "list", "--porcelain"], {
                cwd,
                encoding: "utf8",
              })
              const wtMatch = wtList
                .split("\n\n")
                .find(blk => blk.includes(`branch refs/heads/${branch}`))
              if (wtMatch) {
                const pathLine = wtMatch.split("\n").find(l => l.startsWith("worktree "))
                if (pathLine) {
                  const wtPath = pathLine.replace("worktree ", "").trim()
                  execFileSync("git", ["worktree", "remove", wtPath], { cwd })
                }
              }
            } catch {
              // worktree removal is best-effort; fall through to branch delete
            }
          }
          try {
            execFileSync("git", ["branch", "-d", branch], { cwd })
            deleted.push(branch)
          } catch (e) {
            const err = e as { stderr?: Buffer; message?: string }
            failed.push({ branch, reason: (err.stderr ?? Buffer.from(err.message ?? "")).toString().trim() })
          }
        }
        const lines = [
          `Deleted ${deleted.length} of ${branches.length} gone branch(es).`,
          ...deleted.map(b => `  ✓ ${b}`),
          ...failed.map(f => `  ✗ ${f.branch}: ${f.reason}`),
        ]
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { branches, dryRun: false, includeWorktrees: !!p.includeWorktrees, deleted, failed },
          isError: failed.length > 0,
        }
      } catch (e) {
        const err = e as { stderr?: Buffer; message?: string }
        const detail = (err.stderr ?? Buffer.from(err.message ?? "")).toString().trim()
        return {
          isError: true,
          content: [{ type: "text", text: `se_clean_gone failed: ${detail}` }],
        }
      }
    },
  })
}
