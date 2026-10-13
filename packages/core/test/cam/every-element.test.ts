import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath } from "../../src/cam/generator/index.ts"

setDefaultTimeout(120_000)

/** The generator end to end, on the elements the CAM could not machine before: it must give a program that cuts the shape, not a note. */
const settings = { ...DEFAULT_SETTINGS, operationType: "3d_surface" as const, toolType: "ballnose" as const, toolDiameter: 3, depth: 12, stepdown: 4, stepover: 60, surfaceStrategy: "roughing" as const, finishingPass: false }
const run = (elements: ReadonlyArray<Record<string, unknown>>, over: Record<string, unknown> = {}) =>
  generateToolpath({ settings: { ...settings, ...over } as never, geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: elements as never, stock: { width: 160, height: 120, depth: 40, radius: 0, x: 0, y: 0, topZ: 20, allowance: 1 } }, printer: DEFAULT_PRINTER_EXTRAS })
const moves = (gcode: string): number => (gcode.match(/^G[0123] /gm) ?? []).length

describe("solids that had no mesh are cut as surfaces", () => {
  const solids: ReadonlyArray<[string, Record<string, unknown>]> = [
    ["spring", { type: "spring", radius: 12, wireRadius: 2, turns: 4, height: 30 }],
    ["bolt", { type: "bolt", size: "M10", length: 40 }],
    ["nut", { type: "nut", size: "M10" }],
    ["washer", { type: "washer", size: "M8", outerDiameter: 20, thickness: 4 }],
    ["wall", { type: "wall", length: 60, thickness: 10, height: 20 }],
    ["column", { type: "column", radius: 10, height: 30, style: "doric" }],
    ["stair", { type: "stair", width: 40, height: 20, depth: 40, steps: 5 }],
    ["roof", { type: "roof", width: 60, depth: 40, height: 20 }],
    ["sweep", { type: "sweep", radius: 4, path: [{ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] }],
    ["loft", { type: "loft", profiles: [{ radius: 15 }, { radius: 8 }], positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 25 }] }]
  ]
  for (const [name, element] of solids) {
    test(`${name}: a program with real cutting moves and no skipped-element warning`, () => {
      const out = run([{ id: name, ...element, x: 0, y: 0, z: 0 }])
      expect(out.error, name).toBeUndefined()
      expect(moves(out.response.gcode), name).toBeGreaterThan(40)
      expect(out.response.gcode).not.toMatch(/not a solid|skipped/i)
    })
  }

  test("a component of them is machined through its parts", () => {
    const out = run([{ id: "fixture", type: "component", x: 0, y: 0, z: 0, elements: [{ type: "washer", size: "M8", outerDiameter: 20, thickness: 4 }, { type: "nut", size: "M10", x: 40 }] }])
    expect(out.error).toBeUndefined()
    expect(out.response.gcode).toContain("Toolpath from 1 selected element(s), 2 solid(s) as a 3D surface")
  })
})

describe("curves and profiles are followed, not boxed", () => {
  const contour = { toolDiameter: 3, depth: 2, stepdown: 1, offset: "center" as const, operationType: "contour" as const }
  test("a spline is cut along its own curve: the program visits points off the bounding box diagonal and through the control points", () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 40, z: 0 }, { x: 60, y: -30, z: 0 }, { x: 90, y: 0, z: 0 }]
    const out = run([{ id: "curve", type: "spline", points, x: -45, y: 0, z: 0 }], contour)
    expect(out.error).toBeUndefined()
    const xy = [...out.response.gcode.matchAll(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/gm)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    expect(xy.length).toBeGreaterThan(40)
    expect(Math.max(...xy.map((p) => p.y))).toBeGreaterThan(15)
    expect(Math.min(...xy.map((p) => p.y))).toBeLessThan(-10)
    expect(out.response.gcode).not.toContain("Generic rectangular contour")
  })

  test("a NURBS and a profile extrusion likewise", () => {
    const nurbs = run([{ id: "n", type: "nurbs", degree: 3, points: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 40, z: 0 }, { x: 60, y: 40, z: 0 }, { x: 80, y: 0, z: 0 }], x: -40, y: 0, z: 0 }], contour)
    expect(nurbs.error).toBeUndefined()
    expect(nurbs.response.gcode).not.toContain("Generic rectangular contour")
    const triangle = run([{ id: "t", type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 30 }], depth: 5, x: 0, y: 0, z: 0 }], { ...contour, offset: "center" })
    expect(triangle.error).toBeUndefined()
    // The far corner of the bounding rectangle is never visited by a path that follows the triangle.
    expect(triangle.response.gcode).not.toMatch(/X40\.000 Y30\.000/)
  })
})
