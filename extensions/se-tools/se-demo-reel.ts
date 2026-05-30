/**
 * Pi tool wrapper for skills/se-demo-reel.
 *
 * scripts/capture-demo.py exposes nine subcommands (preflight, detect,
 * recommend, stitch, screenshot-reel, terminal-recording, preview,
 * upload, save-local) covering the full evidence-capture pipeline.
 * Rather than wrap each subcommand as its own tool (nine surfaces feel
 * heavy for an evidence flow), this wrapper exposes one capture_demo
 * tool with:
 *
 *   - subcommand: a Union of the documented subcommands (typed menu,
 *     validates at the harness boundary).
 *   - argv: an optional string[] passthrough appended after the
 *     subcommand. The script's existing argument shapes remain the
 *     authoritative spec; this keeps the wrapper thin and avoids
 *     drift if the script grows new flags.
 *
 * The script stays on disk for direct invocation; the SKILL.md flow
 * still owns when each subcommand is appropriate.
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

export function registerDemoReelTool(pi: ExtensionAPI, packageRoot: string): void {
  const scriptPath = resolve(packageRoot, "skills/se-demo-reel/scripts/capture-demo.py")

  pi.registerTool({
    name: "capture_demo",
    label: "SE: Capture demo reel",
    description:
      "Run a subcommand of the se-demo-reel capture-demo.py pipeline (preflight, detect, recommend, stitch, screenshot-reel, terminal-recording, preview, upload, save-local). Pass argv as a string array to forward subcommand-specific flags verbatim.",
    promptSnippet: "Capture or stitch a demo reel via se-demo-reel",
    promptGuidelines: [
      "Call capture_demo with subcommand='preflight' before any capture work to confirm vhs / silicon / ffmpeg / curl availability and decide which capture tier is feasible.",
      "Follow preflight with subcommand='detect' (project type) and then subcommand='recommend' to choose the right capture mode for the change at hand.",
      "stitch / screenshot-reel / terminal-recording are the actual capture verbs. preview uploads to litterbox for a 1h preview URL; upload promotes a chosen artifact to catbox.moe (permanent); save-local writes under /tmp instead of uploading.",
      "Always pass argv exactly as documented in the script's --help for that subcommand. The wrapper does not re-validate per-subcommand flags; the script does.",
    ],
    parameters: Type.Object({
      subcommand: Type.Union(
        [
          Type.Literal("preflight"),
          Type.Literal("detect"),
          Type.Literal("recommend"),
          Type.Literal("stitch"),
          Type.Literal("screenshot-reel"),
          Type.Literal("terminal-recording"),
          Type.Literal("preview"),
          Type.Literal("upload"),
          Type.Literal("save-local"),
        ],
        {
          description:
            "Which capture-demo.py subcommand to invoke. See scripts/capture-demo.py --help.",
        },
      ),
      argv: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Additional CLI args passed verbatim after the subcommand. See the script's per-subcommand --help for the exact shape.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { subcommand: string; argv?: string[] }
      const cwd = ctx?.cwd ?? process.cwd()
      if (!existsSync(scriptPath)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `capture_demo: script missing at ${scriptPath}. Reinstall the package.`,
            },
          ],
        }
      }
      try {
        const out = execFileSync("python3", [scriptPath, p.subcommand, ...(p.argv ?? [])], {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
        const text = out.toString().trim()
        let parsed: unknown = undefined
        try {
          parsed = JSON.parse(text)
        } catch {
          /* not JSON; leave undefined */
        }
        return {
          content: [{ type: "text", text: text || `capture_demo ${p.subcommand} (no stdout).` }],
          details: { subcommand: p.subcommand, argv: p.argv ?? [], parsed: parsed ?? null },
        }
      } catch (e) {
        const err = e as { stderr?: Buffer | string; message?: string }
        const stderr = (err.stderr ?? "").toString().trim() || (err.message ?? String(e))
        return {
          isError: true,
          content: [{ type: "text", text: `capture_demo ${p.subcommand} failed: ${stderr}` }],
        }
      }
    },
  })
}
