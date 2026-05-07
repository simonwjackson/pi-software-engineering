import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import type { Theme } from "@mariozechner/pi-coding-agent"
import { currentUnitForState, dismissLoop, markStopRequested, runtimeState } from "./controller.ts"
import { runLoopInBackground } from "./background-runner.ts"
import { listLoopStates, loopLocation, saveLoopState, type WorkLoopState } from "./state-store.ts"

type TUI = { requestRender: () => void; terminal: { columns: number; rows: number } }
type Component = { render: (width: number) => string[]; handleInput?: (data: string) => void; invalidate?: () => void; dispose?: () => void }
type Done = () => void

type ObserverLike = { poll: () => void }

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "")
}

function visibleLength(value: string): number {
  return stripAnsi(value).length
}

function truncate(value: string, width: number): string {
  if (visibleLength(value) <= width) return value
  const plain = stripAnsi(value)
  if (width <= 3) return plain.slice(0, Math.max(0, width))
  return `${plain.slice(0, width - 3)}...`
}

function pad(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`
}

function bordered(lines: string[], width: number): string[] {
  const totalWidth = Math.max(24, width)
  const contentWidth = Math.max(20, totalWidth - 4)
  const horizontal = "─".repeat(totalWidth - 2)
  return [
    `╭${horizontal}╮`,
    ...lines.map(line => {
      const content = truncate(line, contentWidth)
      return `│ ${content}${" ".repeat(Math.max(0, contentWidth - visibleLength(content)))} │`
    }),
    `╰${horizontal}╯`,
  ]
}

function shortId(id: string): string {
  return id.replace(/^\d{8}T\d{6}Z-/, "").slice(0, 38)
}

function elapsed(updatedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(updatedAt)) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function statusColor(theme: Theme, state: WorkLoopState, value: string): string {
  if (state.status === "blocked") return theme.fg("error", value)
  if (state.status === "paused") return theme.fg("warning", value)
  if (state.status === "active") return theme.fg("accent", value)
  return theme.fg("dim", value)
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .filter((part): part is { type: string; text: string } => {
      return !!part && typeof part === "object" && "type" in part && "text" in part && part.type === "text" && typeof part.text === "string"
    })
    .map(part => part.text.trim())
    .filter(Boolean)
    .join("\n")
}

function compactToolArgs(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  const preferred = ["path", "command", "oldText", "newText"]
    .map(key => typeof record[key] === "string" ? `${key}: ${String(record[key]).replace(/\s+/g, " ").slice(0, 90)}` : null)
    .filter(Boolean)
  if (preferred.length > 0) return preferred.join(" · ")
  return Object.keys(record).slice(0, 4).join(", ")
}

export function humanizeJsonLog(raw: string): string[] {
  const rendered: string[] = []
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue

    let event: Record<string, unknown>
    try {
      event = JSON.parse(line) as Record<string, unknown>
    } catch {
      rendered.push(line)
      continue
    }

    const type = event.type
    if (type === "tool_execution_start") {
      const toolName = typeof event.toolName === "string" ? event.toolName : "tool"
      const args = compactToolArgs(event.args)
      rendered.push(args ? `› ${toolName} ${args}` : `› ${toolName}`)
      continue
    }

    if (type === "tool_execution_end") {
      if (event.isError === true) rendered.push("✗ tool failed")
      continue
    }

    if (type === "message_end" && event.message && typeof event.message === "object") {
      const message = event.message as { role?: string; content?: unknown; errorMessage?: string }
      const text = textFromContent(message.content)
      if (message.errorMessage) rendered.push(`✗ ${message.errorMessage}`)
      if (message.role === "assistant" && text) rendered.push(...text.split("\n"))
      continue
    }
  }

  return rendered.length > 0 ? rendered : ["(no human-readable log output yet)"]
}

export class SeWorkLoopManagerOverlay implements Component {
  private readonly tui: TUI
  private readonly theme: Theme
  private readonly cwd: string
  private readonly done: Done
  private readonly observer: ObserverLike | null
  private loops: WorkLoopState[] = []
  private selected = 0
  private footer = ""
  private view: "list" | "log" = "list"
  private logScrollFromBottom = 0

  constructor(input: { tui: TUI; theme: Theme; cwd: string; done: Done; observer?: ObserverLike | null }) {
    this.tui = input.tui
    this.theme = input.theme
    this.cwd = input.cwd
    this.done = input.done
    this.observer = input.observer ?? null
    this.refresh()
  }

  private refresh(): void {
    this.loops = listLoopStates(this.cwd).slice(0, 20)
    this.selected = Math.min(this.selected, Math.max(0, this.loops.length - 1))
    this.observer?.poll()
  }

  private selectedLoop(): WorkLoopState | null {
    return this.loops[this.selected] ?? null
  }

  private setFooter(message: string): void {
    this.footer = message
    this.tui.requestRender()
  }

  private stopFocused(): void {
    const loop = this.selectedLoop()
    if (!loop) return this.setFooter("No loop selected")
    const stopped = markStopRequested(this.cwd, loop.id)
    this.refresh()
    this.setFooter(stopped ? `Stop requested for ${shortId(stopped.id)}` : "Unable to stop loop")
  }

  private dismissFocused(): void {
    const loop = this.selectedLoop()
    if (!loop) return this.setFooter("No loop selected")
    if (loop.status === "active") return this.setFooter("Stop active loops before dismissing")
    const dismissed = dismissLoop(this.cwd, loop.id)
    this.refresh()
    this.setFooter(dismissed ? `Dismissed ${shortId(dismissed.id)}` : "Unable to dismiss loop")
  }

  private resumeFocused(): void {
    const loop = this.selectedLoop()
    if (!loop) return this.setFooter("No loop selected")
    if (loop.status === "active") return this.setFooter("Loop is already active")
    const runningLoopId = runtimeState().runningLoopId
    if (runningLoopId && runningLoopId !== loop.id) return this.setFooter(`Another loop is running: ${shortId(runningLoopId)}`)

    const state = saveLoopState({ ...loop, status: "active", stopRequested: false })
    this.refresh()
    this.setFooter(`Resuming ${shortId(state.id)} in background`)
    void runLoopInBackground(state).finally(() => {
      this.refresh()
      this.tui.requestRender()
    })
  }

  handleInput(data: string): void {
    if (this.view === "log") {
      if (data === "q" || data === "\u001b" || data === "l") {
        this.view = "list"
        this.logScrollFromBottom = 0
        return this.tui.requestRender()
      }
      if (data === "j" || data === "\u001b[B") {
        this.logScrollFromBottom = Math.max(0, this.logScrollFromBottom - 1)
        return this.tui.requestRender()
      }
      if (data === "k" || data === "\u001b[A") {
        this.logScrollFromBottom += 1
        return this.tui.requestRender()
      }
      if (data === "G") {
        this.logScrollFromBottom = 0
        return this.tui.requestRender()
      }
      if (data === "R") {
        this.refresh()
        return this.setFooter("Refreshed log")
      }
      return
    }

    if (data === "q" || data === "\u001b") return this.done()
    if (data === "j" || data === "\u001b[B") {
      this.selected = Math.min(this.selected + 1, Math.max(0, this.loops.length - 1))
      return this.tui.requestRender()
    }
    if (data === "k" || data === "\u001b[A") {
      this.selected = Math.max(0, this.selected - 1)
      return this.tui.requestRender()
    }
    if (data === "g") {
      this.selected = 0
      return this.tui.requestRender()
    }
    if (data === "G") {
      this.selected = Math.max(0, this.loops.length - 1)
      return this.tui.requestRender()
    }
    if (data === "l") {
      this.view = "log"
      this.logScrollFromBottom = 0
      return this.tui.requestRender()
    }
    if (data === "s") return this.stopFocused()
    if (data === "d") return this.dismissFocused()
    if (data === "r") return this.resumeFocused()
    if (data === "R") {
      this.refresh()
      return this.setFooter("Refreshed")
    }
  }

  private activeLogPath(loop: WorkLoopState): string | null {
    const location = loopLocation(loop.cwd, loop.id)
    const current = loop.currentUnitId ?? currentUnitForState(loop)
    const preferred = join(location.loopDir, `background-${current}.log`)
    if (existsSync(preferred)) return preferred

    try {
      const candidates = readdirSync(location.loopDir)
        .filter(name => /^background-U\d+\.log$/.test(name))
        .sort()
      const latest = candidates.at(-1)
      return latest ? join(location.loopDir, latest) : null
    } catch {
      return null
    }
  }

  private logLines(loop: WorkLoopState, rows: number): { title: string; lines: string[] } {
    const logPath = this.activeLogPath(loop)
    if (!logPath) return { title: "No background child log yet", lines: ["No background child log has been written for this loop yet."] }

    try {
      const humanLines = humanizeJsonLog(readFileSync(logPath, "utf8"))
      const end = Math.max(0, humanLines.length - this.logScrollFromBottom)
      const start = Math.max(0, end - rows)
      return { title: basename(logPath), lines: humanLines.slice(start, end) }
    } catch (error) {
      return { title: basename(logPath), lines: [error instanceof Error ? error.message : String(error)] }
    }
  }

  private renderLog(width: number, inner: number, rows: number): string[] {
    this.refresh()
    const loop = this.selectedLoop()
    const lines: string[] = []
    lines.push(this.theme.fg("accent", "SE Work Loop Logs"))
    lines.push(this.theme.fg("dim", "j/k scroll · G bottom · R refresh · l/q/Esc back"))
    lines.push(this.theme.fg("dim", "─".repeat(Math.min(inner, width))))

    if (!loop) {
      lines.push(this.theme.fg("dim", "No loop selected."))
    } else {
      const { title, lines: logLines } = this.logLines(loop, rows)
      lines.push(this.theme.fg("muted", `${shortId(loop.id)} · ${title}`))
      for (const line of logLines.slice(-rows)) {
        lines.push(truncate(line || " ", inner))
      }
    }

    lines.push(this.theme.fg("dim", "─".repeat(Math.min(inner, width))))
    lines.push(this.footer ? this.theme.fg("muted", this.footer) : this.theme.fg("dim", "Viewing background child log."))
    return bordered(lines, width)
  }

  render(width: number): string[] {
    const inner = Math.max(40, width - 4)
    const rows = Math.max(8, Math.floor(this.tui.terminal.rows * 0.6) - 8)
    if (this.view === "log") return this.renderLog(width, inner, rows)

    const lines: string[] = []

    lines.push(this.theme.fg("accent", "SE Work Loop Manager"))
    lines.push(this.theme.fg("dim", "j/k select · l logs · s stop · r resume bg · d dismiss · R refresh · q close"))
    lines.push(this.theme.fg("dim", "─".repeat(Math.min(inner, width))))

    if (this.loops.length === 0) {
      lines.push(this.theme.fg("dim", "No SE work loops found."))
    } else {
      const visible = this.loops.slice(0, rows)
      for (const [index, loop] of visible.entries()) {
        const marker = index === this.selected ? this.theme.fg("accent", "›") : " "
        const completed = loop.units.filter(unit => unit.status === "completed").length
        const progress = `[${completed}/${loop.units.length}]`
        const latest = loop.events.at(-1)?.message ?? ""
        const status = statusColor(this.theme, loop, pad(loop.status, 9))
        const row = [
          marker,
          status,
          this.theme.fg("muted", pad(progress, 7)),
          this.theme.fg("text", pad(shortId(loop.id), 40)),
          this.theme.fg("dim", pad(currentUnitForState(loop), 4)),
          this.theme.fg("dim", pad(elapsed(loop.updatedAt), 9)),
          latest ? this.theme.fg("dim", `· ${latest}`) : "",
        ].join(" ")
        lines.push(truncate(row, inner))
      }
    }

    lines.push(this.theme.fg("dim", "─".repeat(Math.min(inner, width))))
    lines.push(this.footer ? this.theme.fg("muted", this.footer) : this.theme.fg("dim", "State is preserved under .context/software-engineering/se-work-loop/"))
    return bordered(lines, width)
  }

  invalidate(): void {}
}
