# Decision: skip `test_browser` and `test_xcode` Pi tool wrappers

Date: 2026-05-30
Status: Accepted
Tracks: backlog/task-003 (J5 — selective skip with rationale)

## Context

`task-003` lifts scripty SE skills to typed `pi.registerTool` wrappers so the
LLM picks each action by name from a typed menu instead of templating shell
calls. The task explicitly permits skipping when wrapping is overkill:

> If a skill turns out to have so little surface area that wrapping it is
> overkill (e.g. a single one-line script), skip it for now and note why in
> the PR description — don't force every script through the tool surface.

Two of the originally-listed skills fall in that bucket:

- `skills/se-test-browser/` — has no `scripts/` directory. The skill's
  mechanical work is *invoking `agent-browser` CLI* directly: opening a
  page, clicking, filling forms, screenshotting. Adding a `test_browser`
  tool wrapper would shim over the CLI without adding SE-owned logic; the
  argument shape would be a near-pass-through to `agent-browser`'s own
  flags.
- `skills/se-test-xcode/` — has no `scripts/` directory. The skill's
  mechanical work is *invoking XcodeBuildMCP MCP tools* (`list_simulators`,
  `build_sim_id_workspace`, `launch_app_sim`, etc.). Pi already exposes
  MCP tool calls natively; a `test_xcode` wrapper would shim over the
  MCP surface without adding SE-owned logic.

## Decision

Skip `test_browser` and `test_xcode` from the J5 batch of tool wrappers.
Leave the SKILL.md files unchanged: they already direct the LLM to the
right tool surface (`agent-browser` CLI / XcodeBuildMCP MCP tools).

## Reasoning

1. **No SE-owned script means no SE behavior to encapsulate.** The other
   eight lifted tools (`se_clean_gone`, `se_session_*`, `pulse_report`,
   `pr_*`, `capture_demo`, `gemini_image_*`) each wrap a script that lives
   under `skills/<name>/scripts/`. The wrapper validates inputs, surfaces
   stderr cleanly, and parses output back into structured details. With
   no SE-owned script, the wrapper would degenerate into "call this
   underlying tool with these args" — which is exactly what skill prose
   does well.

2. **Existing surfaces are already typed.** `agent-browser` exposes a
   stable CLI with `--help`. XcodeBuildMCP exposes typed MCP tools.
   Adding an SE shim creates a parallel surface that has to be kept in
   sync with the upstream's flags.

3. **Pi's tool registration is for our code, not theirs.** The Pi guide
   recommends `pi.registerTool` for actions the package owns the
   implementation of. Wrapping someone else's CLI/MCP surface is a
   different concern (alias / adapter / proxy), not what the registry
   pattern is shaped for.

4. **The "always name the tool explicitly in promptGuidelines" pattern
   doesn't help here.** That pattern's value is steering the LLM to a
   typed surface instead of templating bash. Both `agent-browser` and
   the XcodeBuildMCP MCP tools are already discoverable by name from the
   harness; the SKILL.md prose already routes the LLM to them by name.

## Consequences

- The README "Tool wrappers for scripty skills" table lists eight tools
  across six skills, not ten across eight.
- Future contributors who add an SE-owned script to either skill (e.g.
  a wrapper around `agent-browser` that adds SE-specific defaults) should
  revisit the decision and lift the new script.
- If `agent-browser` or XcodeBuildMCP develops contract incompatibilities
  with the SKILL.md prose, an SE adapter wrapper may then make sense —
  the trigger would be SE-owned compensating logic, not just convenience.

## Related

- `backlog/task-003 - lift-scripty-skills-to-pi-tools.md`
- `extensions/se-tools/` (the lifted wrappers)
- `skills/se-test-browser/SKILL.md` (unchanged by this decision)
- `skills/se-test-xcode/SKILL.md` (unchanged by this decision)
- `~/.pi/docs/pi-package-expert-guide.md` (§4 custom tools)
