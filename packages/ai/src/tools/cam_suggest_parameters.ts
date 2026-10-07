import { z } from "zod"
import { defineTool } from "./define.ts"

export const camSuggestParameters = defineTool("cam_suggest_parameters", {
  parameters: z.object({ params: z.record(z.string(), z.unknown()).optional() }),
  execute: ({ params }, { handlers, projectId }) => handlers.suggestParameters(projectId, params ?? {})
})
