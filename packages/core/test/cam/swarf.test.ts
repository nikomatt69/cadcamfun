import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { booleanBrep } from "../../src/cad/brep/boolean.ts"
import { frame } from "../../src/cad/brep/math.ts"
import { makeBox, makeCone, makeCylinder } from "../../src/cad/brep/primitives.ts"
import { bodyTessellation } from "../../src/cad/brep/tessellate.ts"
import type { Brep } from "../../src/cad/brep/topology.ts"
import { fiveAxisKinematic } from "../../src/cam/five-axis.ts"
import { tableRotation } from "../../src/cam/indexing.ts"
import type { Move } from "../../src/cam/ir.ts"
import { TriangleSoup } from "../../src/cam/model/mesh-queries.ts"
import { MultiaxisParams, generateMultiaxis } from "../../src/cam/operations/multiaxis.ts"
import { swarfWallOfFace, swarfWalls } from "../../src/cam/swarf-walls.ts"
import type { Tool } from "../../src/cam/tool.ts"

setDefaultTimeout(60_000)
const Z = { x: 0, y: 0, z: 1 }
const CENTRE = { x: 40, y: 30 }
const PLATE = { w: 80, d: 60, t: 10 }
/** A plate with a tapered boss on it: radius 20 at the plate, 12 at the top, 30 high (a 14.9 degree wall). */
const tapered = () => booleanBrep(makeBox(PLATE.w, PLATE.d, PLATE.t), makeCone(20, 12, 30, frame({ x: CENTRE.x, y: CENTRE.y, z: PLATE.t }, Z)), "union").brep
const R0 = 20, SLOPE = -8 / 30, COS = 1 / Math.sqrt(1 + SLOPE * SLOPE)
const tool: Tool = { id: "t1", name: "Endmill 10", kind: "endmill", diameter: 10, flutes: 3, maxRpm: 12000 }
const kin = fiveAxisKinematic({ layout: "table-AC", limits: { tilt: [-120, 120], rotation: [-720, 720] }, pivot: { x: CENTRE.x, y: CENTRE.y, z: 20 }, tcp: "program" })
const params = (over: Record<string, unknown> = {}) => Schema.decodeUnknownSync(MultiaxisParams)({ strategy: "swarf", totalDepth: 30, stepdown: 30, clearanceHeight: 80, safeHeight: 60, retractHeight: 50, ...over })
const soupOf = (b: Brep) => { const t = bodyTessellation(b, { chordTol: 0.02 }); return new TriangleSoup([{ positions: t.positions, indices: t.indices }], 1) }

/** Signed distance of a point to the boss's cone (positive outside, in mm): square to the surface, closed form. */
const distanceToCone = (p: { x: number; y: number; z: number }): number => {
  const rho = Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y), v = p.z - PLATE.t
  return (rho - (R0 + SLOPE * v)) * COS
}
/** The tool in the part frame at a move: tip and axis, from the machine position and the table angles. */
const poseOf = (m: Extract<Move, { _tag: "Linear" }>) => {
  const a = m.rotary!
  const r = tableRotation({ a: a.a ?? 0, c: a.c ?? 0 }, kin.layout)
  const q = { x: m.to.x - kin.pivot.x, y: m.to.y - kin.pivot.y, z: m.to.z - kin.pivot.z }
  // The table turns the part by R: the part-frame point is R^T (m - pivot) + pivot.
  return {
    tip: { x: r[0] * q.x + r[3] * q.y + r[6] * q.z + kin.pivot.x, y: r[1] * q.x + r[4] * q.y + r[7] * q.z + kin.pivot.y, z: r[2] * q.x + r[5] * q.y + r[8] * q.z + kin.pivot.z },
    axis: { x: r[6], y: r[7], z: r[8] }
  }
}

describe("the walls of a solid", () => {
  test("a tapered boss gives rulings along the cone: ends on the wall, normals away from the axis", () => {
    const b = tapered()
    const face = b.faces.findIndex((f) => f.surface.kind === "cone")
    const wall = swarfWallOfFace(b, face)
    if (typeof wall === "string") throw new Error(wall)
    expect(wall.bottom.length).toBeGreaterThan(30)
    for (let i = 0; i < wall.bottom.length; i++) {
      expect(Math.abs(distanceToCone(wall.bottom[i]!))).toBeLessThan(1e-9)
      expect(Math.abs(distanceToCone(wall.top[i]!))).toBeLessThan(1e-9)
      expect(wall.bottom[i]!.z).toBeLessThan(wall.top[i]!.z)
      const n = wall.normal[i]!
      expect(n.x * (wall.bottom[i]!.x - CENTRE.x) + n.y * (wall.bottom[i]!.y - CENTRE.y)).toBeGreaterThan(0)
    }
    expect(wall.concaveRadius).toBeUndefined()
  })

  test("a countersink-like concave wall is read with its radius", () => {
    const sink = booleanBrep(makeBox(40, 30, 10), makeCone(2, 6, 4, frame({ x: 20, y: 15, z: 6 }, Z)), "subtract").brep
    const w = swarfWallOfFace(sink, sink.faces.findIndex((f) => f.surface.kind === "cone"))
    if (typeof w === "string") throw new Error(w)
    expect(w.concaveRadius).toBeGreaterThan(2)
  })
})

describe("flank milling a cone wall", () => {
  const b = tapered()
  const wall = (swarfWalls(b).walls.find((w) => b.faces[w.face]!.surface.kind === "cone"))!.wall
  const r = generateMultiaxis(params(), soupOf(b), tool, kin, [wall])
  const cutting = r.toolpath.moves.filter((m): m is Extract<Move, { _tag: "Linear" }> => m._tag === "Linear" && m.rotary !== undefined && m.feed === params().feed)

  test("makes a five-axis program in several bands up the wall, none skipped", () => {
    expect(r.warnings).toEqual([])
    expect(r.stats.skipped).toBe(0)
    expect(r.stats.sections).toBe(4)
    expect(cutting.length).toBeGreaterThan(100)
  })

  test("at every pose the flank lies on the wall: the axis is parallel to the ruling and the gap is zero over the whole flute length", () => {
    const lean = Math.atan(8 / 30) // the wall's lean from the axis
    let worst = 0
    for (const m of cutting) {
      const { tip, axis } = poseOf(m)
      expect(Math.acos(axis.z)).toBeCloseTo(lean, 6)
      for (const s of [0, 2.5, 5, 7.5, 10]) {
        const g = distanceToCone({ x: tip.x + axis.x * s, y: tip.y + axis.y * s, z: tip.z + axis.z * s }) - tool.diameter / 2
        worst = Math.max(worst, Math.abs(g))
      }
    }
    expect(worst).toBeLessThan(1e-6)
  })

  test("between two poses the flank stays within the chord tolerance of the wall (never inside it)", () => {
    let worst = 0, inside = 0
    for (let i = 1; i < cutting.length; i++) {
      const a = poseOf(cutting[i - 1]!), c = poseOf(cutting[i]!)
      // Only consecutive poses of one pass.
      if (Math.hypot(a.tip.x - c.tip.x, a.tip.y - c.tip.y, a.tip.z - c.tip.z) > 4) continue
      const mid = { x: (a.tip.x + c.tip.x) / 2, y: (a.tip.y + c.tip.y) / 2, z: (a.tip.z + c.tip.z) / 2 }
      const ax = { x: a.axis.x + c.axis.x, y: a.axis.y + c.axis.y, z: a.axis.z + c.axis.z }
      const l = Math.hypot(ax.x, ax.y, ax.z)
      for (const s of [0, 5, 10]) {
        const g = distanceToCone({ x: mid.x + (ax.x / l) * s, y: mid.y + (ax.y / l) * s, z: mid.z + (ax.z / l) * s }) - tool.diameter / 2
        worst = Math.max(worst, Math.abs(g))
        if (g < -0.01) inside++
      }
    }
    expect(worst).toBeLessThan(0.01)
    expect(inside).toBe(0)
  })

  test("the passes cover the wall from its foot to its top: the bands overlap and reach both ends", () => {
    const poses = cutting.map(poseOf)
    // The wall point a pose touches is its tip less one radius along the outward normal, whose rise is sin(lean).
    const rise = (tool.diameter / 2) * Math.sin(Math.atan(8 / 30))
    expect(Math.min(...poses.map((p) => p.tip.z - rise))).toBeCloseTo(PLATE.t, 3)
    expect(Math.max(...poses.map((p) => p.tip.z + p.axis.z * 10 - rise))).toBeCloseTo(PLATE.t + 30, 3)
  })
})

describe("a table that cannot wind a full turn", () => {
  test("the pass is split where the C axis runs out of range, retracted and resumed: every pose is still on the wall", () => {
    const b = tapered()
    const wall = swarfWalls(b).walls.find((w) => b.faces[w.face]!.surface.kind === "cone")!.wall
    const limited = fiveAxisKinematic({ layout: "table-AC", limits: { tilt: [-120, 120], rotation: [-180, 180] }, pivot: kin.pivot, tcp: "program" })
    const r = generateMultiaxis(params(), soupOf(b), tool, limited, [wall])
    expect(r.stats.skipped).toBe(0)
    expect(r.stats.sections).toBeGreaterThan(4)
    for (const m of r.toolpath.moves) if (m._tag === "Linear" && m.rotary !== undefined) expect(Math.abs(m.rotary.c ?? 0)).toBeLessThanOrEqual(180 + 1e-9)
  })
})

describe("what the flank cannot do", () => {
  test("a concave wall tighter than the cutter, a ball nose and a missing wall are reported, not cut", () => {
    const b = tapered()
    const wall = swarfWalls(b).walls[0]!.wall
    const soup = soupOf(b)
    expect(generateMultiaxis(params(), soup, tool, kin, [{ ...wall, concaveRadius: 4 }]).warnings.join(" ")).toContain("concave")
    expect(generateMultiaxis(params(), soup, { ...tool, kind: "ballnose" }, kin, [wall]).warnings.join(" ")).toContain("ball nose")
    expect(generateMultiaxis(params(), soup, tool, kin).warnings.join(" ")).toContain("needs the walls")
  })

  test("a cutter that would gouge another feature leaves those poses out and counts them", () => {
    // A second boss close to the first: the cutter beside the wall runs into it.
    const b = booleanBrep(tapered(), makeCylinder(8, 30, frame({ x: CENTRE.x + 31, y: CENTRE.y, z: PLATE.t }, Z)), "union").brep
    const wall = swarfWalls(b).walls.find((w) => b.faces[w.face]!.surface.kind === "cone")!.wall
    const r = generateMultiaxis(params(), soupOf(b), tool, kin, [wall])
    expect(r.stats.skipped).toBeGreaterThan(0)
  })
})
