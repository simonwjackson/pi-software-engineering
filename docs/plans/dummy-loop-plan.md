---
title: feat: Dummy loop validation
type: feat
status: active
date: 2026-05-06
verify_command: "grep -q 'U2 complete' tmp/se-loop-dummy.txt"
---

# feat: Dummy loop validation

## Summary

Validate that `/se-work-loop` can parse U-IDs, run fresh iterations, persist state, and advance after verification.

---

## Execution Handoff

**Recommended loop command:** `/se-work-loop docs/plans/dummy-loop-plan.md`

**Verification command:** `grep -q 'U2 complete' tmp/se-loop-dummy.txt`

## Requirements

- R1. Create a simple output file.
- R2. Update it in a second dependent unit.

## Implementation Units

### U1. Create dummy output

**Goal:** Create a simple text file proving the first loop iteration ran.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `tmp/se-loop-dummy.txt`

**Approach:**
- Create `tmp/se-loop-dummy.txt`.
- Write one line: `U1 complete`.

**Patterns to follow:**
- `README.md`

**Test scenarios:**
- Happy path: file exists after U1.

**Verification:**
- `tmp/se-loop-dummy.txt` exists.

---

### U2. Append second line

**Goal:** Append a second line proving the loop advanced to the dependent unit.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: `tmp/se-loop-dummy.txt`

**Approach:**
- Append one line: `U2 complete`.

**Patterns to follow:**
- `tmp/se-loop-dummy.txt`

**Test scenarios:**
- Happy path: file contains both U1 and U2 lines.

**Verification:**
- `tmp/se-loop-dummy.txt` contains `U1 complete`.
- `tmp/se-loop-dummy.txt` contains `U2 complete`.
