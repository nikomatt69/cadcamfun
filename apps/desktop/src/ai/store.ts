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
import { batch, createEffect, createMemo, createRoot, createSignal, onCleanup, untrack, type Accessor, type Setter } from "solid-js"
import { useApp } from "../state/context.ts"
import { startVisionBridge } from "./vision.ts"
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
import { loadTranscripts, saveTranscripts, toStored, type StoredMessage } from "./persisted.ts"
import type { ChatAttachment } from "./attachments.ts"
import { contextTokensOf } from "./context-metrics.ts"
import { mirrorCamResult } from "./cam-sync.ts"
import { mirrorToolResult, reconcileFromStored } from "./editor-sync.ts"
import type { AiActivity, AiEvent, AiGoal, AiMessage, AiPermission, AiSession, AiTask, AiTodo, AiToolCalls, ChatModel, AiAgent, AiPendingQuestion, AiContextState } from "./types.ts"

export type PendingDelivery = "queue" | "steer"
export interface AiPending { readonly id: string; readonly text: string; readonly delivery: PendingDelivery }

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
  readonly mode: Accessor<"general" | "cad" | "cam" | "gcode" | "toolpath">
  readonly setMode: (mode: "general" | "cad" | "cam" | "gcode" | "toolpath") => void
  readonly questions: Accessor<ReadonlyArray<AiPendingQuestion>>
  readonly hostContext: Accessor<AiContextState | undefined>
  readonly controlBusy: Accessor<boolean>
  readonly controlError: Accessor<string | undefined>
  readonly refreshControls: () => Promise<void>
  readonly consolidateMemory: () => Promise<void>
  readonly compact: () => Promise<void>
  readonly cancelTask: (id: string) => Promise<void>
  readonly replyQuestion: (requestId: string, answers?: ReadonlyArray<ReadonlyArray<string>>) => Promise<void>
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
  const [plan, setPlan] = createSignal<ReadonlyArray<AiTodo>>([])
  const [goal, setGoal] = createSignal<AiGoal | undefined>()
  const [activity, setActivity] = createSignal<AiActivity>({ step: 0, compacted: false })
  const [tasks, setTasks] = createSignal<ReadonlyArray<AiTask>>([])
  const [pending, setPending] = createSignal<ReadonlyArray<AiPending>>([])
  const [stats, setStats] = createSignal<AiStats>(emptyStats())
  const [contextTokens, setContextTokens] = createSignal(0)
  const [agents, setAgents] = createSignal<ReadonlyArray<AiAgent>>([])
  const [permissionMode, setPermissionMode] = createSignal<"auto" | "ask" | "approve">("ask")
  const [agent, setAgent] = createSignal("cadcam")
  const [mode, setMode] = createSignal<"general" | "cad" | "cam" | "gcode" | "toolpath">("general")
  const [questions, setQuestions] = createSignal<ReadonlyArray<AiPendingQuestion>>([])
  const [hostContext, setHostContext] = createSignal<AiContextState>()
  const [controlBusy, setControlBusy] = createSignal(false)
  const [controlError, setControlError] = createSignal<string>()
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

  // Conversations are kept as text so they can be reopened; see persisted.ts.
  let transcripts: Record<string, ReadonlyArray<StoredMessage>> = { ...loadTranscripts() }
  const saveTranscript = (): void => {
    const id = sessionId()
    if (id === undefined) return
    transcripts = { ...transcripts, [id]: messages().flatMap((m) => { const stored = toStored(m); return stored === undefined ? [] : [stored] }) }
    saveTranscripts(transcripts, sessionsSig().map((s) => s.id))
  }

  let handle: StreamHandle | undefined
  let activeAssistantId: string | undefined
  const thinkingCounted = new Set<number>()

  const upsertSession = (id: string, title: string, startedAt: string, project?: string): void => {
    const next = [{ id, title, startedAt, updatedAt: startedAt, exchanges: 0, ...(project !== undefined ? { projectId: project } : {}) }, ...sessionsSig().filter((s) => s.id !== id)].slice(0, MAX_SESSIONS)
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

  /** Merge what a task tool answered (one task or a list) into the task list, so the chat shows it before the next poll. */
  const noteTasks = (output: string): void => {
    let parsed: unknown
    try { parsed = JSON.parse(output) } catch { return }
    const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter((t): t is AiTask => typeof t === "object" && t !== null && typeof (t as AiTask).id === "string" && typeof (t as AiTask).status === "string")
    if (incoming.length === 0) return
    setTasks((current) => {
      const byId = new Map(current.map((t) => [t.id, t] as const))
      for (const task of incoming) byId.set(task.id, { ...byId.get(task.id), ...task, agent: task.agent ?? "researcher", background: task.background !== false })
      return [...byId.values()]
    })
  }

  // Background tasks go on after the turn ends, and when one finishes the host wakes the agent with its report and the agent
  // answers on its own. No stream carries that, so the host's session state is polled until the tasks and the answer are done.
  const POLL_MS = 2_000
  const WAKE_ROUNDS = 25
  let disposed = false
  let watching = false
  const activeTask = (list: ReadonlyArray<AiTask>): boolean => list.some((t) => t.status === "queued" || t.status === "running")
  const watchTasks = async (initialBusy = false): Promise<void> => {
    if (watching) return
    watching = true
    const watchedSession = sessionId(), watchedProject = projectId()
    try {
      const delivered = new Set<string>()
      let woken = initialBusy
      let quiet = 0
      let waiting = 0
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        const sid = sessionId()
        if (disposed || sid === undefined || sid !== watchedSession || projectId() !== watchedProject) return
        let state: { readonly busy: boolean; readonly text: string; readonly error?: string; readonly tasks?: ReadonlyArray<AiTask> } | undefined
        try {
          state = await app.runtime.run(app.client.ai.sessionControl({ payload: { action: "status", sessionId: sid, ...(projectId() !== undefined ? { projectId: projectId()! } : {}) } })) as typeof state
        } catch {
          if (++quiet >= 5) return
          continue
        }
        if (sessionId() !== watchedSession || projectId() !== watchedProject) return
        const controls = state as typeof state & { permissions?: ReadonlyArray<AiPermission>; questions?: ReadonlyArray<AiPendingQuestion>; context?: AiContextState }
        if (controls?.permissions) setPermissions(controls.permissions)
        if (controls?.questions) setQuestions(controls.questions)
        if (controls?.context) { setHostContext(controls.context); if (controls.context.tokens !== undefined) setContextTokens(controls.context.tokens) }
        quiet = 0
        const list = state?.tasks ?? []
        if (list.length > 0) setTasks((current) => {
          const known = new Set(list.map((t) => t.id))
          // A task the host no longer lists (it restarted) cannot finish: do not leave it spinning.
          const lost = current.filter((t) => !known.has(t.id) && (t.status === "queued" || t.status === "running") && status() === "idle").map((t) => ({ ...t, status: "cancelled" as const }))
          return [...list.map((t) => ({ ...t, background: t.background !== false })), ...lost]
        })
        else if (status() === "idle") setTasks((current) => current.map((t) => t.status === "queued" || t.status === "running" ? { ...t, status: "cancelled" as const } : t))
        if (status() === "connecting" || status() === "streaming") { quiet = 0; waiting = 0; continue }
        if (activeTask(list)) { waiting = 0; continue }
        // Reports of finished background tasks come back to the agent on their own: wait for that turn, then show its answer.
        const owed = list.filter((t) => t.background && t.status !== "cancelled" && !delivered.has(t.id))
        if (state?.busy === true) { woken = true; waiting = 0; continue }
        if (woken) {
          for (const t of owed) delivered.add(t.id)
          const answer = state?.text.trim() ?? ""
          if (answer !== "" && !messages().some((m) => m.role === "assistant" && m.text === answer)) {
            appendMessage({ id: nextMessageId(), role: "assistant", text: answer, createdAt: new Date().toISOString(), events: [], status: "done" })
            saveTranscript()
          }
          // What the agent changed after the report is in the stored drawing, not in this editor yet.
          void reconcileFromStored(app).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
          woken = false
          if (owed.length === 0) return
          continue
        }
        if (owed.length === 0 || ++waiting >= WAKE_ROUNDS) return
      }
    } finally {
      watching = false
    }
  }

  const applyEvent = (event: AiEvent): void => {
    const idForEvent = activeAssistantId ?? `${event.sessionId}:assistant`
    if (event.type === "reasoning") {
      const id = idForEvent
      if (!messages().some((m) => m.id === id)) appendMessage({ id, role: "assistant", text: "", createdAt: new Date().toISOString(), events: [event], status: "streaming", thinking: event.text })
      else patchMessage(id, (prev) => ({ ...prev, thinking: (prev.thinking ?? "") + event.text, events: [...prev.events, event] }))
      // One thinking step per step of the turn, however many deltas it arrives in.
      if (!thinkingCounted.has(activity().step)) { thinkingCounted.add(activity().step); setStats((s) => ({ ...s, thinkingSteps: s.thinkingSteps + 1 })) }
      return
    }
    if (event.type === "user_message") {
      // A message written while the agent worked has been taken in: it goes into the transcript where it happened and what the
      // agent writes from here on answers it.
      const now = new Date().toISOString()
      const taken = pending().find((p) => p.text.trim() === event.text.trim())
      const previous = activeAssistantId
      const answerId = nextMessageId()
      batch(() => {
        if (taken !== undefined) setPending((current) => current.filter((p) => p.id !== taken.id))
        if (previous !== undefined) patchMessage(previous, (prev) => ({ ...prev, status: prev.status === "streaming" ? "done" : prev.status }))
        appendMessage({ id: nextMessageId(), role: "user", text: event.text, createdAt: now, events: [], status: "done" })
        appendMessage({ id: answerId, role: "assistant", text: "", createdAt: now, events: [], status: "streaming" })
        activeAssistantId = answerId
      })
      saveTranscript()
      return
    }
    if (event.type === "tool_progress") {
      setToolCalls((current) => current[event.callId]?.status === "running" || current[event.callId]?.status === "ok" || current[event.callId]?.status === "error"
        ? current
        : { ...current, [event.callId]: { tool: event.tool, input: {}, status: "preparing", chars: event.chars, sessionId: event.sessionId, ...(event.agent !== undefined ? { agent: event.agent } : {}) } })
      setActivity((a) => ({ ...a, preparing: { tool: event.tool, chars: event.chars } }))
      return
    }
    if (event.type === "step") {
      if (event.phase === "start") { setActivity((a) => ({ ...a, step: event.index, preparing: undefined })) }
      else if (event.usage) { setContextTokens(contextTokensOf(event.usage)); setStats((s) => ({ ...s, totalInputTokens: s.totalInputTokens + event.usage!.inputTokens, totalOutputTokens: s.totalOutputTokens + event.usage!.outputTokens })) }
      return
    }
    if (event.type === "todo") { setPlan(event.todos); return }
    if (event.type === "goal") { setGoal(event.goal ?? undefined); return }
    if (event.type === "retry") {
      setActivity((a) => ({ ...a, retry: { attempt: event.attempt, message: event.message } }))
      // Shown where it happened, as nikcli's session view shows a retried request.
      if (messages().some((m) => m.id === idForEvent)) patchMessage(idForEvent, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "compacted") { setActivity((a) => ({ ...a, compacted: true })); return }
    if (event.type === "delta") {
      if (activity().retry !== undefined) setActivity((a) => ({ ...a, retry: undefined }))
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
      setActivity((a) => ({ ...a, preparing: undefined, retry: undefined }))
      setToolCalls((current) => ({ ...current, [event.callId]: { tool: event.tool, input: event.input, status: "running", sessionId: event.sessionId, ...(event.agent !== undefined ? { agent: event.agent } : {}) } }))
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
      if (event.tool === "agent_task" || event.tool === "agent_tasks" || event.tool === "agent_task_read" || event.tool === "agent_task_cancel") noteTasks(event.output)
      const id = idForEvent
      setToolCalls((current) => {
        const existing = current[event.callId]
        if (existing === undefined) return current
        return { ...current, [event.callId]: { ...existing, status: event.ok ? "ok" : "error", output: event.output, ...(event.images ? { images: event.images } : {}) } }
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
    if (event.type === "question_request") {
      setQuestions((current) => [...current.filter((q) => q.requestId !== event.requestId), { requestId: event.requestId, questions: event.questions }])
      return
    }
    if (event.type === "question_resolved") {
      setQuestions((current) => current.filter((q) => q.requestId !== event.requestId))
      return
    }
    if (event.type === "done") {
      void refreshControls()
      const id = idForEvent
      patchMessage(id, (prev) => ({ ...prev, status: "done", text: event.text || prev.text, usage: event.usage, finishedAt: new Date().toISOString() }))
      setStats((s) => ({
        ...s,
        exchanges: s.exchanges + 1,
        totalInputTokens: s.totalInputTokens + (event.usage?.inputTokens ?? 0),
        totalOutputTokens: s.totalOutputTokens + (event.usage?.outputTokens ?? 0)
      }))
      touchSession(event.sessionId, new Date().toISOString(), 1)
      saveTranscript()
      // The tool results of a recovered turn never reached us: the stored drawing is the truth, so the editor catches up with it.
      if (event.recovered === true) void reconcileFromStored(app).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
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
      saveTranscript()
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
    // Background tasks may still be running; their reports come back after the turn.
    if (tasks().length > 0) void watchTasks()
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
    const item: AiPending = { id: nextMessageId(), text, delivery }
    setPending((current) => [...current, item])
    // The turn may still be connecting: the host has no turn to add the message to until it streams.
    for (let waited = 0; status() === "connecting" && waited < 100; waited += 1) await new Promise((resolve) => setTimeout(resolve, 100))
    let lastFailure: unknown
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!pending().some((p) => p.id === item.id)) return
      try {
        await app.runtime.run(app.client.ai.chatQueue({ payload: { sessionId: sid, message: text, delivery, ...(projectId() !== undefined ? { projectId: projectId()! } : {}) } }))
        return
      } catch (cause) {
        lastFailure = cause
        if (status() !== "streaming") break
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }
    // The host could not take it (the turn is over): it is an ordinary message.
    setPending((current) => current.filter((p) => p.id !== item.id))
    console.error("Could not queue the message", lastFailure)
    if (status() === "idle" || status() === "error") void send(text)
    else setError(lastFailure instanceof Error ? lastFailure.message : String(lastFailure))
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
    const sid = sessionId() ?? newSessionId()
    const at = new Date().toISOString()
    if (!sessionId()) {
      setSessionId(sid)
      upsertSession(sid, text.slice(0, 60), at, projectId())
    }
    const userId = nextMessageId()
    appendMessage({ id: userId, role: "user", text, createdAt: at, events: [], status: "done", ...(attachments.length > 0 ? { attachments: attachments.map((a) => a.name) } : {}) })
    const assistantId = nextMessageId()
    activeAssistantId = assistantId
    appendMessage({ id: assistantId, role: "assistant", text: "", createdAt: at, events: [], status: "streaming", ...(modelSig() ? { model: modelSig()!.model } : {}) })
    saveTranscript()
    thinkingCounted.clear()
    batch(() => {
      setStatus("connecting")
      setError(undefined)
      setActivity({ step: 0, compacted: false })
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
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(activeProjectId ? { projectId: activeProjectId } : {}),
      ...(m ? { model: m } : {}),
      agent: agent(), mode: mode(), permissionMode: permissionMode(),
    })
    setStatus("streaming")
  }

  const abort: AiStore["abort"] = () => {
    const sid = sessionId()
    if (sid === undefined) return
    handle?.abort()
    handle = undefined
    setPending([])
    // The answer that was being written ends here, marked as stopped.
    if (activeAssistantId !== undefined) patchMessage(activeAssistantId, (prev) => prev.status === "streaming" ? { ...prev, status: "done", interrupted: true, finishedAt: new Date().toISOString() } : prev)
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
      setContextTokens(0)
      setError(undefined)
      setPlan([])
      setGoal(undefined)
      setTasks([])
      setPending([])
      setActivity({ step: 0, compacted: false })
    })
    saveTranscript()
  }

  const newSession: AiStore["newSession"] = () => {
    if (status() === "streaming") abort()
    batch(() => {
      setSessionId(undefined)
      setMessages([])
      setToolCalls({})
      setPermissions([])
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

  const resetConversation = (): void => {
    batch(() => {
      setMessages([])
      setToolCalls({})
      setPermissions([])
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

  const openSession: AiStore["openSession"] = (id) => {
    if (id === sessionId() || !sessionsSig().some((s) => s.id === id)) return
    if (status() === "streaming" || status() === "connecting") abort()
    handle = undefined
    activeAssistantId = undefined
    resetConversation()
    batch(() => {
      setSessionId(id)
      setStatus("idle")
      setMessages((transcripts[id] ?? []).map((m) => ({ ...m, events: [] })))
    })
  }

  const renameSession: AiStore["renameSession"] = (id, title) => {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 80)
    if (clean === "") return
    setSessionsPersisted(sessionsSig().map((s) => s.id === id ? { ...s, title: clean } : s))
  }

  const deleteSession: AiStore["deleteSession"] = (id) => {
    const session = sessionsSig().find((s) => s.id === id)
    if (session === undefined) return
    if (id === sessionId()) newSession()
    setSessionsPersisted(sessionsSig().filter((s) => s.id !== id))
    const { [id]: _removed, ...rest } = transcripts
    transcripts = rest
    saveTranscripts(transcripts, sessionsSig().map((s) => s.id))
    // The host forgets the conversation too; failing to reach it leaves nothing to undo locally.
    app.runtime.runVoid(app.client.ai.removeSession({ payload: { sessionId: id, ...(session.projectId !== undefined ? { projectId: session.projectId } : {}) } }))
  }

  const replyPermission: AiStore["replyPermission"] = async (requestId, decision) => {
    const permission = permissions().find((item) => item.requestId === requestId)
    if (!permission) return
    await app.runtime.run(app.client.ai.permissionReply({
      payload: { sessionId: permission.sessionId, requestId, decision, ...(projectId() ? { projectId: projectId()! } : {}) }
    }))
    setPermissions((current) => current.filter((item) => item.requestId !== requestId))
  }

  type ControlAction = "status" | "compact" | "cancel_task" | "answer_question" | "reject_question" | "consolidate_memory"
  const control = async (action: ControlAction, fields: { taskId?: string; requestId?: string; answers?: ReadonlyArray<ReadonlyArray<string>> } = {}): Promise<void> => {
    const sid = sessionId(), project = projectId()
    if (!sid || action !== "status" && controlBusy()) return
    if (action !== "status") { setControlBusy(true); setControlError(undefined) }
    try {
      const state = await app.runtime.run(app.client.ai.sessionControl({ payload: { sessionId: sid, ...(project ? { projectId: project } : {}), action, ...fields, ...(model() ? { model: model()! } : {}) } }))
      if (disposed || sessionId() !== sid || projectId() !== project) return
      batch(() => {
        if (state.permissions) setPermissions(state.permissions)
        setQuestions(state.questions); setTasks(state.tasks); setHostContext(state.context)
        if (state.context.tokens !== undefined) setContextTokens(state.context.tokens)
        if (state.context.compacted) { setContextTokens(0); setActivity((current) => ({ ...current, compacted: true })) }
      })
      if (state.busy && status() !== "streaming" && status() !== "connecting" || activeTask(state.tasks)) void watchTasks(state.busy)
    } catch (cause) {
      if (action !== "status" && sessionId() === sid) setControlError(cause instanceof Error ? cause.message : String(cause))
    } finally { if (action !== "status") setControlBusy(false) }
  }
  const refreshControls = () => control("status")
  const consolidateMemory = () => control("consolidate_memory")
  const compact = () => control("compact")
  const cancelTask = (taskId: string) => control("cancel_task", { taskId })
  const replyQuestion = (requestId: string, answers?: ReadonlyArray<ReadonlyArray<string>>) => control(answers ? "answer_question" : "reject_question", { requestId, ...(answers ? { answers } : {}) })

  let controlsGeneration = 0
  createEffect(() => {
    const sid = sessionId()
    projectId()
    const generation = ++controlsGeneration
    setQuestions([]); setHostContext(undefined); setControlError(undefined)
    if (sid) untrack(() => void refreshControls())
    void app.runtime.run(app.client.ai.agents()).then((list) => { if (generation === controlsGeneration) setAgents(list) }).catch(() => undefined)
  })

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

  const stopVisionBridge = startVisionBridge(app)
  onCleanup(() => {
    disposed = true
    controlsGeneration++
    stopVisionBridge()
    handle?.abort()
    handle = undefined
    disposeRoot()
  })

  return {
    status, error, sessionId, sessions, messages, toolCalls, permissions, plan, goal, activity, tasks,
    model, setModel, includeContext, setIncludeContext, stats, contextTokens, suggestions, dismissSuggestion,
    projectId, send, pending, abort, clear, newSession, openSession, renameSession, deleteSession, replyPermission,
    permissionMode, setPermissionMode, agents, agent, setAgent, mode, setMode, questions, hostContext, controlBusy, controlError, refreshControls, compact, consolidateMemory, cancelTask, replyQuestion
  }
})

/** Memoised status pill text for the shell. */
export const statusLabel = (status: "idle" | "connecting" | "streaming" | "error", error: string | undefined): string => {
  if (status === "streaming") return "Thinking"
  if (status === "connecting") return "Connecting"
  if (status === "error") return error ?? "Error"
  return "Idle"
}
