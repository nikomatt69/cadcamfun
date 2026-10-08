export type ClientErrorReason =
  | "Transport"
  | "UnexpectedStatus"
  | "UnsupportedContentType"
  | "MalformedResponse"
  | "SseEventTooLarge"

export class ClientError extends Error {
  override readonly name = "ClientError"
  constructor(
    readonly reason: ClientErrorReason,
    options?: ErrorOptions,
  ) {
    // The reason alone is not a diagnosis: a caller that only prints error.message
    // (core.setFailed in the GitHub action, and most log sinks) reported a bare
    // "Transport" for connection refused, connection reset, DNS failure and abort
    // alike. Fold the cause in so the message names what actually went wrong.
    const cause = options?.cause
    const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined
    super(detail ? reason + ": " + detail : reason, options)
  }
}
