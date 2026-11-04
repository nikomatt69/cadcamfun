import { describe, expect, test } from "bun:test"
import { filletCorner, mirrorEntities, offsetEntities, patternEntities } from "./sketch-tools.ts"
import { solveSketchSystem } from "./sketch-solver.ts"
import type { Sketch, SketchEntity } from "./sketch.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)
const at = (s: Sketch, id: string) => s.entities.find((e) => e.id === id) as { x: number; y: number }
const get = <T extends SketchEntity["kind"]>(s: Sketch, id: string, _k: T) => s.entities.find((e) => e.id === id) as Extract<SketchEntity, { kind: T }>

// A counter-clockwise 10 x 6 rectangle.
const rect: Sketch = {
  entities: [pt("a", 0, 0), pt("b", 10, 0), pt("c", 10, 6), pt("d", 0, 6), line("l1", "a", "b"), line("l2", "b", "c"), line("l3", "c", "d"), line("l4", "d", "a")],
  constraints: []
}

describe("offset", () => {
  test("a closed rectangle offset inward is a smaller rectangle, corners rejoined", () => {
    const r = offsetEntities(rect, ["l1", "l2", "l3", "l4"], 1) as Sketch
    expect(typeof r).not.toBe("string")
    const lines = r.entities.filter((e) => e.kind === "line" && e.id.includes("_off")) as Array<{ p1: string; p2: string }>
    expect(lines.length).toBe(4)
    const xs = lines.flatMap((l) => [at(r, l.p1).x, at(r, l.p2).x]), ys = lines.flatMap((l) => [at(r, l.p1).y, at(r, l.p2).y])
    near(Math.min(...xs), 1); near(Math.max(...xs), 9); near(Math.min(...ys), 1); near(Math.max(...ys), 5)
    // Shared corners are shared points: 4 new points and 4 new lines.
    expect(r.entities.length - rect.entities.length).toBe(8)
  })
  test("a negative distance grows it", () => {
    const r = offsetEntities(rect, ["l1", "l2", "l3", "l4"], -2) as Sketch
    const l = get(r, "l1_off1", "line")
    near(at(r, l.p1).y, -2); near(at(r, l.p1).x, -2); near(at(r, l.p2).x, 12)
  })
  test("an inset larger than the shape refuses with the reason", () => {
    const r = offsetEntities(rect, ["l1", "l2", "l3", "l4"], 3.5)
    expect(typeof r).toBe("string")
    expect(r as string).toContain("reverses")
  })
  test("circles and an open line-arc-line chain", () => {
    const s: Sketch = { entities: [pt("o", 0, 0), { id: "k", kind: "circle", center: "o", radius: 5 }], constraints: [] }
    const grown = offsetEntities(s, ["k"], -2) as Sketch
    near(get(grown, "k_off1", "circle").radius, 7)
    expect(typeof offsetEntities(s, ["k"], 5)).toBe("string")
    // Slot: line (0,0)->(10,0), arc centre (10,2) from (10,0) to (10,4) ccw, line (10,4)->(0,4).
    const slot: Sketch = {
      entities: [pt("p0", 0, 0), pt("p1", 10, 0), pt("p2", 10, 4), pt("p3", 0, 4), pt("c", 10, 2), line("bot", "p0", "p1"), { id: "arc", kind: "arc", center: "c", start: "p1", end: "p2" }, line("top", "p2", "p3")],
      constraints: []
    }
    const r = offsetEntities(slot, ["bot", "arc", "top"], -1) as Sketch
    expect(typeof r).not.toBe("string")
    const arc = get(r, "arc_off1", "arc"), c = at(r, arc.center)
    near(Math.hypot(at(r, arc.start).x - c.x, at(r, arc.start).y - c.y), 3)
    near(Math.hypot(at(r, arc.end).x - c.x, at(r, arc.end).y - c.y), 3)
    const bot = get(r, "bot_off1", "line")
    near(at(r, bot.p2).y, -1); near(at(r, bot.p2).x, 10)
    // The bottom offset line ends exactly where the arc offset begins.
    expect(bot.p2).toBe(arc.start)
  })
  test("refuses points and unknown ids and a zero distance", () => {
    expect(typeof offsetEntities(rect, ["a"], 1)).toBe("string")
    expect(typeof offsetEntities(rect, ["nope"], 1)).toBe("string")
    expect(typeof offsetEntities(rect, ["l1"], 0)).toBe("string")
  })
})

describe("mirror", () => {
  const half: Sketch = {
    entities: [pt("a", 0, 0), pt("b", 4, 0), pt("c", 4, 3), pt("d", 0, 3), line("axis", "a", "d"), line("l1", "a", "b"), line("l2", "b", "c"), line("l3", "c", "d")],
    constraints: []
  }
  test("a half profile mirrors into a closed outline, axis points are shared", () => {
    const r = mirrorEntities(half, ["l1", "l2", "l3"], "axis") as Sketch
    expect(typeof r).not.toBe("string")
    const m1 = r.entities.find((e) => e.id.startsWith("mir_l1_")) as { p1: string; p2: string }
    expect(m1.p1).toBe("a")
    near(at(r, m1.p2).x, -4); near(at(r, m1.p2).y, 0)
    // Points on the axis are reused: only b and c get mirror points.
    expect(r.entities.filter((e) => e.kind === "point").length).toBe(4 + 2)
    expect(r.constraints.filter((c) => c.type === "symmetric").length).toBe(2)
  })
  test("arcs keep their counter-clockwise order; circles get equalRadius; the solver accepts the result", () => {
    const s: Sketch = {
      entities: [pt("o", 5, 0), pt("s", 6, 0), pt("e", 5, 1), { id: "arc", kind: "arc", center: "o", start: "s", end: "e" }, { id: "k", kind: "circle", center: "o", radius: 2 }, pt("u", 0, -1), pt("v", 0, 1), line("axis", "u", "v")],
      constraints: [{ type: "fixed", point: "u" }, { type: "fixed", point: "v" }]
    }
    const r = mirrorEntities(s, ["arc", "k"], "axis") as Sketch
    const arc = r.entities.find((e) => e.kind === "arc" && e.id !== "arc") as { center: string; start: string; end: string }
    // The mirrored start is the image of the original END (swapped, so the arc still runs counter-clockwise).
    near(at(r, arc.start).x, -5); near(at(r, arc.start).y, 1)
    near(at(r, arc.end).x, -6); near(at(r, arc.end).y, 0)
    expect(r.constraints.some((c) => c.type === "equalRadius")).toBe(true)
    const solved = solveSketchSystem(r)
    expect(solved.status === "failed" || solved.status === "conflicting").toBe(false)
  })
  test("axis must be a line and cannot be mirrored", () => {
    expect(typeof mirrorEntities(half, ["l1"], "a")).toBe("string")
    expect(typeof mirrorEntities(half, ["axis"], "axis")).toBe("string")
  })
})

describe("pattern", () => {
  test("linear: count instances at a fixed step", () => {
    const s: Sketch = { entities: [pt("o", 0, 0), { id: "k", kind: "circle", center: "o", radius: 1 }], constraints: [] }
    const r = patternEntities(s, ["k"], { kind: "linear", dx: 5, dy: 2, count: 4 }) as Sketch
    const circles = r.entities.filter((e) => e.kind === "circle") as Array<{ center: string; radius: number }>
    expect(circles.length).toBe(4)
    expect(circles.map((c) => at(r, c.center).x).sort((x, y) => x - y)).toEqual([0, 5, 10, 15])
    expect(new Set(r.entities.map((e) => e.id)).size).toBe(r.entities.length)
  })
  test("circular full turn spaces evenly; part turn ends at the angle", () => {
    const s: Sketch = { entities: [pt("o", 10, 0), { id: "k", kind: "circle", center: "o", radius: 1 }], constraints: [] }
    const full = patternEntities(s, ["k"], { kind: "circular", center: { x: 0, y: 0 }, angle: Math.PI * 2, count: 4 }) as Sketch
    const cs = (full.entities.filter((e) => e.kind === "circle") as Array<{ center: string }>).map((c) => at(full, c.center))
    expect(cs.length).toBe(4)
    near(cs[1]!.x, 0, 1e-9); near(cs[1]!.y, 10, 1e-9); near(cs[2]!.x, -10, 1e-9)
    const part = patternEntities(s, ["k"], { kind: "circular", center: { x: 0, y: 0 }, angle: Math.PI / 2, count: 3 }) as Sketch
    const last = at(part, (part.entities.filter((e) => e.kind === "circle").pop() as { center: string }).center)
    near(last.x, 0, 1e-9); near(last.y, 10, 1e-9)
  })
  test("lines keep their lengths; ellipse rotation follows; bad counts refused", () => {
    const s: Sketch = { entities: [pt("a", 1, 0), pt("b", 3, 0), line("l", "a", "b"), pt("e", 6, 0), { id: "el", kind: "ellipse", center: "e", radiusX: 2, radiusY: 1 }], constraints: [] }
    const r = patternEntities(s, ["l", "el"], { kind: "circular", center: { x: 0, y: 0 }, angle: Math.PI / 2, count: 2 }) as Sketch
    const l2 = r.entities.find((e) => e.kind === "line" && e.id !== "l") as { p1: string; p2: string }
    near(Math.hypot(at(r, l2.p2).x - at(r, l2.p1).x, at(r, l2.p2).y - at(r, l2.p1).y), 2)
    const el2 = r.entities.find((e) => e.kind === "ellipse" && e.id !== "el") as { rotation: number }
    near(el2.rotation, Math.PI / 2)
    expect(typeof patternEntities(s, ["l"], { kind: "linear", dx: 1, dy: 0, count: 1 })).toBe("string")
    expect(typeof patternEntities(s, ["l"], { kind: "linear", dx: 0, dy: 0, count: 3 })).toBe("string")
  })
})

describe("fillet", () => {
  test("a right-angle corner gets a tangent quarter arc; the corner point goes", () => {
    const r = filletCorner(rect, "l1", "l2", 2) as Sketch
    expect(typeof r).not.toBe("string")
    const arc = get(r, "fillet1", "arc"), c = at(r, arc.center)
    near(c.x, 8); near(c.y, 2)
    const l1 = get(r, "l1", "line"), l2 = get(r, "l2", "line")
    near(at(r, l1.p2).x, 8); near(at(r, l1.p2).y, 0)
    near(at(r, l2.p1).x, 10); near(at(r, l2.p1).y, 2)
    expect(r.entities.some((e) => e.id === "b")).toBe(false)
    // Counter-clockwise: from the point on l1 (below the centre) to the point on l2 (right of it).
    expect(at(r, arc.start).y).toBeLessThan(c.y)
    expect(at(r, arc.end).x).toBeGreaterThan(c.x)
    for (const p of [arc.start, arc.end]) near(Math.hypot(at(r, p).x - c.x, at(r, p).y - c.y), 2)
  })
  test("an acute corner: tangent length r / tan(theta / 2), tangent to both lines", () => {
    const s: Sketch = { entities: [pt("c", 0, 0), pt("p", 10, 0), pt("q", 10 * Math.cos(Math.PI / 3), 10 * Math.sin(Math.PI / 3)), line("u", "c", "p"), line("v", "c", "q")], constraints: [] }
    const r = filletCorner(s, "u", "v", 1) as Sketch
    const arc = get(r, "fillet1", "arc"), c = at(r, arc.center)
    near(Math.abs(c.y), 1)
    near(Math.abs(c.y * Math.cos(Math.PI / 3) - c.x * Math.sin(Math.PI / 3)), 1)
    near(at(r, get(r, "u", "line").p1).x, 1 / Math.tan(Math.PI / 6), 1e-9)
  })
  test("keeps a corner point other geometry still uses; refuses short lines, parallel lines, unshared corners", () => {
    const withDot: Sketch = { ...rect, entities: [...rect.entities, { id: "k", kind: "circle", center: "b", radius: 1 }] }
    expect((filletCorner(withDot, "l1", "l2", 2) as Sketch).entities.some((e) => e.id === "b")).toBe(true)
    expect(filletCorner(rect, "l1", "l2", 7)).toContain("tangent length")
    expect(typeof filletCorner(rect, "l1", "l3", 1)).toBe("string")
    const straight: Sketch = { entities: [pt("a", 0, 0), pt("b", 5, 0), pt("c", 10, 0), line("x", "a", "b"), line("y", "b", "c")], constraints: [] }
    expect(filletCorner(straight, "x", "y", 1)).toContain("parallel")
  })
})
