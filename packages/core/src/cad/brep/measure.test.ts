import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { curveLength, frame, makeBox, makeCylinder, makeSphere, makeTorus, measureBetween, measureEntity, MeasureError, rotation, transformBrep, type Brep } from "./index.ts"

setDefaultTimeout(60_000)
const at = (x: number, y: number, z: number, a = { x: 0, y: 0, z: 1 }) => frame({ x, y, z }, a)

/** The face of `b` whose plane normal is `n` (a box's top is +Z). */
const planeFace = (b: Brep, n: { x: number; y: number; z: number }): number => {
  const index = b.faces.findIndex((f, i) => {
    const m = measureEntity(b, { kind: "face", index: i })
    return m.kind === "face" && m.normal !== undefined && Math.abs(m.normal.x - n.x) + Math.abs(m.normal.y - n.y) + Math.abs(m.normal.z - n.z) < 1e-9
  })
  if (index < 0) throw new Error("no such face")
  return index
}
const faceOfKind = (b: Brep, kind: string): number => b.faces.findIndex((f) => f.surface.kind === kind)
const edgeOfKind = (b: Brep, kind: string): number => b.edges.findIndex((e) => e.curve.kind === kind)

describe("one entity", () => {
  test("a box: vertex point, straight edge length and direction, face area and outward normal, body volume and box", () => {
    const b = makeBox(10, 20, 30)
    const v = measureEntity(b, { kind: "vertex", index: 0 })
    expect(v.kind).toBe("vertex")
    const e = measureEntity(b, { kind: "edge", index: 0 })
    expect(e.kind === "edge" && e.curve).toBe("line")
    if (e.kind !== "edge") throw new Error("edge")
    expect([10, 20, 30].some((l) => Math.abs(l - e.length) < 1e-12)).toBe(true)
    expect(Math.hypot(e.direction!.x, e.direction!.y, e.direction!.z)).toBeCloseTo(1, 12)
    const top = measureEntity(b, { kind: "face", index: planeFace(b, { x: 0, y: 0, z: 1 }) })
    expect(top.kind === "face" && top.area).toBeCloseTo(200, 9)
    const body = measureEntity(b, { kind: "body", index: 0 })
    if (body.kind !== "body") throw new Error("body")
    expect(body.volume).toBeCloseTo(6000, 6)
    expect(body.area).toBeCloseTo(2 * (200 + 300 + 600), 6)
    expect(body.box.max.z - body.box.min.z).toBeCloseTo(30, 9)
    expect(body.faces).toBe(6)
  })

  test("a cylinder: circular edge radius, length 2πr and full sweep; the side's area, radius and axis", () => {
    const b = makeCylinder(4, 10)
    const e = measureEntity(b, { kind: "edge", index: edgeOfKind(b, "circle") })
    if (e.kind !== "edge") throw new Error("edge")
    expect(e.radius).toBeCloseTo(4, 12)
    expect(e.length).toBeCloseTo(2 * Math.PI * 4, 9)
    expect(e.sweepDeg).toBeCloseTo(360, 9)
    const side = measureEntity(b, { kind: "face", index: faceOfKind(b, "cylinder") })
    if (side.kind !== "face") throw new Error("face")
    expect(side.radius).toBeCloseTo(4, 12)
    expect(Math.abs(side.axis!.z)).toBeCloseTo(1, 12)
    expect(side.area).toBeCloseTo(2 * Math.PI * 4 * 10, 3)
  })

  test("sphere and torus radii", () => {
    const s = measureEntity(makeSphere(7), { kind: "face", index: 0 })
    expect(s.kind === "face" && s.radius).toBeCloseTo(7, 12)
    expect(s.kind === "face" && s.area).toBeCloseTo(4 * Math.PI * 49, 2)
    const t = measureEntity(makeTorus(10, 2), { kind: "face", index: 0 })
    expect(t.kind === "face" && t.radius).toBe(2)
    expect(t.kind === "face" && t.majorRadius).toBe(10)
  })

  test("an index that does not exist is refused with the count", () => {
    expect(() => measureEntity(makeBox(1, 1, 1), { kind: "face", index: 6 })).toThrow(MeasureError)
    expect(() => measureEntity(makeBox(1, 1, 1), { kind: "edge", index: -1 })).toThrow(/edge -1 does not exist \(the body has 12\)/)
  })

  test("curve length by quadrature matches the closed form of a circle given as an ellipse with equal axes", () => {
    const ellipse = { kind: "ellipse" as const, frame: at(0, 0, 0), a: 3, b: 3 }
    expect(curveLength(ellipse, 0, Math.PI)).toBeCloseTo(3 * Math.PI, 10)
  })
})

describe("two entities", () => {
  test("opposite faces of a box: distance 30, parallel normals at 180°, perpendicular gap 30", () => {
    const b = makeBox(10, 20, 30)
    const m = measureBetween(b, { kind: "face", index: planeFace(b, { x: 0, y: 0, z: 1 }) }, b, { kind: "face", index: planeFace(b, { x: 0, y: 0, z: -1 }) })
    expect(m.distance).toBeCloseTo(30, 9)
    expect(m.parallel).toBe(true)
    expect(m.angleDeg).toBeCloseTo(180, 9)
    expect(m.perpendicularGap).toBeCloseTo(30, 9)
    expect(Math.abs(m.delta.z)).toBeCloseTo(30, 9)
  })

  test("adjacent faces of a box touch (distance 0) at 90°", () => {
    const b = makeBox(10, 20, 30)
    const m = measureBetween(b, { kind: "face", index: planeFace(b, { x: 0, y: 0, z: 1 }) }, b, { kind: "face", index: planeFace(b, { x: 1, y: 0, z: 0 }) })
    expect(m.distance).toBe(0)
    expect(m.angleDeg).toBeCloseTo(90, 9)
    expect(m.parallel).toBe(false)
  })

  test("faces of two separate bodies: the gap between them, not between their planes' origins", () => {
    const a = makeBox(10, 10, 10)
    const b = makeBox(10, 10, 10, at(25, 3, 4))
    const m = measureBetween(a, { kind: "face", index: planeFace(a, { x: 1, y: 0, z: 0 }) }, b, { kind: "face", index: planeFace(b, { x: -1, y: 0, z: 0 }) })
    expect(m.distance).toBeCloseTo(15, 9)
    expect(m.angleDeg).toBeCloseTo(180, 9)
    expect(m.pointA.x).toBeCloseTo(10, 9)
    expect(m.pointB.x).toBeCloseTo(25, 9)
  })

  test("a vertex to a sphere face: exact, far better than the mesh", () => {
    const box = makeBox(1, 1, 1, at(20, -0.5, -0.5))
    const vertex = box.vertices.findIndex((v) => Math.abs(v.point.x - 20) < 1e-9 && Math.abs(v.point.y + 0.5) < 1e-9 && Math.abs(v.point.z + 0.5) < 1e-9)
    const sphere = makeSphere(5)
    const m = measureBetween(box, { kind: "vertex", index: vertex }, sphere, { kind: "face", index: 0 })
    expect(m.distance).toBeCloseTo(Math.hypot(20, 0.5, 0.5) - 5, 9)
    expect(m.angleDeg).toBeUndefined()
  })

  test("a point inside a trimmed face's carrier but outside its loops measures to the face boundary", () => {
    // The top of a 10 x 10 box seen from (20, 5, 10): the plane's foot point (20, 5) is outside the face; the face's nearest
    // point is on its rim at x = 10.
    const b = makeBox(10, 10, 10)
    const probe = makeBox(1, 1, 1, at(20, 4.5, 9.5))
    const vertex = probe.vertices.findIndex((v) => Math.abs(v.point.x - 20) < 1e-9 && Math.abs(v.point.y - 4.5) < 1e-9 && Math.abs(v.point.z - 10.5) < 1e-9)
    const m = measureBetween(b, { kind: "face", index: planeFace(b, { x: 0, y: 0, z: 1 }) }, probe, { kind: "vertex", index: vertex })
    expect(m.pointA.x).toBeCloseTo(10, 9)
    expect(m.distance).toBeCloseTo(Math.hypot(10, 0.5), 9)
  })

  test("two coaxial cylinder axes are parallel lines; a skew one is at its angle", () => {
    const a = makeCylinder(2, 10)
    const b = makeCylinder(1, 10, at(8, 0, 0))
    const m = measureBetween(a, { kind: "face", index: faceOfKind(a, "cylinder") }, b, { kind: "face", index: faceOfKind(b, "cylinder") })
    expect(m.parallel).toBe(true)
    expect(m.angleDeg).toBeCloseTo(0, 9)
    expect(m.perpendicularGap).toBeCloseTo(8, 9)
    expect(m.distance).toBeCloseTo(5, 6)
    const tilted = transformBrep(makeCylinder(1, 10, at(8, 0, 0)), rotation({ x: 0, y: 1, z: 0 }, Math.PI / 6, { x: 8, y: 0, z: 0 }))
    const n = measureBetween(a, { kind: "face", index: faceOfKind(a, "cylinder") }, tilted, { kind: "face", index: faceOfKind(tilted, "cylinder") })
    expect(n.angleDeg).toBeCloseTo(30, 6)
    expect(n.parallel).toBe(false)
  })

  test("a straight edge against a plane: the angle with the plane, 0 when it lies in it", () => {
    const b = makeBox(10, 10, 10)
    const top = planeFace(b, { x: 0, y: 0, z: 1 })
    const vertical = b.edges.findIndex((e) => e.curve.kind === "line" && Math.abs(Math.abs(e.curve.dir.z) - 1) < 1e-9)
    const flat = b.edges.findIndex((e) => e.curve.kind === "line" && Math.abs(e.curve.dir.z) < 1e-9)
    expect(measureBetween(b, { kind: "edge", index: vertical }, b, { kind: "face", index: top }).angleDeg).toBeCloseTo(90, 9)
    expect(measureBetween(b, { kind: "edge", index: flat }, b, { kind: "face", index: top }).angleDeg).toBeCloseTo(0, 9)
  })

  test("body to body equals the solid clearance", () => {
    const m = measureBetween(makeSphere(5), { kind: "body", index: 0 }, makeSphere(3, at(20, 0, 0)), { kind: "body", index: 0 })
    expect(m.distance).toBeCloseTo(12, 8)
  })
})
