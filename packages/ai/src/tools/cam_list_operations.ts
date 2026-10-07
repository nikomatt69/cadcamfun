import { z } from "zod"
import { defineTool } from "./define.ts"

export const camListOperations = defineTool("cam_list_operations", {
  parameters: z.object({}),
  execute: (_input, { handlers, projectId }) => handlers.listOperations(projectId)
})
