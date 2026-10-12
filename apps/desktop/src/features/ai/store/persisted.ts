/**
 * Tiny localStorage-backed JSON helper, used by the AI store (spec 06-desktop-ui.md
 * §1; spec 08-ai.md §6 storage rule: nikcli state stays in the project data dir).
 *
 * No third-party storage primitive is needed: the AI store persists at most one
 * small JSON blob per workspace (model choice, included-context flag, recent
 * sessions). `try/catch` keeps the desktop boot path safe when the window has no
 * `localStorage` (Tauri tests, node-side unit tests).
 */
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
 * (role, text, time, attached file names): tool traffic and streaming state are not kept. Bounded in sessions, messages
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
}

export const MAX_TRANSCRIPTS = 20
export const MAX_TRANSCRIPT_MESSAGES = 60
export const MAX_STORED_TEXT = 20_000
const TRANSCRIPTS_KEY = "cadcamfun/ai/transcripts-v1"

export const loadTranscripts = (): Readonly<Record<string, ReadonlyArray<StoredMessage>>> => {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(TRANSCRIPTS_KEY)
    const parsed = raw === null ? {} : JSON.parse(raw)
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, ReadonlyArray<StoredMessage>> : {}
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
export const toStored = (message: { readonly id: string; readonly role: "user" | "assistant" | "system"; readonly text: string; readonly createdAt: string; readonly status: string; readonly error?: string; readonly attachments?: ReadonlyArray<string> }): StoredMessage | undefined =>
  message.status === "done" || message.status === "error"
    ? {
        id: message.id, role: message.role, text: message.text.slice(0, MAX_STORED_TEXT), createdAt: message.createdAt,
        status: message.status, ...(message.error !== undefined ? { error: message.error } : {}),
        ...(message.attachments !== undefined ? { attachments: message.attachments } : {})
      }
    : undefined
