import { z } from "zod"
import { EntityChanges } from "../domain-schemas.ts"
import { defineTool, validated } from "./define.ts"

export const cadModifyEntities = defineTool("cad_modify_entities", {
  parameters: z.object({ changes: z.array(z.object({ id: z.string().min(1), changes: z.record(z.string(), z.unknown()) })).min(1) }),
  execute: ({ changes }, { handlers, projectId }) =>
    // EntityChanges checks the fields it knows (sizes > 0, points); the rest (x, y, z, rotation, scale, history, parameters, any other
    // field of the element) passes through untouched and is judged against the element's own type by the handler.
    handlers.modifyEntities(projectId, changes.map((c) => ({ id: c.id, changes: { ...c.changes, ...validated(EntityChanges, c.changes) } })))
})
