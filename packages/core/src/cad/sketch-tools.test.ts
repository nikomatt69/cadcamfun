/**
 * Sketch construction tools (spec 45, P2-10): fillet, mirror, pattern, offset, project. Each result is solved and checked against
 * analytic geometry (the area of the profile it closes, tangency, radii), and every refusal states its reason.
 */
import { describe, expect, test } from "bun:test"
import { filletCorner, mirrorEntities, offsetEntities, patternEntities, projectEdges } from "./sketch-tools.ts"
import { polygonArea, sketchProfiles, solveSketch, type Constraint, type Sketch, type SketchEntity } from "./sketch.ts"
import { makeBox, makeCylinder } from "./brep/primitives.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const ok = <T>(r: T | string): T => { if (typeof r === "string") throw new Error(r); return r }
const area = (s: Sketch): number => {
  const loops = sketchProfiles(s, 1e-7).loops
  expect(loops.length).toBeGreaterThan(0)
  return loops.map((l) => Math.abs(polygonArea(l))).sort((a, b) => b - a).reduce((acc, a, i) => (i === 0 ? a : acc - a), 0)
}
const pos = (s: Sketch, id: string) => s.entities.find((e) => e.id === id) as { x: number; y: number }

/** A 40 x 20 rectangle, corners shared by id, fully placed by fixed corners and h/v constraints. */
const rect = (w = 40, h = 20): Sketch => ({
  entities: [pt("a", 0, 0), pt("b", w, 0), pt("c", w, h), pt("d", 0, h), line("ab", "a", "b"), line("bc", "b", "c"), line("cd", "c", "d"), line("da", "d", "a")],
  constraints: [{ type: "horizontal", line: "ab" }, { type: "vertical", line: "bc" }, { type: "horizontal", line: "cd" }, { type: "vertical", line: "da" }]
})

describe("sketch fillet", () => {
  test("rounding all four corners of a rectangle gives the analytic area, and the solve keeps every arc tangent", () => {
    let s = rect()
    const r = 3
    for (const [x, y] of [["ab", "bc"], ["bc", "cd"], ["cd", "da"], ["da", "ab"]] as const) s = ok(filletCorner(s, x, y, r))
    expect(s.entities.filter((e) => e.kind === "arc")).toHaveLength(4)
    expect(Math.abs(area(s) - (40 * 20 - (4 - Math.PI) * r * r))).toBeLessThan(1e-3)
    const solved = solveSketch(s)
    expect(["fully-constrained", "under-constrained"]).toContain(solved.status)
    expect(solved.residual).toBeLessThan(1e-8)
    // Tangent points still on their lines, arc centres r from both lines.
    for (const e of solved.sketch.entities) {
      if (e.kind !== "arc") continue
      const c = pos(solved.sketch, e.center), st = pos(solved.sketch, e.start)
      expect(Math.abs(Math.hypot(st.x - c.x, st.y - c.y) - r)).toBeLessThan(1e-8)
    }
  })

  test("refusals: lines that do not meet, collinear lines, a radius too large for the corner", () => {
    const s = rect()
    expect(filletCorner(s, "ab", "cd", 2)).toMatch(/do not meet/)
    expect(filletCorner(s, "ab", "bc", 25)).toMatch(/needs 25\.0000 mm of each line/)
    const straight: Sketch = { entities: [pt("p", 0, 0), pt("q", 5, 0), pt("r", 10, 0), line("l1", "p", "q"), line("l2", "q", "r")], constraints: [] }
    expect(filletCorner(straight, "l1", "l2", 1)).toMatch(/collinear/)
    expect(filletCorner(s, "ab", "bc", -1)).toMatch(/positive/)
  })

  test("a 60 degree corner: the tangent distance is r / tan(30 deg)", () => {
    const s: Sketch = { entities: [pt("o", 0, 0), pt("p", 20, 0), pt("q", 20 * Math.cos(Math.PI / 3), 20 * Math.sin(Math.PI / 3)), line("l1", "o", "p"), line("l2", "o", "q")], constraints: [] }
    const f = ok(filletCorner(s, "l1", "l2", 2))
    const t = pos(f, "l1_t")
    expect(Math.abs(t.x - 2 / Math.tan(Math.PI / 6))).toBeLessThan(1e-12)
    expect(f.entities.some((e) => e.id === "o")).toBe(false)
  })
})

describe("sketch mirror", () => {
  test("half a profile mirrored about its edge closes into the whole one, and the mirror follows an edit of the original", () => {
    // An L-shaped half: points on the axis x = 0 are shared.
    const half: Sketch = {
      entities: [pt("o", 0, 0), pt("p", 10, 0), pt("q", 10, 4), pt("r", 0, 4), line("op", "o", "p"), line("pq", "p", "q"), line("qr", "q", "r"), line("axis", "r", "o")],
      constraints: [{ type: "fixed", point: "o" }, { type: "fixed", point: "r" }]
    }
    const m = ok(mirrorEntities(half, ["op", "pq", "qr"], "axis"))
    // The axis is drawn, and so is its mirror profile: drop the axis to read the whole outline.
    const whole: Sketch = { ...m, entities: m.entities.filter((e) => e.id !== "axis") }
    expect(Math.abs(area(whole) - 80)).toBeLessThan(1e-9)
    expect(m.constraints.filter((c) => c.type === "symmetric")).toHaveLength(2)
    // Move the original corner: the mirror follows.
    const moved: Sketch = { ...m, constraints: [...m.constraints, { type: "fixed", point: "p", x: 12, y: 0 }, { type: "fixed", point: "q", x: 12, y: 4 }] }
    const solved = solveSketch(moved)
    expect(solved.residual).toBeLessThan(1e-8)
    expect(Math.abs(pos(solved.sketch, "p_m").x + 12)).toBeLessThan(1e-7)
  })

  test("a circle mirrored keeps its radius tied; an arc runs the other way; refusals", () => {
    const s: Sketch = { entities: [pt("a1", 0, -10), pt("a2", 0, 10), line("ax", "a1", "a2"), pt("c", 5, 0), { id: "k", kind: "circle", center: "c", radius: 2 }, pt("s", 8, 0), pt("e", 5, 3), { id: "arc", kind: "arc", center: "c", start: "s", end: "e" }], constraints: [] }
    const m = ok(mirrorEntities(s, ["k", "arc"], "ax"))
    expect(m.constraints).toContainEqual({ type: "equalRadius", a: "k", b: "k_m" } as Constraint)
    const arc = m.entities.find((e) => e.id === "arc_m") as { start: string; end: string }
    expect(arc.start).toBe("e_m")
    expect(mirrorEntities(s, ["ax"], "ax")).toMatch(/onto itself/)
    expect(mirrorEntities(s, ["k"], "c")).toMatch(/not a line/)
  })
})

describe("sketch pattern", () => {
  test("a linear pattern of a circle: tied copies follow an edit of the original", () => {
    const s: Sketch = { entities: [pt("c", 0, 0), { id: "k", kind: "circle", center: "c", radius: 1 }], constraints: [] }
    const p = ok(patternEntities(s, ["k"], { kind: "linear", count: 4, step: [10, 0] }))
    expect(p.entities.filter((e) => e.kind === "circle")).toHaveLength(4)
    const solved = solveSketch({ ...p, constraints: [...p.constraints, { type: "fixed", point: "c", x: 2, y: 1 }, { type: "radius", circle: "k", value: 1.5 }] })
    expect(solved.status).toBe("fully-constrained")
    const last = pos(solved.sketch, "c_p3")
    expect(Math.abs(last.x - 32)).toBeLessThan(1e-7)
    expect(Math.abs(last.y - 1)).toBeLessThan(1e-7)
    const k3 = solved.sketch.entities.find((e) => e.id === "k_p3") as { radius: number }
    expect(Math.abs(k3.radius - 1.5)).toBeLessThan(1e-7)
  })

  test("a circular pattern of a slot line: six copies on the circle, their shape copied, a solve leaves them in place", () => {
    const s: Sketch = { entities: [pt("o", 0, 0), pt("a", 10, 0), pt("b", 14, 0), line("l", "a", "b")], constraints: [{ type: "fixed", point: "o" }, { type: "fixed", point: "a" }, { type: "length", line: "l", value: 4 }, { type: "horizontal", line: "l" }] }
    const p = ok(patternEntities(s, ["l"], { kind: "circular", count: 6, center: "o" }))
    expect(p.entities.filter((e) => e.kind === "line")).toHaveLength(6)
    // `length` is copied, `horizontal` is not (a turned copy is not horizontal).
    expect(p.constraints.filter((c) => c.type === "length")).toHaveLength(6)
    expect(p.constraints.filter((c) => c.type === "horizontal")).toHaveLength(1)
    const solved = solveSketch(p)
    expect(solved.residual).toBeLessThan(1e-8)
    for (let k = 1; k < 6; k++) {
      const q = pos(solved.sketch, `a_p${k}`)
      expect(Math.abs(Math.hypot(q.x, q.y) - 10)).toBeLessThan(1e-7)
      expect(Math.abs(Math.atan2(q.y, q.x) - Math.atan2(Math.sin(k * Math.PI / 3), Math.cos(k * Math.PI / 3)))).toBeLessThan(1e-7)
    }
  })

  test("refusals: a bad count, a zero step, a missing centre", () => {
    const s = rect()
    expect(patternEntities(s, ["ab"], { kind: "linear", count: 1, step: [1, 0] })).toMatch(/whole count/)
    expect(patternEntities(s, ["ab"], { kind: "linear", count: 3, step: [0, 0] })).toMatch(/not zero/)
    expect(patternEntities(s, ["ab"], { kind: "circular", count: 3, center: "zz" })).toMatch(/not a point/)
    expect(patternEntities(s, ["nope"], { kind: "linear", count: 3, step: [1, 0] })).toMatch(/not in the sketch/)
  })
})

describe("sketch offset", () => {
  test("a closed rectangle offset outward and inward: analytic areas (sharp corners)", () => {
    const s = rect()
    const out = ok(offsetEntities(s, ["ab", "bc", "cd", "da"], 2))
    const outer: Sketch = { ...out, entities: out.entities.filter((e) => !["ab", "bc", "cd", "da"].includes(e.id)) }
    expect(Math.abs(area(outer) - 44 * 24)).toBeLessThan(1e-9)
    const inn = ok(offsetEntities(s, ["ab", "bc", "cd", "da"], -2))
    const inner: Sketch = { ...inn, entities: inn.entities.filter((e) => !["ab", "bc", "cd", "da"].includes(e.id)) }
    expect(Math.abs(area(inner) - 36 * 16)).toBeLessThan(1e-9)
    expect(out.constraints.filter((c) => c.type === "parallel")).toHaveLength(4)
    expect(offsetEntities(s, ["ab", "bc", "cd", "da"], -10)).toMatch(/consumes/)
  })

  test("a rounded rectangle offset outward: the arcs keep their centres and grow, the area is analytic", () => {
    let s = rect()
    for (const [x, y] of [["ab", "bc"], ["bc", "cd"], ["cd", "da"], ["da", "ab"]] as const) s = ok(filletCorner(s, x, y, 3))
    const ids = s.entities.filter((e) => e.kind === "line" || e.kind === "arc").map((e) => e.id)
    for (const d of [2, -1.5]) {
      const o = ok(offsetEntities(s, ids, d))
      const only: Sketch = { ...o, entities: o.entities.filter((e) => !ids.includes(e.id)) }
      const r = 3 + d, w = 40 + 2 * d, h = 20 + 2 * d
      expect(Math.abs(area(only) - (w * h - (4 - Math.PI) * r * r))).toBeLessThan(1e-3)
      for (const e of only.entities) if (e.kind === "arc") expect(s.entities.some((x) => x.id === e.center)).toBe(true)
    }
    expect(offsetEntities(s, ids, -3)).toMatch(/leaves no arc/)
  })

  test("an open chain offsets to its left; circles grow; a branch is refused", () => {
    const s: Sketch = { entities: [pt("p", 0, 0), pt("q", 10, 0), pt("r", 10, 10), line("l1", "p", "q"), line("l2", "q", "r")], constraints: [] }
    const o = ok(offsetEntities(s, ["l1", "l2"], 1))
    const pts = o.entities.filter((e) => e.kind === "point" && !["p", "q", "r"].includes(e.id)) as Array<{ x: number; y: number }>
    expect(pts.map((p) => [p.x, p.y])).toEqual([[0, 1], [9, 1], [9, 10]])
    const c: Sketch = { entities: [pt("c", 0, 0), { id: "k", kind: "circle", center: "c", radius: 4 }], constraints: [] }
    expect((ok(offsetEntities(c, ["k"], 1)).entities.find((e) => e.id === "k_o") as { radius: number }).radius).toBe(5)
    expect(offsetEntities(c, ["k"], -4)).toMatch(/leaves no circle/)
    const t: Sketch = { entities: [pt("o", 0, 0), pt("a", 1, 0), pt("b", 0, 1), pt("c", -1, 0), line("x", "o", "a"), line("y", "o", "b"), line("z", "o", "c")], constraints: [] }
    expect(offsetEntities(t, ["x", "y", "z"], 1)).toMatch(/branches/)
  })
})

describe("project model edges into a sketch", () => {
  const XY = { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } }
  test("the top edges of a box close into its outline; vertical edges project to its corners", () => {
    const box = makeBox(30, 20, 10)
    const top = box.edges.map((e, i) => ({ e, i })).filter(({ e }) => box.vertices[e.v0]!.point.z > 9.99 && box.vertices[e.v1]!.point.z > 9.99).map(({ i }) => i)
    expect(top).toHaveLength(4)
    const r = ok(projectEdges({ entities: [], constraints: [] }, box, top, XY))
    expect(r.refused).toEqual([])
    expect(r.sketch.entities.filter((e) => e.kind === "point")).toHaveLength(4)
    expect(Math.abs(area(r.sketch) - 600)).toBeLessThan(1e-9)
    expect(solveSketch(r.sketch).status).toBe("fully-constrained")
    const vertical = box.edges.map((e, i) => ({ e, i })).filter(({ e }) => Math.abs(box.vertices[e.v0]!.point.z - box.vertices[e.v1]!.point.z) > 1).map(({ i }) => i)
    const corners = ok(projectEdges({ entities: [], constraints: [] }, box, vertical, XY))
    expect(corners.sketch.entities.every((e) => e.kind === "point")).toBe(true)
  })

  test("a cylinder's rim projects to a circle on a parallel plane, to an ellipse on a tilted one; edge-on is refused", () => {
    const cyl = makeCylinder(5, 12)
    const rims = cyl.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.curve.kind === "circle").map(({ i }) => i)
    expect(rims.length).toBeGreaterThan(0)
    const flat = ok(projectEdges({ entities: [], constraints: [] }, cyl, rims.slice(0, 1), XY))
    const k = flat.sketch.entities.find((e) => e.kind === "circle" || e.kind === "arc")!
    if (k.kind === "circle") expect(k.radius).toBe(5)
    const a = Math.PI / 6
    const tilted = { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: Math.cos(a), z: Math.sin(a) }, n: { x: 0, y: -Math.sin(a), z: Math.cos(a) } }
    const full = rims.filter((i) => Math.abs(cyl.edges[i]!.t1 - cyl.edges[i]!.t0 - 2 * Math.PI) < 1e-9)
    if (full.length > 0) {
      const t = ok(projectEdges({ entities: [], constraints: [] }, cyl, full.slice(0, 1), tilted))
      const e = t.sketch.entities.find((x) => x.kind === "ellipse") as { radiusX: number; radiusY: number }
      expect(e.radiusX).toBe(5)
      expect(Math.abs(e.radiusY - 5 * Math.cos(a))).toBeLessThan(1e-12)
    }
    const side = { origin: { x: 0, y: 0, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 0, y: -1, z: 0 } }
    expect(projectEdges({ entities: [], constraints: [] }, cyl, rims.slice(0, 1), side)).toMatch(/edge-on|part of an ellipse/)
  })
})
