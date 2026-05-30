---
description: Record a bug reproduction before any code changes (reinforces se-debug's no-edits-before-diagnosis principle)
argument-hint: "<symptom>"
---
Before editing any code, capture a reproduction for: $@

Call the `se_capture_repro` tool with the following fields filled in concretely. Vague entries (e.g. "fails sometimes") are not acceptable — narrow them by running the steps until you have a deterministic reproduction.

- **symptom**: one-sentence description of the user-visible defect.
- **reproduction_steps**: numbered steps that reliably reproduce the defect, starting from a known-good state. Include exact inputs, environment, and any setup.
- **observed**: what actually happens when the steps run. Quote error messages or output verbatim.
- **expected**: what should happen when the steps run.
- **environment** (optional): runtime details (Node version, OS, branch, recent changes) when environment-sensitive.
- **references** (optional): repo-relative paths to relevant code, tests, or issue threads.

After the tool call succeeds, the no-edits-before-repro guardrail (when `--se-debug-strict` is set) unblocks subsequent edits for this session. Proceed to `/skill:se-debug` Phase 2 to form a hypothesis and reach the Diagnosis Checkpoint before fixing.
