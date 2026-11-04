import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { fiveAxisKinematic } from "../five-axis.ts"
import { elementMesh, type Mesh64 } from "../model/index.ts"
import { TriangleSoup } from "../model/mesh-queries.ts"
import { toolAxisInPart } from "../viewer/rotary.ts"
import { ToolSchema, type Tool } from "../tool.ts"
import { MultiaxisParams, generateMultiaxis, guideAxis, reachOf } from "./multiaxis.ts"
import type { Vec3 } from "../../cad/vec.ts"

const endmill = Schema.decodeUnknownSync(ToolSchema)({ id: "8", name: "8 mm ball", kind: "ballnose", diameter: 8, flutes: 2, maxRpm: 12000, stickout: 60 }) as Tool
const block = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh64 => elementMesh({ type: "cube", x, y, z, width: w, height: h, depth: d }, 0.01)!
const umc = fiveAxisKinematic({ layout: "table-BC", limits: { tilt: [-90, 120], rotation: [0, 360] }, pivot: { x: 0, y: 0, z: 0 }, tcp: "control" })
const setup = { layout: "table-BC" as const, pivot: { x: 0, y: 0, z: 0 }, coordinates: "part" as const, assumed: false, reasons: [] }
const params = (over: Record<string, unknown> = {}) => Schema.decodeUnknownSync(MultiaxisParams)({
  id: "ax", name: "axis", totalDepth: 10, stepdown: 10, clearanceHeight: 30, safeHeight: 20, retractHeight: 5, stepover: 40, gouge: false, ...over
})
const plate = new TriangleSoup([block(0, 0, -5, 40, 40, 10)], 1)
const unitOf = (a: Vec3): Vec3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l } }
const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI

/** The cuts of a toolpath as (tip, tool axis in the part). */
const cuts = (r: ReturnType<typeof generateMultiaxis>) => r.toolpath.moves.flatMap((m) => (m._tag === "Linear" && m.rotary !== undefined ? [{ tip: m.to, axis: toolAxisInPart({ b: m.rotary.b ?? 0, c: m.rotary.c ?? 0 }, setup) }] : []))

describe("tool-axis strategies (spec 69 F4)", () => {
  const top = plate.bounds.max[2]
  const mid = { x: (plate.bounds.min[0] + plate.bounds.max[0]) / 2, y: (plate.bounds.min[1] + plate.bounds.max[1]) / 2 }

  test("point: the axis passes through the point at every sample, to 1e-6", () => {
    const P = { x: mid.x, y: mid.y, z: top + 60 }
    const r = generateMultiaxis(params({ toolAxis: "point", axisPoint: P }), plate, endmill, umc)
    expect(r.warnings).toEqual([])
    const c = cuts(r)
    expect(c.length).toBeGreaterThan(20)
    let tilted = 0
    for (const s of c) {
      const want = unitOf({ x: P.x - s.tip.x, y: P.y - s.tip.y, z: P.z - s.tip.z })
      expect(angleBetween(s.axis, want)).toBeLessThan(1e-4)
      if (angleBetween(s.axis, { x: 0, y: 0, z: 1 }) > 3) tilted++
    }
    expect(tilted).toBeGreaterThan(5)
  })

  test("line and curve: the axis looks at the nearest point of the line / polyline", () => {
    const line = { a: { x: mid.x, y: mid.y - 30, z: top + 50 }, b: { x: mid.x, y: mid.y + 30, z: top + 50 } }
    const rl = generateMultiaxis(params({ toolAxis: "line", axisLine: line }), plate, endmill, umc)
    const cl = cuts(rl)
    expect(cl.length).toBeGreaterThan(20)
    for (const s of cl) {
      const want = guideAxis({ toolAxis: "line", axisLine: line }, s.tip)!
      expect(angleBetween(s.axis, want)).toBeLessThan(1e-4)
      // The nearest point on an infinite line lies in the plane x = line.x: the axis has no y component beyond the line's direction.
      expect(Math.abs(s.axis.y)).toBeLessThan(1e-6)
    }
    const curve = [{ x: mid.x - 20, y: mid.y, z: top + 45 }, { x: mid.x, y: mid.y, z: top + 60 }, { x: mid.x + 20, y: mid.y, z: top + 45 }]
    const rc = generateMultiaxis(params({ toolAxis: "curve", axisCurve: curve }), plate, endmill, umc)
    const cc = cuts(rc)
    expect(cc.length).toBeGreaterThan(20)
    for (const s of cc) expect(angleBetween(s.axis, guideAxis({ toolAxis: "curve", axisCurve: curve }, s.tip)!)).toBeLessThan(1e-4)
  })

  test("surface: the axis is the normal of the guide surface", () => {
    // A guide plane tilted 12 degrees about Y: the normal is (-sin 12, 0, cos 12) ... read from the soup itself.
    const guide = new TriangleSoup([{ positions: Float64Array.from([-60, -60, 0, 60, -60, 12.7, 60, 60, 12.7, -60, 60, 0]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) }], 5)
    const want = guideAxis({ toolAxis: "surface" }, { x: 0, y: 0, z: 5 }, guide)!
    expect(want.z).toBeGreaterThan(0.99)
    expect(Math.abs(want.x)).toBeGreaterThan(0.05)
    const r = generateMultiaxis(params({ toolAxis: "surface" }), plate, endmill, umc, undefined, undefined, guide)
    const c = cuts(r)
    expect(c.length).toBeGreaterThan(20)
    for (const s of c) expect(angleBetween(s.axis, guideAxis({ toolAxis: "surface" }, s.tip, guide)!)).toBeLessThan(1e-4)
    // Without the guide the strategy refuses with the reason instead of cutting something else.
    expect(generateMultiaxis(params({ toolAxis: "surface" }), plate, endmill, umc).warnings[0]).toMatch(/needs a guide surface/)
    expect(generateMultiaxis(params({ toolAxis: "point" }), plate, endmill, umc).warnings[0]).toMatch(/needs a point/)
  })

  test("maxTilt: no emitted sample is tilted past the limit, and the ones that would be are counted as skipped", () => {
    const P = { x: mid.x, y: mid.y, z: top + 60 }
    const free = generateMultiaxis(params({ toolAxis: "point", axisPoint: P }), plate, endmill, umc)
    const limited = generateMultiaxis(params({ toolAxis: "point", axisPoint: P, maxTilt: 8 }), plate, endmill, umc)
    for (const s of cuts(limited)) expect(angleBetween(s.axis, { x: 0, y: 0, z: 1 })).toBeLessThanOrEqual(8 + 1e-6)
    expect(limited.stats.skipped).toBeGreaterThan(free.stats.skipped)
    expect(cuts(limited).length).toBeLessThan(cuts(free).length)
  })

  test("shortest: beside a tall wall the axis leans away and the holder needs less stick-out than with the normal axis", () => {
    // A 25 mm wall 3 mm beyond the plate edge on +x; the holder (Ø16) over a contact near that edge would hit it.
    const wallSoup = new TriangleSoup([block(0, 0, -5, 40, 40, 10), block(26, 0, 12.5, 6, 40, 25)], 1)
    const x0 = wallSoup.bounds.min[0]
    void x0
    const holderDiameter = 16
    const normalRun = generateMultiaxis(params({ toolAxis: "normal", holderDiameter, stepover: 100, sampling: 2 }), wallSoup, endmill, umc)
    const shortRun = generateMultiaxis(params({ toolAxis: "shortest", holderDiameter, gougeAngle: 30, stepover: 100, sampling: 2 }), wallSoup, endmill, umc)
    expect(shortRun.warnings).toEqual([])
    const nearWall = (s: { tip: Vec3 }) => s.tip.x > 12 && s.tip.x < 20
    const reachOfRun = (c: ReturnType<typeof cuts>) => {
      const sel = c.filter(nearWall)
      expect(sel.length).toBeGreaterThan(3)
      return Math.max(...sel.map((s) => reachOf(s.tip, s.axis, holderDiameter / 2, 6, 60, wallSoup, 0.02)))
    }
    const normalReach = reachOfRun(cuts(normalRun)), shortReach = reachOfRun(cuts(shortRun))
    expect(normalReach).toBeGreaterThan(15)
    expect(shortReach).toBeLessThan(normalReach)
    // Away from the wall nothing needs to lean: the shortest axis is the normal.
    for (const s of cuts(shortRun).filter((q) => q.tip.x < 0)) expect(angleBetween(s.axis, { x: 0, y: 0, z: 1 })).toBeLessThan(1e-6)
  })
})
