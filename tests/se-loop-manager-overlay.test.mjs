import { test } from "node:test"
import assert from "node:assert/strict"
import { humanizeJsonLog } from "../extensions/se-loop/manager-overlay.ts"

test("humanizeJsonLog renders assistant text and compact tool activity", () => {
  const log = [
    JSON.stringify({ type: "tool_execution_start", toolName: "bash", args: { command: "echo hi" } }),
    JSON.stringify({ type: "tool_execution_end", toolName: "bash", isError: false }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done\nSummary" }] } }),
  ].join("\n")

  assert.deepEqual(humanizeJsonLog(log), [
    "› bash command: echo hi",
    "Done",
    "Summary",
  ])
})

test("humanizeJsonLog preserves non-json lines", () => {
  assert.deepEqual(humanizeJsonLog("plain output\n"), ["plain output"])
})
