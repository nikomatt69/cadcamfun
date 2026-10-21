import { describe, expect, test } from "bun:test"
import { entityIntersections, extendLine, trimEntity } from "./sketch-edit.ts"
import type { Sketch, SketchEntity } from "./sketch.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)
const pos = (s: Sketch, id: string) => { const p = s.entities.find((e) => e.id === id)! as { x: number; y: number }; return p }
const lines = (s: Sketch) => s.entities.filter((e) => e.kind === "line")

// A cross: a horizontal line from (-10,0) to (10,0) and two verticals at x = -4 and x = 6.
const cross: Sketch = {
  entities: [pt("a", -10, 0), pt("b", 10, 0), pt("c", -4, -5), pt("d", -4, 5), pt("e", 6, -5), pt("f", 6, 5), line("h", "a", "b"), line("v1", "c", "d"), line("v2", "e", "f")],
  constraints: [{ type: "horizontal", line: "h" } as never]
}

describe("sketch intersections", () => {
  test("lines, a line and a circle, two circles", () => {
    const p = entityIntersections(cross, "h", "v1")
    expect(p.length).toBe(1)
    near(p[0]!.x, -4); near(p[0]!.y, 0)
    const s: Sketch = { entities: [pt("o", 0, 0), { id: "k", kind: "circle", center: "o", radius: 5 }, pt("p", -8, 3), pt("q", 8, 3), line("l", "p", "q"), pt("o2", 6, 0), { id: "k2", kind: "circle", center: "o2", radius: 5 }], constraints: [] }
    const lc = entityIntersections(s, "l", "k")
    expect(lc.map((x) => x.x).sort((u, v) => u - v).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([-4, 4])
    const cc = entityIntersections(s, "k", "k2")
    expect(cc.length).toBe(2)
    for (const q of cc) { near(Math.hypot(q.x, q.y), 5); near(Math.hypot(q.x - 6, q.y), 5) }
  })
  test("a crossing outside a segment is not reported", () => {
    const s: Sketch = { entities: [pt("a", 0, 0), pt("b", 2, 0), pt("c", 5, -1), pt("d", 5, 1), line("h", "a", "b"), line("v", "c", "d")], constraints: [] }
    expect(entityIntersections(s, "h", "v")).toEqual([])
  })
})

describe("trim", () => {
  test("the middle stretch of a line between two crossings goes: two lines remain", () => {
    const r = trimEntity(cross, "h", { x: 1, y: 0 })
    expect(typeof r).not.toBe("string")
    const s = r as Sketch
    const ls = lines(s).filter((l) => l.id.startsWith("h_")) as Array<{ p1: string; p2: string }>
    expect(ls.length).toBe(2)
    near(pos(s, ls[0]!.p1).x, -10); near(pos(s, ls[0]!.p2).x, -4)
    near(pos(s, ls[1]!.p1).x, 6); near(pos(s, ls[1]!.p2).x, 10)
    expect(s.entities.some((e) => e.id === "h")).toBe(false)
    expect(s.constraints.length).toBe(0)
  })
  test("an end stretch goes: one line remains, and the cut point sits on the crossing", () => {
    const s = trimEntity(cross, "h", { x: 8, y: 0 }) as Sketch
    const ls = lines(s).filter((l) => l.id.startsWith("h_")) as Array<{ p1: string; p2: string }>
    expect(ls.length).toBe(1)
    near(pos(s, ls[0]!.p2).x, 6)
  })
  test("a circle trimmed at two crossings becomes the arc that stays", () => {
    const s: Sketch = { entities: [pt("o", 0, 0), { id: "k", kind: "circle", center: "o", radius: 5 }, pt("p", -8, 3), pt("q", 8, 3), line("l", "p", "q")], constraints: [] }
    const r = trimEntity(s, "k", { x: 0, y: 5 }) as Sketch
    const arc = r.entities.find((e) => e.kind === "arc") as { start: string; end: string; center: string }
    expect(arc.center).toBe("o")
    // The top cap above y = 3 was removed: counter-clockwise from the left crossing, round the bottom, to the right crossing.
    near(pos(r, arc.start).x, -4); near(pos(r, arc.start).y, 3)
    near(pos(r, arc.end).x, 4); near(pos(r, arc.end).y, 3)
  })
  test("no crossing deletes the entity; a lone crossing on a circle is refused", () => {
    const lone: Sketch = { entities: [pt("a", 0, 0), pt("b", 1, 0), line("l", "a", "b")], constraints: [] }
    expect((trimEntity(lone, "l", { x: 0.5, y: 0 }) as Sketch).entities.some((e) => e.kind === "line")).toBe(false)
    expect(trimEntity({ entities: [pt("o", 0, 0), { id: "k", kind: "circle", center: "o", radius: 5 }, pt("p", 0, 0), pt("q", 0, 9), line("l", "p", "q")], constraints: [] }, "k", { x: 0, y: 5 })).toBe("a circle needs two crossings to trim")
  })
})

describe("extend", () => {
  test("a line runs on to the first line it meets and to a circle", () => {
    const s: Sketch = { entities: [pt("a", 0, 0), pt("b", 3, 0), line("h", "a", "b"), pt("c", 8, -4), pt("d", 8, 4), line("v", "c", "d"), pt("o", 12, 0), { id: "k", kind: "circle", center: "o", radius: 2 }], constraints: [] }
    const r = extendLine(s, "h", "p2", "v") as Sketch
    near(pos(r, "b").x, 8); near(pos(r, "b").y, 0)
    const r2 = extendLine(s, "h", "p2", "k") as Sketch
    near(pos(r2, "b").x, 10)
    expect(extendLine(s, "h", "p1", "v")).toBe("line 'h' does not reach 'v' when extended")
  })
})
