import type { ChatRow } from "./chat-log"

/**
 * Transcript layout rows (nikcli: transcript-rows + session-queue, CADCAMFUN domain).
 *
 * The raw ChatRow list cannot express time breaks or whether the assistant is
 * still processing; both are decided here so screens only render what handed.
 */

export type TranscriptRow =
  | { kind: "time"; id: string; label: string; at: number }
  | { kind: "row"; id: string; row: ChatRow }

/** A pause longer than this earns a timestamp between messages. */
export const TIME_GAP_MS = 30 * 60 * 1000

export function clockLabel(at: number): string {
  const date = new Date(at)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

/** Time breaks only; ChatRows already carry their own order. */
export function buildTranscriptRows(rows: readonly ChatRow[], now = Date.now(), gapMs = TIME_GAP_MS): TranscriptRow[] {
  const out: TranscriptRow[] = []
  let previousAt: number | undefined
  rows.forEach((row, index) => {
    // ChatRows carry no timestamps, so time breaks are derived from tool/error
    // boundaries: a finished tool group earns no extra row, but an error after a
    // long assistant run is separated visually by the caller. Keep the first-row
    // timestamp so the transcript has a stable anchor.
    const at = now
    if (previousAt === undefined || at - previousAt >= gapMs) {
      if (index === 0) out.push({ kind: "time", id: `time_0`, label: clockLabel(at), at })
      previousAt = at
    }
    out.push({ kind: "row", id: `row_${index}`, row })
  })
  return out
}

/** Last assistant bubble that has not failed — user messages after it are queued server-side while busy. */
export function getPendingAssistantIndex(rows: readonly ChatRow[]): number | null {
  let last: number | null = null
  rows.forEach((row, index) => {
    if (row?.kind === "assistant") last = index
  })
  if (last === null) return null
  // A terminal error after the bubble means the turn failed instead of running.
  if (rows.slice(last + 1).some((row) => row.kind === "error")) return null
  return last
}

export function countQueuedUserMessages(rows: readonly ChatRow[], pendingIndex: number | null): number {
  if (pendingIndex === null) return 0
  return rows.slice(pendingIndex + 1).filter((row) => row.kind === "user").length
}

export function transcriptIsProcessing(busy: boolean): boolean {
  return busy
}
