import { test } from "node:test"
import { strict as assert } from "node:assert"

const { classifyTestCommand, redactSecrets, DEFAULT_TEST_RUNNER_PREFIXES } = await import(
  "../extensions/se-test-detect.ts"
)

test("classifies common test-runner prefixes", () => {
  const cases = [
    ["npm test", "npm"],
    ["npm run test", "npm"],
    ["npm run test:integration", "npm"],
    ["pnpm test --watch", "pnpm"],
    ["bun test ./", "bun"],
    ["pytest tests/foo.py", "pytest"],
    ["python -m pytest", "pytest"],
    ["python3 -m pytest -x", "pytest"],
    ["cargo test --release", "cargo"],
    ["go test ./...", "go"],
    ["bin/rails test test/models", "rails"],
    ["mise run test:unit", "mise"],
    ["bundle exec rspec", "rspec"],
    ["jest --coverage", "jest"],
    ["vitest run", "vitest"],
    ["node --test tests/*.mjs", "node-test"],
  ]
  for (const [cmd, expected] of cases) {
    const m = classifyTestCommand(cmd)
    assert.ok(m, `expected match for: ${cmd}`)
    assert.equal(m.runner, expected, `wrong runner for: ${cmd}`)
  }
})

test("does not match unrelated commands", () => {
  const cases = ["ls -la", "git status", "echo hello", "curl example.com", "npm install"]
  for (const cmd of cases) {
    assert.equal(classifyTestCommand(cmd), undefined, `unexpected match for: ${cmd}`)
  }
})

test("strips env-var preambles and time/nice wrappers", () => {
  assert.equal(classifyTestCommand("CI=1 npm test").runner, "npm")
  assert.equal(classifyTestCommand("CI=1 NODE_ENV=test npm test").runner, "npm")
  assert.equal(classifyTestCommand("time -p cargo test").runner, "cargo")
  assert.equal(classifyTestCommand("nice -n 10 pytest").runner, "pytest")
})

test("longest matching prefix wins", () => {
  // 'npm run test' is longer than 'npm test'; both should match `npm run test:foo`.
  const m = classifyTestCommand("npm run test:foo")
  assert.ok(m)
  assert.equal(m.prefix, "npm run test")
})

test("custom runner table extends the defaults", () => {
  const m = classifyTestCommand("zig test src/foo.zig", [["other", "zig test"]])
  assert.ok(m)
  assert.equal(m.runner, "other")
})

test("redactSecrets masks key=value-shaped tokens", () => {
  assert.equal(redactSecrets("npm test TOKEN=abcdef"), "npm test TOKEN=<redacted>")
  assert.equal(redactSecrets("npm test --password hunter2"), "npm test --password <redacted>")
  assert.equal(redactSecrets("npm test SECRET=foo BEARER=bar"), "npm test SECRET=<redacted> BEARER=<redacted>")
})

test("redactSecrets masks long base64-looking values", () => {
  const cmd = "npm test --auth=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
  const out = redactSecrets(cmd)
  assert.ok(out.includes("<redacted>"))
  assert.ok(!out.includes("AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"))
})

test("redactSecrets leaves short safe values alone", () => {
  assert.equal(redactSecrets("npm test --port 8080"), "npm test --port 8080")
  assert.equal(redactSecrets("npm test --grep auth"), "npm test --grep auth")
})

test("DEFAULT_TEST_RUNNER_PREFIXES covers the documented runner set", () => {
  const runners = new Set(DEFAULT_TEST_RUNNER_PREFIXES.map(([r]) => r))
  for (const expected of [
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "pytest",
    "mise",
    "cargo",
    "go",
    "rspec",
    "rails",
    "jest",
    "vitest",
    "node-test",
  ]) {
    assert.ok(runners.has(expected), `default table missing runner: ${expected}`)
  }
})
