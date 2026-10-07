import { z } from "zod"
import { EntityChanges } from "../domain-schemas.ts"
import { defineTool, validated } from "./define.ts"

export const cadModifyEntities = defineTool("cad_modify_entities", {
  parameters: z.object({ changes: z.array(z.object({ id: z.string().min(1), changes: z.record(z.string(), z.unknown()) })).min(1) }),
  execute: ({ changes }, { handlers, projectId }) =>
    handlers.modifyEntities(projectId, changes.map((c) => ({ id: c.id, changes: validated(EntityChanges, c.changes) })))
})
