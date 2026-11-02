/** Host-owned operation timing: independent of the UI stream, without retaining invocation payloads or identities. */
import { inheritedPermissionMode, type PermissionMode } from "./permission-modes.ts"

export interface HostOperationTiming {
  readonly tool: string
  readonly mode: PermissionMode
  readonly phase: "permission" | "execution"
  /** Native callback settlement; an `ok: false` domain response can still return normally. */
  readonly outcome: "ok" | "error" | "cancelled"
  readonly durationMs: number
}

/**
 * Permission time includes native classification, human approval and cached decisions. Execution starts only after
 * permission returns. Neither phase is provider TTFT, and a failed observer must never change an operation's result.
 */
export const hostOperationTimer = (
  observe: (timing: HostOperationTiming) => Promise<void>,
  now: () => number = () => performance.now()
) => async <A>(
  input: { readonly tool: string; readonly agent: string; readonly phase: HostOperationTiming["phase"]; readonly signal: AbortSignal },
  run: () => Promise<A>
): Promise<A> => {
  const started = now()
  let outcome: HostOperationTiming["outcome"] = "error"
  try {
    const value = await run()
    outcome = "ok"
    return value
  } finally {
    const durationMs = Math.max(0, now() - started)
    const timing: HostOperationTiming = {
      tool: input.tool, mode: inheritedPermissionMode(input.agent), phase: input.phase,
      outcome: outcome === "error" && input.signal.aborted ? "cancelled" : outcome, durationMs
    }
    try { await observe(timing) } catch { /* Observability cannot fail an authorized tool or mask its original failure. */ }
  }
}
