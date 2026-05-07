import type { Theme } from "@mariozechner/pi-coding-agent"
import { currentUnitForState, dismissLoop, markStopRequested, runtimeState } from "./controller.ts"
import { runLoopInBackground } from "./background-runner.ts"
import { listLoopStates, saveLoopState, type WorkLoopState } from "./state-store.ts"

type TUI = { requestRender: () => void; terminal: { columns: number; rows: number } }
type Component = { render: (width: number) => string[]; handleInput?: (data: string) => void; invalidate?: () => void; dispose?: () => void }
type Done = (result: void) => void

type ObserverLike = { poll: () => void }

function truncate(value: string, width: number): string {
  if (value.length <= width) return value
  if (width <= 3) return value.slice(0, Math.max(0, width))
  return `${value.slice(0, width - 3)}...`
}

function pad(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - value.length))}`
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

export class SeWorkLoopManagerOverlay implements Component {
  private readonly tui: TUI
  private readonly theme: Theme
  private readonly cwd: string
  private readonly done: Done
  private readonly observer: ObserverLike | null
  private loops: WorkLoopState[] = []
  private selected = 0
  private footer = ""

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

  private focused(): WorkLoopState | null {
    return this.loops[this.selected] ?? null
  }

  private setFooter(message: string): void {
    this.footer = message
    this.tui.requestRender()
  }

  private stopFocused(): void {
    const loop = this.focused()
    if (!loop) return this.setFooter("No loop selected")
    const stopped = markStopRequested(this.cwd, loop.id)
    this.refresh()
    this.setFooter(stopped ? `Stop requested for ${shortId(stopped.id)}` : "Unable to stop loop")
  }

  private dismissFocused(): void {
    const loop = this.focused()
    if (!loop) return this.setFooter("No loop selected")
    if (loop.status === "active") return this.setFooter("Stop active loops before dismissing")
    const dismissed = dismissLoop(this.cwd, loop.id)
    this.refresh()
    this.setFooter(dismissed ? `Dismissed ${shortId(dismissed.id)}` : "Unable to dismiss loop")
  }

  private resumeFocused(): void {
    const loop = this.focused()
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
    if (data === "q" || data === "\u001b") return this.done(undefined)
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
    if (data === "s") return this.stopFocused()
    if (data === "d") return this.dismissFocused()
    if (data === "r") return this.resumeFocused()
    if (data === "R") {
      this.refresh()
      return this.setFooter("Refreshed")
    }
  }

  render(width: number): string[] {
    const inner = Math.max(40, width - 4)
    const rows = Math.max(8, Math.floor(this.tui.terminal.rows * 0.6) - 6)
    const lines: string[] = []

    lines.push(this.theme.fg("accent", "SE Work Loop Manager"))
    lines.push(this.theme.fg("dim", "j/k select · s stop · r resume bg · d dismiss · R refresh · q close"))
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
    return lines
  }

  invalidate(): void {}
}
