/**
 * The assistant's tool catalogue. Each tool lives in its own file (`tools/<id>.ts`, defined with `defineTool`, its prompt in
 * `tools/prompts/<id>.txt`); `registry.ts` lists them, `handlers.ts` is what the sidecar lends them. This module is the
 * public face of all three.
 */
export { ToolHandlers, type ToolHandlersShape, type VerifyToolOptions } from "./handlers.ts"
export { defineTool, toSpec, validated, type ToolConfig, type ToolContext, type ToolDefinition } from "./define.ts"
export { BUILT_IN_TOOLS, TOOL_IDS, buildTools } from "./registry.ts"
export {
  LIBRARY_TOOL_IDS, LIBRARY_READ_TOOL_IDS, LIBRARY_READ_ALL, LIBRARY_WRITE_TOOL_IDS,
  COMPONENT_TOOL_IDS, COMPONENT_READ_TOOL_IDS, CHAIN_TOOL_IDS, VCS_TOOL_IDS, BACKGROUND_TOOL_IDS,
  SIDECAR_TOOL_IDS, isSidecarToolId
} from "./project-tools.ts"
export { entityZod } from "./cad_add_entities.ts"
