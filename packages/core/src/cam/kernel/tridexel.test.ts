import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { PartDexels, TriDexel, comparePart, toolSolid } from "./tridexel.ts"

setDefaultTimeout(60_000)

const flat = (d: number, flute = 20): Cutter => ({ id: `f${d}`, name: `flat ${d}`, kind: "flat", diameter: d, flutes: 3, material: "carbide", coating: "none", fluteLength: flute, shankDiameter: d, stickout: flute + 10 })
const ball = (d: number): Cutter => ({ id: `b${d}`, name: `ball ${d}`, kind: "ball", diameter: d, flutes: 2, material: "carbide", coating: "none", fluteLength: d * 2, shankDiameter: d, stickout: d * 3 })

const boxMesh = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh64 => {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(i) }
}
const sphereMesh = (cx: number, cy: number, cz: number, r: number, n = 48): Mesh64 => {
  const p: number[] = [], ix: number[] = []
  for (let a = 0; a <= n; a++) for (let b = 0; b < 2 * n; b++) {
    const th = (Math.PI * a) / n, ph = (Math.PI * b) / n
    p.push(cx + r * Math.sin(th) * Math.cos(ph), cy + r * Math.sin(th) * Math.sin(ph), cz + r * Math.cos(th))
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < 2 * n; b++) {
    const b1 = (b + 1) % (2 * n)
    const v00 = a * 2 * n + b, v01 = a * 2 * n + b1, v10 = (a + 1) * 2 * n + b, v11 = (a + 1) * 2 * n + b1
    if (a > 0) ix.push(v00, v10, v01)
    if (a < n - 1) ix.push(v01, v10, v11)
  }
  return { positions: Float64Array.from(p), indices: Uint32Array.from(ix) }
}
const meshVolume = (m: Mesh64): number => {
  let v = 0
  const P = m.positions
  for (let f = 0; f < m.indices.length; f += 3) {
    const a = m.indices[f]! * 3, b = m.indices[f + 1]! * 3, c = m.indices[f + 2]! * 3
    v += (P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!)) / 6
  }
  return Math.abs(v)
}

describe("tri-dexel stock: volume and the declared bound", () => {
  test("a box has its closed-form volume in every direction, also when the extent is not a multiple of the cell", () => {
    const s = TriDexel.box({ x: 0, y: 0, z: 0 }, { x: 20.3, y: 10.1, z: 5.7 }, 0.5)
    const v = 20.3 * 10.1 * 5.7
    for (const a of [0, 1, 2] as const) expect(s.volume(a)).toBeCloseTo(v, 2)
    expect(s.errorBound).toBe(0.5)
  })

  test("a vertical plunge of a flat mill removes a cylinder: volume within the declared bound times the cavity surface", () => {
    const s = TriDexel.box({ x: -15, y: -15, z: 0 }, { x: 15, y: 15, z: 10 }, 0.25)
    const before = s.volume()
    s.cut(toolSolid(flat(6)), { x: 0, y: 0, z: 5 })
    const removed = before - s.volume()
    const expected = Math.PI * 9 * 5
    const surface = 2 * Math.PI * 3 * 5 + Math.PI * 9
    expect(Math.abs(removed - expected)).toBeLessThanOrEqual(s.errorBound * surface)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
    // The other two directions see the same cavity.
    expect(Math.abs(before - s.volume(0) - expected) / expected).toBeLessThan(0.03)
    expect(Math.abs(before - s.volume(1) - expected) / expected).toBeLessThan(0.03)
  })

  test("a tilted flat mill (30 degrees) removes the oblique cylinder: V = pi R^2 times the axis length to the top plane", () => {
    const s = TriDexel.box({ x: -20, y: -20, z: -5 }, { x: 20, y: 20, z: 10 }, 0.2)
    const before = s.volume()
    const th = (30 * Math.PI) / 180
    s.cut(toolSolid(flat(6, 40)), { x: 0, y: 0, z: 0 }, { x: 0, y: Math.sin(th), z: Math.cos(th) })
    const removed = before - s.volume()
    const expected = Math.PI * 9 * (10 / Math.cos(th))
    const surface = 2 * Math.PI * 3 * (10 / Math.cos(th)) + 2 * Math.PI * 9
    expect(Math.abs(removed - expected)).toBeLessThanOrEqual(s.errorBound * surface)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
  })

  test("a ball resting with its centre on the top face cuts a hemisphere: volume and the surface within one cell", () => {
    const cell = 0.2
    const s = TriDexel.box({ x: -12, y: -12, z: 0 }, { x: 12, y: 12, z: 10 }, cell)
    const before = s.volume()
    s.cut(toolSolid(ball(10)), { x: 0, y: 0, z: 5 })
    const removed = before - s.volume()
    const expected = (2 / 3) * Math.PI * 125
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
    // Points one and a half cells inside the sphere are gone, outside it they remain.
    for (const [ax, ay] of [[0, 0], [3, 0], [0, -3.5], [2.5, 2.5], [-4, 1]] as const) {
      const r = Math.hypot(ax, ay)
      const zIn = 10 - Math.sqrt(Math.max(0, 25 - r * r)) + 1.5 * cell
      const zOut = 10 - Math.sqrt(Math.max(0, 25 - r * r)) - 1.5 * cell
      expect(s.has({ x: ax, y: ay, z: zIn })).toBe(false)
      expect(s.has({ x: ax, y: ay, z: zOut })).toBe(true)
    }
  })

  test("a straight slot: length times width plus the end cap, the sweep sagitta is declared", () => {
    const s = TriDexel.box({ x: -25, y: -10, z: 0 }, { x: 25, y: 10, z: 10 }, 0.2)
    const before = s.volume()
    const tool = toolSolid(flat(6))
    s.removePath(tool, [{ x: -20, y: 0, z: 6 }, { x: 20, y: 0, z: 6 }])
    const removed = before - s.volume()
    const expected = (40 * 6 + Math.PI * 9) * 4
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
    expect(s.sagitta).toBeGreaterThan(0)
    expect(s.sagitta).toBeLessThanOrEqual(0.2 / 4 + 1e-9)
    expect(s.errorBound).toBeCloseTo(0.2 + s.sagitta, 9)
  })

  test("a surface-seeded stock holds the volume under the surface", () => {
    const s = TriDexel.fromTop({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 10 }, 0.25, (x) => 4 + x / 5)
    // Volume under z = 4 + x/5 over [0,20]^2: 20 * (4*20 + 20^2/10) = 2400.
    expect(s.volume(2)).toBeCloseTo(2400, 0)
    expect(Math.abs(s.volume(0) - 2400) / 2400).toBeLessThan(0.02)
    expect(Math.abs(s.volume(1) - 2400) / 2400).toBeLessThan(0.02)
  })
})

describe("the part cast into rays and the comparison", () => {
  test("a sphere mesh is cast with its own volume and no open rays", () => {
    const m = sphereMesh(0, 0, 0, 8)
    const part = PartDexels.fromMeshes([m], { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 }, 0.2)
    expect(part.openRays).toBe(0)
    for (const a of [0, 1, 2] as const) expect(Math.abs(part.volume(a) - meshVolume(m)) / meshVolume(m)).toBeLessThan(0.01)
  })

  test("a stock bigger than the part leaves material measured along the surface normal; the allowance is taken off", () => {
    const part = PartDexels.fromMeshes([boxMesh(0, 0, 0, 20, 20, 10)], { x: -2, y: -2, z: 0 }, { x: 22, y: 22, z: 12 }, 0.5)
    const stock = TriDexel.box({ x: -2, y: -2, z: 0 }, { x: 22, y: 22, z: 12 }, 0.5)
    const c = comparePart(stock, part)
    expect(c.gouge.depth).toBe(0)
    expect(c.left.depth).toBeCloseTo(2, 1)
    const allowed = comparePart(stock, part, { allowance: 2.1 })
    expect(allowed.left.volume).toBe(0)
    const half = comparePart(stock, part, { allowance: 1 })
    expect(half.left.depth).toBeCloseTo(1, 1)
  })

  test("a cut into the part is a gouge of the depth below its surface, and nothing else is", () => {
    const part = PartDexels.fromMeshes([boxMesh(0, 0, 0, 20, 20, 10)], { x: -2, y: -2, z: 0 }, { x: 22, y: 22, z: 12 }, 0.25)
    const stock = TriDexel.box({ x: -2, y: -2, z: 0 }, { x: 22, y: 22, z: 12 }, 0.25)
    // Clear the margin (what a roughing leaves), then plunge 2 mm into the part.
    stock.cut(toolSolid(flat(80, 20)), { x: 10, y: 10, z: 10 })
    expect(comparePart(stock, part).gouge.depth).toBe(0)
    stock.cut(toolSolid(flat(6)), { x: 10, y: 10, z: 8 })
    const c = comparePart(stock, part, { threshold: 0.05 })
    expect(c.gouge.depth).toBeCloseTo(2, 1)
    expect(Math.abs(c.gouge.volume - Math.PI * 9 * 2) / (Math.PI * 9 * 2)).toBeLessThan(0.05)
    expect(c.gouge.at!.z).toBeGreaterThan(8)
    // The 2 mm ring of stock around the part is still there; the plunge did not create leftover.
    expect(c.left.depth).toBeCloseTo(2, 1)
  })

  test("a ball finish of a sphere leaves the cusp bound it is run at: no gouge beyond the declared error", () => {
    const R = 8
    const m = sphereMesh(0, 0, 0, R)
    const cell = 0.2
    const min = { x: -12, y: -12, z: 0 }, max = { x: 12, y: 12, z: 12 }
    const part = PartDexels.fromMeshes([m], { x: -12, y: -12, z: -9 }, { x: 12, y: 12, z: 12 }, cell)
    const stock = TriDexel.box({ x: -12, y: -12, z: -9 }, { x: 12, y: 12, z: 12 }, cell)
    void min; void max
    // Hemisphere above z = 0 is the part (the lower half is below): a ball of radius 3 rolls over it along rings.
    const tool = toolSolid(ball(6))
    const rc = R + 3
    for (let ring = 0; ring <= 12; ring++) {
      const lat = (ring / 12) * (Math.PI / 2)
      const tips: Array<{ x: number; y: number; z: number }> = []
      for (let k = 0; k <= 180; k++) {
        const a = (2 * Math.PI * k) / 180
        // Ball centre on the offset sphere of radius R + 3; the tip is 3 below the centre.
        tips.push({ x: rc * Math.cos(lat) * Math.cos(a), y: rc * Math.cos(lat) * Math.sin(a), z: rc * Math.sin(lat) - 3 })
      }
      stock.removePath(tool, tips)
    }
    const c = comparePart(stock, part, { threshold: 0 })
    // The ball never cuts into the sphere: the gouge is under the lattice error of the stock.
    expect(c.gouge.depth).toBeLessThanOrEqual(stock.errorBound)
  })

  test("overlapping solids are cast as their union: two blocks that share a slab are one 1500 mm³ part, not three pieces", () => {
    const min = { x: -1, y: -1, z: -1 }, max = { x: 16, y: 11, z: 11 }
    const part = PartDexels.fromMeshes([boxMesh(0, 0, 0, 10, 10, 10), boxMesh(5, 0, 0, 15, 10, 10)], min, max, 0.25)
    for (const axis of [0, 1, 2] as const) expect(part.volume(axis)).toBeCloseTo(1500, -1)
    expect(part.openRays).toBe(0)
    // A stock shaped like the union compares clean: nothing lost, nothing left.
    const stock = TriDexel.fromPart(part)
    const c = comparePart(stock, part, { threshold: 0.01 })
    expect(c.gouge.volume).toBe(0)
    expect(c.left.volume).toBe(0)
  })

  test("a wall cut 0.2 mm deep through a 10 mm block reads 0.2 mm, not the wall's height or length", () => {
    const part = PartDexels.fromMeshes([boxMesh(0, 0, 0, 20, 20, 10)], { x: -3, y: -3, z: 0 }, { x: 23, y: 23, z: 10 }, 0.1)
    const stock = TriDexel.fromPart(part)
    // The strip y in [0, 0.2] over the whole block height and length is taken out by a flat tool standing 2.8 mm from the wall.
    stock.removePath(toolSolid(flat(6, 20)), [{ x: -2.8, y: -2.8, z: -1 }, { x: 22.8, y: -2.8, z: -1 }])
    const c = comparePart(stock, part, { threshold: 0.01 })
    expect(c.gouge.depth).toBeGreaterThan(0.15)
    expect(c.gouge.depth).toBeLessThan(0.3)
  })
})

describe("probing the shank and holder against the stock", () => {
  test("a probe of the shank overlaps by the depth it sinks into material and by nothing in the air", () => {
    const s = TriDexel.box({ x: -20, y: -20, z: 0 }, { x: 20, y: 20, z: 10 }, 0.25)
    const cutter: Cutter = { ...flat(6, 10), stickout: 30 }
    const shank = toolSolid(cutter, ["shank"])
    // The shank spans 10..30 above the tip: with the tip at z = -5 it covers z 5..25, so it sinks 5 mm into the stock (top at z = 10).
    const hit = s.probe(shank, { x: 0, y: 0, z: -5 })
    expect(hit.overlap).toBeCloseTo(5, 0)
    expect(hit.at).toBeDefined()
    const air = s.probe(shank, { x: 0, y: 0, z: 10 })
    expect(air.overlap).toBe(0)
  })
})
