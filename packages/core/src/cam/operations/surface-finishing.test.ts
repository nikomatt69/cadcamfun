import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { makeProgram } from "../ir.ts"
import { buildPartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import { verifyToolpath } from "../verify/index.ts"
import { SCALLOP_WALL_ANGLE, SurfaceParams, generateSurface, geodesicDistance, scallopSpacing } from "./surface.ts"

// Finishing a surface samples tens of thousands of drop-cutter positions; a loaded machine needs room.
setDefaultTimeout(90000)

const ball = (d: number): Tool => ({ id: "b", name: "ball", kind: "ballnose", diameter: d, flutes: 2, maxRpm: 20000 })
const flat = (d: number): Tool => ({ id: "f", name: "flat", kind: "endmill", diameter: d, flutes: 2, maxRpm: 20000 })
const params = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(SurfaceParams)({ totalDepth: 12, stepdown: 3, ...extra })
const stockAt = (x0: number, y0: number, x: number, y: number, z: number, top = 0): Stock => ({ x, y, z, origin: { x: x0, y: y0, z: top }, material: "aluminum" })
const cuts = (r: ReturnType<typeof generateSurface>) => r.toolpath.moves.flatMap((m) => (m._tag === "Linear" ? [m.to] : []))

/** A sphere of radius 10 whose top is at z = 0 (centre at -10). A ball of radius 2 rides a sphere of radius 12 about the centre. */
const sphere = () => buildPartModel([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: -10 }], { cell: 0.1, tolerance: 0.002 })!
const sphereTip = (rho: number): number => Math.sqrt(12 ** 2 - rho ** 2) - 12

/** Points every 0.05 mm along the cutting moves (lines and arcs), so gaps are measured to the path and not to its vertices. */
const dense = (r: ReturnType<typeof generateSurface>) => {
  const out: Array<{ x: number; y: number; z: number }> = []
  let prev: { x: number; y: number; z: number } | undefined
  for (const m of r.toolpath.moves) {
    if (m._tag !== "Linear" && m._tag !== "Rapid" && m._tag !== "Arc") continue
    if (m._tag === "Linear" && prev !== undefined) {
      const n = Math.max(1, Math.ceil(Math.hypot(m.to.x - prev.x, m.to.y - prev.y) / 0.05))
      for (let k = 1; k <= n; k++) out.push({ x: prev.x + ((m.to.x - prev.x) * k) / n, y: prev.y + ((m.to.y - prev.y) * k) / n, z: prev.z + ((m.to.z - prev.z) * k) / n })
    }
    if (m._tag === "Arc" && prev !== undefined) {
      const rad = Math.hypot(prev.x - m.center.x, prev.y - m.center.y)
      const a0 = Math.atan2(prev.y - m.center.y, prev.x - m.center.x)
      let sweep = Math.atan2(m.to.y - m.center.y, m.to.x - m.center.x) - a0
      if (m.clockwise && sweep >= 0) sweep -= 2 * Math.PI
      if (!m.clockwise && sweep <= 0) sweep += 2 * Math.PI
      const n = Math.max(1, Math.ceil((Math.abs(sweep) * rad) / 0.05))
      for (let k = 1; k <= n; k++) {
        const a = a0 + (sweep * k) / n
        out.push({ x: m.center.x + rad * Math.cos(a), y: m.center.y + rad * Math.sin(a), z: prev.z + ((m.to.z - prev.z) * k) / n })
      }
    }
    prev = m.to
  }
  return out
}

describe("geodesic distance over a sampled surface", () => {
  const grid = (w: number, h: number, z: (i: number, j: number) => number) => {
    const out = new Float64Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = z(i, j)
    return out
  }
  test("on a plane it is the straight distance: exact along axes and diagonals, within 2.7 % in between", () => {
    const w = 41, h = 41
    const inside = new Uint8Array(w * h).fill(1), seed = new Uint8Array(w * h)
    seed[20 * w + 20] = 1
    const d = geodesicDistance(grid(w, h, () => 0), inside, seed, w, h, 0.5, 0.5)
    expect(d[20 * w + 30]).toBeCloseTo(5, 12)
    expect(d[27 * w + 27]).toBeCloseTo(Math.hypot(3.5, 3.5), 12)
    for (const [i, j] of [[30, 23], [26, 39], [33, 25], [5, 13]] as const) {
      const truth = Math.hypot((i - 20) * 0.5, (j - 20) * 0.5)
      expect(d[j * w + i]!).toBeGreaterThanOrEqual(truth - 1e-12)
      expect(d[j * w + i]! / truth).toBeLessThan(1.027)
    }
  })

  test("up a 30 degree incline the distance is the length along the slope, and a gap is walked round, never jumped", () => {
    const w = 31, h = 11, dx = 0.2
    const tan = Math.tan(Math.PI / 6)
    const inside = new Uint8Array(w * h).fill(1), seed = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) seed[j * w] = 1
    const d = geodesicDistance(grid(w, h, (i) => i * dx * tan), inside, seed, w, h, dx, dx)
    expect(d[5 * w + 30]).toBeCloseTo((30 * dx) / Math.cos(Math.PI / 6), 9)
    // A wall of outside nodes across x = 3 with one opening at the top row: the path must go round through it.
    const walled = new Uint8Array(w * h).fill(1)
    for (let j = 0; j < h - 1; j++) walled[j * w + 15] = 0
    const g = geodesicDistance(grid(w, h, () => 0), walled, seed, w, h, dx, dx)
    expect(g[0 * w + 16]!).toBeGreaterThan(2 * (h - 1) * dx)
    expect(g[0 * w + 15]).toBe(Infinity)
  })
})

describe("constant-scallop (3D offset) finishing", () => {
  const s = scallopSpacing(2, 0.01)
  const run = () => generateSurface(params({ strategy: "scallop", totalDepth: 11, stepdown: 11, scallop: 0.01, tolerance: 0.005 }), sphere(), ball(4), stockAt(-12, -12, 24, 24, 12))

  test("rings over the sphere a constant distance apart along its surface, where a raster spreads apart on the slope", () => {
    const r = run()
    expect(r.stats.loops).toBeGreaterThan(10)
    const pts = cuts(r)
    // Every point rides the ball's surface: never below the analytic drop-cutter height, never far above it.
    // Above it by at most the slope times half a cell (the drop-cutter's conservative side), so the bound is checked off the rim.
    for (const p of pts) {
      const rho = Math.hypot(p.x, p.y)
      if (rho > 11.5) continue
      expect(p.z).toBeGreaterThanOrEqual(sphereTip(rho) - 0.012)
      if (rho <= 8.5) expect(p.z).toBeLessThan(sphereTip(rho) + 0.08)
    }
    // Polar angle of each tip point on the tip surface: the sphere of ball centres (radius 12 about (0, 0, -10)) 2 mm lower,
    // so radius 12 about (0, 0, -12). A ring is a cluster of equal angles.
    // A ring holds many points at one angle; the links between rings (the tool stays down) only a few in between.
    const bin = (0.05 * s) / 12
    const counts = new Map<number, number>()
    for (const p of pts) { const k = Math.round(Math.atan2(Math.hypot(p.x, p.y), p.z + 12) / bin); counts.set(k, (counts.get(k) ?? 0) + 1) }
    const busy = [...counts].filter(([, n]) => n >= 8).map(([k]) => k).sort((a, b) => a - b)
    const rings: number[] = []
    let group: number[] = []
    for (const k of busy) {
      if (group.length > 0 && k - group[group.length - 1]! > 2) { rings.push((bin * group.reduce((a, b) => a + b, 0)) / group.length); group = [] }
      group.push(k)
    }
    if (group.length > 0) rings.push((bin * group.reduce((a, b) => a + b, 0)) / group.length)
    const arcs = rings.slice(1).map((a, i) => 12 * (a - rings[i]!))
    // Inner rings, away from the crest and from the steep edge: arc spacing within the grid's distance error of the target.
    // Inner rings, away from the crest and from the steep edge. The mean is the target; each one is within the grid's distance
    // error and the measurement's binning (a ring's angle is the mean of its bins).
    const middle = arcs.filter((_, i) => i > 1 && i < arcs.length - 3)
    expect(middle.length).toBeGreaterThan(20)
    expect(middle.reduce((a, b) => a + b, 0) / middle.length / s).toBeCloseTo(1, 1)
    expect(Math.abs(middle.reduce((a, b) => a + b, 0) / middle.length / s - 1)).toBeLessThan(0.02)
    for (const a of middle) {
      expect(a).toBeLessThanOrEqual(s * 1.06)
      expect(a).toBeGreaterThan(s * 0.92)
    }
    // A raster at the same line spacing opens up to s / cos(slope) along the surface: 3x the target at 70 degrees.
    expect(s / Math.cos((70 * Math.PI) / 180)).toBeGreaterThan(2.9 * s)
  })

  test("the verifier finds no gouge, and the steep rim beyond the wall angle is reported, not cut", () => {
    const r = run()
    expect(r.warnings.join(" ")).toContain(`steeper than ${SCALLOP_WALL_ANGLE} degrees`)
    const report = verifyToolpath({
      program: makeProgram("scallop", [r.toolpath]),
      stock: { minX: -12, maxX: 12, minY: -12, maxY: 12, minZ: -12, maxZ: 0 },
      tool: { kind: "ballnose", diameter: 4 },
      target: { solids: [{ _tag: "Sphere", center: { x: 0, y: 0, z: -10 }, radius: 10, rings: 64 }] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
  })
})

describe("spiral and radial finishing", () => {
  /** Largest distance in plan from a point of the disc of radius `rho` to the nearest cutting position. */
  const worstGap = (pts: ReadonlyArray<{ x: number; y: number }>, rho: number): number => {
    let worst = 0
    for (let x = -rho; x <= rho; x += 0.37) for (let y = -rho; y <= rho; y += 0.41) {
      if (Math.hypot(x, y) > rho) continue
      let best = Infinity
      for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d < best) best = d }
      if (best > worst) worst = best
    }
    return worst
  }
  for (const strategy of ["spiral", "radial"] as const) {
    test(`${strategy}: rides the sphere and leaves no point of it further than half a spacing from a pass`, () => {
      const r = generateSurface(params({ strategy, totalDepth: 11, stepdown: 11, stepover: 10, tolerance: 0.005 }), sphere(), ball(4), stockAt(-12, -12, 24, 24, 12))
      expect(r.stats.lines).toBeGreaterThan(0)
      const pts = dense(r).filter((p) => p.z < 0.5)
      for (const p of pts) {
        const rho = Math.hypot(p.x, p.y)
        if (rho > 11.5) continue
        expect(p.z).toBeGreaterThanOrEqual(sphereTip(rho) - 0.012)
      }
      // Spacing 0.4 mm (10 % of 4 mm): every point of the top of the sphere within half of it (plus the sampling).
      expect(worstGap(pts, 8)).toBeLessThan(0.2 + 0.06)
    })
  }

  test("the pattern centre can be moved off the middle of the part", () => {
    const r = generateSurface(params({ strategy: "spiral", totalDepth: 11, stepdown: 11, stepover: 25, center: { x: 3, y: -2 } }), sphere(), ball(4), stockAt(-12, -12, 24, 24, 12))
    const first = cuts(r)[0]!
    expect(Math.hypot(first.x - 3, first.y + 2)).toBeLessThan(0.5)
  })
})

describe("flat-area finishing", () => {
  // A 40 x 30 plate with its top at z = 0 and a 10 x 10 boss on it up to z = 5.
  const part = () => buildPartModel([
    { type: "cube", width: 40, height: 30, depth: 10, z: -5 },
    { type: "cube", width: 10, height: 10, depth: 5, z: 2.5 }
  ], { cell: 0.1, tolerance: 0.002 })!
  const run = () => generateSurface(params({ strategy: "flat", totalDepth: 15, stepdown: 15, stepover: 40, tolerance: 0.01 }), part(), flat(6), stockAt(-20, -15, 40, 30, 15, 5))

  test("finishes the boss top and the plate top at their exact heights, keeping the cutter off the boss walls", () => {
    const r = run()
    expect(r.stats.levels).toBe(2)
    const pts = cuts(r)
    const onFace = pts.filter((p) => Math.abs(p.z) < 1e-6 || Math.abs(p.z - 5) < 1e-6)
    expect(onFace.length).toBeGreaterThan(20)
    // Anything else is the entry, above a face: never below the plate top, never into the boss.
    for (const p of pts) expect(p.z).toBeGreaterThanOrEqual(-1e-6)
    for (const p of pts.filter((q) => Math.abs(q.z) < 1e-6)) {
      const dx = Math.max(0, Math.abs(p.x) - 5), dy = Math.max(0, Math.abs(p.y) - 5)
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(3 - 0.06)
    }
  })

  test("covers the plate top: every point of it is under the cutter somewhere at z = 0", () => {
    const pts = dense(run()).filter((p) => Math.abs(p.z) < 1e-6)
    let worst = 0
    for (let x = -19.5; x <= 19.5; x += 1.3) for (let y = -14.5; y <= 14.5; y += 1.1) {
      if (Math.abs(x) < 5 && Math.abs(y) < 5) continue
      let best = Infinity
      for (const p of pts) best = Math.min(best, Math.hypot(p.x - x, p.y - y))
      worst = Math.max(worst, best)
    }
    expect(worst).toBeLessThan(3)
  })

  test("the verifier finds no gouge against the plate and the boss; a sloped surface has no flat face", () => {
    const report = verifyToolpath({
      program: makeProgram("flat", [run().toolpath]), stock: { minX: -20, maxX: 20, minY: -15, maxY: 15, minZ: -10, maxZ: 5 },
      tool: { kind: "endmill", diameter: 6 }, fixtures: [], tolerance: 0.05,
      target: { solids: [{ _tag: "Box", origin: { x: -20, y: -15, z: -10 }, size: { x: 40, y: 30, z: 10 } }, { _tag: "Box", origin: { x: -5, y: -5, z: 0 }, size: { x: 10, y: 10, z: 5 } }] }
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
    const dome = generateSurface(params({ strategy: "flat", totalDepth: 11, stepdown: 11 }), sphere(), flat(6), stockAt(-12, -12, 24, 24, 12))
    expect(dome.stats.loops).toBe(0)
    expect(dome.toolpath.moves.some((m) => m._tag === "Comment" && m.text.includes("no flat face"))).toBe(true)
  })
})
