/**
 * Writes that survive a sidecar restart (RM-03). The shell restarts the sidecar on a new port after a crash; a write that was in
 * flight fails with a network error or a 502/503/504 from the gateway. Every write gets an `Idempotency-Key` (a fresh random one
 * unless the caller set it), and the same request is sent again with the same key, so the sidecar answers the stored result when
 * the first attempt had in fact been applied instead of writing twice.
 *
 * Not retried: reads (they need no key), a 500 (the server may have applied part of the work), a request the caller aborted, a
 * body that cannot be sent twice, and `/api/ai/` (a chat turn is a stream the server cannot replay). A retry goes back through
 * `base`, so when `base` is `followingFetch` it picks up the new port.
 */
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"])
const GATEWAY = new Set([502, 503, 504])

export interface RetryOptions {
  /** Attempts in all, the first included. */
  readonly attempts?: number
  /** Wait before the second attempt; doubles each time. */
  readonly delayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const retryingWrites = (base: typeof fetch, options: RetryOptions = {}): typeof fetch => {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3))
  const delayMs = options.delayMs ?? 250
  const sleep = options.sleep ?? wait
  const transport = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init)
    const path = new URL(request.url).pathname
    if (!WRITES.has(request.method.toUpperCase()) || path.startsWith("/api/ai/") || request.bodyUsed) return base(request)
    const headers = new Headers(request.headers)
    if (!headers.has("idempotency-key")) headers.set("idempotency-key", crypto.randomUUID())
    const keyed = new Request(request, { headers })
    let last: { response?: Response; error?: unknown } = {}
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(delayMs * 2 ** (attempt - 1))
      if (request.signal.aborted) throw request.signal.reason ?? new DOMException("Aborted", "AbortError")
      try {
        // A copy goes out each time, so the body is still there for the next attempt.
        const response = await base(keyed.clone())
        if (!GATEWAY.has(response.status)) return response
        last = { response }
      } catch (error) {
        if (request.signal.aborted) throw error
        last = { error }
      }
    }
    if (last.response !== undefined) return last.response
    throw last.error
  }
  return Object.assign(transport, { preconnect: base.preconnect })
}
