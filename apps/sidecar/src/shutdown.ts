import { Effect } from "effect"

/**
 * Waits for the parent to ask the sidecar to stop.
 *
 * Two sources end the wait, and both run the same release path:
 *
 * - the parent closing stdin (parent death), or writing `{"event":"shutdown"}` on it;
 * - `SIGINT`/`SIGTERM`, which `BunRuntime.runMain` turns into a fiber interruption.
 *
 * This effect deliberately installs no signal listeners of its own: the runtime already
 * registers them before the program starts, and a second listener would race the first
 * one for the same signal. Interrupting the fiber is what runs the scope finalizers, so
 * the HTTP server and the database handle are closed either way; `main.ts` maps that
 * interruption to a clean exit code.
 *
 * Cancelling the stdin reader is the other half of release. While a read is pending,
 * Bun's stdin handle keeps the event loop alive, so a shutdown that resolved without
 * cancelling would hang the process instead of letting the runtime exit.
 */
export const awaitShutdown: Effect.Effect<void> = Effect.callback<void>((resume) => {
  const reader = Bun.stdin.stream().getReader()
  const decoder = new TextDecoder()
  let released = false

  const release = (): void => {
    if (released) return
    released = true
    void reader.cancel().catch(() => {})
  }
  const finish = (): void => {
    release()
    resume(Effect.void)
  }

  void (async () => {
    let pending = ""
    while (!released) {
      const chunk = await reader.read()
      if (chunk.done) return finish()
      pending += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        try {
          const message: unknown = JSON.parse(line)
          if (typeof message === "object" && message !== null && "event" in message && message.event === "shutdown") return finish()
        } catch {
          // Malformed or unrelated parent messages are ignored: the parent owns stdin.
        }
      }
      // A parent that never sends a newline must not grow the buffer without bound.
      if (pending.length > 65536) pending = ""
    }
  })().catch((cause: unknown) => {
    if (released) return
    release()
    resume(Effect.die(cause))
  })
  return Effect.sync(release)
})