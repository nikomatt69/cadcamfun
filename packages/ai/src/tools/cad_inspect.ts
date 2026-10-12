import { CadInspectionInput } from "@cadcamfun/api"
import { Schema } from "effect"
import { nikcliWireSchema } from "./wire-schema.ts"
import { defineTool } from "./define.ts"
export type cadInspectInput =
  | (Extract<CadInspectionInput, { action: "elements" }> & { offset: number; limit: number })
  | Extract<CadInspectionInput, { action: "layers" }>
  | (Extract<CadInspectionInput, { action: "search" }> & { limit: number })
  | (Extract<CadInspectionInput, { action: "property" }> & { offset: number; maxChars: number })
export const cadInspectInputSchema = nikcliWireSchema(CadInspectionInput).transform((value): cadInspectInput => {
  const input = Schema.decodeUnknownSync(CadInspectionInput)(value)
  switch (input.action) {
    case "elements": return { ...input, offset: input.offset ?? 0, limit: input.limit ?? 10 }
    case "search": return { ...input, limit: input.limit ?? 20 }
    case "property": return { ...input, offset: input.offset ?? 0, maxChars: input.maxChars ?? 10000 }
    case "layers": return input
  }
})
export const cadInspect = defineTool("cad_inspect", {
  parameters: cadInspectInputSchema,
  execute: (input, { handlers, projectId }) => handlers.cadInspect ? handlers.cadInspect(projectId, input) : Promise.resolve({ ok: false, error: "Inspection is unavailable in this host." })
})
