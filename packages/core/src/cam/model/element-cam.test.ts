import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { elementBounds, elementOutline, flattenElements } from "../generator/elements.ts"
import { elementToolpath } from "../generator/element-paths.ts"
import { DEFAULT_SETTINGS } from "../generator/schema.ts"
import { isSolidElement } from "../generator/surface.ts"
import { elementMesh, meshBounds, volumeOf, type Element, type Mesh64 } from "./element-mesh.ts"
import { Dexels, gridFor } from "./dexel.ts"
import { buildPartModel, partMeshes } from "./model.ts"

setDefaultTimeout(60_000)

const key = (m: Mesh64, i: number): string => `${m.positions[i * 3]!.toFixed(5)},${m.positions[i * 3 + 1]!.toFixed(5)},${m.positions[i * 3 + 2]!.toFixed(5)}`
/** Every edge is used once in each direction: the surface is closed and consistently wound, which is what a ray test needs. */
const isClosed = (m: Mesh64): boolean => {
  const directed = new Map<string, number>()
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = key(m, m.indices[t + k]!), b = key(m, m.indices[t + ((k + 1) % 3)]!)
      if (a === b) continue
      directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1)
    }
  }
  for (const [edge, count] of directed) {
    const [a, b] = edge.split(">")
    if (directed.get(`${b}>${a}`) !== count) return false
  }
  return true
}
/** What the part model needs: a ray through the solid enters and leaves in pairs in every column. */
const pairsUp = (m: Mesh64): boolean => {
  const b = meshBounds(m)
  const grid = gridFor(b.min[0] - 1, b.min[1] - 1, b.max[0] + 1, b.max[1] + 1, 0.5)
  return Dexels.fromMesh(m, grid).unpaired === 0
}
const near = (got: number, want: number, relative: number): void => { expect(Math.abs(got - want) / Math.abs(want), `${got} vs ${want}`).toBeLessThan(relative) }

const mesh = (e: Element): Mesh64 => {
  const m = elementMesh(e, 0.01)
  expect(m, `${String(e["type"])} must have a mesh`).toBeDefined()
  return m!
}

describe("standard parts are solids the machine can cut", () => {
  test("a bolt is a head on a shank, centred on its length", () => {
    const m = mesh({ type: "bolt", size: "M10", length: 50 })
    expect(isClosed(m)).toBe(true)
    // Shank 10 mm across for 50 - 8 mm, head 18 mm across for 8 mm.
    near(volumeOf(m), Math.PI * 25 * 42 + Math.PI * 81 * 8, 0.01)
    const b = meshBounds(m)
    expect([b.min[2], b.max[2]]).toEqual([-25, 25])
    near(b.max[0], 9, 0.01)
    expect(mesh({ type: "screw", size: "M4", length: 12 }).positions.length).toBeGreaterThan(0)
  })

  test("a nut is a hexagon with its bore; a washer is a ring", () => {
    const nut = mesh({ type: "nut", size: "M8" })
    expect(pairsUp(nut)).toBe(true)
    const R = 0.9 * 8, thick = 0.8 * 8
    near(volumeOf(nut), ((3 * Math.sqrt(3)) / 2 * R * R - Math.PI * 16) * thick, 0.01)
    const washer = mesh({ type: "washer", size: "M8", outerDiameter: 16, thickness: 1.5 })
    expect(pairsUp(washer)).toBe(true)
    near(volumeOf(washer), Math.PI * (64 - 16) * 1.5, 0.01)
  })

  test("a spring is a helix of wire: the volume of its length times the section, and a tight one is refused", () => {
    const m = mesh({ type: "spring", radius: 20, wireRadius: 2, turns: 5, height: 60 })
    expect(isClosed(m)).toBe(true)
    const wire = 5 * Math.hypot(2 * Math.PI * 20, 12)
    near(volumeOf(m), Math.PI * 4 * wire, 0.06)
    const b = meshBounds(m)
    near(b.max[2] - b.min[2], 60 + 4, 0.05)
    expect(elementMesh({ type: "spring", radius: 20, wireRadius: 5, turns: 10, height: 50 }, 0.01)).toBeUndefined()
  })
})

describe("architecture is solid too", () => {
  test("wall, floor, window and door", () => {
    const wall = mesh({ type: "wall", length: 300, thickness: 20, height: 100, z: 0 })
    near(volumeOf(wall), 300 * 20 * 100, 1e-6)
    expect(meshBounds(wall).min[2]).toBeCloseTo(0, 6)
    near(volumeOf(mesh({ type: "floor", width: 300, depth: 200, thickness: 10 })), 300 * 200 * 10, 1e-6)
    near(volumeOf(mesh({ type: "window", width: 50, height: 80, thickness: 5 })), 50 * 80 * 5, 1e-6)
    const door = mesh({ type: "door", width: 36, height: 80, thickness: 2 })
    expect(pairsUp(door)).toBe(true)
    near(volumeOf(door), 36 * 80 * 2, 0.02)
  })

  test("roof (gable and flat), column (plain and styled) and a stair", () => {
    const roof = mesh({ type: "roof", width: 300, depth: 200, height: 80 })
    expect(isClosed(roof)).toBe(true)
    near(volumeOf(roof), 0.5 * 300 * 80 * 200, 1e-6)
    near(volumeOf(mesh({ type: "roof", style: "flat", width: 300, depth: 200, height: 80 })), 300 * 200 * 20, 1e-6)
    const plain = mesh({ type: "column", radius: 20, height: 200 })
    near(volumeOf(plain), Math.PI * 400 * 200, 0.01)
    const doric = mesh({ type: "column", radius: 20, height: 200, style: "doric" })
    expect(isClosed(doric)).toBe(true)
    expect(volumeOf(doric)).toBeGreaterThan(volumeOf(plain))
    expect(meshBounds(mesh({ type: "column", radius: 20, height: 200, style: "ionic" })).max[2]).toBeGreaterThan(100)
    const stair = mesh({ type: "stair", width: 100, height: 150, depth: 200, steps: 10 })
    expect(isClosed(stair)).toBe(true)
    // A solid flight: step i is (i + 1) risers high and one tread deep.
    near(volumeOf(stair), 100 * 15 * 20 * (10 * 11) / 2, 1e-6)
    const b = meshBounds(stair)
    expect([b.min[1], b.max[1], b.min[2], b.max[2]]).toEqual([-200, 0, 0, 150])
  })
})

describe("sweeps and lofts given by points", () => {
  test("a round tube along a path: the section times the length", () => {
    const m = mesh({ type: "sweep", profile: [], radius: 5, path: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }] })
    expect(isClosed(m)).toBe(true)
    // A mitred corner keeps the wall; the tube is 200 mm of path.
    near(volumeOf(m), Math.PI * 25 * 200, 0.05)
  })

  test("a polygon profile along a straight path is a prism", () => {
    const m = mesh({ type: "sweep", profile: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }], path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 80 }] })
    near(volumeOf(m), 10 * 10 * 80, 1e-3)
  })

  test("a loft through circles is a frustum", () => {
    const m = mesh({ type: "loft", profiles: [{ radius: 20 }, { radius: 10 }], positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 60 }] })
    expect(isClosed(m)).toBe(true)
    near(volumeOf(m), (Math.PI * 60 / 3) * (400 + 200 + 100), 0.03)
  })
})

describe("the part model agrees with the bounds the generator places by", () => {
  const catalogue: ReadonlyArray<Element> = [
    { type: "bolt", size: "M10", length: 50, x: 10, y: 20, z: 5 }, { type: "nut", size: "M8", x: -5, y: 3, z: 1 },
    { type: "washer", size: "M8", outerDiameter: 16, thickness: 1.5, x: 4, y: 4, z: 4 },
    { type: "wall", length: 300, thickness: 20, height: 100, x: 40, y: 10, z: 2 }, { type: "floor", width: 300, depth: 200, thickness: 10 },
    { type: "window", width: 50, height: 80, thickness: 5 }, { type: "column", radius: 20, height: 200, style: "corinthian", x: 7 },
    { type: "stair", width: 100, height: 150, depth: 200, steps: 10, x: 3, y: 9, z: 1 }, { type: "roof", width: 300, depth: 200, height: 80, z: 4 },
    { type: "roof", style: "flat", width: 300, depth: 200, height: 80 }, { type: "door", width: 36, height: 80, thickness: 2 }
  ]
  for (const element of catalogue) {
    test(`${String(element["type"])}${element["style"] === undefined ? "" : ` (${String(element["style"])})`}: the mesh fills the bounds the generator computes`, () => {
      const b = meshBounds(mesh(element))
      const g = elementBounds(element as never)
      for (const [axis, lo, hi] of [[0, g.min.x, g.max.x], [1, g.min.y, g.max.y], [2, g.min.z, g.max.z]] as const) {
        const tolerance = 0.06 * Math.max(1, hi - lo)
        expect(Math.abs(b.min[axis]! - lo), `min ${"xyz"[axis]}`).toBeLessThan(tolerance)
        expect(Math.abs(b.max[axis]! - hi), `max ${"xyz"[axis]}`).toBeLessThan(tolerance)
      }
    })
  }
})

describe("what is selected is what is machined", () => {
  test("a component is its parts: placed relative to it, in the part model, none of it skipped", () => {
    const component: Element = {
      type: "component", name: "Fixture", x: 100, y: 0, z: 0,
      elements: [{ type: "cube", width: 20, height: 20, depth: 20, x: 0, y: 0, z: 0 }, { type: "washer", size: "M8", outerDiameter: 16, thickness: 2, x: 30, y: 0, z: 0 }]
    }
    expect(isSolidElement(component as never)).toBe(true)
    const model = buildPartModel([component], { cell: 0.5 })
    expect(model).toBeDefined()
    expect(model!.skipped).toEqual([])
    near(model!.bounds.max[0], 100 + 30 + 8 * 1.1, 0.02)
    expect(model!.bounds.min[0]).toBeCloseTo(90, 3)
    expect(partMeshes([component])!.meshes).toHaveLength(2)
    expect(flattenElements([component as never])).toHaveLength(2)
  })

  test("a bolt, a spring, a wall and a swept tube are machined together", () => {
    const model = buildPartModel([
      { type: "bolt", size: "M6", length: 30 }, { type: "spring", radius: 10, wireRadius: 1, turns: 4, height: 30, x: 40 },
      { type: "wall", length: 40, thickness: 6, height: 20, x: 90 }, { type: "sweep", profile: [], radius: 3, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 40, z: 0 }], x: 140 }
    ], { cell: 0.5 })
    expect(model!.skipped).toEqual([])
    expect(model!.dexels).toBeDefined()
  })

  test("text and flat shapes are reported rather than faked as blocks", () => {
    const model = buildPartModel([{ type: "cube", width: 10, height: 10, depth: 10 }, { type: "text3d", text: "CAD", height: 8 }, { type: "circle", radius: 5 }], { cell: 0.5 })
    expect([...model!.skipped].sort()).toEqual(["circle", "text3d"])
  })
})

describe("contours: every flat shape and curve gives the machine a path to follow", () => {
  test("a spline passes through its points, a Bezier starts and ends on its end points, a NURBS follows its control polygon", () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 70, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }]
    const spline = elementOutline({ type: "spline", points, x: 5, y: 7 } as never)
    for (const p of points) expect(spline.some((q) => Math.hypot(q.x - (p.x + 5), q.y - (p.y + 7)) < 1e-6)).toBe(true)
    const bezier = elementOutline({ type: "bezier", points } as never)
    expect(bezier[0]).toMatchObject({ x: 0, y: 0 })
    expect(bezier[bezier.length - 1]).toMatchObject({ x: 100, y: 0 })
    // The mid point of a cubic Bezier: (P0 + 3 P1 + 3 P2 + P3) / 8.
    const mid = bezier[Math.floor(bezier.length / 2)]!
    near(mid.x, (0 + 90 + 210 + 100) / 8, 0.02)
    const nurbs = elementOutline({ type: "nurbs", points, degree: 3 } as never)
    expect(nurbs.length).toBeGreaterThan(20)
    expect(nurbs[0]).toMatchObject({ x: 0, y: 0 })
    expect(nurbs[nurbs.length - 1]).toMatchObject({ x: 100, y: 0 })
  })

  test("a round extrusion, a profile extrusion, a bolt, a washer, a nut and a column follow their real outline", () => {
    const circle = elementOutline({ type: "extrusion", shape: "circle", radius: 12, depth: 5 } as never)
    expect(Math.max(...circle.map((p) => p.x))).toBeCloseTo(12, 6)
    const profile = elementOutline({ type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }], depth: 5 } as never)
    expect(profile).toHaveLength(4)
    expect(Math.max(...elementOutline({ type: "washer", size: "M8", outerDiameter: 16 } as never).map((p) => p.x))).toBeCloseTo(8, 6)
    expect(elementOutline({ type: "nut", size: "M8" } as never)).toHaveLength(7)
    expect(Math.max(...elementOutline({ type: "bolt", size: "M10", length: 40 } as never).map((p) => p.x))).toBeCloseTo(9, 6)
    expect(Math.max(...elementOutline({ type: "column", radius: 20, height: 100, style: "doric" } as never).map((p) => p.x))).toBeCloseTo(24, 6)
  })
})

describe("the toolpath follows the shape, not its bounding rectangle", () => {
  const settings = { ...DEFAULT_SETTINGS, offset: "center", depth: 4, stepdown: 2 } as never
  const coordinates = (gcode: string): Array<{ x: number; y: number }> =>
    [...gcode.matchAll(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/gm)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))

  test("a spline is cut along the curve, through its points, at every depth", () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 70, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }]
    const gcode = elementToolpath({ type: "spline", points } as never, settings, {} as never)
    expect(gcode).toContain("followed along the curve")
    const path = coordinates(gcode)
    expect(path.length).toBeGreaterThan(40)
    // Through the middle of the bounding rectangle there is no cut: the path leaves y = 0 for both humps.
    expect(Math.max(...path.map((p) => p.y))).toBeGreaterThan(20)
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(-5)
    for (const p of points) expect(path.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.5)).toBe(true)
    expect((gcode.match(/Z Level/g) ?? []).length).toBe(2)
  })

  test("a round extrusion is a circle of its radius and a profile extrusion follows its profile; a NURBS and a Bezier are cut too", () => {
    const circle = coordinates(elementToolpath({ type: "extrusion", shape: "circle", radius: 12, depth: 5 } as never, settings, {} as never))
    expect(Math.max(...circle.map((p) => Math.hypot(p.x, p.y)))).toBeCloseTo(12, 3)
    const triangle = coordinates(elementToolpath({ type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }], depth: 5 } as never, settings, {} as never))
    expect(triangle.some((p) => p.x === 20 && p.y === 0)).toBe(true)
    // The corner of the bounding rectangle (20, 10) is not on the profile, so it is never visited.
    expect(triangle.some((p) => p.x === 20 && p.y === 10)).toBe(false)
    for (const type of ["nurbs", "bezier"]) {
      expect(coordinates(elementToolpath({ type, points: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 40, z: 0 }, { x: 60, y: 40, z: 0 }, { x: 80, y: 0, z: 0 }] } as never, settings, {} as never)).length).toBeGreaterThan(20)
    }
  })
})
