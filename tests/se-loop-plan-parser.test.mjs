import { test } from "node:test"
import assert from "node:assert/strict"
import { nextRunnableUnit, parsePlanMarkdown, PlanParseError, unitFilePaths } from "../extensions/se-loop/plan-parser.ts"

const PLAN = `# feat: Example

## Implementation Units

### U1. First unit

**Goal:** Do the first thing.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: \`src/first.ts\`
- Test: \`tests/first.test.mjs\`

**Approach:**
- Follow the existing pattern.

**Execution note:** Start test-first.

**Patterns to follow:**
- \`src/example.ts\`

**Test scenarios:**
- Happy path: input A -> output B.

**Verification:**
- First behavior works.

---

### U3. Third unit

**Goal:** Do the third thing.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: \`src/third.ts\`

**Approach:**
- Extend first behavior.

**Test scenarios:**
- Test expectation: none -- wiring only.

**Verification:**
- Third behavior works.
`

test("parses implementation units without renumbering gaps", () => {
  const parsed = parsePlanMarkdown(PLAN)

  assert.equal(parsed.title, "feat: Example")
  assert.deepEqual(parsed.units.map(unit => unit.id), ["U1", "U3"])
  assert.equal(parsed.units[0].goal, "Do the first thing.")
  assert.deepEqual(parsed.units[1].dependencies, ["U1"])
})

test("extracts categorized file paths", () => {
  const parsed = parsePlanMarkdown(PLAN)
  assert.deepEqual(parsed.units[0].files.create, ["src/first.ts"])
  assert.deepEqual(parsed.units[0].files.test, ["tests/first.test.mjs"])
  assert.deepEqual(unitFilePaths(parsed.units[0]), ["src/first.ts", "tests/first.test.mjs"])
})

test("finds next dependency-ready unit", () => {
  const parsed = parsePlanMarkdown(PLAN)

  assert.equal(nextRunnableUnit(parsed.units, new Set())?.id, "U1")
  assert.equal(nextRunnableUnit(parsed.units, new Set(["U1"]))?.id, "U3")
  assert.equal(nextRunnableUnit(parsed.units, new Set(["U1", "U3"])), null)
})

test("throws a clear error when no units exist", () => {
  assert.throws(() => parsePlanMarkdown("# No units"), PlanParseError)
})
