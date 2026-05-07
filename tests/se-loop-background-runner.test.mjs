import { test } from "node:test"
import assert from "node:assert/strict"
import { piSpawnSpec } from "../extensions/se-loop/background-runner.ts"

test("piSpawnSpec defaults to the nix bunx Pi launcher", () => {
  const previous = process.env.SE_WORK_LOOP_PI_COMMAND
  delete process.env.SE_WORK_LOOP_PI_COMMAND
  try {
    assert.deepEqual(piSpawnSpec(["--mode", "json", "-p", "hi"]), {
      command: "nix",
      args: ["shell", "nixpkgs#bun", "nixpkgs#nodejs", "--command", "bun", "x", "@mariozechner/pi-coding-agent", "--mode", "json", "-p", "hi"],
    })
  } finally {
    if (previous === undefined) delete process.env.SE_WORK_LOOP_PI_COMMAND
    else process.env.SE_WORK_LOOP_PI_COMMAND = previous
  }
})

test("piSpawnSpec supports a shell command override", () => {
  const previous = process.env.SE_WORK_LOOP_PI_COMMAND
  process.env.SE_WORK_LOOP_PI_COMMAND = "custom pi"
  try {
    assert.deepEqual(piSpawnSpec(["--mode", "json", "-p", "don't split me"]), {
      command: "bash",
      args: ["-lc", "custom pi '--mode' 'json' '-p' 'don'\"'\"'t split me'"],
    })
  } finally {
    if (previous === undefined) delete process.env.SE_WORK_LOOP_PI_COMMAND
    else process.env.SE_WORK_LOOP_PI_COMMAND = previous
  }
})
