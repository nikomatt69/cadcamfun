/**
 * Parametric parts: one history of named dimensions and ordered features, validated and rebuilt by the kernel.
 *
 * The six read actions (`cad.parametric_*`) and the three write actions (`cad_edit.parametric_*`) are declared
 * here because they share one implementation and one schema; only the catalogue decides which group each one is in,
 * because only the effect may decide that. A recipe that is not created changes nothing, so reading it and writing it
 * are different actions even though the same function answers both.
 */
import { z } from "zod"
import { analyzeManufacturability, buildRecipe, keywayFor, METRIC_THREADS, recipeNames, requireThread, type History } from "@cadcamfun/core"
import { historySchema, parameterSchema, parametricReport } from "../parametric.ts"
import type { ActionContext } from "./action.ts"

const elementId = z.string().min(1).max(100)
const cases = z.array(z.object({
  name: z.string().min(1).max(100), parameters: parameterSchema,
  expectedBodies: z.number().int().min(1).max(40).optional(),
  minVolumeMm3: z.number().finite().nonnegative().optional(),
  maxVolumeMm3: z.number().finite().positive().optional()
})).min(1).max(12)
const recipes = recipeNames() as [string, ...string[]]
const length = z.number().finite().positive()
const placement = {
  x: z.number().finite().optional(), y: z.number().finite().optional(), z: z.number().finite().optional(),
  layer: z.string().min(1).max(100).optional()
}
const named = { name: z.string().min(1).max(100), ...placement }

export const parametricValidateSchema = z.object({ history: historySchema })
export const parametricInspectSchema = z.object({ elementId })
export const parametricTestSchema = z.object({ elementId, cases })
export const parametricDfmSchema = z.object({
  elementId: elementId.optional(), history: historySchema.optional(), process: z.enum(["mill", "turn", "print"]).optional(),
  toolDiameter: length.optional(), material: z.enum(["metal", "cast", "plastic"]).optional(), minWall: length.optional(),
  envelope: z.object({ x: length, y: length, z: length }).optional()
})
export const parametricFastenerSchema = z.object({ size: z.string().min(1).max(20).optional(), fit: z.enum(["fine", "medium", "coarse"]).optional(), shaftDiameter: length.optional() })
/** Reading a recipe never creates it: `create` lives only on the write action. */
export const parametricRecipeSchema = z.object({ recipe: z.enum(recipes), params: z.record(z.string().min(1).max(80), z.unknown()).optional() })
export const parametricCreateSchema = z.object({ history: historySchema, ...named })
export const parametricUpdateSchema = z.object({ elementId, parameters: parameterSchema, expectedRevision: z.string().min(1).max(100) })
export const parametricRecipeCreateSchema = z.object({ recipe: z.enum(recipes), params: z.record(z.string().min(1).max(80), z.unknown()).optional(), name: z.string().min(1).max(100).optional(), ...placement })

export type ParametricInput =
  | z.infer<typeof parametricValidateSchema> | z.infer<typeof parametricInspectSchema> | z.infer<typeof parametricTestSchema>
  | z.infer<typeof parametricDfmSchema> | z.infer<typeof parametricFastenerSchema> | z.infer<typeof parametricRecipeSchema>
  | z.infer<typeof parametricCreateSchema> | z.infer<typeof parametricUpdateSchema> | z.infer<typeof parametricRecipeCreateSchema>

/** The parametric calls that read or write the drawing; the rest are answered by this package itself. */
export type ParametricHandlerInput =
  | { action: "inspect"; elementId: string }
  | { action: "validate"; history: z.input<typeof parametricValidateSchema>["history"] }
  | { action: "test"; elementId: string; cases: z.infer<typeof parametricTestSchema>["cases"] }
  | { action: "create"; history: z.input<typeof parametricCreateSchema>["history"]; name: string; x?: number; y?: number; z?: number; layer?: string }
  | { action: "update"; elementId: string; parameters: z.input<typeof parametricUpdateSchema>["parameters"]; expectedRevision: string }

/** Where a new parametric part is placed, in mm. */
type Placement = { readonly x?: number; readonly y?: number; readonly z?: number; readonly layer?: string }

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const RECIPE_TITLES: Readonly<Record<string, string>> = {
  mounting_plate: "Mounting plate", flange: "Flange", l_bracket: "L bracket", stepped_shaft: "Stepped shaft", enclosure: "Enclosure"
}

const lookupFastener = (input: z.infer<typeof parametricFastenerSchema>) => {
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

/** Builds the recipe and, when `create` is on, sends its history to the project once. */
const runRecipe = async (
  input: { recipe: string; params?: Record<string, unknown>; name?: string } & Placement,
  context: ActionContext,
  create: boolean
) => {
  let built: ReturnType<typeof buildRecipe>
  try { built = buildRecipe(input.recipe, input.params ?? {}) } catch (error) {
    if (error instanceof RangeError) return { ok: false, error: error.message }
    throw error
  }
  const parsed = historySchema.safeParse(built.history)
  if (!parsed.success) return { ok: false, error: `The ${input.recipe} recipe produced a history the schema refuses: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }
  const report = parametricReport(parsed.data)
  const result = { ok: report.ok, recipe: built.recipe, summary: built.summary, derived: built.derived, rules: built.rules, history: parsed.data, report }
  if (!create) return result
  if (!report.ok) return { ...result, error: "The generated part did not rebuild cleanly, so it was not created." }
  if (context.handlers.parametric === undefined) return { ...result, ok: false, error: "Parametric project tools are unavailable in this host." }
  const name = input.name ?? RECIPE_TITLES[input.recipe] ?? input.recipe
  const created = await context.handlers.parametric(context.projectId, {
    action: "create", history: parsed.data, name,
    ...(input.x !== undefined ? { x: input.x } : {}), ...(input.y !== undefined ? { y: input.y } : {}),
    ...(input.z !== undefined ? { z: input.z } : {}), ...(input.layer !== undefined ? { layer: input.layer } : {})
  })
  const createdOk = asRecord(created)?.["ok"] !== false
  return { ...result, ok: createdOk, created }
}

export const runParametricValidate = (input: z.infer<typeof parametricValidateSchema>) => parametricReport(input.history)
export const runParametricFastener = (input: z.infer<typeof parametricFastenerSchema>) => lookupFastener(input)
export const runParametricRecipe = (input: z.infer<typeof parametricRecipeSchema>, context: ActionContext) => runRecipe(input, context, false)
export const runParametricRecipeCreate = (input: z.infer<typeof parametricRecipeCreateSchema>, context: ActionContext) => runRecipe(input, context, true)

const unavailable = { ok: false, error: "Parametric project tools are unavailable in this host." }
const of = <T extends ParametricHandlerInput>(input: T, context: ActionContext) =>
  context.handlers.parametric === undefined ? unavailable : context.handlers.parametric(context.projectId, input)

export const runParametricInspect = (input: z.infer<typeof parametricInspectSchema>, context: ActionContext) => of({ action: "inspect", elementId: input.elementId }, context)
export const runParametricTest = (input: z.infer<typeof parametricTestSchema>, context: ActionContext) => of({ action: "test", elementId: input.elementId, cases: input.cases }, context)
export const runParametricCreate = (input: z.infer<typeof parametricCreateSchema>, context: ActionContext) =>
  of({
    action: "create", history: input.history, name: input.name,
    ...(input.x !== undefined ? { x: input.x } : {}), ...(input.y !== undefined ? { y: input.y } : {}),
    ...(input.z !== undefined ? { z: input.z } : {}), ...(input.layer !== undefined ? { layer: input.layer } : {})
  }, context)
export const runParametricUpdate = (input: z.infer<typeof parametricUpdateSchema>, context: ActionContext) =>
  of({ action: "update", elementId: input.elementId, parameters: input.parameters, expectedRevision: input.expectedRevision }, context)

/** Manufacturability of a history, or of an existing part read first; neither rebuilds geometry to answer. */
export const runParametricDfm = async (input: z.infer<typeof parametricDfmSchema>, context: ActionContext) => {
  if ((input.elementId === undefined) === (input.history === undefined)) return { ok: false, error: "Send exactly one of elementId (an existing parametric part) or history." }
  let history: History
  if (input.history !== undefined) history = input.history as History
  else {
    if (context.handlers.parametric === undefined) return unavailable
    const inspected = asRecord(await context.handlers.parametric(context.projectId, { action: "inspect", elementId: input.elementId! }))
    if (inspected === undefined || inspected["ok"] === false) return inspected ?? { ok: false, error: "The part could not be read." }
    const decoded = historySchema.safeParse(inspected["history"])
    if (!decoded.success) return { ok: false, error: "The part has no readable parametric history." }
    history = decoded.data as History
  }
  return {
    ...analyzeManufacturability(history, {
      ...(input.process !== undefined ? { process: input.process } : {}),
      ...(input.toolDiameter !== undefined ? { toolDiameter: input.toolDiameter } : {}),
      ...(input.material !== undefined ? { material: input.material } : {}),
      ...(input.minWall !== undefined ? { minWall: input.minWall } : {}),
      ...(input.envelope !== undefined ? { envelope: input.envelope } : {})
    })
  }
}