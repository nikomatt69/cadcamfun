/// <reference path="../../text.d.ts" />
/**
 * The prompt of every tool, one `.txt` file per tool (the way nikcli keeps its own tool prompts): what it is for, when
 * to use it and when not, every parameter with its unit, the shape of the result, the errors and what to call next.
 * The text is what the model reads as the tool's description, so editing a file edits the tool.
 *
 * `{{elements}}` in a prompt is filled with the element catalogue (`element-catalog.ts`), the single table of the
 * types `cad_add_elements` accepts.
 */
import { elementCatalogueLines } from "../../element-catalog.ts"
import cad_inspect from "./cad_inspect.txt" with { type: "text" }
import cam_stock from "./cam_stock.txt" with { type: "text" }
import cad_component_relations from "./cad_component_relations.txt" with { type: "text" }
import web_search from "./web_search.txt" with { type: "text" }
import attachment_read from "./attachment_read.txt" with { type: "text" }
import cad_vision from "./cad_vision.txt" with { type: "text" }
import cam_vision from "./cam_vision.txt" with { type: "text" }
import cad_parametric from "./cad_parametric.txt" with { type: "text" }
import cad_add_elements from "./cad_add_elements.txt" with { type: "text" }
import cad_add_entities from "./cad_add_entities.txt" with { type: "text" }
import cad_check_design from "./cad_check_design.txt" with { type: "text" }
import cad_delete_entities from "./cad_delete_entities.txt" with { type: "text" }
import cad_describe_drawing from "./cad_describe_drawing.txt" with { type: "text" }
import cad_editor from "./cad_editor.txt" with { type: "text" }
import cad_group_entities from "./cad_group_entities.txt" with { type: "text" }
import cad_import_drawing from "./cad_import_drawing.txt" with { type: "text" }
import cad_modify_entities from "./cad_modify_entities.txt" with { type: "text" }
import cad_transform_entities from "./cad_transform_entities.txt" with { type: "text" }
import cam_analyze_gcode from "./cam_analyze_gcode.txt" with { type: "text" }
import cam_create_operation from "./cam_create_operation.txt" with { type: "text" }
import cam_describe_machine from "./cam_describe_machine.txt" with { type: "text" }
import cam_generate_gcode from "./cam_generate_gcode.txt" with { type: "text" }
import cam_list_operations from "./cam_list_operations.txt" with { type: "text" }
import cam_suggest_parameters from "./cam_suggest_parameters.txt" with { type: "text" }
import cam_update_operation from "./cam_update_operation.txt" with { type: "text" }
import cam_verify_toolpath from "./cam_verify_toolpath.txt" with { type: "text" }
import lib_lookup_material from "./lib_lookup_material.txt" with { type: "text" }
import lib_lookup_tool from "./lib_lookup_tool.txt" with { type: "text" }
import memory_recall from "./memory_recall.txt" with { type: "text" }
import memory_remember from "./memory_remember.txt" with { type: "text" }
import project_context from "./project_context.txt" with { type: "text" }
import cad_grep from "./cad_grep.txt" with { type: "text" }

const PROMPTS = {
  cam_stock,
  cad_component_relations,
  cad_inspect, web_search, attachment_read, cad_vision, cam_vision, cad_parametric,
  cad_add_elements,
  cad_add_entities,
  cad_check_design,
  cad_delete_entities,
  cad_describe_drawing,
  cad_editor,
  cad_group_entities,
  cad_import_drawing,
  cad_modify_entities,
  cad_transform_entities,
  cam_analyze_gcode,
  cam_create_operation,
  cam_describe_machine,
  cam_generate_gcode,
  cam_list_operations,
  cam_suggest_parameters,
  cam_update_operation,
  cam_verify_toolpath,
  lib_lookup_material,
  lib_lookup_tool,
  memory_recall,
  memory_remember,
  project_context,
  cad_grep
} as const

export type ToolPromptId = keyof typeof PROMPTS
export const TOOL_PROMPT_IDS = Object.keys(PROMPTS) as ReadonlyArray<ToolPromptId>

export const toolPrompt = (id: ToolPromptId): string =>
  PROMPTS[id].replace("{{elements}}", () => elementCatalogueLines()).trim()

/** The raw text, placeholders unfilled (for the tests). */
export const rawToolPrompt = (id: ToolPromptId): string => PROMPTS[id]
