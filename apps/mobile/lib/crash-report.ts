/**
 * The recovery screen's facts. The report is pasted into tickets and chats, so it carries what support
 * needs to place a crash (message, where React was rendering, the build) and never user data: bearer
 * tokens and token-like query values an error message may echo are redacted.
 */

/** A render crash can be retried this often before the screen asks for a full close and reopen. */
export const MAX_RESTARTS = 3

export const canRestart = (restartCount: number): boolean => restartCount < MAX_RESTARTS

const redact = (text: string): string => text
  .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
  .replace(/([?&](?:token|access_token|key)=)[^&\s]+/gi, "$1[redacted]")

export const crashReport = (
  error: { name?: string; message?: string; stack?: string },
  componentStack: string | null | undefined,
  build: string,
  platform: string,
  at: Date,
): string => redact([
  `CADCAMFUN ${build} · ${platform} · ${at.toISOString()}`,
  `${error.name ?? "Error"}: ${error.message ?? "Unknown error"}`,
  ...(error.stack ? ["", error.stack.split("\n").slice(0, 12).join("\n")] : []),
  ...(componentStack ? ["", "Components:", componentStack.trim().split("\n").slice(0, 12).join("\n")] : []),
].join("\n"))

/** The one line shown under "Something went wrong": the message, trimmed to what fits a phone. */
export const crashSummary = (message: string): string => {
  const flat = redact(message).replace(/\s+/g, " ").trim()
  if (!flat) return "An unexpected error occurred."
  return flat.length > 240 ? `${flat.slice(0, 237)}…` : flat
}
