import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, massProperties, validateBrep, type Brep } from "./brep/index.ts"
import { requireThread } from "./fasteners.ts"
import { rebuildExact } from "./history-brep.ts"
import type { History } from "./history.ts"
import { model } from "./script.ts"
import { fastenerSolids, holeRole, planFasteners, socketHeadScrew } from "./smart-fasteners.ts"

setDefaultTimeout(60_000)

const exact = (h: History): Brep => {
  const r = rebuildExact(h)
  expect(r.bodies.map((b) => b.reason)).toEqual([undefined])
  return r.bodies[0]!.brep!
}
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)

/** A 40 x 40 block from z0 to z0 + h with holes drilled from its top face. */
const block = (z0: number, h: number, holes: ReadonlyArray<{ at: readonly [number, number]; d: number; depth: number; cbore?: readonly [number, number] }>): Brep => {
  const m = model()
  m.extrude(m.sketch("XY", z0).rectangle([0, 0], 40, 40), { depth: h, id: "block" })
  holes.forEach((q, i) => m.hole({
    plane: "XY", offset: z0 + h, at: q.at, diameter: q.d, depth: q.depth, id: `h${i}`,
    ...(q.cbore !== undefined ? { kind: "counterbore" as const, headDiameter: q.cbore[0], headDepth: q.cbore[1] } : {})
  }))
  return exact(m.build())
}

describe("hole roles from the ISO tables", () => {
  test("clearance holes, tap drills and other diameters", () => {
    expect(holeRole(9)).toMatchObject({ kind: "clearance", fit: "medium" })
    expect((holeRole(9) as { thread: { name: string } }).thread.name).toBe("M8")
    expect((holeRole(6.6) as { thread: { name: string } }).thread.name).toBe("M6")
    expect(holeRole(6.8)).toMatchObject({ kind: "tapped" })
    expect((holeRole(6.8) as { thread: { name: string } }).thread.name).toBe("M8")
    expect(holeRole(7.7).kind).toBe("none")
  })
})

describe("smart fasteners", () => {
  test("a plate on a tapped block: one M8x20 socket head screw with a washer, 8.4 mm of thread engaged", () => {
    const base = block(0, 30, [{ at: [20, 20], d: 6.8, depth: 20 }])
    const plate = block(30, 10, [{ at: [20, 20], d: 9, depth: 10 }])
    const { plans, unfastened } = planFasteners([{ id: "plate", brep: plate }, { id: "base", brep: base }])
    expect(unfastened).toEqual([])
    expect(plans.length).toBe(1)
    const p = plans[0]!
    expect(p.designation).toBe("ISO 4762 M8x20")
    expect(p.bodies).toEqual(["plate", "base"])
    expect(p.tapped).toBe("base")
    near(p.direction.z, -1)
    // The head sits on the ISO 7089 washer (1.6 mm) on the top face.
    near(p.seat.z, 41.6)
    near(p.seat.x, 20)
    near(p.grip, 10)
    near(p.engagement!, 20 - 11.6)
    expect(p.headWasher?.designation).toBe("ISO 7089 M8")
    expect(p.nut).toBeUndefined()
    expect(p.warnings).toEqual([])
  })

  test("two plates with M10 clearance holes: screw, two washers and a nut, length rounded up to M10x40", () => {
    const lower = block(0, 10, [{ at: [10, 10], d: 11, depth: 10 }])
    const upper = block(10, 10, [{ at: [10, 10], d: 11, depth: 10 }])
    const { plans, unfastened } = planFasteners([{ id: "lower", brep: lower }, { id: "upper", brep: upper }])
    expect(unfastened).toEqual([])
    expect(plans.length).toBe(1)
    const p = plans[0]!
    // grip 20 + washer 2 + washer 2 + nut 8.4 + two pitches 3 = 35.4 -> 40.
    expect(p.designation).toBe("ISO 4762 M10x40")
    expect(p.bodies).toEqual(["upper", "lower"])
    near(p.seat.z, 22)
    near(p.nutWasherAt!.z, 0)
    near(p.nut!.at.z, -2)
    expect(p.nut!.designation).toBe("ISO 4032 M10")
    const solids = fastenerSolids(p)
    expect(solids.map((s) => s.role)).toEqual(["screw", "washer", "washer", "nut"])
    for (const s of solids) {
      const rep = validateBrep(s.brep)
      expect(rep.issues.map((i) => i.message)).toEqual([])
      expect(rep.manifoldSolid).toBe(true)
    }
    // Nothing the planner places overlaps the parts it clamps.
    for (const s of solids) for (const part of [lower, upper]) {
      const common = booleanBrep(s.brep, part, "intersect").brep
      expect(common.faces.length === 0 ? 0 : massProperties(common).volume).toBeLessThan(1e-6)
    }
  })

  test("a counterbored plate on a tapped block: the head sinks into the counterbore, no washer, M8x10", () => {
    const base = block(0, 30, [{ at: [20, 20], d: 6.8, depth: 20 }])
    const plate = block(30, 10, [{ at: [20, 20], d: 9, depth: 10, cbore: [15, 8.6] }])
    const p = planFasteners([{ id: "base", brep: base }, { id: "plate", brep: plate }]).plans[0]!
    expect(p.designation).toBe("ISO 4762 M8x10")
    near(p.seat.z, 40 - 8.6)
    expect(p.headWasher).toBeUndefined()
    near(p.engagement!, 8.6)
    expect(p.warnings).toEqual([])
    const [screw] = fastenerSolids(p)
    // The head stays inside the counterbore: no overlap with the plate.
    const common = booleanBrep(screw!.brep, plate, "intersect").brep
    expect(common.faces.length === 0 ? 0 : massProperties(common).volume).toBeLessThan(1e-6)
  })

  test("mismatched sizes and lone parts are reported, not fastened", () => {
    const base = block(0, 30, [{ at: [10, 10], d: 7.7, depth: 20 }, { at: [30, 30], d: 6.6, depth: 30 }])
    const plate = block(30, 10, [{ at: [10, 10], d: 9, depth: 10 }])
    const { plans, unfastened } = planFasteners([{ id: "plate", brep: plate }, { id: "base", brep: base }])
    expect(plans).toEqual([])
    const reasons = unfastened.map((u) => u.reason).sort()
    expect(reasons.length).toBe(2)
    expect(reasons[0]).toBe("a single part: nothing to clamp")
    expect(reasons[1]).toContain("neither an M8 clearance hole nor its 6.8 mm tap drill")
  })

  test("the screw solid: exact volume of head, shank, chamfers and hexagon socket", () => {
    const m8 = requireThread("M8")
    const s = socketHeadScrew(m8, 30, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })
    const rep = validateBrep(s)
    expect(rep.issues.map((i) => i.message)).toEqual([])
    const e = Math.min(0.08 * 13, 0.5), c = Math.min(1.25, 0.8)
    const head = Math.PI * 6.5 ** 2 * 8 - (2 * Math.PI * (6.5 - e / 3) * (e * e / 2)) // cylinder minus the revolved edge chamfer
    const shank = Math.PI * 4 ** 2 * (30 - c) + (Math.PI * c / 3) * (4 ** 2 + 4 * (4 - c) + (4 - c) ** 2)
    const hexArea = (3 * Math.sqrt(3) / 2) * (6 / Math.sqrt(3)) ** 2
    const expected = head + shank - hexArea * 4
    near(massProperties(s).volume, expected, 1e-6 * expected)
  })
})
