/**
 * Test-runner detection and command redaction for the se:test-state
 * observer.
 *
 * Detection is intentionally simple: command-prefix matching against a
 * default runner table. False positives are cheap (an extra entry the
 * consumer can filter); false negatives are the failure mode that matters
 * (no entry means task-012's RED-block has no signal). The table errs on
 * the side of capture.
 *
 * Repos extend the table via `softwareEngineering.testRunners` in
 * settings (verbatim prefixes). The wrapper reads settings lazily, so a
 * `/reload` after editing settings is enough to pick up changes.
 */

export type TestRunner =
  | "npm"
  | "pnpm"
  | "yarn"
  | "bun"
  | "pytest"
  | "mise"
  | "cargo"
  | "go"
  | "rspec"
  | "rails"
  | "jest"
  | "vitest"
  | "node-test"
  | "other"

export interface TestRunnerMatch {
  runner: TestRunner
  prefix: string
}

/**
 * Default runner-prefix table. Order matters only for documentation
 * purposes; matches are first-hit-wins per command.
 */
export const DEFAULT_TEST_RUNNER_PREFIXES: Array<[TestRunner, string]> = [
  ["npm", "npm test"],
  ["npm", "npm run test"],
  ["pnpm", "pnpm test"],
  ["pnpm", "pnpm run test"],
  ["yarn", "yarn test"],
  ["yarn", "yarn run test"],
  ["bun", "bun test"],
  ["bun", "bun run test"],
  ["pytest", "pytest"],
  ["pytest", "python -m pytest"],
  ["pytest", "python3 -m pytest"],
  ["mise", "mise run test"],
  ["mise", "mise run ci"],
  ["cargo", "cargo test"],
  ["go", "go test"],
  ["rspec", "rspec"],
  ["rspec", "bundle exec rspec"],
  ["rails", "bin/rails test"],
  ["rails", "rails test"],
  ["rails", "bundle exec rails test"],
  ["jest", "jest"],
  ["jest", "npx jest"],
  ["vitest", "vitest"],
  ["vitest", "npx vitest"],
  ["node-test", "node --test"],
]

/**
 * Strip leading env-var assignments and `time`/`nice` wrappers so a
 * command like `CI=1 time -p npm test` still classifies as npm.
 */
function stripPreamble(cmd: string): string {
  let s = cmd.trim()
  // Drop env-var assignments (NAME=value sequences).
  s = s.replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, "")
  // Drop wrapping `time` / `nice` etc.
  s = s.replace(/^(?:time(?:\s+-[a-z])?\s+|nice\s+(?:-n?\s*-?\d+\s+)?)+/i, "")
  return s
}

/**
 * Classify a command against the runner table. Returns the first match by
 * longest-prefix-first, so `npm run test:integration` matches `npm run test`
 * not `npm test`.
 */
export function classifyTestCommand(
  command: string,
  extra?: Iterable<[TestRunner, string]>,
): TestRunnerMatch | undefined {
  const stripped = stripPreamble(command)
  const candidates = [...DEFAULT_TEST_RUNNER_PREFIXES, ...(extra ?? [])]
  // Sort by descending prefix length to prefer specific over generic.
  candidates.sort((a, b) => b[1].length - a[1].length)
  for (const [runner, prefix] of candidates) {
    if (stripped === prefix) return { runner, prefix }
    if (!stripped.startsWith(prefix)) continue
    // Match when the prefix is followed by a delimiter: space, colon
    // (npm script flavour), hyphen, slash, pipe, or `&&`.
    const next = stripped.charAt(prefix.length)
    if (next === " " || next === ":" || next === "-" || next === "/" || next === "|" || next === "&") {
      return { runner, prefix }
    }
  }
  return undefined
}

const SECRET_LIKE_PATTERNS: RegExp[] = [
  // Common key=value forms: KEY=value, --token=value, --password value
  /(?<=\b(?:token|api[_-]?key|secret|password|bearer|auth)\s*[=:]\s*)\S+/gi,
  /(?<=--(?:token|api[_-]?key|secret|password|bearer|auth)\s+)\S+/gi,
  // Long base64-looking values (32+ url-safe base64 chars)
  /(?<![A-Za-z0-9])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9])/g,
]

/**
 * Redact obvious secrets from a command string before it goes into the
 * session log. Conservative — replaces matches with `<redacted>`; does not
 * try to parse shell quoting.
 */
export function redactSecrets(command: string): string {
  let out = command
  for (const pat of SECRET_LIKE_PATTERNS) {
    out = out.replace(pat, "<redacted>")
  }
  return out
}
