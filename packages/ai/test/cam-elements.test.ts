import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { cam, historyVolume, rebuild, type History } from "@cadcamfun/core"
import { ELEMENT_SPECS, ELEMENT_TYPES, normalizeElement } from "../src/element-catalog.ts"

setDefaultTimeout(60_000)

/** The shapes that are machined by following their outline (a contour, a pocket, an engraving), not by cutting a solid. */
const CONTOURS = new Set(["circle", "rectangle", "triangle", "polygon", "ellipse", "arc", "line", "spline", "bezier", "nurbs"])
/** No solid to cut: the part model reports it, and the toolpath engraves it along the strokes of the engraving font. */
const REPORTED = new Set(["text3d"])

const build = (type: string): Record<string, unknown> => {
  const spec = ELEMENT_SPECS[type as keyof typeof ELEMENT_SPECS] as { defaults: Record<string, unknown>; required?: ReadonlyArray<string> }
  const input: Record<string, unknown> = { type }
  for (const key of spec.required ?? []) input[key] = spec.defaults[key]
  if (type === "mesh") { input["vertices"] = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 10 }]; input["faces"] = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]] }
  if (type === "parametric") input["history"] = { parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 10, height: 10 }] } }, { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" }] }
  if (type === "component" || type === "group") input["elements"] = [{ type: "cube" }, { type: "cylinder", x: 200 }]
  const normalized = normalizeElement(input)
  if (!normalized.ok) throw new Error(`${type}: ${normalized.error}`)
  return normalized.element
}

describe("the CAM can process every element the assistant can create", () => {
  const types = ELEMENT_TYPES.filter((t) => !t.startsWith("boolean-"))

  for (const type of types) {
    test(`${type}: a solid to cut, a contour to follow, or a stated reason`, () => {
      const element = build(type)
      const mesh = cam.model.elementMesh(element, 0.05)
      if (CONTOURS.has(type)) {
        const outline = cam.generator.elementOutline(element as never)
        expect(outline.length, `${type} outline`).toBeGreaterThanOrEqual(2)
        expect(outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true)
        return
      }
      if (REPORTED.has(type)) {
        expect(mesh).toBeUndefined()
        const model = cam.model.buildPartModel([{ type: "cube" }, element], { cell: 1 })
        expect(model!.skipped.some((s) => s.startsWith(type))).toBe(true)
        const gcode = cam.generator.elementToolpath(element as never, { depth: 1, stepdown: 1, feedrate: 500, plungerate: 200, offset: "center" } as never, {} as never)
        expect(gcode, `${type} is engraved`).toContain("Stroke point")
        return
      }
      if (type === "component" || type === "group") {
        const model = cam.model.buildPartModel([element], { cell: 1 })
        expect(model, `${type} part model`).toBeDefined()
        expect(model!.skipped).toEqual([])
        expect(model!.bounds.max[0]).toBeGreaterThan(200)
        return
      }
      expect(mesh, `${type} must be a solid the CAM can cut`).toBeDefined()
      expect(cam.model.volumeOf(mesh!), `${type} volume`).toBeGreaterThan(0)
      const model = cam.model.buildPartModel([element], { cell: 1 })
      expect(model, `${type} part model`).toBeDefined()
      expect(model!.skipped).toEqual([])
    })
  }

  test("booleans of any of them resolve too: a plate with a swept channel cut out of it", () => {
    const model = cam.model.buildPartModel([
      { id: "plate", type: "cube", width: 100, height: 60, depth: 20 },
      { id: "channel", type: "sweep", profile: [], radius: 6, path: [{ x: -60, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }] },
      { id: "cut", type: "boolean-subtract", operands: ["plate", "channel"] }
    ], { cell: 1 })
    expect(model!.skipped).toEqual([])
    expect(model!.warnings.filter((w) => w.includes("operand"))).toEqual([])
  })

  test("a parametric part reaches the CAM as its bodies: every new history feature gives a machinable solid", () => {
    const history: History = {
      parameters: { w: 40 },
      features: [
        { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "slot", kind: "slot", at: [0, 0], length: "w", width: 10 }] } },
        { id: "body", type: "extrude", sketch: "s", depth: 8, operation: "new" },
        { id: "spring", type: "coil", radius: 12, pitch: 5, turns: 3, wireDiameter: 2, offset: 10, operation: "new" },
        { id: "ball", type: "primitive", element: "sphere", params: { radius: 5 }, at: [40, 0, 5], operation: "new" },
        { id: "copy", type: "move", targets: ["ball"], translate: [20, 0, 0], copy: true }
      ]
    }
    const rebuilt = rebuild(history)
    expect(rebuilt.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(rebuilt.bodies.length).toBe(4)
    const model = cam.model.buildPartModelFromMeshes(rebuilt.bodies.map((b) => b.mesh), { cell: 0.5 })
    expect(model).toBeDefined()
    expect(historyVolume(rebuilt)).toBeGreaterThan(0)
  })
})
