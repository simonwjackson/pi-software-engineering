import { exec } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { promisify } from "node:util"
import type { LoopUnit } from "./plan-parser.ts"
import { unitFilePaths } from "./plan-parser.ts"

const execAsync = promisify(exec)

export interface VerificationResult {
  ok: boolean
  summary: string
  missingFiles: string[]
  command?: string
  stdout?: string
  stderr?: string
}

export function missingRequiredFiles(cwd: string, unit: LoopUnit): string[] {
  return unitFilePaths(unit).filter(filePath => !existsSync(resolve(cwd, filePath)))
}

export function verifyUnitFiles(cwd: string, unit: LoopUnit): VerificationResult {
  const missingFiles = missingRequiredFiles(cwd, unit)
  if (missingFiles.length === 0) {
    return {
      ok: true,
      missingFiles: [],
      summary: `Files present for ${unit.id}`,
    }
  }

  return {
    ok: false,
    missingFiles,
    summary: `Missing expected file(s) after ${unit.id}: ${missingFiles.join(", ")}`,
  }
}

export async function runVerifyCommand(cwd: string, command: string): Promise<VerificationResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    })
    return {
      ok: true,
      missingFiles: [],
      command,
      stdout,
      stderr,
      summary: `Verification passed: ${command}`,
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      missingFiles: [],
      command,
      stdout: err.stdout,
      stderr: err.stderr,
      summary: `Verification failed: ${command}\n${err.message}`,
    }
  }
}
