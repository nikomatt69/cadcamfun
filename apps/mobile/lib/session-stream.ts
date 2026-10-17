import type { SessionStreamFrame } from "@cadcamfun/api"
import { CompanionError } from "./client"
import type { ChatEvent } from "./sse"

/**
 * Follows one assistant session the way nikcli mobile's `useSessionStream` does: one long-lived SSE stream per
 * conversation, opened independently of sending. The desktop greets every connection with `server.connected`, so a
 * second greeting is a reconnection; the cursor (`after`) makes the desktop replay exactly the frames missed while
 * the phone was away, and `reset` says the gap is too old to replay, so the screen must re-read the session.
 * A connection that stays silent past two heartbeats is treated as dead (Wi-Fi hand-over, suspended radio).
 */

export type ConnectedFrame = Extract<SessionStreamFrame, { type: "server.connected" }>

export interface FollowSessionInput {
  /** Opens one connection resuming after `after`; ends or throws when it drops. */
  open(after: number | undefined, signal: AbortSignal): AsyncIterable<SessionStreamFrame>
  /** Resume point; undefined starts at the live edge. */
  after?: number
  signal: AbortSignal
  onEvent(event: ChatEvent, seq: number): void
  /** Every greeting. `reconnected` from the second one on; `reset` means re-read the session instead of trusting the replay. */
  onConnected(frame: ConnectedFrame, reconnected: boolean): void
  onDisconnected?(error: unknown): void
  /** Silence after which a connection is abandoned and reopened. Two heartbeats plus margin by default. */
  staleMs?: number
  sleep?(ms: number, signal: AbortSignal): Promise<void>
}

export const STREAM_STALE_MS = 40_000
export const RECONNECT_MIN_MS = 1_000
export const RECONNECT_MAX_MS = 15_000

/** Next pause between reconnections: doubles from one second, capped. */
export const reconnectDelay = (attempt: number): number => Math.min(RECONNECT_MIN_MS * 2 ** Math.max(attempt, 0), RECONNECT_MAX_MS)

const defaultSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve() }
  const timer = setTimeout(finish, ms)
  signal.addEventListener("abort", finish, { once: true })
  if (signal.aborted) finish()
})

/** A refusal that reconnecting cannot cure: the pairing was revoked or the session belongs to someone else. */
export const isTerminalStreamError = (error: unknown): boolean =>
  error instanceof CompanionError && (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404)

/** Runs until `signal` aborts or the desktop refuses the session; returns the last cursor. */
export async function followSession(input: FollowSessionInput): Promise<number | undefined> {
  const sleep = input.sleep ?? defaultSleep
  const staleMs = input.staleMs ?? STREAM_STALE_MS
  let cursor = input.after
  let greetings = 0
  let failures = 0
  while (!input.signal.aborted) {
    const connection = new AbortController()
    const abort = () => connection.abort()
    input.signal.addEventListener("abort", abort, { once: true })
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => connection.abort(), staleMs) }
    try {
      arm()
      for await (const frame of input.open(cursor, connection.signal)) {
        if (connection.signal.aborted) break
        arm()
        if (frame.type === "server.connected") {
          failures = 0
          // A reset greeting carries the live edge; resuming from the old cursor would only replay nothing.
          if (frame.reset || cursor === undefined) cursor = frame.seq
          input.onConnected(frame, greetings++ > 0)
        } else if (frame.type === "event") {
          cursor = frame.seq
          input.onEvent(frame.event as ChatEvent, frame.seq)
        }
      }
      if (!input.signal.aborted) input.onDisconnected?.(new CompanionError(0, connection.signal.aborted ? "The desktop stopped answering" : "The desktop closed the stream"))
    } catch (error) {
      if (input.signal.aborted) break
      input.onDisconnected?.(error)
      if (isTerminalStreamError(error)) break
    } finally {
      clearTimeout(watchdog)
      input.signal.removeEventListener("abort", abort)
      connection.abort()
    }
    if (input.signal.aborted) break
    await sleep(reconnectDelay(failures++), input.signal)
  }
  return cursor
}
