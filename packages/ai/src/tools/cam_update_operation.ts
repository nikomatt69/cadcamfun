import { z } from "zod"
import { defineTool } from "./define.ts"

export const camUpdateOperation = defineTool("cam_update_operation", {
  parameters: z.object({ operationId: z.string().min(1), params: z.record(z.string(), z.unknown()) }),
  execute: ({ operationId, params }, { handlers, projectId }) => handlers.updateOperation(projectId, operationId, params)
})
