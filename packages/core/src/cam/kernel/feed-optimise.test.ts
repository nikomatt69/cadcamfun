import { describe, expect, test } from "bun:test"
import type { Move } from "../ir.ts"
import { cuttingData, type MachineLimits } from "./cutting-data.ts"
import type { Cutter } from "./cutters.ts"
import { stepLoad, stockBlock } from "./engagement.ts"
import { optimizeFeeds, splitProgram } from "./feed-optimise.ts"
import { findMaterial } from "./materials.ts"

const cutter: Cutter = { id: "t", name: "em10", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 25, shankDiameter: 10, stickout: 45 }
const machine: MachineLimits = { maxRpm: 12000, maxFeed: 9000, powerKw: 11, torqueNm: 60 }
const material = findMaterial("steel-c45")!

/** A 70 x 40 pocket, 3 mm deep, roughed by a centre slot and then parallel passes at 3 mm stepover with a rapid-free zigzag. */
const pocket = (): { moves: Move[]; feed: number; rpm: number } => {
  const d = cuttingData({ material, cutter, cut: "rough-side", machine })
  // The fixed feed of a hand-made program: the largest the heaviest cut (the full-width centre slot, 3 mm deep) takes inside every limit.
  const settings = { material, cutter, machine, rpm: d.rpm }
  let f = 50
  while (stepLoad(settings, 10, 3, f + 10).ratio <= 0.98) f += 10
  const z = -3
  const moves: Move[] = [{ _tag: "Rapid", to: { x: 5, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 5, y: 0, z }, feed: Math.round(f / 3) }]
  // Centre slot, then passes outwards on both sides (the shoulder cuts are the light ones).
  moves.push({ _tag: "Linear", to: { x: 65, y: 0, z }, feed: f })
  for (const side of [1, -1]) {
    for (let k = 1; k <= 4; k++) {
      const y = side * k * 3
      moves.push({ _tag: "Linear", to: { x: k % 2 ? 65 : 5, y: moves.length ? (moves[moves.length - 1] as { to: { y: number } }).to.y : 0, z }, feed: f })
      moves.push({ _tag: "Linear", to: { x: k % 2 ? 65 : 5, y, z }, feed: f })
      moves.push({ _tag: "Linear", to: { x: k % 2 ? 5 : 65, y, z }, feed: f })
    }
    moves.push({ _tag: "Rapid", to: { x: 65, y: 0, z: 5 } })
    moves.push({ _tag: "Rapid", to: { x: 5, y: 0, z: 5 } })
    moves.push({ _tag: "Linear", to: { x: 5, y: 0, z }, feed: Math.round(f / 3) })
  }
  return { moves, feed: f, rpm: d.rpm }
}

describe("feed optimisation (spec 61 Z3)", () => {
  const stock = () => stockBlock(-20, -25, 80, 25, -10, 0, 0.5)

  test("off returns the very same program", () => {
    const { moves, rpm } = pocket()
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine, rpm, mode: "off" })
    expect(r.moves).toBe(moves)
    expect(r.report.changed).toBe(0)
  })

  test("constant power: no move above a limit, feed <= machine maximum, slew respected, geometry unchanged, cycle time reduced", () => {
    const { moves, rpm, feed } = pocket()
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine, rpm, mode: "power" })
    expect(r.report.changed).toBeGreaterThan(0)
    // Every judged piece is inside every limit at the engagement the bound allows.
    expect(r.report.claimAfter).not.toBe("failed")
    expect(r.report.worstRatioAfter).toBeLessThanOrEqual(1 + 1e-9)
    // The fixed-feed program is judged by the same measure.
    expect(r.report.worstRatioBefore).toBeGreaterThan(0)
    const feeds = r.moves.flatMap((m) => (m._tag === "Linear" ? [m.feed] : []))
    expect(Math.max(...feeds)).toBeLessThanOrEqual(machine.maxFeed)
    expect(Math.max(...feeds)).toBeLessThanOrEqual(3 * feed + 1)
    // Slew: consecutive cutting pieces of one run differ by at most 30 % (rounded feeds: a tolerance of 1 mm/min).
    let prev: number | undefined
    for (const m of r.moves) {
      if (m._tag === "Rapid") { prev = undefined; continue }
      if (m._tag !== "Linear") continue
      if (prev !== undefined && m.feed !== prev && m.feed !== Math.round(feed / 3) && prev !== Math.round(feed / 3)) expect(Math.max(m.feed, prev) / Math.min(m.feed, prev)).toBeLessThanOrEqual(1.3 + 0.02)
      prev = m.feed
    }
    // Geometry: the pieces end where the original moves ended, in order.
    const ends = (list: ReadonlyArray<Move>): string[] => list.flatMap((m) => (m._tag === "Linear" || m._tag === "Rapid" ? [`${m.to.x.toFixed(6)},${m.to.y.toFixed(6)},${m.to.z.toFixed(6)}`] : []))
    const split = splitProgram(moves, { x: 5, y: 0, z: 5 }, 5)
    expect(ends(r.moves)).toEqual(ends(split))
    // The measurable result on this synthetic pocket.
    console.log(`pocket cut time ${r.report.cutSecondsBefore.toFixed(1)} s -> ${r.report.cutSecondsAfter.toFixed(1)} s (${(100 * r.report.cutTimeSaved).toFixed(1)} % saved), worst load ratio ${r.report.worstRatioBefore.toFixed(2)} -> ${r.report.worstRatioAfter.toFixed(2)}`)
    expect(r.report.cutTimeSaved).toBeGreaterThanOrEqual(0.1)
  })

  test("constant chip load keeps every move inside every limit (its gain is small for stepovers near D/2: the chip is already thick)", () => {
    const { moves, rpm } = pocket()
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine, rpm, mode: "chip" })
    expect(r.report.claimAfter).toBe("passed")
    expect(r.report.worstRatioAfter).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.report.chip).toBeGreaterThan(0)
  })

  test("constant power at half the spindle holds the load and never exceeds the limit", () => {
    const { moves, rpm } = pocket()
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine, rpm, mode: "power", powerShare: 0.5 })
    expect(r.report.worstRatioAfter).toBeLessThanOrEqual(1 + 1e-9)
    for (const l of r.loadsAfter) if (l.status === "resolved") expect(l.powerPeakKw / 0.8).toBeLessThanOrEqual(0.5 * 11 * 1.02 + 1e-6)
  })

  test("a tighter machine makes a limit bind and the report says which", () => {
    const { moves, rpm } = pocket()
    const weak: MachineLimits = { ...machine, powerKw: 0.4 }
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine: weak, rpm, mode: "chip" })
    expect(r.report.worstRatioAfter).toBeLessThanOrEqual(1 + 1e-9)
    expect(Object.keys(r.report.bound).some((k) => /power|torque|deflection/.test(k))).toBe(true)
  })

  test("moves with rotary words keep their feed and the claim stays unresolved", () => {
    const moves: Move[] = [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
      { _tag: "Linear", to: { x: 20, y: 0, z: -1 }, feed: 700, rotary: { a: 20 } }
    ]
    const r = optimizeFeeds({ moves, stock: stock(), cutter, material, machine, rpm: 4000, mode: "chip" })
    expect(r.report.unresolved).toBeGreaterThanOrEqual(1)
    expect(r.report.changed).toBe(0)
    expect(r.report.claimAfter).toBe("unresolved")
    expect(r.moves.filter((m) => m._tag === "Linear").every((m) => m._tag === "Linear" && m.feed === 700 && m.rotary?.a === 20)).toBe(true)
  })
})
