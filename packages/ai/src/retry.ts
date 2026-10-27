/**
 * When and how long to wait before asking a provider again (nikcli's `session/retry.ts`): a delay that grows
 * from 2 s, honours the provider's own `retry-after`, and a message a user can read for every kind of
 * transient failure. `providerRetry` is that policy as an Effect `Schedule`, so a retry is `Effect.retry`: it
 * sleeps on Effect's `Clock` (a test provides one that does not wait) and stops when the fiber is interrupted.
 */
import { Duration, Effect, Schedule } from "effect"
import { parseApiFailure, type ApiFailure } from "./provider-error.ts"

export const RETRY_INITIAL_DELAY = 2_000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000
export const RETRY_MAX_DELAY = 2_147_483_647
export const RETRY_MAX_ATTEMPTS = 5

/** Milliseconds to wait before attempt `attempt + 1` (`attempt` counts from 1). */
export const delay = (attempt: number, failure?: ApiFailure): number => {
  const base = RETRY_INITIAL_DELAY * RETRY_BACKOFF_FACTOR ** (attempt - 1)
  const headers = failure?.responseHeaders
  if (headers) {
    const ms = Number.parseFloat(headers["retry-after-ms"] ?? "")
    if (!Number.isNaN(ms)) return ms
    const retryAfter = headers["retry-after"]
    if (retryAfter) {
      const seconds = Number.parseFloat(retryAfter)
      if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000)
      const until = Date.parse(retryAfter) - Date.now()
      if (!Number.isNaN(until) && until > 0) return Math.ceil(until)
    }
  }
  // 10% jitter keeps many clients from retrying in step.
  return Math.min(base + base * Math.random() * 0.1, RETRY_MAX_DELAY_NO_HEADERS)
}

const mapPlainRetryMessage = (message: string): string | undefined => {
  const lower = message.toLowerCase()
  if (message.includes("Worker local total request limit") || lower.includes("resourceexhausted") || lower.includes("resource exhausted")) return "Provider is overloaded"
  if (lower.includes("server_is_overloaded") || lower.includes("service_unavailable_error") || lower.includes("service unavailable")) return "Provider is overloaded"
  if (lower.includes("overloaded")) return "Provider is overloaded"
  return undefined
}

const mapJsonRetryMessage = (message: string): string | undefined => {
  try {
    const json = JSON.parse(message)
    if (json.type === "error" && json.error?.type === "too_many_requests") return "Too Many Requests"
    if (json.code?.includes("exhausted") || json.code?.includes("unavailable")) return "Provider is overloaded"
    if (json.type === "error" && json.error?.code?.includes("rate_limit")) return "Rate Limited"
    const type = typeof json.error?.type === "string" ? json.error.type : undefined
    if (type === "server_is_overloaded" || type === "service_unavailable_error" || type === "overloaded_error") return "Provider is overloaded"
    if (json.error?.message?.includes("no_kv_space") || (json.type === "error" && json.error?.type === "server_error") || !!json.error) return "Provider Server Error"
  } catch {
    // Not JSON.
  }
  return undefined
}

/**
 * The message to show while waiting, or `undefined` when asking again cannot help (bad key, malformed request, a
 * context overflow: that needs a summary, not a pause). 5xx is always transient, whatever the provider marked.
 */
export const retryable = (failure: ApiFailure): string | undefined => {
  const parsed = parseApiFailure(failure)
  if (parsed.type !== "api_error") return undefined
  const status = parsed.statusCode
  if (!parsed.isRetryable && !(status !== undefined && status >= 500)) return undefined
  const body = parsed.responseBody
  if (typeof body === "string") {
    const fromBody = mapPlainRetryMessage(body) ?? mapJsonRetryMessage(body)
    if (fromBody) return fromBody
  }
  return mapPlainRetryMessage(parsed.message) ?? mapJsonRetryMessage(parsed.message) ?? (parsed.message || "Provider error")
}

/**
 * The retry policy for provider calls failing with `E`: at most `attempts` calls in all, only while `failure` says the error is
 * transient (it answers `undefined` for errors that are not provider failures, such as an abort), each pause the one `delay`
 * gives for that attempt and that failure, so a provider's `retry-after` sets it.
 */
export const providerRetry = <E>(attempts: number, failure: (error: E) => ApiFailure | undefined): Schedule.Schedule<number, E> =>
  Schedule.recurs(Math.max(0, attempts - 1)).pipe(
    Schedule.setInputType<E>(),
    Schedule.while(({ input }) => {
      const parsed = failure(input)
      return parsed !== undefined && retryable(parsed) !== undefined
    }),
    Schedule.modifyDelay(({ input, attempt }) => Effect.succeed(Duration.millis(Math.min(delay(attempt, failure(input)), RETRY_MAX_DELAY))))
  )
