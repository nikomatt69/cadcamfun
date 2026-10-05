/**
 * One regression test (or more) per legacy bug listed in specs/04-core-cam.md §5.
 * The numbering below matches the spec.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { circle } from "../../src/cad/testing.ts"
import type { Vec2 } from "../../src/cad/vec.ts"
import { circumcentre, fitArcs } from "../../src/cam/arc-fit.ts"
import { type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { ProfileParams, generateProfile } from "../../src/cam/operations/profile.ts"
import { PocketParams, generatePocket } from "../../src/cam/operations/pocket.ts"
import { passDepths } from "../../src/cam/params.ts"
import { type PostOptions, posts } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { invariantViolations, run } from "./helpers.ts"
import { square40, stock100, tool6 } from "./fixtures.ts"

const tp = (moves: Toolpath["moves"]): Toolpath => ({ id: "t", name: "t", toolId: "1", spindleRpm: 8000, coolant: "off", moves })
const emit = (toolpath: Toolpath, options: Partial<PostOptions> = {}): string =>
  posts.generic!.emit(makeProgram("p", [toolpath]), options)

describe("bug 1: the arc centre is the true centre, not the chord midpoint", () => {
  test("circumcentre of three points on a circle", () => {
    const c = { x: 7, y: -3 }
    const on = (a: number): Vec2 => ({ x: c.x + 5 * Math.cos(a), y: c.y + 5 * Math.sin(a) })
    const found = circumcentre(on(0.3), on(1.1), on(2.0))!
    expect(found.x).toBeCloseTo(c.x, 9)
    expect(found.y).toBeCloseTo(c.y, 9)
  })

  test("collinear points have no circumcentre", () => {
    expect(circumcentre({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined()
  })

  test("a quarter arc is emitted with I/J from the real centre (chord midpoint would be (2.5, 2.5))", () => {
    const text = emit(
      tp([
        { _tag: "Rapid", to: { x: 5, y: 0, z: 1 } },
        { _tag: "Arc", to: { x: 0, y: 5, z: 1 }, center: { x: 0, y: 0 }, clockwise: false, feed: 300 }
      ])
    )
    expect(text).toContain("G3 X0.000 Y5.000 I-5.000 J0.000")
    expect(text).not.toContain("I-2.500")
  })

  test("the emitted arc replays with the same centre and radius", () => {
    const { result } = run(
      tp([
        { _tag: "Rapid", to: { x: 12, y: 3, z: 1 } },
        { _tag: "Arc", to: { x: 7, y: 8, z: 1 }, center: { x: 7, y: 3 }, clockwise: false, feed: 300 }
      ])
    )
    const arc = result.segments.find((s) => s.kind === "arc")
    expect(arc?.kind === "arc" && arc.center.x).toBeCloseTo(7, 6)
    expect(arc?.kind === "arc" && arc.center.y).toBeCloseTo(3, 6)
  })
})

describe("bug 2: arcs are only fitted to circular runs, never to arbitrary triples", () => {
  const ring = (n: number, r: number): Vec2[] =>
    Array.from({ length: n }, (_, i) => ({ x: 50 + r * Math.cos((2 * Math.PI * i) / n), y: 50 + r * Math.sin((2 * Math.PI * i) / n) }))

  test("fitArcs leaves a zig-zag polyline straight", () => {
    const zig: Vec2[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i * 2, y: i % 2 === 0 ? 0 : 1.5 }))
    expect(fitArcs(zig, { tolerance: 0.01 }).arcs).toBe(0)
  })

  test("fitArcs does not round the corners of a square", () => {
    const sq = [...square40, square40[0]!]
    expect(fitArcs(sq, { tolerance: 0.05 }).arcs).toBe(0)
  })

  test("fitArcs recovers arcs from a finely tessellated circle", () => {
    const pts = ring(120, 20)
    const fit = fitArcs([...pts, pts[0]!], { tolerance: 0.01 })
    expect(fit.arcs).toBeGreaterThan(0)
    for (const seg of fit.segs) {
      if (seg.kind === "Arc") expect(Math.hypot(seg.center.x - 50, seg.center.y - 50)).toBeLessThan(0.05)
    }
  })

  test("a polygon profile contains no arcs unless arcFit is requested", () => {
    const pts = ring(60, 15)
    const plain = generateProfile(new ProfileParams({ totalDepth: 2, stepdown: 2, side: "onLine" }), pts, tool6, stock100)
    expect(plain.moves.some((m) => m._tag === "Arc")).toBe(false)
    const fitted = generateProfile(new ProfileParams({ totalDepth: 2, stepdown: 2, side: "onLine", arcFit: true, tolerance: 0.05 }), pts, tool6, stock100)
    expect(fitted.moves.some((m) => m._tag === "Arc")).toBe(true)
  })

  test("a square profile with arcFit on stays free of arcs", () => {
    const p = generateProfile(new ProfileParams({ totalDepth: 2, stepdown: 2, arcFit: true }), square40, tool6, stock100)
    expect(p.moves.some((m) => m._tag === "Arc")).toBe(false)
  })

  test("a circle entity stays an arc (source geometry was circular)", () => {
    const p = generateProfile(new ProfileParams({ totalDepth: 2, stepdown: 2 }), circle("c", { x: 50, y: 50 }, 12), tool6, stock100)
    expect(p.moves.some((m) => m._tag === "Arc")).toBe(true)
  })
})

describe("bug 3: defaults never replace an explicit 0", () => {
  test("constructing keeps zero heights and zero allowance", () => {
    const p = new ProfileParams({ totalDepth: 3, stepdown: 1, clearanceHeight: 0, safeHeight: 0, retractHeight: 0, allowance: 0 })
    expect([p.clearanceHeight, p.safeHeight, p.retractHeight, p.allowance]).toEqual([0, 0, 0, 0])
  })

  test("decoding keeps an explicit retractHeight of 0 and fills only missing fields", () => {
    const p = Schema.decodeUnknownSync(ProfileParams)({ totalDepth: 3, stepdown: 1, retractHeight: 0, safeHeight: 0, clearanceHeight: 1 })
    expect(p.retractHeight).toBe(0)
    expect(p.safeHeight).toBe(0)
    const q = Schema.decodeUnknownSync(ProfileParams)({ totalDepth: 3, stepdown: 1 })
    expect([q.clearanceHeight, q.safeHeight, q.retractHeight, q.feed]).toEqual([10, 5, 2, 800])
  })

  test("a retract height of 0 reaches the toolpath", () => {
    const p = generateProfile(new ProfileParams({ totalDepth: 2, stepdown: 2, clearanceHeight: 3, safeHeight: 1, retractHeight: 0 }), square40, tool6, stock100)
    const zs = p.moves.flatMap((m) => (m._tag === "Rapid" ? [m.to.z] : []))
    expect(zs).toContain(0)
    expect(zs).toContain(3)
  })

  test("a zero feed is rejected instead of being replaced by a default", () => {
    expect(() => new ProfileParams({ totalDepth: 3, stepdown: 1, feed: 0 })).toThrow()
  })
})

describe("bug 4: no rapid through material between passes", () => {
  const multi = (extra: Record<string, unknown> = {}) =>
    generateProfile(new ProfileParams({ totalDepth: 6, stepdown: 2, ...extra } as never), square40, tool6, stock100)

  test("closed contour: every rapid inside the stock is a vertical lift", () => {
    expect(invariantViolations(multi(), { stock: stock100, tool: tool6, totalDepth: 6 })).toEqual([])
  })

  test("every lead-in variant keeps the invariant over 3 passes", () => {
    for (const leadIn of ["direct", "ramp", "helix", "arc"] as const) {
      expect(invariantViolations(multi({ leadIn }), { stock: stock100, tool: tool6, totalDepth: 6 })).toEqual([])
    }
  })

  test("the closed contour steps down along the path instead of retracting", () => {
    const { result } = run(multi())
    const rapidsBelowTop = result.segments.filter((s) => s.kind === "rapid" && Math.min(s.from.z, s.to.z) < 0)
    expect(rapidsBelowTop).toHaveLength(1) // only the final lift
  })

  test("pockets obey it too, with an island and several depths", () => {
    const island: Vec2[] = [{ x: 35, y: 35 }, { x: 45, y: 35 }, { x: 45, y: 45 }, { x: 35, y: 45 }]
    const p = generatePocket(new PocketParams({ totalDepth: 6, stepdown: 2 }), { boundary: square40, islands: [island] }, tool6, stock100)
    expect(invariantViolations(p, { stock: stock100, tool: tool6, totalDepth: 6 })).toEqual([])
  })
})

describe("bug 5: helical entry is a real multi-revolution spiral", () => {
  const helix = () =>
    generateProfile(new ProfileParams({ totalDepth: 5, stepdown: 5, leadIn: "helix", helixPitch: 1 }), square40, tool6, stock100)

  test("ceil(depth / pitch) full circles, z strictly decreasing, pitch <= helixPitch", () => {
    const arcs = helix().moves.flatMap((m) => (m._tag === "Arc" ? [m] : []))
    // Entry starts 1 mm above the stock top and ends at z = -5: depth 6, pitch 1.
    expect(arcs).toHaveLength(6)
    let prev = 1
    for (const a of arcs) {
      expect(a.to.z).toBeLessThan(prev)
      expect(prev - a.to.z).toBeLessThanOrEqual(1 + 1e-9)
      prev = a.to.z
    }
    expect(arcs.at(-1)!.to.z).toBe(-5)
    expect(new Set(arcs.map((a) => `${a.center.x},${a.center.y}`)).size).toBe(1)
  })

  test("each revolution is a full circle of the tool-centre radius, replayed from the G-code", () => {
    const { result } = run(helix())
    const arcs = result.segments.filter((s) => s.kind === "arc")
    expect(arcs).toHaveLength(6)
    for (const a of arcs) {
      if (a.kind !== "arc") continue
      expect(a.radiusStart).toBeCloseTo(3, 6)
      expect(Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y)).toBeLessThan(1e-6)
    }
  })

  test("a smaller pitch means more revolutions", () => {
    const p = generateProfile(new ProfileParams({ totalDepth: 5, stepdown: 5, leadIn: "helix", helixPitch: 0.5 }), square40, tool6, stock100)
    expect(p.moves.filter((m) => m._tag === "Arc")).toHaveLength(12)
  })
})

describe("bug 6: ramp entry is limited by the ramp angle", () => {
  const maxSlope = (toolpath: Toolpath): number => {
    const { result } = run(toolpath)
    let worst = 0
    for (const s of result.segments) {
      if (s.kind === "dwell" || s.kind === "rapid") continue
      const dz = s.from.z - s.to.z
      if (dz <= 1e-9) continue
      const planar =
        s.kind === "arc"
          ? s.radiusStart * ((): number => {
              const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
              const a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
              let sw = s.clockwise ? a0 - a1 : a1 - a0
              sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
              return sw < 1e-9 ? 2 * Math.PI : sw
            })()
          : Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
      worst = Math.max(worst, planar < 1e-9 ? Infinity : dz / planar)
    }
    return worst
  }

  test("every descending segment stays within the ramp angle (3 degrees by default)", () => {
    const p = generateProfile(new ProfileParams({ totalDepth: 6, stepdown: 3, leadIn: "ramp" }), square40, tool6, stock100)
    expect(maxSlope(p)).toBeLessThanOrEqual(Math.tan((3 * Math.PI) / 180) + 1e-6)
  })

  test("a tiny contour laps repeatedly instead of dropping to full depth in one segment", () => {
    const tiny: Vec2[] = [{ x: 40, y: 40 }, { x: 46, y: 40 }, { x: 46, y: 46 }, { x: 40, y: 46 }]
    const p = generateProfile(new ProfileParams({ totalDepth: 5, stepdown: 5, leadIn: "ramp", rampAngle: 2 }), tiny, tool6, stock100)
    expect(maxSlope(p)).toBeLessThanOrEqual(Math.tan((2 * Math.PI) / 180) + 1e-6)
    expect(p.moves.filter((m) => m._tag === "Linear").length).toBeGreaterThan(20)
    expect(invariantViolations(p, { stock: stock100, tool: tool6, totalDepth: 5 })).toEqual([])
  })

  test("an open path zig-zags back and forth to reach the depth", () => {
    const open = [{ x: 30, y: 50 }, { x: 40, y: 50 }]
    const p = generateProfile(new ProfileParams({ totalDepth: 3, stepdown: 3, leadIn: "ramp", side: "onLine" }), open, tool6, stock100)
    expect(maxSlope(p)).toBeLessThanOrEqual(Math.tan((3 * Math.PI) / 180) + 1e-6)
    expect(invariantViolations(p, { stock: stock100, tool: tool6, totalDepth: 3 })).toEqual([])
  })
})

describe("bug 7: the header carries no timestamp", () => {
  const path = tp([
    { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
    { _tag: "Linear", to: { x: 5, y: 0, z: -1 }, feed: 200 }
  ])

  test("default output contains no date or time and is identical between runs", () => {
    const a = emit(path)
    const b = emit(path)
    expect(a).toBe(b)
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(a).not.toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  test("a stamp is injected only when asked for", () => {
    expect(emit(path, { stamp: "2026-01-02 03:04" })).toContain("(GENERATED: 2026-01-02 03:04)")
  })
})

describe("bug 8: modal state is tracked while emitting", () => {
  test("a G1 back to the position before an arc is not dropped", () => {
    const text = emit(
      tp([
        { _tag: "Rapid", to: { x: 10, y: 0, z: 2 } },
        { _tag: "Linear", to: { x: 10, y: 0, z: -1 }, feed: 200 },
        { _tag: "Arc", to: { x: 0, y: 10, z: -1 }, center: { x: 0, y: 0 }, clockwise: false, feed: 200 },
        { _tag: "Linear", to: { x: 10, y: 0, z: -1 }, feed: 200 }
      ])
    )
    const lines = text.split("\n")
    expect(lines.some((l) => l.startsWith("G3 "))).toBe(true)
    const last = lines.filter((l) => l.startsWith("G1 "))
    expect(last.at(-1)).toBe("G1 X10.000 Y0.000")
    const r = interpretGcode(text)
    expect(r.end.x).toBeCloseTo(10, 6)
    expect(r.end.y).toBeCloseTo(0, 6)
  })

  test("a G1 to the point a G0 just reached is neither merged with it nor allowed to disturb the next move", () => {
    const text = emit(
      tp([
        { _tag: "Rapid", to: { x: 5, y: 5, z: 2 } },
        { _tag: "Linear", to: { x: 5, y: 5, z: 2 }, feed: 200 },
        { _tag: "Linear", to: { x: 9, y: 5, z: 2 }, feed: 200 }
      ])
    )
    // The zero-length G1 vanishes, but the following move must still announce G1.
    expect(text).toContain("G1 X9.000 F200")
  })

  test("unchanged words are not repeated", () => {
    const text = emit(
      tp([
        { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
        { _tag: "Linear", to: { x: 5, y: 0, z: 5 }, feed: 300 },
        { _tag: "Linear", to: { x: 5, y: 5, z: 5 }, feed: 300 },
        { _tag: "Linear", to: { x: 0, y: 5, z: 5 }, feed: 300 }
      ])
    )
    expect(text).toContain("G1 X5.000 F300\nY5.000\nX0.000\n")
    expect(text.split("\n").filter((l) => !l.startsWith("(")).join("\n").match(/F300/g)).toHaveLength(1)
  })
})

describe("bug 9: depth and stepdown are validated", () => {
  test("non-positive or non-finite totalDepth/stepdown are rejected by the Schema", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new ProfileParams({ totalDepth: bad, stepdown: 1 })).toThrow()
      expect(() => new ProfileParams({ totalDepth: 1, stepdown: bad })).toThrow()
    }
    const decoded = Effect.runSync(Effect.exit(Schema.decodeUnknownEffect(ProfileParams)({ totalDepth: -2, stepdown: 1 })))
    expect(decoded._tag).toBe("Failure")
  })

  test("passDepths throws instead of silently producing no passes", () => {
    expect(() => passDepths(0, 1)).toThrow(RangeError)
    expect(() => passDepths(5, 0)).toThrow(RangeError)
    expect(() => passDepths(Number.NaN, 1)).toThrow(RangeError)
  })

  test("passDepths clips the last pass and the cut Z is -depth", () => {
    expect(passDepths(5, 2)).toEqual([2, 4, 5])
    expect(passDepths(4, 2)).toEqual([2, 4])
    const p = generateProfile(new ProfileParams({ totalDepth: 5, stepdown: 2 }), square40, tool6, stock100)
    const zs = p.moves.flatMap((m) => (m._tag === "Linear" ? [m.to.z] : []))
    expect(Math.min(...zs)).toBe(-5)
  })
})
