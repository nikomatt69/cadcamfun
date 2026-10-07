import { z } from "zod"
import { defineTool } from "./define.ts"

export const cadCheckDesign = defineTool("cad_check_design", {
  parameters: z.object({}),
  execute: (_input, { handlers, projectId }) => handlers.checkDesign(projectId)
})
