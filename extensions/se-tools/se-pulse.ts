/**
 * Pi tool wrapper for skills/se-product-pulse.
 *
 * se-product-pulse has no script: it's a prose-driven flow that has
 * the LLM query data sources, compose a markdown report, and save it
 * under docs/pulse-reports/. The mechanical part — deterministic
 * filenames, output-directory creation, and idempotent save semantics
 * — is the part worth lifting to a typed tool. The model still owns
 * the data queries and the report's content.
 *
 * The skill's allowed-tools list keeps Write/Read for the rest of the
 * flow; pulse_report just gives the save step a deterministic surface.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

function sanitizeWindow(window: string): string {
  // Filenames stay safe: only [a-z0-9-] in the window slug.
  return window.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "window"
}

function defaultFilename(window: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${stamp}-${sanitizeWindow(window)}.md`
}

export function registerPulseTool(pi: ExtensionAPI, _packageRoot: string): void {
  pi.registerTool({
    name: "pulse_report",
    label: "SE: Save pulse report",
    description:
      "Save a rendered product-pulse report to docs/pulse-reports/<YYYY-MM-DD>-<window>.md. The LLM composes the markdown via the se-product-pulse skill; this tool handles the deterministic filename and idempotent save.",
    promptSnippet: "Save a se-product-pulse report",
    promptGuidelines: [
      "Call pulse_report after composing the full markdown body for the run. Do not call it incrementally; the tool overwrites the target file.",
      "Pass the exact window argument the user requested (e.g. '24h', '7d', '1h'). The tool slugs it into the filename.",
      "Pass overwrite=true only after explicitly confirming with the user that overwriting a same-day report is intended; otherwise the tool refuses to clobber.",
    ],
    parameters: Type.Object({
      window: Type.String({
        minLength: 1,
        description:
          "Lookback window argument as passed to se-product-pulse (e.g. '24h', '7d', '1h'). Used as the filename suffix.",
      }),
      markdown: Type.String({
        minLength: 1,
        description:
          "Full rendered markdown for the pulse report. Should already include the heading, sections, and any closing follow-ups.",
      }),
      title: Type.Optional(
        Type.String({
          description:
            "Optional short title to surface in the tool result. Does not affect the filename.",
        }),
      ),
      filename: Type.Optional(
        Type.String({
          description:
            "Override the default filename. Must end with '.md' and not contain path separators.",
        }),
      ),
      overwrite: Type.Optional(
        Type.Boolean({
          description:
            "When true, replaces an existing same-day report. Default false: the tool refuses to clobber.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd()
      const p = params as {
        window: string
        markdown: string
        title?: string
        filename?: string
        overwrite?: boolean
      }
      let stem = p.filename ?? defaultFilename(p.window)
      if (!stem.endsWith(".md")) stem = `${stem}.md`
      if (stem.includes("/") || stem.includes("\\")) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `pulse_report: filename must not contain path separators. Got: ${stem}`,
            },
          ],
        }
      }
      const outDir = resolve(cwd, "docs/pulse-reports")
      const outPath = resolve(outDir, stem)
      if (existsSync(outPath) && !p.overwrite) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `pulse_report: ${outPath} exists. Pass overwrite=true to replace, or pass a distinct filename.`,
            },
          ],
          details: { path: outPath, overwrite: false, written: false },
        }
      }
      try {
        mkdirSync(dirname(outPath), { recursive: true })
        writeFileSync(outPath, p.markdown, "utf8")
      } catch (e) {
        const err = e as { message?: string }
        return {
          isError: true,
          content: [
            { type: "text", text: `pulse_report write failed: ${err.message ?? String(e)}` },
          ],
        }
      }
      const lines = [
        `Saved pulse report: ${outPath}`,
        p.title ? `Title: ${p.title}` : undefined,
        `Window: ${p.window}`,
        `Bytes: ${Buffer.byteLength(p.markdown, "utf8")}`,
      ].filter(Boolean) as string[]
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          path: outPath,
          window: p.window,
          bytes: Buffer.byteLength(p.markdown, "utf8"),
          written: true,
        },
      }
    },
  })
}
