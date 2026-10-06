/**
 * The nikcli tool catalogue the `cadcam` agent is allowed to call
 * (spec 08-ai.md §1.2, §3). Mirrors `packages/ai/src/tools/catalogue.ts`
 * and the sidecar's `ToolHandlers` implementation. The UI uses this list to
 * render the "Available tools" disclosure in the EnhancedAssistant panel.
 */
export const TOOL_IDS = [
  "cad_add_entities",
  "cad_modify_entities",
  "cad_delete_entities",
  "cad_describe_drawing",
  "cam_create_operation",
  "cam_generate_gcode",
  "cam_analyze_gcode",
  "lib_lookup_material",
  "lib_lookup_tool",
  "memory_remember",
  "memory_recall"
] as const

export type ToolId = (typeof TOOL_IDS)[number]

export interface ToolSummary {
  readonly id: ToolId
  readonly category: "cad" | "cam" | "library" | "memory"
  readonly title: string
  readonly description: string
}

export const TOOL_SUMMARIES: ReadonlyArray<ToolSummary> = [
  { id: "cad_add_entities", category: "cad", title: "Add entities", description: "Append 2D entities (mm, radians) to the active drawing." },
  { id: "cad_modify_entities", category: "cad", title: "Modify entities", description: "Change fields of existing entities by id." },
  { id: "cad_delete_entities", category: "cad", title: "Delete entities", description: "Delete entities by id (requires confirm: true)." },
  { id: "cad_describe_drawing", category: "cad", title: "Describe drawing", description: "Counts, bounds and layers of the active drawing." },
  { id: "cam_create_operation", category: "cam", title: "Create CAM operation", description: "Add a profile, pocket, drill or face operation." },
  { id: "cam_generate_gcode", category: "cam", title: "Generate G-code", description: "Run the CAM pipeline and return stats plus the first lines." },
  { id: "cam_analyze_gcode", category: "cam", title: "Analyse G-code", description: "Static safety checks: travel limits, rapids below Z0, missing spindle." },
  { id: "lib_lookup_material", category: "library", title: "Lookup material", description: "Search the material library." },
  { id: "lib_lookup_tool", category: "library", title: "Lookup tool", description: "Search the tool library." },
  { id: "memory_remember", category: "memory", title: "Remember note", description: "Save a short note the assistant will see in later conversations." },
  { id: "memory_recall", category: "memory", title: "Recall notes", description: "List the saved notes." }
]