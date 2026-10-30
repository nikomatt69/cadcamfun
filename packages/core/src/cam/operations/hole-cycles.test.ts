import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { expandCycle, moveTarget, type Move } from "../ir.ts"
import { anglesFor, partToMachine, tableRotation, type RotaryAngles, type RotaryLayout } from "../indexing.ts"
import { DEFAULT_CUTTERS, countersinkDepth, findCutter, pointLength, type Cutter } from "../kernel/cutters.ts"
import { TriDexel, toolSolid } from "../kernel/tridexel.ts"
import { BACK_BORE_CLEARANCE, backBoreShift, generateBackBore, generateCountersink, generateDeepHole, generateHoleCycle, generateTiltedDrill, peckSchedule, type HoleCycleInput, type HoleIndexing } from "./hole-cycles.ts"
import type { HoleCycle } from "../kernel/contracts.ts"

const lib = (id: string): Cutter => findCutter(DEFAULT_CUTTERS, id)!
const flat = (d: number): Cutter => ({ id: `f${d}`, name: `flat ${d}`, kind: "flat", diameter: d, flutes: 3, material: "carbide", coating: "none", fluteLength: 60, shankDiameter: d, stickout: 70 })
const drill = (d: number, angle = 140): Cutter => ({ id: `drill-${d}`, name: `drill ${d}`, kind: "drill", diameter: d, flutes: 2, material: "carbide", coating: "tin", angle, fluteLength: 60, shankDiameter: d, stickout: 80 })

// ---------------------------------------------------------------- an independent replay of a toolpath on the tri-dexel stock

interface Replay {
  /** Moves seen with the tool inside the material's Z range, for the assertions. */
  readonly tips: Array<{ readonly part: Vec3; readonly axis: Vec3; readonly machine: Vec3; readonly angles: RotaryAngles }>
}

/**
 * Removes material with the cutter along the toolpath, in PART coordinates: canned cycles are expanded, an `Orient` turns the table and
 * the machine tip is carried back into the part (`part = R^T (m - pivot) + pivot`, tool axis = R^T z). It shares nothing with the
 * generators except the move vocabulary; the stock is the oracle.
 */
const replay = (stock: TriDexel, tool: Cutter, moves: ReadonlyArray<Move>, start: Vec3, setup?: { layout: RotaryLayout; pivot: Vec3 }, stopped?: Cutter): Replay => {
  const solid = toolSolid(tool)
  // While the spindle is stopped and oriented (between an M19 comment and the next "spindle start") only the body of the bar exists in
  // the part's frame: a rotating envelope would be wrong there, the insert is a single point.
  const bodySolid = toolSolid(stopped ?? tool)
  let halted = false
  const out: Replay["tips"] = []
  let angles: RotaryAngles = { c: 0 }
  let at = start
  let segment: Array<{ tip: Vec3; axis: Vec3 }> = []
  const flush = (): void => {
    if (segment.length > 0) stock.removePath(halted ? bodySolid : solid, segment.map((s) => s.tip), segment.map((s) => s.axis))
    segment = []
  }
  const push = (m: Vec3): void => {
    let tip = m, axis: Vec3 = { x: 0, y: 0, z: 1 }
    if (setup !== undefined) {
      const r = tableRotation(angles, setup.layout)
      const x = m.x - setup.pivot.x, y = m.y - setup.pivot.y, z = m.z - setup.pivot.z
      tip = { x: r[0] * x + r[3] * y + r[6] * z + setup.pivot.x, y: r[1] * x + r[4] * y + r[7] * z + setup.pivot.y, z: r[2] * x + r[5] * y + r[8] * z + setup.pivot.z }
      axis = { x: r[6], y: r[7], z: r[8] }
    }
    segment.push({ tip, axis })
    out.push({ part: tip, axis, machine: m, angles })
  }
  const run = (move: Move): void => {
    switch (move._tag) {
      case "Rapid": case "Linear": if (segment.length === 0) push(at); push(move.to); at = move.to; break
      case "Cycle": for (const e of expandCycle(move, at)) run(e); at = moveTarget(move)!; break
      case "Comment":
        if (/M19/.test(move.text) || /spindle start/.test(move.text)) { flush(); halted = /M19/.test(move.text) }
        break
      case "Orient": flush(); angles = { ...(move.a !== undefined ? { a: move.a } : {}), ...(move.b !== undefined ? { b: move.b } : {}), c: move.c ?? 0 }; break
      default: break
    }
  }
  push(start)
  for (const m of moves) run(m)
  flush()
  return { tips: out }
}

const tipsOf = (moves: ReadonlyArray<Move>): Vec3[] => moves.flatMap((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [m.to] : []))

const base = (over: Partial<HoleCycleInput> & Pick<HoleCycleInput, "cycle" | "tool">): HoleCycleInput => ({
  id: "op", name: "Hole op", points: [{ x: 0, y: 0 }], top: 20, bottom: 10, clearanceZ: 30, retractZ: 22, feed: 200, rpm: 3000, coolant: "flood", ...over
})

/** Plate x -30..30, y -30..30, z `z0`..`z1` at `cell` mm rays. */
const plate = (cell = 0.2, z1 = 20, z0 = 0): TriDexel => TriDexel.box({ x: -30, y: -30, z: z0 }, { x: 30, y: 30, z: z1 }, cell)

// ---------------------------------------------------------------- countersink

describe("countersink cycle", () => {
  const csk = lib("csk-12-90")
  const cycle: HoleCycle = { kind: "countersink", diameter: 10 }

  test("a dwell cycle to the cone depth of the finished diameter, at the retract plane of each hole", () => {
    const depth = countersinkDepth(csk, 10)
    expect(depth).toBeCloseTo(4.4, 12)
    const tp = generateCountersink(base({ cycle, tool: csk, points: [{ x: 10, y: 0 }, { x: -10, y: 0 }], bottom: 20 - depth }))
    const cycles = tp.moves.filter((m) => m._tag === "Cycle")
    expect(cycles).toHaveLength(2)
    for (const c of cycles) {
      expect(c).toMatchObject({ cycle: "dwell", retractHeight: 22 })
      expect(c._tag === "Cycle" && c.to.z).toBeCloseTo(15.6, 12)
      // Two revolutions at 3000 rpm are 0.04 s: the cycle dwells at least 0.1 s.
      expect(c._tag === "Cycle" && c.dwellSeconds).toBeCloseTo(0.1, 9)
    }
    expect(tp.toolId).toBe("csk-12-90")
    // It ends at the clearance plane, so the next operation never starts inside the hole.
    const last = tp.moves[tp.moves.length - 1]!
    expect(last).toMatchObject({ _tag: "Rapid", to: { z: 30 } })
  })

  test("it removes exactly the cone outside the pilot hole: analytic frustum less the cylinder, on an independent stock", () => {
    const depth = countersinkDepth(csk, 10)
    const s = plate(0.1)
    s.cut(toolSolid(flat(4)), { x: 0, y: 0, z: -1 })
    const before = s.volume()
    const tp = generateCountersink(base({ cycle, tool: csk, bottom: 20 - depth }))
    replay(s, csk, tp.moves, { x: 0, y: 0, z: 30 })
    const removed = before - s.volume()
    // r(t) = 0.6 + t above the tip (90 degrees, flat Ø1.2); the Ø4 pilot is already gone where r(t) < 2, i.e. for t < 1.4.
    const cone = (t: number): number => (0.6 + t) ** 3 / 3 - 4 * t
    const expected = Math.PI * (cone(depth) - cone(1.4))
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.03)
    // The finished diameter at the surface is Ø10.
    expect(s.has({ x: 4.7, y: 0, z: 19.9 })).toBe(false)
    expect(s.has({ x: 5.4, y: 0, z: 19.9 })).toBe(true)
  })

  test("a wrong depth, a wrong tool or a diameter the cone cannot make are refused, never approximated", () => {
    expect(() => generateCountersink(base({ cycle, tool: csk, bottom: 14 }))).toThrow(/reaches Ø10 at 4.4000 mm, but the operation goes 6.0000/)
    expect(() => generateCountersink(base({ cycle, tool: drill(6) }))).toThrow(/needs a countersink cutter/)
    expect(() => generateCountersink(base({ cycle: { kind: "countersink", diameter: 20 }, tool: csk, bottom: 10 }))).toThrow(/Ø12 at most/)
    expect(() => generateCountersink(base({ cycle, tool: csk, bottom: 20 }))).toThrow(/must go down/)
  })

  test("the cone depth follows the included angle: an 82 degree sink is deeper than a 100 degree one for the same diameter", () => {
    expect(countersinkDepth(lib("csk-16-82"), 12)).toBeGreaterThan(countersinkDepth(lib("csk-20-100"), 12))
    expect(countersinkDepth(lib("csk-16-82"), 12)).toBeCloseTo((6 - 0.8) / Math.tan((41 * Math.PI) / 180), 12)
  })
})

// ---------------------------------------------------------------- deep hole

describe("deep-hole peck policy", () => {
  const d = drill(4)
  const tip = pointLength(d)
  const deep = (cycle: HoleCycle & { kind: "deep" }, over: Partial<HoleCycleInput> = {}): HoleCycleInput =>
    base({ cycle, tool: d, top: 20, bottom: -4, ...over, ...(over.points === undefined ? { points: [{ x: 0, y: 0 }] } : {}) })

  test("the schedule shrinks the peck down to its minimum and clips the last one", () => {
    expect(peckSchedule(24, 6, 1, 2)).toEqual([6, 11, 15, 18, 20, 22, 24])
    expect(peckSchedule(10, 4)).toEqual([4, 8, 10])
    // Default minimum with a reduction: a quarter of the first peck.
    expect(peckSchedule(20, 8, 3)).toEqual([8, 13, 15, 17, 19, 20])
    expect(() => peckSchedule(0, 4)).toThrow(RangeError)
  })

  test("full retract: back to the R plane after every peck, down again to 0.5 mm over the last depth", () => {
    const tp = generateDeepHole(deep({ kind: "deep", peck: 6, peckReduction: 1, minPeck: 2, retract: "full" }))
    const feeds = tp.moves.filter((m) => m._tag === "Linear")
    expect(feeds.map((m) => m._tag === "Linear" && m.to.z)).toEqual([14, 9, 5, 2, 0, -2, -4])
    // Between two pecks: rapid to R (22), then rapid to the last depth + 0.5.
    const z = tp.moves.map((m) => (m._tag === "Rapid" || m._tag === "Linear" ? m.to.z : NaN))
    const firstFeed = z.indexOf(14)
    expect(z.slice(firstFeed + 1, firstFeed + 4)).toEqual([22, 14.5, 9])
    // Never a horizontal move below the R plane after the first approach: every move of the hole is at x = y = 0.
    expect(tp.moves.every((m) => m._tag !== "Rapid" && m._tag !== "Linear" ? true : m.to.x === 0 && m.to.y === 0)).toBe(true)
    // The last peck reaches the bottom the operation asked for, then a full retract and the clearance plane.
    expect(feeds[feeds.length - 1]).toMatchObject({ to: { z: -4 } })
  })

  test("chip-break retract lifts 0.5 mm and a full retract comes every third peck", () => {
    const tp = generateDeepHole(deep({ kind: "deep", peck: 6, peckReduction: 1, minPeck: 2, retract: "chip-break", fullRetractEvery: 3, chipBreakRetract: 0.8 }))
    const z = tipsOf(tp.moves).map((p) => Math.round(p.z * 1000) / 1000)
    const at = (depth: number): number => z.indexOf(20 - depth)
    // Peck 1 (6) -> lift 0.8; peck 2 (11) -> lift 0.8; peck 3 (15) -> FULL: R then 0.5 over; peck 4 (18) -> lift; 6th (22) -> FULL.
    expect(z[at(6) + 1]).toBeCloseTo(14.8, 9)
    expect(z[at(11) + 1]).toBeCloseTo(9.8, 9)
    expect(z.slice(at(15) + 1, at(15) + 3)).toEqual([22, 5.5])
    expect(z[at(18) + 1]).toBeCloseTo(2.8, 9)
    expect(z[at(20) + 1]).toBeCloseTo(0.8, 9)
    expect(z.slice(at(22) + 1, at(22) + 3)).toEqual([22, -1.5])
    // Counted: 7 feeds, two full retracts, four short lifts.
    expect(z.filter((v) => v === 22)).toHaveLength(1 + 2 + 1) // approach R, two full retracts, end-of-hole R
  })

  test("dwell at the bottom, several holes in order, clearance plane at the end", () => {
    const tp = generateDeepHole(deep({ kind: "deep", peck: 12, retract: "full", dwell: 0.5 }, { points: [{ x: 0, y: 0 }, { x: 15, y: 0 }] }))
    expect(tp.moves.filter((m) => m._tag === "Dwell")).toEqual([{ _tag: "Dwell", seconds: 0.5 }, { _tag: "Dwell", seconds: 0.5 }])
    expect(tp.moves.filter((m) => m._tag === "Linear")).toHaveLength(2 * 2)
    expect(tp.moves[tp.moves.length - 1]).toMatchObject({ _tag: "Rapid", to: { x: 15, y: 0, z: 30 } })
  })

  test("it removes the drill's cylinder plus its point, nothing more: the rapids back into the hole do not touch the wall", () => {
    const s = plate(0.1, 20, -10)
    const before = s.volume()
    const tp = generateDeepHole(deep({ kind: "deep", peck: 6, peckReduction: 1, minPeck: 2, retract: "chip-break", fullRetractEvery: 3 }))
    replay(s, d, tp.moves, { x: 0, y: 0, z: 30 })
    const removed = before - s.volume()
    // The lowest tip is 24 mm down: the full diameter reaches 24 - point length, the point closes the rest.
    const expected = Math.PI * 4 * (24 - tip) + (Math.PI * 4 * tip) / 3
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
  })

  test("a flat tool, an empty hole list and a zero peck are refused or reported", () => {
    expect(() => generateDeepHole(deep({ kind: "deep", peck: 6, retract: "full" }, { tool: flat(4) }))).toThrow(/needs a drill/)
    expect(() => generateDeepHole(deep({ kind: "deep", peck: 0, retract: "full" }))).toThrow(/peck must be positive/)
    const none = generateDeepHole(deep({ kind: "deep", peck: 6, retract: "full" }, { points: [] }))
    expect(none.moves.map((m) => m._tag)).toEqual(["Comment", "Comment"])
  })
})

// ---------------------------------------------------------------- back-boring

describe("back boring through a pilot hole", () => {
  const bar = lib("boringbar-b16")
  const cycle: HoleCycle = { kind: "back-bore", diameter: 16, pilotDiameter: 12, face: 0 }
  const input = (over: Partial<HoleCycleInput> = {}): HoleCycleInput => base({ cycle, tool: bar, top: 12, bottom: -3.5, clearanceZ: 40, retractZ: 32, feed: 120, rpm: 2000, ...over })

  test("the shift puts the insert and the body the same distance from the pilot wall", () => {
    const r = backBoreShift(bar, 12)
    expect(r).toEqual({ shift: 2.5 })
    // Insert side reach R - Q = 5.5, body side Q + 3 = 5.5, both inside the Ø12 pilot by more than the clearance.
    expect(6 - 5.5).toBeGreaterThanOrEqual(BACK_BORE_CLEARANCE - 1e-9 + 0.3)
    expect(backBoreShift(bar, 10)).toEqual({ reason: expect.stringMatching(/does not pass the Ø10 pilot/) })
    expect(backBoreShift({ ...bar, neckDiameter: undefined }, 12)).toEqual({ reason: expect.stringMatching(/no body diameter/) })
  })

  test("move sequence: shift, down through the pilot, back onto the axis, feed up to the ceiling, shift, out", () => {
    const tp = generateBackBore(input())
    const motion = tp.moves.filter((m) => m._tag === "Rapid" || m._tag === "Linear")
    expect(motion.map((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [m._tag, m.to.x, m.to.z] : []))).toEqual([
      ["Rapid", 0, 40], ["Rapid", -2.5, 40], ["Rapid", -2.5, -3.5], ["Rapid", 0, -3.5],
      ["Linear", 0, 9], ["Rapid", -2.5, 9], ["Rapid", -2.5, 40], ["Rapid", 0, 40]
    ])
    // The cut feeds upward at the cutting feed, to the ceiling less the insert height.
    expect(tp.moves.find((m) => m._tag === "Linear")).toMatchObject({ feed: 120, to: { z: 12 - 3 } })
    expect(tp.moves.filter((m) => m._tag === "Comment" && /M19/.test(m.text))).toHaveLength(2)
    expect(tp.moves.some((m) => m._tag === "Dwell")).toBe(true)
  })

  test("the swept envelope stays inside the pilot while the bar passes it", () => {
    const tp = generateBackBore(input())
    // Every position the tool takes while it is inside the part's Z range (0..30) and not on the axis is a shifted one: whatever the
    // shift, the insert (towards +X, reach R + x) and the body (reach |x| + neck radius) must stay inside the pilot radius 6.
    let shifted = 0
    for (const m of tp.moves) {
      if (m._tag !== "Rapid" && m._tag !== "Linear") continue
      if (m.to.z > 0.1 && m.to.z < 30 && m.to.x !== 0) {
        shifted++
        expect(8 + m.to.x).toBeLessThanOrEqual(6 - BACK_BORE_CLEARANCE + 1e-9)
        expect(-m.to.x + 3).toBeLessThanOrEqual(6 - BACK_BORE_CLEARANCE + 1e-9)
      }
    }
    expect(shifted).toBeGreaterThan(0)
  })

  test("it removes the annulus between pilot and bore over the bore height, nothing on the way through (independent stock)", () => {
    const s = plate(0.1, 30)
    s.cut(toolSolid(flat(12)), { x: 0, y: 0, z: -1 })
    const before = s.volume()
    const tp = generateBackBore(input())
    replay(s, bar, tp.moves, { x: 0, y: 0, z: 40 }, undefined, flat(6))
    const removed = before - s.volume()
    const expected = Math.PI * (64 - 36) * 12
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
    // The ceiling is flat at 12 mm; above it and under the face the plate is intact; the pilot wall above the bore is untouched.
    expect(s.has({ x: 7, y: 0, z: 12.4 })).toBe(true)
    expect(s.has({ x: 7, y: 0, z: 11.6 })).toBe(false)
    expect(s.has({ x: 7, y: 0, z: 0.4 })).toBe(false)
    expect(s.has({ x: 8.5, y: 0, z: 6 })).toBe(true)
    expect(s.has({ x: 0, y: 6.4, z: 20 })).toBe(true)
    expect(s.has({ x: 0, y: 5.6, z: 20 })).toBe(false)
  })

  test("a bar that does not pass the pilot, is set to another diameter, or is too short is refused with the reason", () => {
    expect(() => generateBackBore(input({ cycle: { kind: "back-bore", diameter: 16, pilotDiameter: 10, face: 0 } }))).toThrow(/does not pass the Ø10 pilot hole/)
    expect(() => generateBackBore(input({ cycle: { kind: "back-bore", diameter: 14, pilotDiameter: 12, face: 0 } }))).toThrow(/set to Ø16, the back bore is Ø14/)
    expect(() => generateBackBore(input({ cycle: { kind: "back-bore", diameter: 16, pilotDiameter: 16, face: 0 } }))).toThrow(/not wider than the Ø16 pilot/)
    expect(() => generateBackBore(input({ bottom: -1 }))).toThrow(/leaves the insert/)
    expect(() => generateBackBore(input({ retractZ: 60, clearanceZ: 70 }))).toThrow(/reach of boringbar-b16/)
    expect(() => generateBackBore(input({ tool: lib("flat-6") }))).toThrow(/needs a boring bar/)
  })
})

// ---------------------------------------------------------------- tilted drilling

describe("tilted drilling on an indexed machine", () => {
  const layout: RotaryLayout = "table-AC"
  const pivot: Vec3 = { x: 0, y: 0, z: 20 }
  const indexing: HoleIndexing = { layout, pivot, safeZ: 120 }
  const d = drill(6)
  const tip = pointLength(d)
  const theta = (30 * Math.PI) / 180
  const dir: Vec3 = { x: Math.sin(theta), y: 0, z: -Math.cos(theta) }
  const entry: Vec3 = { x: 0, y: 0, z: 40 }
  const input = (cycle: HoleCycle, over: Partial<HoleCycleInput> = {}): HoleCycleInput =>
    base({ cycle, tool: d, indexing, points: [], top: 0, bottom: -1, clearanceZ: 15, retractZ: 5, ...over })

  test("the table turns so the hole axis is machine Z: the machine tip sits on the hole axis at the right depth", () => {
    const tp = generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: dir, depth: 25 }] }))
    const orient = tp.moves.find((m) => m._tag === "Orient")
    expect(orient).toBeDefined()
    const expectedAngles = anglesFor({ x: -dir.x, y: -dir.y, z: -dir.z }, layout)[0]!
    expect(orient).toMatchObject({ _tag: "Orient", a: expect.closeTo(expectedAngles.a!, 9), c: expect.closeTo(expectedAngles.c, 9) })
    // The drill cycle bottom, carried back to the part, is the entry plus the depth and the point along the hole.
    const cycle = tp.moves.find((m) => m._tag === "Cycle")!
    expect(cycle._tag === "Cycle").toBe(true)
    if (cycle._tag !== "Cycle") return
    const angles = { a: expectedAngles.a!, c: expectedAngles.c }
    const r = tableRotation(angles, layout)
    const x = cycle.to.x - pivot.x, y = cycle.to.y - pivot.y, z = cycle.to.z - pivot.z
    const part = { x: r[0] * x + r[3] * y + r[6] * z + pivot.x, y: r[1] * x + r[4] * y + r[7] * z + pivot.y, z: r[2] * x + r[5] * y + r[8] * z + pivot.z }
    const want = { x: entry.x + dir.x * (25 + tip), y: entry.y + dir.y * (25 + tip), z: entry.z + dir.z * (25 + tip) }
    expect(part.x).toBeCloseTo(want.x, 9)
    expect(part.y).toBeCloseTo(want.y, 9)
    expect(part.z).toBeCloseTo(want.z, 9)
    // And the machine point is the forward map of that part point.
    const back = partToMachine(want, angles, layout, pivot)
    expect(cycle.to.x).toBeCloseTo(back.x, 9)
    expect(cycle.to.z).toBeCloseTo(back.z, 9)
    // The tool lifts to the machine safe Z after the group.
    expect(tp.moves[tp.moves.length - 1]).toMatchObject({ _tag: "Rapid", to: { z: 120 } })
  })

  test("it removes the oblique cylinder: pi r^2 times the axis length to the top face, plus the point (independent stock)", () => {
    const s = TriDexel.box({ x: -40, y: -40, z: 0 }, { x: 40, y: 40, z: 40 }, 0.2)
    const before = s.volume()
    const tp = generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: dir, depth: 25 }] }))
    replay(s, d, tp.moves, { x: 0, y: 0, z: 100 }, { layout, pivot })
    const removed = before - s.volume()
    const expected = Math.PI * 9 * 25 + (Math.PI * 9 * tip) / 3
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.03)
    // The hole centre line is empty to its depth; a point beside the axis stays.
    const along = (t: number): Vec3 => ({ x: entry.x + dir.x * t, y: entry.y + dir.y * t, z: entry.z + dir.z * t })
    expect(s.has(along(12))).toBe(false)
    expect(s.has({ ...along(12), y: 4 })).toBe(true)
  })

  test("two directions get two orientations with a lift to the safe Z between, and all sites are drilled", () => {
    const side: Vec3 = { x: 0, y: -Math.sin(theta), z: -Math.cos(theta) }
    const tp = generateTiltedDrill(input({ kind: "tilted", peck: 5, sites: [
      { entry, direction: dir, depth: 20 },
      { entry: { x: 12, y: 0, z: 40 }, direction: dir, depth: 20 },
      { entry: { x: -10, y: 10, z: 40 }, direction: side, depth: 15 }
    ] }))
    const orients = tp.moves.map((m, k) => (m._tag === "Orient" ? k : -1)).filter((k) => k >= 0)
    expect(orients).toHaveLength(2)
    const between = tp.moves.slice(orients[0]!, orients[1]!)
    expect(between.some((m) => m._tag === "Rapid" && m.to.z === 120)).toBe(true)
    expect(tp.moves.filter((m) => m._tag === "Cycle")).toHaveLength(3)
    expect(tp.moves.filter((m) => m._tag === "Cycle").every((m) => m._tag === "Cycle" && m.cycle === "peck" && m.peckDepth === 5)).toBe(true)
  })

  test("a straight-down hole gets the identity orientation and an unreachable direction refuses the whole operation", () => {
    const tp = generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: { x: 0, y: 0, z: -1 }, depth: 10 }] }))
    expect(tp.moves.find((m) => m._tag === "Orient")).toMatchObject({ a: expect.closeTo(0, 9), c: expect.closeTo(0, 9) })
    const limited: HoleIndexing = { ...indexing, limits: { tiltMin: -20, tiltMax: 20 } }
    expect(() => generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: dir, depth: 25 }, { entry, direction: { x: 0, y: 0, z: -1 }, depth: 5 }] }, { indexing: limited }))).toThrow(/cannot reach the hole direction/)
    expect(() => generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: dir, depth: 25 }] }, { indexing: undefined } as never))).toThrow(/rotary layout and pivot/)
    expect(() => generateTiltedDrill(input({ kind: "tilted", sites: [{ entry, direction: { x: 0, y: 0, z: 0 }, depth: 5 }] }))).toThrow(/must not be zero/)
  })

  test("the dispatcher routes every cycle kind and keeps the tool id", () => {
    expect(generateHoleCycle(base({ cycle: { kind: "countersink", diameter: 10 }, tool: lib("csk-12-90"), bottom: 15.6 })).toolId).toBe("csk-12-90")
    expect(generateHoleCycle(base({ cycle: { kind: "deep", peck: 5, retract: "full" }, tool: d, bottom: 5 })).moves.some((m) => m._tag === "Linear")).toBe(true)
  })
})

// A reminder of what the plain cycle does, so the deep-hole policy is a real difference and not a rename.
describe("the plain drill cycle cannot express these policies", () => {
  test("a canned peck cycle has one constant peck and one retract kind", () => {
    const moves = expandCycle({ _tag: "Cycle", cycle: "chipBreak", to: { x: 0, y: 0, z: -4 }, feed: 200, peckDepth: 6, dwellSeconds: 0, retractHeight: 22 }, { x: 0, y: 0, z: 30 })
    const z = tipsOf(moves).map((p) => p.z)
    // Constant 6 mm pecks, never a full retract before the end: the schedule and the n-th full retract of `deep` are not expressible.
    expect(z.filter((v) => v === 22)).toHaveLength(2)
  })
})

