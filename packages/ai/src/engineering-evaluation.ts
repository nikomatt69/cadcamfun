/** Opt-in request → real AiService tool loop → stored geometry → deterministic acceptance. No provider is called on import. */
import { AcceptanceCheck as AcceptanceCheckSchema } from "@cadcamfun/api"
import { Context, Effect, Schema, Stream } from "effect"
import type { AcceptanceCheck, AcceptanceReport } from "./acceptance.ts"
import type { ChatInput, AiService } from "./service.ts"
import type { ModelSelector } from "./models.ts"
import { engineeringDigest } from "./engineering-state.ts"
import { runKernelJob } from "./kernel-job.ts"

const CorpusCase = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  part: Schema.String.check(Schema.isMinLength(1)),
  checks: Schema.Array(AcceptanceCheckSchema).check(Schema.isMinLength(1), Schema.isMaxLength(24))
})
const Corpus = Schema.Struct({ version: Schema.Int.check(Schema.isGreaterThan(0)), cases: Schema.Array(CorpusCase).check(Schema.isMinLength(1)) })
export type EngineeringEvaluationCase = typeof CorpusCase.Type

export interface EngineeringEvaluationBudget {
  readonly maxCases: number
  readonly maxTotalTokens: number
  readonly tokensPerCase: number
  readonly maxStepsPerCase: number
  readonly maxDurationMs: number
}

export interface EngineeringEvaluationFixture {
  readonly projectId: string
  readonly drawingId: string
  readonly sessionId?: string
  /** Real admitted session binding for this isolated fixture; never supplied by the model. */
  readonly admitSession: NonNullable<ChatInput["admitSession"]>
  /** Read the actual stored target after the assistant runs. Never return the corpus's supplied recipe or history here. */
  readonly inspect: () => Promise<{ readonly revision: string; readonly history: unknown; readonly elementId: string } | undefined>
  readonly close: () => Promise<void>
}

export interface EngineeringEvaluationCaseResult {
  readonly id: string
  readonly status: "accepted" | "rejected" | "unmeasured" | "stale" | "budget_limited" | "cancelled" | "error"
  readonly sessionId?: string
  readonly revision?: string
  readonly elementId?: string
  readonly report?: AcceptanceReport
  readonly tokens?: number
  readonly steps: number
  readonly toolCalls: number
  readonly toolFailures: number
  readonly compactions: number
  readonly durationMs: number
  readonly error?: string
}

export interface EngineeringEvaluationRun {
  readonly version: 1
  readonly kind: "offline-wiring" | "stochastic-quality"
  readonly corpusVersion: number
  readonly corpusDigest: string
  readonly model: ModelSelector
  readonly configurationDigest: string
  readonly startedAt: string
  readonly durationMs: number
  readonly budget: EngineeringEvaluationBudget
  /** Native goal threshold + observed-usage/step cancellation; a provider's in-flight request can exceed a threshold. */
  readonly budgetEnforcement: "native-goal-and-observed-usage"
  readonly status: "completed" | "budget_limited" | "cancelled"
  readonly cases: ReadonlyArray<EngineeringEvaluationCaseResult>
  readonly totals: { readonly accepted: number; readonly measured: number; readonly tokensKnown: number; readonly tokenUsageUnavailable: number }
}

const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0
const checksPrompt = (checks: ReadonlyArray<AcceptanceCheck>): string => `Acceptance criteria in mm / mm³; use the named feature IDs where a hole check names one:\n${JSON.stringify(checks)}`

/**
 * The caller explicitly supplies a budget, model and isolated fixture preparation. This function consumes the actual
 * production chat stream and measures saved history in the existing kernel worker; it does not grade model prose or use
 * the reference history in a corpus as the answer. Unknown usage stops further cases rather than treating the calls as free.
 */
export const runEngineeringEvaluation = async (input: {
  readonly ai: AiService["Service"]
  readonly corpus: unknown
  readonly caseIds: ReadonlyArray<string>
  readonly model: ModelSelector
  readonly configuration: Readonly<Record<string, unknown>>
  readonly kind: EngineeringEvaluationRun["kind"]
  readonly budget: EngineeringEvaluationBudget
  readonly prepare: (entry: EngineeringEvaluationCase, signal: AbortSignal) => Promise<EngineeringEvaluationFixture>
  readonly signal?: AbortSignal
}): Promise<EngineeringEvaluationRun> => {
  const corpus = Schema.decodeUnknownSync(Corpus)(input.corpus)
  if (!Object.values(input.budget).every(positive)) throw new Error("Every evaluation budget must be an explicit positive integer.")
  if (new Set(corpus.cases.map((entry) => entry.id)).size !== corpus.cases.length) throw new Error("The evaluation corpus contains duplicate case IDs.")
  if (input.caseIds.length === 0 || new Set(input.caseIds).size !== input.caseIds.length) throw new Error("Select a nonempty, unique list of evaluation case IDs.")
  const selected = input.caseIds.map((id) => {
    const entry = corpus.cases.find((candidate) => candidate.id === id)
    if (entry === undefined) throw new Error(`Unknown evaluation case: ${id}`)
    return entry
  })
  if (selected.length > input.budget.maxCases) throw new Error("The selected cases exceed maxCases; nothing was run.")
  const start = performance.now()
  const startedAt = new Date().toISOString()
  const results: EngineeringEvaluationCaseResult[] = []
  let tokensKnown = 0
  let tokenUsageUnavailable = 0
  let status: EngineeringEvaluationRun["status"] = "completed"
  for (const entry of selected) {
    if (input.signal?.aborted) { status = "cancelled"; break }
    const remainingMs = input.budget.maxDurationMs - (performance.now() - start)
    const remainingTokens = input.budget.maxTotalTokens - tokensKnown
    if (remainingMs <= 0 || remainingTokens <= 0 || tokenUsageUnavailable > 0) { status = "budget_limited"; break }
    const controller = new AbortController()
    const onAbort = () => controller.abort(input.signal?.reason)
    input.signal?.addEventListener("abort", onAbort, { once: true })
    let sessionId: string | undefined
    let fixture: EngineeringEvaluationFixture | undefined
    let limited = false
    const abort = async () => {
      controller.abort(new Error("Evaluation budget reached"))
      if (sessionId !== undefined && fixture !== undefined) await Effect.runPromise(input.ai.abort(sessionId, fixture.projectId)).catch(() => undefined)
    }
    const timeout = setTimeout(() => { limited = true; void abort() }, remainingMs)
    const caseStart = performance.now()
    let steps = 0, toolCalls = 0, toolFailures = 0, compactions = 0
    let tokens: number | undefined
    const completedSteps = new Set<number>()
    let streamError: string | undefined
    try {
      fixture = await input.prepare(entry, controller.signal)
      controller.signal.throwIfAborted()
      const tokenLimit = Math.min(input.budget.tokensPerCase, remainingTokens)
      const stream = input.ai.chat({
        ...(fixture.sessionId !== undefined ? { sessionId: fixture.sessionId } : {}),
        projectId: fixture.projectId,
        message: `/goal --token-budget ${tokenLimit} ${entry.part}\n${checksPrompt(entry.checks)}`,
        model: input.model, agent: "build", permissionMode: "approve", admitSession: fixture.admitSession
      })
      for await (const event of Stream.toAsyncIterableWith(stream, Context.empty())) {
        if ("sessionId" in event && typeof event.sessionId === "string") sessionId = event.sessionId
        if (event.type === "step" && event.phase === "start") steps++
        if (event.type === "step" && event.phase === "finish" && event.usage !== undefined && !completedSteps.has(event.index)) {
          completedSteps.add(event.index)
          tokens = (tokens ?? 0) + event.usage.inputTokens + event.usage.outputTokens
        }
        if (event.type === "done" && completedSteps.size === 0 && event.usage !== undefined) tokens = event.usage.inputTokens + event.usage.outputTokens
        if (event.type === "tool_call") toolCalls++
        if (event.type === "tool_result" && !event.ok) toolFailures++
        if (event.type === "compaction" && event.phase === "finish") compactions++
        if (event.type === "error") streamError = event.message
        if ((tokens ?? 0) >= tokenLimit || (event.type === "step" && event.phase === "finish" && steps >= input.budget.maxStepsPerCase)) {
          limited = true
          await abort()
          break
        }
        if (controller.signal.aborted) break
      }
      const target = await fixture.inspect()
      let report: AcceptanceReport | undefined
      let stale = false
      if (target !== undefined && !controller.signal.aborted) {
        report = await runKernelJob("acceptance", { history: target.history, checks: entry.checks }, { signal: controller.signal })
        const latest = await fixture.inspect()
        stale = latest === undefined || latest.revision !== target.revision || latest.elementId !== target.elementId
      }
      results.push({ id: entry.id, status: limited ? "budget_limited" : input.signal?.aborted ? "cancelled" : streamError !== undefined ? "error" : stale ? "stale" : report === undefined ? "unmeasured" : report.accepted ? "accepted" : "rejected", ...(sessionId !== undefined ? { sessionId } : {}), ...(target !== undefined ? { revision: target.revision, elementId: target.elementId } : {}), ...(report !== undefined ? { report } : {}), ...(tokens !== undefined ? { tokens } : {}), steps, toolCalls, toolFailures, compactions, durationMs: performance.now() - caseStart, ...(streamError !== undefined ? { error: streamError } : {}) })
    } catch (cause) {
      results.push({ id: entry.id, status: limited ? "budget_limited" : input.signal?.aborted ? "cancelled" : "error", ...(sessionId !== undefined ? { sessionId } : {}), ...(tokens !== undefined ? { tokens } : {}), steps, toolCalls, toolFailures, compactions, durationMs: performance.now() - caseStart, error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      clearTimeout(timeout)
      input.signal?.removeEventListener("abort", onAbort)
      await fixture?.close()
    }
    if (tokens === undefined) tokenUsageUnavailable++
    else tokensKnown += tokens
    if (input.signal?.aborted) { status = "cancelled"; break }
    if (limited) { status = "budget_limited"; break }
  }
  return { version: 1, kind: input.kind, corpusVersion: corpus.version, corpusDigest: engineeringDigest(input.corpus), model: input.model, configurationDigest: engineeringDigest(input.configuration), startedAt, durationMs: performance.now() - start, budget: input.budget, budgetEnforcement: "native-goal-and-observed-usage", status, cases: results, totals: { accepted: results.filter((entry) => entry.status === "accepted").length, measured: results.filter((entry) => entry.report !== undefined).length, tokensKnown, tokenUsageUnavailable } }
}
