/**
 * The assistant's tool catalogue. Each tool lives in its own file (`tools/<id>.ts`, defined with `defineTool`, its prompt in
 * `tools/prompts/<id>.txt`); `registry.ts` lists them, `handlers.ts` is what the sidecar lends them. This module is the
 * public face of all three.
 */
export { ToolHandlers, type ToolHandlersShape, type VerifyToolOptions } from "./handlers.ts"
export { defineTool, toSpec, validated, type ToolConfig, type ToolContext, type ToolDefinition } from "./define.ts"
export { BUILT_IN_TOOLS, TOOL_IDS, buildTools } from "./registry.ts"
export { entityZod } from "./cad_add_entities.ts"
