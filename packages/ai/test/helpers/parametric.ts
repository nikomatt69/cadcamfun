import { z } from "zod"
import { PARAMETRIC_ACTION_INPUTS } from "@cadcamfun/api"
import { runAction, actionById } from "../../src/actions/catalogue.ts"
import type { ToolHandlersShape } from "../../src/tools/handlers.ts"
import { nikcliWireSchema } from "../../src/tools/wire-schema.ts"

/**
 * The parametric surface as one union, for the tests that still speak the old `action:` vocabulary. Each leaf is the
 * nikcli schema derived from the catalogue action's own Effect input, so a union that parses still proves what the host
 * would accept; the run below goes through the catalogue like every other caller. The `parametric_*` spelling is what
 * the tool prompt documents, so it is the one the union is keyed by; the short name is accepted as an alias.
 */
const wire = (id: keyof typeof PARAMETRIC_ACTION_INPUTS) => nikcliWireSchema(PARAMETRIC_ACTION_INPUTS[id] as never)
const withAction = (name: string, short: string, schema: z.ZodObject<Record<string, z.ZodType>>) =>
  z.union([schema.safeExtend({ action: z.literal(name) }), schema.safeExtend({ action: z.literal(short) })])

export const parametricInputSchema = z.union([
  withAction("parametric_validate", "validate", wire("cad.parametric_validate")),
  withAction("parametric_inspect", "inspect", wire("cad.parametric_inspect")),
  withAction("parametric_test", "test", wire("cad.parametric_test")),
  withAction("parametric_create", "create", wire("cad_edit.parametric_create")),
  withAction("parametric_update", "update", wire("cad_edit.parametric_update")),
  withAction("parametric_dfm", "dfm", wire("cad.parametric_dfm")),
  withAction("parametric_fastener", "fastener", wire("cad.parametric_fastener")),
  withAction("parametric_recipe", "recipe", wire("cad_edit.parametric_recipe_create").safeExtend({ create: z.boolean().optional() }))
])

/**
 * Which catalogue action answers a call, keyed by the action name the model sends. The parametric calls are spelled
 * `parametric_*`, as the tool prompt and the skills document them; `validate`/`inspect`/`test` are accepted too so the
 * few tests written against the short vocabulary keep working.
 */
const ACTION_IDS: Readonly<Record<string, string>> = {
  validate: "cad.parametric_validate",
  parametric_validate: "cad.parametric_validate",
  inspect: "cad.parametric_inspect",
  parametric_inspect: "cad.parametric_inspect",
  test: "cad.parametric_test",
  parametric_test: "cad.parametric_test",
  dfm: "cad.parametric_dfm",
  parametric_dfm: "cad.parametric_dfm",
  fastener: "cad.parametric_fastener",
  parametric_fastener: "cad.parametric_fastener",
  create: "cad_edit.parametric_create",
  update: "cad_edit.parametric_update"
}

export const parametricActionId = (input: { action: string; create?: boolean }): string => {
  if (input.action === "recipe" || input.action === "parametric_recipe") {
    return input.create === true ? "cad_edit.parametric_recipe_create" : "cad.parametric_recipe"
  }
  const id = ACTION_IDS[input.action]
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
    const { action: _action, create: _create, ...payload } = value
    return await runAction(parametricActionId(value), payload, { handlers, projectId: "p1" }) as any
  }
  return { calls, run, handlers, withoutHandler: (input: unknown) => runWith(input, {} as ToolHandlersShape) }
}

const runWith = async (input: unknown, handlers: ToolHandlersShape): Promise<any> => {
  const value = input as { action: string; create?: boolean }
  const { action: _action, create: _create, ...payload } = value
  return await runAction(parametricActionId(value), payload, { handlers, projectId: "p1" }) as any
}