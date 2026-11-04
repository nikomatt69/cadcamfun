/** An error returned by the companion gateway or detected at its boundary. */
export class CompanionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The gateway's back-off (`retry-after`) in milliseconds, when it sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message)
  }
}
