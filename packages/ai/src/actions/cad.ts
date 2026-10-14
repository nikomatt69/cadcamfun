/**
 * `cad` — everything that reads the open drawing. No action here changes the document, the operations or the
 * libraries: inspection never provisions a project, a drawing or a default (the sidecar's handlers enforce that too),
 * which is what lets the read-only specialists have the whole tool.
 */
import { z } from "zod"
import { CadInspectionElements, CadInspectionLayers, CadInspectionProperty, CadInspectionSearch } from "@cadcamfun/api"
import { visionInputSchema } from "../vision.ts"
import { nikcliWireSchema } from "../tools/wire-schema.ts"
import { ToolMediaResult } from "../tools/define.ts"
import { defineAction, type ActionContext, type ActionParameters, type ActionSpec } from "./action.ts"
import type { CadInspectionInput as CadInspectionInputWire } from "@cadcamfun/api"
import {
  parametricDfmSchema, parametricDrawingSchema, parametricExactSchema, parametricFastenerSchema, parametricFromElementSchema, parametricInspectSchema, parametricRecipeSchema, parametricTestSchema, parametricValidateSchema,
  runParametricDfm, runParametricDrawing, runParametricExact, runParametricFastener, runParametricFromElement, runParametricInspect, runParametricRecipe, runParametricTest, runParametricValidate
} from "./parametric.ts"

/** A leaf's own parameters: the wire schema without its `action` literal, which the tool adds as the discriminator. */
const leaf = (schema: { omit: (mask: Record<string, true>) => unknown }) => schema.omit({ action: true }) as ActionParameters

/** What `cadInspect` receives: the shared contract with the host's own defaults filled in. */
export type CadInspectionInput =
  | (Extract<CadInspectionInputWire, { action: "elements" }> & { offset: number; limit: number })
  | Extract<CadInspectionInputWire, { action: "layers" }>
  | (Extract<CadInspectionInputWire, { action: "search" }> & { limit: number })
  | (Extract<CadInspectionInputWire, { action: "property" }> & { offset: number; maxChars: number })
export type CadComponentRelationsInput = { firstId: string; secondId: string }

/** The host's defaults (`offset` 0, `limit` 10/20, `maxChars` 10000) the handler reads; the wire schema stays free of transforms. */
const withDefaults = (value: Record<string, unknown>): Record<string, unknown> => {
  switch (value["action"]) {
    case "elements": return { offset: 0, limit: 10, ...value }
    case "search": return { limit: 20, ...value }
    case "property": return { offset: 0, maxChars: 10_000, ...value }
    default: return value
  }
}

export const cadGrepParameters = z.object({
  query: z.string().min(1).max(200),
  layerId: z.string().min(1).max(100).optional(),
  /** Restrict to parametric parts. Off by default so one search also finds the plain geometry of a big project. */
  parametricOnly: z.boolean().default(false),
  /** Inline each parametric hit's full parameter set, so finding a part and reading its parameters is one call. */
  includeParameters: z.boolean().default(true),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(50).default(20)
})
export type CadGrepInput = z.infer<typeof cadGrepParameters>

/** The exact kernel over the whole drawing: `ids` narrows it to some elements, `machining` skips the CAM feature evaluation. */
export const cadExactParameters = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(40).optional().describe("Element ids to analyse (default: every solid of the drawing)."),
  machining: z.boolean().optional().describe("Include how the CAM planner machines each solid (features or 3D surface job); default true.")
})
export type CadExactInput = z.infer<typeof cadExactParameters>
export const cadAssemblyParameters = z.object({ washers: z.boolean().optional().describe("Count missing washers as missing fasteners; default true.") })
export type CadAssemblyInput = z.infer<typeof cadAssemblyParameters>

const inspect = (action: string) => (input: unknown, context: ActionContext) =>
  context.handlers.cadInspect === undefined
    ? { ok: false, error: "Inspection is unavailable in this host." }
    : context.handlers.cadInspect(context.projectId, withDefaults({ ...(input as Record<string, unknown>), action }) as never)

const vision = (mode: "cad" | "cam", filename: string) => async (input: z.infer<typeof visionInputSchema>, context: ActionContext) => {
  if (context.handlers.vision === undefined) return { ok: false, error: "Viewport capture is unavailable in this host." }
  const result = await context.handlers.vision(context.projectId, mode, input.focus, context.signal)
  if (!result.ok) return result
  return new ToolMediaResult(result.evidence, [{ type: "file", mime: result.capture.mime, filename, url: `data:${result.capture.mime};base64,${result.capture.data}` }])
}

export const CAD_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineAction({
    id: "cad.describe", kind: "read", effects: [], replaces: "cad_describe_drawing",
    parameters: z.object({}),
    run: (_input, { handlers, projectId }) => handlers.describeDrawing(projectId)
  }),
  defineAction({
    id: "cad.check", kind: "read", effects: [], replaces: "cad_check_design",
    parameters: z.object({}),
    run: (_input, { handlers, projectId }) => handlers.checkDesign(projectId)
  }),
  defineAction({
    id: "cad.relations", kind: "read", effects: [], replaces: "cad_component_relations",
    parameters: z.object({ firstId: z.string().min(1), secondId: z.string().min(1) }),
    run: (input, { handlers, projectId }) =>
      handlers.cadComponentRelations === undefined
        ? { ok: false, error: "Inspection is unavailable in this host." }
        : handlers.cadComponentRelations(projectId, input)
  }),
  defineAction({
    id: "cad.grep", kind: "read", effects: [], replaces: "cad_grep",
    parameters: cadGrepParameters,
    run: (input, { handlers, projectId }) =>
      handlers.grep === undefined ? { ok: false, error: "Drawing search is unavailable in this host." } : handlers.grep(projectId, input)
  }),
  defineAction({
    id: "cad.vision", kind: "read", effects: ["ui"], replaces: "cad_vision",
    parameters: visionInputSchema,
    run: vision("cad", "cad-viewport.png")
  }),
  defineAction({
    id: "cad.inspect_elements", kind: "read", effects: [], replaces: "cad_inspect",
    parameters: leaf(nikcliWireSchema(CadInspectionElements)),
    run: inspect("elements")
  }),
  defineAction({
    id: "cad.inspect_layers", kind: "read", effects: [], replaces: "cad_inspect",
    parameters: leaf(nikcliWireSchema(CadInspectionLayers)),
    run: inspect("layers")
  }),
  defineAction({
    id: "cad.inspect_search", kind: "read", effects: [], replaces: "cad_inspect",
    parameters: leaf(nikcliWireSchema(CadInspectionSearch)),
    run: inspect("search")
  }),
  defineAction({
    id: "cad.inspect_property", kind: "read", effects: [], replaces: "cad_inspect",
    parameters: leaf(nikcliWireSchema(CadInspectionProperty)),
    run: inspect("property")
  }),
  defineAction({
    id: "cad.drawing", kind: "read", effects: [],
    parameters: parametricDrawingSchema,
    run: (input, context) => runParametricDrawing(input, context)
  }),
  defineAction({
    id: "cad.parametric_validate", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricValidateSchema,
    run: (input) => runParametricValidate(input)
  }),
  defineAction({
    id: "cad.parametric_inspect", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricInspectSchema,
    run: (input, context) => runParametricInspect(input, context)
  }),
  defineAction({
    id: "cad.parametric_test", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricTestSchema,
    run: (input, context) => runParametricTest(input, context)
  }),
  defineAction({
    id: "cad.parametric_dfm", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricDfmSchema,
    run: (input, context) => runParametricDfm(input, context)
  }),
  defineAction({
    id: "cad.parametric_exact", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricExactSchema,
    run: (input, context) => runParametricExact(input, context)
  }),
  defineAction({
    id: "cad.exact", kind: "read", effects: [],
    parameters: cadExactParameters,
    run: (input, { handlers, projectId }) =>
      handlers.cadExact === undefined ? { ok: false, error: "Exact analysis is unavailable in this host." } : handlers.cadExact(projectId, input)
  }),
  defineAction({
    id: "cad.assembly", kind: "read", effects: [],
    parameters: cadAssemblyParameters,
    run: (input, { handlers, projectId }) =>
      handlers.cadAssembly === undefined ? { ok: false, error: "Assembly analysis is unavailable in this host." } : handlers.cadAssembly(projectId, input)
  }),
  defineAction({
    id: "cad.parametric_fastener", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricFastenerSchema,
    run: (input) => runParametricFastener(input)
  }),
  defineAction({
    id: "cad.parametric_recipe", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricRecipeSchema,
    run: (input, context) => runParametricRecipe(input, context)
  }),
  defineAction({
    id: "cad.parametric_from_element", kind: "read", effects: [], replaces: "cad_parametric",
    parameters: parametricFromElementSchema,
    run: (input, context) => runParametricFromElement(input, context)
  })
]
