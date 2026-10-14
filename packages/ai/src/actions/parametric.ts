/**
 * Parametric parts: one history of named dimensions and ordered features, validated and rebuilt by the kernel.
 *
 * The six read actions (`cad.parametric_*`) and the three write actions (`cad_edit.parametric_*`) are declared
 * here because they share one implementation and one schema; only the catalogue decides which group each one is in,
 * because only the effect may decide that. A recipe that is not created changes nothing, so reading it and writing it
 * are different actions even though the same function answers both.
 */
import { z } from "zod"
import { analyzeManufacturability, brep, buildRecipe, drawing, historyToStep, keywayFor, METRIC_THREADS, rebuild, recipeNames, requireThread, type History } from "@cadcamfun/core"
import { EXACT_ACTION_BUDGET_MS, exactReport, historySchema, parameterSchema, parametricReport } from "../parametric.ts"
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
export const parametricExactSchema = z.object({
  elementId: elementId.optional(), history: historySchema.optional(),
  /** Also return the STEP AP214 file of the exact bodies. */
  includeStep: z.boolean().optional(),
  /** Product name in the STEP file. */
  name: z.string().min(1).max(100).optional()
})
export const parametricFastenerSchema =z.object({ size: z.string().min(1).max(20).optional(), fit: z.enum(["fine", "medium", "coarse"]).optional(), shaftDiameter: length.optional() })
/** Reading a recipe never creates it: `create` lives only on the write action. */
export const parametricRecipeSchema = z.object({ recipe: z.enum(recipes), params: z.record(z.string().min(1).max(80), z.unknown()).optional() })
export const parametricCreateSchema = z.object({ history: historySchema, ...named })
export const parametricUpdateSchema = z.object({ elementId, parameters: parameterSchema, expectedRevision: z.string().min(1).max(100) })
/** Reading the conversion builds the history; nothing is created. */
export const parametricFromElementSchema = z.object({ elementId, depth: length.optional() })
const principal = z.enum(["front", "top", "right"])
const sheetText = z.string().max(120)
export const parametricDrawingSchema = z.object({
  elementId: elementId.optional(), history: historySchema.optional(),
  options: z.object({
    size: z.enum(["A4", "A3", "A2"]).optional(), projection: z.enum(["first", "third"]).optional(),
    title: sheetText.optional(), drawingNumber: sheetText.optional(), material: sheetText.optional(),
    colour: sheetText.optional(), finish: sheetText.optional(), standard: sheetText.optional(), revision: sheetText.optional(),
    sheet: sheetText.optional(), date: sheetText.optional(), author: sheetText.optional(),
    notes: z.array(sheetText).max(8).optional(), views: z.array(principal).min(1).max(3).optional(), iso: z.boolean().optional(),
    scale: z.number().finite().min(0.02).max(50).optional(),
    section: z.object({ axis: z.enum(["x", "y", "z"]), at: z.number().finite(), from: z.enum(["+", "-"]).optional(), letter: z.string().max(2).optional(), parent: principal.optional() }).optional(),
    detail: z.object({ view: principal.optional(), centre: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }), radius: length.max(10000), factor: length.max(20), letter: z.string().max(2).optional() }).optional(),
    flatness: z.object({ value: length, view: principal.optional() }).optional()
  }).optional()
})
export const parametricConvertSchema = z.object({ elementId, depth: length.optional(), name: z.string().min(1).max(100).optional() })
export const parametricRecipeCreateSchema = z.object({ recipe: z.enum(recipes), params: z.record(z.string().min(1).max(80), z.unknown()).optional(), name: z.string().min(1).max(100).optional(), ...placement })

/** The parametric calls that read or write the drawing; the rest are answered by this package itself. */
export type ParametricHandlerInput =
  | { action: "inspect"; elementId: string }
  | { action: "convert"; elementId: string; depth?: number; name?: string; create: boolean }
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
  if (!createdOk) return { ...result, ok: false, error: typeof asRecord(created)?.["error"] === "string" ? String(asRecord(created)!["error"]) : "The part was built but could not be stored.", created }
  return { ...result, ok: true, created }
}

/** The parametric history of an element already in the drawing (the handler reads it); `create` also stores the parametric twin. */
export const runParametricFromElement = (input: z.infer<typeof parametricFromElementSchema>, context: ActionContext) =>
  of({ action: "convert", elementId: input.elementId, create: false, ...(input.depth !== undefined ? { depth: input.depth } : {}) }, context)
export const runParametricConvert = (input: z.infer<typeof parametricConvertSchema>, context: ActionContext) =>
  of({ action: "convert", elementId: input.elementId, create: true, ...(input.depth !== undefined ? { depth: input.depth } : {}), ...(input.name !== undefined ? { name: input.name } : {}) }, context)

export const runParametricValidate = (input: z.infer<typeof parametricValidateSchema>) => parametricReport(input.history)
export const runParametricFastener = (input: z.infer<typeof parametricFastenerSchema>) => lookupFastener(input)
export const runParametricRecipe = (input: z.infer<typeof parametricRecipeSchema>, context: ActionContext) => runRecipe(input, context, false)
export const runParametricRecipeCreate = (input: z.infer<typeof parametricRecipeCreateSchema>, context: ActionContext) => runRecipe(input, context, true)

const unavailable = { ok: false, error: "Parametric project tools are unavailable in this host." }
const of = <T extends ParametricHandlerInput>(input: T, context: ActionContext) =>
  context.handlers.parametric === undefined ? unavailable : context.handlers.parametric(context.projectId, input)

export const runParametricInspect = (input: z.infer<typeof parametricInspectSchema>, context: ActionContext) => of({ action: "inspect", elementId: input.elementId }, context)
export const runParametricTest = (input: z.infer<typeof parametricTestSchema>, context: ActionContext) => of({ action: "test", elementId: input.elementId, cases: input.cases }, context)

/** A sheet is a read-only derived artifact, never a new drawing or a change to the part. */
export const runParametricDrawing = async (input: z.infer<typeof parametricDrawingSchema>, context: ActionContext) => {
  if ((input.elementId === undefined) === (input.history === undefined)) return { ok: false, error: "Send exactly one of elementId or history." }
  let history = input.history
  let revision: unknown
  let projectId: unknown
  let drawingId: unknown
  if (input.elementId !== undefined) {
    const inspected = asRecord(await of({ action: "inspect", elementId: input.elementId }, context))
    if (inspected === undefined || inspected["ok"] === false) return inspected ?? unavailable
    const decoded = historySchema.safeParse(inspected["history"])
    if (!decoded.success) return { ok: false, error: "The part has no readable parametric history." }
    history = decoded.data
    revision = inspected["revision"]; projectId = inspected["projectId"]; drawingId = inspected["drawingId"]
  }
  try {
    const sheet = drawing.generateSheet(history!, input.options ?? {})
    return { ok: true, mutated: false, ...sheet, elementId: input.elementId, revision, projectId, drawingId }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "The drawing could not be generated." }
  }
}
export const runParametricCreate = (input: z.infer<typeof parametricCreateSchema>, context: ActionContext) =>
  of({
    action: "create", history: input.history, name: input.name,
    ...(input.x !== undefined ? { x: input.x } : {}), ...(input.y !== undefined ? { y: input.y } : {}),
    ...(input.z !== undefined ? { z: input.z } : {}), ...(input.layer !== undefined ? { layer: input.layer } : {})
  }, context)
export const runParametricUpdate = (input: z.infer<typeof parametricUpdateSchema>, context: ActionContext) =>
  of({ action: "update", elementId: input.elementId, parameters: input.parameters, expectedRevision: input.expectedRevision }, context)

/** The history given inline, or read from an existing parametric part; an error result when neither works. */
const historyOf = async (input: { elementId?: string; history?: unknown }, context: ActionContext): Promise<{ readonly history: History } | { readonly error: unknown }> => {
  if ((input.elementId === undefined) === (input.history === undefined)) return { error: { ok: false, error: "Send exactly one of elementId (an existing parametric part) or history." } }
  if (input.history !== undefined) return { history: input.history as History }
  if (context.handlers.parametric === undefined) return { error: unavailable }
  const inspected = asRecord(await context.handlers.parametric(context.projectId, { action: "inspect", elementId: input.elementId! }))
  if (inspected === undefined || inspected["ok"] === false) return { error: inspected ?? { ok: false, error: "The part could not be read." } }
  const decoded = historySchema.safeParse(inspected["history"])
  if (!decoded.success) return { error: { ok: false, error: "The part has no readable parametric history." } }
  return { history: decoded.data as History }
}

/** STEP text returned inline up to this size; larger files are only summarised. */
const STEP_INLINE_LIMIT = 400_000

/**
 * The exact B-rep of each body of a part: exact volume, area, centroid, through-holes, faces and surface kinds, or why a
 * body has only its mesh; optionally the STEP AP214 file of the exact bodies.
 */
export const runParametricExact = async (input: z.infer<typeof parametricExactSchema>, context: ActionContext) => {
  const got = await historyOf(input, context)
  if ("error" in got) return got.error
  const result = rebuild(got.history)
  const bodies = exactReport(got.history, result, EXACT_ACTION_BUDGET_MS)
  const out: Record<string, unknown> = { ok: !result.issues.some((i) => i.severity === "error"), bodies, issues: result.issues.slice(0, 20) }
  if (input.includeStep === true) {
    const step = brep.withBudget(EXACT_ACTION_BUDGET_MS, () => historyToStep(got.history, input.name ?? "part"))
    out["exported"] = step.exported
    out["skipped"] = step.skipped
    if (step.step !== undefined) {
      out["stepBytes"] = step.step.length
      if (step.step.length <= STEP_INLINE_LIMIT) out["step"] = step.step
      else out["stepNote"] = `The STEP file is ${step.step.length} characters; export it from the part instead of inline.`
    }
  }
  return out
}

/** Manufacturability of a history, or of an existing part read first; neither rebuilds geometry to answer. */
export const runParametricDfm = async (input: z.infer<typeof parametricDfmSchema>, context: ActionContext) => {
  const got = await historyOf(input, context)
  if ("error" in got) return got.error
  const history = got.history
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
