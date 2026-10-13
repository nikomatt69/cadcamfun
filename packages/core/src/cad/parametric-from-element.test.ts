import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { elementMesh, volumeOf } from "../cam/model/element-mesh.ts"
import { historyVolume, rebuild, withParameter, PRIMITIVE_ELEMENTS } from "./history.ts"
import { CONVERTIBLE_TYPES, parametricFromElement } from "./parametric-from-element.ts"
import { setDimension } from "./history-edit.ts"

setDefaultTimeout(60_000)

const ok = (element: Record<string, unknown>, options?: { depth?: number }) => {
  const result = parametricFromElement(element, options)
  if ("error" in result) throw new Error(result.error)
  return result
}
const close = (got: number, want: number, relative: number): void => { expect(Math.abs(got - want) / Math.abs(want), `${got} vs ${want}`).toBeLessThan(relative) }

/** One element of every catalogue solid, with measures of its own. */
const SOLIDS: ReadonlyArray<Record<string, unknown>> = [
  { type: "cube", width: 30, height: 20, depth: 10 }, { type: "sphere", radius: 12, segments: 48 }, { type: "ellipsoid", radiusX: 20, radiusY: 12, radiusZ: 8, segments: 48 },
  { type: "cylinder", radius: 9, height: 40 }, { type: "cone", radius: 9, height: 40 }, { type: "prism", radius: 15, height: 20, sides: 6 },
  { type: "pyramid", baseWidth: 20, baseDepth: 30, height: 25 }, { type: "hemisphere", radius: 14, direction: "down" }, { type: "capsule", radius: 6, height: 30, direction: "z" },
  { type: "torus", radius: 25, tubeRadius: 5 }, { type: "gear", moduleValue: 2, teeth: 20, thickness: 8, pressureAngle: 20, holeDiameter: 10 },
  { type: "extrusion", shape: "rect", width: 40, height: 25, depth: 6 }, { type: "extrusion", shape: "circle", radius: 12, depth: 6 },
  { type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 20 }], depth: 5 },
  { type: "revolution", axis: "y", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }, { x: 0, y: 30 }] },
  { type: "sweep", radius: 4, path: [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, { x: 60, y: 60, z: 0 }] },
  { type: "loft", profiles: [{ radius: 20 }, { radius: 10 }], positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }] },
  { type: "spring", radius: 20, wireRadius: 2, turns: 5, height: 60 }, { type: "bolt", size: "M10", length: 50 }, { type: "screw", size: "M4", length: 12 },
  { type: "nut", size: "M8" }, { type: "washer", size: "M8", outerDiameter: 16, thickness: 1.5 },
  { type: "wall", length: 300, thickness: 20, height: 100 }, { type: "floor", width: 300, depth: 200, thickness: 10 }, { type: "window", width: 50, height: 80, thickness: 5 },
  { type: "door", width: 36, height: 80, thickness: 2 }, { type: "column", radius: 20, height: 200, style: "doric" },
  { type: "roof", width: 300, depth: 200, height: 80 }, { type: "roof", style: "flat", width: 300, depth: 200, height: 80 }, { type: "stair", width: 100, height: 150, depth: 200, steps: 10 }
]

describe("the history of an element builds the very same solid", () => {
  test("every solid the history can place is convertible", () => {
    for (const type of PRIMITIVE_ELEMENTS) expect(CONVERTIBLE_TYPES, type).toContain(type)
    for (const type of PRIMITIVE_ELEMENTS) expect(SOLIDS.some((e) => e["type"] === type), `${type} has a case here`).toBe(true)
  })

  for (const element of SOLIDS) {
    const label = `${String(element["type"])}${element["style"] === undefined ? "" : ` (${String(element["style"])})`}${element["shape"] === undefined ? "" : ` (${String(element["shape"])})`}`
    test(`${label}: same volume and bounds as the element`, () => {
      const converted = ok(element)
      const rebuilt = rebuild(converted.history)
      expect(rebuilt.issues.filter((i) => i.severity === "error"), label).toEqual([])
      expect(rebuilt.bodies).toHaveLength(1)
      const original = elementMesh(element, 0.01)!
      close(historyVolume(rebuilt), volumeOf(original), 1e-3)
    })
  }
})

describe("the measures are named parameters", () => {
  test("a cube's width, height and depth are parameters, and one edit resizes only that side", () => {
    const { history } = ok({ type: "cube", width: 30, height: 20, depth: 10 })
    expect(history.parameters).toEqual({ width: 30, height: 20, depth: 10 })
    close(historyVolume(rebuild(withParameter(history, "width", 60))), 60 * 20 * 10, 1e-6)
    close(historyVolume(rebuild(withParameter(history, "depth", 5))), 30 * 20 * 5, 1e-6)
  })

  test("a bolt keeps its metric size as a choice and its length as a parameter; a spring turns into more wire with more turns", () => {
    const bolt = ok({ type: "bolt", size: "M10", length: 50 })
    expect(bolt.history.parameters).toEqual({ length: 50 })
    const longer = historyVolume(rebuild(withParameter(bolt.history, "length", 80)))
    expect(longer).toBeGreaterThan(historyVolume(rebuild(bolt.history)))
    const spring = ok({ type: "spring", radius: 20, wireRadius: 2, turns: 5, height: 60 })
    close(historyVolume(rebuild(withParameter(spring.history, "turns", 10))) / historyVolume(rebuild(spring.history)), 2, 0.08)
  })

  test("arrays stay editable one coordinate at a time", () => {
    const { history } = ok({ type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 20 }], depth: 5 })
    const wider = setDimension(history, "extrusion", "profile.1.0", 60)
    close(historyVolume(rebuild(wider)), 0.5 * 60 * 20 * 5, 1e-3)
  })

  test("the placement and the gizmo transform are not in the history; they are carried for the new element", () => {
    const converted = ok({ type: "cube", width: 10, height: 10, depth: 10, x: 5, y: 6, z: 7, name: "Block", color: "#ff0000", layer: "L1", rotation: { x: 0, y: 0, z: 45 }, id: "abc" })
    expect(converted.placement).toEqual({ x: 5, y: 6, z: 7 })
    expect(converted.carry).toEqual({ name: "Block", color: "#ff0000", layer: "L1", rotation: { x: 0, y: 0, z: 45 } })
    expect(JSON.stringify(converted.history)).not.toContain("abc")
  })
})

describe("flat shapes and containers", () => {
  test("a rectangle, a circle, a polygon, an ellipse and a triangle become a sketch shape extruded by a depth parameter", () => {
    close(historyVolume(rebuild(ok({ type: "rectangle", width: 40, height: 20 }, { depth: 5 }).history)), 40 * 20 * 5, 1e-6)
    close(historyVolume(rebuild(ok({ type: "circle", radius: 10 }).history)), Math.PI * 100 * 10, 0.01)
    close(historyVolume(rebuild(ok({ type: "polygon", sides: 6, radius: 10 }).history)), (3 * Math.sqrt(3) / 2) * 100 * 10, 1e-3)
    const ellipse = ok({ type: "ellipse", radiusX: 20, radiusY: 10 }, { depth: 4 })
    close(historyVolume(rebuild(ellipse.history)), Math.PI * 200 * 4, 0.01)
    close(historyVolume(rebuild(ok({ type: "triangle", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }] }, { depth: 2 }).history)), 100 * 2, 1e-3)
    const rect = ok({ type: "rectangle", width: 40, height: 20 }, { depth: 5 })
    expect(Object.keys(rect.history.parameters)).toEqual(expect.arrayContaining(["width", "height", "depth"]))
    close(historyVolume(rebuild(withParameter(rect.history, "depth", 15))), 40 * 20 * 15, 1e-6)
  })

  test("a component becomes one feature per part, with prefixed parameters and the parts' places as parameters", () => {
    const converted = ok({ type: "component", name: "Fixture", elements: [{ type: "cube", width: 20, height: 20, depth: 20 }, { type: "cylinder", radius: 5, height: 30, x: 40, y: 0, z: 0 }] })
    expect(converted.history.features.map((f) => f.id)).toEqual(["c0_cube", "c1_cylinder"])
    expect(converted.history.parameters).toMatchObject({ c0_width: 20, c1_radius: 5, c1_x: 40 })
    const rebuilt = rebuild(converted.history)
    expect(rebuilt.bodies).toHaveLength(2)
    const moved = rebuild(withParameter(converted.history, "c1_x", 100))
    expect(Math.max(...moved.bodies.map((b) => Math.max(...Array.from(b.mesh.positions).filter((_, i) => i % 3 === 0))))).toBeGreaterThan(100)
  })

  test("what has no measures to convert says so", () => {
    expect(parametricFromElement({ type: "mesh", vertices: [], faces: [] })).toMatchObject({ error: expect.stringContaining("no recoverable history") })
    expect(parametricFromElement({ type: "boolean-subtract", operands: ["a", "b"] })).toMatchObject({ error: expect.stringContaining("combine") })
    expect(parametricFromElement({ type: "parametric", history: {} })).toMatchObject({ error: expect.stringContaining("already parametric") })
    expect(parametricFromElement({ type: "text3d", text: "A" })).toMatchObject({ error: expect.stringContaining("no solid to make parametric") })
    expect(parametricFromElement({ type: "rectangle", width: 1, height: 1 }, { depth: 0 })).toMatchObject({ error: expect.stringContaining("depth") })
  })
})
