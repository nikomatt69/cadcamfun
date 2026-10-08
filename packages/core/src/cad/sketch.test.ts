import { describe, expect, test } from "bun:test"
import { SketchError, polygonArea, sketchProfiles, solveSketch, type Constraint, type Sketch, type SketchEntity } from "./sketch.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const at = (s: Sketch, id: string) => s.entities.find((e) => e.id === id) as { x: number; y: number; radius?: number }

/** A rectangle drawn a little crooked: p1 p2 / p4 p3, bottom l1, right l2, top l3, left l4. */
const crooked = (): SketchEntity[] => [
  pt("p1", 0.3, -0.2), pt("p2", 38, 1), pt("p3", 41, 27), pt("p4", -1, 24),
  line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")
]
const squared: Constraint[] = [
  { type: "fixed", point: "p1", x: 0, y: 0 },
  { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" }
]

describe("a rectangle", () => {
  test("squared up and dimensioned it is fully constrained and exact", () => {
    const r = solveSketch({ entities: crooked(), constraints: [...squared, { type: "length", line: "l1", value: 40 }, { type: "length", line: "l2", value: 25 }] })
    expect(r.status).toBe("fully-constrained")
    expect(r.dof).toBe(0)
    expect(r.free).toEqual([])
    expect(r.residual).toBeLessThan(1e-9)
    expect(at(r.sketch, "p2")).toMatchObject({ x: expect.closeTo(40, 8), y: expect.closeTo(0, 8) })
    expect(at(r.sketch, "p3")).toMatchObject({ x: expect.closeTo(40, 8), y: expect.closeTo(25, 8) })
    expect(at(r.sketch, "p4")).toMatchObject({ x: expect.closeTo(0, 8), y: expect.closeTo(25, 8) })
  })

  test("a different dimension moves the whole sketch: it follows the change", () => {
    const base = { entities: crooked(), constraints: [...squared, { type: "length", line: "l1", value: 40 } as Constraint, { type: "length", line: "l2", value: 25 } as Constraint] }
    const first = solveSketch(base)
    const wider = solveSketch({ entities: first.sketch.entities, constraints: base.constraints.map((c) => (c.type === "length" && c.line === "l1" ? { ...c, value: 65 } : c)) })
    expect(wider.status).toBe("fully-constrained")
    expect(at(wider.sketch, "p3")).toMatchObject({ x: expect.closeTo(65, 8), y: expect.closeTo(25, 8) })
  })

  test("without the dimensions it is under-constrained and names the points that can still move", () => {
    const r = solveSketch({ entities: crooked(), constraints: squared })
    expect(r.status).toBe("under-constrained")
    expect(r.dof).toBe(2) // width and height
    expect(r.free).toContain("p3")
    expect(r.free).not.toContain("p1")
  })

  test("a free point has two degrees of freedom, a line with one end fixed and its length given has one", () => {
    expect(solveSketch({ entities: [pt("a", 1, 1)], constraints: [] }).dof).toBe(2)
    const r = solveSketch({ entities: [pt("a", 0, 0), pt("b", 3, 4), line("l", "a", "b")], constraints: [{ type: "fixed", point: "a" }, { type: "length", line: "l", value: 5 }] })
    expect(r.dof).toBe(1) // it can still swing
    expect(r.status).toBe("under-constrained")
    expect(r.free).toEqual(["b"])
  })

  test("two different lengths on one line conflict, naming the constraint that misses", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 10, 0), line("l", "a", "b")],
      constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 10, id: "ten" }, { type: "length", line: "l", value: 12, id: "twelve" }]
    })
    expect(r.status).toBe("conflicting")
    expect(r.conflicts.some((c) => c === "ten" || c === "twelve")).toBe(true)
    expect(r.message).toContain("cannot all hold")
  })

  test("a repeated constraint is redundant but consistent: over-constrained, still solved", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 10, 0.5), line("l", "a", "b")],
      constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "horizontalPoints", a: "a", b: "b" }, { type: "length", line: "l", value: 10 }]
    })
    expect(r.status).toBe("over-constrained")
    expect(r.redundant).toBe(1)
    expect(r.residual).toBeLessThan(1e-9)
  })
})

describe("the constraints", () => {
  const solved = (entities: SketchEntity[], constraints: Constraint[]) => solveSketch({ entities, constraints })

  test("distance, distanceX and distanceY", () => {
    const r = solved([pt("a", 0, 0), pt("b", 2, 2)], [{ type: "fixed", point: "a" }, { type: "distanceX", a: "a", b: "b", value: 6 }, { type: "distanceY", a: "a", b: "b", value: 8 }])
    expect(r.status).toBe("fully-constrained")
    expect(at(r.sketch, "b")).toMatchObject({ x: expect.closeTo(6, 8), y: expect.closeTo(8, 8) })
    const d = solved([pt("a", 0, 0), pt("b", 2, 1)], [{ type: "fixed", point: "a" }, { type: "distance", a: "a", b: "b", value: 10 }])
    expect(Math.hypot(at(d.sketch, "b").x, at(d.sketch, "b").y)).toBeCloseTo(10, 8)
  })

  test("parallel and perpendicular", () => {
    const entities = [pt("a", 0, 0), pt("b", 10, 0), pt("c", 0, 5), pt("d", 9, 4), line("l1", "a", "b"), line("l2", "c", "d")]
    const par = solved(entities, [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "fixed", point: "c" }, { type: "parallel", a: "l1", b: "l2" }])
    expect(at(par.sketch, "d").y).toBeCloseTo(5, 8)
    const perp = solved(entities, [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "fixed", point: "c" }, { type: "perpendicular", a: "l1", b: "l2" }])
    expect(at(perp.sketch, "d").x).toBeCloseTo(0, 8)
  })

  test("equal length, midpoint, point on line", () => {
    const entities = [pt("a", 0, 0), pt("b", 10, 0), pt("c", 0, 3), pt("d", 4, 3), pt("m", 4, 2), line("l1", "a", "b"), line("l2", "c", "d")]
    const r = solved(entities, [
      { type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "fixed", point: "c" }, { type: "horizontal", line: "l2" },
      { type: "equalLength", a: "l1", b: "l2" }, { type: "midpoint", point: "m", line: "l1" }
    ])
    expect(at(r.sketch, "d").x).toBeCloseTo(10, 7)
    expect(at(r.sketch, "m")).toMatchObject({ x: expect.closeTo(5, 8), y: expect.closeTo(0, 8) })
    const on = solved([pt("a", 0, 0), pt("b", 10, 10), pt("p", 3, 5), line("l", "a", "b")], [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "pointOnLine", point: "p", line: "l" }])
    expect(at(on.sketch, "p").x).toBeCloseTo(at(on.sketch, "p").y, 7)
  })

  test("the angle between two lines, including across the 0 / 360 wrap", () => {
    const entities = [pt("a", 0, 0), pt("b", 10, 0), pt("c", 0, 0), pt("d", 8, 1), line("l1", "a", "b"), line("l2", "c", "d")]
    const r = solved(entities, [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "coincident", a: "a", b: "c" }, { type: "length", line: "l2", value: 8 }, { type: "angle", a: "l1", b: "l2", value: Math.PI / 4 }])
    expect(at(r.sketch, "d")).toMatchObject({ x: expect.closeTo(8 * Math.cos(Math.PI / 4), 7), y: expect.closeTo(8 * Math.sin(Math.PI / 4), 7) })
    const wrap = solved(entities, [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "coincident", a: "a", b: "c" }, { type: "length", line: "l2", value: 8 }, { type: "angle", a: "l1", b: "l2", value: -0.2 }])
    expect(at(wrap.sketch, "d").y).toBeLessThan(0)
  })

  test("circles: radius, diameter, equal radius, concentric, point on circle", () => {
    const entities: SketchEntity[] = [pt("c1", 0, 0), pt("c2", 5, 1), { id: "k1", kind: "circle", center: "c1", radius: 2 }, { id: "k2", kind: "circle", center: "c2", radius: 3 }, pt("p", 4, 0)]
    const r = solved(entities, [
      { type: "fixed", point: "c1" }, { type: "radius", circle: "k1", value: 7 }, { type: "equalRadius", a: "k1", b: "k2" },
      { type: "concentric", a: "k1", b: "k2" }, { type: "pointOnCircle", point: "p", circle: "k1" }, { type: "verticalPoints", a: "p", b: "c1" }
    ])
    expect(at(r.sketch, "k1").radius).toBeCloseTo(7, 8)
    expect(at(r.sketch, "k2").radius).toBeCloseTo(7, 8)
    expect(at(r.sketch, "c2")).toMatchObject({ x: expect.closeTo(0, 8), y: expect.closeTo(0, 8) })
    expect(Math.abs(at(r.sketch, "p").y)).toBeCloseTo(7, 7)
    const dia = solved(entities.slice(0, 3), [{ type: "fixed", point: "c1" }, { type: "diameter", circle: "k1", value: 9 }])
    expect(at(dia.sketch, "k1").radius).toBeCloseTo(4.5, 8)
  })

  test("a line tangent to a circle sits one radius from its centre, on the side it was drawn", () => {
    const entities: SketchEntity[] = [pt("a", -10, 4.6), pt("b", 10, 4.8), line("l", "a", "b"), pt("c", 0, 0), { id: "k", kind: "circle", center: "c", radius: 5 }]
    const r = solved(entities, [{ type: "fixed", point: "c" }, { type: "radius", circle: "k", value: 5 }, { type: "horizontal", line: "l" }, { type: "tangentLineCircle", line: "l", circle: "k" }, { type: "fixed", point: "a", x: -10 }, { type: "fixed", point: "b", x: 10 }])
    expect(at(r.sketch, "a").y).toBeCloseTo(5, 7)
    expect(at(r.sketch, "b").y).toBeCloseTo(5, 7)
  })

  test("circles tangent externally and internally", () => {
    const entities: SketchEntity[] = [pt("c1", 0, 0), pt("c2", 9, 0), { id: "k1", kind: "circle", center: "c1", radius: 4 }, { id: "k2", kind: "circle", center: "c2", radius: 3 }]
    const base: Constraint[] = [{ type: "fixed", point: "c1" }, { type: "radius", circle: "k1", value: 4 }, { type: "radius", circle: "k2", value: 3 }, { type: "horizontalPoints", a: "c1", b: "c2" }]
    const ext = solved(entities, [...base, { type: "tangentCircles", a: "k1", b: "k2" }])
    expect(Math.abs(at(ext.sketch, "c2").x)).toBeCloseTo(7, 7)
    const int = solved(entities, [...base, { type: "tangentCircles", a: "k1", b: "k2", internal: true }])
    expect(Math.abs(at(int.sketch, "c2").x)).toBeCloseTo(1, 7)
  })

  test("symmetry about a line", () => {
    const entities = [pt("a", 0, 0), pt("b", 0, 10), line("axis", "a", "b"), pt("p", -3, 2), pt("q", 4, 3)]
    const r = solved(entities, [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "fixed", point: "p" }, { type: "symmetric", a: "p", b: "q", line: "axis" }])
    expect(at(r.sketch, "q")).toMatchObject({ x: expect.closeTo(3, 7), y: expect.closeTo(2, 7) })
  })

  test("an arc keeps its end on the circle through its start", () => {
    const entities: SketchEntity[] = [pt("c", 0, 0), pt("s", 5, 0), pt("e", 0, 6), { id: "arc", kind: "arc", center: "c", start: "s", end: "e" }]
    const r = solved(entities, [{ type: "fixed", point: "c" }, { type: "fixed", point: "s" }])
    expect(Math.hypot(at(r.sketch, "e").x, at(r.sketch, "e").y)).toBeCloseTo(5, 7)
  })

  test("a malformed sketch is an error, not a wrong answer", () => {
    expect(() => solveSketch({ entities: [pt("a", 0, 0)], constraints: [{ type: "horizontal", line: "nope" }] })).toThrow(SketchError)
    expect(() => solveSketch({ entities: [pt("a", 0, 0), pt("a", 1, 1)], constraints: [] })).toThrow("Duplicate")
    expect(() => solveSketch({ entities: [pt("a", 0, 0)], constraints: [{ type: "coincident", a: "a", b: "z" }] })).toThrow("not a point")
  })
})

describe("profiles", () => {
  test("a solved rectangle is one closed loop with the right area, and a circle is its own loop", () => {
    const r = solveSketch({ entities: [...crooked(), pt("cc", 20, 12), { id: "hole", kind: "circle", center: "cc", radius: 4 }], constraints: [...squared, { type: "length", line: "l1", value: 40 }, { type: "length", line: "l2", value: 25 }, { type: "fixed", point: "cc" }, { type: "radius", circle: "hole", value: 4 }] })
    const { loops, open } = sketchProfiles(r.sketch, 0.005)
    expect(open).toHaveLength(0)
    expect(loops).toHaveLength(2)
    const areas = loops.map((l) => Math.abs(polygonArea(l))).sort((a, b) => b - a)
    expect(areas[0]!).toBeCloseTo(1000, 6)
    // A polygon within 0.005 mm of a radius-4 circle loses about 4t / 3r = 0.17 % of its area.
    expect(areas[1]!).toBeGreaterThan(Math.PI * 16 * 0.997)
    expect(areas[1]!).toBeLessThanOrEqual(Math.PI * 16 + 1e-9)
  })

  test("a line closed by an arc (a D) has the area of a half disc", () => {
    // The arc runs counter-clockwise from (0,0) round the centre (0,5) to (0,10), through x > 0; the line closes it on x = 0.
    const entities: SketchEntity[] = [pt("a", 0, 0), pt("b", 0, 10), pt("c", 0, 5), line("l", "b", "a"), { id: "arc", kind: "arc", center: "c", start: "a", end: "b" }]
    const r = solveSketch({ entities, constraints: [{ type: "fixed", point: "a" }, { type: "fixed", point: "b" }, { type: "fixed", point: "c" }] })
    const { loops } = sketchProfiles(r.sketch, 0.002)
    expect(loops).toHaveLength(1)
    expect(Math.abs(polygonArea(loops[0]!))).toBeGreaterThan((Math.PI * 25) / 2 * 0.999)
    expect(Math.abs(polygonArea(loops[0]!))).toBeLessThanOrEqual((Math.PI * 25) / 2 + 1e-9)
  })

  test("a chain that does not close is reported as open, not as a loop", () => {
    const r = solveSketch({ entities: [pt("a", 0, 0), pt("b", 5, 0), pt("c", 5, 5), line("l1", "a", "b"), line("l2", "b", "c")], constraints: [] })
    const { loops, open } = sketchProfiles(r.sketch)
    expect(loops).toHaveLength(0)
    expect(open).toHaveLength(1)
    expect(open[0]).toHaveLength(3)
  })
})
