---
title: feat: Sample SE work loop
type: feat
status: active
date: 2026-05-06
---

# feat: Sample SE work loop

## Summary

Tiny sample plan for validating `/se-work-loop` parser, state, verification, and status behavior.

## Requirements

- R1. Create one small artifact.
- R2. Verify it with a target-project command.

## Implementation Units

### U1. Create sample artifact

**Goal:** Create a tiny sample output file.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `tmp/se-work-loop-sample.txt`
- Test: `tmp/se-work-loop-sample.txt`

**Approach:**
- Write a short text file that proves the child session performed file work.

**Patterns to follow:**
- `README.md`

**Test scenarios:**
- Happy path: file exists after the unit runs.

**Verification:**
- `tmp/se-work-loop-sample.txt` exists.

---

### U2. Record sample follow-up

**Goal:** Append a second line to the sample output after U1 completes.

**Requirements:** R1, R2

**Dependencies:** U1

**Files:**
- Modify: `tmp/se-work-loop-sample.txt`

**Approach:**
- Append a line that mentions U2.

**Patterns to follow:**
- `tmp/se-work-loop-sample.txt`

**Test scenarios:**
- Happy path: file includes text from both U1 and U2.

**Verification:**
- The target-project verify command passes.
