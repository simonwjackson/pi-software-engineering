import { test } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

test("se-subagent/index.ts registers the three documented commands", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/index.ts"), "utf8")
  for (const cmd of ["se-review", "se-doc-review", "se-research"]) {
    assert.match(src, new RegExp(`pi\\.registerCommand\\("${cmd}"`), `missing command: ${cmd}`)
  }
})

test("each command declares an argument-hint and a description", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/index.ts"), "utf8")
  const cmdCount = (src.match(/argumentHint:/g) ?? []).length
  assert.equal(cmdCount, 3, "expected 3 argumentHint declarations")
  const descCount = (src.match(/description:\s*\n?\s*"/g) ?? []).length
  assert.ok(descCount >= 3, "expected at least 3 description fields")
})

test("default persona sets are centralized in personas.ts", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/personas.ts"), "utf8")
  for (const name of ["DEFAULT_CODE_REVIEW_PERSONAS", "DEFAULT_DOC_REVIEW_PERSONAS", "DEFAULT_RESEARCH_AGENTS"]) {
    assert.match(src, new RegExp(`export const ${name}`), `missing: ${name}`)
  }
})

test("every default persona has a corresponding agents/<name>.md file", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/personas.ts"), "utf8")
  const personas = [...src.matchAll(/"(se-[a-z-]+)"/g)].map(m => m[1])
  assert.ok(personas.length >= 10, "expected at least 10 personas total")
  for (const p of personas) {
    assert.ok(
      existsSync(resolve(ROOT, `agents/${p}.md`)),
      `persona file missing on disk: agents/${p}.md`,
    )
  }
})

test("commands degrade gracefully when dispatch fails (try/catch around sendUserMessage)", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/index.ts"), "utf8")
  const tryCount = (src.match(/try \{/g) ?? []).length
  assert.ok(tryCount >= 3, `expected 3 try blocks (one per command), got ${tryCount}`)
  // Notify-on-failure mentions the fallback path.
  assert.match(src, /pi-subagents not available/)
})

test("se-research validates the topic argument before dispatch", () => {
  const src = readFileSync(resolve(ROOT, "extensions/se-subagent/index.ts"), "utf8")
  assert.match(src, /\/se-research: provide a topic/)
})

test("software-engineering.ts wires registerSeSubagentCommands at startup", () => {
  const src = readFileSync(resolve(ROOT, "extensions/software-engineering.ts"), "utf8")
  assert.match(src, /import \{ registerSeSubagentCommands \}/)
  assert.match(src, /registerSeSubagentCommands\(pi\)/)
})
