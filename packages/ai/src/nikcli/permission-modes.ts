/** UI names mapped to native Nikcli agent modes and permission rules. */
import { DESTRUCTIVE_TOOL_IDS } from "../tools/project-tools.ts"
import { exposedActions, EXPOSED_TOOL_IDS, nameOf } from "../actions/catalogue.ts"

export type PermissionMode = "auto" | "ask" | "approve"
/**
 * Tools the host registers as `ask`: the ones whose catalogue group contains a destructive action. Derived from the
 * catalogue, so a new destructive action can never reach a role without its tool asking first. A `confirm: true` in the
 * arguments is not approval and never appears here.
 */
export const NATIVE_APPROVAL_TOOL_IDS: ReadonlyArray<string> = DESTRUCTIVE_TOOL_IDS

/**
 * The rule for a call a person must approve. Auto uses native action patterns to deny destructive calls.
 * nikcli's auto mode sends an `ask` whose pattern is
 * the plain `*` (what a string rule becomes) to its classifier instead of the person; an `ask` under any other pattern is
 * always put to the person (`AutoMode.route`). `**` matches every call exactly as `*` does, so the rule only changes who
 * decides: destructive tools and extension tools that require approval are never approved by a model.
 */
export const HUMAN_APPROVAL = Object.freeze({ "**": "ask" }) as { readonly "**": "ask" }
export type PermissionRule = "allow" | "deny" | "ask" | Readonly<Record<string, "allow" | "deny" | "ask">>
/** Validated catalogue actions become native permission patterns, including calls inside Code Mode. */
export const toolPermissionPattern = (tool: string, input: unknown, projectId: string, agent: string): string => {
  // Standard-mode saved approvals must not bypass Auto's classifier or destructive-action denies.
  if (!agent.endsWith("-auto") || !EXPOSED_TOOL_IDS.includes(tool)) return `project:${projectId}`
  const args = input as { action?: unknown; actions?: ReadonlyArray<{ action?: string }> } | null
  if (tool === "cad_edit" && args?.action === "editor" && args.actions?.some((entry) =>
    ["layer_delete", "undo", "redo"].includes(entry.action ?? ""))) return "action:editor:destructive"
  return `action:${args?.action ?? "unknown"}`
}
export const hostAgentWithPermissions = (agent: string, mode: PermissionMode = "approve"): string => mode === "approve" ? agent : `${agent}-${mode}`
export const inheritedPermissionMode = (agent?: string): PermissionMode => agent?.endsWith("-auto") ? "auto" : agent?.endsWith("-ask") ? "ask" : "approve"
export const permissionAgents = (agents: Record<string, Record<string, unknown>>, registered: ReadonlyArray<string>): Record<string, Record<string, unknown>> => {
  const result = { ...agents }
  for (const [name, spec] of Object.entries(agents)) for (const mode of ["auto", "ask"] as const) {
    const permissions = { ...(spec["permission"] as Record<string, PermissionRule>) }
    if (mode === "ask") {
      for (const id of registered) if (permissions[id] === "allow") permissions[id] = "ask"
    } else {
      for (const id of registered) {
        // Never widen a role, policy denial or extension approval requirement.
        if (permissions[id] !== "allow" && permissions[id] !== HUMAN_APPROVAL) continue
        if (!EXPOSED_TOOL_IDS.includes(id)) {
          if (permissions[id] === "allow") permissions[id] = "ask"
          continue
        }
        // Extension writes change the assistant itself, which no classifier may approve.
        if (id === "mods_edit") { permissions[id] = "deny"; continue }
        permissions[id] = {
          "*": "ask",
          ...Object.fromEntries(exposedActions(id)
            .filter((action) => action.kind === "destructive")
            .map((action) => [`action:${nameOf(action)}`, "deny" as const])),
          ...(id === "cad_edit" ? { "action:editor:destructive": "deny" as const } : {}),
          // A workflow runs steps the model does not write and can change project data: a person starts it.
          ...(id === "vcs_edit" ? { "action:run_workflows": "deny" as const } : {})
        }
      }
      if (permissions["mods_edit"] !== undefined) permissions["mods_edit"] = "deny"
    }
    result[hostAgentWithPermissions(name, mode)] = {
      ...spec,
      ...(mode === "auto" ? { prompt: `${typeof spec["prompt"] === "string" ? spec["prompt"] : ""}\nAuto uses nikcli's classifier to review creation and edits through the existing tools: operate fully on the active drawing and the machining setup the user asked for. Deletion of elements, saved parts or library rows, editor undo/redo and layer deletion, restoring history, running workflows and every extension write are denied. Version control is yours within its limits: start a reviewable change, commit on the checked-out branch and open a pull request when the work calls for it; nothing merges or pushes.` } : {}),
      permission_mode: mode === "auto" ? "auto" : "default", permission: permissions
    }
  }
  return result
}
