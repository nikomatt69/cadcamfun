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

export interface ToolContext {
  readonly handlers: ToolHandlersShape
  readonly projectId: string
  readonly signal?: AbortSignal
  readonly sessionId?: string
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  readonly id: string
  readonly description: string
  /** zod 4 schema; nikcli sends its JSON Schema to the model and validates the call against it. */
  readonly parameters: S
  readonly execute: (input: z.infer<S>, context: ToolContext) => Promise<unknown>
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

export const toSpec = (definition: ToolDefinition, context: ToolContext): HostToolSpec => {
  const run = async (input: unknown, call: { signal: AbortSignal; sessionId: string }) => {
    try {
      if (call.signal.aborted) return { output: json({ ok: false, error: "Tool execution cancelled." }) }
      const parsed = definition.parameters.safeParse(sanitizeArguments(input))
      if (!parsed.success) return { output: json(toolValidationFailure(definition.id, parsed.error)) }
      const result = await definition.execute(parsed.data, { ...context, signal: call.signal, sessionId: call.sessionId })
      return result instanceof ToolMediaResult ? { output: json(result.value), files: result.files } : { output: json(result) }
    } catch (error) { return { output: json({ ok: false, error: safeToolError(error) }) } }
  }
  return {
    id: definition.id, description: definition.description, parameters: lenient(definition.parameters),
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
