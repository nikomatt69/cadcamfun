import { describe, expect, test } from "bun:test"
import { circle } from "../../src/cad/testing.ts"
import { makeProgram, type Move } from "../../src/cam/ir.ts"
import { ProfileParams, generateProfile } from "../../src/cam/operations/profile.ts"
import { posts } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import type { Vec2 } from "../../src/cad/vec.ts"
import { pointSeg, square40, stock100, tool6 } from "./fixtures.ts"

const params = (over: Record<string, unknown> = {}) => new ProfileParams({ totalDepth: 4, stepdown: 2, compensation: "controller", ...over } as never)

const ringDistance = (p: Vec2, ring: ReadonlyArray<Vec2>): number => {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, pointSeg(p, ring[i]!, ring[(i + 1) % ring.length]!))
  return best
}
const inRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let r = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) r = !r
  }
  return r
}

/** The NC of the profile and the XY points the control's offset path visits while cutting (the interpreter applies G41 / G42 with the register's radius). */
const nc = (over: Record<string, unknown> = {}, post: keyof typeof posts = "fanuc") => {
  const tp = generateProfile(params(over), square40, tool6, stock100)
  const text = posts[post]!.emit(makeProgram("t", [tp]), { decimals: 5 })
  const replay = interpretGcode(text, { dwell: "milliseconds", toolRadius: () => 3 })
  const cut: Vec2[] = []
  for (const s of replay.segments) if (s.kind !== "dwell" && s.kind !== "rapid" && s.to.z < -1e-9) cut.push({ x: s.from.x, y: s.from.y }, { x: s.to.x, y: s.to.y })
  return { text, replay, cut, tp }
}

describe("controller cutter compensation on the profile", () => {
  test("the program is the contour with G41/G42 and G40, not the tool-centre path", () => {
    const { text, tp } = nc()
    expect(text).toMatch(/G42 D\d+/)
    expect(text).toContain("G40")
    expect(tp.moves.filter((m) => m._tag === "CutterComp").map((m) => (m as { side: string }).side)).toEqual(["right", "off", "right", "off"])
    // Two depth passes, each switched on and off once, and the contour moves lie on the contour itself.
    expect((text.match(/G42/g) ?? []).length).toBe(2)
  })

  test("outside: the offset the control applies keeps the tool centre one radius outside the square", () => {
    const { cut, replay } = nc()
    expect(replay.errors).toEqual([])
    expect(cut.length).toBeGreaterThan(8)
    // The approach and exit moves ramp the offset on and off; the points of the lap itself are at one radius.
    const lap = cut.filter((p) => ringDistance(p, square40) > 2.5 && ringDistance(p, square40) < 3.5)
    expect(lap.length).toBeGreaterThan(cut.length / 2)
    for (const p of lap) {
      expect(ringDistance(p, square40)).toBeCloseTo(3, 4)
      expect(inRing(p, square40)).toBe(false)
    }
    const xs = lap.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(17, 4)
    expect(Math.max(...xs)).toBeCloseTo(63, 4)
  })

  test("inside: conventional milling puts the tool on the other side (G41) and the centre stays inside", () => {
    const { text, cut } = nc({ side: "inside", climb: false })
    expect(text).toMatch(/G41 D\d+/)
    const lap = cut.filter((p) => ringDistance(p, square40) > 2.5 && ringDistance(p, square40) < 3.5)
    expect(lap.length).toBeGreaterThan(0)
    for (const p of lap) expect(inRing(p, square40)).toBe(true)
  })

  test("a circle stays an arc, and the same radius is cut", () => {
    const tp = generateProfile(params(), circle("c", { x: 50, y: 50 }, 15), tool6, stock100)
    const text = posts.fanuc!.emit(makeProgram("t", [tp]), { decimals: 5 })
    expect(text).toMatch(/G[23] /)
    const replay = interpretGcode(text, { dwell: "milliseconds", toolRadius: () => 3 })
    const radii = replay.segments.flatMap((s) => (s.kind === "arc" ? [Math.hypot(s.to.x - 50, s.to.y - 50)] : []))
    expect(radii.length).toBeGreaterThan(0)
    expect(radii.every((r) => Math.abs(r - 18) < 1e-3)).toBe(true)
  })

  test("a worn tool is corrected at the machine: the same program with a 2.9 mm register radius cuts 0.1 mm smaller", () => {
    const { text } = nc()
    const worn = interpretGcode(text, { dwell: "milliseconds", toolRadius: () => 2.9 })
    const xs = worn.segments.flatMap((s) => (s.kind !== "dwell" && s.kind !== "rapid" && s.to.z < -1e-9 ? [s.to.x] : [])).filter((x) => x > 16.5 && x < 17.5)
    expect(Math.min(...xs)).toBeCloseTo(17.1, 4)
  })

  test("refusals say why: tabs, an open contour, onLine, and a control without the words", () => {
    expect(() => generateProfile(params({ tabs: [{ position: 0.5, width: 4, height: 1 }] }), square40, tool6, stock100)).toThrow(/tabs/)
    expect(() => generateProfile(params({ side: "onLine" }), square40, tool6, stock100)).toThrow(/side/)
    const tp = generateProfile(params(), square40, tool6, stock100)
    for (const post of ["grbl", "heidenhain"] as const) expect(() => posts[post]!.emit(makeProgram("t", [tp]), {})).toThrow(/cutter radius compensation/)
    for (const post of ["generic", "fanuc", "haas", "okuma", "siemens", "linuxcnc", "mazak"] as const) expect(posts[post]!.emit(makeProgram("t", [tp]), {})).toContain("G40")
  })

  test("without the option nothing changes: the tool-centre path is written, no G41/G42", () => {
    const tp = generateProfile(new ProfileParams({ totalDepth: 4, stepdown: 2 } as never), square40, tool6, stock100)
    expect(tp.moves.some((m) => m._tag === "CutterComp")).toBe(false)
  })
})


describe("merged compensation IR forms", () => {
  const emit = (moves: ReadonlyArray<Move>, post: keyof typeof posts = "fanuc") => {
    const profile = generateProfile(params(), square40, tool6, stock100)
    return posts[post]!.emit(makeProgram("mixed", [{ ...profile, moves }]), {})
  }

  test("standalone activation and attached cancellation share the same modal state", () => {
    const text = emit([
      { _tag: "CutterComp", side: "left", register: 3 },
      { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 100, comp: { mode: "off" } }
    ])
    expect(text).toContain("G41 D3")
    expect(text.slice(text.indexOf("G41 D3")).match(/G40/g)).toHaveLength(1)
  })

  test("attached activation and standalone cancellation use all supported dialects", () => {
    const moves: ReadonlyArray<Move> = [
      { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 100, comp: { mode: "right", register: 2 } },
      { _tag: "CutterComp", side: "off" }
    ]
    for (const post of ["generic", "fanuc", "haas", "okuma", "siemens", "linuxcnc", "mazak", "mitsubishi", "brother"] as const) {
      const text = emit(moves, post)
      expect(text).toContain("G42 D2")
      expect(text.slice(text.indexOf("G42 D2")).match(/G40/g)).toHaveLength(1)
    }
    for (const post of ["grbl", "heidenhain"] as const) expect(() => emit(moves, post)).toThrow(/compensation/)
  })

  test("standalone compensation rejects an invalid register", () => {
    expect(() => emit([{ _tag: "CutterComp", side: "left", register: 0 }])).toThrow(/positive D register/)
  })
})
