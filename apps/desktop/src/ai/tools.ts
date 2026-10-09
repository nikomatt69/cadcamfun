/**
 * The nikcli tool catalogue the `cadcam` agent is allowed to call
 * (spec 08-ai.md §1.2, §3). Mirrors `packages/ai/src/tools/catalogue.ts`
 * and the sidecar's `ToolHandlers` implementation. The UI uses this list to
 * render the "Available tools" disclosure in the EnhancedAssistant panel.
 */
export const TOOL_IDS = [
  "cam_stock", "cad_inspect", "cad_component_relations", "web_search", "attachment_read", "cad_parametric", "cad_vision", "cam_vision",
  "cad_add_entities",
  "cad_add_elements",
  "cad_modify_entities",
  "cad_transform_entities",
  "cad_group_entities",
  "cad_editor",
  "cad_delete_entities",
  "cad_describe_drawing",
  "cad_check_design",
  "cad_import_drawing",
  "cam_describe_machine",
  "cam_create_operation",
  "cam_list_operations",
  "cam_update_operation",
  "cam_suggest_parameters",
  "cam_generate_gcode",
  "cam_analyze_gcode",
  "cam_verify_toolpath",
  "lib_lookup_material",
  "lib_lookup_tool",
  "memory_remember",
  "memory_recall"
] as const

export type ToolId = (typeof TOOL_IDS)[number]

/** The tools the sidecar adds to the CAD/CAM ones: delegation to the specialist agents, version control and workflows. */
export const AGENT_TOOL_IDS = ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"] as const
export const PROGRAM_TOOL_ID = "code_mode"
export const VCS_TOOL_IDS = ["vcs_status", "vcs_start_change", "vcs_commit", "vcs_diff", "vcs_open_pull_request", "vcs_list_pull_requests", "actions_run"] as const

export interface ToolSummary {
  readonly id: ToolId
  readonly category: "cad" | "cam" | "library" | "memory" | "research"
  readonly title: string
  readonly description: string
}

export const TOOL_SUMMARIES: ReadonlyArray<ToolSummary> = [
  { id: "cam_stock", category: "cam", title: "Manage raw stock", description: "Inspect or set the actual stock, invalidate affected programs and verify removed/remaining volumes." },
  { id: "cad_inspect", category: "cad", title: "Inspect elements and layers", description: "Read complete element, feature-history and layer properties in bounded pages." },
  { id: "cad_component_relations", category: "cad", title: "Component relationships", description: "Inspect nominal distances, bounds, parameter definitions and dependencies between two components." },
  { id: "web_search", category: "research", title: "Web search", description: "Search live technical sources and return URLs and bounded excerpts." },
  { id: "attachment_read", category: "research", title: "Read attached code and drawings", description: "Read real project attachments in bounded pages." },
  { id: "cad_parametric", category: "cad", title: "Parametric model and tests", description: "Inspect feature dependencies, update dimensions in place and test variants without changing the drawing." },
  { id: "cad_vision", category: "cad", title: "CAD Vision", description: "Capture the actual CAD viewport and add the image and scene evidence to model context." },
  { id: "cam_vision", category: "cam", title: "CAM Vision", description: "Capture the actual CAM preview with operation and verification context." },
  { id: "cad_add_entities", category: "cad", title: "Add entities", description: "Append 2D entities (mm, radians) to the active drawing." },
  { id: "cad_add_elements", category: "cad", title: "Add 3D elements", description: "Model solids, revolved / extruded profiles, lofts, sweeps, booleans, curves and parts in the open editor." },
  { id: "cad_modify_entities", category: "cad", title: "Modify entities", description: "Change fields of existing entities by id." },
  { id: "cad_transform_entities", category: "cad", title: "Transform entities", description: "Move, rotate or scale elements by id, or lay out copies: rows, grids and circular patterns." },
  { id: "cad_group_entities", category: "cad", title: "Group entities", description: "Gather elements into one component, or open a component into its parts." },
  { id: "cad_editor", category: "cad", title: "Control the editor", description: "Create, rename, colour, hide and lock layers; switch 3D / 2D, fit the view, select, hide, isolate, undo." },
  { id: "cad_delete_entities", category: "cad", title: "Delete entities", description: "Delete entities by id (requires confirm: true)." },
  { id: "cad_import_drawing", category: "cad", title: "Import drawing", description: "Import DXF/SVG outlines, STEP/IGES/BREP surfaces and STL/OBJ/PLY meshes through the existing CAD model." },
  { id: "cad_check_design", category: "cad", title: "Check design", description: "Find what is illogical in the 3D model: sizes, rotation units, booleans, duplicates, floating parts." },
  { id: "cad_describe_drawing", category: "cad", title: "Describe drawing", description: "Counts, bounds and layers of the active drawing." },
  { id: "cam_describe_machine", category: "cam", title: "Describe machine", description: "Axes, rotation, zeros and operations of a mill, a lathe or a 3D printer." },
  { id: "cam_create_operation", category: "cam", title: "Create CAM operation", description: "Add a contour, pocket, drill, engrave, profile, threading or 3d_surface operation." },
  { id: "cam_list_operations", category: "cam", title: "List operations", description: "List the CAM operations of the active drawing." },
  { id: "cam_update_operation", category: "cam", title: "Update operation", description: "Change depth, stepdown, feed or tool of an operation; its old G-code is dropped." },
  { id: "cam_suggest_parameters", category: "cam", title: "Suggest parameters", description: "Depth, stepdown, cutting speed, chip load and warnings for the drawing." },
  { id: "cam_generate_gcode", category: "cam", title: "Generate G-code", description: "Run the CAM pipeline and return stats plus the first lines." },
  { id: "cam_analyze_gcode", category: "cam", title: "Analyse G-code", description: "Static safety checks: travel limits, rapids below Z0, missing spindle." },
  { id: "cam_verify_toolpath", category: "cam", title: "Verify toolpath", description: "Simulate the G-code on the stock: removal, rapids in material, shank/holder/fixture collisions, gouges." },
  { id: "lib_lookup_material", category: "library", title: "Lookup material", description: "Search the material library." },
  { id: "lib_lookup_tool", category: "library", title: "Lookup tool", description: "Search the tool library." },
  { id: "memory_remember", category: "memory", title: "Remember note", description: "Save a short note the assistant will see in later conversations." },
  { id: "memory_recall", category: "memory", title: "Recall notes", description: "List the saved notes." }
]

export interface ExtraToolSummary {
  readonly id: (typeof AGENT_TOOL_IDS)[number] | (typeof VCS_TOOL_IDS)[number] | typeof PROGRAM_TOOL_ID
  readonly category: "agents" | "vcs" | "program"
  readonly title: string
  readonly description: string
}

/** The delegation, version-control and workflow tools, shown with the CAD/CAM ones in the tool list. */
export const EXTRA_TOOL_SUMMARIES: ReadonlyArray<ExtraToolSummary> = [
  { id: "agent_task", category: "agents", title: "Delegate to a specialist", description: "Hand a job to the editor, modeler, machinist or researcher agent, each with only the tools its job needs." },
  { id: "agent_tasks", category: "agents", title: "List agent tasks", description: "Status of the specialists started from this conversation." },
  { id: "agent_task_read", category: "agents", title: "Read agent report", description: "The full report of a specialist task." },
  { id: "agent_task_cancel", category: "agents", title: "Cancel agent task", description: "Stop a specialist that is no longer needed." },
  { id: "code_mode", category: "program", title: "Run a program", description: "Write a short program in a confined JavaScript subset that calls the CAD/CAM tools in loops (patterns, lattices, many operations) and returns one value." },
  { id: "vcs_status", category: "vcs", title: "Version-control status", description: "Branch, uncommitted files and open pull requests." },
  { id: "vcs_start_change", category: "vcs", title: "Start a change", description: "Create and check out an ai/* branch for a reviewable change." },
  { id: "vcs_commit", category: "vcs", title: "Commit", description: "Record the current edits on the ai/* branch." },
  { id: "vcs_diff", category: "vcs", title: "Diff", description: "Entity-level changes between two revisions." },
  { id: "vcs_open_pull_request", category: "vcs", title: "Open a pull request", description: "Ask a person to review and merge the change into main." },
  { id: "vcs_list_pull_requests", category: "vcs", title: "List pull requests", description: "Pull requests of the project with their review verdicts." },
  { id: "actions_run", category: "vcs", title: "Run workflows", description: "Run the project's workflows on the checked-out branch and report their status." }
]

const BY_ID = new Map<string, string>([...TOOL_SUMMARIES, ...EXTRA_TOOL_SUMMARIES].map((tool) => [tool.id, tool.title]))
/** The title the chat shows for a tool id (the id itself for a tool it does not know). */
export const toolTitle = (id: string): string => BY_ID.get(id) ?? id
