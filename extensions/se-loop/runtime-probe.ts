export interface RuntimeProbeResult {
  ok: boolean
  message: string
}

export function supportsNewSession(ctx: unknown): ctx is { newSession: (...args: unknown[]) => Promise<{ cancelled: boolean }> } {
  return !!ctx && typeof ctx === "object" && "newSession" in ctx && typeof (ctx as { newSession?: unknown }).newSession === "function"
}

export async function runRuntimeProbe(ctx: unknown): Promise<RuntimeProbeResult> {
  if (!supportsNewSession(ctx)) {
    return {
      ok: false,
      message: "This Pi runtime did not expose ctx.newSession to the command handler.",
    }
  }

  return {
    ok: true,
    message: "ctx.newSession is available. Run a real /se-work-loop smoke test to verify prompt delivery and completion observation.",
  }
}
