import type { Theme } from "@mariozechner/pi-coding-agent"

type TUI = { requestRender: () => void }
type Component = { render: (width: number) => string[]; invalidate?: () => void; dispose?: () => void }
import { currentUnitForState } from "./controller.ts"
import { listLoopStates, type WorkLoopState } from "./state-store.ts"

function visibleLoop(state: WorkLoopState): boolean {
  return ["active", "paused", "blocked"].includes(state.status)
}

function formatElapsed(sinceIso: string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(sinceIso)) / 1000))
  if (elapsed < 60) return `${elapsed}s`
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  if (minutes < 60) return `${minutes}m${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${minutes % 60}m`
}

function shortId(id: string): string {
  return id.replace(/^\d{8}T\d{6}Z-/, "").slice(0, 36)
}

function truncatePlain(value: string, width: number): string {
  if (value.length <= width) return value
  if (width <= 3) return value.slice(0, Math.max(0, width))
  return `${value.slice(0, width - 3)}...`
}

export class SeWorkLoopObserver {
  private readonly cwd: string
  private loops: WorkLoopState[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<() => void>()

  constructor(cwd: string) {
    this.cwd = cwd
  }

  start(intervalMs = 1500): void {
    if (this.timer) return
    this.poll()
    this.timer = setInterval(() => this.poll(), intervalMs)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  poll(): void {
    const next = listLoopStates(this.cwd).filter(visibleLoop)
    const previousSignature = JSON.stringify(this.loops.map(loopSignature))
    const nextSignature = JSON.stringify(next.map(loopSignature))
    this.loops = next
    if (previousSignature !== nextSignature) this.emitChange()
  }

  getLoops(): WorkLoopState[] {
    return [...this.loops]
  }

  getFocused(): WorkLoopState | null {
    return this.loops[0] ?? null
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener()
  }
}

function loopSignature(state: WorkLoopState): string {
  const completed = state.units.filter(unit => unit.status === "completed").length
  const latest = state.events.at(-1)?.message ?? ""
  return [state.id, state.status, currentUnitForState(state), completed, state.units.length, latest, state.updatedAt].join("|")
}

export class SeWorkLoopWidget implements Component {
  private readonly tui: TUI
  private readonly theme: Theme
  private readonly observer: SeWorkLoopObserver
  private unsubscribe: (() => void) | null = null

  constructor(tui: TUI, theme: Theme, observer: SeWorkLoopObserver) {
    this.tui = tui
    this.theme = theme
    this.observer = observer
    this.unsubscribe = observer.onChange(() => this.tui.requestRender())
  }

  render(width: number): string[] {
    const loops = this.observer.getLoops()
    const loop = this.observer.getFocused()
    if (!loop) return []

    const completed = loop.units.filter(unit => unit.status === "completed").length
    const total = loop.units.length
    const current = currentUnitForState(loop)
    const latest = loop.events.at(-1)?.message ?? ""
    const index = loops.length > 1 ? ` [1/${loops.length}]` : ""

    const prefix = this.theme.fg("accent", "se-loop ") + this.theme.fg("dim", "> ")
    const summary = [
      this.theme.fg("text", shortId(loop.id)),
      this.theme.fg("muted", `[${completed}/${total}]`),
      this.theme.fg(loop.status === "blocked" ? "error" : loop.status === "paused" ? "warning" : "accent", loop.status),
      this.theme.fg("dim", current),
      this.theme.fg("dim", formatElapsed(loop.createdAt)),
      latest ? this.theme.fg("dim", `· ${latest}`) : "",
    ].filter(Boolean).join(" ")

    return [truncatePlain(`${prefix}${summary}${this.theme.fg("dim", index)}`, width)]
  }

  invalidate(): void {}

  dispose?(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}
