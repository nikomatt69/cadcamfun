/**
 * The assistant's action catalogue. An action (`actions/catalogue.ts`) declares one capability exactly once: its id,
 * its effect, the schema the host validates against and the implementation. The tools the model sees are adapters over
 * those entries (`tools/<tool>.ts`), `handlers.ts` is what the sidecar lends them and this module is the public face
 * of all three.
 */
export { ToolHandlers, type ToolHandlersShape, type VerifyToolOptions, type CamStockInput } from "./handlers.ts"
export { defineTool, toSpec, validated, type ToolConfig, type ToolContext, type ToolDefinition, ToolMediaResult } from "./define.ts"
export { defineActionTool, type ActionTool } from "./action.ts"
export { BUILT_IN_TOOLS, TOOL_IDS, buildTools } from "./registry.ts"
export {
  TOOL_IDS as CATALOGUE_TOOL_IDS, READ_TOOL_IDS, WRITE_TOOL_IDS, DESTRUCTIVE_TOOL_IDS, ACTION_IDS, CONTRIBUTION_KEYS
} from "./project-tools.ts"
export * from "../actions/catalogue.ts"
export type { ActionContribution } from "../actions/action.ts"