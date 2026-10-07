import { z } from "zod"
import { defineTool } from "./define.ts"

export const camGenerateGcode = defineTool("cam_generate_gcode", {
  parameters: z.object({ operationId: z.string().optional(), maxLines: z.number().int().min(1).max(200).optional() }),
  execute: async ({ operationId, maxLines = 40 }, { handlers, projectId }) => {
    const result = await handlers.generateGcode(projectId, operationId)
    return { stats: result.stats, preview: result.gcode.split("\n").slice(0, maxLines).join("\n") }
  }
})
