/**
 * The AI assistant's local state (sessions, messages, tool calls, permissions).
 *
 * Everything nikcli streams through `/api/ai/chat/stream` lands here, plus the
 * local model selector and the proactive suggestions derived from the current
 * CAD context. The store owns the streams, the abort controller, and the
 * in-flight `running` flag; the components are presentational.
 *
 * Status: spec 06-desktop-ui.md §1 + spec 08-ai.md §3; nikcli is the base (WP8).
 */
import { batch, createMemo, createRoot, createSignal, onCleanup, type Accessor, type Setter } from "solid-js"
import { useApp } from "../state/context.ts"
import { streamChat, type StreamHandle } from "./stream.ts"
import { buildSuggestions, type Suggestion } from "./suggestions.ts"
import { loadPersisted, savePersisted } from "./persisted.ts"
import type { AiEvent, AiMessage, AiPermission, AiSession, AiToolCalls, ChatModel } from "./types.ts"

export interface AiStats {
  readonly exchanges: number
  readonly toolCalls: number
  readonly thinkingSteps: number
  readonly totalInputTokens: number
  readonly totalOutputTokens: number
  readonly totalLatencyMs: number
}

export interface AiStore {
  readonly status: Accessor<"idle" | "connecting" | "streaming" | "error">
  readonly error: Accessor<string | undefined>
  readonly sessionId: Accessor<string | undefined>
  readonly sessions: Accessor<ReadonlyArray<AiSession>>
  readonly messages: Accessor<ReadonlyArray<AiMessage>>
  readonly toolCalls: Accessor<AiToolCalls>
  readonly permissions: Accessor<ReadonlyArray<AiPermission>>
  readonly model: Accessor<ChatModel | undefined>
  readonly setModel: (next: ChatModel | undefined | ((prev: ChatModel | undefined) => ChatModel | undefined)) => void
  readonly includeContext: Accessor<boolean>
  readonly setIncludeContext: (next: boolean | ((prev: boolean) => boolean)) => void
  readonly stats: Accessor<AiStats>
  readonly suggestions: Accessor<ReadonlyArray<Suggestion>>
  readonly dismissSuggestion: (id: string) => void
  readonly projectId: Accessor<string | undefined>
  readonly send: (prompt: string) => Promise<void>
  readonly abort: () => void
  readonly clear: () => void
  readonly newSession: () => void
  readonly replyPermission: (requestId: string, decision: "once" | "always" | "reject") => Promise<void>
}

const MAX_SESSIONS = 50
const MAX_MESSAGES = 500

interface Persisted {
  readonly model: ChatModel | undefined
  readonly includeContext: boolean
  readonly sessions: ReadonlyArray<AiSession>
}

const emptyStats = (): AiStats => ({
  exchanges: 0, toolCalls: 0, thinkingSteps: 0,
  totalInputTokens: 0, totalOutputTokens: 0, totalLatencyMs: 0
})

const newSessionId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto)
  ? `s-${crypto.randomUUID()}`
  : `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

const nextMessageId = (() => {
  let counter = 0
  return () => `m-${Date.now().toString(36)}-${(counter += 1).toString(36)}`
})()

const initial = (): Persisted => ({ model: undefined, includeContext: true, sessions: [] })

export const createAiStore = (): AiStore => createRoot((disposeRoot) => {
  const app = useApp()
  const persistedInitial = loadPersisted<Persisted>(initial())
  const [modelSig, setModelSig] = createSignal<ChatModel | undefined>(persistedInitial.model)
  const [includeContextSig, setIncludeContextSig] = createSignal<boolean>(persistedInitial.includeContext)
  const [sessionsSig, setSessionsSig] = createSignal<ReadonlyArray<AiSession>>(persistedInitial.sessions)
  const persist = (next: Persisted): void => savePersisted(next)

  const [status, setStatus] = createSignal<"idle" | "connecting" | "streaming" | "error">("idle")
  const [error, setError] = createSignal<string | undefined>()
  const [sessionId, setSessionId] = createSignal<string | undefined>()
  const [messages, setMessages] = createSignal<ReadonlyArray<AiMessage>>([])
  const [toolCalls, setToolCalls] = createSignal<AiToolCalls>({})
  const [permissions, setPermissions] = createSignal<ReadonlyArray<AiPermission>>([])
  const [stats, setStats] = createSignal<AiStats>(emptyStats())
  const [dismissedSuggestions, setDismissedSuggestions] = createSignal<ReadonlyArray<string>>([])

  const model: Accessor<ChatModel | undefined> = modelSig
  const setModel = (next: ChatModel | undefined | ((prev: ChatModel | undefined) => ChatModel | undefined)): void => {
    const resolved = typeof next === "function" ? (next as (prev: ChatModel | undefined) => ChatModel | undefined)(modelSig()) : next
    setModelSig(() => resolved)
    persist({ model: resolved, includeContext: includeContextSig(), sessions: sessionsSig() })
  }
  const includeContext: Accessor<boolean> = includeContextSig
  const setIncludeContext = (next: boolean | ((prev: boolean) => boolean)): void => {
    const resolved = typeof next === "function" ? (next as (prev: boolean) => boolean)(includeContextSig()) : next
    setIncludeContextSig(() => resolved)
    persist({ model: modelSig(), includeContext: resolved, sessions: sessionsSig() })
  }
  const sessions: Accessor<ReadonlyArray<AiSession>> = sessionsSig

  const setSessionsPersisted = (next: ReadonlyArray<AiSession>): void => {
    setSessionsSig(() => next)
    persist({ model: modelSig(), includeContext: includeContextSig(), sessions: next })
  }

  let handle: StreamHandle | undefined

  const upsertSession = (id: string, title: string, startedAt: string): void => {
    const next = [{ id, title, startedAt, updatedAt: startedAt, exchanges: 0 }, ...sessionsSig().filter((s) => s.id !== id)].slice(0, MAX_SESSIONS)
    setSessionsPersisted(next)
  }

  const touchSession = (id: string, at: string, exchanges: number): void => {
    const list = sessionsSig().map((s) => s.id === id ? { ...s, updatedAt: at, exchanges: s.exchanges + exchanges } : s)
    setSessionsPersisted(list)
  }

  const appendMessage = (message: AiMessage): void => {
    setMessages((current) => [...current, message].slice(-MAX_MESSAGES))
  }

  const patchMessage = (id: string, patch: (prev: AiMessage) => AiMessage): void => {
    setMessages((current) => current.map((m) => m.id === id ? patch(m) : m))
  }

  const projectId = (): string | undefined => {
    const drawing = app.drawing()
    return drawing ? drawing.id : undefined
  }

  const applyEvent = (event: AiEvent): void => {
    if (event.type === "delta") {
      const id = `${event.sessionId}:assistant`
      const exists = messages().some((m) => m.id === id)
      if (!exists) {
        appendMessage({ id, role: "assistant", text: event.text, createdAt: new Date().toISOString(), events: [], status: "streaming" })
      } else {
        patchMessage(id, (prev) => ({ ...prev, text: prev.text + event.text, events: [...prev.events, event] }))
      }
      return
    }
    if (event.type === "tool_call") {
      const id = `${event.sessionId}:assistant`
      setToolCalls((current) => ({ ...current, [event.callId]: { tool: event.tool, input: event.input, status: "running", sessionId: event.sessionId } }))
      patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      setStats((s) => ({ ...s, toolCalls: s.toolCalls + 1 }))
      return
    }
    if (event.type === "tool_result") {
      const id = `${event.sessionId}:assistant`
      setToolCalls((current) => {
        const existing = current[event.callId]
        if (existing === undefined) return current
        return { ...current, [event.callId]: { ...existing, status: event.ok ? "ok" : "error", output: event.output } }
      })
      patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "permission_request") {
      const permission: AiPermission = { requestId: event.requestId, permission: event.permission, patterns: event.patterns, sessionId: event.sessionId }
      setPermissions((current) => [...current, permission])
      const id = `${event.sessionId}:assistant`
      patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "done") {
      const id = `${event.sessionId}:assistant`
      patchMessage(id, (prev) => ({ ...prev, status: "done", text: event.text || prev.text, usage: event.usage }))
      setStats((s) => ({
        ...s,
        exchanges: s.exchanges + 1,
        totalInputTokens: s.totalInputTokens + (event.usage?.inputTokens ?? 0),
        totalOutputTokens: s.totalOutputTokens + (event.usage?.outputTokens ?? 0)
      }))
      touchSession(event.sessionId, new Date().toISOString(), 1)
      return
    }
    if (event.type === "error") {
      const id = `${event.sessionId}:assistant`
      if (messages().some((m) => m.id === id)) {
        patchMessage(id, (prev) => ({ ...prev, status: "error", error: event.message }))
      } else {
        appendMessage({ id, role: "assistant", text: event.message, createdAt: new Date().toISOString(), events: [], status: "error", error: event.message })
      }
      setError(event.message)
    }
  }

  const finishStream = (next: "idle" | "error"): void => {
    setStatus(next)
    handle = undefined
  }

  const send: AiStore["send"] = async (prompt) => {
    const text = prompt.trim()
    if (text.length === 0 || status() === "connecting" || status() === "streaming") return
    const sid = sessionId() ?? newSessionId()
    const at = new Date().toISOString()
    if (!sessionId()) {
      setSessionId(sid)
      upsertSession(sid, text.slice(0, 60), at)
    }
    const userId = nextMessageId()
    appendMessage({ id: userId, role: "user", text, createdAt: at, events: [], status: "done" })
    const assistantId = `${sid}:assistant`
    appendMessage({ id: assistantId, role: "assistant", text: "", createdAt: at, events: [], status: "streaming" })
    batch(() => {
      setStatus("connecting")
      setError(undefined)
    })
    const ctx = includeContext() ? (() => {
      const d = app.drawing()
      const lines = d.entities.length
      return `Active drawing: ${d.name} (id ${d.id}, ${lines} entities). Active tool: ${app.tool()}.`
    })() : ""
    const m = modelSig()
    handle = streamChat({
      client: app.client,
      runtime: app.runtime,
      onEvent: applyEvent,
      onError: (message) => {
        setError(message)
        setStatus("error")
      },
      onDone: () => finishStream("idle")
    }, {
      message: text,
      sessionId: sid,
      ...(projectId() ? { projectId: projectId()! } : {}),
      ...(m ? { model: m } : {}),
      ...(ctx ? { context: ctx } : {})
    })
    setStatus("streaming")
  }

  const abort: AiStore["abort"] = () => {
    const sid = sessionId()
    if (sid === undefined) return
    handle?.abort()
    handle = undefined
    app.runtime.runVoid(app.client.ai.chatAbort({ payload: { sessionId: sid } }))
    setStatus("idle")
  }

  const clear: AiStore["clear"] = () => {
    if (status() === "streaming") abort()
    batch(() => {
      setMessages([])
      setToolCalls({})
      setPermissions([])
      setStats(emptyStats())
      setError(undefined)
    })
  }

  const newSession: AiStore["newSession"] = () => {
    if (status() === "streaming") abort()
    batch(() => {
      setSessionId(undefined)
      setMessages([])
      setToolCalls({})
      setPermissions([])
      setStats(emptyStats())
      setError(undefined)
    })
  }

  const replyPermission: AiStore["replyPermission"] = async (requestId, _decision) => {
    setPermissions((current) => current.filter((p) => p.requestId !== requestId))
  }

  const suggestions = createMemo<ReadonlyArray<Suggestion>>(() => {
    void dismissedSuggestions()
    const drawing = app.drawing()
    void drawing.entities.length
    void app.tool()
    const built = buildSuggestions({
      entityCount: drawing.entities.length,
      selectedCount: 0,
      activeTool: app.tool(),
      layers: 1
    })
    return built.filter((s: Suggestion) => !dismissedSuggestions().includes(s.id))
  })

  const dismissSuggestion = (id: string): void => {
    setDismissedSuggestions((current) => current.includes(id) ? current : [...current, id])
  }

  onCleanup(() => {
    handle?.abort()
    handle = undefined
    disposeRoot()
  })

  return {
    status, error, sessionId, sessions, messages, toolCalls, permissions,
    model, setModel, includeContext, setIncludeContext, stats, suggestions, dismissSuggestion,
    projectId, send, abort, clear, newSession, replyPermission
  }
})

/** Memoised status pill text for the shell. */
export const statusLabel = (status: "idle" | "connecting" | "streaming" | "error", error: string | undefined): string => {
  if (status === "streaming") return "Thinking"
  if (status === "connecting") return "Connecting"
  if (status === "error") return error ?? "Error"
  return "Idle"
}