import type { HostQuestionRequest } from "@nikcli-ai/sdk-next"
import type { ProjectHost } from "./runtime.ts"
import type { HostCompactionSettings } from "./config.ts"
import type { HostModelInfo } from "./catalog.ts"
import { childAgent } from "./agents.ts"
import { OUTPUT_TOKEN_MAX } from "../transform.ts"

export interface SessionControlInput {
  readonly sessionId: string
  readonly projectId?: string
  readonly action: "status" | "compact" | "cancel_task" | "answer_question" | "reject_question" | "reply_permission" | "consolidate_memory" | "context"
  readonly taskId?: string
  readonly requestId?: string
  readonly answers?: ReadonlyArray<ReadonlyArray<string>>
  readonly decision?: "once" | "always" | "reject"
  readonly model?: { readonly provider?: string; readonly model?: string }
}

/** nikcli's `COMPACTION_BUFFER` (`session/overflow.ts`): the room kept below an input window before the host summarises. */
export const COMPACTION_BUFFER = 20_000

type BudgetModel = Pick<HostModelInfo, "contextWindow" | "maxOutput" | "inputWindow">

/**
 * Tokens the conversation may hold before the host summarises it: nikcli's `usable` (`session/overflow.ts`) and the only place
 * the formula lives here. A model with an input window keeps `reserved` below it (default: the request's output, capped at the
 * buffer); one without keeps the output of one request below its context window. Zero for a model the catalogue gives no window.
 */
export const usableContext = (model: BudgetModel, policy: HostCompactionSettings = {}): number => {
  if (!(model.contextWindow > 0)) return 0
  const output = Math.min(model.maxOutput, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX
  const reserved = policy.reserved ?? Math.min(COMPACTION_BUFFER, output)
  return Math.max(0, model.inputWindow ? model.inputWindow - reserved : model.contextWindow - output)
}

/** The numbers behind the context gauge and the compaction warning; empty for a model without a window. */
export const contextBudget = (model: BudgetModel, policy: HostCompactionSettings = {}) => {
  if (!(model.contextWindow > 0)) return {}
  return { contextWindow: model.contextWindow, maxOutput: model.maxOutput, requestOutput: Math.min(model.maxOutput, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX,
    ...(model.inputWindow ? { inputWindow: model.inputWindow } : {}),
    compactAt: usableContext(model, policy) }
}

/** Bounds of a compaction summary, in tokens (spec 64 Phase 5 step 5). */
export const COMPACTION_TARGET_MIN = 2_000
export const COMPACTION_TARGET_MAX = 12_000
export const COMPACTION_TARGET_SHARE = 0.06

/**
 * How large the summary of a compaction may be for a model whose usable window is `usable` tokens (`usableContext`, the
 * gauge's `compactAt`): 6 % of it, between 2 000 and 12 000 tokens. A 128 k model keeps a tight summary, a 1 M model keeps more
 * state. A model with no known window gets the lower bound.
 */
export const compactionSizeTarget = (usable: number): number =>
  Math.round(Math.min(COMPACTION_TARGET_MAX, Math.max(COMPACTION_TARGET_MIN, (Number.isFinite(usable) && usable > 0 ? usable : 0) * COMPACTION_TARGET_SHARE)))

export const questionsForSession = async (host: ProjectHost, sessionId: string): Promise<ReadonlyArray<HostQuestionRequest>> =>
  (await host.client.question.list()).filter((request) => request.sessionID === sessionId || childAgent(sessionId, request.sessionID) !== undefined)

export const replySessionQuestion = async (host: ProjectHost, sessionId: string, input: SessionControlInput): Promise<void> => {
  const request = (await questionsForSession(host, sessionId)).find((question) => question.id === input.requestId)
  if (!request) throw new Error("This question is no longer pending in this conversation.")
  if (input.action === "reject_question") { await host.client.question.reject({ requestID: request.id }); return }
  const answers = input.answers
  if (!answers || answers.length !== request.questions.length) throw new Error("Provide one answer array for each question.")
  request.questions.forEach((question, index) => {
    const selected = answers[index]!
    if (selected.length === 0 || selected.some((answer) => !answer.trim() || answer.length > 4000)) throw new Error("Each question requires a nonempty answer.")
    if (!question.multiple && selected.length > 1) throw new Error("This question accepts only one answer.")
    if (question.custom === false && selected.some((answer) => !question.options.some((option) => option.label === answer))) throw new Error("Select one of the available answers.")
  })
  await host.client.question.reply({ requestID: request.id, answers })
}
