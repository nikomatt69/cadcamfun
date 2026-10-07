/**
 * How a tool is defined (the way nikcli defines its own): one file per tool, `defineTool("id", { parameters, execute })`,
 * the description read from the tool's `.txt` prompt. `execute` receives the validated input and the `ToolContext`
 * (the sidecar's handlers and the active project) and returns a JSON-safe value; `toSpec` turns the definition into the
 * `HostToolSpec` the nikcli host registers.
 */
import { Schema } from "effect"
import type { z } from "zod"
import type { HostToolSpec } from "../nikcli/runtime.ts"
import type { ToolHandlersShape } from "./handlers.ts"
import { TOOL_PROMPT_IDS, toolPrompt, type ToolPromptId } from "./prompts/index.ts"

export interface ToolContext {
  readonly handlers: ToolHandlersShape
  readonly projectId: string
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

export const toSpec = (definition: ToolDefinition, context: ToolContext): HostToolSpec => ({
  id: definition.id,
  description: definition.description,
  parameters: definition.parameters,
  execute: async (input) => JSON.stringify(await definition.execute(input, context))
})

/** Handlers validate with the Effect Schema too, so zod and Effect cannot drift apart silently. */
export const validated = <A>(schema: Schema.Decoder<A>, value: unknown): A => Schema.decodeUnknownSync(schema)(value)
