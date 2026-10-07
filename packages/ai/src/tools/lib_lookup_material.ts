import { z } from "zod"
import { defineTool } from "./define.ts"

export const libLookupMaterial = defineTool("lib_lookup_material", {
  parameters: z.object({ query: z.string() }),
  execute: ({ query }, { handlers }) => handlers.lookupMaterial(query)
})
