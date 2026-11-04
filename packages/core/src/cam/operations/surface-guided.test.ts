import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { buildPartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import { GuidedParams, coonsLines, generateGuided, resample, type GuidedInput } from "./surface-guided.ts"

setDefaultTimeout(90_000)

const ball: Tool = { id: "b", name: "ball", kind: "ballnose", diameter: 4, flutes: 2, maxRpm: 20000 }
const stock: Stock = { x: 24, y: 24, z: 12, origin: { x: -12, y: -12, z: 0 }, material: "aluminum" }
const sphere = () => buildPartModel([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: -10 }], { cell: 0.1, tolerance: 0.002 })!
/** Tool-centre height of a ball of radius 2 riding a sphere of radius 10 (top at z = 0). */
const tip = (rho: number): number => Math.sqrt(12 ** 2 - rho ** 2) - 12
const params = (extra: Record<string, unknown> = {}) => Schema.decodeUnknownSync(GuidedParams)({ totalDepth: 12, stepdown: 3, ...extra })
const cuts = (r: ReturnType<typeof generateGuided>) => r.toolpath.moves.flatMap((m) => (m._tag === "Linear" && m.feed !== 300 ? [m.to] : []))
const line = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y1 }]
const part = sphere()
/** The sampler is conservative: never below the analytic tool-centre height (no gouge), above it by at most slope x half a cell plus the tessellation. */
const expectRides = (p: { x: number; y: number; z: number }): void => {
  const d = p.z - tip(Math.hypot(p.x, p.y))
  expect(d).toBeGreaterThan(-0.02)
  expect(d).toBeLessThan(0.15)
}

describe("guide-curve finishing", () => {
  test("projection drops a circle onto the sphere at the ball's tool-centre height", () => {
    const circle = Array.from({ length: 73 }, (_, i) => ({ x: 5 * Math.cos((i * 2 * Math.PI) / 72), y: 5 * Math.sin((i * 2 * Math.PI) / 72) }))
    const r = generateGuided(params(), part, ball, stock, { mode: "projection", curves: [circle] })
    const c = cuts(r)
    expect(c.length).toBeGreaterThan(20)
    for (const p of c) expectRides(p)
  })
  test("morph spaces lines within the stepover in plan; flowline needs more lines on a steep part", () => {
    const input = (mode: "morph" | "flowline"): GuidedInput => ({ mode, from: line(-9, 0, 9, 0), to: line(-9, 8, 9, 8) })
    // the lines run across the dome (centre at y=0): XY distance 8 mm, but the surface is steeper than flat at the edge
    const morph = generateGuided(params({ stepover: 10 }), part, ball, stock, input("morph"))
    const flow = generateGuided(params({ stepover: 10 }), part, ball, stock, input("flowline"))
    expect(morph.stats.curves).toBe(Math.ceil(8 / 0.4) + 1)
    expect(flow.stats.curves).toBeGreaterThanOrEqual(morph.stats.curves)
    expect(flow.stats.runs).toBeGreaterThan(0)
  })
  test("isoparametric lines follow a Coons patch and ride the surface", () => {
    const sq = { bottom: line(-6, -6, 6, -6), top: line(-6, 6, 6, 6), left: line(-6, -6, -6, 6), right: line(6, -6, 6, 6) }
    const r = generateGuided(params({ stepover: 25 }), part, ball, stock, { mode: "isoparametric", ...sq })
    expect(r.stats.curves).toBe(Math.ceil(12 / 1) + 1)
    for (const p of cuts(r)) expectRides(p)
    const lines = coonsLines(sq.bottom, sq.top, sq.left, sq.right, 3, 5)
    expect(lines[1]![2]).toEqual({ x: 0, y: 0 })
  })
  test("boundary curves that do not meet are refused; a curve off the part cuts nothing and says so", () => {
    expect(() => generateGuided(params(), part, ball, stock, { mode: "isoparametric", bottom: line(-6, -6, 6, -6), top: line(-6, 6, 6, 6), left: line(-6, -6, -6, 6), right: line(7, -6, 7, 6) })).toThrow(/do not meet/)
    const off = generateGuided(params(), part, ball, stock, { mode: "projection", curves: [line(100, 100, 120, 100)] })
    expect(off.stats.runs).toBe(0)
    expect(off.warnings.join(" ")).toContain("nothing was cut")
  })
  test("resample keeps both ends and equal spacing", () => {
    const r = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 5)
    expect(r[0]).toEqual({ x: 0, y: 0 })
    expect(r[4]).toEqual({ x: 10, y: 10 })
    expect(r[2]).toEqual({ x: 10, y: 0 })
  })
})
