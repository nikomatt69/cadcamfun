/**
 * Background tasks, and the answers that come back without a stream.
 *
 * When the agent hands a job to a specialist, the turn can end before the job
 * does. The host then wakes the agent by itself and the answer arrives with no
 * stream to carry it — so the desktop polls the host's session state until the
 * tasks are done and the answer is in.
 *
 * The polling loop lived in the middle of the store, between the event applier
 * and the control actions. It is its own concern with its own rules (one watcher
 * per conversation, a bounded number of quiet rounds, a cancellation when the
 * host forgets a task), so it lives here.
 */
import type { Accessor, Setter } from "solid-js"
import { type AppState } from "../../../shared/state/context.ts"
import { captureEditorOwner, reconcileFromStored } from "../lib/editor-sync.ts"
import type { AiContextState, AiMessage, AiPermission, AiPendingQuestion, AiTask } from "../lib/types.ts"

/** How often the host is asked how the conversation stands. */
export const POLL_MS = 2_000
/** How many rounds of silence end the watch: the host is not going to answer. */
export const WAKE_ROUNDS = 25
/** How many failed reads end the watch. */
const QUIET_ROUNDS = 5

export interface TaskWatcherContext {
  readonly app: AppState
  readonly sessionId: Accessor<string | undefined>
  readonly projectId: Accessor<string | undefined>
  /** The conversation the watch belongs to; a new conversation starts a new watch. */
  readonly conversationGeneration: Accessor<number>
  readonly status: Accessor<"idle" | "connecting" | "streaming" | "error">
  readonly messages: Accessor<ReadonlyArray<AiMessage>>
  readonly appendMessage: (message: AiMessage) => void
  readonly setPermissions: Setter<ReadonlyArray<AiPermission>>
  readonly setQuestions: Setter<ReadonlyArray<AiPendingQuestion>>
  readonly setHostContext: Setter<AiContextState | undefined>
  readonly setContextTokens: Setter<number>
  readonly setTasks: Setter<ReadonlyArray<AiTask>>
  readonly saveTranscript: () => void
  /** The id of the message a recovered answer belongs to. */
  readonly nextMessageId: () => string
}

export interface TaskWatcher {
  /** Starts the watch; a second call while one runs is ignored. */
  readonly watch: (initialBusy?: boolean) => Promise<void>
  /** Stops the watch. */
  readonly dispose: () => void
}

/** A task that has not finished yet. */
export const isActiveTask = (task: AiTask): boolean => task.status === "queued" || task.status === "running"

const anyActive = (list: ReadonlyArray<AiTask>): boolean => list.some(isActiveTask)

export const createTaskWatcher = (ctx: TaskWatcherContext): TaskWatcher => {
  let disposed = false
  let watchingGeneration: number | undefined

  const watch = async (initialBusy = false): Promise<void> => {
    const editorOwner = captureEditorOwner()
    const generation = ctx.conversationGeneration()
    if (watchingGeneration === generation) return
    watchingGeneration = generation
    const watchedSession = ctx.sessionId()
    const watchedProject = ctx.projectId()
    try {
      const delivered = new Set<string>()
      let woken = initialBusy
      let quiet = 0
      let waiting = 0
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        const sid = ctx.sessionId()
        if (disposed || generation !== ctx.conversationGeneration() || sid === undefined || sid !== watchedSession || ctx.projectId() !== watchedProject) return
        let state: { readonly busy: boolean; readonly text: string; readonly error?: string; readonly tasks?: ReadonlyArray<AiTask> } | undefined
        try {
          state = await ctx.app.runtime.run(ctx.app.client.ai.sessionControl({ payload: { action: "status", sessionId: sid, ...(ctx.projectId() !== undefined ? { projectId: ctx.projectId()! } : {}) } })) as typeof state
        } catch {
          if (++quiet >= QUIET_ROUNDS) return
          continue
        }
        if (disposed || generation !== ctx.conversationGeneration() || ctx.sessionId() !== watchedSession || ctx.projectId() !== watchedProject) return
        const controls = state as typeof state & { permissions?: ReadonlyArray<AiPermission>; questions?: ReadonlyArray<AiPendingQuestion>; context?: AiContextState }
        if (controls?.permissions) ctx.setPermissions(controls.permissions)
        if (controls?.questions) ctx.setQuestions(controls.questions)
        if (controls?.context) { ctx.setHostContext(controls.context); if (controls.context.tokens !== undefined) ctx.setContextTokens(controls.context.tokens) }
        quiet = 0
        const list = state?.tasks ?? []
        if (list.length > 0) ctx.setTasks((current) => {
          const known = new Set(list.map((t) => t.id))
          // A task the host no longer lists (it restarted) cannot finish: do not leave it spinning.
          const lost = current.filter((t) => !known.has(t.id) && isActiveTask(t) && ctx.status() === "idle").map((t) => ({ ...t, status: "cancelled" as const }))
          return [...list.map((t) => ({ ...t, background: t.background !== false })), ...lost]
        })
        else if (ctx.status() === "idle") ctx.setTasks((current) => current.map((t) => isActiveTask(t) ? { ...t, status: "cancelled" as const } : t))
        if (ctx.status() === "connecting" || ctx.status() === "streaming") { quiet = 0; waiting = 0; continue }
        if (anyActive(list)) { waiting = 0; continue }
        // Reports of finished background tasks come back to the agent on their own: wait for that turn, then show its answer.
        const owed = list.filter((t) => t.background && t.status !== "cancelled" && !delivered.has(t.id))
        if (state?.busy === true) { woken = true; waiting = 0; continue }
        if (woken) {
          for (const t of owed) delivered.add(t.id)
          const answer = state?.text.trim() ?? ""
          if (answer !== "" && !ctx.messages().some((m) => m.role === "assistant" && m.text === answer)) {
            ctx.appendMessage({ id: ctx.nextMessageId(), role: "assistant", text: answer, createdAt: new Date().toISOString(), events: [], status: "done" })
            ctx.saveTranscript()
          }
          // What the agent changed after the report is in the stored drawing, not in this editor yet.
          void reconcileFromStored(ctx.app, editorOwner).catch((cause) => console.error("Could not reconcile the editor with the stored drawing", cause))
          woken = false
          if (owed.length === 0) return
          continue
        }
        if (owed.length === 0 || ++waiting >= WAKE_ROUNDS) return
      }
    } finally {
      if (watchingGeneration === generation) watchingGeneration = undefined
    }
  }

  return {
    watch,
    dispose: () => { disposed = true }
  }
}
