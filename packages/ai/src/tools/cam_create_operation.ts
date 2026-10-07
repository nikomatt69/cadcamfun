import { z } from "zod"
import { defineTool } from "./define.ts"

export const camCreateOperation = defineTool("cam_create_operation", {
  parameters: z.object({ type: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }),
  execute: ({ type, params }, { handlers, projectId }) => handlers.createOperation(projectId, { type, params: params ?? {} })
})
