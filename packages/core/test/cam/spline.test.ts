import { describe, expect, test } from "bun:test"
import { type Move, type Toolpath, expandMoves, makeProgram, moveLength } from "../../src/cam/ir.ts"
import { type PostId, type PostOptions, posts } from "../../src/cam/post/index.ts"
import { fitPolyline, fitSplineMoves, flattenSpline, splineLength, splinePoint } from "../../src/cam/spline.ts"
import { interpretGcode, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"

const tp = (moves: Move[]): Toolpath => ({ id: "t", name: "Test", toolId: "1", spindleRpm: 9000, coolant: "off", moves })
const emit = (id: PostId, moves: Move[], options: Partial<PostOptions> = {}): string => posts[id]!.emit(makeProgram("prog", [tp(moves)]), options)

/** A half circle of radius 20 sampled every 1 degree: 180 short line moves at z = -1, feed 800. */
const arcPoints = (r = 20, degrees = 180, step = 1): Array<{ x: number; y: number }> => {
  const pts: Array<{ x: number; y: number }> = []
  for (let d = 0; d <= degrees; d += step) pts.push({ x: r * Math.cos((d * Math.PI) / 180), y: r * Math.sin((d * Math.PI) / 180) })
  return pts
}
const polyline = (pts: Array<{ x: number; y: number }>, feed = 800): Move[] => [
  { _tag: "Rapid", to: { x: pts[0]!.x, y: pts[0]!.y, z: 5 } },
  { _tag: "Linear", to: { x: pts[0]!.x, y: pts[0]!.y, z: -1 }, feed: 300 },
  ...pts.slice(1).map((p): Move => ({ _tag: "Linear", to: { x: p.x, y: p.y, z: -1 }, feed }))
]

/** Largest distance of the points `a` from the polyline `b`. */
const hausdorff = (a: ReadonlyArray<{ x: number; y: number }>, b: ReadonlyArray<{ x: number; y: number }>): number => {
  let worst = 0
  for (const p of a) {
    let best = Infinity
    for (let i = 1; i < b.length; i++) {
      const s = b[i - 1]!
      const e = b[i]!
      const dx = e.x - s.x
      const dy = e.y - s.y
      const l2 = dx * dx + dy * dy
      const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / l2))
      best = Math.min(best, Math.hypot(p.x - (s.x + t * dx), p.y - (s.y + t * dy)))
    }
    worst = Math.max(worst, best)
  }
  return worst
}

describe("spline geometry", () => {
  const from = { x: 0, y: 0, z: -1 }
  const quad = { to: { x: 10, y: 0, z: -1 }, controls: [{ x: 5, y: 10 }] }
  test("a quadratic Bezier peaks at the analytic height and its flattening stays within the tolerance", () => {
    expect(splinePoint(from, quad, 0.5).y).toBeCloseTo(5, 12)
    const pts = flattenSpline(from, quad, 0.005)
    const dense = Array.from({ length: 2001 }, (_, i) => splinePoint(from, quad, i / 2000))
    expect(hausdorff(dense, [from, ...pts])).toBeLessThanOrEqual(0.005 + 1e-9)
    expect(pts[pts.length - 1]).toEqual(quad.to)
  })
  test("the length of a cubic that is a straight line is the chord", () => {
    const line = { to: { x: 9, y: 0, z: -1 }, controls: [{ x: 3, y: 0 }, { x: 6, y: 0 }] }
    expect(splineLength(from, line)).toBeCloseTo(9, 9)
    expect(moveLength({ _tag: "Spline", ...line, feed: 100 }, from)).toBeCloseTo(9, 9)
  })
  test("expandMoves replaces a spline by lines that end on its end point", () => {
    const out = expandMoves([{ _tag: "Spline", ...quad, feed: 500 }], from)
    expect(out.every((m) => m._tag === "Linear")).toBe(true)
    expect(out.length).toBeGreaterThan(2)
    expect((out[out.length - 1] as { to: unknown }).to).toEqual(quad.to)
  })
})

describe("fitting polylines (spec 69 G3)", () => {
  test("a 1-degree half circle of radius 20 fits within 0.005 mm with far fewer segments, cubic and quadratic", () => {
    const pts = arcPoints().map((p) => ({ ...p, z: -1 }))
    for (const degree of [3, 2] as const) {
      const fits = fitPolyline(pts, { tolerance: 0.005, degree })
      expect(fits.length).toBeGreaterThan(0)
      expect(fits.length).toBeLessThan(pts.length / 8)
      for (const f of fits) {
        expect(f.error).toBeLessThanOrEqual(0.005)
        // independent check against the true circle: the fitted curve stays within tolerance plus the polyline's own sagitta (r(1-cos(0.5 deg)) = 0.0008)
        const s = pts[f.start]!
        let worst = 0
        for (let k = 0; k <= 50; k++) {
          const q = splinePoint(s, { to: f.to, controls: f.controls }, k / 50)
          worst = Math.max(worst, Math.abs(Math.hypot(q.x, q.y) - 20))
        }
        expect(worst).toBeLessThan(0.005 + 0.001)
      }
    }
  })
  test("corners are kept: a square is never rounded into a spline", () => {
    const sq: Move[] = []
    let x = 0, y = 0
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) for (let i = 0; i < 20; i++) { x += dx; y += dy; sq.push({ _tag: "Linear", to: { x, y, z: -1 }, feed: 500 }) }
    const out = fitSplineMoves(sq, { x: 0, y: 0, z: -1 }, { tolerance: 0.01 })
    // every corner point is still a vertex of the result
    const verts = out.map((m) => (m as { to: { x: number; y: number } }).to)
    for (const c of [{ x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }]) expect(verts.some((v) => Math.abs(v.x - c.x) < 1e-9 && Math.abs(v.y - c.y) < 1e-9)).toBe(true)
    // and the straight sides are not rounded off: collinear runs fit as exact curves
    expect(out.length).toBeLessThan(sq.length)
  })
  test("a run whose Z changes is left as lines", () => {
    const ramp: Move[] = Array.from({ length: 12 }, (_, i): Move => ({ _tag: "Linear", to: { x: i + 1, y: Math.sin(i / 3), z: -1 - i * 0.1 }, feed: 400 }))
    const out = fitSplineMoves(ramp, { x: 0, y: 0, z: -1 }, { tolerance: 0.05 })
    expect(out.every((m) => m._tag === "Linear")).toBe(true)
  })
})

describe("posted spline output", () => {
  const pts = arcPoints()
  const moves = polyline(pts)
  const lines = (nc: string): string[] => nc.split("\n")
  const cut = (nc: string): Array<{ x: number; y: number }> => interpretGcode(nc).segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind === "linear").map((s) => ({ x: s.to.x, y: s.to.y }))

  test("LinuxCNC: G5 cubic blocks replace the line blocks, the NC is smaller and the replay is within the chordal tolerance", () => {
    const plain = emit("linuxcnc", moves)
    const spline = emit("linuxcnc", moves, { splines: { tolerance: 0.005 } })
    expect(lines(spline).some((l) => l.startsWith("G5 "))).toBe(true)
    expect(lines(spline).length).toBeLessThan(lines(plain).length / 4)
    expect(spline.length).toBeLessThan(plain.length / 4)
    const replay = interpretGcode(spline)
    expect(replay.errors).toEqual([])
    const dev = hausdorff(cut(spline), pts)
    expect(dev).toBeLessThanOrEqual(0.005 + 1e-3)
    // the first and last point of the cut are the polyline's
    const c = cut(spline)
    expect(Math.hypot(c[c.length - 1]!.x - pts[pts.length - 1]!.x, c[c.length - 1]!.y - pts[pts.length - 1]!.y)).toBeLessThan(2e-3)
  })
  test("LinuxCNC: quadratic G5.1 blocks", () => {
    const spline = emit("linuxcnc", moves, { splines: { tolerance: 0.005, degree: 2 } })
    expect(lines(spline).some((l) => l.startsWith("G5.1 "))).toBe(true)
    expect(hausdorff(cut(spline), pts)).toBeLessThanOrEqual(0.005 + 1e-3)
  })
  test("Fanuc: G6.2 NURBS knot blocks replay to the same curve", () => {
    const spline = emit("fanuc", moves, { splines: { tolerance: 0.005 } })
    expect(lines(spline).some((l) => l.startsWith("G6.2 P4 K0"))).toBe(true)
    expect(lines(spline).some((l) => l.trim() === "K1")).toBe(true)
    const replay = interpretGcode(spline)
    expect(replay.errors).toEqual([])
    expect(hausdorff(cut(spline), pts)).toBeLessThanOrEqual(0.005 + 1e-3)
    expect(lines(spline).length).toBeLessThan(lines(emit("fanuc", moves)).length)
  })
  test("a control without spline words keeps the lines, even when splines are asked for", () => {
    const plain = emit("haas", moves)
    expect(emit("haas", moves, { splines: { tolerance: 0.005 } })).toBe(plain)
  })
  test("a Spline move already in the IR is written natively where the control can and as lines elsewhere", () => {
    const m: Move[] = [
      { _tag: "Rapid", to: { x: 0, y: 0, z: -1 } },
      { _tag: "Spline", to: { x: 10, y: 0, z: -1 }, controls: [{ x: 5, y: 10 }], feed: 400 }
    ]
    const native = emit("linuxcnc", m)
    expect(native).toContain("G5.1 X10.000 I5.000 J10.000 F400")
    const flat = emit("grbl", m)
    expect(flat).not.toMatch(/G5\.?1? X|G6\.2/)
    const dev = interpretGcode(flat).segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind === "linear")
    expect(dev.length).toBeGreaterThan(5)
    expect(Math.max(...dev.map((s) => s.to.y))).toBeCloseTo(5, 1)
  })
})
