import { describe, expect, test } from "bun:test"
import { makeProgram, type Move } from "../../src/cam/ir.ts"
import { posts } from "../../src/cam/post/index.ts"
import { klartextCycle } from "../../src/cam/post/klartext-cycles.ts"
import { threadMillMoves } from "../../src/cam/operations/thread-mill.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const program = (moves: Move[], units: "mm" | "inch" = "mm") => ({ ...makeProgram("H", [{ id: "a", name: "a", toolId: "T1", spindleRpm: 1000, coolant: "off", moves }]), units })
const hole = (x: number, cycle: string, extra: Record<string, unknown> = {}): Move =>
  ({ _tag: "Cycle", cycle, to: { x, y: 10, z: -12 }, feed: 150, peckDepth: 4, dwellSeconds: 0, retractHeight: 2, ...extra }) as Move
const start: Move = { _tag: "Rapid", to: { x: 0, y: 0, z: 20 } }
const end: Move = { _tag: "Rapid", to: { x: 60, y: 60, z: 20 } }

/** The feed moves of a replay, in order. */
const cutsOf = (nc: string) => {
  const r = interpretGcode(nc)
  return { errors: r.errors, cuts: r.segments.flatMap((s) => (s.kind === "linear" ? [[s.to.x, s.to.y, s.to.z] as const] : [])), minZ: r.minZ, dwells: r.segments.filter((s) => s.kind === "dwell").length }
}

describe("Heidenhain drilling is the control's own fixed cycle (spec 69 G4c.1)", () => {
  test("a drilling move is cycle 200, defined once and called with M99 at each hole", () => {
    const nc = posts.heidenhain.emit(program([start, hole(10, "drill"), hole(30, "drill"), end]), {})
    expect(nc.match(/CYCL DEF 200 DRILLING ~/g)?.length).toBe(1)
    expect(nc).toMatch(/Q201=-14 ;DEPTH ~/)
    expect(nc).toMatch(/Q203=\+2 ;SURFACE COORDINATE ~/)
    expect(nc).toMatch(/\d+ L X\+10\.000 Y\+10\.000 R0 FMAX M99/)
    expect(nc).toMatch(/\d+ L X\+30\.000 Y\+10\.000 R0 FMAX M99/)
    // The rows of a definition carry no block number of their own.
    expect(nc).toMatch(/\n {2}Q200=\+0 ;SET-UP CLEARANCE ~\n {2}Q201=/)
  })

  test("a different hole redefines the cycle, the same one does not", () => {
    const nc = posts.heidenhain.emit(program([start, hole(10, "drill"), hole(20, "drill"), hole(30, "drill", { to: { x: 30, y: 10, z: -20 } }), end]), {})
    expect(nc.match(/CYCL DEF 200 DRILLING ~/g)?.length).toBe(2)
    expect(nc).toMatch(/Q201=-22/)
  })

  const kinds: Array<[string, Record<string, unknown>, RegExp]> = [
    ["drill", {}, /CYCL DEF 200 DRILLING/],
    ["dwell", { dwellSeconds: 0.5 }, /CYCL DEF 200 DRILLING[\s\S]*Q211=\+0\.5/],
    ["peck", {}, /CYCL DEF 205 UNIVERSAL PECKING[\s\S]*Q202=\+4 ;PLUNGING DEPTH/],
    ["chipBreak", {}, /CYCL DEF 205 UNIVERSAL PECKING[\s\S]*Q257=\+4[\s\S]*Q256=\+0\.5/],
    ["ream", {}, /CYCL DEF 201 REAMING/],
    ["bore", {}, /CYCL DEF 202 BORING/],
    ["tap", { pitch: 1.5, feed: 1500 }, /CYCL DEF 207 RIGID TAPPING[\s\S]*Q239=\+1\.5 ;PITCH/]
  ]
  for (const [kind, extra, pattern] of kinds) {
    test(`${kind}: the cycle of the manual, and a replay that drills where the expansion does`, () => {
      const holes = [hole(10, kind, extra), hole(30, kind, extra)]
      const nc = posts.heidenhain.emit(program([start, ...holes, end]), {})
      expect(nc).toMatch(pattern)
      const native = cutsOf(nc)
      expect(native.errors).toEqual([])
      expect(native.minZ).toBeCloseTo(-12, 9)
      // Both holes are made, at their own place, down to the bottom.
      for (const x of [10, 30]) expect(native.cuts.some(([cx, cy, cz]) => cx === x && cy === 10 && Math.abs(cz + 12) < 1e-9)).toBe(true)
      if (kind === "tap") return // no expansion of a rigid tapping cycle exists: a post without the cycle refuses it
      const expanded = cutsOf(posts.generic.emit(program([start, ...holes, end]), { useCannedCycles: false }))
      // The same feed moves in the same order: a drill, pecks with full retracts, the feed in and out of a reamer.
      expect(native.cuts).toEqual(expanded.cuts)
    })
  }

  test("a dwell at the bottom is replayed as a dwell", () => {
    expect(cutsOf(posts.heidenhain.emit(program([start, hole(10, "dwell", { dwellSeconds: 0.5 }), end]), {})).dwells).toBe(1)
  })

  test("M functions land on the positioning block of the cycle, and the program still ends", () => {
    const nc = posts.heidenhain.emit(program([start, hole(10, "drill"), end]), {})
    expect(nc.trimEnd().split("\n").slice(-2)[0]).toMatch(/M5 M30$/)
    expect(nc).toMatch(/L X\+0\.000 Y\+0\.000 Z\+20\.000 R0 FMAX M3/)
  })

  test("inch programs keep the expansion (the cycle feeds are not in 1/10 inch/min)", () => {
    const nc = posts.heidenhain.emit(program([start, hole(10, "drill"), end], "inch"), {})
    expect(nc).not.toMatch(/CYCL DEF 200/)
  })

  test("a hole whose bottom is not below the R plane is refused", () => {
    expect(() => klartextCycle(hole(10, "drill", { to: { x: 10, y: 10, z: 3 } }) as never, 3)).toThrow(/below the R plane/)
  })
})

describe("thread milling cycles written from marked moves (spec 69 G4c.2)", () => {
  const t = { center: { x: 20, y: 10 }, surface: 0, clearance: 2, secondClearance: 10, length: 6, diameter: 10, pitch: 1.5, toolRadius: 2, internal: false, rightHand: true, climb: true, feed: 200 }
  const marked = (internal: boolean): Move[] => {
    const tt = { ...t, internal }
    return [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 20 } },
      { _tag: "CycleBegin", family: "heidenhain", number: internal ? 262 : 267, name: "THREAD", params: { x: 20, y: 10, Q335: 10, Q239: 1.5, Q201: -6, Q200: 2, Q203: 0, Q204: 10, Q207: 200 } },
      ...threadMillMoves(tt),
      { _tag: "CycleEnd" }
    ]
  }
  const nc = (internal: boolean) => posts.heidenhain.emit(program(marked(internal)), { nativeCycles: true })

  test("outside thread milling is 267, the cutter runs round the boss at (D + d) / 2, clockwise for climb milling", () => {
    const text = nc(false)
    expect(text).toMatch(/CYCL DEF 267 OUTSIDE THREAD MILLING ~/)
    expect(text).toMatch(/Q358=\+0 ;DEPTH FOR COUNTERSINKING/)
    const run = interpretGcode(text, { toolRadius: () => 2 })
    const arcs = run.segments.flatMap((s) => (s.kind === "arc" ? [s] : []))
    expect(arcs).toHaveLength(4)
    for (const a of arcs) { expect(a.radiusStart).toBeCloseTo(7, 6); expect(a.clockwise).toBe(true); expect(a.to.z - a.from.z).toBeCloseTo(-1.5, 6) }
    expect(arcs[0]!.from.z).toBeCloseTo(0, 6)
  })

  test("inside thread milling is 262, and the moves are written when the option is off", () => {
    expect(nc(true)).toMatch(/CYCL DEF 262 THREAD MILLING ~/)
    const off = posts.heidenhain.emit(program(marked(true)), {})
    expect(off).not.toMatch(/CYCL DEF 262/)
    expect(off.split("\n").length).toBeGreaterThan(100) // the helix is written as the moves it is: lines of a Klartext that cannot turn and rise in one block
  })

  test("a cycle the post does not know, or a parameter it lacks, is refused with its name", () => {
    expect(() => posts.heidenhain.emit(program([{ _tag: "CycleBegin", family: "heidenhain", number: 999, name: "X", params: { x: 0, y: 0 } } as Move, { _tag: "CycleEnd" }]), { nativeCycles: true })).toThrow(/cycle 999 is not one this post writes/)
    expect(() => posts.heidenhain.emit(program([{ _tag: "CycleBegin", family: "heidenhain", number: 262, name: "X", params: { x: 0, y: 0 } } as Move, { _tag: "CycleEnd" }]), { nativeCycles: true })).toThrow(/needs Q335/)
  })
})
