import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import type { Move } from "../ir.ts"
import type { Stock, Tool } from "../tool.ts"
import type { Vec2 } from "../../cad/vec.ts"
import { makeProgram } from "../ir.ts"
import { buildPartModel } from "../model/model.ts"
import { verifyToolpath } from "../verify/index.ts"
import { AdaptiveParams, generateAdaptive } from "./adaptive.ts"
import { SurfaceParams, generateSurface } from "./surface.ts"
import { PocketParams, generatePocket } from "./pocket.ts"

setDefaultTimeout(60000)

const flat = (d: number): Tool => ({ id: "f", name: "flat", kind: "endmill", diameter: d, flutes: 2, maxRpm: 20000 })
const stock: Stock = { x: 100, y: 100, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }
const adaptive = (extra: Record<string, unknown> = {}) => Schema.decodeUnknownSync(AdaptiveParams)({ totalDepth: 3, stepdown: 3, ...extra })
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

/** Tool centres of the cutting moves (those at depth), arcs sampled along their circle. */
const centres = (moves: ReadonlyArray<Move>, depth = -0.5): Vec2[] => {
  const out: Vec2[] = []
  let at: { x: number; y: number; z: number } | undefined
  for (const m of moves) {
    if (m._tag !== "Rapid" && m._tag !== "Linear" && m._tag !== "Arc") continue
    if (at !== undefined && m._tag !== "Rapid" && m.to.z <= depth) {
      if (m._tag === "Linear") out.push({ x: m.to.x, y: m.to.y })
      else {
        const r = Math.hypot(at.x - m.center.x, at.y - m.center.y)
        const a0 = Math.atan2(at.y - m.center.y, at.x - m.center.x)
        let sweep = Math.atan2(m.to.y - m.center.y, m.to.x - m.center.x) - a0
        if (m.clockwise && sweep > 1e-9) sweep -= 2 * Math.PI
        if (!m.clockwise && sweep < -1e-9) sweep += 2 * Math.PI
        if (Math.abs(sweep) < 1e-9) sweep = m.clockwise ? -2 * Math.PI : 2 * Math.PI
        for (let k = 1; k <= 48; k++) out.push({ x: m.center.x + r * Math.cos(a0 + (sweep * k) / 48), y: m.center.y + r * Math.sin(a0 + (sweep * k) / 48) })
      }
    }
    at = { ...m.to }
  }
  return out
}

/**
 * Replays a path on its own raster, independent of the algorithm's: returns, per move, the width of material it removed (area
 * removed / length moved, mm) which is the radial engagement the cutter really met, and the final raster.
 */
const replay = (path: ReadonlyArray<Vec2>, radius: number, material: (x: number, y: number) => boolean, box: { x0: number; y0: number; x1: number; y1: number }, cell = 0.1) => {
  const nx = Math.ceil((box.x1 - box.x0) / cell), ny = Math.ceil((box.y1 - box.y0) / cell)
  const left = new Uint8Array(nx * ny)
  let total = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (material(box.x0 + (i + 0.5) * cell, box.y0 + (j + 0.5) * cell)) { left[j * nx + i] = 1; total++ }
  const widths: number[] = []
  const cutAt = (cx: number, cy: number): number => {
    let n = 0
    const i0 = Math.max(0, Math.floor((cx - radius - box.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((cx + radius - box.x0) / cell))
    const j0 = Math.max(0, Math.floor((cy - radius - box.y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((cy + radius - box.y0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (left[j * nx + i] === 0) continue
      if (Math.hypot(box.x0 + (i + 0.5) * cell - cx, box.y0 + (j + 0.5) * cell - cy) <= radius) { left[j * nx + i] = 0; n++ }
    }
    return n
  }
  if (path.length > 0) cutAt(path[0]!.x, path[0]!.y)
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!, b = path[k]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-9) continue
    const n = Math.max(1, Math.ceil(len / (cell / 2)))
    let removed = 0
    for (let s = 1; s <= n; s++) removed += cutAt(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n)
    widths.push((removed * cell * cell) / len)
  }
  let remaining = 0
  for (const v of left) remaining += v
  return { widths, remaining, total }
}

const quantile = (values: ReadonlyArray<number>, q: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
}

describe("adaptive clearing", () => {
  const R = 3
  const tool = flat(6)
  const ae = 0.12 * 6
  const run = (region: unknown, extra: Record<string, unknown> = {}) => generateAdaptive(adaptive(extra), region as never, tool, stock)
  /** Everything within one tool radius of the square of centres [3, 27]^2: the rounded square (a round tool leaves its sharp corners). */
  const roundedSquare = (x: number, y: number) => Math.hypot(Math.max(0, 3 - x, x - 27), Math.max(0, 3 - y, y - 27)) <= R
  /** The load after the helix entry (which is a full-width cut by nature). */
  const body = (path: ReadonlyArray<Vec2>, material: (x: number, y: number) => boolean, box: { x0: number; y0: number; x1: number; y1: number }) => {
    const r = replay(path, R, material, box)
    return { ...r, widths: r.widths.slice(200) }
  }

  test("clears a square pocket inside its region, at a bounded load, leaving almost nothing", () => {
    const r = run(rect(3, 3, 27, 27))
    const path = centres(r.toolpath.moves)
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(3 - 0.02)
      expect(p.x).toBeLessThanOrEqual(27 + 0.02)
      expect(p.y).toBeGreaterThanOrEqual(3 - 0.02)
      expect(p.y).toBeLessThanOrEqual(27 + 0.02)
    }
    // Judged on a raster of its own, not the one the path was planned on.
    const { widths, remaining, total } = body(path, roundedSquare, { x0: 0, y0: 0, x1: 30, y1: 30 })
    expect(remaining / total).toBeLessThan(0.005)
    // The width of the strip it removes (area over path length) stays near the optimal load. It reads a little above `ae` on rings
    // that cut outward, where the strip is longer than the path: by 1 + (R - ae / 2) / radius, i.e. about 1.5 at 5 mm. What
    // matters is the tail: no move, in a corner or anywhere, comes near a full slot (2R = 6 mm).
    expect(quantile(widths, 0.9)).toBeLessThan(2 * ae)
    expect(quantile(widths, 0.99)).toBeLessThan(3.6 * ae)
    expect(Math.max(...widths)).toBeLessThan(4.5 * ae)
  })

  test("a contour-parallel pocket of the same region cuts a much wider strip", () => {
    const pocket = generatePocket(Schema.decodeUnknownSync(PocketParams)({ totalDepth: 3, stepdown: 3, stepover: 40, toolCentre: true }), rect(3, 3, 27, 27), tool, stock)
    // The pocket's rings are few long moves, so the helix is skipped by position rather than by count.
    const widths = replay(centres(pocket.moves), R, roundedSquare, { x0: 0, y0: 0, x1: 30, y1: 30 }).widths.filter((w) => w > 0)
    const adaptivePath = centres(run(rect(3, 3, 27, 27)).toolpath.moves)
    const adaptiveWidths = body(adaptivePath, roundedSquare, { x0: 0, y0: 0, x1: 30, y1: 30 }).widths
    expect(quantile(widths, 0.9)).toBeGreaterThan(1.5 * quantile(adaptiveWidths, 0.9))
    expect(Math.max(...widths)).toBeGreaterThan(1.5 * Math.max(...adaptiveWidths))
  })

  test("goes around an island without entering it, and clears the rest", () => {
    const island = rect(12, 12, 18, 18)
    const r = run({ boundary: rect(3, 3, 27, 27), islands: [island] })
    const path = centres(r.toolpath.moves)
    // Centres never inside the island (the region of centres has a hole there).
    // Within a third of a raster node (0.144 mm here): the distance field is bilinear, and at the sharp corner of an island it rounds.
    for (const p of path) expect(p.x > 12 + 0.05 && p.x < 18 - 0.05 && p.y > 12 + 0.05 && p.y < 18 - 0.05).toBe(false)
    const material = (x: number, y: number) => roundedSquare(x, y) && !(x > 12 + 0 && x < 18 && y > 12 && y < 18 && Math.hypot(Math.max(0, 12 - x, x - 18), Math.max(0, 12 - y, y - 18)) > -1) ? !(x > 12 - R && x < 18 + R && y > 12 - R && y < 18 + R && Math.hypot(Math.max(0, 12 - x, x - 18), Math.max(0, 12 - y, y - 18)) <= R) || true : false
    void material
    // Material within one radius of a feasible centre: the rounded square, minus the part of the island's square the centres cannot reach.
    const reachable = (x: number, y: number) => {
      if (!roundedSquare(x, y)) return false
      // Inside the island itself nothing can be reached by a centre that must stay out of it, except within R of its border.
      const inside = x > 12 && x < 18 && y > 12 && y < 18
      return !inside || Math.min(x - 12, 18 - x, y - 12, 18 - y) <= R
    }
    const { remaining, total, widths } = body(path, reachable, { x0: 0, y0: 0, x1: 30, y1: 30 })
    expect(remaining / total).toBeLessThan(0.01)
    expect(quantile(widths, 0.9)).toBeLessThan(2 * ae)
    // The sharp corners of the island put material on several sides at once; still well short of a full slot (2R = 6 mm).
    expect(Math.max(...widths)).toBeLessThan(0.65 * 2 * R)
  })

  test("climb and conventional milling spiral opposite ways, and a lighter engagement means a finer path", () => {
    const turning = (path: ReadonlyArray<Vec2>): number => {
      let total = 0
      for (let k = 2; k < path.length; k++) {
        const a = Math.atan2(path[k - 1]!.y - path[k - 2]!.y, path[k - 1]!.x - path[k - 2]!.x), b = Math.atan2(path[k]!.y - path[k - 1]!.y, path[k]!.x - path[k - 1]!.x)
        let d = b - a
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        total += d
      }
      return total
    }
    // The first 250 points after the helix are the spiral leaving the entry.
    const climb = centres(run(rect(3, 3, 27, 27), { climb: true }).toolpath.moves).slice(200, 450)
    const conventional = centres(run(rect(3, 3, 27, 27), { climb: false }).toolpath.moves).slice(200, 450)
    expect(turning(climb)).toBeGreaterThan(Math.PI)
    expect(turning(conventional)).toBeLessThan(-Math.PI)
    const light = run(rect(3, 3, 27, 27), { engagement: 6 }), heavy = run(rect(3, 3, 27, 27), { engagement: 20 })
    expect(light.stats.steps).toBeGreaterThan(heavy.stats.steps * 1.5)
  })

  test("never rapids sideways below the stock top, and the same input gives the same moves", () => {
    const r = run(rect(3, 3, 27, 27))
    let at: { x: number; y: number; z: number } | undefined
    for (const m of r.toolpath.moves) {
      if (m._tag !== "Rapid" && m._tag !== "Linear" && m._tag !== "Arc") continue
      if (m._tag === "Rapid" && at !== undefined && Math.hypot(m.to.x - at.x, m.to.y - at.y) > 1e-9) expect(Math.min(at.z, m.to.z)).toBeGreaterThanOrEqual(-1e-9)
      at = { ...m.to }
    }
    expect(run(rect(3, 3, 27, 27)).toolpath.moves).toEqual(r.toolpath.moves)
  })

  test("a geometry without a closed boundary says so instead of emitting nothing silently", () => {
    const r = generateAdaptive(adaptive(), { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: false } as never, tool, stock)
    expect(r.stats.runs).toBe(0)
    expect(r.toolpath.moves.some((m) => m._tag === "Comment" && m.text.startsWith("nothing to cut"))).toBe(true)
  })
})

describe("adaptive clearing as the clearing of a surface roughing", () => {
  const surfaceStock: Stock = { x: 50, y: 50, z: 12, origin: { x: -25, y: -25, z: 0 }, material: "aluminum" }
  const surfaceParams = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(SurfaceParams)({ totalDepth: 6, stepdown: 3, ...extra })

  test("roughs around a boss level by level without touching it, and the verifier finds no gouge", () => {
    const part = buildPartModel([
      { id: "slab", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
      { id: "boss", type: "cylinder", radius: 8, height: 8, x: 0, y: 0, z: -4 }
    ], { cell: 0.25 })!
    const r = generateSurface(surfaceParams({ strategy: "roughing", clearing: "adaptive", engagement: 15, totalDepth: 6, stepdown: 3, allowance: 0.3 }), part, flat(6), surfaceStock)
    const cuts = centres(r.toolpath.moves, -0.5)
    expect(r.stats.levels).toBe(2)
    expect(cuts.length).toBeGreaterThan(200)
    // The tool centre stays boss radius + tool radius + allowance from the axis (a raster node of slack: the boss is a mesh).
    for (const p of cuts.filter((c) => Math.hypot(c.x, c.y) < 20)) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(8 + 3 + 0.3 - 0.35)
    const report = verifyToolpath({
      program: makeProgram("adaptive", [r.toolpath]),
      stock: { minX: -25, maxX: 25, minY: -25, maxY: 25, minZ: -12, maxZ: 0 },
      tool: { kind: "endmill", diameter: 6 },
      target: { solids: [{ _tag: "Box", origin: { x: -25, y: -25, z: -12 }, size: { x: 50, y: 50, z: 6 } }, { _tag: "Cylinder", origin: { x: 0, y: 0, z: -8 }, radius: 8, height: 8, segments: 128 }] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
  })

  test("rest machining with adaptive clearing peels only the stock the previous tool left, near the inside corner", () => {
    const corner = buildPartModel([
      { id: "a", type: "cube", width: 50, height: 15, depth: 12, x: 0, y: 17.5, z: -6 },
      { id: "b", type: "cube", width: 15, height: 50, depth: 12, x: 17.5, y: 0, z: -6 }
    ], { cell: 0.1 })!
    const r = generateSurface(surfaceParams({ strategy: "rest", clearing: "adaptive", engagement: 20, restFrom: { diameter: 6 } }), corner, flat(2), surfaceStock)
    const cuts = centres(r.toolpath.moves, -0.5)
    expect(cuts.length).toBeGreaterThan(20)
    for (const p of cuts) {
      expect(p.x).toBeLessThanOrEqual(10 - 1 + 0.1)
      expect(p.y).toBeLessThanOrEqual(10 - 1 + 0.1)
      expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(5)
    }
    // Every unswept point the small tool can reach lies within its radius of the path.
    let checked = 0
    for (let x = 6; x < 10; x += 0.1) for (let y = 6; y < 10; y += 0.1) {
      if (Math.hypot(Math.max(0, x - 7), Math.max(0, y - 7)) <= 3 + 0.3) continue
      if (Math.hypot(Math.max(0, x - 9), Math.max(0, y - 9)) > 1 - 0.3) continue
      checked++
      let best = Infinity
      for (const p of cuts) best = Math.min(best, Math.hypot(p.x - x, p.y - y))
      expect(best).toBeLessThanOrEqual(1 + 0.3)
    }
    expect(checked).toBeGreaterThan(10)
  })
})
