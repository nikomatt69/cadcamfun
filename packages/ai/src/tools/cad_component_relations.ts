import { z } from "zod"
import { defineTool } from "./define.ts"
export const cadComponentRelationsInputSchema = z.object({ firstId: z.string().min(1), secondId: z.string().min(1) })
export type cadComponentRelationsInput = z.infer<typeof cadComponentRelationsInputSchema>
export const cadComponentRelations = defineTool("cad_component_relations", {
  parameters: cadComponentRelationsInputSchema,
  execute: (input, { handlers, projectId }) => handlers.cadComponentRelations ? handlers.cadComponentRelations(projectId, input) : Promise.resolve({ ok: false, error: "Inspection is unavailable in this host." })
})
