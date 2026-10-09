import { z } from "zod"
import { defineTool } from "./define.ts"

export const setupCandidateSchema = z.object({ name: z.string().min(1).max(100), params: z.record(z.string(), z.unknown()), toolId: z.string().min(1).optional(), materialId: z.string().min(1).optional() })
export type SetupCandidate = z.infer<typeof setupCandidateSchema>

export const camSuggestParameters = defineTool("cam_suggest_parameters", {
  parameters: z.object({ params: z.record(z.string(), z.unknown()).optional(), candidates: z.array(setupCandidateSchema).min(1).max(4).optional() }),
  execute: ({ params, candidates }, { handlers, projectId }) => candidates
    ? handlers.compareSetups?.(projectId, candidates) ?? Promise.resolve({ ok: false, error: "Setup comparisons are not available in this runtime." })
    : handlers.suggestParameters(projectId, params ?? {})
})
