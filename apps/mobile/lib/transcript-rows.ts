import type { ChatRow } from "./chat-log"

/**
 * Transcript layout (nikcli: transcript-rows + ToolRunGroup, CADCAMFUN domain).
 *
 * The folded ChatRow list says what happened; this decides how it is laid out: every item gets an id that stays the
 * same while the conversation grows (list rows are recycled and memoized by it), and a run of finished tool calls
 * collapses into one group row so a long CAD/CAM turn reads as its answer, not as forty tool cards.
 */

export type ToolRow = Extract<ChatRow, { kind: "tool" }>

export type TranscriptItem =
  | { readonly kind: "row"; readonly id: string; readonly row: ChatRow }
  | { readonly kind: "tools"; readonly id: string; readonly rows: readonly ToolRow[] }

/** Below this a run is short enough to read in place (nikcli `COLLAPSE_FROM`). */
export const TOOL_RUN_COLLAPSE_FROM = 3

/** Stable per conversation: rows only ever append, or change in place, so the log index names a row for its life. */
const rowId = (row: ChatRow, index: number): string => {
  switch (row.kind) {
    case "tool": return `tool:${row.callId}`
    case "request": return `request:${row.requestId}`
    case "question": return `question:${row.requestId}`
    case "plan": return `plan:${row.sessionId}`
    default: return `${row.kind}:${index}`
  }
}

/**
 * A running tool stays visible on its own, so the user watches the step in progress; settled neighbours group.
 * A group is named after its first call, so it keeps its id while later calls join it.
 */
export function buildTranscript(rows: readonly ChatRow[], collapseFrom = TOOL_RUN_COLLAPSE_FROM): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let run: { start: number; rows: ToolRow[] } | undefined
  const flush = () => {
    if (!run) return
    if (run.rows.length >= collapseFrom) items.push({ kind: "tools", id: `tools:${run.rows[0]!.callId}`, rows: run.rows })
    else run.rows.forEach((row, offset) => items.push({ kind: "row", id: rowId(row, run!.start + offset), row }))
    run = undefined
  }
  rows.forEach((row, index) => {
    if (row.kind === "tool" && row.ok !== null) {
      run ??= { start: index, rows: [] }
      run.rows.push(row)
      return
    }
    flush()
    items.push({ kind: "row", id: rowId(row, index), row })
  })
  flush()
  return items
}

/** One line for a collapsed run: how many calls, which domains, and whether any failed. */
export function toolRunSummary(rows: readonly ToolRow[]): { readonly title: string; readonly failed: number; readonly images: number } {
  const failed = rows.filter((row) => row.ok === false).length
  const images = rows.reduce((count, row) => count + (row.images?.length ?? 0), 0)
  return { title: `${rows.length} tool calls`, failed, images }
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
