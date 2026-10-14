import { describe, expect, test } from "bun:test"
import { anglesFor, partToMachine, type RotaryLayout } from "../indexing.ts"
import { candidatesFor, forward, planTable, toolAxisInMachine, travel, unwrapC, type TableKinematic } from "./kinematics.ts"

const kin = (layout: RotaryLayout, limits: TableKinematic["limits"] = { tiltMin: -120, tiltMax: 120 }): TableKinematic => ({ layout, limits, pivot: { x: 0, y: 0, z: 0 } })
const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l } }
/** Deterministic directions on the upper hemisphere within `maxPolar` degrees of the spindle (reachable by a +-120 tilt). */
const sample = (n: number, maxPolar = 80) => Array.from({ length: n }, (_, k) => {
  const t = (k + 0.5) / n
  const phi = k * 2.399963
  const z = Math.cos((maxPolar * Math.PI) / 180 * t)
  const r = Math.sqrt(1 - z * z)
  return unit(r * Math.cos(phi), r * Math.sin(phi), z)
})

describe("inverse kinematics", () => {
  for (const layout of ["table-AC", "table-BC"] as const) {
    test(`${layout}: every direction the table reaches lands exactly on machine +Z (round trip)`, () => {
      for (const d of sample(400)) {
        const cands = candidatesFor(d, kin(layout))
        const reference = anglesFor(d, layout)
        expect(cands.length).toBe(reference.length)
        for (const c of cands) {
          const m = toolAxisInMachine(d, c.angles, layout)
          expect(Math.hypot(m.x, m.y, m.z - 1)).toBeLessThan(1e-9)
          expect(c.residual).toBeLessThan(1e-9)
        }
      }
    })

    test(`${layout}: the forward kinematics of a point agrees with the indexing maths`, () => {
      const d = unit(0.3, -0.5, 0.8)
      const [first] = candidatesFor(d, kin(layout))
      const p = { x: 4, y: -2, z: 7 }
      const pivot = { x: 1, y: 1, z: -3 }
      const k = { ...kin(layout), pivot }
      expect(forward(p, first!.angles, k)).toEqual(partToMachine(p, first!.angles, layout, pivot))
    })
  }

  test("a direction along the spindle has the zero-tilt solution, marked singular", () => {
    const [c] = candidatesFor({ x: 0, y: 0, z: 1 }, kin("table-AC"))
    expect(c!.tilt).toBeCloseTo(0, 9)
    expect(c!.singularity).toBe(1)
    expect(candidatesFor({ x: 1, y: 0, z: 0 }, kin("table-AC"))[0]!.singularity).toBe(0)
  })

  test("limits remove the solutions the table cannot reach", () => {
    const horizontal = unit(1, 0, 0.05)
    expect(candidatesFor(horizontal, kin("table-AC", { tiltMin: -30, tiltMax: 30 }))).toEqual([])
    expect(candidatesFor(horizontal, kin("table-AC", { tiltMin: -120, tiltMax: 120 })).length).toBeGreaterThan(0)
  })

  test("the second branch is the other way round: tilt negated, C turned by 180 degrees", () => {
    const d = unit(0.4, 0.2, 0.9)
    const [a, b] = candidatesFor(d, kin("table-AC"))
    expect(a!.branch).toBe(0)
    expect(b!.branch).toBe(1)
    expect(b!.tilt).toBeCloseTo(-a!.tilt, 9)
    expect(Math.abs(Math.abs(b!.c - a!.c) - 180)).toBeLessThan(1e-9)
  })
})

describe("C unwrapping", () => {
  test("C is brought to the turn nearest the previous one, never normalised block by block", () => {
    expect(unwrapC(179, -179)).toBeCloseTo(-181, 9)
    expect(unwrapC(-179, 179)).toBeCloseTo(181, 9)
    expect(unwrapC(10, 350)).toBeCloseTo(370, 9)
  })

  test("a C limit excludes the turn that is otherwise nearest: the one inside the limits is taken, or none", () => {
    // -181 is nearest to -179 but outside [-180, 180]: the position is 179, a long way round.
    expect(unwrapC(179, -179, -180, 180)).toBeCloseTo(179, 9)
    expect(unwrapC(179, -179, 0, 90)).toBeUndefined()
  })
})

describe("the table plan", () => {
  test("a sequence of directions costs no more than the greedy choice of each position", () => {
    const k = kin("table-AC")
    const dirs = sample(40)
    const plan = planTable(dirs, k, { tilt: 0, c: 0 })
    expect(plan).toBeDefined()
    expect(plan!.positions).toHaveLength(dirs.length)
    // Every planned position is a true solution of its direction.
    dirs.forEach((d, i) => {
      const c = plan!.positions[i]!.candidate
      const m = toolAxisInMachine(d, c.angles, "table-AC")
      expect(Math.hypot(m.x, m.y, m.z - 1)).toBeLessThan(1e-9)
    })
    // The total equals the sum of the moves of the path.
    let sum = 0
    let prev = { tilt: 0, c: 0 }
    for (const p of plan!.positions) { sum += Math.abs(p.candidate.tilt - prev.tilt) + Math.abs(p.candidate.c - prev.c); prev = { tilt: p.candidate.tilt, c: p.candidate.c } }
    expect(plan!.travel).toBeCloseTo(sum, 6)
  })

  test("a path that crosses the 180 degree seam keeps C continuous (no full-turn rewind)", () => {
    // Two directions a little apart in azimuth that straddle the C = +-180 seam: the plan must stay on one side.
    const dirs = [unit(0.6, 0.1, 0.7), unit(0.6, -0.1, 0.7), unit(0.6, -0.2, 0.7)]
    const plan = planTable(dirs, kin("table-AC"), { tilt: 0, c: 170 })
    expect(plan).toBeDefined()
    const cs = plan!.positions.map((p) => p.candidate.c)
    for (let i = 1; i < cs.length; i++) expect(Math.abs(cs[i]! - cs[i - 1]!)).toBeLessThan(90)
  })

  test("an unreachable direction makes the whole plan undefined, not a partial program", () => {
    const dirs = [unit(0, 0, 1), unit(1, 0, 0.02)]
    expect(planTable(dirs, kin("table-AC", { tiltMin: -20, tiltMax: 20 }), { tilt: 0, c: 0 })).toBeUndefined()
  })

  test("the planned travel is never worse than taking the nearest solution of every direction", () => {
    const k = kin("table-BC")
    const dirs = sample(30)
    const plan = planTable(dirs, k, { tilt: 0, c: 0 })!
    let greedy = 0
    let prev = { tilt: 0, c: 0 }
    for (const d of dirs) {
      const best = candidatesFor(d, k, prev.c).reduce((a, b) => (travel(prev as never, a) <= travel(prev as never, b) ? a : b))
      greedy += travel(prev as never, best)
      prev = { tilt: best.tilt, c: best.c }
    }
    expect(plan.travel).toBeLessThanOrEqual(greedy + 1e-9)
  })
})
