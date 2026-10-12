import { Effect, Schema } from "effect"
import { z } from "zod"
import { defineTool, type ToolContext, type ToolDefinition } from "./define.ts"

export class ActionExecutionError extends Schema.TaggedError<ActionExecutionError>()("ActionExecutionError", {
  actionId: Schema.String,
  message: Schema.String
}) {}

export interface ActionDefinition {
  readonly parameters: z.ZodObject<Record<string, z.ZodType>>
  readonly kind: "read" | "write" | "destructive"
  readonly execute: (input: Record<string, unknown>, context: ToolContext) => Effect.Effect<unknown, ActionExecutionError>
}

export interface ActionTool extends ToolDefinition {
  readonly actions: Readonly<Record<string, ActionDefinition>>
  readonly kind: "read" | "write" | "destructive"
}

export const defineActionTool = (
  id: string,
  actions: Readonly<Record<string, ActionDefinition>>,
  description: string
): ActionTool => {
  const entries = Object.entries(actions)
  const catalogue = Object.freeze(Object.fromEntries(entries.map(([name, action]) => [name, Object.freeze({ ...action })])))
  if (entries.length === 0) throw new Error(`Action tool ${id} has no actions`)
  const read = entries.some(([, action]) => action.kind === "read")
  const write = entries.some(([, action]) => action.kind !== "read")
  if (read && write) throw new Error(`Action tool ${id} mixes read and write effects`)
  for (const [name, action] of entries) {
    if ("action" in action.parameters.shape) throw new Error(`Action ${id}.${name} must not redefine the discriminator`)
  }
  const variants = entries.map(([name, action]) =>
    action.parameters.extend({ action: z.literal(name) })
  )
  const first = variants[0]!
  const parameters = z.discriminatedUnion("action", [first, ...variants.slice(1)])
  const definition = defineTool(id, {
    description,
    parameters,
    execute: async (input, context) => {
      const name = String(input.action)
      const action = Object.hasOwn(catalogue, name) ? catalogue[name] : undefined
      if (action === undefined) return { ok: false, _tag: "ActionExecutionError", actionId: `${id}.${name}`, message: "Unknown action" }
      if (context.signal?.aborted) return { ok: false, _tag: "ActionInterrupted", actionId: `${id}.${name}` }
      const { action: _, ...payload } = input
      return Effect.runPromise(action.execute(payload, context).pipe(
        Effect.catchTag("ActionExecutionError", (error) => Effect.succeed({
          ok: false, _tag: error._tag, actionId: error.actionId, message: error.message
        }))
      ), { signal: context.signal })
    }
  })
  return {
    ...definition,
    execute: (input, context) => definition.execute(parameters.parse(input), context),
    actions: catalogue,
    kind: entries.some(([, action]) => action.kind === "destructive") ? "destructive" : write ? "write" : "read"
  }
}
