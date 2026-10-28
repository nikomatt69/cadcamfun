/**
 * How a tool is defined (the way nikcli defines its own): one file per tool, `defineTool("id", { parameters, execute })`,
 * the description read from the tool's `.txt` prompt. `execute` receives the validated input and the `ToolContext`
 * (the sidecar's handlers and the active project) and returns a JSON-safe value; `toSpec` turns the definition into the
 * `HostToolSpec` the nikcli host registers.
 */
import { Schema } from "effect"
import type { z } from "zod"
import type { FilePart } from "../attachments.ts"
import type { HostToolSpec } from "../nikcli/runtime.ts"
import type { ToolHandlersShape } from "./handlers.ts"
import { lenient, sanitizeArguments } from "./lenient-arguments.ts"
import { formatToolValidationError, toolValidationFailure } from "../tool-validation.ts"
import { TOOL_PROMPT_IDS, toolPrompt, type ToolPromptId } from "./prompts/index.ts"
import { toolOutput } from "./tool-output.ts"
import type { ActionOutcome } from "../actions/outcome.ts"

/** Trusted transport identity; these fields are supplied by the host/bridge, never by model arguments. */
export interface MutationExecution {
  readonly actionId: string
  readonly input: unknown
  readonly projectId: string
  readonly sessionId?: string
  readonly callId?: string
  readonly messageId?: string
  readonly signal?: AbortSignal
}

export type MutationExecutor = (request: MutationExecution, run: () => Promise<ActionOutcome>) => Promise<ActionOutcome>

/** An implementation the application contributes for a catalogue action it owns (libraries, version control, delegation). */
export type ActionContribution = (input: never, context: ToolContext) => Promise<unknown>

export interface ToolContext {
  readonly handlers: ToolHandlersShape
  readonly projectId: string
  readonly signal?: AbortSignal
  readonly sessionId?: string
  readonly callId?: string
  readonly messageId?: string
  readonly executeMutation?: MutationExecutor
  readonly taskTarget?: { readonly actorId?: string; readonly drawingId?: string; readonly revision?: string; readonly turnId?: string }
  readonly validateDelegation?: (ids: readonly string[]) => Promise<{ readonly ok: boolean; readonly error?: string }>
  /** Present only where the host contributes implementations (the sidecar); a missing one answers "not available". */
  readonly contributions?: Readonly<Record<string, ActionContribution>>
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  readonly id: string
  readonly description: string
  /** zod 4 schema; nikcli sends its JSON Schema to the model and validates the call against it. */
  readonly parameters: S
  readonly execute: (input: z.infer<S>, context: ToolContext) => Promise<unknown>
  /** The host asks the person before each call (an extension tool that changes something: its author is not this application). */
  readonly approval?: boolean
}

export interface ToolConfig<S extends z.ZodType> {
  /** Defaults to the tool's `.txt` prompt; required for a tool that has none (an extension tool). */
  readonly description?: string
  readonly parameters: S
  readonly execute: ToolDefinition<S>["execute"]
}

const isPromptId = (id: string): id is ToolPromptId => (TOOL_PROMPT_IDS as ReadonlyArray<string>).includes(id)

export const defineTool = <S extends z.ZodType>(id: string, config: ToolConfig<S>): ToolDefinition<S> => {
  const description = config.description ?? (isPromptId(id) ? toolPrompt(id) : undefined)
  if (description === undefined) throw new Error(`Tool ${id} has no prompt: add tools/prompts/${id}.txt or give a description`)
  return { id, description, parameters: config.parameters, execute: config.execute }
}

/** Images are host file parts, never base64 embedded in the text transcript. */
export class ToolMediaResult {
  constructor(readonly value: unknown, readonly files: ReadonlyArray<FilePart>) {}
}

/**
 * The host spec of one tool. Every answer has two faces (`tool-output.ts`): the whole validated value, which Code Mode
 * and the stored part receive, and the bounded text the model reads, which declares anything it leaves out.
 */
export const toSpec = (definition: ToolDefinition, context: ToolContext): HostToolSpec => {
  const answer = (value: unknown, files?: ReadonlyArray<FilePart>) => {
    const out = toolOutput(value)
    return { output: out.text, value, outcome: out.outcome, bounded: out.bounded, ...(files !== undefined ? { files } : {}) }
  }
  const run = async (input: unknown, call: { signal: AbortSignal; sessionId: string; callId?: string; messageId?: string; executeMutation?: MutationExecutor; taskTarget?: ToolContext["taskTarget"]; validateDelegation?: ToolContext["validateDelegation"] }) => {
    try {
      if (call.signal.aborted) return answer({ ok: false, error: "Tool execution cancelled." })
      const parsed = definition.parameters.safeParse(sanitizeArguments(input))
      if (!parsed.success) return answer(toolValidationFailure(definition.id, parsed.error))
      const result = await definition.execute(parsed.data, {
        ...context, signal: call.signal, sessionId: call.sessionId,
        ...(call.callId !== undefined ? { callId: call.callId } : {}),
        ...(call.messageId !== undefined ? { messageId: call.messageId } : {}),
        ...(call.executeMutation !== undefined ? { executeMutation: call.executeMutation } : {}),
        ...(call.taskTarget !== undefined ? { taskTarget: call.taskTarget } : {}),
        ...(call.validateDelegation !== undefined ? { validateDelegation: call.validateDelegation } : {})
      })
      return result instanceof ToolMediaResult ? answer(result.value, result.files) : answer(result)
    } catch (error) { return answer({ ok: false, error: safeToolError(error) }) }
  }
  return {
    id: definition.id, description: definition.description, parameters: lenient(definition.parameters),
    ...(definition.approval === true ? { approval: true } : {}),
    formatValidationError: (error) => formatToolValidationError(definition.id, error),
    execute: async (input, call) => (await run(input, call)).output,
    executeWithFiles: run
  }
}

const json = (value: unknown): string => {
  try {
    const encoded = JSON.stringify(value)
    return encoded ?? JSON.stringify({ ok: false, error: "Tool returned an empty result." })
  } catch {
    return JSON.stringify({ ok: false, error: "Tool returned a value that cannot be serialized." })
  }
}

const safeToolError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "Tool execution failed."
  return message
    .replace(/\b(bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/\b(api[_ -]?key|token|secret)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]")
    .replace(/(?:\/Users\/|\/Volumes\/|[A-Z]:\\Users\\)[^\s"']+/g, "[local path]")
    .slice(0, 500)
}

/** Handlers validate with the Effect Schema too, so zod and Effect cannot drift apart silently. */
export const validated = <A>(schema: Schema.Decoder<A>, value: unknown): A => Schema.decodeUnknownSync(schema)(value)
