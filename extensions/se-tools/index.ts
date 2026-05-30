/**
 * Pi tool wrappers for scripty SE skills.
 *
 * The skill scripts under skills/<name>/scripts/ stay on disk as the
 * canonical implementation. These wrappers register typed
 * pi.registerTool surfaces so the LLM picks the action by name from a
 * typed menu rather than templating bash invocations of the scripts.
 *
 * One file per skill domain. registerSeTools() in this index file
 * wires them all up from extensions/software-engineering.ts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

import { registerCleanGoneTool } from "./se-clean-gone.ts"
import { registerSessionTools } from "./se-sessions.ts"

export function registerSeTools(pi: ExtensionAPI, packageRoot: string): void {
  registerCleanGoneTool(pi, packageRoot)
  registerSessionTools(pi, packageRoot)
}
