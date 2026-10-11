/**
 * Tool ids the **sidecar** registers beside the built-in ones (`toolsFor` in `apps/sidecar/src/services/ai.ts`):
 * the library and CAM-chain specs, the version-control tools and the background-task tools. They are host specs, not
 * package tools, so they have no `tools/<id>.txt` of their own.
 *
 * This list is the single place those ids are named, for two reasons: a specialist's permission map
 * (`nikcli/agents.ts`) may name them, and the sidecar's spec lists are checked against it, so an id a model is told
 * about can never be one the host does not register (and the reverse).
 */

/** The library: components, materials, tools, machine configurations, and the operation chain. */
export const LIBRARY_TOOL_IDS = [
  "cad_component_list",
  "cad_component_save",
  "cad_component_insert",
  "cad_component_delete",
  "lib_lookup_component",
  "lib_lookup_material",
  "lib_lookup_tool",
  "lib_lookup_machine_config",
  "lib_upsert_material",
  "lib_upsert_tool",
  "lib_upsert_machine_config",
  "lib_set_default",
  "lib_delete",
  "cam_operations_suggest_chain",
  "cam_chain_status"
] as const

/** Version control: read for everyone, writes stay with the `cadcam` agent. */
export const VCS_TOOL_IDS = [
  "vcs_status",
  "vcs_start_change",
  "vcs_commit",
  "vcs_diff",
  "vcs_restore_paths",
  "vcs_open_pull_request",
  "vcs_list_pull_requests",
  "actions_run"
] as const

/** Delegation: the parent's tools for starting, reading and cancelling specialist work. */
export const BACKGROUND_TOOL_IDS = ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"] as const

/** Every tool id the sidecar contributes on top of `TOOL_IDS`. */
export const SIDECAR_TOOL_IDS = [...LIBRARY_TOOL_IDS, ...VCS_TOOL_IDS, ...BACKGROUND_TOOL_IDS] as const

/** Reads: safe to give a read-only specialist. */
export const LIBRARY_READ_TOOL_IDS = [
  "lib_lookup_component",
  "lib_lookup_material",
  "lib_lookup_tool",
  "lib_lookup_machine_config"
] as const

/** Reusable parts the model may read (gathering, placing and removing are `COMPONENT_TOOL_IDS`). */
export const COMPONENT_READ_TOOL_IDS = ["cad_component_list"] as const

/** Writes: creating, replacing or removing rows of the user's libraries. */
export const LIBRARY_WRITE_TOOL_IDS = [
  "lib_upsert_material",
  "lib_upsert_tool",
  "lib_upsert_machine_config",
  "lib_set_default",
  "lib_delete"
] as const

/** Components the model may reuse: read, gather, place, remove. */
export const COMPONENT_TOOL_IDS = [
  "cad_component_list",
  "cad_component_save",
  "cad_component_insert",
  "cad_component_delete"
] as const

/** Operation chain: what the next operation should be, and the state of one operation in the chain. CAM roles only. */
export const CHAIN_TOOL_IDS = ["cam_operations_suggest_chain", "cam_chain_status"] as const

/** Every library read a CAM or parts role gets. */
export const LIBRARY_READ_ALL = [...LIBRARY_READ_TOOL_IDS, ...COMPONENT_READ_TOOL_IDS] as const

/** True when `ids` contains an id the sidecar registers (used by the sidecar's own drift guard). */
export const isSidecarToolId = (id: string): boolean => (SIDECAR_TOOL_IDS as ReadonlyArray<string>).includes(id)
