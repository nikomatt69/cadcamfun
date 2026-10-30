/**
 * Simultaneous five-axis programs in the frame the control needs (spec 72 P4-6): tool-centre-point control on (the linear words are the
 * tool tip in part coordinates) or off (machine-axis positions after the table turned), rate-limited rotary axes and inverse-time feed.
 *
 * Truth is independent of the writer: rotation matrices written in this file (not `partToMachine`) carry a replayed machine position
 * back to the part, and the part position must lie on the straight tip path of the toolpath. Tolerances are declared: the splitting
 * tolerance is 0.01 mm (the `tolerance` option), the written numbers are rounded to 0.001 mm and 0.001 deg, so 0.02 mm in all.
 */
import { describe, expect, test } from "bun:test"
import { fiveAxisKinematic } from "../../src/cam/five-axis.ts"
import { makeProgram, type Program, type Toolpath } from "../../src/cam/ir.ts"
import { fanucPost, genericPost, haasPost, heidenhainPost, linuxcncPost, okumaPost, siemensPost, type PostOptions } from "../../src/cam/post/index.ts"
import { interpretGcode, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"

type V = { x: number; y: number; z: number }
const TOL = 0.02
const RAD = Math.PI / 180

// Table AC: R = Rx(A) Rz(C), machine = R (part - pivot) + pivot. Written here from the definition in five-axis.ts, not imported.
const rx = (d: number) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[1, 0, 0], [0, c, -s], [0, s, c]] }
const rz = (d: number) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[c, -s, 0], [s, c, 0], [0, 0, 1]] }
const mm = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!))
const apply = (m: number[][], p: V): V => ({ x: m[0]![0]! * p.x + m[0]![1]! * p.y + m[0]![2]! * p.z, y: m[1]![0]! * p.x + m[1]![1]! * p.y + m[1]![2]! * p.z, z: m[2]![0]! * p.x + m[2]![1]! * p.y + m[2]![2]! * p.z })
const transpose = (m: number[][]) => [[m[0]![0]!, m[1]![0]!, m[2]![0]!], [m[0]![1]!, m[1]![1]!, m[2]![1]!], [m[0]![2]!, m[1]![2]!, m[2]![2]!]]
const pivot: V = { x: 50, y: 20, z: -30 }
const table = (a: number, c: number) => mm(rx(a), rz(c))
const toMachine = (p: V, a: number, c: number): V => { const r = apply(table(a, c), { x: p.x - pivot.x, y: p.y - pivot.y, z: p.z - pivot.z }); return { x: r.x + pivot.x, y: r.y + pivot.y, z: r.z + pivot.z } }
const toPart = (m: V, a: number, c: number): V => { const r = apply(transpose(table(a, c)), { x: m.x - pivot.x, y: m.y - pivot.y, z: m.z - pivot.z }); return { x: r.x + pivot.x, y: r.y + pivot.y, z: r.z + pivot.z } }
const dist = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)

const control = fiveAxisKinematic({ layout: "table-AC", pivot, limits: { tilt: [-120, 120] }, tcp: "control" })
const programKin = fiveAxisKinematic({ layout: "table-AC", pivot, limits: { tilt: [-120, 120] }, tcp: "program" })

/** Part-coordinate path: approach with the axes at 0, then one feed move that tilts A 0 -> 40 and turns C 0 -> 90 over 60 mm. */
const sweepPart: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { a: 0, c: 0 } },
  { _tag: "Linear", to: { x: 0, y: 0, z: 0 }, feed: 800, rotary: { a: 0, c: 0 } },
  { _tag: "Linear", to: { x: 60, y: 10, z: 0 }, feed: 800, rotary: { a: 40, c: 90 } },
  { _tag: "Linear", to: { x: 60, y: 40, z: -5 }, feed: 800, rotary: { a: 40, c: 90 } }
]
const tp = (moves: Toolpath["moves"], id = "t", tool = "6"): Toolpath => ({ id, name: `Five axis ${id}`, toolId: tool, spindleRpm: 8100, coolant: "off", moves })
const program = (moves: Toolpath["moves"]): Program => makeProgram("Five axis", [tp(moves)], { metadata: { programNumber: "1234" } })
const replay = (text: string) => {
  const r = interpretGcode(text, { track: true })
  expect(r.errors).toEqual([])
  return r.segments.filter((s): s is Extract<GSegment, { kind: "linear" | "rapid" }> => s.kind === "linear" || s.kind === "rapid")
}
const angleOf = (s: Extract<GSegment, { kind: "linear" | "rapid" }>) => ({ a: s.rotary?.a ?? 0, c: s.rotary?.c ?? 0 })
const distToSegment = (p: V, a: V, b: V): number => {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1)))
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t })
}
const TIP_A: V = { x: 0, y: 0, z: 0 }, TIP_B: V = { x: 60, y: 10, z: 0 }

describe("tool-centre-point control on: the linear words stay in part coordinates", () => {
  test("Fanuc writes G43.4 and the part positions; the replay shows the part positions with the angles", () => {
    const text = fanucPost.emit(program(sweepPart), { kinematics: control })
    expect(text).toContain("G43.4 H6")
    const segs = replay(text)
    const feed = segs.filter((s) => s.kind === "linear")
    expect(feed.map((s) => s.to)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 60, y: 10, z: 0 }, { x: 60, y: 40, z: -5 }])
    expect(angleOf(feed[1]!)).toEqual({ a: 40, c: 90 })
  })

  test("Siemens TRAORI, optionally with the transformation number", () => {
    expect(siemensPost.emit(program(sweepPart), { kinematics: control })).toMatch(/^TRAORI$/m)
    expect(siemensPost.emit(program(sweepPart), { kinematics: control, tcpTransformation: 2 })).toMatch(/^TRAORI\(2\)$/m)
  })

  test("a toolpath made in machine coordinates is carried back to part coordinates, exactly", () => {
    // The same tip path as `sweepPart`, as a program-frame generator writes it: machine positions for the angles in force.
    const machine: Toolpath["moves"] = [
      { _tag: "Rapid", to: toMachine({ x: 0, y: 0, z: 40 }, 0, 0), rotary: { a: 0, c: 0 } },
      { _tag: "Linear", to: toMachine({ x: 0, y: 0, z: 0 }, 0, 0), feed: 800, rotary: { a: 0, c: 0 } },
      { _tag: "Linear", to: toMachine({ x: 60, y: 10, z: 0 }, 40, 90), feed: 800, rotary: { a: 40, c: 90 } }
    ]
    const segs = replay(fanucPost.emit(program(machine), { kinematics: programKin, tcp: true }))
    const feed = segs.filter((s) => s.kind === "linear")
    // The end point is exact. The points in between are on the path the machine-frame control traces: straight in the machine axes and the
    // angles (so bowed in the part, by 1.6 mm here); carried back to the machine with their own angles they lie on that straight line.
    expect(dist(feed.at(-1)!.to, TIP_B)).toBeLessThan(0.002)
    const mA = toMachine(TIP_A, 0, 0), mB = toMachine(TIP_B, 40, 90)
    const sweep = feed.filter((s) => angleOf(s).a > 0)
    expect(sweep.length).toBeGreaterThan(2)
    for (const s of sweep) {
      const t = angleOf(s).a / 40
      const line = { x: mA.x + (mB.x - mA.x) * t, y: mA.y + (mB.y - mA.y) * t, z: mA.z + (mB.z - mA.z) * t }
      expect(dist(toMachine(s.to, angleOf(s).a, angleOf(s).c), line)).toBeLessThan(TOL)
    }
  })
})

describe("tool-centre-point control off: machine-axis positions that hold the tool tip on its path", () => {
  const text = (post = fanucPost, extra: Partial<PostOptions> = {}) => post.emit(program(sweepPart), { kinematics: control, tcp: false, ...extra })

  test("no tip-control word is written and the rotary words stay", () => {
    expect(text()).not.toMatch(/G43\.4|TRAORI|M128|G234/)
    expect(text()).toMatch(/A40\.000/)
  })

  test("every replayed machine position, carried back with its own angles, lies on the straight tip path", () => {
    const feed = replay(text()).filter((s) => s.kind === "linear")
    expect(feed.length).toBeGreaterThan(3) // the move that turns the axes was split
    const tips = feed.map((s) => ({ s, tip: toPart(s.to, angleOf(s).a, angleOf(s).c) }))
    for (const { tip } of tips.slice(1, -1)) expect(distToSegment(tip, TIP_A, TIP_B)).toBeLessThan(TOL)
    expect(dist(tips.at(-1)!.tip, { x: 60, y: 40, z: -5 })).toBeLessThan(0.002)
  })

  test("the chord between two written points stays within the tolerance of the tip path", () => {
    const feed = replay(text()).filter((s) => s.kind === "linear")
    for (let i = 1; i < feed.length - 1; i++) {
      const s = feed[i]!
      const a0 = angleOf(feed[i - 1]!), a1 = angleOf(s)
      for (const f of [0.25, 0.5, 0.75]) {
        // The control interpolates the machine axes linearly: that is the point it really reaches at fraction f.
        const m = { x: s.from.x + (s.to.x - s.from.x) * f, y: s.from.y + (s.to.y - s.from.y) * f, z: s.from.z + (s.to.z - s.from.z) * f }
        const tip = toPart(m, a0.a + (a1.a - a0.a) * f, a0.c + (a1.c - a0.c) * f)
        expect(distToSegment(tip, TIP_A, TIP_B)).toBeLessThan(TOL)
      }
    }
  })

  test("the old behaviour (part coordinates written as machine coordinates) misses the tip path by far", () => {
    const old = fanucPost.emit(program(sweepPart), { tcp: false })
    const feed = replay(old).filter((s) => s.kind === "linear")
    // The last block wants the tip at (60, 40, -5) with the table at A40 C90; the machine position that gives it is far from the raw word.
    expect(dist(feed.at(-1)!.to, toMachine({ x: 60, y: 40, z: -5 }, 40, 90))).toBeGreaterThan(10)
  })

  test("both frames replay to the same tool tip positions", () => {
    const on = replay(fanucPost.emit(program(sweepPart), { kinematics: control })).filter((s) => s.kind === "linear")
    const off = replay(text()).filter((s) => s.kind === "linear")
    expect(dist(on.at(-1)!.to, toPart(off.at(-1)!.to, 40, 90))).toBeLessThan(0.002)
    expect(dist(on[1]!.to, toPart(off.find((s) => dist(s.to, toMachine(TIP_B, 40, 90)) < 0.002)!.to, 40, 90))).toBeLessThan(0.002)
  })

  test("a machine whose control keeps the tip (tcp: control) on a post without the word is written in machine coordinates, not refused", () => {
    for (const post of [genericPost, linuxcncPost, okumaPost]) {
      const t = post.emit(program(sweepPart), { kinematics: control })
      expect(t).not.toMatch(/G43\.4|TRAORI|M128|G234/)
      // Okuma's G15 work-coordinate word is not ISO; the replay of that post is the okuma option's business.
      if (post !== okumaPost) expect(replay(t).filter((s) => s.kind === "linear").length).toBeGreaterThan(3)
    }
  })

  test("asking such a post for tcp: true is refused with the reason", () => {
    expect(() => okumaPost.emit(program(sweepPart), { kinematics: control, tcp: true })).toThrow(/no tool-centre-point word/)
  })
})

describe("the default follows the machine", () => {
  test("a machine with tcp: control writes the word, one with tcp: program writes machine coordinates and no word", () => {
    expect(fanucPost.emit(program(sweepPart), { kinematics: control })).toContain("G43.4")
    expect(haasPost.emit(program(sweepPart), { kinematics: control })).toContain("G234")
    const asProgram = fanucPost.emit(program(sweepPart.map((m) => (m._tag === "Rapid" || m._tag === "Linear" ? { ...m, to: toMachine(m.to, m.rotary?.a ?? 0, m.rotary?.c ?? 0) } : m))), { kinematics: programKin })
    expect(asProgram).not.toContain("G43.4")
  })

  test("a circular move while the table stands tilted cannot be carried between frames and is refused", () => {
    const arc: Toolpath["moves"] = [...sweepPart.slice(0, 3), { _tag: "Arc", to: { x: 70, y: 20, z: 0 }, center: { x: 70, y: 10 }, clockwise: false, feed: 500 }]
    expect(() => fanucPost.emit(program(arc), { kinematics: control, tcp: false })).toThrow(/circular move/)
    // With the control keeping the tip nothing is converted, so the arc is written (it is the operator's check that the axes stand still).
    expect(() => fanucPost.emit(program(arc), { kinematics: control })).not.toThrow()
  })

  test("the tip-control word is closed before the tool change, not left to the length offset of the next tool", () => {
    const two = makeProgram("two", [tp(sweepPart, "a", "6"), tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { a: 0, c: 0 } }, { _tag: "Linear", to: { x: 5, y: 0, z: 0 }, feed: 300, rotary: { a: 0, c: 0 } }], "b", "7")])
    const lines = fanucPost.emit(two, { kinematics: control }).split("\n")
    const on = lines.findIndex((l) => l.startsWith("G43.4 H6"))
    const off = lines.findIndex((l, i) => i > on && l === "G43 H6")
    const change = lines.findIndex((l) => l === "T7 M6")
    expect(on).toBeGreaterThan(-1)
    expect(off).toBeGreaterThan(on)
    expect(off).toBeLessThan(change)
  })
})

describe("feed: rotary rate limit and inverse time", () => {
  const minutes = (s: Extract<GSegment, { kind: "linear" | "rapid" }>) => dist(s.from, s.to) / s.feed

  test("a move that would turn an axis faster than the machine allows is slowed to the limit", () => {
    const fast: Toolpath["moves"] = [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 }, rotary: { a: 0, c: 0 } },
      { _tag: "Linear", to: { x: 0, y: 0, z: 0 }, feed: 1000, rotary: { a: 0, c: 0 } },
      // 5 mm of tip travel while the table turns 60 degrees: 600 deg/min at 50 mm/min... asks for 12 deg/mm at 1000 mm/min = 12000 deg/min
      { _tag: "Linear", to: { x: 5, y: 0, z: 0 }, feed: 1000, rotary: { a: 0, c: 60 } }
    ]
    const limit = 3000
    const free = replay(fanucPost.emit(program(fast), { kinematics: control })).filter((s) => s.kind === "linear")
    const limited = replay(fanucPost.emit(program(fast), { kinematics: control, rotaryMaxRate: limit })).filter((s) => s.kind === "linear")
    // Unlimited: 5 mm at 1000 mm/min is 0.3 s for 60 degrees = 12000 deg/min. Limited: the written feed is cut to 1000 * 3000 / 12000 = 250.
    expect(free[1]!.feed).toBe(1000)
    expect(limited[1]!.feed).toBeCloseTo(250, 6)
    // The turn rate the limited move implies (degrees over the time the control needs for the written feed) is at the limit.
    const t = dist(limited[1]!.from, limited[1]!.to) / limited[1]!.feed
    expect(60 / t).toBeLessThanOrEqual(limit * 1.0001)
  })

  test("inverse time: every simultaneous move carries 1 / (tip minutes), in both frames, and G94 is restored", () => {
    const tipMinutes = dist(TIP_A, TIP_B) / 800 + dist(TIP_B, { x: 60, y: 40, z: -5 }) / 800
    for (const tcp of [true, false]) {
      const text = fanucPost.emit(program(sweepPart), { kinematics: control, tcp, inverseTimeFeed: true })
      const lines = text.split("\n")
      expect(lines.filter((l) => l === "G93")).toHaveLength(1)
      expect(lines.indexOf("G94")).toBeGreaterThan(lines.indexOf("G93"))
      expect(lines.indexOf("G94")).toBeLessThan(lines.indexOf("M30"))
      const segs = replay(text).filter((s) => s.kind === "linear")
      // The replay turns G93 into a feed along the written axes; the time of a block is its length over that feed = 1 / F.
      const total = segs.reduce((sum, s) => sum + minutes(s), 0)
      // The first feed move (down to the surface, 40 mm at 800) is inverse-time too; sum them all.
      const expected = 40 / 800 + tipMinutes
      expect(total).toBeCloseTo(expected, 3)
    }
  })

  test("without inverse time the same program replays with the programmed feed on each block", () => {
    const segs = replay(fanucPost.emit(program(sweepPart), { kinematics: control })).filter((s) => s.kind === "linear")
    expect(new Set(segs.map((s) => s.feed))).toEqual(new Set([800]))
  })

  test("Siemens writes G93 / G94, Heidenhain refuses inverse time (its feed is the tip feed under M128)", () => {
    const text = siemensPost.emit(program(sweepPart), { kinematics: control, inverseTimeFeed: true })
    expect(text).toMatch(/^G93$/m)
    expect(text).toMatch(/^G94$/m)
    expect(() => heidenhainPost.emit(program(sweepPart), { kinematics: control, inverseTimeFeed: true })).toThrow(/no inverse-time/)
  })

  test("a rate limit or inverse time without the machine is refused: the tip path is not known", () => {
    expect(() => fanucPost.emit(program(sweepPart), { rotaryMaxRate: 3000 })).toThrow(/kinematics/)
    expect(() => fanucPost.emit(program(sweepPart), { inverseTimeFeed: true })).toThrow(/kinematics/)
  })
})
