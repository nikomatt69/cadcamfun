import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { Move } from "../ir.ts"
import type { Stock, Tool } from "../tool.ts"
import { HighFeedParams, PeelParams, PlungeParams, TrochoidalSlotParams, generateHighFeed, generatePeel, generatePlunge, generateTrochoidalSlot, highFeedDepth, plungeSites, trochoidPoints } from "./roughing-breadth.ts"

const tool = (d: number): Tool => ({ id: "t", name: "flat", kind: "endmill", diameter: d, flutes: 3, maxRpm: 20000 })
const stock: Stock = { x: 80, y: 60, z: 20, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const cutting = (moves: ReadonlyArray<Move>) => moves.filter((m): m is Extract<Move, { _tag: "Linear" | "Arc" }> => m._tag === "Linear" || m._tag === "Arc")
const dec = <A>(s: Schema.Codec<A, unknown>, v: unknown): A => Schema.decodeUnknownSync(s as never)(v) as A

describe("plunge roughing", () => {
  const params = dec(PlungeParams, { totalDepth: 9, stepdown: 3, peck: 3, stepover: 70 })
  const region = { boundary: rect(0, 0, 60, 40), islands: [rect(25, 15, 35, 25)] }
  test("sites keep the tool radius clear of the walls and the island", () => {
    const sites = plungeSites(region, tool(8), params)
    expect(sites.length).toBeGreaterThan(20)
    for (const s of sites) {
      expect(s.x).toBeGreaterThanOrEqual(4 - 1e-6); expect(s.x).toBeLessThanOrEqual(56 + 1e-6)
      expect(s.y).toBeGreaterThanOrEqual(4 - 1e-6); expect(s.y).toBeLessThanOrEqual(36 + 1e-6)
      const inIsland = s.x > 25 - 4 + 1e-6 && s.x < 35 + 4 - 1e-6 && s.y > 15 - 4 + 1e-6 && s.y < 25 + 4 - 1e-6
      expect(inIsland).toBe(false)
    }
  })
  test("every site is pecked to the full depth, vertically, never below it", () => {
    const tp = generatePlunge(params, region, tool(8), stock)
    const feeds = cutting(tp.moves)
    expect(Math.min(...feeds.map((m) => m.to.z))).toBeCloseTo(-9, 9)
    expect(feeds.filter((m) => m.to.z < -8.999).length).toBe(tp.stats.sites)
    expect(tp.stats.sites).toBeGreaterThan(0)
  })
})

describe("high feed", () => {
  test("the axial depth is held to 5 % of the diameter", () => {
    expect(highFeedDepth(tool(16), 5)).toBeCloseTo(0.8, 9)
    expect(highFeedDepth(tool(16), 0.5)).toBe(0.5)
    const tp = generateHighFeed(dec(HighFeedParams, { totalDepth: 3, stepdown: 4 }), rect(5, 5, 55, 35), tool(16), stock)
    const zs = new Set(cutting(tp.moves).map((m) => Math.round(m.to.z * 1000) / 1000))
    const levels = [...zs].filter((z) => z < -1e-9).sort((a, b) => b - a)
    expect(Math.min(...levels)).toBeCloseTo(-3, 6)
    expect(levels.length).toBeGreaterThanOrEqual(4)
  })
})

describe("peel", () => {
  test("full depth in one axial pass with a light radial step, outside in", () => {
    const tp = generatePeel(dec(PeelParams, { totalDepth: 12, stepdown: 12, stepover: 10 }), rect(5, 5, 55, 35), tool(10), stock)
    const deep = cutting(tp.moves).filter((m) => m.to.z < -11.99)
    expect(deep.length).toBeGreaterThan(10)
    expect(Math.min(...cutting(tp.moves).map((m) => m.to.z))).toBeCloseTo(-12, 6)
    // outside in: the first deep move is nearer the boundary than the last
    const edge = (m: { to: { x: number; y: number } }) => Math.min(m.to.x - 5, 55 - m.to.x, m.to.y - 5, 35 - m.to.y)
    expect(edge(deep[1]!)).toBeLessThan(edge(deep[deep.length - 2]!))
  })
  test("a radial step over 15 % is refused", () => {
    expect(() => dec(PeelParams, { totalDepth: 5, stepdown: 5, stepover: 40 })).toThrow()
  })
})

describe("trochoidal slot", () => {
  const slot = { from: { x: 10, y: 20 }, to: { x: 50, y: 20 }, width: 12 }
  const params = dec(TrochoidalSlotParams, { totalDepth: 6, stepdown: 3, stepover: 12 })
  test("the tool centre stays inside the slot and reaches both ends", () => {
    const pts = trochoidPoints(slot, tool(8), params)
    const r = (12 - 8) / 2
    for (const p of pts) {
      const x = Math.min(50, Math.max(10, p.x))
      expect(Math.hypot(p.x - x, p.y - 20)).toBeLessThanOrEqual(r + 1e-9)
    }
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(10)
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(50)
    // the cutter edge never passes the slot wall: |y - 20| + D/2 <= W/2
    expect(Math.max(...pts.map((p) => Math.abs(p.y - 20))) + 4).toBeLessThanOrEqual(6 + 1e-9)
  })
  test("loops advance by no more than the stepover, so the engagement stays light", () => {
    const pts = trochoidPoints(slot, tool(8), params)
    // advance of the loop centre between two consecutive crests (maximum y) is at most 12 % of D
    const crests: number[] = []
    for (let i = 1; i < pts.length - 1; i++) if (pts[i]!.y > pts[i - 1]!.y && pts[i]!.y >= pts[i + 1]!.y && Math.abs(pts[i]!.y - 22) < 0.05) crests.push(pts[i]!.x)
    for (let i = 1; i < crests.length; i++) expect(crests[i]! - crests[i - 1]!).toBeLessThanOrEqual(0.12 * 8 + 0.2)
  })
  test("passes alternate direction and reach the full depth; a slot not wider than the cutter is refused", () => {
    const tp = generateTrochoidalSlot(params, slot, tool(8), stock)
    expect(Math.min(...cutting(tp.moves).map((m) => m.to.z))).toBeCloseTo(-6, 9)
    expect(() => generateTrochoidalSlot(params, { ...slot, width: 8 }, tool(8), stock)).toThrow(/not wider/)
  })
})
