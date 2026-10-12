import { z } from "zod"
import { analyzeManufacturability, buildRecipe, keywayFor, METRIC_THREADS, recipeNames, requireThread, type History } from "@cadcamfun/core"
import { historySchema, parameterSchema, parametricReport } from "../parametric.ts"
import { defineTool } from "./define.ts"

const elementId = z.string().min(1).max(100)
const cases = z.array(z.object({ name: z.string().min(1).max(100), parameters: parameterSchema, expectedBodies: z.number().int().min(1).max(40).optional(), minVolumeMm3: z.number().finite().nonnegative().optional(), maxVolumeMm3: z.number().finite().positive().optional() })).min(1).max(12)
const recipes = recipeNames() as [string, ...string[]]
const length = z.number().finite().positive()
export const parametricInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), elementId }),
  z.object({ action: z.literal("validate"), history: historySchema }),
  z.object({ action: z.literal("create"), history: historySchema, name: z.string().min(1).max(100), x: z.number().finite().optional(), y: z.number().finite().optional(), z: z.number().finite().optional(), layer: z.string().min(1).max(100).optional() }),
  z.object({ action: z.literal("update"), elementId, parameters: parameterSchema, expectedRevision: z.string().min(1).max(100) }),
  z.object({ action: z.literal("test"), elementId, cases }),
  z.object({
    action: z.literal("recipe"), recipe: z.enum(recipes), params: z.record(z.string().min(1).max(80), z.unknown()).optional(), create: z.boolean().optional(),
    name: z.string().min(1).max(100).optional(), x: z.number().finite().optional(), y: z.number().finite().optional(), z: z.number().finite().optional(), layer: z.string().min(1).max(100).optional()
  }),
  z.object({
    action: z.literal("dfm"), elementId: elementId.optional(), history: historySchema.optional(), process: z.enum(["mill", "turn", "print"]).optional(), toolDiameter: length.optional(),
    material: z.enum(["metal", "cast", "plastic"]).optional(), minWall: length.optional(), envelope: z.object({ x: length, y: length, z: length }).optional()
  }),
  z.object({ action: z.literal("fastener"), size: z.string().min(1).max(20).optional(), fit: z.enum(["fine", "medium", "coarse"]).optional(), shaftDiameter: length.optional() })
])
export type ParametricInput = z.infer<typeof parametricInputSchema>
/** What the project handler receives: the actions that read or write the drawing. The others are answered by the tool itself. */
export type ParametricHandlerInput = Exclude<ParametricInput, { action: "recipe" | "dfm" | "fastener" }>

const asRecord = (value: unknown): Record<string, unknown> | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined)

const lookupFastener = (input: Extract<ParametricInput, { action: "fastener" }>) => {
  const keyway = input.shaftDiameter === undefined ? undefined : keywayFor(input.shaftDiameter)
  const shaft = input.shaftDiameter === undefined ? {} : keyway === undefined ? { keyway: null, keywayNote: "DIN 6885 covers shaft diameters over 6 up to 75 mm" } : { keyway }
  if (input.size === undefined) {
    return { ok: true, threads: METRIC_THREADS.map((m) => ({ ...m, clearanceHole: input.fit === undefined ? undefined : m.clearance[input.fit] })), ...shaft }
  }
  try {
    const thread = requireThread(input.size)
    return { ok: true, thread, ...(input.fit !== undefined ? { clearanceHole: thread.clearance[input.fit] } : {}), ...shaft }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
}

export const cadParametric = defineTool("cad_parametric", {
  parameters: parametricInputSchema,
  execute: async (input, { handlers, projectId }) => {
    if (input.action === "validate") return parametricReport(input.history)
    if (input.action === "fastener") return lookupFastener(input)
    if (input.action === "recipe") {
      let built: ReturnType<typeof buildRecipe>
      try { built = buildRecipe(input.recipe, input.params ?? {}) } catch (error) {
        if (error instanceof RangeError) return { ok: false, error: error.message }
        throw error
      }
      const parsed = historySchema.safeParse(built.history)
      if (!parsed.success) return { ok: false, error: `The ${input.recipe} recipe produced a history the schema refuses: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
      const report = parametricReport(parsed.data)
      const result = { ok: report.ok, recipe: built.recipe, summary: built.summary, derived: built.derived, rules: built.rules, history: parsed.data, report }
      if (input.create !== true) return result
      if (!report.ok) return { ...result, error: "The generated part did not rebuild cleanly, so it was not created." }
      if (handlers.parametric === undefined) return { ...result, ok: false, error: "Parametric project tools are unavailable in this host." }
      const name = input.name ?? RECIPE_TITLES[input.recipe] ?? input.recipe
      const created = await handlers.parametric(projectId, { action: "create", history: parsed.data, name, ...(input.x !== undefined ? { x: input.x } : {}), ...(input.y !== undefined ? { y: input.y } : {}), ...(input.z !== undefined ? { z: input.z } : {}), ...(input.layer !== undefined ? { layer: input.layer } : {}) })
      const createdOk = asRecord(created)?.["ok"] !== false
      return { ...result, ok: createdOk, created }
    }
    if (input.action === "dfm") {
      if ((input.elementId === undefined) === (input.history === undefined)) return { ok: false, error: "Send exactly one of elementId (an existing parametric part) or history." }
      let history: History
      if (input.history !== undefined) history = input.history as History
      else {
        if (handlers.parametric === undefined) return { ok: false, error: "Parametric project tools are unavailable in this host." }
        const inspected = asRecord(await handlers.parametric(projectId, { action: "inspect", elementId: input.elementId! }))
        if (inspected === undefined || inspected["ok"] === false) return inspected ?? { ok: false, error: "The part could not be read." }
        const decoded = historySchema.safeParse(inspected["history"])
        if (!decoded.success) return { ok: false, error: "The part has no readable parametric history." }
        history = decoded.data as History
      }
      const report = analyzeManufacturability(history, {
        ...(input.process !== undefined ? { process: input.process } : {}), ...(input.toolDiameter !== undefined ? { toolDiameter: input.toolDiameter } : {}),
        ...(input.material !== undefined ? { material: input.material } : {}), ...(input.minWall !== undefined ? { minWall: input.minWall } : {}),
        ...(input.envelope !== undefined ? { envelope: input.envelope } : {})
      })
      return { ...report }
    }
    if (handlers.parametric === undefined) return { ok: false, error: "Parametric project tools are unavailable in this host." }
    return handlers.parametric(projectId, input)
  }
})

const RECIPE_TITLES: Readonly<Record<string, string>> = {
  mounting_plate: "Mounting plate", flange: "Flange", l_bracket: "L bracket", stepped_shaft: "Stepped shaft", enclosure: "Enclosure"
}
