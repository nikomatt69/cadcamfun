import { z } from "zod"
import { historySchema, parameterSchema, parametricReport } from "../parametric.ts"
import { defineTool } from "./define.ts"

const elementId = z.string().min(1).max(100)
const cases = z.array(z.object({ name: z.string().min(1).max(100), parameters: parameterSchema, expectedBodies: z.number().int().min(1).max(40).optional(), minVolumeMm3: z.number().finite().nonnegative().optional(), maxVolumeMm3: z.number().finite().positive().optional() })).min(1).max(12)
export const parametricInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), elementId }),
  z.object({ action: z.literal("validate"), history: historySchema }),
  z.object({ action: z.literal("create"), history: historySchema, name: z.string().min(1).max(100), x: z.number().finite().optional(), y: z.number().finite().optional(), z: z.number().finite().optional(), layer: z.string().min(1).max(100).optional() }),
  z.object({ action: z.literal("update"), elementId, parameters: parameterSchema, expectedRevision: z.string().min(1).max(100) }),
  z.object({ action: z.literal("test"), elementId, cases })
])
export type ParametricInput = z.infer<typeof parametricInputSchema>

export const cadParametric = defineTool("cad_parametric", {
  parameters: parametricInputSchema,
  execute: async (input, { handlers, projectId }) => {
    if (input.action === "validate") return parametricReport(input.history)
    if (handlers.parametric === undefined) return { ok: false, error: "Parametric project tools are unavailable in this host." }
    return handlers.parametric(projectId, input)
  }
})
