import { z } from "zod"
import { defineTool } from "./define.ts"

export const cadGrepInputSchema = z.object({
  query: z.string().min(1).max(200),
  layerId: z.string().min(1).max(100).optional(),
  /** Restrict to parametric parts. Off by default so one search also finds the plain geometry of a big project. */
  parametricOnly: z.boolean().default(false),
  /** Inline each parametric hit's full parameter set, so finding a part and reading its parameters is one call. */
  includeParameters: z.boolean().default(true),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(50).default(20)
})
export type CadGrepInput = z.infer<typeof cadGrepInputSchema>

export const cadGrep = defineTool("cad_grep", {
  parameters: cadGrepInputSchema,
  execute: async (input, { handlers, projectId }) => {
    if (handlers.grep === undefined) return { ok: false, error: "Drawing search is unavailable in this host." }
    return handlers.grep(projectId, input)
  }
})