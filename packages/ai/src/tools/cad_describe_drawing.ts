import { z } from "zod"
import { defineTool } from "./define.ts"

export const cadDescribeDrawing = defineTool("cad_describe_drawing", {
  parameters: z.object({}),
  execute: (_input, { handlers, projectId }) => handlers.describeDrawing(projectId)
})
