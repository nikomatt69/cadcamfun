/**
 * The commands the desktop sends to the host's own session: read its state,
 * compact the conversation, consolidate its memory, answer a question, cancel a
 * task.
 *
 * They are one request family with one rule — a *read* never blocks a command and
 * never raises the error banner, a *write* is exclusive and reports what went
 * wrong — so they belong together rather than in the middle of the store.
 */
import type { Accessor, Setter } from "solid-js"
import { sanitizeError } from "../lib/errors.ts"
import { type AppState } from "../../../shared/state/context.ts"
import type { AiActivity, AiContextState, AiGoal, AiMode, AiPermission, AiPendingQuestion, AiTask, ChatModel } from "../lib/types.ts"

export type ControlAction =
  | "status"
  | "context"
  | "compact"
  | "cancel_task"
  | "answer_question"
  | "reject_question"
  | "consolidate_memory"

export interface ControlFields {
  readonly taskId?: string
  readonly requestId?: string
  readonly answers?: ReadonlyArray<ReadonlyArray<string>>
}

export interface ControlsContext {
  readonly app: AppState
  readonly sessionId: Accessor<string | undefined>
  readonly projectId: Accessor<string | undefined>
  readonly model: Accessor<ChatModel | undefined>
  readonly status: Accessor<"idle" | "connecting" | "streaming" | "error">
  /** The conversation the control belongs to; a new conversation starts a new one. */
  readonly conversationGeneration: Accessor<number>
  readonly controlBusy: Accessor<boolean>
  readonly controlError: Accessor<string | undefined>
  readonly setControlBusy: Setter<boolean>
  readonly setControlError: Setter<string | undefined>
  readonly setPermissions: Setter<ReadonlyArray<AiPermission>>
  readonly setQuestions: Setter<ReadonlyArray<AiPendingQuestion>>
  readonly setTasks: Setter<ReadonlyArray<AiTask>>
  readonly setPluginModes: Setter<ReadonlyArray<AiMode>>
  readonly setGoal: Setter<AiGoal | undefined>
  readonly setHostContext: Setter<AiContextState | undefined>
  readonly setContextTokens: Setter<number>
  readonly setActivity: Setter<AiActivity>
  /** Starts the background-task watch when the host says it is still working. */
  readonly watchTasks: (busy: boolean) => void
}

export interface Controls {
  readonly control: (action: ControlAction, fields?: ControlFields) => Promise<void>
  readonly refreshControls: () => Promise<void>
  readonly refreshModes: () => void
  readonly loadContextBreakdown: () => Promise<void>
  readonly consolidateMemory: () => Promise<void>
  readonly compact: () => Promise<void>
  readonly cancelTask: (taskId: string) => Promise<void>
  readonly replyQuestion: (requestId: string, answers?: ReadonlyArray<ReadonlyArray<string>>) => Promise<void>
}

export const createControls = (ctx: ControlsContext): Controls => {
  const control = async (action: ControlAction, fields: ControlFields = {}): Promise<void> => {
    const sid = ctx.sessionId()
    const project = ctx.projectId()
    const generation = ctx.conversationGeneration()
    const current = () => ctx.sessionId() === sid && ctx.projectId() === project && generation === ctx.conversationGeneration()
    // Reads (`status`, `context`) are silent: they never block a command and never raise the error banner.
    const read = action === "status" || action === "context"
    if (!sid || (!read && ctx.controlBusy())) return
    if (!read) { ctx.setControlBusy(true); ctx.setControlError(undefined) }
    try {
      const state = await ctx.app.runtime.run(ctx.app.client.ai.sessionControl({ payload: { sessionId: sid, ...(project ? { projectId: project } : {}), action, ...fields, ...(ctx.model() ? { model: ctx.model()! } : {}) } }))
      if (!current()) return
      if (state.permissions) ctx.setPermissions(state.permissions)
      ctx.setQuestions(state.questions)
      ctx.setTasks(state.tasks)
      // The goal lives in the host session (nikcli `/goal`): a reloaded window reads it back instead of showing none.
      if (state.goal !== undefined) ctx.setGoal(state.goal ?? undefined)
      // The breakdown is only sent on request: a later status poll keeps the last one rather than blanking the gauge.
      ctx.setHostContext((previous) => ({ ...state.context, ...(state.context.breakdown === undefined && previous?.breakdown !== undefined ? { breakdown: previous.breakdown } : {}) }))
      if (state.context.tokens !== undefined) ctx.setContextTokens(state.context.tokens)
      if (state.context.compacted) { ctx.setContextTokens(0); ctx.setActivity((current) => ({ ...current, compacted: true })) }
      if ((state.busy && ctx.status() !== "streaming" && ctx.status() !== "connecting") || hasActiveTask(state.tasks)) ctx.watchTasks(state.busy)
    } catch (cause) {
      if (!read && current()) ctx.setControlError(sanitizeError(cause instanceof Error ? cause.message : String(cause)))
    } finally {
      if (!read && current()) ctx.setControlBusy(false)
    }
  }

  return {
    control,
    refreshControls: () => control("status"),
    refreshModes: () => {
      void ctx.app.runtime.run(ctx.app.client.ai.modes()).then((reply) => ctx.setPluginModes(reply.modes)).catch(() => undefined)
    },
    loadContextBreakdown: () => control("context"),
    consolidateMemory: () => control("consolidate_memory"),
    compact: () => control("compact"),
    cancelTask: (taskId) => control("cancel_task", { taskId }),
    replyQuestion: (requestId, answers) => control(answers ? "answer_question" : "reject_question", { requestId, ...(answers ? { answers } : {}) })
  }
}

/** A task that has not finished yet. */
const hasActiveTask = (list: ReadonlyArray<AiTask>): boolean =>
  list.some((task) => task.status === "queued" || task.status === "running")
