/**
 * Conversation history for the phone (spec 13 §5): the nikcli mobile session list and session detail, on CADCAMFUN
 * contracts. The host keeps the messages; this module turns its records into bounded wire rows and pages them.
 *
 * Pure: the handlers fetch from the host and the owner records, these functions shape and bound what goes on the wire.
 */
import type { AiSessionMessage, AiSessionSummary, AiSessionTool } from "@cadcamfun/api"

/** Characters of message text one row carries; a longer answer is cut and marked `truncated`. */
export const HISTORY_TEXT_LIMIT = 32_000
/** Characters of one tool's output in the history (the live stream and `sessions/state` carry the full result). */
export const HISTORY_TOOL_OUTPUT_LIMIT = 8_000
/** Characters of a tool's JSON arguments; larger arguments are left out. */
export const HISTORY_TOOL_INPUT_LIMIT = 4_000
/** Host messages read at most to find one page; older history is beyond the phone's reach. */
export const HISTORY_SCAN_LIMIT = 2_000

/** A host message as the nikcli SDK returns it; every field is read defensively, the pinned host adds fields over time. */
export interface HostHistoryMessage {
  readonly info: {
    readonly id: string
    readonly role: string
    readonly summary?: boolean
    readonly agent?: string
    readonly error?: { readonly name?: string; readonly data?: { readonly message?: string } }
    readonly model?: { readonly providerID?: string; readonly modelID?: string }
    readonly [key: string]: unknown
  }
  readonly parts: ReadonlyArray<{ readonly type: string; readonly text?: string; readonly tool?: string; readonly callID?: string; readonly state?: unknown; readonly [key: string]: unknown }>
}

export interface HostHistorySession {
  readonly id: string
  readonly parentID?: string
  readonly title: string
  readonly [key: string]: unknown
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const iso = (value: unknown): string | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null

const timeOf = (value: unknown, key: "created" | "updated" | "completed"): string | null => iso(record(record(value)?.["time"])?.[key])

/** What the transcript shows: neither compaction summaries nor turns made only of synthetic continuation text. */
export const isVisibleMessage = (message: HostHistoryMessage): boolean => {
  if (message.info.summary === true || message.info.agent === "compaction") return false
  if (message.info.role !== "user" && message.info.role !== "assistant") return false
  const synthetic = message.parts.length > 0 && message.parts.every((part) => part.type === "text" && part["synthetic"] === true)
  return !(message.info.role === "user" && synthetic)
}

const cut = (value: string, limit: number): { text: string; truncated: boolean } =>
  value.length > limit ? { text: `${value.slice(0, limit)}…`, truncated: true } : { text: value, truncated: false }

const toolStatus = (value: unknown): AiSessionTool["status"] =>
  value === "running" || value === "completed" || value === "error" ? value : "pending"

const toolOf = (part: HostHistoryMessage["parts"][number]): AiSessionTool | undefined => {
  if (part.type !== "tool" || typeof part.tool !== "string" || part.tool === "" || typeof part.callID !== "string") return undefined
  const state = record(part.state)
  const status = toolStatus(state?.["status"])
  const raw = status === "error" ? state?.["error"] : state?.["output"]
  const output = cut(typeof raw === "string" ? raw : raw === undefined ? "" : JSON.stringify(raw) ?? "", HISTORY_TOOL_OUTPUT_LIMIT)
  const input = state?.["input"]
  let encoded: string | undefined
  try { encoded = JSON.stringify(input) } catch { encoded = undefined }
  const keep = input !== undefined && encoded !== undefined && encoded.length <= HISTORY_TOOL_INPUT_LIMIT
  return {
    callId: part.callID, tool: part.tool, status, output: output.text,
    ...(keep ? { input } : {}),
    truncated: output.truncated || (input !== undefined && !keep),
  }
}

const modelOf = (info: HostHistoryMessage["info"]): string | null => {
  const provider = info.model?.providerID ?? (typeof info["providerID"] === "string" ? info["providerID"] : undefined)
  const model = info.model?.modelID ?? (typeof info["modelID"] === "string" ? info["modelID"] : undefined)
  return model ? (provider ? `${provider}/${model}` : model) : null
}

/** One host message as a bounded history row. */
export const historyMessage = (message: HostHistoryMessage): AiSessionMessage => {
  const text = cut(message.parts.filter((part) => part.type === "text" && part["synthetic"] !== true).map((part) => part.text ?? "").join(""), HISTORY_TEXT_LIMIT)
  const tools = message.parts.flatMap((part) => { const tool = toolOf(part); return tool ? [tool] : [] })
  const error = message.info.error?.data?.message ?? message.info.error?.name ?? null
  return {
    id: message.info.id,
    role: message.info.role === "user" ? "user" : "assistant",
    text: text.text,
    createdAt: timeOf(message.info, "created"),
    agent: typeof message.info.agent === "string" ? message.info.agent : null,
    model: modelOf(message.info),
    error,
    truncated: text.truncated || tools.some((tool) => tool.truncated),
    tools,
  }
}

export type HistoryPage =
  | { readonly ok: true; readonly messages: readonly AiSessionMessage[]; readonly before: string | null }
  /** `before` is not in the window read; `exhausted` when the window already holds the whole conversation. */
  | { readonly ok: false; readonly exhausted: boolean }

/**
 * The page of `limit` visible messages ending just before `before` (or the newest ones), from a window of the newest host
 * messages in chronological order. `complete` says the window is the whole conversation, so the page that starts at its
 * first message is the first page (`before: null`).
 */
export const historyPage = (window: readonly HostHistoryMessage[], complete: boolean, limit: number, before?: string): HistoryPage => {
  const visible = window.filter(isVisibleMessage)
  let end = visible.length
  if (before !== undefined) {
    // An anchor the client got from a page is a visible message; a hidden one (a compaction summary) anchors as well.
    const anchor = window.findIndex((message) => message.info.id === before)
    if (anchor < 0) return { ok: false, exhausted: complete }
    end = visible.filter((message) => window.indexOf(message) < anchor).length
  }
  const start = Math.max(0, end - limit)
  const page = visible.slice(start, end)
  const older = start > 0 || !complete
  return { ok: true, messages: page.map(historyMessage), before: older && page.length > 0 ? page[0]!.info.id : null }
}

/**
 * The project's conversations the caller owns, newest first: the owner records decide what is listed, the host gives
 * titles and times. Without a host (direct mode) an owned session is listed with a neutral title.
 */
export const sessionSummaries = (input: {
  readonly projectId: string
  readonly owned: ReadonlyArray<{ readonly sessionId: string; readonly createdAt: number }>
  readonly hosted: ReadonlyArray<HostHistorySession> | undefined
  readonly busy: (sessionId: string) => boolean
  readonly limit: number
}): AiSessionSummary[] => {
  const hosted = input.hosted ? new Map(input.hosted.filter((session) => !session.parentID).map((session) => [session.id, session])) : undefined
  const rows: AiSessionSummary[] = []
  for (const owned of input.owned) {
    const session = hosted?.get(owned.sessionId)
    // The host no longer has it (removed there): nothing to open.
    if (hosted && !session) continue
    const createdAt = timeOf(session, "created") ?? iso(owned.createdAt)
    rows.push({
      id: owned.sessionId,
      projectId: input.projectId,
      title: session?.title?.trim() ? session.title : "Conversation",
      createdAt,
      updatedAt: timeOf(session, "updated") ?? createdAt,
      busy: input.busy(owned.sessionId),
    })
  }
  rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
  return rows.slice(0, input.limit)
}
