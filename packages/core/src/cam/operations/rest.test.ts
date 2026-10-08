import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { makeProgram } from "../ir.ts"
import type { Move } from "../ir.ts"
import { buildPartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import { verifyToolpath } from "../verify/index.ts"
import { distanceTo } from "./rest.ts"
import { Surface, cutterOf } from "./surface-field.ts"
import { SurfaceParams, generateSurface } from "./surface.ts"

setDefaultTimeout(60000)

const flat = (d: number): Tool => ({ id: "f", name: "flat", kind: "endmill", diameter: d, flutes: 2, maxRpm: 20000 })
const stock: Stock = { x: 50, y: 50, z: 12, origin: { x: -25, y: -25, z: 0 }, material: "aluminum" }
const params = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(SurfaceParams)({ totalDepth: 6, stepdown: 3, stepover: 50, ...extra })

/**
 * Two walls meeting in an inside corner at (10, 10): A is y >= 10, B is x >= 10, both from z = -12 to the stock top. The free
 * floor is the quadrant x < 10, y < 10 of the 50 x 50 stock.
 */
const corner = () => buildPartModel([
  { id: "a", type: "cube", width: 50, height: 15, depth: 12, x: 0, y: 17.5, z: -6 },
  { id: "b", type: "cube", width: 15, height: 50, depth: 12, x: 17.5, y: 0, z: -6 }
], { cell: 0.1 })!

/** Points the tool centre visits while cutting (z below the stock top), arcs sampled along their circle. */
const centres = (moves: ReadonlyArray<Move>): Array<{ x: number; y: number; z: number }> => {
  const out: Array<{ x: number; y: number; z: number }> = []
  let at: { x: number; y: number; z: number } | undefined
  for (const m of moves) {
    if (m._tag !== "Rapid" && m._tag !== "Linear" && m._tag !== "Arc") continue
    if (at !== undefined && m._tag !== "Rapid" && m.to.z < -0.5) {
      const n = 24
      if (m._tag === "Linear") for (let k = 1; k <= n; k++) out.push({ x: at.x + ((m.to.x - at.x) * k) / n, y: at.y + ((m.to.y - at.y) * k) / n, z: at.z + ((m.to.z - at.z) * k) / n })
      else {
        const r = Math.hypot(at.x - m.center.x, at.y - m.center.y)
        const a0 = Math.atan2(at.y - m.center.y, at.x - m.center.x)
        let sweep = Math.atan2(m.to.y - m.center.y, m.to.x - m.center.x) - a0
        if (m.clockwise && sweep > 1e-9) sweep -= 2 * Math.PI
        if (!m.clockwise && sweep < -1e-9) sweep += 2 * Math.PI
        if (Math.abs(sweep) < 1e-9) sweep = m.clockwise ? -2 * Math.PI : 2 * Math.PI
        for (let k = 1; k <= 96; k++) out.push({ x: m.center.x + r * Math.cos(a0 + (sweep * k) / 96), y: m.center.y + r * Math.sin(a0 + (sweep * k) / 96), z: at.z + ((m.to.z - at.z) * k) / 96 })
      }
    }
    at = { ...m.to }
  }
  return out
}

/** Length of the feed moves in XY, mm (arcs by their chord: a lower bound that is the same for both paths compared). */
const cutLength = (moves: ReadonlyArray<Move>): number => {
  let at: { x: number; y: number } | undefined
  let total = 0
  for (const m of moves) {
    if (m._tag !== "Rapid" && m._tag !== "Linear" && m._tag !== "Arc") continue
    if (at !== undefined && m._tag !== "Rapid") total += Math.hypot(m.to.x - at.x, m.to.y - at.y)
    at = m.to
  }
  return total
}

describe("distance transform", () => {
  test("matches a brute-force search on an anisotropic grid", () => {
    const w = 23, h = 17, dx = 0.7, dy = 1.3
    const mask = new Uint8Array(w * h)
    for (const [i, j] of [[3, 4], [20, 2], [11, 15], [0, 0]] as const) mask[j * w + i] = 1
    const d = distanceTo(mask, w, h, dx, dy)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let best = Infinity
      for (let q = 0; q < h; q++) for (let p = 0; p < w; p++) if (mask[q * w + p] === 1) best = Math.min(best, Math.hypot((i - p) * dx, (j - q) * dy))
      expect(d[j * w + i]).toBeCloseTo(best, 9)
    }
  })

  test("an empty mask is infinitely far from everything", () => {
    expect(distanceTo(new Uint8Array(12), 4, 3, 1, 1).every((v) => v === Infinity)).toBe(true)
  })
})

describe("rest machining", () => {
  const rough = (extra: Record<string, unknown>, d = 2) => generateSurface(params({ strategy: "rest", restFrom: { diameter: 6 }, ...extra }), corner(), flat(d), stock)

  test("cuts only the inside corner a 6 mm tool could not reach, never into the walls", () => {
    const r = rough({})
    const cuts = centres(r.toolpath.moves)
    expect(r.stats.loops).toBeGreaterThan(0)
    expect(cuts.length).toBeGreaterThan(100)
    for (const p of cuts) {
      // A 2 mm cutter next to the walls at x = 10 and y = 10: its centre stays 1 mm away from both.
      expect(p.x).toBeLessThanOrEqual(10 - 1 + 0.06)
      expect(p.y).toBeLessThanOrEqual(10 - 1 + 0.06)
      // And only near the corner: the 6 mm tool swept everything farther than this from it.
      expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(4.5)
    }
    // A plain roughing with the same tool covers the whole floor: the rest pass is a small fraction of it.
    const full = generateSurface(params({ strategy: "roughing" }), corner(), flat(2), stock)
    expect(cutLength(r.toolpath.moves)).toBeLessThan(cutLength(full.toolpath.moves) * 0.3)
  })

  test("covers every unswept point the small tool can reach", () => {
    const r = rough({})
    const cuts = centres(r.toolpath.moves)
    let checked = 0
    for (let x = 6; x < 10; x += 0.1) for (let y = 6; y < 10; y += 0.1) {
      // Unswept by the 6 mm tool (its centres reach x, y <= 7) ...
      if (Math.hypot(Math.max(0, x - 7), Math.max(0, y - 7)) <= 3 + 0.3) continue
      // ... and within reach of a 2 mm cutter whose centre may go to x, y <= 9 (with a margin for the model's cell).
      if (Math.hypot(Math.max(0, x - 9), Math.max(0, y - 9)) > 1 - 0.2) continue
      checked++
      let best = Infinity
      for (const p of cuts) best = Math.min(best, Math.hypot(p.x - x, p.y - y))
      expect(best).toBeLessThanOrEqual(1 + 0.2)
    }
    expect(checked).toBeGreaterThan(30)
  })

  test("leaves the stock to leave on the walls and does not trace the previous tool's border", () => {
    const r = rough({ allowance: 0.3 })
    const cuts = centres(r.toolpath.moves)
    expect(cuts.length).toBeGreaterThan(50)
    for (const p of cuts) {
      expect(p.x).toBeLessThanOrEqual(10 - 1 - 0.3 + 0.06)
      expect(p.y).toBeLessThanOrEqual(10 - 1 - 0.3 + 0.06)
      expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(5)
    }
  })

  test("the verifier finds no gouge in the emitted rest pass", () => {
    const r = rough({})
    const report = verifyToolpath({
      program: makeProgram("rest", [r.toolpath]),
      stock: { minX: -25, maxX: 25, minY: -25, maxY: 25, minZ: -12, maxZ: 0 },
      tool: { kind: "endmill", diameter: 2 },
      target: { solids: [
        { _tag: "Box", origin: { x: -25, y: 10, z: -12 }, size: { x: 50, y: 15, z: 12 } },
        { _tag: "Box", origin: { x: 10, y: -25, z: -12 }, size: { x: 15, y: 50, z: 12 } }
      ] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
  })

  test("a previous tool that is not larger leaves nothing, and says so", () => {
    const r = rough({ restFrom: { diameter: 2 } })
    expect(r.stats.loops).toBe(0)
    expect(centres(r.toolpath.moves)).toHaveLength(0)
    const smaller = rough({ restFrom: { diameter: 1 } })
    expect(smaller.warnings.join(" ")).toContain("smaller than this one")
  })

  test("without restFrom it refuses to guess a previous tool", () => {
    const r = generateSurface(params({ strategy: "rest" }), corner(), flat(2), stock)
    expect(r.warnings.join(" ")).toContain("needs `restFrom`")
    expect(centres(r.toolpath.moves)).toHaveLength(0)
  })
})

describe("rest finishing (pencil)", () => {
  const ball = (d: number): Tool => ({ id: "b", name: "ball", kind: "ballnose", diameter: d, flutes: 2, maxRpm: 20000 })
  // A floor at z = -6 with a wall rising to z = 0 along x >= 10: a concave crease where the wall meets the floor.
  const crease = () => buildPartModel([
    { id: "floor", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
    { id: "wall", type: "cube", width: 15, height: 50, depth: 6, x: 17.5, y: 0, z: -3 }
  ], { cell: 0.1 })!
  const pencil = (strategy: "parallel" | "waterline", extra: Record<string, unknown> = {}) =>
    generateSurface(params({ strategy, totalDepth: 6, stepdown: 3, stepover: 40, tolerance: 0.01, restFrom: { diameter: 6, kind: "ballnose" }, ...extra }), crease(), ball(2), stock)
  const full = (strategy: "parallel" | "waterline") =>
    generateSurface(params({ strategy, totalDepth: 6, stepdown: 3, stepover: 40, tolerance: 0.01 }), crease(), ball(2), stock)
  const cutPoints = (r: ReturnType<typeof generateSurface>) => r.toolpath.moves.flatMap((m) => (m._tag === "Linear" ? [m.to] : []))

  test("after a 6 mm ball, a 2 mm ball cuts only the strip beside the wall the big ball could not reach (and the stock's own edge)", () => {
    const rest = pencil("parallel", { angle: 90 })
    const everything = full("parallel")
    const restPts = cutPoints(rest).filter((p) => p.z < -0.5)
    expect(restPts.length).toBeGreaterThan(5)
    // The crease is at x = 10. The 6 mm ball (radius 3) touches the floor out to x = 7 at best, so the 2 mm ball is wanted on the
    // floor between about x = 7 and the wall, and nowhere further out. The only other place the two balls differ is the stock's
    // own edge at x = 25, where a ball rides the corner of the wall's top.
    for (const p of restPts) {
      expect(p.x).toBeGreaterThanOrEqual(5.5)
      expect(p.x <= 10 + 1e-6 || p.x >= 25 - 1e-6).toBe(true)
    }
    expect(restPts.filter((p) => p.x <= 10 + 1e-6).length).toBeGreaterThan(5)
    // Nothing is cut outside the stock.
    for (const p of cutPoints(rest)) { expect(Math.abs(p.x)).toBeLessThanOrEqual(25 + 1e-6); expect(Math.abs(p.y)).toBeLessThanOrEqual(25 + 1e-6) }
    // A plain finish with the same ball covers the whole floor, far from the crease.
    expect(Math.min(...cutPoints(everything).filter((p) => p.z < -0.5).map((p) => p.x))).toBeLessThan(-20)
  })

  test("it follows the 2 mm ball's own drop-cutter path exactly where it does cut", () => {
    const part = crease()
    const surface = new Surface(part.grid, part.dexels.top(-Infinity))
    const cutter = cutterOf(ball(2))
    const rest = cutPoints(pencil("parallel", { angle: 90 })).filter((p) => p.z < -0.5 && p.x < 24.9)
    expect(rest.length).toBeGreaterThan(5)
    for (const p of rest) expect(p.z).toBeCloseTo(Math.max(surface.tip(cutter, p.x, p.y), -6), 1)
  })

  test("the waterline version is open pieces on the crease and the tool lifts between them", () => {
    const rest = pencil("waterline")
    expect(rest.stats.loops).toBeGreaterThan(0)
    const pts = cutPoints(rest).filter((p) => p.z < -0.5)
    for (const p of pts) { expect(p.x).toBeGreaterThanOrEqual(4.5); expect(Math.abs(p.x)).toBeLessThanOrEqual(25 + 1e-6) }
    const rapids = rest.toolpath.moves.filter((m) => m._tag === "Rapid").length
    expect(rapids).toBeGreaterThan(rest.stats.loops) // every piece is approached again
  })

  test("a previous tool no larger than this one leaves nothing, and a larger threshold finishes less", () => {
    const none = pencil("parallel", { restFrom: { diameter: 2, kind: "ballnose" } })
    expect(cutPoints(none).filter((p) => p.z < -0.5)).toHaveLength(0)
    expect(none.toolpath.moves.some((m) => m._tag === "Comment" && m.text.startsWith("nothing to cut"))).toBe(true)
    const smaller = pencil("parallel", { restFrom: { diameter: 1, kind: "ballnose" } })
    expect(smaller.warnings.join(" ")).toContain("smaller than this one")
    const lenient = cutPoints(pencil("parallel", { angle: 90, restThreshold: 0.5 })).filter((p) => p.z < -0.5)
    const strict = cutPoints(pencil("parallel", { angle: 90, restThreshold: 0.01 })).filter((p) => p.z < -0.5)
    expect(lenient.length).toBeLessThan(strict.length)
  })

  test("the verifier finds no gouge in a pencil pass", () => {
    const r = pencil("parallel", { angle: 90 })
    const report = verifyToolpath({
      program: makeProgram("pencil", [r.toolpath]),
      stock: { minX: -25, maxX: 25, minY: -25, maxY: 25, minZ: -12, maxZ: 0 },
      tool: { kind: "ballnose", diameter: 2 },
      target: { solids: [{ _tag: "Box", origin: { x: -25, y: -25, z: -12 }, size: { x: 50, y: 50, z: 6 } }, { _tag: "Box", origin: { x: 10, y: -25, z: -12 }, size: { x: 15, y: 50, z: 9 } }] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
  })
})
