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
import { batch, createEffect, createMemo, createRoot, createSignal, onCleanup, type Accessor, type Setter } from "solid-js"
import { useApp } from "../state/context.ts"
import { streamChat, type StreamHandle } from "./stream.ts"
import { buildSuggestions, type Suggestion } from "./suggestions.ts"
import { loadPersisted, savePersisted } from "./persisted.ts"
import { useDocumentStore } from "../cad/store/documentStore.ts"
import { useElementsStore } from "../cad/store/elementsStore.ts"
import { useLayerStore } from "../cad/store/layerStore.ts"
import { useSelectionStore } from "../cad/store/selectorStore.ts"
import { useCamStore } from "../cam/store/camStore.ts"
import { useGeneratorStore } from "../cam/store/generatorStore.ts"
import { useVerifyStore } from "../cam/store/verifyStore.ts"
import { appProjectId, persistDrawingContext, prepareWorkspace, verificationState } from "./drawing-context.ts"
import { mirrorCamResult } from "./cam-sync.ts"
import { mirrorToolResult, reconcileFromStored } from "./editor-sync.ts"
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
  const [projectContextRevision, setProjectContextRevision] = createSignal(0)

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
  let activeAssistantId: string | undefined

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

  const projectId = (): string | undefined => appProjectId(app)

  const applyEvent = (event: AiEvent): void => {
    const idForEvent = activeAssistantId ?? `${event.sessionId}:assistant`
    if (event.type === "delta") {
      const id = idForEvent
      const exists = messages().some((m) => m.id === id)
      if (!exists) {
        appendMessage({ id, role: "assistant", text: event.text, createdAt: new Date().toISOString(), events: [], status: "streaming" })
      } else {
        patchMessage(id, (prev) => ({ ...prev, text: prev.text + event.text, events: [...prev.events, event] }))
      }
      return
    }
    if (event.type === "tool_call") {
      const id = idForEvent
      setToolCalls((current) => ({ ...current, [event.callId]: { tool: event.tool, input: event.input, status: "running", sessionId: event.sessionId } }))
      patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      setStats((s) => ({ ...s, toolCalls: s.toolCalls + 1 }))
      return
    }
    if (event.type === "tool_result") {
      // The CAD tools ran in the sidecar: show their result in the editor the user has open.
      try { mirrorToolResult(event.tool, event.ok, event.output) } catch (cause) { console.error("Could not mirror the tool result into the editor", cause) }
      // Whatever the tool answered, the stored drawing is the truth: bring the editor in line with it.
      if (event.ok && event.tool.includes("cad_")) void reconcileFromStored(app).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
      if (event.ok) void mirrorCamResult(app, event.tool, toolCalls()[event.callId]?.input, event.output)
      const id = idForEvent
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
      const id = idForEvent
      patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "done") {
      const id = idForEvent
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
      const id = idForEvent
      if (messages().some((m) => m.id === id)) {
        patchMessage(id, (prev) => ({ ...prev, status: "error", error: event.message }))
      } else {
        appendMessage({ id, role: "assistant", text: event.message, createdAt: new Date().toISOString(), events: [], status: "error", error: event.message })
      }
      setError(event.message)
    }
  }

  // The assistant's context follows the workspace: elements, selection, layers, generator, program and verification.
  const liveElements = useElementsStore()
  const liveSelection = useSelectionStore()
  const liveLayers = useLayerStore()
  const liveCam = useCamStore()
  const liveGenerator = useGeneratorStore()
  const liveVerify = useVerifyStore()
  const liveDocument = useDocumentStore()
  createEffect(() => {
    void liveElements.elements
    void liveSelection.selectedElementIds
    void liveLayers.layers
    void liveCam.gcode
    void liveCam.program
    void liveGenerator.settings
    void liveVerify.report
    void liveDocument.projectId
    app.tool()
    projectContextRevision()
    const project = projectId()
    if (!project) return
    const timer = setTimeout(() => {
      void persistDrawingContext(app).catch(() => undefined)
    }, 250)
    onCleanup(() => clearTimeout(timer))
  })

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
    const assistantId = nextMessageId()
    activeAssistantId = assistantId
    appendMessage({ id: assistantId, role: "assistant", text: "", createdAt: at, events: [], status: "streaming" })
    batch(() => {
      setStatus("connecting")
      setError(undefined)
    })
    // One document for the editor and the tools: make sure it exists and holds what is on screen. Never a reason to refuse
    // the message: if the sidecar is slow the tools still create what they need.
    let activeProjectId = projectId()
    try {
      const workspace = await prepareWorkspace(app)
      activeProjectId = workspace.projectId
      if (includeContext()) {
        await persistDrawingContext(app, workspace.projectId)
        setProjectContextRevision((revision) => revision + 1)
      }
    } catch (cause) {
      console.error("Could not prepare the workspace for the assistant", cause)
    }
    const m = modelSig()
    handle = streamChat({
      client: app.client,
      runtime: app.runtime,
      onEvent: applyEvent,
      onError: (message) => {
        setError(message)
        setStatus("error")
      },
      onDone: () => finishStream(status() === "error" ? "error" : "idle")
    }, {
      message: text,
      sessionId: sid,
      ...(activeProjectId ? { projectId: activeProjectId } : {}),
      ...(m ? { model: m } : {}),
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

  const replyPermission: AiStore["replyPermission"] = async (requestId, decision) => {
    const permission = permissions().find((item) => item.requestId === requestId)
    if (!permission) return
    await app.runtime.run(app.client.ai.permissionReply({
      payload: { sessionId: permission.sessionId, requestId, decision }
    }))
    setPermissions((current) => current.filter((item) => item.requestId !== requestId))
  }

  const suggestions = createMemo<ReadonlyArray<Suggestion>>(() => {
    void dismissedSuggestions()
    void liveVerify.report
    const verification = verificationState()
    const built = buildSuggestions({
      entityCount: liveElements.elements.length,
      selectedCount: liveSelection.selectedElementIds.length,
      activeTool: app.tool(),
      layers: liveLayers.layers.length,
      hasGcode: liveCam.gcode.trim() !== "",
      verification: verification.state
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
