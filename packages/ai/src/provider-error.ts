/**
 * How a failed provider request is classified, the way nikcli does it (`provider/error.ts`): a context
 * overflow is not an outage, a 413 is not a rate limit, and each gets its own message and its own recovery.
 */

/** The fields of a failed request that classification reads (the AI SDK's `APICallError` has all of them). */
export interface ApiFailure {
  readonly message?: string
  readonly statusCode?: number
  readonly responseBody?: string
  readonly responseHeaders?: Readonly<Record<string, string>>
  readonly isRetryable?: boolean
}

const OVERFLOW_PATTERNS: ReadonlyArray<RegExp> = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds.*maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[ _]?length[ _]?exceeded/i,
  /context length is only \d+ tokens/i,
  /input length.*exceeds.*context length/i,
  /prompt too long; exceeded.*context length/i,
  /too large for model with \d+ maximum context length/i,
  /max tokens.*exceeded/i,
  /output length.*exceeds/i,
  /response length.*exceeds/i
]

const PAYLOAD_TOO_LARGE_PATTERNS: ReadonlyArray<RegExp> = [/request_too_large/i, /request entity too large/i, /payload too large/i, /request too large/i]

const isOverflow = (message: string): boolean => OVERFLOW_PATTERNS.some((p) => p.test(message)) || /^400\s*(status code)?\s*\(no body\)/i.test(message)
const isPayloadTooLarge = (message: string): boolean => PAYLOAD_TOO_LARGE_PATTERNS.some((p) => p.test(message))

export type ParsedApiFailure =
  | { readonly type: "context_overflow"; readonly message: string; readonly statusCode?: number; readonly responseBody?: string }
  | { readonly type: "payload_too_large"; readonly message: string; readonly statusCode?: number; readonly responseBody?: string }
  | { readonly type: "api_error"; readonly message: string; readonly statusCode?: number; readonly isRetryable: boolean; readonly responseBody?: string }

const RETRYABLE_STATUS = (status: number | undefined): boolean => status !== undefined && (status === 408 || status === 409 || status === 429 || status >= 500)

const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

export const parseApiFailure = (failure: ApiFailure): ParsedApiFailure => {
  const message = failure.message ?? ""
  const searchable = [message, failure.responseBody].filter(Boolean).join("\n")
  const base = defined({ message, statusCode: failure.statusCode, responseBody: failure.responseBody })
  if (isOverflow(searchable)) return { type: "context_overflow", ...base }
  if (failure.statusCode === 413 || isPayloadTooLarge(searchable)) return { type: "payload_too_large", ...base }
  return { type: "api_error", ...base, isRetryable: failure.isRetryable ?? RETRYABLE_STATUS(failure.statusCode) }
}

/** A provider error event inside a stream body (`{"type":"error","error":{...}}`), or plain text that says the same. */
export const parseStreamError = (input: string): { readonly type: "context_overflow" | "payload_too_large"; readonly message: string } | undefined => {
  try {
    const body = JSON.parse(input)
    if (body?.type !== "error") return undefined
    switch (body?.error?.code) {
      case "context_length_exceeded":
      case "token_limit_exceeded":
      case "max_tokens_exceeded":
      case "prompt_too_long":
      case "input_too_long":
        return { type: "context_overflow", message: body.error.message || "Context limit exceeded" }
      case "insufficient_quota":
      case "rate_limit_exceeded":
      case "authentication_error":
        return undefined
      default:
        if (body?.error?.message && isOverflow(body.error.message)) return { type: "context_overflow", message: body.error.message }
        if (isPayloadTooLarge(body?.error?.message ?? "") || isPayloadTooLarge(body?.error?.type ?? "") || isPayloadTooLarge(body?.error?.code ?? "")) {
          return { type: "payload_too_large", message: body.error.message || "Payload too large" }
        }
        return undefined
    }
  } catch {
    if (isOverflow(input)) return { type: "context_overflow", message: input }
    if (isPayloadTooLarge(input)) return { type: "payload_too_large", message: input }
    return undefined
  }
}

export const isContextOverflowError = (error: unknown): boolean => {
  if (error instanceof Error) {
    if (error.name === "ContextOverflowError" || error.name === "MessageContextOverflowError") return true
    return isOverflow(error.message)
  }
  if (typeof error === "string") return isOverflow(error)
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return isOverflow(message)
    const data = (error as { data?: { type?: unknown } }).data
    if (typeof data === "object" && data?.type === "context_overflow") return true
  }
  return false
}

export const formatOverflowMessage = (providerId: string, modelId?: string): string =>
  [
    ...(providerId ? [`Provider: ${providerId}`] : []),
    ...(modelId ? [`Model: ${modelId}`] : []),
    "The conversation has exceeded the model's context limit.",
    "Consider:",
    "  - Letting the assistant summarise the conversation (it does so on its own when the window fills)",
    "  - Starting a new conversation",
    "  - Using a model with a larger context window"
  ].join("\n")
