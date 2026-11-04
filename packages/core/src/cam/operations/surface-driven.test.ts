import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { Stock, Tool } from "../tool.ts"
import type { Move } from "../ir.ts"
import { DrivenParams, generateDriven, type DriveSpec } from "./surface-driven.ts"
import type { DropMesh } from "./mesh-drop-cutter.ts"

const ball = (d: number): Tool => ({ id: "b", name: "ball", kind: "ballnose", diameter: d, flutes: 2, maxRpm: 20000 })
const vbit: Tool = { id: "v", name: "v", kind: "vbit", diameter: 6, flutes: 2, maxRpm: 20000, angle: 90 }
const params = (extra: Record<string, unknown> = {}) => Schema.decodeUnknownSync(DrivenParams)({ totalDepth: 12, stepdown: 12, ...extra })
const stock: Stock = { x: 40, y: 40, z: 12, origin: { x: -20, y: -20, z: 0 }, material: "aluminum" }

/** Cap of a sphere of radius 10 centred at (0, 0, -10) (top at z = 0). */
const sphereCap = (): DropMesh => {
  const Rs = 10, seg = 256, rings = 128
  const pos: number[] = [0, 0, 0]
  for (let i = 1; i <= rings; i++) { const phi = (Math.PI / 2) * (i / rings); for (let j = 0; j < seg; j++) pos.push(Rs * Math.sin(phi) * Math.cos((2 * Math.PI * j) / seg), Rs * Math.sin(phi) * Math.sin((2 * Math.PI * j) / seg), Rs * Math.cos(phi) - 10) }
  const idx: number[] = []
  for (let j = 0; j < seg; j++) idx.push(0, 1 + j, 1 + ((j + 1) % seg))
  for (let i = 1; i < rings; i++) for (let j = 0; j < seg; j++) { const a = 1 + (i - 1) * seg + j, b = 1 + (i - 1) * seg + ((j + 1) % seg), c = 1 + i * seg + j, d = 1 + i * seg + ((j + 1) % seg); idx.push(a, c, b, b, c, d) }
  return { positions: pos, indices: idx }
}

/** Closed box 20 x 20 x 10 with its top at z = 10 (triangulated faces). */
const box = (): DropMesh => {
  const v = [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0], [-10, -10, 10], [10, -10, 10], [10, 10, 10], [-10, 10, 10]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return { positions: v.flat(), indices: f.flat() }
}

const cutsOf = (moves: ReadonlyArray<Move>) => moves.flatMap((m) => (m._tag === "Linear" ? [m.to] : []))
/** The z of the ball tool tip on the offset sphere, and the mesh chord tolerance of the fixture. */
const sphereTip = (x: number, y: number, r: number): number => Math.sqrt((10 + r) ** 2 - x * x - y * y) - r - 10
const CHORD = 0.004

describe("drive-curve finishing strategies (spec 69 F3)", () => {
  const part = sphereCap()

  test("projection: every point is on the offset surface, never below it", () => {
    const curves = [Array.from({ length: 9 }, (_, i) => ({ x: -8 + 2 * i, y: 1 })), [{ x: 0, y: -8 }, { x: 0, y: 8 }]]
    const r = generateDriven(params(), { kind: "projection", curves }, part, ball(4), stock)
    const pts = cutsOf(r.toolpath.moves).filter((p) => p.z < 1)
    expect(pts.length).toBeGreaterThan(40)
    for (const p of pts) {
      if (Math.hypot(p.x, p.y) > 8.5) continue
      expect(p.z).toBeGreaterThanOrEqual(sphereTip(p.x, p.y, 2) - CHORD)
      expect(p.z).toBeLessThanOrEqual(sphereTip(p.x, p.y, 2) + CHORD)
    }
    expect(r.stats.curves).toBe(2)
  })

  test("allowance holds the tool off the surface by that much", () => {
    const curve = [{ x: -4, y: 0 }, { x: 4, y: 0 }]
    const bare = cutsOf(generateDriven(params(), { kind: "projection", curves: [curve] }, part, ball(4), stock).toolpath.moves).filter((p) => p.z < 1)
    const left = cutsOf(generateDriven(params({ allowance: 0.5 }), { kind: "projection", curves: [curve] }, part, ball(4), stock).toolpath.moves).filter((p) => p.z < 1)
    expect(left.length).toBe(bare.length)
    // On a sphere the offset by 0.5 raises the tip by 0.5 at the pole and by (slightly) less than that on the slope: never below the bare path.
    for (let i = 0; i < bare.length; i++) { expect(left[i]!.z).toBeGreaterThan(bare[i]!.z + 0.3); expect(left[i]!.z).toBeLessThan(bare[i]!.z + 0.55) }
  })

  test("engrave: the tip follows the surface at the groove depth", () => {
    const curve = [{ x: -6, y: 2 }, { x: 6, y: 2 }]
    const proj = cutsOf(generateDriven(params(), { kind: "projection", curves: [curve] }, part, vbit, stock).toolpath.moves).filter((p) => p.z < 1)
    const eng = cutsOf(generateDriven(params({ depth: 0.3 }), { kind: "engrave", curves: [curve] }, part, vbit, stock).toolpath.moves).filter((p) => p.z < 1)
    expect(eng.length).toBe(proj.length)
    for (let i = 0; i < eng.length; i++) expect(eng[i]!.z).toBeCloseTo(proj[i]!.z - 0.3, 9)
  })

  test("morph: curves fill the strip between two boundaries at the stepover, all on the surface", () => {
    const a = [{ x: -8, y: -6 }, { x: 8, y: -6 }], b = [{ x: -8, y: 6 }, { x: 8, y: 6 }]
    const r = generateDriven(params({ stepover: 25 }), { kind: "morph", a, b }, part, ball(4), stock)
    // Gap 12 mm, spacing 25 % of 4 = 1 mm: 13 curves.
    expect(r.stats.curves).toBe(13)
    const ys = new Set(cutsOf(r.toolpath.moves).filter((p) => p.z < 1).map((p) => Math.round(p.y * 100) / 100))
    expect(ys.size).toBeGreaterThanOrEqual(13)
    for (const p of cutsOf(r.toolpath.moves).filter((q) => q.z < 1 && Math.hypot(q.x, q.y) < 8)) expect(p.z).toBeGreaterThanOrEqual(sphereTip(p.x, p.y, 2) - CHORD)
  })

  test("isoparametric: the lines of constant v of a parametric patch, dropped onto the part", () => {
    const surface = (u: number, v: number) => ({ x: -8 + 16 * u, y: -8 + 16 * v, z: 0 })
    const r = generateDriven(params({ stepover: 50 }), { kind: "isoparametric", surface, direction: "u" }, part, ball(4), stock)
    expect(r.stats.curves).toBeGreaterThanOrEqual(8)
    const ys = [...new Set(cutsOf(r.toolpath.moves).filter((p) => p.z < 1).map((p) => Math.round(p.y * 100) / 100))]
    // Constant-y lines, spaced by the stepover (2 mm) across 16 mm.
    expect(ys.length).toBe(r.stats.curves)
    for (const p of cutsOf(r.toolpath.moves).filter((q) => q.z < 1 && Math.hypot(q.x, q.y) < 8)) expect(p.z).toBeGreaterThanOrEqual(sphereTip(p.x, p.y, 2) - CHORD)
  })

  test("equidistant: the boundary and its inward offsets, each on the surface", () => {
    const boundary = [{ x: -8, y: -8 }, { x: 8, y: -8 }, { x: 8, y: 8 }, { x: -8, y: 8 }]
    const r = generateDriven(params({ stepover: 25 }), { kind: "equidistant", boundary }, part, ball(4), stock)
    // Offsets every 1 mm from 0 to 7 (the square collapses at 8): 8 loops.
    expect(r.stats.curves).toBe(8)
    for (const p of cutsOf(r.toolpath.moves).filter((q) => q.z < 1 && Math.hypot(q.x, q.y) < 8)) expect(p.z).toBeGreaterThanOrEqual(sphereTip(p.x, p.y, 2) - CHORD)
  })

  test("deburr: the top edges of a box are broken at the cone offset and depth; down-facing and vertical edges are reported", () => {
    const r = generateDriven(params({ width: 0.5, tipOffset: 0.2 }), { kind: "deburr" }, box(), vbit, stock)
    // 4 top edges are sharp and breakable; 4 bottom edges face down and 4 vertical edges have no horizontal run.
    expect(r.stats.edges).toBe(12)
    expect(r.stats.skippedEdges).toBe(8)
    expect(r.warnings.join(" ")).toMatch(/face down, run vertically/)
    const cuts = cutsOf(r.toolpath.moves).filter((p) => p.z < 9.9)
    // 90 degrees, pointed tip: tip depth = width + tip offset = 0.7, the cone is 0.7 wide at the surface, so its centre sits 0.7 - 0.5 = 0.2 outside the edge.
    const tipDepth = 0.5 + 0.2
    for (const p of cuts) {
      expect(p.z).toBeCloseTo(10 - tipDepth, 9)
      const outsideBy = Math.max(Math.abs(p.x), Math.abs(p.y)) - 10
      expect(outsideBy).toBeCloseTo(0.2, 6)
    }
    expect(cuts.length).toBeGreaterThan(8)
  })

  test("a cone too small for the chamfer is refused with the reason", () => {
    const tiny: Tool = { ...vbit, diameter: 0.6 }
    const r = generateDriven(params({ width: 2 }), { kind: "deburr" } as DriveSpec, box(), tiny, stock)
    expect(r.warnings[0]).toMatch(/needs Ø/)
    expect(cutsOf(r.toolpath.moves)).toEqual([])
  })

  test("curves off the part are split out and counted, not cut in the air", () => {
    const r = generateDriven(params(), { kind: "projection", curves: [[{ x: -30, y: 0 }, { x: 30, y: 0 }]] }, part, ball(4), stock)
    expect(r.stats.dropped).toBeGreaterThan(0)
    for (const p of cutsOf(r.toolpath.moves).filter((q) => q.z < 1)) expect(Math.hypot(p.x, p.y)).toBeLessThan(12.1)
  })
})
