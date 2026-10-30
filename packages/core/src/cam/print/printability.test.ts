import { describe, expect, test } from "bun:test"
import { printBodies } from "./bodies.ts"
import { analysePrintability, bridgeSpans, distanceSquared, overhangMap, rankOrientations, rotationDown, thinCells, thinWalls } from "./printability.ts"
import { sliceMesh } from "./slice.ts"
import type { Mesh64 } from "../model/element-mesh.ts"

const cube = (id: string, x: number, y: number, z: number, width: number, height: number, depth: number) => ({ id, type: "cube", x, y, z, width, height, depth })
const solid = (...elements: Array<Record<string, unknown>>): Mesh64 => {
  const bodies = printBodies(elements as never)
  expect(bodies.errors).toEqual([])
  expect(bodies.meshes).toHaveLength(1)
  return bodies.meshes[0]!
}

/** A T: a 10 x 10 x 20 stem with a 40 x 10 x 5 head, so two arms of 15 x 10 hang over air at z = 20. */
const tee = () => solid(cube("stem", 0, 0, 10.5, 10, 10, 21), cube("head", 0, 0, 22.5, 40, 10, 5))

const sphere = (nu: number, nv: number, r: number): Mesh64 => {
  const pos: number[] = [0, 0, -r]
  for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
    const phi = (Math.PI * j) / nv, th = (2 * Math.PI * i) / nu
    pos.push(r * Math.sin(phi) * Math.cos(th), r * Math.sin(phi) * Math.sin(th), -r * Math.cos(phi))
  }
  pos.push(0, 0, r)
  const ring = (j: number, i: number) => 1 + (j - 1) * nu + (i % nu)
  const idx: number[] = []
  for (let i = 0; i < nu; i++) idx.push(0, ring(1, i + 1), ring(1, i))
  for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++) {
    const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1)
    idx.push(a, b, d, a, d, c)
  }
  const top = 1 + (nv - 1) * nu
  for (let i = 0; i < nu; i++) idx.push(top, ring(nv - 1, i), ring(nv - 1, i + 1))
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }
}

describe("distance transform and thin cells", () => {
  test("the squared distance equals the brute-force nearest background cell", () => {
    let seed = 7
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    const nx = 23, ny = 17
    const mask = new Uint8Array(nx * ny)
    for (let i = 0; i < mask.length; i++) mask[i] = rnd() < 0.8 ? 1 : 0
    mask[0] = 0
    const d = distanceSquared(mask, nx, ny)
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      let best = Infinity
      for (let v = 0; v < ny; v++) for (let u = 0; u < nx; u++) if (!mask[v * nx + u]) best = Math.min(best, (u - x) ** 2 + (v - y) ** 2)
      expect(d[y * nx + x]).toBe(mask[y * nx + x] ? best : 0)
    }
  })

  test("a strip narrower than the wall is thin and one wider is not", () => {
    const nx = 60, ny = 30
    const strip = (w: number) => { const m = new Uint8Array(nx * ny); for (let y = 10; y < 10 + w; y++) for (let x = 5; x < 55; x++) m[y * nx + x] = 1; return m }
    const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0)
    expect(count(thinCells(strip(5), nx, ny, 3))).toBe(5 * 50)
    expect(count(thinCells(strip(8), nx, ny, 3))).toBe(0)
    // A fat block with a fin standing on it: the fin is reported (from the root plus the corner allowance), the block is not.
    const nyBig = 60
    const m = new Uint8Array(nx * nyBig)
    for (let y = 10; y < 20; y++) for (let x = 5; x < 55; x++) m[y * nx + x] = 1
    for (let y = 20; y < 40; y++) for (let x = 29; x < 31; x++) m[y * nx + x] = 1
    const thin = thinCells(m, nx, nyBig, 3)
    for (let y = 10; y < 20; y++) for (let x = 5; x < 55; x++) expect(thin[y * nx + x]).toBe(0)
    for (let y = 25; y < 40; y++) for (let x = 29; x < 31; x++) expect(thin[y * nx + x]).toBe(1)
    expect(count(thin)).toBeGreaterThan(2 * 15)
    expect(count(thin)).toBeLessThanOrEqual(2 * 20)
  })
})

describe("overhang map", () => {
  test("a cube has no overhang and its floor is contact", () => {
    const r = overhangMap([solid(cube("c", 0, 0, 5, 20, 20, 10))])
    expect(r.area).toBe(0)
    expect(r.contactArea).toBeCloseTo(400, 6)
    expect(r.surfaceArea).toBeCloseTo(2 * 400 + 4 * 200, 6)
    expect(r.height).toBeCloseTo(10, 9)
  })

  test("the T hangs 2 x 15 x 10 mm2 of flat ceiling in the air, with the support volume to the plate as its bound", () => {
    const r = overhangMap([tee()])
    expect(r.area).toBeCloseTo(300, 6)
    expect(r.maxAngle).toBeCloseTo(90, 6)
    expect(r.bands[5]!.area).toBeCloseTo(300, 6)
    expect(r.contactArea).toBeCloseTo(100, 6)
    expect(r.supportVolumeBound).toBeCloseTo(300 * 20, 3)
    expect(r.share).toBeCloseTo(300 / r.surfaceArea, 9)
  })

  test("a sphere overhangs where the normal is further than 45 degrees from vertical: the polar cap of 2 pi r2 (1 - cos 45)", () => {
    const r = overhangMap([sphere(120, 80, 10)])
    const cap = 2 * Math.PI * 100 * (1 - Math.cos(Math.PI / 4))
    expect(Math.abs(r.area + r.contactArea - cap) / cap).toBeLessThan(0.02)
    // The angle of the bands is what the geometry says: nothing is steeper than 90.
    expect(r.maxAngle).toBeLessThanOrEqual(90)
  })

  test("an inside-out mesh gives the same map", () => {
    const m = tee()
    const inside: Mesh64 = { positions: m.positions, indices: Uint32Array.from(Array.from(m.indices).map((_, i, a) => a[i % 3 === 0 ? i : i % 3 === 1 ? i + 1 : i - 1]!)) }
    expect(overhangMap([inside]).area).toBeCloseTo(300, 6)
  })
})

describe("thin walls and bridges from the layers", () => {
  const layers = (mesh: Mesh64, height: number, step = 0.2) => {
    const zs = Array.from({ length: Math.floor(height / step) }, (_, i) => (i + 0.5) * step)
    return { zs, regions: sliceMesh(mesh, zs).regions }
  }

  test("a 0.5 mm fin is thin for a 0.8 mm wall, a 2 mm fin is not", () => {
    const thinPart = solid(cube("base", 0, 0, 2.5, 30, 30, 5), cube("fin", 0, 0, 9.5, 20, 0.5, 11))
    const a = layers(thinPart, 15)
    const r = thinWalls(a.regions, a.zs, { minWall: 0.8, sampleLayers: 100 })
    expect(r.worstArea).toBeGreaterThan(0.85 * 20 * 0.5)
    expect(r.worstArea).toBeLessThan(1.15 * 20 * 0.5)
    expect(r.worstLayer!.z).toBeGreaterThan(5)
    expect(Math.abs(r.worstLayer!.x)).toBeLessThan(2)
    const fat = solid(cube("base", 0, 0, 2.5, 30, 30, 5), cube("fin", 0, 0, 9.5, 20, 2, 11))
    const b = layers(fat, 15)
    expect(thinWalls(b.regions, b.zs, { minWall: 0.8, sampleLayers: 100 }).worstArea).toBe(0)
  })

  test("a roof between two pillars is a 20 mm bridge; over the limit it needs support", () => {
    const part = solid(cube("l", -15, 0, 10.5, 10, 10, 21), cube("r", 15, 0, 10.5, 10, 10, 21), cube("roof", 0, 0, 22, 40, 10, 4))
    const a = layers(part, 24)
    const r = bridgeSpans(a.regions, a.zs, { sampleLayers: 1000, maxBridge: 40 })
    expect(r.bridges).toBeGreaterThanOrEqual(1)
    expect(r.cantilevers).toBe(0)
    expect(r.longestSpan).toBeGreaterThan(19)
    expect(r.longestSpan).toBeLessThan(21)
    expect(r.needSupport).toBe(0)
    expect(r.findings[0]!.direction).toBe("x")
    expect(bridgeSpans(a.regions, a.zs, { sampleLayers: 1000, maxBridge: 15 }).needSupport).toBeGreaterThanOrEqual(1)
  })

  test("the arms of the T are cantilevers: anchored on one side only", () => {
    const part = tee()
    const a = layers(part, 25)
    const r = bridgeSpans(a.regions, a.zs, { sampleLayers: 1000 })
    expect(r.cantilevers).toBe(2)
    expect(r.bridges).toBe(0)
    expect(r.needSupport).toBe(2)
  })

  test("the combined report names what is wrong, with numbers", () => {
    const r = analysePrintability([tee()], { minWall: 0.8, sampleLayers: 200 })
    expect(r.overhang.area).toBeCloseTo(300, 3)
    expect(r.bridges.cantilevers).toBe(2)
    expect(r.thin.worstArea).toBe(0)
    expect(r.verdict.join(" ")).toContain("overhangs more than 45 degrees")
    expect(r.verdict.join(" ")).toContain("cannot be bridged")
  })
})

describe("orientation ranking", () => {
  test("a rotation about any direction turns it onto -Z and is a proper rotation", () => {
    let seed = 3
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5 }
    for (let i = 0; i < 50; i++) {
      const raw = [rnd(), rnd(), rnd()]
      const len = Math.hypot(...raw)
      const d = [raw[0]! / len, raw[1]! / len, raw[2]! / len] as const
      const m = rotationDown(d)
      expect(m[0] * d[0] + m[1] * d[1] + m[2] * d[2]).toBeCloseTo(0, 9)
      expect(m[3] * d[0] + m[4] * d[1] + m[5] * d[2]).toBeCloseTo(0, 9)
      expect(m[6] * d[0] + m[7] * d[1] + m[8] * d[2]).toBeCloseTo(-1, 9)
      const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
      expect(det).toBeCloseTo(1, 9)
    }
    expect(rotationDown([0, 0, 1])).toEqual([1, 0, 0, 0, -1, 0, 0, 0, -1])
  })

  test("the T is turned off its stem: no overhang at all, at least the head on the plate, no taller than as designed", () => {
    const r = rankOrientations([tee()])
    expect(r.designed.overhangArea).toBeCloseTo(300, 3)
    expect(r.chosen.overhangArea).toBeCloseTo(0, 6)
    expect(r.chosen.down[2]).not.toBeCloseTo(-1, 3)
    expect(r.chosen.contactArea).toBeGreaterThanOrEqual(399)
    expect(r.chosen.height).toBeLessThanOrEqual(r.designed.height)
    expect(r.chosen.score).toBeLessThan(r.designed.score)
    expect(r.ranked[0]).toBe(r.best)
  })

  test("a cube is already best as designed", () => {
    const r = rankOrientations([solid(cube("c", 0, 0, 5, 20, 20, 10))])
    expect(r.chosen).toBe(r.designed)
    expect(r.designed.overhangArea).toBe(0)
  })

  test("a cube tilted off the plate is stood back on a flat face, found among the arbitrary directions", () => {
    const c = solid(cube("c", 0, 0, 0, 20, 20, 20))
    const t = 0.5, s = Math.sin(t), k = Math.cos(t)
    const p = Float64Array.from(c.positions)
    for (let i = 0; i < p.length; i += 3) { const y = p[i + 1]!, z = p[i + 2]!; p[i + 1] = y * k - z * s; p[i + 2] = y * s + z * k }
    const tilted: Mesh64 = { positions: p, indices: c.indices }
    const r = rankOrientations([tilted])
    expect(r.designed.overhangArea).toBeGreaterThan(100)
    expect(r.chosen.overhangArea).toBeCloseTo(0, 3)
    expect(r.chosen.contactArea).toBeCloseTo(400, 2)
    expect(r.chosen.height).toBeCloseTo(20, 6)
  })
})
