import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

type DeviceName = "bandai"
type Action = "build" | "switch"

interface DeviceDefaults {
  readonly flakeAttr: string
  readonly buildHost: string
  readonly targetHost: string
  readonly sshConfig: string
}

const DEVICES: Record<DeviceName, DeviceDefaults> = {
  bandai: {
    flakeAttr: ".#korri-thor-kiosk",
    buildHost: "fuji",
    targetHost: "bandai-guest-ip",
    sshConfig: "/tmp/bandai-deploy/ssh_config_ip",
  },
}

export function registerDeviceRebuildTool(
  pi: ExtensionAPI,
  _packageRoot: string,
): void {
  pi.registerTool({
    name: "device_nixos_rebuild",
    label: "Device: NixOS rebuild",
    description:
      "Build or switch a known Korri NixOS device using encoded device defaults. Bandai uses .#korri-thor-kiosk, fuji as build host, bandai-guest-ip as target, and the deployment SSH config by default.",
    promptSnippet: "Build or switch a known Korri NixOS device",
    promptGuidelines: [
      "Call device_nixos_rebuild instead of templating nixos-rebuild bash when the user asks to build, deploy, switch, or rebuild bandai or another registered Korri device.",
      "Default to action='build'. Use action='switch' only when the user explicitly wants the device switched/deployed or has confirmed interruption risk.",
      "Do not override bandai defaults unless the user explicitly asks; the default target is .#korri-thor-kiosk, not odin2portal.",
    ],
    parameters: Type.Object({
      device: Type.Union([Type.Literal("bandai")], {
        description: "Known device to build/switch.",
      }),
      action: Type.Optional(
        Type.Union([Type.Literal("build"), Type.Literal("switch")], {
          description: "Rebuild action. Defaults to build-only.",
        }),
      ),
      sshConfig: Type.Optional(
        Type.String({
          description:
            "SSH config path. Defaults to /tmp/bandai-deploy/ssh_config_ip for bandai.",
        }),
      ),
      buildHost: Type.Optional(
        Type.String({
          description: "Remote build host. Defaults to fuji for bandai.",
        }),
      ),
      targetHost: Type.Optional(
        Type.String({
          description:
            "Target host for action='switch'. Defaults to bandai-guest-ip for bandai.",
        }),
      ),
      flakeAttr: Type.Optional(
        Type.String({
          description:
            "Flake attr override. Defaults to .#korri-thor-kiosk for bandai.",
        }),
      ),
      allowOverride: Type.Optional(
        Type.Boolean({
          description:
            "Required to override encoded device defaults such as bandai's flake attr/build host/target host.",
        }),
      ),
      dryRun: Type.Optional(
        Type.Boolean({
          description: "When true, return the resolved command without running it.",
        }),
      ),
      requireClean: Type.Optional(
        Type.Boolean({
          description: "When true, refuse to run if the git worktree is dirty.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const p = params as {
        device: DeviceName
        action?: Action
        sshConfig?: string
        buildHost?: string
        targetHost?: string
        flakeAttr?: string
        allowOverride?: boolean
        dryRun?: boolean
        requireClean?: boolean
      }
      const defaults = DEVICES[p.device]
      if (!defaults) {
        return errorResult(`device_nixos_rebuild: unknown device '${String(p.device)}'`)
      }

      const action = p.action ?? "build"
      const sshConfig = p.sshConfig ?? defaults.sshConfig
      const buildHost = p.buildHost ?? defaults.buildHost
      const targetHost = p.targetHost ?? defaults.targetHost
      const flakeAttr = p.flakeAttr ?? defaults.flakeAttr
      const cwd = ctx?.cwd ?? process.cwd()

      if (!existsSync(sshConfig)) {
        return errorResult(`device_nixos_rebuild: SSH config not found: ${sshConfig}`)
      }
      if (p.device === "bandai" && p.allowOverride !== true) {
        if (flakeAttr !== defaults.flakeAttr) {
          return errorResult(
            "device_nixos_rebuild: bandai must use .#korri-thor-kiosk unless allowOverride=true",
          )
        }
        if (buildHost !== defaults.buildHost) {
          return errorResult(
            "device_nixos_rebuild: bandai buildHost must be fuji unless allowOverride=true",
          )
        }
        if (targetHost !== defaults.targetHost) {
          return errorResult(
            "device_nixos_rebuild: bandai targetHost must be bandai-guest-ip unless allowOverride=true",
          )
        }
      }

      if (p.requireClean === true) {
        const status = await runBuffered("git", ["status", "--porcelain"], {
          cwd,
          signal,
        })
        if (status.exitCode !== 0) return failedCommand("git status", status)
        if (status.stdout.trim() !== "") {
          return errorResult(
            `device_nixos_rebuild: worktree is dirty and requireClean=true\n${status.stdout.trim()}`,
          )
        }
      }

      const args = [
        action,
        "--flake",
        flakeAttr,
        "--build-host",
        buildHost,
        "--no-reexec",
      ]
      if (action === "switch") args.push("--target-host", targetHost)

      const env = { ...process.env, NIX_SSHOPTS: `-F ${sshConfig}` }
      const commandLine = `NIX_SSHOPTS=${JSON.stringify(env.NIX_SSHOPTS)} nixos-rebuild ${args.map(shellQuote).join(" ")}`
      if (p.dryRun === true) {
        return {
          content: [{ type: "text", text: commandLine }],
          details: { device: p.device, action, command: "nixos-rebuild", args, env: { NIX_SSHOPTS: env.NIX_SSHOPTS } },
        }
      }

      const result = await runBuffered("nixos-rebuild", args, { cwd, env, signal })
      const text = [
        `device_nixos_rebuild: ${p.device} ${action} exited ${result.exitCode}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n")
      return {
        isError: result.exitCode !== 0,
        content: [{ type: "text", text }],
        details: {
          device: p.device,
          action,
          command: "nixos-rebuild",
          args,
          env: { NIX_SSHOPTS: env.NIX_SSHOPTS },
          exitCode: result.exitCode,
        },
      }
    },
  })
}

function errorResult(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] }
}

function failedCommand(label: string, result: BufferedResult) {
  return errorResult(
    `${label} failed with exit ${result.exitCode}\n${result.stderr || result.stdout}`,
  )
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

interface BufferedResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

function runBuffered(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env?: NodeJS.ProcessEnv
    readonly signal?: AbortSignal
  },
): Promise<BufferedResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", chunk => {
      stdout += String(chunk)
    })
    child.stderr.on("data", chunk => {
      stderr += String(chunk)
    })
    child.on("error", error => {
      resolve({ exitCode: 127, stdout, stderr: stderr + String(error.message) })
    })
    child.on("close", code => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}
