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

export async function verifyUnit(cwd: string, unit: LoopUnit, verifyCommand: string): Promise<VerificationResult> {
  const missingFiles = missingRequiredFiles(cwd, unit)
  if (missingFiles.length > 0) {
    return {
      ok: false,
      missingFiles,
      command: verifyCommand,
      summary: `Missing expected file(s): ${missingFiles.join(", ")}`,
    }
  }

  try {
    const { stdout, stderr } = await execAsync(verifyCommand, {
      cwd,
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    })
    return {
      ok: true,
      missingFiles: [],
      command: verifyCommand,
      stdout,
      stderr,
      summary: `Verification passed: ${verifyCommand}`,
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      missingFiles: [],
      command: verifyCommand,
      stdout: err.stdout,
      stderr: err.stderr,
      summary: `Verification failed: ${verifyCommand}\n${err.message}`,
    }
  }
}
