import type { HostQuestionRequest } from "@nikcli-ai/sdk-next"
import type { ProjectHost } from "./runtime.ts"
import type { HostCompactionSettings } from "./config.ts"
import type { HostModelInfo } from "./catalog.ts"
import { childAgent } from "./agents.ts"

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

/** Mirrors nikcli's overflow.ts; the host remains responsible for triggering compaction. */
export const contextBudget = (model: Pick<HostModelInfo, "contextWindow" | "maxOutput" | "inputWindow">, policy: HostCompactionSettings = {}) => {
  if (!(model.contextWindow > 0)) return {}
  const output = Math.min(model.maxOutput, 32_000) || 32_000
  const reserved = policy.reserved ?? Math.min(20_000, output)
  return { contextWindow: model.contextWindow, maxOutput: model.maxOutput, requestOutput: output,
    ...(model.inputWindow ? { inputWindow: model.inputWindow } : {}),
    compactAt: Math.max(0, model.inputWindow ? model.inputWindow - reserved : model.contextWindow - output) }
}

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
