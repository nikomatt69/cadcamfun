/**
 * The AI assistant's local state (sessions, messages, tool calls, permissions).
 *
 * Everything nikcli streams through `/api/ai/chat/stream` lands here, plus the
 * local model selector and the proactive suggestions derived from the current
 * CAD context. The store owns the streams, the abort controller, and the
 * in-flight `running` flag; the components are presentational.
 *
 * The store is a composition root, not a monolith: the three concerns that used
 * to be interleaved inside it now live in modules of their own, each with its
 * own interface:
 *
 *  - `events.ts` — what one streamed event does to the conversation;
 *  - `tasks.ts` — the background jobs that outlive their turn;
 *  - `controls.ts` — the commands the host's own session answers;
 *  - `sessions.ts` — the conversations, their text, and the host's copy.
 *
 * Status: spec 06-desktop-ui.md §1 + spec 08-ai.md §3; nikcli is the base (WP8).
 */
import { batch, createEffect, createMemo, createRoot, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import { useApp } from "../../../shared/state/context.ts"
import { startVisionBridge } from "../lib/vision.ts"
import { streamChat, type StreamHandle } from "../lib/stream.ts"
import { buildSuggestions, type Suggestion } from "../lib/suggestions.ts"
import { loadAiState, savePersisted } from "./persisted.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useLayerStore } from "../../cad/store/layerStore.ts"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"
import { useCamStore } from "../../cam/store/camStore.ts"
import { useGeneratorStore } from "../../cam/store/generatorStore.ts"
import { useVerifyStore } from "../../cam/store/verifyStore.ts"
import { persistDrawingContext, prepareWorkspace, verificationState } from "../lib/drawing-context.ts"
import { createEventApplier, nextMessageId } from "./events.ts"
import { createTaskWatcher } from "./tasks.ts"
import { createControls } from "./controls.ts"
import { createSessions } from "./sessions.ts"
import { captureEditorOwner } from "../lib/editor-sync.ts"
import { sanitizeError } from "../lib/errors.ts"
import type { ChatAttachment } from "../lib/attachments.ts"
import { serverMessages } from "../lib/server-history.ts"
import { onCacheInvalidated } from "../../../shared/state/queries.ts"
import { t } from "../../../i18n/index.ts"
import type { AiActivity, AiAgent, AiContextState, AiEvent, AiGoal, AiMessage, AiMode, AiPermission, AiPendingQuestion, AiSession, AiStats, AiTask, AiTodo, AiToolCalls, ChatModel } from "../lib/types.ts"

export type { AiPending, AiStats, PendingDelivery } from "../lib/types.ts"
import type { AiPending, PendingDelivery } from "../lib/types.ts"

export interface AiStore {
  readonly status: Accessor<"idle" | "connecting" | "streaming" | "error">
  readonly error: Accessor<string | undefined>
  readonly sessionId: Accessor<string | undefined>
  readonly sessions: Accessor<ReadonlyArray<AiSession>>
  readonly messages: Accessor<ReadonlyArray<AiMessage>>
  readonly toolCalls: Accessor<AiToolCalls>
  readonly permissions: Accessor<ReadonlyArray<AiPermission>>
  /** The agent's plan (its todo list) for the conversation. */
  readonly plan: Accessor<ReadonlyArray<AiTodo>>
  /** The goal the agent is working toward, when it set one. */
  readonly goal: Accessor<AiGoal | undefined>
  /** What the agent is doing now: step, a tool being written, a retry, a compaction. */
  readonly activity: Accessor<AiActivity>
  /** The jobs handed to specialist agents in this conversation, background ones included, live. */
  readonly tasks: Accessor<ReadonlyArray<AiTask>>
  readonly model: Accessor<ChatModel | undefined>
  readonly setModel: (next: ChatModel | undefined | ((prev: ChatModel | undefined) => ChatModel | undefined)) => void
  readonly includeContext: Accessor<boolean>
  readonly setIncludeContext: (next: boolean | ((prev: boolean) => boolean)) => void
  readonly stats: Accessor<AiStats>
  /** Tokens of the latest model call: what the next call resends, i.e. the live context occupancy. */
  readonly contextTokens: Accessor<number>
  readonly suggestions: Accessor<ReadonlyArray<Suggestion>>
  readonly dismissSuggestion: (id: string) => void
  readonly projectId: Accessor<string | undefined>
  /**
   * Sends a message. While the agent works it is handed to the running turn instead (nikcli's prompt box does the same):
   * `queue` is taken in at the next safe step, `steer` at once; attachments only go with a message that starts a turn.
   */
  readonly send: (prompt: string, attachments?: ReadonlyArray<ChatAttachment>, delivery?: PendingDelivery) => Promise<void>
  /** Messages written while the agent works that it has not taken in yet. */
  readonly pending: Accessor<ReadonlyArray<AiPending>>
  readonly abort: () => void
  readonly clear: () => void
  readonly newSession: () => void
  /** Reopens a conversation (its text comes back from this device; the host keeps its own context while it runs). */
  readonly openSession: (id: string) => void
  readonly renameSession: (id: string, title: string) => void
  readonly deleteSession: (id: string) => void
  readonly replyPermission: (requestId: string, decision: "once" | "always" | "reject") => Promise<void>
  readonly agents: Accessor<ReadonlyArray<AiAgent>>
  readonly permissionMode: Accessor<"auto" | "ask" | "approve">
  readonly setPermissionMode: (mode: "auto" | "ask" | "approve") => void
  readonly agent: Accessor<string>
  readonly setAgent: (agent: string) => void
  readonly mode: Accessor<string>
  readonly setMode: (mode: string) => void
  /** The modes enabled plugins contribute; the picker offers them beside the built-ins. */
  readonly pluginModes: Accessor<ReadonlyArray<AiMode>>
  /** Re-reads the contributed modes; the extensions panel calls it after a plugin is toggled. */
  readonly refreshModes: () => void
  readonly questions: Accessor<ReadonlyArray<AiPendingQuestion>>
  readonly hostContext: Accessor<AiContextState | undefined>
  readonly controlBusy: Accessor<boolean>
  readonly controlError: Accessor<string | undefined>
  readonly refreshControls: () => Promise<void>
  /** Asks the host where the context tokens go (nikcli `SessionContext.breakdown`); the answer lands in `hostContext().breakdown`. */
  readonly loadContextBreakdown: () => Promise<void>
  readonly consolidateMemory: () => Promise<void>
  readonly compact: () => Promise<void>
  readonly cancelTask: (id: string) => Promise<void>
  readonly replyQuestion: (requestId: string, answers?: ReadonlyArray<ReadonlyArray<string>>) => Promise<void>
  /**
   * Reads the messages before the oldest one on screen, from the host's copy of the conversation.
   * Returns how many were added; zero when there is nothing older.
   */
  readonly loadOlderMessages: () => Promise<number>
  /** True while older messages are being read. */
  readonly loadingOlder: Accessor<boolean>
  /** True when the host holds a conversation older than what is on screen. */
  readonly hasOlderMessages: Accessor<boolean>
  /**
   * Asks the host for a title for the conversation and takes it. The title of a
   * conversation the host does not answer for keeps the words of its first message.
   */
  readonly titleSession: () => Promise<void>
  /** How the user rated each answer, by message id. */
  readonly feedback: Accessor<Readonly<Record<string, "up" | "down">>>
  /** Records how useful an answer was. The host keeps it; the desktop remembers the rating. */
  readonly rateMessage: (messageId: string, rating: "up" | "down", comment?: string) => Promise<void>
  /** Asks the last question again, from the same conversation. */
  readonly regenerate: () => Promise<void>
  /** The prompts the host suggests for the current mode, beside the local ones. */
  readonly hostPrompts: Accessor<ReadonlyArray<string>>
  /** Re-reads the host's suggestions for the current mode. */
  readonly refreshHostPrompts: () => Promise<void>
  /** True while the older messages may still be there. */
  readonly canLoadOlder: Accessor<boolean>
}

interface Persisted {
  readonly model: ChatModel | undefined
  readonly includeContext: boolean
  readonly sessions: ReadonlyArray<AiSession>
  readonly activeByProject?: Readonly<Record<string, string>>
}

const emptyStats = (): AiStats => ({
  exchanges: 0, toolCalls: 0, thinkingSteps: 0,
  totalInputTokens: 0, totalOutputTokens: 0, totalLatencyMs: 0
})

/** How many messages a conversation keeps on screen. */
const MAX_MESSAGES = 500

const newSessionId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto)
  ? `s-${crypto.randomUUID()}`
  : `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

const initial = (): Persisted => ({ model: undefined, includeContext: true, sessions: [] })

export const createAiStore = (): AiStore => {
  let disposeStore: (() => void) | undefined
  const store = createRoot((disposeRoot) => {
  disposeStore = disposeRoot
  const app = useApp()
  const persistedInitial = loadAiState()
   let activeByProject: Record<string, string> = { ...persistedInitial.activeByProject }
  const [modelSig, setModelSig] = createSignal<ChatModel | undefined>(persistedInitial.model)
  const [includeContextSig, setIncludeContextSig] = createSignal<boolean>(persistedInitial.includeContext)
  const [sessionsSig, setSessionsSig] = createSignal<ReadonlyArray<AiSession>>(persistedInitial.sessions)
  const persist = (next: Persisted): void => savePersisted({ ...next, activeByProject })

  const [status, setStatus] = createSignal<"idle" | "connecting" | "streaming" | "error">("idle")
  const [error, setError] = createSignal<string | undefined>()
  const [sessionId, setSessionId] = createSignal<string | undefined>()
  const [messages, setMessages] = createSignal<ReadonlyArray<AiMessage>>([])
  const [toolCalls, setToolCalls] = createSignal<AiToolCalls>({})
  const [permissions, setPermissions] = createSignal<ReadonlyArray<AiPermission>>([])
  const [plan, setPlan] = createSignal<ReadonlyArray<AiTodo>>([])
  const [goal, setGoal] = createSignal<AiGoal | undefined>()
  const [activity, setActivity] = createSignal<AiActivity>({ step: 0, compacted: false })
  const [tasks, setTasks] = createSignal<ReadonlyArray<AiTask>>([])
  const [pending, setPending] = createSignal<ReadonlyArray<AiPending>>([])
  const [stats, setStats] = createSignal<AiStats>(emptyStats())
  const [contextTokens, setContextTokens] = createSignal(0)
  const [agents, setAgents] = createSignal<ReadonlyArray<AiAgent>>([])
  const [pluginModes, setPluginModes] = createSignal<ReadonlyArray<AiMode>>([])
  const [permissionMode, setPermissionMode] = createSignal<"auto" | "ask" | "approve">("ask")
  const [agent, setAgent] = createSignal("general")
  const [mode, setMode] = createSignal<string>("general")
  const [questions, setQuestions] = createSignal<ReadonlyArray<AiPendingQuestion>>([])
  const [hostContext, setHostContext] = createSignal<AiContextState>()
  const [controlBusy, setControlBusy] = createSignal(false)
  const [controlError, setControlError] = createSignal<string>()
  const [dismissedSuggestions, setDismissedSuggestions] = createSignal<ReadonlyArray<string>>([])
  const [projectContextRevision, setProjectContextRevision] = createSignal(0)
  const [activeAssistantId, setActiveAssistantId] = createSignal<string | undefined>()
  const [loadingOlder, setLoadingOlder] = createSignal(false)
  const [hasOlderMessages, setHasOlderMessages] = createSignal(false)
  const [olderChecked, setOlderChecked] = createSignal(false)
  const [feedback, setFeedback] = createSignal<Readonly<Record<string, "up" | "down">>>({})
  const [hostPrompts, setHostPrompts] = createSignal<ReadonlyArray<string>>([])

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

  const setSessionsPersisted = (next: ReadonlyArray<AiSession>): void => {
    setSessionsSig(() => next)
    persist({ model: modelSig(), includeContext: includeContextSig(), sessions: next })
  }

  const projectId = (): string | undefined => useDocumentStore().projectId ?? app.recents()[0]?.id
   const rememberActive = (): void => {
     const project = projectId() ?? ""
     const id = sessionId()
     if (id === undefined) delete activeByProject[project]
     else activeByProject[project] = id
     persist({ model: modelSig(), includeContext: includeContextSig(), sessions: sessionsSig() })
   }

  const appendMessage = (message: AiMessage): void => {
    setMessages((current) => [...current, message].slice(-MAX_MESSAGES))
  }

  const patchMessage = (id: string, patch: (prev: AiMessage) => AiMessage): void => {
    setMessages((current) => current.map((m) => m.id === id ? patch(m) : m))
  }

  let disposed = false
  const isDisposed = (): boolean => disposed

  // ── The modules the store is made of ────────────────────────────────────────
  const sessions = createSessions({
    app,
    sessionId,
    projectId,
    status,
    conversationGeneration: () => conversationGeneration,
    messages,
    setMessages,
    setToolCalls,
    setPlan,
    allSessions: sessionsSig,
    setAllSessions: setSessionsPersisted,
    isDisposed
  })

  const applier = createEventApplier({
    app,
    activeAssistantId,
    setActiveAssistantId,
    sessionId,
    messages,
    toolCalls,
    activity,
    pending,
    setPending,
    appendMessage,
    patchMessage,
    setPermissions,
    setQuestions,
    setPlan,
    setGoal,
    setActivity,
    setToolCalls,
    setTasks,
    setStats,
    setError,
    setContextTokens,
    saveTranscript: sessions.saveTranscript,
    touchSession: sessions.touchSession,
    refreshControls: () => controls.refreshControls()
  })

  const taskWatcher = createTaskWatcher({
    app,
    sessionId,
    projectId,
    conversationGeneration: () => conversationGeneration,
    status,
    messages,
    appendMessage,
    setPermissions,
    setQuestions,
    setHostContext,
    setContextTokens,
    setTasks,
    saveTranscript: sessions.saveTranscript,
    nextMessageId
  })

  const controls = createControls({
    app,
    sessionId,
    projectId,
    model,
    status,
    conversationGeneration: () => conversationGeneration,
    controlBusy,
    controlError,
    setControlBusy,
    setControlError,
    setPermissions,
    setQuestions,
    setTasks,
    setPluginModes,
    setGoal,
    setHostContext,
    setContextTokens,
    setActivity,
    watchTasks: (busy) => { void taskWatcher.watch(busy) }
  })

  let handle: StreamHandle | undefined
  let conversationGeneration = 0
  let turnGeneration = 0
   let adoptingPreparedDocument = false
  /** The conversations whose name is still the words of their first question. */
  const untitledSessions = new Set<string>()

  // ── Sending a turn ─────────────────────────────────────────────────────────
  const finishStream = (next: "idle" | "error"): void => {
    setStatus(next)
    handle = undefined
    // Background tasks may still be running; their reports come back after the turn.
    if (tasks().length > 0) void taskWatcher.watch()
    // The first answer names the conversation: the words of the question are a
    // poor name for it, and the host knows better.
    const current = sessionId()
    if (current !== undefined && untitledSessions.has(current)) {
      untitledSessions.delete(current)
      void titleSession()
    }
    // A message the agent did not take in before the turn ended is sent now, as the next message.
    const [waiting, ...rest] = pending()
    if (waiting !== undefined && waiting.text !== "") {
      setPending(rest)
      void send(waiting.text)
    }
  }

  const enqueue = async (text: string, delivery: PendingDelivery): Promise<void> => {
    const sid = sessionId()
    if (sid === undefined) return
    const generation = conversationGeneration, project = projectId()
    const current = () => !disposed && generation === conversationGeneration && sessionId() === sid && projectId() === project
    const item: AiPending = { id: nextMessageId(), text, delivery }
    setPending((current) => [...current, item])
    // The turn may still be connecting: the host has no turn to add the message to until it streams.
    for (let waited = 0; current() && status() === "connecting" && waited < 100; waited += 1) await new Promise((resolve) => setTimeout(resolve, 100))
    let lastFailure: unknown
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!current() || !pending().some((p) => p.id === item.id)) return
      try {
        await app.runtime.run(app.client.ai.chatQueue({ payload: { sessionId: sid, message: text, delivery, ...(projectId() !== undefined ? { projectId: projectId()! } : {}) } }))
        return
      } catch (cause) {
        lastFailure = cause
        if (status() !== "streaming") break
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }
    if (!current() || !pending().some((p) => p.id === item.id)) return
    // The host could not take it (the turn is over): it is an ordinary message.
    setPending((current) => current.filter((p) => p.id !== item.id))
    console.error("Could not queue the message", lastFailure)
    if (status() === "idle" || status() === "error") void send(text)
    else setError(sanitizeError(lastFailure instanceof Error ? lastFailure.message : String(lastFailure)))
  }

  const send: AiStore["send"] = async (prompt, attachments = [], delivery = "queue") => {
    if (controlBusy()) return
    const text = prompt.trim()
    if (text.length === 0) return
    if (status() === "connecting" || status() === "streaming") {
      // The turn is running: the message joins it instead of being dropped.
      await enqueue(text, delivery)
      return
    }
    let sid = sessionId() ?? newSessionId()
    const originalId = sid
    let ownerProject = projectId()
    const ownerConversation = conversationGeneration
    const generation = ++turnGeneration
    let editorOwner = captureEditorOwner()
    const at = new Date().toISOString()
    if (!sessionId()) {
      setSessionId(sid)
      sessions.upsertSession(sid, text.slice(0, 60), at, projectId())
      untitledSessions.add(sid)
      rememberActive()
    }
    const userId = nextMessageId()
    appendMessage({ id: userId, role: "user", text, createdAt: at, events: [], status: "done", ...(attachments.length > 0 ? { attachments: attachments.map((a) => a.name) } : {}) })
    const assistantId = nextMessageId()
    setActiveAssistantId(assistantId)
    appendMessage({ id: assistantId, role: "assistant", text: "", createdAt: at, events: [], status: "streaming", ...(modelSig() ? { model: modelSig()!.model } : {}) })
    sessions.saveTranscript()
    applier.resetTurn()
    batch(() => {
      setStatus("connecting")
      setError(undefined)
      setActivity({ step: 0, compacted: false })
    })
    // Preparation must succeed before admission; a failed write is not permission to use another workspace.
    let activeProjectId = projectId()
    try {
      const workspace = await prepareWorkspace(app, (document, apply) => {
        if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || !editorOwner.current()) throw new Error("Workspace changed during preparation")
        adoptingPreparedDocument = true
        try {
          ownerProject = document.projectId
          apply()
          editorOwner = captureEditorOwner()
          setSessionsPersisted(sessionsSig().map((s) => s.id === sid ? { ...s, projectId: document.projectId } : s))
          delete activeByProject[""]
          rememberActive()
        } finally { adoptingPreparedDocument = false }
      })
      if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || sessionId() !== sid || projectId() !== ownerProject || !editorOwner.current()) return
      activeProjectId = workspace.projectId
      if (includeContext()) {
        await persistDrawingContext(app, workspace.projectId)
        setProjectContextRevision((revision) => revision + 1)
      }
    } catch (cause) {
      if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || !editorOwner.current()) return
      const message = sanitizeError(cause instanceof Error ? cause.message : String(cause))
      patchMessage(assistantId, (prev) => ({ ...prev, status: "error", error: message }))
      setError(message); setStatus("error"); sessions.saveTranscript()
      return
    }
    if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || sessionId() !== sid || projectId() !== ownerProject || !editorOwner.current()) return
    const m = modelSig()
    // The turn is admitted for the drawing open now; another window switching drawings later does not move it.
    const openDocument = useDocumentStore.getState()
    const turnDrawing = activeProjectId !== undefined && openDocument.projectId === activeProjectId && openDocument.drawingId !== null ? openDocument.drawingId : undefined
    handle = streamChat({
      client: app.client,
      runtime: app.runtime,
      onEvent: (event) => {
         if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || projectId() !== activeProjectId || sessionId() !== sid || !editorOwner.current()) return
         const child = "agent" in event && event.agent !== undefined
         if (!child && event.sessionId !== sid) {
           // Early setup failures can still carry the original client identity.
           if (event.sessionId === originalId && sid !== originalId) { applier.apply(event, editorOwner); return }
           if (sid !== originalId || event.type === "error") return
           const nativeId = event.sessionId
           if (sessionsSig().some((s) => s.id === nativeId && s.projectId !== activeProjectId)) return
           sessions.migrateTranscript(sid, nativeId)
           setSessionsPersisted(sessionsSig().map((s) => s.id === sid ? { ...s, id: nativeId } : s).filter((s, index, all) => all.findIndex((other) => other.id === s.id) === index))
           sid = nativeId
           setSessionId(sid)
           rememberActive(); sessions.saveTranscript()
         }
         applier.apply(event, editorOwner)
       },
      onError: (message) => {
        if (disposed || generation !== turnGeneration || ownerConversation !== conversationGeneration || projectId() !== activeProjectId || !editorOwner.current()) return
        patchMessage(activeAssistantId() ?? assistantId, (prev) => ({ ...prev, status: "error", error: message, finishedAt: new Date().toISOString() }))
        setError(message)
        setStatus("error")
        sessions.saveTranscript()
      },
      onDone: () => { if (!disposed && generation === turnGeneration && ownerConversation === conversationGeneration && projectId() === activeProjectId && editorOwner.current()) finishStream(error() !== undefined ? "error" : "idle") }
    }, {
      message: text,
      includeContext: includeContext(),
      sessionId: sid,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(activeProjectId ? { projectId: activeProjectId } : {}),
      ...(turnDrawing !== undefined ? { drawingId: turnDrawing } : {}),
      ...(m ? { model: m } : {}),
      agent: agent(), mode: mode(), permissionMode: permissionMode(),
    })
    setStatus("streaming")
  }

  const abort: AiStore["abort"] = () => {
    const sid = sessionId()
    if (sid === undefined) return
    turnGeneration += 1
    handle?.abort()
    handle = undefined
    setPending([])
    setPermissions([])
    setQuestions([])
    // The answer that was being written ends here, marked as stopped.
    const assistant = activeAssistantId()
    if (assistant !== undefined) patchMessage(assistant, (prev) => prev.status === "streaming" ? { ...prev, status: "done", interrupted: true, finishedAt: new Date().toISOString() } : prev)
    sessions.saveTranscript()
    // The host stops the background tasks of the conversation with the turn: show that now, then take the host's own record.
    setTasks((current) => current.map((t) => t.status === "queued" || t.status === "running" ? { ...t, status: "cancelled" as const } : t))
    void app.runtime.run(app.client.ai.chatAbort({ payload: { sessionId: sid, ...(projectId() ? { projectId: projectId()! } : {}) } })).then(() => { if (!disposed && sessionId() === sid) void controls.refreshControls() }).catch(() => undefined)
    setStatus("idle")
  }

  const resetConversation = (): void => {
    conversationGeneration += 1
    turnGeneration += 1
    setActiveAssistantId(undefined)
    batch(() => {
      setMessages([])
      setToolCalls({})
      setPermissions([])
      setQuestions([])
      setHostContext(undefined)
      setControlBusy(false)
      setControlError(undefined)
      setStatus("idle")
      setStats(emptyStats())
      setContextTokens(0)
      setError(undefined)
      setPlan([])
      setGoal(undefined)
      setTasks([])
      setPending([])
      setActivity({ step: 0, compacted: false })
    })
  }

  const detachStream = (): void => {
     turnGeneration += 1
     handle?.abort()
     handle = undefined
     const assistant = activeAssistantId()
     if (assistant !== undefined) patchMessage(assistant, (m) => m.status === "streaming" ? { ...m, status: "done" } : m)
     sessions.saveTranscript()
   }

  const clear: AiStore["clear"] = () => {
    if (status() === "streaming" || status() === "connecting") abort()
    resetConversation()
    sessions.saveTranscript()
  }

  const newSession: AiStore["newSession"] = () => {
    detachStream()
    resetConversation()
    setSessionId(undefined)
    rememberActive()
  }

  const openSession: AiStore["openSession"] = (id) => {
    if (id === sessionId() || !sessions.sessions().some((s) => s.id === id)) return
    detachStream()
    handle = undefined
    setActiveAssistantId(undefined)
    resetConversation()
    batch(() => {
      setSessionId(id)
      setStatus("idle")
      sessions.restoreTranscript(id)
    })
    setOlderChecked(false)
    rememberActive()
    void sessions.refreshServerHistory(id)
  }

  const replyPermission: AiStore["replyPermission"] = async (requestId, decision) => {
    const permission = permissions().find((item) => item.requestId === requestId)
    const generation = conversationGeneration
    if (!permission) return
    await app.runtime.run(app.client.ai.permissionReply({
      payload: { sessionId: permission.sessionId, requestId, decision, ...(projectId() ? { projectId: projectId()! } : {}) }
    }))
    if (!disposed && generation === conversationGeneration) setPermissions((current) => current.filter((item) => item.requestId !== requestId))
  }

  onCacheInvalidated(app.cache, () => { void sessions.refreshServerSessions() })
  createEffect(() => { projectId(); untrack(() => { void sessions.refreshServerSessions() }) })

  // ── Reading older messages ─────────────────────────────────────────────────
  /**
   * The cursor for the page before the oldest message on screen: the host
   * pages by message id, so it is the id of that message.
   */
  const olderCursor = (): string | undefined => messages()[0]?.id

  const loadOlderMessages: AiStore["loadOlderMessages"] = async () => {
    const sid = sessionId()
    const project = projectId()
    const before = olderCursor()
    if (sid === undefined || project === undefined || before === undefined || loadingOlder()) return 0
    setLoadingOlder(true)
    try {
      const page = await app.runtime.run(app.client.ai.sessionMessages({ params: { sessionId: sid }, query: { before, limit: "50" } }))
      const older = serverMessages(page.messages, sid)
      setOlderChecked(true)
      if (older.length === 0) { setHasOlderMessages(false); return 0 }
      setMessages((current) => {
        const known = new Set(current.map((m) => m.id))
        const fresh = older.filter((m) => !known.has(m.id))
        return [...fresh, ...current]
      })
      setHasOlderMessages(page.before !== null)
      return older.length
    } catch {
      return 0
    } finally {
      setLoadingOlder(false)
    }
  }

  /** The host's own suggestions for the mode in front of the user. */
  const refreshHostPrompts: AiStore["refreshHostPrompts"] = async () => {
    const generation = conversationGeneration
    try {
      const reply = await app.runtime.run(app.client.ai.prompts({ query: { mode: mode() } }))
      if (disposed || generation !== conversationGeneration) return
      setHostPrompts(reply.prompts.filter((prompt) => prompt.trim() !== ""))
    } catch {
      // A host without suggestions leaves the local ones in place.
    }
  }

  // ── Naming the conversation ────────────────────────────────────────────────
  const titleSession: AiStore["titleSession"] = async () => {
    const sid = sessionId()
    const project = projectId()
    const first = messages().find((m) => m.role === "user")
    if (sid === undefined || project === undefined || first === undefined) return
    try {
      const reply = await app.runtime.run(app.client.ai.title({ payload: { excerpt: first.text.slice(0, 400), ...(modelSig() ? { model: modelSig()! } : {}) } }))
      const title = reply.title.trim()
      if (title === "") return
      sessions.renameSession(sid, title)
    } catch {
      // A host that cannot name the conversation keeps the words of its first message.
    }
  }

  // ── Rating an answer ───────────────────────────────────────────────────────
  const rateMessage: AiStore["rateMessage"] = async (messageId, rating, comment) => {
    // The rating is shown at once; the host keeps it for its own record.
    setFeedback((current) => ({ ...current, [messageId]: rating }))
    try {
      await app.runtime.run(app.client.ai.feedback({ payload: { messageId, rating, ...(comment !== undefined && comment.trim() !== "" ? { comment: comment.trim() } : {}) } }))
    } catch (cause) {
      setFeedback((current) => { const { [messageId]: _dropped, ...rest } = current; return rest })
      throw cause
    }
  }

  // ── Asking the last question again ─────────────────────────────────────────
  const regenerate: AiStore["regenerate"] = async () => {
    if (status() === "connecting" || status() === "streaming") return
    const index = messages().findLastIndex((m) => m.role === "user")
    if (index < 0) return
    const prompt = messages()[index]?.text ?? ""
    if (prompt.trim() === "") return
    // The answer it produced goes; the question stays and is asked again.
    setMessages((current) => current.slice(0, index))
    setToolCalls({})
    setActiveAssistantId(undefined)
    await send(prompt)
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

   let observedProject = projectId()
    const selectProject = (): void => {
      if (adoptingPreparedDocument) return
      detachStream()
      resetConversation()
      const id = activeByProject[projectId() ?? ""]
      setSessionId(undefined)
      if (id && sessions.sessions().some((s) => s.id === id)) { setSessionId(id); sessions.restoreTranscript(id) }
   }
    let observedDrawing = liveDocument.drawingId
    const stopProjectSubscription = useDocumentStore.subscribe(() => {
      const next = projectId()
      const drawing = useDocumentStore.getState().drawingId
      if (next === observedProject && drawing === observedDrawing) return
      observedProject = next
      observedDrawing = drawing
      selectProject()
    })
    const restoredId = activeByProject[projectId() ?? ""]
    if (restoredId && sessions.sessions().some((s) => s.id === restoredId)) { setSessionId(restoredId); sessions.restoreTranscript(restoredId) }
    createEffect(() => {
      const next = projectId()
      if (next !== observedProject) { observedProject = next; untrack(selectProject) }
    })

    let controlsGeneration = 0
  createEffect(() => {
    const sid = sessionId()
    projectId()
    const generation = ++controlsGeneration
    setQuestions([]); setPermissions([]); setHostContext(undefined); setControlError(undefined); setControlBusy(false)
    if (sid) untrack(() => void controls.refreshControls())
    void app.runtime.run(app.client.ai.agents()).then((list) => { if (!disposed && generation === controlsGeneration) setAgents(list) }).catch(() => undefined)
    void app.runtime.run(app.client.ai.modes()).then((reply) => { if (!disposed && generation === controlsGeneration) setPluginModes(reply.modes) }).catch(() => undefined)
  })

  // The host suggests prompts for the mode in front of the user; a different mode means different suggestions.
  createEffect(() => {
    mode()
    untrack(() => { void refreshHostPrompts() })
  })

  const suggestions = createMemo<ReadonlyArray<Suggestion>>(() => {
    void dismissedSuggestions()
    void liveVerify.report
    void hostPrompts()
    const verification = verificationState()
    const built = buildSuggestions({
      entityCount: liveElements.elements.length,
      selectedCount: liveSelection.selectedElementIds.length,
      activeTool: app.tool(),
      layers: liveLayers.layers.length,
      hasGcode: liveCam.gcode.trim() !== "",
      verification: verification.state
    })
    // The host knows the mode in front of the user; its prompts come first.
    const fromHost: Suggestion[] = hostPrompts().map((prompt, index) => ({
      id: `host.${index}`,
      title: prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt,
      description: t("ai.suggestions.fromHost"),
      prompt,
      category: "design" as const
    }))
    return [...fromHost, ...built].filter((s: Suggestion) => !dismissedSuggestions().includes(s.id))
  })

  const dismissSuggestion = (id: string): void => {
    setDismissedSuggestions((current) => current.includes(id) ? current : [...current, id])
  }

  const stopVisionBridge = startVisionBridge(app)
  onCleanup(() => {
    disposed = true
    controlsGeneration++
    sessions.dispose()
    taskWatcher.dispose()
    stopVisionBridge()
    stopProjectSubscription()
    handle?.abort()
    handle = undefined
  })

  return {
    status, error, sessionId, sessions: sessions.sessions, messages, toolCalls, permissions, plan, goal, activity, tasks,
    model, setModel, includeContext, setIncludeContext, stats, contextTokens, suggestions, dismissSuggestion,
    projectId, send, pending, abort, clear, newSession, openSession,
    renameSession: sessions.renameSession, deleteSession: sessions.deleteSession, replyPermission,
    permissionMode, setPermissionMode, agents, agent, setAgent, mode, setMode, pluginModes, refreshModes: controls.refreshModes,
    questions, hostContext, controlBusy, controlError,
    refreshControls: controls.refreshControls, loadContextBreakdown: controls.loadContextBreakdown, compact: controls.compact,
    consolidateMemory: controls.consolidateMemory, cancelTask: controls.cancelTask, replyQuestion: controls.replyQuestion,
    loadOlderMessages, loadingOlder, hasOlderMessages, titleSession,
    feedback, rateMessage, regenerate,
    hostPrompts, refreshHostPrompts,
    canLoadOlder: () => !olderChecked() || hasOlderMessages()
  }
  })
   onCleanup(() => disposeStore?.())
   return store
}

/** Memoised status pill text for the shell. */
export const statusLabel = (status: "idle" | "connecting" | "streaming" | "error", error: string | undefined): string => {
  if (status === "streaming") return "Thinking"
  if (status === "connecting") return "Connecting"
  if (status === "error") return error ?? "Error"
  return "Idle"
}
