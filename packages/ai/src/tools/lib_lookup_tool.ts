import { z } from "zod"
import { defineTool } from "./define.ts"

export const libLookupTool = defineTool("lib_lookup_tool", {
  parameters: z.object({ query: z.string() }),
  execute: ({ query }, { handlers }) => handlers.lookupTool(query)
})
