/**
 * The second face of the action catalogue (RM-11, spec 27): what a standalone nikcli can list and call over HTTP.
 *
 * The embedded host calls the catalogue in-process (`defineActionTool`); this module describes the same tools to an outside
 * client and decides, per action, whether an outside call is admitted. Nothing here is a second declaration: the tool ids,
 * their descriptions, their parameter schemas and every action's effect come from `BUILT_IN_TOOLS`, so an action cannot exist
 * on one face and not on the other, and the parity test derives both from the catalogue.
 *
 * Admission, by the action's effect (`read` | `write` | `destructive`):
 * - `read` and `write` are admitted: the caller is authenticated, the project is checked, and writes run as the account that
 *   holds the token, exactly like the in-app agent's.
 * - `destructive` is refused. In the app the host asks the person before such a call; an outside client has no such prompt, and
 *   a flag in the arguments (`confirm: true`) is not an approval. The refusal says where to do it.
 * - `agent` (delegation to specialists) is in-process only: it starts model sessions inside the application.
 *
 * The operator narrows it with nikcli's own policy (`<data dir>/ai/policy.json`, `nikcli/policy.ts`): `bridge.use` on a tool id or
 * on `tool.action` (`{ "effect": "deny", "action": "bridge.use", "resource": "cad_edit.*" }` makes the bridge read-only for CAD), and
 * `tool.use` on a tool id, which already takes the tool away from the in-app agent, takes it away from outside as well.
 */
import { z } from "zod"
import type { ActionKind } from "./action.ts"
import { BUILT_IN_TOOLS } from "../tools/registry.ts"
import { lenient } from "../tools/lenient-arguments.ts"
import { policyAllows, toolAllowed, type PolicyStatement } from "../nikcli/policy.ts"

/** Tools that exist only in-process, by design. */
/** What a scoped token may do: `read` reaches only read actions, `write` reaches reads and writes (never destructive ones). */
export type BridgeMode = "read" | "write"

export const BRIDGE_EXCLUDED_TOOLS: ReadonlyArray<string> = ["agent", "mods", "mods_edit"]

export interface BridgeAction {
  readonly id: string
  readonly name: string
  readonly kind: ActionKind
}

export interface BridgeTool {
  readonly id: string
  readonly description: string
  /** The strongest effect in the group, as the in-app permission class. */
  readonly kind: ActionKind
  readonly actions: ReadonlyArray<BridgeAction>
  /** JSON Schema of the tool's arguments (a union over the actions, discriminated by `action`). */
  readonly parameters: Readonly<Record<string, unknown>>
}

/** Every tool an outside client can call, with its actions and the JSON Schema of its arguments. */
export const describeBridge = (): ReadonlyArray<BridgeTool> =>
  BUILT_IN_TOOLS.filter((tool) => !BRIDGE_EXCLUDED_TOOLS.includes(tool.id)).map((tool) => ({
    id: tool.id,
    description: tool.description,
    kind: tool.kind,
    actions: Object.entries(tool.actions).map(([name, spec]) => ({ id: spec.id, name, kind: spec.kind })),
    parameters: z.toJSONSchema(lenient(tool.parameters) as never) as Record<string, unknown>
  }))

/** Whether the policy lets an outside client use `tool` (or one of its actions, when named). */
export const bridgeAllowed = (policies: ReadonlyArray<PolicyStatement>, tool: string, action?: string): boolean =>
  toolAllowed(policies, tool) && policyAllows(policies, { action: "bridge.use", resource: tool }) &&
  (action === undefined || policyAllows(policies, { action: "bridge.use", resource: `${tool}.${action}` }))

/** The catalogue as the policy leaves it: tools the policy denies are gone, and so are their denied actions. */
export const scopeBridge = (tools: ReadonlyArray<BridgeTool>, policies: ReadonlyArray<PolicyStatement>, mode: BridgeMode = "write"): ReadonlyArray<BridgeTool> =>
  policies.length === 0 && mode === "write" ? tools : tools
    .filter((tool) => bridgeAllowed(policies, tool.id))
    .map((tool) => ({ ...tool, actions: tool.actions.filter((action) => bridgeAllowed(policies, tool.id, action.name) && (mode === "write" || action.kind === "read")) }))
    .filter((tool) => tool.actions.length > 0)

export type BridgeAdmission =
  | { readonly ok: true; readonly tool: string; readonly action: string; readonly kind: ActionKind }
  | { readonly ok: false; readonly error: string }

/** Whether an outside call of `tool` with these arguments is admitted, before anything runs. */
export const bridgeAdmission = (toolId: string, input: unknown, policies: ReadonlyArray<PolicyStatement> = [], mode: BridgeMode = "write"): BridgeAdmission => {
  if (BRIDGE_EXCLUDED_TOOLS.includes(toolId)) return { ok: false, error: `Tool "${toolId}" is only available inside the application.` }
  const tool = BUILT_IN_TOOLS.find((candidate) => candidate.id === toolId)
  if (tool === undefined) return { ok: false, error: `Unknown tool "${toolId}". List the tools with GET /api/ai/actions.` }
  const action = typeof input === "object" && input !== null ? (input as { action?: unknown }).action : undefined
  if (typeof action !== "string" || action === "") return { ok: false, error: `Tool "${toolId}" needs an "action": one of ${Object.keys(tool.actions).join(", ")}.` }
  const spec = tool.actions[action]
  if (spec === undefined) return { ok: false, error: `Tool "${toolId}" has no action "${action}": use one of ${Object.keys(tool.actions).join(", ")}.` }
  if (!bridgeAllowed(policies, toolId, action)) return { ok: false, error: `The AI policy of this installation does not allow ${toolId}.${action} from outside the application.` }
  if (spec.kind === "destructive") {
    return { ok: false, error: `${toolId}.${action} deletes or replaces existing work and needs a person's approval, which only the application can ask for. Do it in the CADCAMFUN window, or ask the assistant there.` }
  }
  if (mode === "read" && spec.kind !== "read") return { ok: false, error: `This token is read-only: ${toolId}.${action} changes the project. Ask for a read-write token in the application.` }
  return { ok: true, tool: toolId, action, kind: spec.kind }
}
