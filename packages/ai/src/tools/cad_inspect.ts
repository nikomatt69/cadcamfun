import { CadInspectionInput } from "@cadcamfun/api"
import { Schema } from "effect"
import { nikcliWireSchema } from "./wire-schema.ts"
import { defineTool } from "./define.ts"
export type cadInspectInput =
  | (Extract<CadInspectionInput, { action: "elements" }> & { offset: number; limit: number })
  | Extract<CadInspectionInput, { action: "layers" }>
  | (Extract<CadInspectionInput, { action: "search" }> & { limit: number })
  | (Extract<CadInspectionInput, { action: "property" }> & { offset: number; maxChars: number })
/**
 * What the host validates the call against and shows the model: the contract as a JSON Schema.
 *
 * It carries no `.transform()` on purpose. Every tool schema is serialised once per turn to build the
 * provider request, and Zod cannot represent a transform ("Transforms cannot be represented in JSON
 * Schema"), so one transformed tool fails the whole prompt loop before the model is ever called —
 * every message ends as `Session interrupted`. The host defaults are applied by `withHostDefaults`,
 * on the same values, right before the handler sees them.
 */
export const cadInspectInputSchema = nikcliWireSchema(CadInspectionInput)
/** The contract as the handlers read it: the host's defaults (`offset` 0, `limit` 10/20, `maxChars` 10000) filled in. */
export const withHostDefaults = (value: unknown): cadInspectInput => {
  const input = Schema.decodeUnknownSync(CadInspectionInput)(value)
  switch (input.action) {
    case "elements": return { ...input, offset: input.offset ?? 0, limit: input.limit ?? 10 }
    case "search": return { ...input, limit: input.limit ?? 20 }
    case "property": return { ...input, offset: input.offset ?? 0, maxChars: input.maxChars ?? 10000 }
    case "layers": return input
  }
}
export const cadInspect = defineTool("cad_inspect", {
  parameters: cadInspectInputSchema,
  execute: (input, { handlers, projectId }) => handlers.cadInspect ? handlers.cadInspect(projectId, withHostDefaults(input)) : Promise.resolve({ ok: false, error: "Inspection is unavailable in this host." })
})
