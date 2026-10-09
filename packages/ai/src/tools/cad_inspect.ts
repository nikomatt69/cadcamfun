import { z } from "zod"
import { defineTool } from "./define.ts"
export const cadInspectInputSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("elements"), ids: z.array(z.string().min(1)).max(20).optional(), layerId: z.string().min(1).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(20).default(10) }),
    z.object({ action: z.literal("layers") }),
    z.object({ action: z.literal("property"), elementId: z.string().min(1), path: z.array(z.string().min(1)).min(1).max(12), offset: z.number().int().nonnegative().default(0), maxChars: z.number().int().min(1).max(20000).default(10000) })
  ])
export type cadInspectInput = z.infer<typeof cadInspectInputSchema>
export const cadInspect = defineTool("cad_inspect", {
  parameters: cadInspectInputSchema,
  execute: (input, { handlers, projectId }) => handlers.cadInspect ? handlers.cadInspect(projectId, input) : Promise.resolve({ ok: false, error: "Inspection is unavailable in this host." })
})
