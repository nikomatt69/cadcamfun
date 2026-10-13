import { describe, expect, test } from "bun:test"
import { signedArea } from "./shapes.ts"
import { triangulatePolygon, triangulatePolygonChecked, triangulateRing } from "./triangulate.ts"
import type { Vec2 } from "./vec.ts"

const square = (x: number, y: number, s: number): Vec2[] => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
const circle = (cx: number, cy: number, r: number, n: number): Vec2[] => Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }))
const cw = (ring: Vec2[]): Vec2[] => [...ring].reverse()

/** Signed area of every triangle over the concatenated rings, and their sum. */
const measure = (rings: Vec2[][], tris: ReadonlyArray<readonly [number, number, number]>) => {
  const all = rings.flat()
  const areas = tris.map(([a, b, c]) => {
    const p = all[a]!, q = all[b]!, r = all[c]!
    return ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / 2
  })
  return { areas, total: areas.reduce((s, v) => s + Math.abs(v), 0), used: new Set(tris.flat()) }
}

describe("triangulation of polygons with holes", () => {
  test("a square with a square hole: 8 triangles that cover the ring between them, all turning the outer ring's way", () => {
    const outer = square(0, 0, 10), hole = cw(square(3, 3, 4))
    const tris = triangulatePolygon(outer, [hole])
    const m = measure([outer, hole], tris)
    expect(tris).toHaveLength(8)
    expect(m.total).toBeCloseTo(100 - 16, 9)
    expect(m.areas.every((a) => a > 0)).toBe(true)
    expect(m.used.size).toBe(8)
  })

  test("holes may come in either orientation, and a clockwise outer ring gives clockwise triangles", () => {
    const outer = square(0, 0, 10)
    const ccwHole = square(2, 2, 2), cwHole = cw(square(6, 6, 2))
    const m = measure([outer, ccwHole, cwHole], triangulatePolygon(outer, [ccwHole, cwHole]))
    expect(m.total).toBeCloseTo(100 - 8, 9)
    const flipped = measure([cw(outer)], triangulatePolygon(cw(outer)))
    expect(flipped.areas.every((a) => a < 0)).toBe(true)
  })

  test("a plate face with forty round holes (a thousand vertices) is covered exactly and quickly", () => {
    const outer = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]
    const holes: Vec2[][] = []
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) holes.push(cw(circle(15 + i * 24, 15 + j * 18, 4, 24)))
    const t = performance.now()
    const tris = triangulatePolygon(outer, holes)
    const elapsed = performance.now() - t
    const m = measure([outer, ...holes], tris)
    const holeArea = holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
    expect(m.total).toBeCloseTo(20000 - holeArea, 6)
    // n vertices and h holes: n + 2 h - 2 triangles.
    expect(tris).toHaveLength(4 + 40 * 24 + 2 * 40 - 2)
    expect(m.used.size).toBe(4 + 40 * 24)
    expect(elapsed).toBeLessThan(2000)
  })

  test("a concave comb and a star of 2 000 points: n - 2 triangles, the exact area, every vertex used", () => {
    const comb: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    for (let k = 10; k >= 0; k--) comb.push({ x: k * 10, y: 30 }, { x: k * 10, y: 10 }, { x: Math.max(0, k * 10 - 5), y: 10 }, { x: Math.max(0, k * 10 - 5), y: 30 })
    const clean = comb.filter((p, i) => i === 0 || p.x !== comb[i - 1]!.x || p.y !== comb[i - 1]!.y)
    const c = triangulateRing(clean)
    expect(measure([clean], c).total).toBeCloseTo(Math.abs(signedArea(clean)), 9)
    const star = Array.from({ length: 2000 }, (_, k) => {
      const a = (2 * Math.PI * k) / 2000, r = k % 2 === 0 ? 50 : 30
      return { x: r * Math.cos(a), y: r * Math.sin(a) }
    })
    const t = performance.now()
    const s = triangulateRing(star)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(s).toHaveLength(1998)
    expect(measure([star], s).total).toBeCloseTo(Math.abs(signedArea(star)), 6)
  })

  test("vertices on a straight edge are kept, so a cap shares them with the side walls", () => {
    const ring = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 0, y: 10 }]
    const tris = triangulateRing(ring)
    expect(tris).toHaveLength(4)
    expect(new Set(tris.flat()).size).toBe(6)
    expect(measure([ring], tris).areas.every((a) => a > 0)).toBe(true)
  })

  test("a ring that crosses itself is refused, not covered wrongly; the checked form says so with undefined", () => {
    const bow = [{ x: 0, y: 0 }, { x: 10, y: 6 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    expect(() => triangulateRing(bow)).toThrow(RangeError)
    expect(() => triangulateRing([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toThrow(/nonzero/)
    expect(triangulatePolygonChecked(square(0, 0, 10), [cw(square(8, 8, 5))])).toBeUndefined()
    expect(triangulatePolygonChecked(square(0, 0, 10), [cw(square(2, 2, 5))])).toHaveLength(8)
  })
})
