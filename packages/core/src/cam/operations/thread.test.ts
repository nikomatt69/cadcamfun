import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { ArcMove, Move } from "../ir.ts"
import { makeProgram } from "../ir.ts"
import { genericPost } from "../post/generic.ts"
import type { Stock, Tool } from "../tool.ts"
import { EXTERNAL_THREAD_DEPTH, INTERNAL_THREAD_DEPTH, ThreadParams, generateThread, threadMinorDiameter } from "./thread.ts"

const mill = (d: number): Tool => ({ id: "t", name: "thread mill", kind: "endmill", diameter: d, flutes: 3, maxRpm: 20000 })
const stock: Stock = { x: 50, y: 50, z: 20, origin: { x: -25, y: -25, z: 0 }, material: "aluminum" }
const params = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(ThreadParams)({ totalDepth: 9, diameter: 10, pitch: 1.5, x: 4, y: -3, feed: 300, plungeFeed: 100, ...extra })
const arcs = (moves: ReadonlyArray<Move>) => moves.filter((m): m is ArcMove => m._tag === "Arc")
/** Radius of an arc about its own centre (taken from its end point). */
const radiusOf = (a: ArcMove) => Math.hypot(a.to.x - a.center.x, a.to.y - a.center.y)

describe("thread milling geometry", () => {
  test("an internal M10x1.5 right-hand thread: the centre runs on radius (D - d) / 2, rising one pitch a turn, counter-clockwise (climb)", () => {
    const r = generateThread(params({ passes: 1 }), mill(6), stock)
    expect(r.warnings).toEqual([])
    expect(r.stats.minorDiameter).toBeCloseTo(10 - 2 * INTERNAL_THREAD_DEPTH * 1.5, 9)
    expect(r.stats.radii).toEqual([2])
    expect(r.stats.revolutions).toBeCloseTo(6, 9)
    const helix = arcs(r.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - 2) < 1e-9 && Math.abs(a.center.x - 4) < 1e-9 && Math.abs(a.center.y + 3) < 1e-9)
    // Six full turns, each climbing one pitch, starting at the bottom (-9) and ending at the top (0).
    expect(helix).toHaveLength(6)
    expect(helix.map((a) => a.clockwise)).toEqual(Array(6).fill(false))
    expect(helix.map((a) => a.to.z)).toEqual([-7.5, -6, -4.5, -3, -1.5, 0].map((z) => expect.closeTo(z, 9)))
  })

  test("a left-hand thread runs the other way up: it starts at the top and descends", () => {
    const r = generateThread(params({ passes: 1, rightHand: false }), mill(6), stock)
    const helix = arcs(r.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - 2) < 1e-9 && Math.abs(a.center.x - 4) < 1e-9)
    expect(helix.map((a) => a.clockwise)).toEqual(Array(6).fill(false))
    expect(helix.map((a) => a.to.z)[0]).toBeCloseTo(-1.5, 9)
    expect(helix.at(-1)!.to.z).toBeCloseTo(-9, 9)
  })

  test("conventional milling reverses the way round, and an external thread climbs clockwise and descends", () => {
    const conventional = generateThread(params({ passes: 1, climb: false }), mill(6), stock)
    expect(arcs(conventional.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - 2) < 1e-9 && Math.abs(a.center.x - 4) < 1e-9).every((a) => a.clockwise)).toBe(true)
    // Right-hand, clockwise travel descends: the same helix traversed from the top.
    const external = generateThread(params({ passes: 1, internal: false, diameter: 12 }), mill(6), stock)
    const minor = threadMinorDiameter(12, 1.5, false)
    expect(minor).toBeCloseTo(12 - 2 * EXTERNAL_THREAD_DEPTH * 1.5, 9)
    const full = (minor + 6) / 2
    expect(external.stats.radii).toEqual([expect.closeTo(full, 9)])
    const helix = arcs(external.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - full) < 1e-9 && Math.abs(a.center.x - 4) < 1e-9)
    expect(helix).toHaveLength(6)
    expect(helix.every((a) => a.clockwise)).toBe(true)
    expect(helix[0]!.to.z).toBeCloseTo(-1.5, 9)
    expect(helix.at(-1)!.to.z).toBeCloseTo(-9, 9)
  })

  test("radial passes grow from the first cut to the full depth, and spring passes repeat the last", () => {
    const r = generateThread(params({ passes: 3, springPasses: 1 }), mill(6), stock)
    const minorCentre = (threadMinorDiameter(10, 1.5, true) - 6) / 2
    expect(r.stats.radii).toHaveLength(4)
    expect(r.stats.radii[0]!).toBeCloseTo(minorCentre, 9)
    expect(r.stats.radii[1]!).toBeCloseTo((minorCentre + 2) / 2, 9)
    expect(r.stats.radii[2]!).toBeCloseTo(2, 9)
    expect(r.stats.radii[3]!).toBeCloseTo(2, 9)
  })

  test("a part turn at the end when the depth is not a whole number of pitches", () => {
    const r = generateThread(params({ passes: 1, totalDepth: 8 }), mill(6), stock)
    const helix = arcs(r.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - 2) < 1e-9 && Math.abs(a.center.x - 4) < 1e-9)
    expect(helix).toHaveLength(6) // five full turns and the rest of one
    expect(helix.at(-1)!.to.z).toBeCloseTo(0, 9)
    const last = helix.at(-1)!
    // 8 / 1.5 = 5.333 turns: the last arc ends a third of the way round (120 degrees counter-clockwise).
    expect(Math.atan2(last.to.y - last.center.y, last.to.x - last.center.x)).toBeCloseTo((2 * Math.PI) / 3, 6)
  })

  test("the feed along the centre line is scaled to keep the feed at the edge: slower in a hole, faster round a boss", () => {
    const inside = generateThread(params({ passes: 1 }), mill(6), stock)
    const insideFeeds = arcs(inside.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - 2) < 1e-9).map((a) => a.feed)
    expect(insideFeeds[0]!).toBeCloseTo(300 * (2 / 5), 9) // r / (r + d/2) = 2 / 5
    const outside = generateThread(params({ passes: 1, internal: false, diameter: 12 }), mill(6), stock)
    const full = (threadMinorDiameter(12, 1.5, false) + 6) / 2
    const outsideFeeds = arcs(outside.toolpath.moves).filter((a) => Math.abs(radiusOf(a) - full) < 1e-9).map((a) => a.feed)
    expect(outsideFeeds[0]!).toBeCloseTo(300 * (full / (full - 3)), 9)
    expect(generateThread(params({ passes: 1, compensateFeed: false }), mill(6), stock).toolpath.moves.some((m) => m._tag === "Arc" && m.feed !== 300)).toBe(false)
  })

  test("the entry arc is tangent to the helix: a half circle from the axis inside a hole", () => {
    const r = generateThread(params({ passes: 1 }), mill(6), stock)
    const entry = arcs(r.toolpath.moves)[0]!
    // From the axis (4, -3) to the start of the helix (4 + r, -3) round a centre half way, counter-clockwise.
    expect(entry.to.x).toBeCloseTo(6, 9)
    expect(entry.to.y).toBeCloseTo(-3, 9)
    expect(entry.center.x).toBeCloseTo(5, 9)
    expect(entry.center.y).toBeCloseTo(-3, 9)
    expect(entry.clockwise).toBe(false)
  })

  test("a cutter that does not fit the minor diameter cuts nothing and says why", () => {
    const r = generateThread(params({}), mill(8.5), stock)
    expect(r.warnings.join(" ")).toContain("does not fit the minor diameter")
    expect(arcs(r.toolpath.moves)).toHaveLength(0)
    expect(generateThread(params({}), { ...mill(3), kind: "drill" }, stock).warnings.join(" ")).toContain("drill cannot mill a thread")
  })

  test("it never feeds in XY below the top outside the thread: the tool is over the hole when it comes down", () => {
    const r = generateThread(params({ passes: 2 }), mill(6), stock)
    let at = { x: 0, y: 0, z: 10 }
    for (const m of r.toolpath.moves) {
      if (m._tag === "Rapid") {
        const sideways = Math.hypot(m.to.x - at.x, m.to.y - at.y) > 1e-9
        if (sideways) expect(Math.min(at.z, m.to.z)).toBeGreaterThanOrEqual(-1e-9)
      }
      if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") at = { ...m.to }
    }
  })

  test("it emits as ordinary G-code: one helical arc block a turn, the motion word written once (modal G3)", () => {
    const r = generateThread(params({ passes: 1 }), mill(6), stock)
    const text = genericPost.emit(makeProgram("thread", [r.toolpath]))
    const lines = text.split("\n")
    const helical = lines.filter((l) => /\bI-?\d/.test(l) && /\bZ-?\d/.test(l))
    expect(helical).toHaveLength(6)
    expect(helical.map((l) => Number(/Z(-?\d+\.\d+)/.exec(l)![1]))).toEqual([-7.5, -6, -4.5, -3, -1.5, 0])
    expect(helical.every((l) => l.includes("I-2.000 J0.000"))).toBe(true) // the centre is two millimetres back from each turn's start
    expect(lines.filter((l) => l.startsWith("G3")).length).toBe(1)
    expect(text).toMatch(/thread mill/i)
  })
})
