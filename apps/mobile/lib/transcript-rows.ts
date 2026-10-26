import type { ChatRow } from "./chat-log"
import { toolDomain } from "./tool-identity"

/**
 * Transcript layout (nikcli: transcript-rows + ToolRunGroup, CADCAMFUN domain).
 *
 * The folded ChatRow list says what happened; this decides how it is laid out: every item gets an id that stays the
 * same while the conversation grows (list rows are recycled and memoized by it), and a run of finished tool calls
 * collapses into one group row so a long CAD/CAM turn reads as its answer, not as forty tool cards.
 */

export type ToolRow = Extract<ChatRow, { kind: "tool" }>

export type TranscriptItem =
  /** `startsTurn`: a prompt that follows an answer or a tool run, so it opens a new turn and gets more air above it. */
  | { readonly kind: "row"; readonly id: string; readonly row: ChatRow; readonly startsTurn?: boolean }
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
  const push = (id: string, row: ChatRow) => {
    const previous = items[items.length - 1]
    const startsTurn = row.kind === "user" && previous !== undefined && !(previous.kind === "row" && previous.row.kind === "user")
    items.push({ kind: "row", id, row, ...(startsTurn ? { startsTurn } : {}) })
  }
  let run: { start: number; rows: ToolRow[] } | undefined
  const flush = () => {
    if (!run) return
    if (run.rows.length >= collapseFrom) items.push({ kind: "tools", id: `tools:${run.rows[0]!.callId}`, rows: run.rows })
    else run.rows.forEach((row, offset) => push(rowId(row, run!.start + offset), row))
    run = undefined
  }
  rows.forEach((row, index) => {
    if (row.kind === "tool" && row.ok !== null) {
      run ??= { start: index, rows: [] }
      run.rows.push(row)
      return
    }
    flush()
    push(rowId(row, index), row)
  })
  flush()
  return items
}

/**
 * Whether two items would draw the same thing. `buildTranscript` makes new item objects on every change, but the rows
 * inside them keep their identity unless they changed, so comparing those lets a streaming delta re-render one row
 * instead of the whole conversation.
 */
export function sameItem(a: TranscriptItem, b: TranscriptItem): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.kind !== b.kind) return false
  if (a.kind === "row" && b.kind === "row") return a.row === b.row && a.startsTurn === b.startsTurn
  if (a.kind === "tools" && b.kind === "tools") return a.rows.length === b.rows.length && a.rows.every((row, index) => row === b.rows[index])
  return false
}

export interface ToolRunSummary {
  /** "Ran 5 commands". */
  readonly title: string
  readonly count: number
  readonly failed: number
  readonly images: number
  /** The domains the calls belong to, in order of first use ("CAD", "CAM"): at most three. */
  readonly domains: readonly string[]
}

/** One line for a collapsed run (nikcli: "Ran 5 commands"): how many calls, which domains, and whether any failed. */
export function toolRunSummary(rows: readonly ToolRow[]): ToolRunSummary {
  const failed = rows.filter((row) => row.ok === false).length
  const images = rows.reduce((count, row) => count + (row.images?.length ?? 0), 0)
  const domains = [...new Set(rows.map((row) => toolDomain(row.rawTool, row.tool)))].slice(0, 3)
  return { title: `Ran ${rows.length} ${rows.length === 1 ? "command" : "commands"}`, count: rows.length, failed, images, domains }
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

/** Tool input/output is drawn as one Text; a 100k-character G-code answer would stall the list, so it is clipped until asked for. */
export const TOOL_TEXT_LIMIT = 2000

export function clipText(text: string, limit = TOOL_TEXT_LIMIT): { readonly text: string; readonly clipped: boolean; readonly total: number } {
  if (text.length <= limit) return { text, clipped: false, total: text.length }
  // Never cut a surrogate pair in half: the second half alone renders as a replacement character.
  const cut = /[\uD800-\uDBFF]/.test(text[limit - 1] ?? "") ? limit - 1 : limit
  return { text: text.slice(0, cut), clipped: true, total: text.length }
}
