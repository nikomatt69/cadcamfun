import { z } from "zod"
import { defineTool } from "./define.ts"

/** Gathers existing elements into one component (or opens a component into its parts again). */
export const cadGroupEntities = defineTool("cad_group_entities", {
  parameters: z.object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    name: z.string().min(1).optional(),
    ungroup: z.boolean().optional(),
    layer: z.string().min(1).optional()
  }),
  execute: ({ ids, name, ungroup, layer }, { handlers, projectId }) =>
    handlers.groupEntities(projectId, { ids, ungroup: ungroup === true, ...(name !== undefined ? { name } : {}), ...(layer !== undefined ? { layer } : {}) })
})
