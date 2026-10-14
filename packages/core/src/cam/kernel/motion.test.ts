import { describe, expect, test } from "bun:test"
import { planSimultaneous, toolAxisInMachine, type Cutter, type CutterLocation, type PartEnvelope, type TableKinematic } from "./index.ts"

const flat: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }
const kin: TableKinematic = { layout: "table-AC", limits: { tiltMin: -180, tiltMax: 180 }, pivot: { x: 0, y: 0, z: 0 } }
const part: PartEnvelope = { centre: { x: 0, y: 0, z: -20 }, half: { x: 30, y: 30, z: 10 } }
const start = { a: 0, c: 0 }
const at = (direction: { x: number; y: number; z: number }): CutterLocation => ({ point: { x: 0, y: 0, z: 0 }, direction })

describe("simultaneous five-axis motion", () => {
  test("every planned pose turns its location's axis onto machine +Z", () => {
    const locations = [at({ x: 0, y: 0, z: 1 }), at({ x: 0, y: 0.5, z: 1 }), at({ x: 0.3, y: 0.3, z: 1 })]
    const plan = planSimultaneous(locations, { kin, cutter: flat, nose: { x: 0, y: 0, z: 200 }, part, tolerance: 0.01, start })
    expect(plan).toBeDefined()
    expect(plan!.poses.length).toBe(4)
    for (let i = 0; i < locations.length; i++) {
      const d = locations[i]!.direction
      const m = toolAxisInMachine(d, plan!.poses[i + 1]!, kin.layout)
      expect(Math.hypot(m.x, m.y, m.z - 1)).toBeLessThan(1e-9)
    }
  })

  test("a path with the spindle far above the part is clear, and every move is in blocks", () => {
    const plan = planSimultaneous([at({ x: 0, y: 0, z: 1 }), at({ x: 0, y: 0.5, z: 1 })], { kin, cutter: flat, nose: { x: 0, y: 0, z: 200 }, part, tolerance: 0.01, start })
    expect(plan!.verdict).toBe("clear")
    for (const s of plan!.segments) {
      expect(s.blocks).toBeGreaterThanOrEqual(1)
      expect(s.deviation).toBeLessThanOrEqual(0.01 + 1e-9)
    }
  })

  test("a tilt that swings the part's edge into the shank under a low spindle is a collision", () => {
    // A = 135 degrees puts the part's edge through the shank's line 18 mm below the nose at z = 40 (see collision.test.ts).
    const plan = planSimultaneous([at({ x: 0, y: 0.707, z: -0.707 })], { kin, cutter: flat, nose: { x: 0, y: 0, z: 40 }, part, tolerance: 0.01, start })
    expect(plan).toBeDefined()
    expect(plan!.verdict).toBe("collision")
    const hit = plan!.segments.find((s) => s.verdict === "collision")
    expect(hit).toBeDefined()
    expect(hit!.clearance).toBeLessThan(0)
  })

  test("a direction the table cannot reach is not planned", () => {
    const tight: TableKinematic = { layout: "table-AC", limits: { tiltMin: -10, tiltMax: 10 }, pivot: { x: 0, y: 0, z: 0 } }
    expect(planSimultaneous([at({ x: 0, y: 0.707, z: -0.707 })], { kin: tight, cutter: flat, nose: { x: 0, y: 0, z: 200 }, part, tolerance: 0.01, start })).toBeUndefined()
  })
})
