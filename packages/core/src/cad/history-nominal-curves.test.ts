import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { curvePoint, massProperties, readStepBreps, validateBrep, writeStepBreps } from "./brep/index.ts"
import { exactSketchPath, rebuildExact } from "./history-brep.ts"
import { model } from "./script.ts"
import { sketchProfiles } from "./sketch.ts"
import { meshVolume } from "./solid.ts"
import type { History } from "./history.ts"
import type { Vec2 } from "./vec.ts"

setDefaultTimeout(60_000)

const checked = (history: History) => {
  const result = rebuildExact(history)
  expect(result.result.issues.filter((issue) => issue.severity === "error")).toEqual([])
  const body = result.bodies[0]!
  expect(body.reason).toBeUndefined()
  expect(validateBrep(body.brep!).issues).toEqual([])
  return { result, brep: body.brep!, volume: massProperties(body.brep!).volume }
}

const distanceToRing = (point: Vec2, ring: ReadonlyArray<Vec2>): number => Math.min(...ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length]!, dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
}))

describe("nominal curves survive parametric modeling", () => {
  test("a builder ellipse is a curved exact solid, with analytic volume and a bounded display outline", () => {
    const m = model()
    m.extrude(m.sketch("XY", 0, { id: "s" }).ellipse([0, 0], 12, 6, { segments: 8, id: "e" }), { depth: 4 })
    const { result, brep, volume } = checked(m.build())
    expect(volume).toBeCloseTo(Math.PI * 12 * 6 * 4, 7)
    expect(brep.faces).toHaveLength(6)
    const curves = brep.edges.filter((edge) => edge.curve.kind === "nurbs")
    expect(curves).toHaveLength(8)
    for (const edge of curves) for (let i = 0; i <= 20; i++) {
      const p = curvePoint(edge.curve, edge.t0 + (edge.t1 - edge.t0) * i / 20)
      expect((p.x / 12) ** 2 + (p.y / 6) ** 2).toBeCloseTo(1, 12)
    }
    const sketch = result.result.sketches["s"]!.solve.sketch
    // Existing constraint references still name the old construction edges/vertices.
    expect(sketch.entities.some((entity) => entity.id === "e.l7")).toBe(true)
    const ring = sketchProfiles(sketch, 0.01).loops[0]!
    for (let k = 0; k < 1000; k++) {
      const t = 2 * Math.PI * k / 1000
      expect(distanceToRing({ x: 12 * Math.cos(t), y: 6 * Math.sin(t) }, ring)).toBeLessThanOrEqual(0.01 + 1e-10)
    }
    expect(Math.abs(meshVolume(result.result.bodies[0]!.mesh) - volume) / volume).toBeLessThan(0.002)
    const imported = readStepBreps(writeStepBreps([{ name: "ellipse", brep }])).parts[0]!.brep
    expect(validateBrep(imported).issues).toEqual([])
    expect(massProperties(imported).volume).toBeCloseTo(volume, 7)
  })

  test("parameter edits preserve the nominal ellipse rather than a fixed display polygon", () => {
    for (const rx of [0.25, 12, 80]) {
      const m = model().param("rx", rx)
      m.extrude(m.sketch("XY").ellipse([3, -2], "rx", 2), { depth: 3 })
      expect(checked(m.build()).volume).toBeCloseTo(Math.PI * rx * 2 * 3, 6)
    }
  })

  test("a cubic Bezier and its closing line have the analytic area, independently of construction divisions", () => {
    for (const divisions of [4, 48]) {
      const m = model()
      m.extrude(m.sketch("XY").curve("bezier", [[0, 0], [4, 8], [8, 8], [12, 0]], { chord: true, divisions }), { depth: 2 })
      const { brep, volume } = checked(m.build())
      // x=12t, y=24t(1-t): area is integral(y dx)=48 mm².
      expect(volume).toBeCloseTo(96, 7)
      expect(brep.edges.some((edge) => edge.curve.kind === "nurbs")).toBe(true)
    }
  })

  test("a solver ellipse retains its rotation and semi-axes in the exact loop", () => {
    const result = checked({ parameters: {}, features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [{ id: "c", kind: "point", x: 2, y: 3 }, { id: "e", kind: "ellipse", center: "c", radiusX: 7, radiusY: 2, rotation: 0.4 }], constraints: [{ type: "fixed", point: "c" }, { type: "ellipseSize", ellipse: "e", radiusX: 7, radiusY: 2 }] } },
      { id: "body", type: "extrude", sketch: "s", depth: 3, operation: "new" }
    ] })
    expect(result.volume).toBeCloseTo(Math.PI * 7 * 2 * 3, 6)
  })

  test("revolving nominal curves maps both radial and axial coordinates, including a translated axis", () => {
    for (const translated of [false, true]) {
      const m = model()
      const sketch = m.sketch("XY").ellipse([3, translated ? 15 : 10], 2, 1)
      if (translated) sketch.path([[0, 5], [1, 5]], { id: "axis" })
      m.revolve(sketch, { axis: translated ? { line: "axis.l0" } : "x" })
      const result = checked(m.build())
      expect(result.volume).toBeCloseTo(2 * Math.PI * 10 * Math.PI * 2, 5)
      expect(massProperties(result.brep).centroid.x).toBeCloseTo(3, 6)
      expect(massProperties(result.brep).centroid.y).toBeCloseTo(translated ? 5 : 0, 6)
    }
  })

  test("an elliptical profile swept along a straight path preserves its nominal area", () => {
    const m = model()
    m.sweep(m.sketch("XY").ellipse([0, 0], 3, 1), m.sketch("YZ").path([[0, 0], [0, 10]]))
    expect(checked(m.build()).volume).toBeCloseTo(Math.PI * 3 * 10, 6)
  })

  test("an open solver spline can join a line into a closed exact profile", () => {
    const result = checked({ parameters: {}, features: [
      { id: "s", type: "sketch", plane: "XY", sketch: {
        entities: [{ id: "a", kind: "point", x: 0, y: 0 }, { id: "b", kind: "point", x: 5, y: 4 }, { id: "c", kind: "point", x: 10, y: 0 }, { id: "curve", kind: "spline", points: ["a", "b", "c"] }, { id: "chord", kind: "line", p1: "c", p2: "a" }],
        constraints: ["a", "b", "c"].map((point) => ({ type: "fixed" as const, point }))
      } },
      { id: "body", type: "extrude", sketch: "s", depth: 2, operation: "new" }
    ] })
    expect(result.brep.edges.some((edge) => edge.curve.kind === "nurbs")).toBe(true)
    expect(result.result.result.issues).toEqual([])
  })

  test("a nominal curve used as a sweep path is never silently replaced with construction chords", () => {
    const m = model()
    const path = m.sketch("YZ", 0, { id: "path" }).curve("bezier", [[0, 0], [5, 5], [0, 10]], { divisions: 4 })
    m.sweep(m.sketch("XY").circle([0, 0], 1), path)
    const result = rebuildExact(m.build())
    expect(result.result.bodies).toHaveLength(1)
    expect(result.bodies[0]!.brep).toBeUndefined()
    expect(result.bodies[0]!.reason).toContain("general curve sweep")
    const sketch = result.result.sketches["path"]!
    expect(exactSketchPath(sketch.solve.sketch, sketch.frame)).toContain("general curve sweep")
  })
})
