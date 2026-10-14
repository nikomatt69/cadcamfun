/**
 * AI-11 Step 1: the `cad`, `cad_edit` and parametric inputs are declared once in Effect (`@cadcamfun/api`). For each fixture
 * the derived nikcli schema and the Effect decode agree, a misspelt optional field is refused at both, and the history checks
 * the JSON schema cannot express (feature order, references) are refused at the seam before any handler runs.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { CAD_ACTION_INPUTS, PARAMETRIC_ACTION_INPUTS } from "@cadcamfun/api"
import { actionById, runAction } from "../src/actions/catalogue.ts"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const INPUTS: Record<string, Schema.Codec<unknown, unknown>> = { ...CAD_ACTION_INPUTS, ...PARAMETRIC_ACTION_INPUTS } as never

const history = {
  parameters: { w: 40, d: "w / 2" },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "d" }] } },
    { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" }
  ]
}
/** Valid to the JSON schema, refused by the order check: the extrude names a sketch that does not exist. */
const dangling = { parameters: {}, features: [{ id: "e", type: "extrude", sketch: "nowhere", depth: 5, operation: "new" }] }

const FIXTURES: Record<string, { readonly accept: ReadonlyArray<unknown>; readonly refuse: ReadonlyArray<unknown> }> = {
  "cad.describe": { accept: [{}], refuse: [[]] },
  "cad.check": { accept: [{}], refuse: [null] },
  "cad.relations": { accept: [{ firstId: "a", secondId: "b" }], refuse: [{ firstId: "a" }, { firstId: "", secondId: "b" }] },
  "cad.grep": { accept: [{ query: "bolt" }, { query: "bolt", parametricOnly: true, limit: 50, offset: 3 }], refuse: [{ query: "" }, { query: "b", limit: 51 }, { query: "b", offset: -1 }] },
  "cad.vision": { accept: [{}, { focus: "the pocket" }], refuse: [{ focus: "" }, { focus: "   " }] },
  "cad.exact": { accept: [{}, { ids: ["a"], machining: false }], refuse: [{ ids: [] }, { machining: "no" }] },
  "cad.assembly": { accept: [{}, { washers: false }], refuse: [{ washers: 1 }] },
  "cad_edit.add_entities": {
    accept: [{ entities: [{ type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, { type: "circle", center: { x: 0, y: 0 }, radius: 3, layer: "L1" }] }],
    refuse: [{ entities: [] }, { entities: [{ type: "circle", center: { x: 0, y: 0 }, radius: 0 }] }, { entities: [{ type: "spline", points: [] }] }]
  },
  "cad_edit.modify": { accept: [{ changes: [{ id: "a", changes: { radius: 4 } }] }], refuse: [{ changes: [] }, { changes: [{ id: "", changes: {} }] }] },
  "cad_edit.transform": { accept: [{ ids: ["a"], dx: 5 }, { ids: ["a"], rotateAxis: "z", rotateDegrees: 90, copies: 3 }], refuse: [{ ids: [] }, { ids: ["a"], scale: 0 }, { ids: ["a"], copies: 101 }] },
  "cad_edit.group": { accept: [{ ids: ["a", "b"], name: "G" }], refuse: [{ ids: [] }, { ids: ["a"], name: "" }] },
  "cad_edit.delete": { accept: [{ ids: ["a"], confirm: true }], refuse: [{ ids: ["a"] }, { ids: ["a"], confirm: false }] },
  "cad_edit.editor": { accept: [{ actions: [{ action: "view_fit" }, { action: "section_on", axis: "x", position: 10 }] }], refuse: [{ actions: [] }, { actions: [{ action: "explode" }] }] },
  "cad_edit.import": { accept: [{ attachment: "part.dxf", depth: 5 }, { format: "svg", content: "<svg/>", depth: 2 }], refuse: [{ format: "iges" }, { content: "" }, { depth: 0 }] },
  "cad.drawing": { accept: [{}, { elementId: "a" }, { history }], refuse: [{ elementId: "" }, { history: dangling }] },
  "cad.parametric_validate": { accept: [{ history }], refuse: [{}, { history: JSON.stringify(history) }, { history: dangling }] },
  "cad.parametric_inspect": { accept: [{ elementId: "a" }], refuse: [{}] },
  "cad.parametric_test": { accept: [{ elementId: "a", cases: [{ name: "wider", parameters: { w: 80 } }] }], refuse: [{ elementId: "a", cases: [] }, { elementId: "a", cases: "[]" }] },
  "cad.parametric_dfm": { accept: [{ elementId: "a", process: "mill" }, { history, envelope: { x: 100, y: 100, z: 50 } }], refuse: [{ process: "laser" }, { minWall: 0 }] },
  "cad.parametric_exact": { accept: [{ elementId: "a", includeStep: true }], refuse: [{ includeStep: "yes" }, { name: "" }] },
  "cad.parametric_fastener": { accept: [{}, { size: "M6", fit: "medium" }], refuse: [{ fit: "loose" }, { shaftDiameter: 0 }] },
  "cad.parametric_recipe": { accept: [{ recipe: "flange" }, { recipe: "flange", params: { boltCount: 6 } }], refuse: [{ recipe: "teapot" }, {}] },
  "cad.parametric_from_element": { accept: [{ elementId: "a" }, { elementId: "a", depth: 4 }], refuse: [{ elementId: "a", depth: -1 }] },
  "cad_edit.parametric_create": { accept: [{ history, name: "Plate" }, { history, name: "Plate", x: 5, layer: "L" }], refuse: [{ history }, { history, name: "" }, { history: dangling, name: "P" }] },
  "cad_edit.parametric_update": { accept: [{ elementId: "a", parameters: { w: 60 }, expectedRevision: "r1" }], refuse: [{ elementId: "a", parameters: { "1w": 3 }, expectedRevision: "r1" }, { elementId: "a", parameters: {} }] },
  "cad_edit.parametric_recipe_create": { accept: [{ recipe: "flange" }, { recipe: "flange", name: "F", z: 0 }], refuse: [{ recipe: "flange", name: "" }] },
  "cad_edit.parametric_convert": { accept: [{ elementId: "a" }], refuse: [{ elementId: "" }] }
}

const decodes = (schema: Schema.Codec<unknown, unknown>, input: unknown) =>
  Effect.runPromise(Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(Effect.isSuccess))

describe("Effect-owned CAD and parametric inputs", () => {
  test("every migrated action has fixtures and is in the catalogue", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(INPUTS).sort())
    for (const id of Object.keys(INPUTS)) expect(actionById(id)).toBeDefined()
  })

  for (const [id, { accept, refuse }] of Object.entries(FIXTURES)) {
    test(`${id}: the derived nikcli schema and the Effect decode agree`, async () => {
      const schema = INPUTS[id]!
      const wire = nikcliWireSchema(schema)
      for (const input of accept) {
        expect([id, input, wire.safeParse(input).success]).toEqual([id, input, true])
        expect([id, input, await decodes(schema, input)]).toEqual([id, input, true])
      }
      // The derived schema may let through what only the decode sees (trimming, history order); the decode never does.
      for (const input of refuse) expect([id, input, await decodes(schema, input)]).toEqual([id, input, false])
      // A misspelt optional field is refused at both, not silently dropped. An action without parameters takes any object.
      if (id === "cad.describe" || id === "cad.check") return
      const misspelt = { ...(accept[0] as object), layerr: "L1" }
      expect([id, wire.safeParse(misspelt).success, await decodes(schema, misspelt)]).toEqual([id, false, false])
    })
  }

  test("a history the JSON schema accepts but whose features are out of order never reaches the handler", async () => {
    expect(nikcliWireSchema(INPUTS["cad_edit.parametric_create"]!).safeParse({ history: dangling, name: "P" }).success).toBe(true)
    let entered = 0
    const handlers = { parametric: async () => { entered++; return { ok: true } } } as unknown as ToolHandlersShape
    const result = await runAction("cad_edit.parametric_create", { history: dangling, name: "P" }, { handlers, projectId: "p" }) as { ok: boolean; _tag: string; error: string }
    expect(entered).toBe(0)
    expect(result).toMatchObject({ ok: false, _tag: "ActionInvalidInput" })
    expect(result.error).toContain("history.features.0")
  })

  test("a parameter name the history cannot use is refused, never dropped", async () => {
    const update = INPUTS["cad_edit.parametric_update"]!
    const input = { elementId: "a", parameters: { w: 60, "1w": 3 }, expectedRevision: "r1" }
    expect(nikcliWireSchema(update).safeParse(input).success).toBe(false)
    const exit = Schema.decodeUnknownExit(update)(input)
    expect(String(exit)).toContain('Invalid name "1w"')
  })

  test("the catalogue's own pre-parse names the refused field", async () => {
    const result = await runAction("cad.grep", { query: "b", limit: 99 }, { handlers: {} as ToolHandlersShape, projectId: "p" }) as { error: string }
    expect(result.error).toContain("limit")
  })
})
