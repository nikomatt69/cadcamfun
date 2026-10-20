import { CompanionError } from "./client"

/**
 * The companion gateway limits how fast one device may act: reads burst at 240 and refill at 20 a second,
 * writes burst at 60 and refill at **one** a second (spec 13 §6). A phone that ignores the refusal turns a
 * deliberate back-off into a hard failure the user cannot act on, so every refusal carries its own advice:
 * the gateway sends `retry-after`, and the client parses it into milliseconds.
 */

/** True when the desktop refused the request because this device sent too much too fast. */
export const isThrottled = (error: unknown): boolean =>
  error instanceof CompanionError && error.status === 429

/** How long the gateway asked the phone to wait, in milliseconds. */
export const throttleDelayMs = (error: unknown): number | undefined =>
  isThrottled(error) ? (error as CompanionError).retryAfterMs : undefined

/**
 * A sentence the user can act on: the desktop is busy, not broken, and the wait is short. Without the
 * gateway's advice the message still reads as a pause rather than a failure.
 */
export const throttleMessage = (error: unknown): string => {
  const delay = throttleDelayMs(error)
  if (delay === undefined) return "The desktop is busy right now. Wait a moment and try again."
  const seconds = Math.max(1, Math.round(delay / 1000))
  return `The desktop is busy right now. It will answer in about ${seconds}s.`
}

/**
 * The message for a failed action. A throttle is the desktop's own back-off and reads as a pause, not as a
 * failure; every other error keeps its own words.
 */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (isThrottled(error)) return throttleMessage(error)
  return error instanceof Error && error.message ? error.message : fallback
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CompanionError(0, "The request was cancelled"))
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new CompanionError(0, "The request was cancelled"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })

/**
 * Runs an **idempotent read** again after the gateway's own back-off when it was throttled. A write is
 * never repeated: the phone does not know whether the desktop applied it, so repeating could commit twice.
 */
export const readWithBackoff = async <T>(
  run: () => Promise<T>,
  options: { readonly attempts?: number; readonly signal?: AbortSignal } = {},
): Promise<T> => {
  const attempts = Math.max(1, options.attempts ?? 2)
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      const delay = throttleDelayMs(error)
      if (delay === undefined || attempt === attempts - 1) throw error
      await sleep(delay, options.signal)
    }
  }
  throw lastError
}
