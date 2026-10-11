import { camStock } from "./cam_stock.ts"
import { cadComponentRelations } from "./cad_component_relations.ts"
import { cadInspect } from "./cad_inspect.ts"
/**
 * The tool registry: every tool the `cadcam` agent may call, in the order the model sees them. A tool is added by writing
 * its `tools/<id>.ts` and `tools/prompts/<id>.txt` and listing it here; extension tools (`ToolDefinition`s from outside
 * this package) are passed to `buildTools` and registered next to these.
 */
import type { HostToolSpec } from "../nikcli/runtime.ts"
import { attachmentRead } from "./attachment_read.ts"
import { webSearch } from "./web_search.ts"
import { cadVision } from "./cad_vision.ts"
import { camVision } from "./cam_vision.ts"
import { cadParametric } from "./cad_parametric.ts"
import { cadAddElements } from "./cad_add_elements.ts"
import { cadAddEntities } from "./cad_add_entities.ts"
import { cadCheckDesign } from "./cad_check_design.ts"
import { cadDeleteEntities } from "./cad_delete_entities.ts"
import { cadDescribeDrawing } from "./cad_describe_drawing.ts"
import { cadEditor } from "./cad_editor.ts"
import { cadGroupEntities } from "./cad_group_entities.ts"
import { cadImportDrawing } from "./cad_import_drawing.ts"
import { cadModifyEntities } from "./cad_modify_entities.ts"
import { cadTransformEntities } from "./cad_transform_entities.ts"
import { camAnalyzeGcode } from "./cam_analyze_gcode.ts"
import { camCreateOperation } from "./cam_create_operation.ts"
import { camDescribeMachine } from "./cam_describe_machine.ts"
import { camGenerateGcode } from "./cam_generate_gcode.ts"
import { camListOperations } from "./cam_list_operations.ts"
import { camSuggestParameters } from "./cam_suggest_parameters.ts"
import { camUpdateOperation } from "./cam_update_operation.ts"
import { camVerifyToolpath } from "./cam_verify_toolpath.ts"
import type { ToolHandlersShape } from "./handlers.ts"
import { toSpec, type ToolContext, type ToolDefinition } from "./define.ts"
import { libLookupMaterial } from "./lib_lookup_material.ts"
import { libLookupTool } from "./lib_lookup_tool.ts"
import { memoryRecall } from "./memory_recall.ts"
import { memoryRemember } from "./memory_remember.ts"
import { projectContext } from "./project_context.ts"
import { cadGrep } from "./cad_grep.ts"

export const BUILT_IN_TOOLS = [
  camStock, cadComponentRelations, cadInspect, webSearch, attachmentRead, cadVision, camVision, cadParametric, cadAddEntities, cadAddElements, cadImportDrawing, cadModifyEntities, cadTransformEntities, cadGroupEntities, cadEditor, cadDeleteEntities, cadDescribeDrawing, cadCheckDesign,
  camDescribeMachine, camCreateOperation, camListOperations, camUpdateOperation, camSuggestParameters, camGenerateGcode, camAnalyzeGcode, camVerifyToolpath,
  libLookupMaterial, libLookupTool, memoryRemember, memoryRecall, projectContext, cadGrep
] as const

/** The built-in tool ids. */
export const TOOL_IDS = BUILT_IN_TOOLS.map((tool) => tool.id) as ReadonlyArray<string>

/** The host tools of one project: the built-in ones plus any extension tools (an id may not repeat). */
export const buildTools = (
  handlers: ToolHandlersShape,
  projectId: string,
  extensions: ReadonlyArray<ToolDefinition> = []
): ReadonlyArray<HostToolSpec> => {
  const context: ToolContext = { handlers, projectId }
  const all: ReadonlyArray<ToolDefinition> = [...BUILT_IN_TOOLS, ...extensions]
  const seen = new Set<string>()
  for (const tool of all) {
    if (seen.has(tool.id)) throw new Error(`Duplicate tool id: ${tool.id}`)
    seen.add(tool.id)
  }
  return all.map((tool) => toSpec(tool, context))
}
