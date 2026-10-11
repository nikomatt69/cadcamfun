import type { AiStreamEvent } from "@cadcamfun/api"

/** Shared wire contract, erased from the native bundle; unknown future frames remain forward-compatible. */
export type ChatEvent = AiStreamEvent | { type: string; [key: string]: unknown }

/** Incremental SSE framing, including CRLF split across network chunks and standalone CR. */
export const sseParser = <T>(): ((chunk: string) => T[]) => {
  let line = ""
  let data: string[] = []
  let frameChars = 0
  let lastWasCR = false
  let first = true
  return (chunk) => {
    const events: T[] = []
    const finishLine = () => {
      if (line === "") {
        if (data.length) {
          try { events.push(JSON.parse(data.join("\n")) as T) } catch { /* Ignore malformed frames. */ }
        }
        data = []
        frameChars = 0
      } else if (line.startsWith("data:")) {
        frameChars += line.length
        if (frameChars > 8_000_500) throw new Error("Desktop stream frame exceeds the size limit")
        data.push(line.slice(5).replace(/^ /, ""))
      }
      line = ""
    }
    for (const char of chunk) {
      if (first) { first = false; if (char === "\uFEFF") continue }
      if (char === "\n" && lastWasCR) { lastWasCR = false; continue }
      lastWasCR = char === "\r"
      if (char === "\n" || char === "\r") finishLine()
      else {
        line += char
        if (line.length > 8_000_500) throw new Error("Desktop stream frame exceeds the size limit")
      }
    }
    return events
  }
}
