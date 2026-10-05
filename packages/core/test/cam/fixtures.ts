/** Shared fixtures for the CAM tests. */
import type { Vec2 } from "../../src/cad/vec.ts"
import type { Stock, Tool } from "../../src/cam/tool.ts"

export const tool6: Tool = { id: "1", name: "6 mm endmill", kind: "endmill", diameter: 6, flutes: 2, maxRpm: 20000 }
export const tool3: Tool = { id: "2", name: "3 mm endmill", kind: "endmill", diameter: 3, flutes: 2, maxRpm: 24000 }
export const drill5: Tool = { id: "3", name: "5 mm drill", kind: "drill", diameter: 5, flutes: 2, maxRpm: 8000 }

export const stock100: Stock = { x: 100, y: 100, z: 20, origin: { x: 0, y: 0, z: 0 }, material: "aluminium 6061" }

/** 40 x 40 square, counter-clockwise, lower-left at (20, 20). */
export const square40: Vec2[] = [
  { x: 20, y: 20 },
  { x: 60, y: 20 },
  { x: 60, y: 60 },
  { x: 20, y: 60 }
]

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random simple (star-shaped) polygon around `(cx, cy)`, counter-clockwise. */
export const randomStar = (rng: () => number, cx: number, cy: number, rMin: number, rMax: number): Vec2[] => {
  const n = 5 + Math.floor(rng() * 8)
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.15 + 0.7 * rng()) * 2 * Math.PI) / n
    const r = rMin + (rMax - rMin) * rng()
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

/** Distance between two segments (exact for non-crossing segments, 0 when they cross). */
export const segSegDistance = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): number => {
  const cross = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b))
}

export const pointSeg = (p: Vec2, a: Vec2, b: Vec2): number => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}
