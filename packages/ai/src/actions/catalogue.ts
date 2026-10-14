/**
 * The action catalogue: every capability the assistant has, declared exactly once.
 *
 * An entry is an id (`cad_edit.add`), its effect (`read` | `write` | `destructive`), the zod schema the host
 * validates the call against and the implementation that runs it. From this one list the package derives the tools
 * the model sees (`tools/<tool>.ts`), the permission classes the host is configured with, the allow-lists of the
 * specialists and the coverage tests. Nothing else may declare a model-visible capability, and no tool may mix
 * effects: permissions are keyed by tool id, so a read-only specialist given `cad_edit` would gain every write.
 *
 * Grouping follows `26-tool-consolidation.md` §2.1 with one documented correction: `memory` and `memory_edit` are
 * two tools, because notes and the project's standing context are writes and the host cannot ask per action.
 */
import { z } from "zod"
import { toolValidationFailure } from "../tool-validation.ts"
import { actionFailureResult, executeAction, type ActionContext, type ActionSpec } from "./action.ts"
import { CAD_ACTIONS } from "./cad.ts"
import { CAD_EDIT_ACTIONS } from "./cad-edit.ts"
import { CAM_ACTIONS } from "./cam.ts"
import { CAM_EDIT_ACTIONS } from "./cam-edit.ts"
import { LIBRARY_ACTIONS, LIBRARY_EDIT_ACTIONS, PARTS_ACTIONS } from "./library.ts"
import { MEMORY_ACTIONS, MEMORY_EDIT_ACTIONS } from "./memory.ts"
import { RESEARCH_ACTIONS } from "./research.ts"
import { VCS_ACTIONS, VCS_EDIT_ACTIONS } from "./vcs.ts"
import { AGENT_ACTIONS } from "./agent.ts"

/** Every action, in the order the model meets them: CAD first, then CAM, then the libraries, memory and delegation. */
export const ACTION_CATALOGUE: ReadonlyArray<ActionSpec> = [
  ...CAD_ACTIONS, ...CAD_EDIT_ACTIONS, ...CAM_ACTIONS, ...CAM_EDIT_ACTIONS,
  ...LIBRARY_ACTIONS, ...PARTS_ACTIONS, ...LIBRARY_EDIT_ACTIONS,
  ...MEMORY_ACTIONS, ...MEMORY_EDIT_ACTIONS, ...RESEARCH_ACTIONS, ...VCS_ACTIONS, ...VCS_EDIT_ACTIONS, ...AGENT_ACTIONS
]

export const actionId = (spec: ActionSpec): string => spec.id
export const toolOf = (spec: ActionSpec): string => spec.id.slice(0, spec.id.indexOf("."))
export const nameOf = (spec: ActionSpec): string => spec.id.slice(spec.id.indexOf(".") + 1)

/** The tool ids the model sees, in catalogue order. */
export const ACTION_TOOL_IDS: ReadonlyArray<string> = [...new Set(ACTION_CATALOGUE.map(toolOf))]

/** The actions of one tool, keyed by action name: what `defineActionTool` turns into a host tool. */
export const actionsOf = (tool: string): Readonly<Record<string, ActionSpec>> => {
  const entries = exposedActions(tool).map((spec) => [nameOf(spec), spec] as const)
  if (entries.length === 0) throw new Error(`Unknown action tool: ${tool}`)
  return Object.freeze(Object.fromEntries(entries))
}

export const actionById = (id: string): ActionSpec | undefined => ACTION_CATALOGUE.find((spec) => spec.id === id)

/**
 * Exposures: extra tools that carry a named subset of canonical actions, so a role can receive exactly what it needs
 * without a second declaration. The action keeps its id (`cam_edit.verify`), effects, contract and implementation; only
 * the tool the host registers (and its permission key) differs. The verifier generates and verifies a program through
 * `cam_verify` and never receives `cam_edit`, which would also let it create, update, set stock or release.
 */
export const ACTION_EXPOSURES: Readonly<Record<string, ReadonlyArray<string>>> = {
  cam_verify: ["cam_edit.generate", "cam_edit.verify"]
}

/** Every tool id the host registers: the canonical groups, then the exposures. */
export const EXPOSED_TOOL_IDS: ReadonlyArray<string> = [...ACTION_TOOL_IDS, ...Object.keys(ACTION_EXPOSURES)]

/** The canonical actions a registered tool carries (a group or an exposure). */
export const exposedActions = (tool: string): ReadonlyArray<ActionSpec> => {
  const exposure = ACTION_EXPOSURES[tool]
  if (exposure === undefined) return ACTION_CATALOGUE.filter((spec) => toolOf(spec) === tool)
  return exposure.map((id) => {
    const spec = ACTION_CATALOGUE.find((candidate) => candidate.id === id)
    if (spec === undefined) throw new Error(`Exposure ${tool} names an unknown action: ${id}`)
    return spec
  })
}

/** The effect of a tool: the strongest one it contains, so a group with a destructive action asks. */
export const toolKind = (tool: string): "read" | "write" | "destructive" => {
  const kinds = Object.values(actionsOf(tool)).map((spec) => spec.kind)
  return kinds.includes("destructive") ? "destructive" : kinds.includes("write") ? "write" : "read"
}

/** Every tool id of a kind; what the specialists' allow-lists are derived from. */
export const toolIdsOfKind = (...kinds: ReadonlyArray<"read" | "write" | "destructive">): ReadonlyArray<string> =>
  EXPOSED_TOOL_IDS.filter((tool) => kinds.includes(toolKind(tool)))

/** The per-verb tool ids the catalogue replaced, in catalogue order: the parity map of spec 26 §6.2. */
export const REPLACED_TOOL_IDS: ReadonlyArray<string> = [...new Set(ACTION_CATALOGUE.map((spec) => spec.replaces).filter((id): id is string => id !== undefined))]

/**
 * Runs one action exactly the way the host adapter does: validated input, one Promise crossing, a tagged failure
 * turned into the same JSON refusal the model reads. The caller-facing interface for tests and for the next
 * adapter (the HttpApi face of RM-11), not a second dispatcher.
 */
export const runAction = async (id: string, input: unknown, context: ActionContext): Promise<unknown> => {
  const spec = actionById(id)
  if (spec === undefined) return { ok: false, _tag: "ActionInvalidInput", actionId: id, error: `Unknown action: ${id}` }
  const parsed = (spec.parameters as z.ZodType).safeParse(input)
  if (!parsed.success) return { ok: false, _tag: "ActionInvalidInput", actionId: id, error: `The arguments do not match the action's schema. ${toolValidationFailure(id, parsed.error).problems.join("; ")}` }
  return executeAction(spec, parsed.data, context)
}

/** The JSON refusal for an admission failure, denial or interruption; shared with the host adapter. */
export const failureResult = actionFailureResult
export type { ActionContext, ActionFailure, ActionSpec } from "./action.ts"
export { defineAction, contributedAction, ActionFailed } from "./action.ts"
