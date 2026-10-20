import { describe, expect, test } from "bun:test"
import { rebuild, type History, type SketchFeature } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"
import { polygonArea, sketchProfiles, solveSketch, type Sketch } from "./sketch.ts"

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("ellipses and splines in the sketcher (C13)", () => {
  const ellipseSketch: Sketch = {
    entities: [
      { id: "c", kind: "point", x: 0, y: 0 },
      { id: "e", kind: "ellipse", center: "c", radiusX: 10, radiusY: 5 }
    ],
    constraints: [
      { type: "fixed", point: "c", x: 0, y: 0 },
      { type: "ellipseSize", ellipse: "e", radiusX: 12, radiusY: 6 }
    ]
  }

  test("an ellipse solves to its constrained axes", () => {
    const solved = solveSketch(ellipseSketch)
    expect(solved.status).toBe("fully-constrained")
    const e = solved.sketch.entities.find((x) => x.id === "e")!
    expect(e.kind).toBe("ellipse")
    if (e.kind === "ellipse") { expect(e.radiusX).toBeCloseTo(12, 6); expect(e.radiusY).toBeCloseTo(6, 6) }
    const { loops } = sketchProfiles(solved.sketch)
    expect(loops.length).toBe(1)
    expect(rel(Math.abs(polygonArea(loops[0]!)), Math.PI * 12 * 6)).toBeLessThan(0.01)
  })

  test("an unconstrained ellipse reports its axes as free", () => {
    const solved = solveSketch({ entities: ellipseSketch.entities, constraints: [{ type: "fixed", point: "c", x: 0, y: 0 }] })
    expect(solved.free).toContain("e")
  })

  test("an ellipse profile extrudes in mesh and exact, with the ellipse's volume", () => {
    const feature: SketchFeature = { id: "s", type: "sketch", plane: "XY", sketch: ellipseSketch }
    const h: History = { parameters: {}, features: [feature, { id: "plate", type: "extrude", sketch: "s", depth: 4, operation: "new" }] }
    const mesh = rebuild(h)
    expect(mesh.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(rel(meshVolume(mesh.bodies[0]!.mesh), Math.PI * 12 * 6 * 4)).toBeLessThan(0.01)
    const exact = rebuildExact(h)
    expect(exact.bodies[0]!.reason).toBeUndefined()
    expect(validateBrep(exact.bodies[0]!.brep!).issues).toEqual([])
    expect(rel(massProperties(exact.bodies[0]!.brep!).volume, Math.PI * 12 * 6 * 4)).toBeLessThan(0.01)
  })

  const splineSketch: Sketch = {
    entities: [
      { id: "p1", kind: "point", x: 0, y: 0 }, { id: "p2", kind: "point", x: 20, y: 0 },
      { id: "p3", kind: "point", x: 20, y: 20 }, { id: "p4", kind: "point", x: 0, y: 20 },
      { id: "sp", kind: "spline", points: ["p1", "p2", "p3", "p4"], closed: true }
    ],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "fixed", point: "p2", x: 20, y: 0 },
      { type: "fixed", point: "p3", x: 20, y: 20 }, { type: "fixed", point: "p4", x: 0, y: 20 }
    ]
  }

  test("a closed spline is a profile loop through its points", () => {
    const solved = solveSketch(splineSketch)
    expect(solved.status).toBe("fully-constrained")
    const { loops, open } = sketchProfiles(solved.sketch)
    expect(loops.length).toBe(1)
    expect(open.length).toBe(0)
    // A Catmull-Rom loop through the corners of a 20 x 20 box bulges past the corners: fuller than the box itself.
    const area = Math.abs(polygonArea(loops[0]!))
    expect(area).toBeGreaterThan(400)
    expect(area).toBeLessThan(625)
  })

  test("a closed spline profile extrudes in mesh and exact", () => {
    const feature: SketchFeature = { id: "s", type: "sketch", plane: "XY", sketch: splineSketch }
    const h: History = { parameters: {}, features: [feature, { id: "plate", type: "extrude", sketch: "s", depth: 4, operation: "new" }] }
    const mesh = rebuild(h)
    expect(mesh.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(meshVolume(mesh.bodies[0]!.mesh)).toBeGreaterThan(0)
    const exact = rebuildExact(h)
    expect(exact.bodies[0]!.reason).toBeUndefined()
    expect(rel(massProperties(exact.bodies[0]!.brep!).volume, meshVolume(mesh.bodies[0]!.mesh))).toBeLessThan(0.01)
  })
})
