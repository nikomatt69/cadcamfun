import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { applyChanges, describeElements, elementsOf, newElements } from "../src/services/ai-elements.ts"

let n = 0
const id = () => `id-${++n}`

describe("assistant element mapping", () => {
  test("a circle at the origin is an editor circle on the default layer", () => {
    const [circle] = newElements([{ type: "circle", center: { x: 0, y: 0 }, radius: 15 }], "L1", id)
    expect(circle).toMatchObject({ type: "circle", x: 0, y: 0, z: 0, radius: 15, layerId: "L1" })
    expect(circle!.id).toMatch(/^id-/)
  })

  test("a rectangle given by its corner is stored by its centre", () => {
    const [rect] = newElements([{ type: "rectangle", origin: { x: 10, y: 20 }, width: 30, height: 40 }], "L1", id)
    expect(rect).toMatchObject({ x: 25, y: 40, width: 30, height: 40 })
  })

  test("3D shapes keep their centre and size", () => {
    const [cube, sphere, cyl, cone, torus] = newElements([
      { type: "cube", center: { x: 1, y: 2, z: 3 }, width: 4, height: 5, depth: 6 },
      { type: "sphere", center: { x: 0, y: 0 }, radius: 7, color: "#ff0000", name: "Ball" },
      { type: "cylinder", center: { x: 0, y: 0, z: 9 }, radius: 2, height: 8 },
      { type: "cone", center: { x: 0, y: 0 }, radius: 2, height: 8 },
      { type: "torus", center: { x: 0, y: 0 }, radius: 10, tube: 2 }
    ], "L1", id)
    expect(cube).toMatchObject({ type: "cube", x: 1, y: 2, z: 3, width: 4, height: 5, depth: 6 })
    expect(sphere).toMatchObject({ radius: 7, color: "#ff0000", name: "Ball" })
    expect(cyl).toMatchObject({ z: 9, height: 8 })
    expect(cone).toMatchObject({ type: "cone" })
    expect(torus).toMatchObject({ radius: 10, tubeRadius: 2 })
  })

  test("a polyline becomes line segments, closed ones include the closing segment", () => {
    const open = newElements([{ type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], "L1", id)
    expect(open.map((e) => e.type)).toEqual(["line", "line"])
    const closed = newElements([{ type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], "L1", id)
    expect(closed).toHaveLength(3)
    expect(closed[2]).toMatchObject({ x1: 10, y1: 10, x2: 0, y2: 0 })
  })

  test("a requested layer wins over the default", () => {
    expect(newElements([{ type: "sphere", center: { x: 0, y: 0 }, radius: 1, layer: "Holes" }], "L1", id)[0]!.layerId).toBe("Holes")
  })

  test("changes translate to the element's own fields", () => {
    const [circle] = newElements([{ type: "circle", center: { x: 0, y: 0 }, radius: 5 }], "L1", id)
    expect(applyChanges(circle!, { center: { x: 3, y: 4 }, radius: 9 })).toMatchObject({ x: 3, y: 4, radius: 9 })
    const [rect] = newElements([{ type: "rectangle", origin: { x: 0, y: 0 }, width: 10, height: 10 }], "L1", id)
    expect(applyChanges(rect!, { origin: { x: 100, y: 100 } })).toMatchObject({ x: 105, y: 105 })
    const [torus] = newElements([{ type: "torus", center: { x: 0, y: 0 }, radius: 10, tube: 2 }], "L1", id)
    expect(applyChanges(torus!, { tube: 3, layer: "L9" })).toMatchObject({ tubeRadius: 3, layerId: "L9" })
  })

  test("a change carries any field of the element, and parameters merge into a parametric history", () => {
    const [cube] = newElements([{ type: "cube", center: { x: 0, y: 0, z: 0 }, width: 10, height: 10, depth: 10 }], "L1", id)
    expect(applyChanges(cube!, { x: 5, rotation: { x: 90, y: 0, z: 0 }, id: "other", type: "sphere" })).toMatchObject({ id: cube!.id, type: "cube", x: 5, rotation: { x: 90, y: 0, z: 0 } })
    const part = { id: "p", type: "parametric", layerId: "L1", history: { parameters: { width: 60, depth: 40 }, features: [{ id: "f" }] } } as never
    const wider = applyChanges(part, { parameters: { width: 80 } }) as unknown as { history: { parameters: Record<string, number>; features: unknown[] }; parameters?: unknown }
    expect(wider.history.parameters).toEqual({ width: 80, depth: 40 })
    expect(wider.history.features).toHaveLength(1)
    expect(wider.parameters).toBeUndefined()
  })

  test("the overview uses real bounds for solids that have no radius: an extrusion, a capsule on its side, a wall", () => {
    const boundsOf = (element: Record<string, unknown>) => cam.generator.elementBounds(element as never)
    const elements = [
      { id: "a", type: "extrusion", layerId: "L", x: 100, y: 0, z: 0, shape: "rect", width: 20, height: 10, depth: 30 },
      { id: "b", type: "capsule", layerId: "L", x: 0, y: 0, z: 0, radius: 5, height: 40, direction: "x" }
    ] as never
    const d = describeElements(elements, 200, boundsOf)
    expect(d.bounds).toEqual({ min: { x: -25, y: -5, z: -5 }, max: { x: 110, y: 5, z: 30 } })
    expect(d.elements.map((e) => e.size)).toEqual([[20, 10, 30], [50, 10, 10]])
    // Without the hook the old reading by type is kept.
    expect(describeElements(elements).bounds).not.toBeNull()
  })

  test("the overview counts, bounds and lists", () => {
    const elements = newElements([
      { type: "cube", center: { x: 0, y: 0, z: 0 }, width: 10, height: 10, depth: 10 },
      { type: "circle", center: { x: 20, y: 0 }, radius: 5 }
    ], "L1", id)
    const d = describeElements(elements)
    expect(d.counts).toEqual({ cube: 1, circle: 1 })
    expect(d.bounds).toEqual({ min: { x: -5, y: -5, z: -5 }, max: { x: 25, y: 5, z: 5 } })
    expect(describeElements([]).bounds).toBeNull()
  })

  test("elementsOf ignores other data and malformed items", () => {
    expect(elementsOf(undefined)).toEqual([])
    expect(elementsOf({ entities: [{ id: "x" }] })).toEqual([])
    expect(elementsOf({ elements: [{ id: "a", type: "circle", layerId: "l" }, null, { type: "no-id" }] })).toHaveLength(1)
  })
})
