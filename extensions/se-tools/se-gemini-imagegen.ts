/**
 * Pi tool wrappers for skills/se-gemini-imagegen.
 *
 * Three of the skill's five python scripts (generate, edit, compose)
 * are lifted to typed Pi tools. The remaining two
 * (multi_turn_chat.py, gemini_images.py) are interactive REPL flows
 * that don't fit a single tool call shape; they stay scripty.
 *
 * Each wrapper:
 *   - Validates required positional args (prompt/input/instruction/
 *     output/images) at the harness boundary.
 *   - Forwards optional flags (--model, --aspect, --size) verbatim.
 *   - Requires GEMINI_API_KEY in the environment. The script itself
 *     validates this, and the wrapper surfaces the resulting error
 *     verbatim via isError.
 *   - Returns the saved output path in details so harness UIs with
 *     media support can render the artifact inline.
 *
 * The scripts stay on disk as fallback / direct invocation.
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

interface OptionalFlags {
  model?: string
  aspect?: string
  size?: string
}

function buildFlagArgs(flags: OptionalFlags): string[] {
  const args: string[] = []
  if (flags.model) args.push("--model", flags.model)
  if (flags.aspect) args.push("--aspect", flags.aspect)
  if (flags.size) args.push("--size", flags.size)
  return args
}

function runPython(
  script: string,
  positional: string[],
  flags: OptionalFlags,
  cwd: string,
): { ok: true; stdout: string } | { ok: false; stderr: string } {
  if (!existsSync(script)) {
    return { ok: false, stderr: `script missing at ${script}` }
  }
  try {
    const out = execFileSync("python3", [script, ...positional, ...buildFlagArgs(flags)], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { ok: true, stdout: out.toString() }
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string }
    const stderr = (err.stderr ?? "").toString().trim() || (err.message ?? String(e))
    return { ok: false, stderr }
  }
}

const optionalFlagsSchema = {
  model: Type.Optional(
    Type.String({
      description:
        "Override the Gemini image model id (e.g. gemini-3-pro-image-preview). Script default used when omitted.",
    }),
  ),
  aspect: Type.Optional(
    Type.String({
      description:
        "Aspect ratio hint forwarded to the script (e.g. '16:9', '1:1'). See script --help for accepted values.",
    }),
  ),
  size: Type.Optional(
    Type.String({
      description: "Size hint forwarded to the script (e.g. '1024x1024'). See script --help.",
    }),
  ),
}

export function registerGeminiImageTools(pi: ExtensionAPI, packageRoot: string): void {
  const SCRIPTS = {
    generate: resolve(packageRoot, "skills/se-gemini-imagegen/scripts/generate_image.py"),
    edit: resolve(packageRoot, "skills/se-gemini-imagegen/scripts/edit_image.py"),
    compose: resolve(packageRoot, "skills/se-gemini-imagegen/scripts/compose_images.py"),
  }

  // ---- gemini_image_generate -------------------------------------------
  pi.registerTool({
    name: "gemini_image_generate",
    label: "Gemini: Generate image",
    description:
      "Generate a new image from a text prompt via the Gemini image model. Requires GEMINI_API_KEY in the environment. Output is written to the given path on disk.",
    promptSnippet: "Generate an image from a text prompt",
    promptGuidelines: [
      "Call gemini_image_generate when the user asks for a new image from a description. Required: prompt and output path. Optional: model, aspect ratio, size.",
      "Verify GEMINI_API_KEY is set before invoking; the script fails fast otherwise. If the env var is missing, ask the user to set it rather than invoking and consuming a paid call attempt.",
      "Output path is taken at face value; do not auto-prefix it with a directory the user did not request.",
    ],
    parameters: Type.Object({
      prompt: Type.String({ minLength: 1, description: "Text prompt describing the image." }),
      output: Type.String({
        minLength: 1,
        description: "Output file path (e.g. /tmp/result.png). Existing files are overwritten.",
      }),
      ...optionalFlagsSchema,
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as { prompt: string; output: string } & OptionalFlags
      const result = runPython(SCRIPTS.generate, [p.prompt, p.output], p, ctx?.cwd ?? process.cwd())
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `gemini_image_generate failed: ${result.stderr}` }],
        }
      }
      return {
        content: [{ type: "text", text: result.stdout || `Saved generated image to ${p.output}.` }],
        details: { output: p.output, prompt: p.prompt, model: p.model ?? null },
      }
    },
  })

  // ---- gemini_image_edit -----------------------------------------------
  pi.registerTool({
    name: "gemini_image_edit",
    label: "Gemini: Edit image",
    description:
      "Edit an existing image via the Gemini image model. Requires GEMINI_API_KEY. Reads the input path, applies the natural-language instruction, writes the result to the output path.",
    promptSnippet: "Edit an existing image with a natural-language instruction",
    promptGuidelines: [
      "Call gemini_image_edit when the user wants to modify an existing image. Required: input path (existing image), instruction (edit prompt), output path.",
      "Verify GEMINI_API_KEY is set before invoking. The script fails fast otherwise.",
      "If the user has not specified a separate output path, write to <input-stem>-edited.<ext>; do not silently overwrite the input.",
    ],
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description: "Input image path. Must exist on disk before the call.",
      }),
      instruction: Type.String({
        minLength: 1,
        description: "Natural-language edit instruction (e.g. 'Add a rainbow in the sky').",
      }),
      output: Type.String({ minLength: 1, description: "Output file path." }),
      ...optionalFlagsSchema,
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as {
        input: string
        instruction: string
        output: string
      } & OptionalFlags
      const result = runPython(
        SCRIPTS.edit,
        [p.input, p.instruction, p.output],
        p,
        ctx?.cwd ?? process.cwd(),
      )
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `gemini_image_edit failed: ${result.stderr}` }],
        }
      }
      return {
        content: [{ type: "text", text: result.stdout || `Saved edited image to ${p.output}.` }],
        details: { input: p.input, output: p.output, instruction: p.instruction },
      }
    },
  })

  // ---- gemini_image_compose --------------------------------------------
  pi.registerTool({
    name: "gemini_image_compose",
    label: "Gemini: Compose images",
    description:
      "Compose multiple input images into a new image via the Gemini image model. Requires GEMINI_API_KEY. Up to 14 input images supported (Gemini 3 Pro).",
    promptSnippet: "Compose multiple images into one with an instruction",
    promptGuidelines: [
      "Call gemini_image_compose when the user wants to combine multiple images into one. Required: instruction, output path, and an images array (1 to 14 entries).",
      "Verify GEMINI_API_KEY is set before invoking. The script fails fast otherwise.",
      "Verify each images[] entry exists on disk before invoking; the script reads them all and a missing file aborts the call mid-way.",
    ],
    parameters: Type.Object({
      instruction: Type.String({
        minLength: 1,
        description: "Composition instruction (e.g. 'Put the cat from img1 on the couch in img2').",
      }),
      output: Type.String({ minLength: 1, description: "Output file path." }),
      images: Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
        maxItems: 14,
        description: "Input image paths. 1 to 14 entries (Gemini 3 Pro supports up to 14).",
      }),
      ...optionalFlagsSchema,
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as {
        instruction: string
        output: string
        images: string[]
      } & OptionalFlags
      const result = runPython(
        SCRIPTS.compose,
        [p.instruction, p.output, ...p.images],
        p,
        ctx?.cwd ?? process.cwd(),
      )
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `gemini_image_compose failed: ${result.stderr}` }],
        }
      }
      return {
        content: [{ type: "text", text: result.stdout || `Saved composed image to ${p.output}.` }],
        details: { output: p.output, sources: p.images, instruction: p.instruction },
      }
    },
  })
}
