import { CompanionError } from "./client"

/** True when the send failed because the desktop is unreachable (not HTTP/business errors). */
export function isOfflineSendError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof CompanionError) return error.status === 0
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return message.includes("network request failed") || message.includes("failed to fetch")
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes("request to") && message.includes("failed with")) return false
    return (
      message.includes("network request failed") ||
      message.includes("failed to fetch") ||
      message.includes("network error") ||
      message.includes("cannot reach the desktop") ||
      message.includes("did not respond") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("could not connect") ||
      message.includes("connection refused") ||
      message.includes("internet connection") ||
      message.includes("offline")
    )
  }
  return false
}
