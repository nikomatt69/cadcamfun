/**
 * The conversations themselves: the list of them, their text, and the copy the
 * host keeps.
 *
 * The desktop keeps a conversation so it can be reopened after a restart, and the
 * host keeps its own copy of the same conversation. The two are merged here:
 * the local list is the cache, the host's list is the truth about what exists,
 * and a conversation is only replaced when the host says it is newer.
 */
import type { Accessor, Setter } from "solid-js"
import { type AppState } from "../../../shared/state/context.ts"
import { loadTranscripts, saveTranscripts, toStored, type StoredMessage } from "./persisted.ts"
import { serverMessages } from "../lib/server-history.ts"
import type { AiMessage, AiSession, AiToolCall, AiTodo } from "../lib/types.ts"

/** How many conversations the desktop keeps. */
export const MAX_SESSIONS = 50

export interface SessionsContext {
  readonly app: AppState
  readonly sessionId: Accessor<string | undefined>
  readonly projectId: Accessor<string | undefined>
  readonly status: Accessor<"idle" | "connecting" | "streaming" | "error">
  /** The conversation the watch belongs to; a new conversation starts a new one. */
  readonly conversationGeneration: Accessor<number>
  readonly messages: Accessor<ReadonlyArray<AiMessage>>
  readonly setMessages: Setter<ReadonlyArray<AiMessage>>
  readonly setToolCalls: Setter<Readonly<Record<string, AiToolCall>>>
  readonly setPlan: Setter<ReadonlyArray<AiTodo>>
  /** The conversations as they are persisted, across every project. */
  readonly allSessions: Accessor<ReadonlyArray<AiSession>>
  readonly setAllSessions: (next: ReadonlyArray<AiSession>) => void
  /** True once the store is torn down; nothing may touch the host after that. */
  readonly isDisposed: () => boolean
}

export interface Sessions {
  /** The conversations of the project in front of the user, newest first. */
  readonly sessions: Accessor<ReadonlyArray<AiSession>>
  /** Writes the conversation in progress to the local store. */
  readonly saveTranscript: () => void
  readonly upsertSession: (id: string, title: string, startedAt: string, project?: string) => void
  readonly touchSession: (id: string, at: string, exchanges: number) => void
  /** Puts a stored conversation back on screen. Presentation only: it never mirrors a mutation. */
  readonly restoreTranscript: (id: string) => void
  readonly renameSession: (id: string, title: string) => void
  readonly deleteSession: (id: string) => void
  /** Reads the host's copy of a conversation and shows it when it is newer. */
  readonly refreshServerHistory: (id: string) => Promise<void>
  /** Merges the host's list of conversations into the local one. */
  readonly refreshServerSessions: () => Promise<void>
  /** Forgets a conversation locally, without telling the host. */
  readonly forgetLocal: (id: string) => void
  /** The text of every stored conversation, for the transcript export. */
  readonly transcripts: Accessor<Readonly<Record<string, ReadonlyArray<StoredMessage>>>>
  /** Moves a conversation to the id the host gave it. */
  readonly migrateTranscript: (from: string, to: string) => void
  /** Stops the pending reads. */
  readonly dispose: () => void
}

export const createSessions = (ctx: SessionsContext): Sessions => {
  let transcripts: Record<string, ReadonlyArray<StoredMessage>> = { ...loadTranscripts() }
  let historyRead = 0
  let sessionRead = 0
  const historyController = new AbortController()

  const sessions: Accessor<ReadonlyArray<AiSession>> = () => ctx.allSessions().filter((s) => s.projectId === ctx.projectId())

  const saveTranscript = (): void => {
    const id = ctx.sessionId()
    if (id === undefined) return
    transcripts = { ...transcripts, [id]: ctx.messages().flatMap((m) => { const stored = toStored(m); return stored === undefined ? [] : [stored] }) }
    saveTranscripts(transcripts, ctx.allSessions().map((s) => s.id))
  }

  const upsertSession = (id: string, title: string, startedAt: string, project?: string): void => {
    const next = [{ id, title, startedAt, updatedAt: startedAt, exchanges: 0, ...(project !== undefined ? { projectId: project } : {}) }, ...ctx.allSessions().filter((s) => s.id !== id)].slice(0, MAX_SESSIONS)
    ctx.setAllSessions(next)
  }

  const touchSession = (id: string, at: string, exchanges: number): void => {
    ctx.setAllSessions(ctx.allSessions().map((s) => s.id === id ? { ...s, updatedAt: at, exchanges: s.exchanges + exchanges } : s))
  }

  const restoreTranscript = (id: string): void => {
    const restored = (transcripts[id] ?? []).map((m) => ({ ...m, events: m.events ?? [] }))
    ctx.setMessages(restored)
    // Presentation only: never use applyEvent, which mirrors live mutations.
    const calls: Record<string, AiToolCall> = {}
    for (const message of restored) for (const event of message.events) {
      if (event.type === "tool_call") calls[event.callId] = { tool: event.tool, input: event.input, sessionId: event.sessionId, status: "running", ...("agent" in event ? { agent: event.agent } : {}) }
      if (event.type === "tool_result") {
        const call = calls[event.callId]
        calls[event.callId] = { ...(call ?? { tool: event.tool, input: {}, sessionId: event.sessionId }), status: event.ok ? "ok" : "error", output: event.output }
      }
      if (event.type === "todo") ctx.setPlan(event.todos)
    }
    ctx.setToolCalls(calls)
  }

  const refreshServerHistory = async (id: string): Promise<void> => {
    const generation = ctx.conversationGeneration()
    const project = ctx.projectId()
    const request = ++historyRead
    if (!project || ctx.status() === "streaming" || ctx.status() === "connecting") return
    try {
      const page = await ctx.app.runtime.run(ctx.app.client.ai.sessionMessages({ params: { sessionId: id }, query: { limit: "100" } }), { signal: historyController.signal })
      if (ctx.isDisposed() || request !== historyRead || generation !== ctx.conversationGeneration() || ctx.projectId() !== project || ctx.sessionId() !== id || ctx.status() === "streaming" || ctx.status() === "connecting" || page.messages.length === 0) return
      transcripts = { ...transcripts, [id]: serverMessages(page.messages, id).flatMap((message) => { const value = toStored(message); return value ? [value] : [] }) }
      restoreTranscript(id)
      saveTranscripts(transcripts, ctx.allSessions().map((session) => session.id))
    } catch { /* A disconnected host keeps the last locally cached transcript. */ }
  }

  const refreshServerSessions = async (): Promise<void> => {
    const project = ctx.projectId()
    const request = ++sessionRead
    if (!project) return
    try {
      const remote = await ctx.app.runtime.run(ctx.app.client.ai.sessionList({ query: { projectId: project, limit: "100" } }), { signal: historyController.signal })
      if (ctx.isDisposed() || request !== sessionRead || ctx.projectId() !== project) return
      const current = ctx.allSessions()
      const selected = ctx.sessionId()
      const source = remote.find((session) => session.id === selected)
      const cached = current.find((session) => session.id === selected)
      const needsHistory = selected && source && (!transcripts[selected]?.length || Date.parse(source.updatedAt ?? "") > Date.parse(cached?.updatedAt ?? ""))
      const merged = new Map(current.map((session) => [session.id, session]))
      for (const session of remote) {
        const before = merged.get(session.id)
        merged.set(session.id, {
          id: session.id, projectId: project, title: before?.title ?? session.title,
          startedAt: session.createdAt ?? before?.startedAt ?? "1970-01-01T00:00:00.000Z",
          updatedAt: session.updatedAt ?? before?.updatedAt ?? "1970-01-01T00:00:00.000Z", exchanges: before?.exchanges ?? 0
        })
      }
      ctx.setAllSessions([...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_SESSIONS))
      if (needsHistory && selected) await refreshServerHistory(selected)
    } catch { /* The persisted local list remains available offline. */ }
  }

  const renameSession = (id: string, title: string): void => {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 80)
    if (clean === "") return
    ctx.setAllSessions(ctx.allSessions().map((s) => s.id === id ? { ...s, title: clean } : s))
  }

  const forgetLocal = (id: string): void => {
    const { [id]: _removed, ...rest } = transcripts
    transcripts = rest
    saveTranscripts(transcripts, ctx.allSessions().map((s) => s.id))
  }

  const deleteSession = (id: string): void => {
    const session = ctx.allSessions().find((s) => s.id === id)
    if (session === undefined) return
    ctx.setAllSessions(ctx.allSessions().filter((s) => s.id !== id))
    forgetLocal(id)
    // The host forgets the conversation too; failing to reach it leaves nothing to undo locally.
    ctx.app.runtime.runVoid(ctx.app.client.ai.removeSession({ payload: { sessionId: id, ...(session.projectId !== undefined ? { projectId: session.projectId } : {}) } }))
  }

  return {
    sessions,
    saveTranscript,
    upsertSession,
    touchSession,
    restoreTranscript,
    renameSession,
    deleteSession,
    refreshServerHistory,
    refreshServerSessions,
    forgetLocal,
    transcripts: () => transcripts,
    migrateTranscript: (from, to) => {
      const moved = transcripts[from] ?? []
      const { [from]: _dropped, ...rest } = transcripts
      transcripts = { ...rest, [to]: moved }
      saveTranscripts(transcripts, ctx.allSessions().map((session) => session.id))
    },
    dispose: () => historyController.abort()
  }
}
