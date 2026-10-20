/**
 * `defineActionTool`: the adapter that turns a group of catalogue actions into the tool the model sees, exactly the
 * way `defineTool` turns a schema into one (spec 26 §2.3).
 *
 * The whole point of grouping is that the model spends one description per capability instead of one per verb. The
 * price is that the host's permission map is keyed by tool id, so a tool's kind is the strongest kind of its actions:
 * a group with one write is a write tool, which a read-only role never receives, whatever honest `read` actions it
 * also carries (listing delegated tasks is a read, yet `agent` is a write tool). A group that contains a destructive
 * action asks in Standard/Ask. Auto uses the host adapter's native action-pattern rules (permission-modes.ts).
 */
import { z } from "zod"
import { defineTool, ToolMediaResult, type ToolContext, type ToolDefinition } from "./define.ts"
import type { ActionContext, ActionKind, ActionSpec } from "../actions/action.ts"
import { executeAction } from "../actions/action.ts"

export interface ActionTool extends ToolDefinition {
  /** The actions this tool carries, keyed by action name. */
  readonly actions: Readonly<Record<string, ActionSpec>>
  /** The strongest effect in the group; the permission class of the tool. */
  readonly kind: ActionKind
}

export const defineActionTool = (id: string, actions: Readonly<Record<string, ActionSpec>>, description?: string): ActionTool => {
  const entries = Object.entries(actions)
  if (entries.length === 0) throw new Error(`Action tool ${id} has no actions`)
  const kinds = new Set(entries.map(([, action]) => action.kind))
  for (const [name, action] of entries) {
    if ("action" in action.parameters.shape) throw new Error(`Action ${id}.${name} must not redefine the discriminator`)
  }
  const catalogue = Object.freeze(Object.fromEntries(entries.map(([name, action]) => [name, Object.freeze({ ...action })])))
  const variants = entries.map(([name, action]) => action.parameters.extend({ action: z.literal(name) }))
  const parameters = z.discriminatedUnion("action", [variants[0]!, ...variants.slice(1)])
  const kind: ActionKind = kinds.has("destructive") ? "destructive" : kinds.has("write") ? "write" : "read"

  const definition = defineTool(id, {
    // Every tool of ours reads its prompt; only an extension without one brings its own text.
    ...(description !== undefined ? { description } : {}),
    parameters,
    execute: async (input, toolContext) => {
      const context = toolContext as ActionContext
      const name = String(input.action)
      const action = Object.hasOwn(catalogue, name) ? catalogue[name]! : undefined
      if (action === undefined) return { ok: false, _tag: "ActionInvalidInput", actionId: `${id}.${name}`, error: `Unknown action ${name}. Use one of: ${Object.keys(catalogue).join(", ")}.` }
      if (context.signal?.aborted) return { ok: false, _tag: "ActionInterrupted", actionId: `${id}.${name}`, error: "Tool execution cancelled." }
      const { action: _discriminator, ...payload } = input as Record<string, unknown>
      // One Promise crossing per call: the Effect is run here and nowhere else.
      return executeAction(action, payload, context)
    }
  })

  return {
    ...definition,
    // The host's schema is the union; the definition is also used directly (tests, the desktop), so it parses too.
    execute: (input, context) => definition.execute(parameters.parse(input), context),
    actions: catalogue,
    kind
  }
}

export type { ToolContext, ActionContribution } from "./define.ts"
export { ToolMediaResult } from "./define.ts"
export { defineAction, contributedAction } from "../actions/action.ts"
