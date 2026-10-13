/**
 * Tiny localStorage-backed JSON helper, used by the AI store (spec 06-desktop-ui.md
 * §1; spec 08-ai.md §6 storage rule: nikcli state stays in the project data dir).
 *
 * No third-party storage primitive is needed: the AI store persists at most one
 * small JSON blob per workspace (model choice, included-context flag, recent
 * sessions). `try/catch` keeps the desktop boot path safe when the window has no
 * `localStorage` (Tauri tests, node-side unit tests).
 */
import { decodeEvent } from "../lib/stream.ts"
import type { AiEvent, AiSession, ChatModel } from "../lib/types.ts"

export interface PersistedState {
  readonly model: ChatModel | undefined
  readonly includeContext: boolean
  readonly sessions: ReadonlyArray<AiSession>
  readonly activeByProject?: Readonly<Record<string, string>>
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const loadAiState = (): PersistedState => {
  const value = loadPersisted<unknown>({})
  if (!record(value)) return { model: undefined, includeContext: true, sessions: [] }
  const sessions = (Array.isArray(value.sessions) ? value.sessions : []).filter((s): s is AiSession => record(s) && typeof s.id === "string" && typeof s.title === "string" && typeof s.startedAt === "string" && typeof s.updatedAt === "string" && typeof s.exchanges === "number" && Number.isFinite(s.exchanges) && (s.projectId === undefined || typeof s.projectId === "string")).slice(0, 50)
  const model = record(value.model) && typeof value.model.provider === "string" && typeof value.model.model === "string" ? { provider: value.model.provider, model: value.model.model, ...(typeof value.model.variant === "string" ? { variant: value.model.variant } : {}) } : undefined
  const activeByProject = Object.fromEntries(record(value.activeByProject) ? Object.entries(value.activeByProject).filter((entry): entry is [string, string] => typeof entry[1] === "string" && sessions.some((s) => s.id === entry[1] && (s.projectId ?? "") === entry[0])) : [])
  return { model, includeContext: value.includeContext !== false, sessions, activeByProject }
}

export const loadPersisted = <A,>(fallback: A): A => {
  if (typeof localStorage === "undefined") return fallback
  try {
    const raw = localStorage.getItem("cadcamfun/ai/store-v1")
    if (raw === null) return fallback
    return JSON.parse(raw) as A
  } catch {
    return fallback
  }
}

export const savePersisted = (value: unknown): void => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem("cadcamfun/ai/store-v1", JSON.stringify(value))
  } catch {
    // quota / private mode — silently drop. The store keeps the in-memory copy.
  }
}

/**
 * The text of each conversation, kept so a session can be reopened after a restart. Only what is needed to read it again
 * (role, text, time, attached file names and completed tool evidence): pending decisions and streaming state are not kept. Bounded in sessions, messages
 * and size, oldest sessions first out.
 */
export interface StoredMessage {
  readonly id: string
  readonly role: "user" | "assistant" | "system"
  readonly text: string
  readonly createdAt: string
  readonly status: "done" | "error"
  readonly error?: string
  readonly attachments?: ReadonlyArray<string>
  readonly events?: ReadonlyArray<AiEvent>
  /** When the answer ended and what it cost: the turn footer reads both, so a restored conversation keeps them. */
  readonly finishedAt?: string
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number }
}

export const MAX_TRANSCRIPTS = 20
export const MAX_TRANSCRIPT_MESSAGES = 60
export const MAX_STORED_TEXT = 20_000
const TRANSCRIPTS_KEY = "cadcamfun/ai/transcripts-v1"
const MAX_EVENTS = 100
const MAX_EVENT_SIZE = 20_000
const evidence = (values: ReadonlyArray<unknown>): ReadonlyArray<AiEvent> => {
  const decoded = values.slice(-MAX_EVENTS).flatMap((value) => {
    try {
      const json = JSON.stringify(value)
      if (json.length > MAX_EVENT_SIZE) return []
      const event = decodeEvent(json)
      return event.type === "tool_call" || event.type === "tool_result" || event.type === "tool_diagnostic" || event.type === "todo" ? [event] : []
    } catch { return [] }
  })
  const completed = new Set(decoded.flatMap((e) => e.type === "tool_result" ? [e.callId] : []))
  return decoded.filter((e) => e.type !== "tool_call" || completed.has(e.callId))
}

export const loadTranscripts = (): Readonly<Record<string, ReadonlyArray<StoredMessage>>> => {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(TRANSCRIPTS_KEY)
    const parsed = raw === null ? {} : JSON.parse(raw)
    if (!record(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).slice(0, MAX_TRANSCRIPTS).map(([id, values]) => [id, (Array.isArray(values) ? values : []).slice(-MAX_TRANSCRIPT_MESSAGES).flatMap((m) => {
      if (!record(m) || typeof m.id !== "string" || !["user", "assistant", "system"].includes(String(m.role)) || typeof m.text !== "string" || typeof m.createdAt !== "string" || (m.status !== "done" && m.status !== "error")) return []
      const message: StoredMessage = { id: m.id, role: m.role as StoredMessage["role"], text: m.text.slice(0, MAX_STORED_TEXT), createdAt: m.createdAt, status: m.status, events: evidence(Array.isArray(m.events) ? m.events : []), ...(typeof m.error === "string" ? { error: m.error.slice(0, MAX_STORED_TEXT) } : {}), ...(Array.isArray(m.attachments) ? { attachments: m.attachments.filter((a): a is string => typeof a === "string").slice(0, 20) } : {}), ...(typeof m.finishedAt === "string" ? { finishedAt: m.finishedAt } : {}), ...(record(m.usage) && Number.isFinite(m.usage.inputTokens) && Number.isFinite(m.usage.outputTokens) ? { usage: { inputTokens: Number(m.usage.inputTokens), outputTokens: Number(m.usage.outputTokens) } } : {}) }
      return [message]
    })]))
  } catch {
    return {}
  }
}

/** `order` is the sessions newest first; transcripts of sessions beyond the limit are dropped. */
export const saveTranscripts = (all: Readonly<Record<string, ReadonlyArray<StoredMessage>>>, order: ReadonlyArray<string>): void => {
  if (typeof localStorage === "undefined") return
  const kept: Record<string, ReadonlyArray<StoredMessage>> = {}
  for (const id of order.slice(0, MAX_TRANSCRIPTS)) {
    const messages = all[id]
    if (messages !== undefined) kept[id] = messages.slice(-MAX_TRANSCRIPT_MESSAGES)
  }
  try {
    localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(kept))
  } catch {
    // quota / private mode: the in-memory conversation is unaffected.
  }
}

/** Only finished messages, text clipped. */
export const toStored = (message: { readonly id: string; readonly role: "user" | "assistant" | "system"; readonly text: string; readonly createdAt: string; readonly status: string; readonly error?: string; readonly attachments?: ReadonlyArray<string>; readonly events?: ReadonlyArray<AiEvent>; readonly finishedAt?: string; readonly usage?: { readonly inputTokens: number; readonly outputTokens: number } }): StoredMessage | undefined =>
  message.status === "done" || message.status === "error"
    ? {
        id: message.id, role: message.role, text: message.text.slice(0, MAX_STORED_TEXT), createdAt: message.createdAt,
        status: message.status, events: evidence(message.events ?? []), ...(message.error !== undefined ? { error: message.error.slice(0, MAX_STORED_TEXT) } : {}),
        ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
        ...(message.finishedAt !== undefined ? { finishedAt: message.finishedAt } : {}),
        ...(message.usage !== undefined ? { usage: message.usage } : {})
      }
    : undefined
