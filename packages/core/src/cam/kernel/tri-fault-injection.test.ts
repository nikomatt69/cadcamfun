import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { TriReplay } from "./tri-replay.ts"

setDefaultTimeout(240_000)

/**
 * Sensitivity of the replay (spec 72 step 0.4, spec 53 V2): overcuts are seeded into programs that are otherwise clean, and the
 * replay must name every one that is deeper than 1.5 times the threshold it declares (job tolerance + lattice error). The clean
 * fixtures must pass with no gouge. A deviation under the declared threshold is below what the lattice can tell from noise: it is
 * not claimed, and not asserted here. The generator is seeded, so the set is the same on every run.
 */

const mulberry32 = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const flat = (d: number): Cutter => ({ id: `f${d}`, name: `flat ${d}`, kind: "flat", diameter: d, flutes: 3, material: "carbide", coating: "none", fluteLength: 25, shankDiameter: d, stickout: 35 })
const ball = (d: number): Cutter => ({ id: `b${d}`, name: `ball ${d}`, kind: "ball", diameter: d, flutes: 2, material: "carbide", coating: "none", fluteLength: d * 2, shankDiameter: d, stickout: d * 3 })

const boxMesh = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh64 => {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(i) }
}
const sphereMesh = (r: number, n = 48): Mesh64 => {
  const p: number[] = [], ix: number[] = []
  for (let a = 0; a <= n; a++) for (let b = 0; b < 2 * n; b++) {
    const th = (Math.PI * a) / n, ph = (Math.PI * b) / n
    p.push(r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th))
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < 2 * n; b++) {
    const b1 = (b + 1) % (2 * n)
    const v00 = a * 2 * n + b, v01 = a * 2 * n + b1, v10 = (a + 1) * 2 * n + b, v11 = (a + 1) * 2 * n + b1
    if (a > 0) ix.push(v00, v10, v01)
    if (a < n - 1) ix.push(v01, v10, v11)
  }
  return { positions: Float64Array.from(p), indices: Uint32Array.from(ix) }
}

const TOLERANCE = 0.01
const CELL = 0.1
/** The dome passes are the expensive ones (a ball of a few mm over a whole hemisphere), so their lattice is coarser; the faults seeded into them are scaled to its declared bound. */
const DOME_CELL = 0.2

interface Case { readonly name: string; readonly seeded: number; readonly run: () => { readonly depth: number; readonly threshold: number } }

/** A block with a ring pass around it: the tool of diameter `d` stands `offset` from the wall (the wall at `d / 2` is clean). */
const wallCase = (rand: () => number, fault: number): Case => {
  const d = [4, 6, 8, 10][Math.floor(rand() * 4)]!
  const w = 14 + Math.floor(rand() * 12), h = 14 + Math.floor(rand() * 12), t = 6 + Math.floor(rand() * 6)
  const r = d / 2
  const offset = r - fault
  return {
    name: `wall d=${d} ${w}x${h}x${t} overcut ${fault.toFixed(3)}`,
    seeded: fault,
    run: () => {
      const replay = new TriReplay({ min: { x: -r, y: -r, z: 0 }, max: { x: w + r, y: h + r, z: t }, cell: CELL, budget: 5e9 })
      const z = -1
      const ring: Vec3[] = [{ x: -offset, y: -offset, z }, { x: w + offset, y: -offset, z }, { x: w + offset, y: h + offset, z }, { x: -offset, y: h + offset, z }, { x: -offset, y: -offset, z }]
      replay.cut(flat(d), ring)
      const v = replay.verdict([boxMesh(0, 0, 0, w, h, t)], TOLERANCE, 0.05)
      if (!v.complete) throw new Error(`incomplete: ${v.reasons.join("; ")}`)
      return { depth: v.gouge.depth, threshold: TOLERANCE + v.errorBound }
    }
  }
}

/** A ball of diameter `d` swept over latitude rings of a sphere with its axis on the surface normal: the five-axis finish shape. */
const domeCase = (rand: () => number, fault: number): Case => {
  const d = [6, 8, 10][Math.floor(rand() * 3)]!
  const R = 10 + Math.floor(rand() * 5)
  const rb = d / 2
  return {
    name: `dome R=${R} ball ${d} overcut ${fault.toFixed(3)}`,
    seeded: fault,
    run: () => {
      const e = R + 1
      const replay = new TriReplay({ min: { x: -e, y: -e, z: -e }, max: { x: e, y: e, z: e }, cell: DOME_CELL, budget: 5e9 })
      const rc = R + rb - fault
      const tips: Vec3[] = [], axes: Vec3[] = []
      for (let ring = 0; ring <= 8; ring++) {
        const lat = (ring / 8) * (Math.PI / 2 - 0.05)
        for (let k = 0; k <= 72; k++) {
          const a = (2 * Math.PI * k) / 72
          const n = { x: Math.cos(lat) * Math.cos(a), y: Math.cos(lat) * Math.sin(a), z: Math.sin(lat) }
          // The ball centre sits on the offset sphere; the axis is the surface normal and the tip is one ball radius below the centre along it.
          tips.push({ x: rc * n.x - rb * n.x, y: rc * n.y - rb * n.y, z: rc * n.z - rb * n.z })
          axes.push(n)
        }
      }
      replay.cut(ball(d), tips, axes)
      const v = replay.verdict([sphereMesh(R)], TOLERANCE, 0.05)
      return { depth: v.gouge.depth, threshold: TOLERANCE + v.errorBound }
    }
  }
}

describe("fault injection: the replay names every seeded overcut and passes every clean fixture", () => {
  test("50 overcuts of a block wall, from 0.25 to 1.0 mm, are all found", () => {
    const rand = mulberry32(7)
    const missed: string[] = []
    for (let i = 0; i < 50; i++) {
      const fault = 0.25 + rand() * 0.75
      const c = wallCase(rand, fault)
      const { depth, threshold } = c.run()
      // Every seeded depth is at least 1.5 x the threshold (0.01 + 0.125).
      expect(c.seeded).toBeGreaterThan(1.5 * threshold)
      if (!(depth > threshold)) missed.push(`${c.name} -> ${depth.toFixed(3)}`)
    }
    expect(missed).toEqual([])
  })

  test("50 overcuts of a dome by a ball with its axis on the normal are all found", () => {
    const rand = mulberry32(11)
    const missed: string[] = []
    for (let i = 0; i < 50; i++) {
      const fault = 0.55 + rand() * 0.6
      const c = domeCase(rand, fault)
      const { depth, threshold } = c.run()
      expect(c.seeded).toBeGreaterThan(1.5 * threshold)
      if (!(depth > threshold)) missed.push(`${c.name} -> ${depth.toFixed(3)}`)
    }
    expect(missed).toEqual([])
  })

  test("30 clean fixtures (15 wall passes, 15 dome passes, tool exactly on the surface) report no gouge", () => {
    const rand = mulberry32(23)
    const wrong: string[] = []
    for (let i = 0; i < 15; i++) {
      const c = wallCase(rand, 0)
      const { depth, threshold } = c.run()
      if (depth > threshold) wrong.push(`${c.name} -> ${depth.toFixed(3)}`)
    }
    for (let i = 0; i < 15; i++) {
      const c = domeCase(rand, 0)
      const { depth, threshold } = c.run()
      if (depth > threshold) wrong.push(`${c.name} -> ${depth.toFixed(3)}`)
    }
    expect(wrong).toEqual([])
  })
})
