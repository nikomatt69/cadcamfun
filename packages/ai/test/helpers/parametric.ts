import { z } from "zod"
import { runAction, actionById } from "../../src/actions/catalogue.ts"
import type { ToolHandlersShape } from "../../src/tools/handlers.ts"
import {
  parametricCreateSchema, parametricDfmSchema, parametricFastenerSchema, parametricInspectSchema, parametricRecipeCreateSchema,
  parametricRecipeSchema, parametricTestSchema, parametricUpdateSchema, parametricValidateSchema
} from "../../src/actions/parametric.ts"

/**
 * The parametric surface as one union, for the tests that still speak the old `action:` vocabulary. Each leaf is the
 * catalogue action's own schema, so a union that parses still proves the action's schema is satisfied; the run below
 * goes through the catalogue like every other caller.
 */
const withAction = (name: string, schema: z.ZodObject<Record<string, z.ZodType>>) => schema.extend({ action: z.literal(name) })

export const parametricInputSchema = z.discriminatedUnion("action", [
  withAction("validate", parametricValidateSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("inspect", parametricInspectSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("test", parametricTestSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("create", parametricCreateSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("update", parametricUpdateSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("dfm", parametricDfmSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("fastener", parametricFastenerSchema as z.ZodObject<Record<string, z.ZodType>>),
  withAction("recipe", (parametricRecipeSchema as z.ZodObject<Record<string, z.ZodType>>).extend({ create: z.boolean().optional(), name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), z: z.number().optional(), layer: z.string().optional() }))
])

/** Which catalogue action answers a legacy `action:` call: creating a recipe is a write, reading one is not. */
const LEGACY_ACTION_IDS: Readonly<Record<string, string>> = {
  validate: "cad.parametric_validate",
  inspect: "cad.parametric_inspect",
  test: "cad.parametric_test",
  dfm: "cad.parametric_dfm",
  fastener: "cad.parametric_fastener",
  create: "cad_edit.parametric_create",
  update: "cad_edit.parametric_update"
}

export const parametricActionId = (input: { action: string; create?: boolean }): string => {
  if (input.action === "recipe") return input.create === true ? "cad_edit.parametric_recipe_create" : "cad.parametric_recipe"
  const id = LEGACY_ACTION_IDS[input.action]
  if (id === undefined || actionById(id) === undefined) throw new Error(`No catalogue action for parametric "${input.action}"`)
  return id
}

export interface ParametricCall { readonly projectId: string; readonly input: unknown }

/** Runs one legacy parametric call through the catalogue, recording what reached the project's handler. */
export const parametricHarness = (reply: (input: never) => unknown = () => ({ ok: true })): {
  calls: ParametricCall[]
  run: (input: unknown) => Promise<any>
  withoutHandler: (input: unknown) => Promise<any>
  handlers: ToolHandlersShape
} => {
  const calls: ParametricCall[] = []
  const handlers = {
    parametric: async (projectId: string, input: unknown) => { calls.push({ projectId, input }); return reply(input as never) }
  } as unknown as ToolHandlersShape
  const run = async (input: unknown) => {
    const value = input as { action: string; create?: boolean }
    const { action: _action, create, ...payload } = value
    return await runAction(parametricActionId(value), create === true ? { ...payload, create } : payload, { handlers, projectId: "p1" }) as any
  }
  return { calls, run, handlers, withoutHandler: (input: unknown) => runWith(input, {} as ToolHandlersShape) }
}

const runWith = async (input: unknown, handlers: ToolHandlersShape): Promise<any> => {
  const value = input as { action: string; create?: boolean }
  const { action: _action, create, ...payload } = value
  return await runAction(parametricActionId(value), create === true ? { ...payload, create } : payload, { handlers, projectId: "p1" }) as any
}