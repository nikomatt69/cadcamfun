/**
 * What one streamed event does to the conversation.
 *
 * The store used to answer this question in a single 140-line `if` chain that
 * touched eight different signals and two of the editor mirrors. Every new event
 * type meant another branch in the middle of it, and nothing could be tested
 * without a mounted store and a live sidecar.
 *
 * This module owns that question. The store hands it the narrow set of writers it
 * needs (`EventContext`) and gets back a plain description of what changed; the
 * event-shaped bookkeeping that belongs to a turn — the thinking steps already
 * counted, the usage already streamed — stays private to the applier.
 */
import { batch, type Accessor, type Setter } from "solid-js"
import { type AppState } from "../../../shared/state/context.ts"
import { appendTextEvent } from "../lib/timeline.ts"
import { contextTokensOf } from "../lib/context-metrics.ts"
import { sanitizeError } from "../lib/errors.ts"
import { mirrorCamResult } from "../lib/cam-sync.ts"
import { actionKey, mirrorToolResult, reconcileCoalesced, reconcileFromStored, type EditorOwner } from "../lib/editor-sync.ts"
import type {
  AiActivity,
  AiEvent,
  AiGoal,
  AiMessage,
  AiPermission,
  AiPending,
  AiPendingQuestion,
  AiStats,
  AiTask,
  AiTodo,
  AiToolCalls
} from "../lib/types.ts"

/** The writers the applier needs. Everything else it must not touch. */
export interface EventContext {
  readonly app: AppState
  /** The message the current turn writes into. */
  readonly activeAssistantId: Accessor<string | undefined>
  readonly setActiveAssistantId: (id: string | undefined) => void
  readonly sessionId: Accessor<string | undefined>
  readonly messages: Accessor<ReadonlyArray<AiMessage>>
  readonly toolCalls: Accessor<AiToolCalls>
  readonly activity: Accessor<AiActivity>
  readonly pending: Accessor<ReadonlyArray<AiPending>>
  readonly setPending: Setter<ReadonlyArray<AiPending>>
  readonly appendMessage: (message: AiMessage) => void
  readonly patchMessage: (id: string, patch: (previous: AiMessage) => AiMessage) => void
  readonly setPermissions: Setter<ReadonlyArray<AiPermission>>
  readonly setQuestions: Setter<ReadonlyArray<AiPendingQuestion>>
  readonly setPlan: Setter<ReadonlyArray<AiTodo>>
  readonly setGoal: Setter<AiGoal | undefined>
  readonly setActivity: Setter<AiActivity>
  readonly setToolCalls: Setter<AiToolCalls>
  readonly setTasks: Setter<ReadonlyArray<AiTask>>
  readonly setStats: Setter<AiStats>
  readonly setError: Setter<string | undefined>
  readonly setContextTokens: Setter<number>
  /** Writes the conversation to the local store so it can be reopened. */
  readonly saveTranscript: () => void
  /** Counts one exchange on the conversation the turn belongs to. */
  readonly touchSession: (id: string, at: string, exchanges: number) => void
  /** Re-reads the host's pending decisions and the goal after a turn ends. */
  readonly refreshControls: () => Promise<void>
}

export interface EventApplier {
  /** Applies one event of the turn in progress. */
  readonly apply: (event: AiEvent, editorOwner: EditorOwner) => void
  /** Forgets the per-turn bookkeeping: a new turn starts from zero. */
  readonly resetTurn: () => void
}

/**
 * Merge what a task tool answered (one task or a list) into the task list, so the
 * chat shows it before the next poll.
 */
export const mergeTasks = (current: ReadonlyArray<AiTask>, output: string): ReadonlyArray<AiTask> => {
  let parsed: unknown
  try { parsed = JSON.parse(output) } catch { return current }
  const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter((t): t is AiTask => typeof t === "object" && t !== null && typeof (t as AiTask).id === "string" && typeof (t as AiTask).status === "string")
  if (incoming.length === 0) return current
  const byId = new Map(current.map((t) => [t.id, t] as const))
  for (const task of incoming) byId.set(task.id, { ...byId.get(task.id), ...task, agent: task.agent ?? "researcher", background: task.background !== false })
  return [...byId.values()]
}

let messageCounter = 0
/** The id of a message the store creates: unique within a window, sortable by creation. */
export const nextMessageId = (): string => {
  messageCounter += 1
  return `m-${Date.now().toString(36)}-${messageCounter.toString(36)}`
}

export const createEventApplier = (ctx: EventContext): EventApplier => {
  /** The thinking steps already counted in this turn, however many deltas each arrives in. */
  const thinkingCounted = new Set<number>()
  /** The usage the stream already reported, so the closing event is not counted twice. */
  let streamedUsage = { inputTokens: 0, outputTokens: 0 }

  const noteTasks = (output: string): void => {
    ctx.setTasks((current) => mergeTasks(current, output))
  }

  const apply = (event: AiEvent, editorOwner: EditorOwner): void => {
    const idForEvent = ctx.activeAssistantId() ?? `${event.sessionId}:assistant`
    if (event.type === "turn" || event.type === "session_status" || event.type === "permission_resolved" || event.type === "permission_blocked" || event.type === "tool_diagnostic" || event.type === "compaction" || event.type === "context_snapshot") {
      if (event.type === "permission_resolved") ctx.setPermissions((current) => current.filter((item) => item.requestId !== event.requestId))
      if (event.type === "compaction" && event.phase === "finish") ctx.setActivity((current) => ({ ...current, compacted: true }))
      // Native idle/finish events can precede host recovery or continuation; the transport owns turn completion.
      ctx.patchMessage(idForEvent, (previous) => ({ ...previous, events: [...previous.events, event] }))
      return
    }
    if (event.type === "reasoning") {
      const id = idForEvent
      if (!ctx.messages().some((m) => m.id === id)) ctx.appendMessage({ id, role: "assistant", text: "", createdAt: new Date().toISOString(), events: [event], status: "streaming", thinking: event.text })
      else ctx.patchMessage(id, (prev) => ({ ...prev, thinking: (prev.thinking ?? "") + event.text, events: appendTextEvent(prev.events, event) }))
      // One thinking step per step of the turn, however many deltas it arrives in.
      if (!thinkingCounted.has(ctx.activity().step)) { thinkingCounted.add(ctx.activity().step); ctx.setStats((s) => ({ ...s, thinkingSteps: s.thinkingSteps + 1 })) }
      return
    }
    if (event.type === "user_message") {
      // A message written while the agent worked has been taken in: it goes into the transcript where it happened and what the
      // agent writes from here on answers it.
      const now = new Date().toISOString()
      const taken = ctx.pending().find((p) => p.text.trim() === event.text.trim())
      const previous = ctx.activeAssistantId()
      const answerId = nextMessageId()
      batch(() => {
        if (taken !== undefined) ctx.setPending((current) => current.filter((p) => p.id !== taken.id))
        if (previous !== undefined) ctx.patchMessage(previous, (prev) => ({ ...prev, status: prev.status === "streaming" ? "done" : prev.status }))
        ctx.appendMessage({ id: nextMessageId(), role: "user", text: event.text, createdAt: now, events: [], status: "done" })
        ctx.appendMessage({ id: answerId, role: "assistant", text: "", createdAt: now, events: [], status: "streaming" })
        ctx.setActiveAssistantId(answerId)
      })
      ctx.saveTranscript()
      return
    }
    if (event.type === "tool_progress") {
      ctx.setToolCalls((current) => current[event.callId]?.status === "running" || current[event.callId]?.status === "ok" || current[event.callId]?.status === "error"
        ? current
        : { ...current, [event.callId]: { tool: event.tool, input: {}, status: "preparing", chars: event.chars, sessionId: event.sessionId, ...(event.agent !== undefined ? { agent: event.agent } : {}) } })
      ctx.setActivity((a) => ({ ...a, preparing: { tool: event.tool, chars: event.chars } }))
      return
    }
    if (event.type === "step") {
      if (event.phase === "start") { ctx.setActivity((a) => ({ ...a, step: event.index, preparing: undefined })) }
      else if (event.usage) {
        const usage = event.usage
        streamedUsage = { inputTokens: streamedUsage.inputTokens + usage.inputTokens, outputTokens: streamedUsage.outputTokens + usage.outputTokens }
        ctx.setContextTokens(contextTokensOf(usage))
        ctx.setStats((s) => ({ ...s, totalInputTokens: s.totalInputTokens + usage.inputTokens, totalOutputTokens: s.totalOutputTokens + usage.outputTokens }))
      }
      return
    }
    if (event.type === "todo") { ctx.setPlan(event.todos); ctx.patchMessage(idForEvent, (prev) => ({ ...prev, events: [...prev.events, event] })); return }
    if (event.type === "goal") { ctx.setGoal(event.goal ?? undefined); return }
    if (event.type === "retry") {
      ctx.setActivity((a) => ({ ...a, retry: { attempt: event.attempt, message: event.message } }))
      // Shown where it happened, as nikcli's session view shows a retried request.
      if (ctx.messages().some((m) => m.id === idForEvent)) ctx.patchMessage(idForEvent, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "compacted") { ctx.setActivity((a) => ({ ...a, compacted: true })); return }
    if (event.type === "delta") {
      if (ctx.activity().retry !== undefined) ctx.setActivity((a) => ({ ...a, retry: undefined }))
      const id = idForEvent
      const exists = ctx.messages().some((m) => m.id === id)
      if (!exists) {
        ctx.appendMessage({ id, role: "assistant", text: event.text, createdAt: new Date().toISOString(), events: [event], status: "streaming" })
      } else {
        ctx.patchMessage(id, (prev) => ({ ...prev, text: prev.text + event.text, events: appendTextEvent(prev.events, event) }))
      }
      return
    }
    if (event.type === "tool_call") {
      const id = idForEvent
      ctx.setActivity((a) => ({ ...a, preparing: undefined, retry: undefined }))
      ctx.setToolCalls((current) => ({ ...current, [event.callId]: { tool: event.tool, input: event.input, status: "running", sessionId: event.sessionId, ...(event.agent !== undefined ? { agent: event.agent } : {}) } }))
      ctx.patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      ctx.setStats((s) => ({ ...s, toolCalls: s.toolCalls + 1 }))
      return
    }
    if (event.type === "tool_result") {
      // The CAD tools ran in the sidecar: show their result in the editor the user has open. A call made inside a `code_mode`
      // program arrives the same way, as its own event with its own input.
      const input = ctx.toolCalls()[event.callId]?.input
      const key = actionKey(event.tool, input)
      try { mirrorToolResult(key, event.ok, event.output, editorOwner) } catch (cause) { console.error("Could not mirror the tool result into the editor", cause) }
      // Whatever the tool answered, the stored drawing is the truth: bring the editor in line with it.
      if (event.ok && (event.tool.includes("cad_") || key === "cam_edit.stock_set" || event.tool.endsWith("cam_stock") || event.tool === "code_mode")) void reconcileCoalesced(ctx.app, editorOwner).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
      if (event.ok) void mirrorCamResult(ctx.app, key, input, event.output, editorOwner)
      if (event.tool === "agent") noteTasks(event.output)
      const id = idForEvent
      ctx.setToolCalls((current) => {
        const existing = current[event.callId]
        if (existing === undefined) return current
        return { ...current, [event.callId]: { ...existing, status: event.ok ? "ok" : "error", output: event.output, ...(event.images ? { images: event.images } : {}) } }
      })
      ctx.patchMessage(id, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "permission_request") {
      const permission: AiPermission = { requestId: event.requestId, permission: event.permission, patterns: event.patterns, sessionId: event.sessionId }
      ctx.setPermissions((current) => [...current.filter((item) => item.requestId !== permission.requestId), permission])
      ctx.patchMessage(idForEvent, (prev) => ({ ...prev, events: [...prev.events, event] }))
      return
    }
    if (event.type === "question_request") {
      ctx.setQuestions((current) => [...current.filter((q) => q.requestId !== event.requestId), { requestId: event.requestId, questions: event.questions }])
      return
    }
    if (event.type === "question_resolved") {
      ctx.setQuestions((current) => current.filter((q) => q.requestId !== event.requestId))
      return
    }
    if (event.type === "done") {
      void ctx.refreshControls()
      const id = idForEvent
      ctx.patchMessage(id, (prev) => ({ ...prev, status: "done", text: event.text || prev.text, usage: event.usage, finishedAt: new Date().toISOString() }))
      ctx.setStats((s) => ({
        ...s,
        exchanges: s.exchanges + 1,
        totalInputTokens: s.totalInputTokens + Math.max(0, (event.usage?.inputTokens ?? 0) - streamedUsage.inputTokens),
        totalOutputTokens: s.totalOutputTokens + Math.max(0, (event.usage?.outputTokens ?? 0) - streamedUsage.outputTokens)
      }))
      ctx.touchSession(ctx.sessionId() ?? event.sessionId, new Date().toISOString(), 1)
      ctx.saveTranscript()
      // The tool results of a recovered turn never reached us: the stored drawing is the truth, so the editor catches up with it.
      if (event.recovered === true) void reconcileFromStored(ctx.app, editorOwner).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
      return
    }
    if (event.type === "error") {
      const id = idForEvent
      if (ctx.messages().some((m) => m.id === id)) {
        ctx.patchMessage(id, (prev) => ({ ...prev, status: "error", error: event.message }))
      } else {
        ctx.appendMessage({ id, role: "assistant", text: event.message, createdAt: new Date().toISOString(), events: [], status: "error", error: event.message })
      }
      ctx.setError(sanitizeError(event.message))
      ctx.saveTranscript()
    }
  }

  return {
    apply,
    resetTurn: () => {
      thinkingCounted.clear()
      streamedUsage = { inputTokens: 0, outputTokens: 0 }
    }
  }
}
