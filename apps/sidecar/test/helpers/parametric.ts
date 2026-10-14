import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"

/**
 * The parametric calls of the sidecar tests, spelled with the short `action:` vocabulary (`create`, `inspect`, `dfm`, ...)
 * and routed to the consolidated tool and catalogue action that answers each: a read lives in `cad`
 * (`parametric_inspect`), a change in `cad_edit` (`parametric_create`), so a read-only role can never reach the second.
 */
const ROUTES: Readonly<Record<string, readonly [tool: "cad" | "cad_edit", action: string]>> = {
  validate: ["cad", "parametric_validate"],
  inspect: ["cad", "parametric_inspect"],
  test: ["cad", "parametric_test"],
  dfm: ["cad", "parametric_dfm"],
  fastener: ["cad", "parametric_fastener"],
  recipe: ["cad", "parametric_recipe"],
  from_element: ["cad", "parametric_from_element"],
  convert: ["cad_edit", "parametric_convert"],
  create: ["cad_edit", "parametric_create"],
  update: ["cad_edit", "parametric_update"]
}

export const parametricRoute = (input: { action?: unknown; create?: unknown }): readonly [string, string] => {
  const action = String(input.action)
  if (action === "recipe" && input.create === true) return ["cad_edit", "parametric_recipe_create"]
  const route = ROUTES[action]
  if (route === undefined) throw new Error(`No catalogue action for parametric "${action}"`)
  return route
}

export const makeParametricRunner = (handlers: () => ToolHandlersShape, projectId: () => string) => {
  const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
  return async (input: Record<string, unknown>) => {
    const [tool, action] = parametricRoute(input)
    const { create: _create, ...rest } = input
    const definition = buildTools(handlers(), projectId()).find((t) => t.id === tool)
    if (definition === undefined) throw new Error(`Tool ${tool} is not registered`)
    return JSON.parse(await definition.execute({ ...rest, action }, ctx)) as any
  }
}
