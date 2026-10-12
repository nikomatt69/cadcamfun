/**
 * The specialist agents the `cadcam` agent delegates to (nikcli's `Agent` roster and `SUBAGENT_TOOLSETS`): each has a
 * name, a prompt that says how it works, and a curated tool set, so a job runs with exactly the tools it needs and
 * nothing else. The host config (`config.ts`), the `agent_task` tool and the runner all read this one list.
 *
 * An agent that edits the document (`edits`) runs in the parent's turn by default, one at a time per project, and its tool
 * results reach the editor live through the parent's stream (`adoptChildSession`). A read-only agent runs in the
 * background and wakes the parent with its findings.
 */

import { specialistPrompt } from "./prompts/index.ts"
import { SPECIALIST_NATIVE_TOOLS } from "./tool-registry.ts"
import { NATIVE_APPROVAL_TOOL_IDS } from "./permission-modes.ts"
import { LIBRARY_READ_ALL, LIBRARY_READ_TOOL_IDS, CHAIN_TOOL_IDS, COMPONENT_TOOL_IDS, LIBRARY_WRITE_TOOL_IDS } from "../tools/project-tools.ts"

export const SUBAGENT_IDS = ["researcher", "editor", "modeler", "machinist", "reviewer"] as const
export type SubagentId = (typeof SUBAGENT_IDS)[number]

export interface SubagentSpec {
  readonly id: SubagentId
  /** The agent's name in the host config. */
  readonly host: string
  readonly description: string
  readonly prompt: string
  /** Tool ids it may call; ids the project did not register are left out of its permissions. */
  readonly tools: ReadonlyArray<string>
  /** Changes the drawing or the operations (so it runs alone, and its results are mirrored into the editor). */
  readonly edits: boolean
  /** Runs without the parent waiting for it unless the call says otherwise (nikcli's `background`). */
  readonly background: boolean
  readonly steps: number
  readonly timeoutMs: number
}


const MINUTE = 60_000

/** Read-only view of the user's libraries: materials, cutters, saved machines, components and the operation chain. */
const LIBRARY_READ = LIBRARY_READ_ALL

/** Operation chain: what the next operation should be, and the state of one operation in the chain. */
const CHAIN_READ = CHAIN_TOOL_IDS

/**
 * Version control, read-only: where the project stands (branch, uncommitted files, open pull requests) and what changed.
 * Starting a change, committing and opening the pull request stay with the main agent, which owns the change as a whole;
 * a specialist's edits land on the branch it was started on. Write-capable workflows belong to the CAM specialist.
 */
const VCS_READ = ["vcs_status", "vcs_diff", "vcs_list_pull_requests"] as const

export const SUBAGENTS: Readonly<Record<SubagentId, SubagentSpec>> = {
  researcher: {
    id: "researcher",
    host: "cadcam-worker",
    description: "Read-only investigator: inspects the drawing, operations, machine, materials, tools and G-code and returns findings. Cannot change anything.",
    prompt: specialistPrompt("researcher"),
    // Verification persists operation metadata, so it is not here.
    tools: [
      "cad_inspect", "cad_component_relations", "web_search", "attachment_read", "cad_vision", "cam_vision", "cad_describe_drawing", "cad_check_design", "cam_list_operations", "cam_suggest_parameters",
      "cam_describe_machine", "cam_analyze_gcode", "memory_recall",
      ...LIBRARY_READ, ...CHAIN_READ, ...VCS_READ
    ],
    edits: false,
    background: true,
    steps: 40,
    timeoutMs: 5 * MINUTE
  },
  editor: {
    id: "editor",
    host: "cadcam-editor",
    description: "Minimal-change editor: changes, moves, scales, regroups or removes specific existing entities and touches nothing else. Use for \"make this hole 8 mm\", \"move the bracket 20 mm up\", \"rename the layer\".",
    prompt: specialistPrompt("editor"),
    // Reusing a stored part is an edit like any other; the libraries stay read-only for this role.
    tools: [
      "cad_inspect", "cad_component_relations", "attachment_read", "cad_vision", "cad_parametric", "cad_describe_drawing", "cad_modify_entities", "cad_transform_entities", "cad_group_entities", "cad_editor",
      "cad_delete_entities", "cad_check_design", "memory_recall",
      "cad_component_list", "cad_component_insert",
      "lib_lookup_component", "lib_lookup_material", "lib_lookup_tool", ...VCS_READ
    ],
    edits: true,
    background: false,
    steps: 40,
    timeoutMs: 8 * MINUTE
  },
  modeler: {
    id: "modeler",
    host: "cadcam-modeler",
    description: "3D modeller: builds new geometry (solids, booleans, revolutions, imported drawings) for one well-described part or group.",
    prompt: specialistPrompt("modeler"),
    // A reusable part comes from the project's components; libraries stay read-only here (a new cutter or machine is
    // a decision for the machinist or the user).
    tools: [
      "cad_inspect", "cad_component_relations", "web_search", "attachment_read", "cad_vision", "cad_parametric", "cad_describe_drawing", "cad_add_elements", "cad_add_entities", "cad_import_drawing", "cad_group_entities",
      "cad_transform_entities", "cad_check_design", "memory_recall",
      ...COMPONENT_TOOL_IDS,
      ...LIBRARY_READ_TOOL_IDS, ...VCS_READ
    ],
    edits: true,
    background: false,
    steps: 60,
    timeoutMs: 10 * MINUTE
  },
  machinist: {
    id: "machinist",
    host: "cadcam-machinist",
    description: "CAM programmer: creates and updates machining operations for existing geometry, generates G-code, analyses it and simulates the toolpath.",
    prompt: specialistPrompt("machinist"),
    // The CAM specialist owns the libraries: it reads them, and may add a cutter, a material or a machine the shop
    // actually has, or remove one that is gone. Model confirmation is not native human approval.
    tools: [
      "cam_stock", "cad_inspect", "cad_component_relations", "web_search", "attachment_read", "cam_vision", "cad_describe_drawing", "cad_check_design", "cam_describe_machine", "cam_create_operation", "cam_list_operations",
      "cam_update_operation", "cam_suggest_parameters", "cam_generate_gcode", "cam_analyze_gcode", "cam_verify_toolpath",
      ...LIBRARY_READ, ...LIBRARY_WRITE_TOOL_IDS, ...CHAIN_READ,
      "memory_recall", ...VCS_READ, "actions_run"
    ],
    edits: true,
    background: false,
    steps: 60,
    timeoutMs: 10 * MINUTE
  },
  reviewer: {
    id: "reviewer",
    host: "cadcam-reviewer",
    description: "Reviews a pull request: reads the diff, the workflow runs and the verification reports, then writes a verdict. Read-only.",
    prompt: specialistPrompt("reviewer"),
    tools: [
      "vcs_status", "vcs_diff", "vcs_list_pull_requests", "cam_list_operations",
      "cam_analyze_gcode", "cad_describe_drawing", "cad_check_design", "cam_describe_machine",
      ...LIBRARY_READ, ...CHAIN_READ, "memory_recall"
    ],
    edits: false,
    background: true,
    steps: 40,
    timeoutMs: 5 * MINUTE
  }
}

export const isSubagentId = (value: unknown): value is SubagentId =>
  typeof value === "string" && (SUBAGENT_IDS as ReadonlyArray<string>).includes(value)

export const subagentById = (id: string | undefined): SubagentSpec => SUBAGENTS[isSubagentId(id) ? id : "researcher"]

/** A specialist's permission block: deny everything, allow its tools (those the project registered) and the playbooks. */
export const subagentPermission = (spec: SubagentSpec, registeredToolIds: ReadonlyArray<string>): Record<string, "allow" | "deny" | "ask"> => {
  const permission: Record<string, "allow" | "deny" | "ask"> = { "**": "deny" }
  for (const id of spec.tools) if (registeredToolIds.includes(id)) permission[id] = "allow"
  for (const id of NATIVE_APPROVAL_TOOL_IDS) {
    if (permission[id] === "allow") permission[id] = "ask"
  }
  for (const id of SPECIALIST_NATIVE_TOOLS) permission[id] = "allow"
  // The confined program runner sees only the tools allowed above.
  permission["code_mode"] = "allow"
  return permission
}

/** What the model reads in the `agent_task` description: who it can delegate to. */
export const subagentCatalogue = (): string =>
  SUBAGENT_IDS.map((id) => {
    const spec = SUBAGENTS[id]
    return `- ${id}${spec.edits ? " (edits the document)" : " (read-only)"}: ${spec.description} Tools: ${spec.tools.join(", ")}.`
  }).join("\n")

/**
 * Sessions a specialist runs in, by the parent session that started it. The parent's event stream also carries the tool
 * calls of its specialists (so the editor shows their changes as they happen); everything else a child session says stays
 * with the child.
 */
const children = new Map<string, Map<string, SubagentId>>()

export const adoptChildSession = (parentSessionId: string, childSessionId: string, agent: SubagentId = "researcher"): (() => void) => {
  let map = children.get(parentSessionId)
  if (map === undefined) children.set(parentSessionId, (map = new Map()))
  map.set(childSessionId, agent)
  return () => {
    const current = children.get(parentSessionId)
    current?.delete(childSessionId)
    if (current?.size === 0) children.delete(parentSessionId)
  }
}

/** The specialist running in `sessionId` for this parent, or undefined when that session is not one of its children. */
export const childAgent = (parentSessionId: string, sessionId: string): SubagentId | undefined =>
  children.get(parentSessionId)?.get(sessionId)
