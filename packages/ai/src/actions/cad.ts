/**
 * `cad` — everything that reads the open drawing. No action here changes the document, the operations or the
 * libraries: inspection never provisions a project, a drawing or a default (the sidecar's handlers enforce that too),
 * which is what lets the read-only specialists have the whole tool.
 */
import { CAD_ACTION_INPUTS, EmptyActionInput, CadInspectionElements, CadInspectionLayers, CadInspectionOrigins, CadInspectionProperty, CadInspectionSearch, PARAMETRIC_ACTION_INPUTS } from "@cadcamfun/api"
import { cad } from "@cadcamfun/core"
import { Schema } from "effect"
import type { FilePart } from "../attachments.ts"
import { ToolMediaResult } from "../tools/define.ts"
import { defineWireAction, type ActionContext, type ActionSpec } from "./action.ts"
import type { CadInspectionInput as CadInspectionInputWire, VisionInput } from "@cadcamfun/api"
import {
  runParametricDfm, runParametricDrawing, runParametricExact, runParametricFastener, runParametricFromElement, runParametricInspect, runParametricRecipe, runParametricTest, runParametricValidate
} from "./parametric.ts"

const INPUTS = { ...CAD_ACTION_INPUTS, ...PARAMETRIC_ACTION_INPUTS }

/** A leaf's own parameters: the shared inspection schema without its `action` literal, which the tool adds as the discriminator. */
const leaf = <F extends { readonly action: unknown }>(schema: { readonly fields: F }) => {
  const { action: _action, ...fields } = schema.fields
  // An empty Struct derives to "object or array"; the shared empty input says "object".
  const leafSchema = Object.keys(fields).length === 0 ? EmptyActionInput : Schema.Struct(fields as unknown as Schema.Struct.Fields)
  return leafSchema as unknown as Schema.Codec<Record<string, unknown>, unknown>
}

/** What `cadInspect` receives: the shared contract with the host's own defaults filled in. */
export type CadInspectionInput =
  | (Extract<CadInspectionInputWire, { action: "elements" }> & { offset: number; limit: number })
  | Extract<CadInspectionInputWire, { action: "layers" }>
  | (Extract<CadInspectionInputWire, { action: "search" }> & { limit: number })
  | (Extract<CadInspectionInputWire, { action: "property" }> & { offset: number; maxChars: number })
  | (Extract<CadInspectionInputWire, { action: "origins" }> & { offset: number; limit: number })
export type CadComponentRelationsInput = { firstId: string; secondId: string }

/** The host's defaults (`offset` 0, `limit` 10/20, `maxChars` 10000) the handler reads; the wire schema stays free of transforms. */
const withDefaults = (value: Record<string, unknown>): Record<string, unknown> => {
  switch (value["action"]) {
    case "elements": return { offset: 0, limit: 10, ...value }
    case "origins": return { offset: 0, limit: 10, ...value }
    case "search": return { limit: 20, ...value }
    case "property": return { offset: 0, maxChars: 10_000, ...value }
    default: return value
  }
}

export type { CadAssemblyInput, CadDistanceInput, CadExactInput, CadGrepInput, CadShellInput, CadOffsetInput, CadMotionInput } from "@cadcamfun/api"

const inspect = (action: string) => (input: unknown, context: ActionContext) =>
  context.handlers.cadInspect === undefined
    ? { ok: false, error: "Inspection is unavailable in this host." }
    : context.handlers.cadInspect(context.projectId, withDefaults({ ...(input as Record<string, unknown>), action }) as never)

/** A capture of the viewport the user sees, with its evidence; shared by `cad.vision` and `cam.vision`. */
export const vision = (mode: "cad" | "cam", filename: string, sheetName = filename.replace(/-viewport\.png$/, "-program.png")) => async (input: typeof VisionInput.Type, context: ActionContext) => {
  if (context.handlers.vision === undefined) return { ok: false, error: "Viewport capture is unavailable in this host." }
  const result = await context.handlers.vision(context.projectId, mode, input.focus, context.signal)
  if (!result.ok) return result
  const capture = result.capture
  // The image the user sees: the viewport, or the program sheet that stands in for it.
  const files: FilePart[] = [{
    type: "file",
    mime: capture.mime,
    filename: capture.kind === "sheet" ? sheetName : filename,
    url: `data:${capture.mime};base64,${capture.data}`
  }]
  // The program sheet, when the capture is the viewport: the G-code and the toolpaths as a picture.
  if (capture.sheet !== undefined) {
    files.push({ type: "file", mime: capture.sheet.mime, filename: sheetName, url: `data:${capture.sheet.mime};base64,${capture.sheet.data}` })
  }
  return new ToolMediaResult(result.evidence, files)
}

export const CAD_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cad.describe", kind: "read", replaces: "cad_describe_drawing",
    parameters: INPUTS["cad.describe"],
    run: (_input, { handlers, projectId }) => handlers.describeDrawing(projectId)
  }),
  defineWireAction({
    id: "cad.check", kind: "read", replaces: "cad_check_design",
    parameters: INPUTS["cad.check"],
    run: (_input, { handlers, projectId }) => handlers.checkDesign(projectId)
  }),
  defineWireAction({
    id: "cad.relations", kind: "read", replaces: "cad_component_relations",
    parameters: INPUTS["cad.relations"],
    run: (input, { handlers, projectId }) =>
      handlers.cadComponentRelations === undefined
        ? { ok: false, error: "Inspection is unavailable in this host." }
        : handlers.cadComponentRelations(projectId, input)
  }),
  defineWireAction({
    id: "cad.grep", kind: "read", replaces: "cad_grep",
    parameters: INPUTS["cad.grep"],
    run: (input, { handlers, projectId }) =>
      handlers.grep === undefined ? { ok: false, error: "Drawing search is unavailable in this host." } : handlers.grep(projectId, input)
  }),
  defineWireAction({
    id: "cad.vision", kind: "read", replaces: "cad_vision",
    parameters: INPUTS["cad.vision"],
    run: vision("cad", "cad-viewport.png")
  }),
  defineWireAction({
    id: "cad.inspect_elements", kind: "read", replaces: "cad_inspect",
    parameters: leaf(CadInspectionElements),
    run: inspect("elements")
  }),
  defineWireAction({
    id: "cad.inspect_layers", kind: "read", replaces: "cad_inspect",
    parameters: leaf(CadInspectionLayers),
    run: inspect("layers")
  }),
  defineWireAction({
    id: "cad.inspect_search", kind: "read", replaces: "cad_inspect",
    parameters: leaf(CadInspectionSearch),
    run: inspect("search")
  }),
  defineWireAction({
    id: "cad.inspect_property", kind: "read", replaces: "cad_inspect",
    parameters: leaf(CadInspectionProperty),
    run: inspect("property")
  }),
  defineWireAction({
    id: "cad.inspect_origins", kind: "read", replaces: "cad_inspect",
    parameters: leaf(CadInspectionOrigins),
    run: inspect("origins")
  }),
  defineWireAction({
    id: "cad.drawing", kind: "read",
    parameters: INPUTS["cad.drawing"],
    run: (input, context) => runParametricDrawing(input, context)
  }),
  defineWireAction({
    id: "cad.parametric_validate", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_validate"],
    run: (input) => runParametricValidate(input)
  }),
  defineWireAction({
    id: "cad.parametric_inspect", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_inspect"],
    run: (input, context) => runParametricInspect(input, context)
  }),
  defineWireAction({
    id: "cad.parametric_test", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_test"],
    run: (input, context) => runParametricTest(input, context)
  }),
  defineWireAction({
    id: "cad.parametric_dfm", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_dfm"],
    run: (input, context) => runParametricDfm(input, context)
  }),
  defineWireAction({
    id: "cad.parametric_exact", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_exact"],
    run: (input, context) => runParametricExact(input, context)
  }),
  defineWireAction({
    id: "cad.exact", kind: "read",
    parameters: INPUTS["cad.exact"],
    run: (input, { handlers, projectId }) =>
      handlers.cadExact === undefined ? { ok: false, error: "Exact analysis is unavailable in this host." } : handlers.cadExact(projectId, input)
  }),
  defineWireAction({
    id: "cad.assembly", kind: "read",
    parameters: INPUTS["cad.assembly"],
    run: (input, { handlers, projectId }) =>
      handlers.cadAssembly === undefined ? { ok: false, error: "Assembly analysis is unavailable in this host." } : handlers.cadAssembly(projectId, input)
  }),
  defineWireAction({
    id: "cad.shell", kind: "read",
    parameters: INPUTS["cad.shell"],
    run: (input, { handlers, projectId }) =>
      handlers.cadShell === undefined ? { ok: false, error: "Shell analysis is unavailable in this host." } : handlers.cadShell(projectId, input)
  }),
  defineWireAction({
    id: "cad.offset", kind: "read", parameters: INPUTS["cad.offset"],
    run: (input, { handlers, projectId }) => handlers.cadOffset === undefined ? { ok: false, error: "Offset analysis is unavailable in this host." } : handlers.cadOffset(projectId, input)
  }),
  defineWireAction({
    id: "cad.motion", kind: "read", parameters: INPUTS["cad.motion"],
    run: (input, { handlers, projectId }) => handlers.cadMotion === undefined ? { ok: false, error: "Motion analysis is unavailable in this host." } : handlers.cadMotion(projectId, input)
  }),
  defineWireAction({ id: "cad.surface", kind: "read", parameters: INPUTS["cad.surface"],
    run: (input) => {
      try {
        const body = cad.brep.buildSurfaceOperation(input), report = cad.brep.validateBrep(body.brep)
        return { ok: true, kind: body.kind, valid: report.valid, faces: body.brep.faces.length, boundaryEdges: cad.brep.edgeUses(body.brep).filter((u) => u.length === 1).length }
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
    } }),
  defineWireAction({ id: "cad.exchange", kind: "read", parameters: INPUTS["cad.exchange"],
    run: (input, { handlers, projectId }) => handlers.cadExchange === undefined ? { ok: false, error: "Exact exchange is unavailable in this host." } : handlers.cadExchange(projectId, input) }),
  defineWireAction({
    id: "cad.distance", kind: "read",
    parameters: INPUTS["cad.distance"],
    run: (input, { handlers, projectId }) =>
      handlers.cadDistance === undefined ? { ok: false, error: "Distance analysis is unavailable in this host." } : handlers.cadDistance(projectId, input)
  }),
  defineWireAction({
    id: "cad.parametric_fastener", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_fastener"],
    run: (input) => runParametricFastener(input)
  }),
  defineWireAction({
    id: "cad.parametric_recipe", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_recipe"],
    run: (input, context) => runParametricRecipe(input, context)
  }),
  defineWireAction({
    id: "cad.parametric_from_element", kind: "read", replaces: "cad_parametric",
    parameters: INPUTS["cad.parametric_from_element"],
    run: (input, context) => runParametricFromElement(input, context)
  })
]
