import { z } from "zod"
import { defineTool } from "./define.ts"

export const cadDeleteEntities = defineTool("cad_delete_entities", {
  parameters: z.object({ ids: z.array(z.string().min(1)).min(1), confirm: z.boolean() }),
  execute: async ({ ids, confirm }, { handlers, projectId }) =>
    confirm !== true ? { ok: false, error: "Deleting needs confirm: true." } : handlers.deleteEntities(projectId, ids)
})
