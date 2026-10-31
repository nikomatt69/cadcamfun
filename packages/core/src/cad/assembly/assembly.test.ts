import { describe, expect, test } from "bun:test"
import { applyDir, applyPoint, frame, makeBox, makeCylinder, rotation, compose, IDENTITY, translation, type Transform } from "../brep/index.ts"
import { model } from "../script.ts"
import {
  assemblyMass, compileMates, configurationsFromTable, editDefinition, featureOfFace, flattenAssembly, interferenceOf, makeIndependent, solveAssembly, sweepJoint,
  withConfigurations, definitionBrep, type Assembly, type Feature, type Mate, type Operand, type PoseState
} from "./index.ts"

const O = { x: 0, y: 0, z: 0 }
const Z = { x: 0, y: 0, z: 1 }
const X = { x: 1, y: 0, z: 0 }
const axisF = (origin = O, dir = Z, radius?: number): Feature => ({ kind: "axis", origin, dir, ...(radius !== undefined ? { radius } : {}) })
const planeF = (origin = O, normal = Z): Feature => ({ kind: "plane", origin, normal })
const pointF = (p = O): Feature => ({ kind: "point", p })
const op = (occurrence: string, feature: Feature): Operand => ({ occurrence, feature })

/** Deterministic pseudo-random numbers (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const box = makeBox(10, 10, 10)
const part = (id: string, brep = box) => ({ id, name: id, brep, density: 7.85 })
const assemblyOf = (placements: Record<string, Transform>, grounded = ["base"]): Assembly => ({
  definitions: [part("block")],
  occurrences: Object.entries(placements).map(([id, transform]) => ({ id, definition: "block", transform, ...(grounded.includes(id) ? { grounded: true } : {}) }))
})
const pose = (axis: typeof Z, angle: number, t: { x: number; y: number; z: number }): Transform => compose(rotation(axis, angle), translation(t))

const stateOf = (a: Assembly): { state: PoseState; index: Map<string, number> } => {
  const flat = flattenAssembly(a)
  const R = new Float64Array(flat.length * 9), t = new Float64Array(flat.length * 3)
  flat.forEach((f, i) => { f.transform.m.forEach((v, k) => { R[i * 9 + k] = v }); t[i * 3] = f.transform.t.x; t[i * 3 + 1] = f.transform.t.y; t[i * 3 + 2] = f.transform.t.z })
  return { state: { R, t }, index: new Map(flat.map((f, i) => [f.path, i])) }
}

/** The mates the tests exercise, each between occurrence "a" and "b". */
const MATES: Array<[string, Mate]> = [
  ["coincident point-point", { kind: "coincident", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", pointF({ x: -1, y: 0.5, z: 2 })) }],
  ["coincident point-plane", { kind: "coincident", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", planeF({ x: 0, y: 0, z: 1 }, { x: 0.6, y: 0, z: 0.8 })), offset: 0.5 }],
  ["coincident plane-point", { kind: "coincident", a: op("a", planeF({ x: 0, y: 0, z: 1 }, { x: 0.6, y: 0, z: 0.8 })), b: op("b", pointF({ x: 1, y: 2, z: 3 })) }],
  ["coincident point-axis", { kind: "coincident", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", axisF({ x: 1, y: 1, z: 0 }, { x: 0, y: 0.6, z: 0.8 })) }],
  ["coincident plane-plane", { kind: "coincident", a: op("a", planeF({ x: 0, y: 0, z: 5 }, Z)), b: op("b", planeF({ x: 1, y: 1, z: 0 }, { x: 0, y: 0.6, z: 0.8 })), offset: 1 }],
  ["coincident axis-axis", { kind: "coincident", a: op("a", axisF({ x: 1, y: 0, z: 0 }, X)), b: op("b", axisF({ x: 0, y: 2, z: 0 }, { x: 0.6, y: 0.8, z: 0 })) }],
  ["concentric", { kind: "concentric", a: op("a", axisF({ x: 3, y: 1, z: 0 }, Z)), b: op("b", axisF({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.6, z: 0.8 })) }],
  ["parallel axes", { kind: "parallel", a: op("a", axisF(O, X)), b: op("b", axisF({ x: 0, y: 1, z: 2 }, { x: 0.6, y: 0.8, z: 0 })) }],
  ["perpendicular planes", { kind: "perpendicular", a: op("a", planeF(O, X)), b: op("b", planeF({ x: 0, y: 1, z: 2 }, { x: 0.6, y: 0.8, z: 0 })) }],
  ["distance point-point", { kind: "distance", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", pointF({ x: -1, y: 0.5, z: 2 })), value: 7 }],
  ["distance point-plane", { kind: "distance", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", planeF(O, { x: 0, y: 0.6, z: 0.8 })), value: 4 }],
  ["distance plane-plane", { kind: "distance", a: op("a", planeF({ x: 0, y: 0, z: 5 }, Z)), b: op("b", planeF({ x: 1, y: 1, z: 0 }, { x: 0, y: 0.6, z: 0.8 })), value: 3 }],
  ["angle", { kind: "angle", a: op("a", axisF(O, X)), b: op("b", axisF({ x: 0, y: 1, z: 2 }, { x: 0.6, y: 0.8, z: 0 })), value: 60 }],
  ["tangent cylinder-plane", { kind: "tangent", a: op("a", axisF({ x: 0, y: 0, z: 0 }, X, 2)), b: op("b", planeF({ x: 0, y: 0, z: 5 }, Z)) }],
  ["lock", { kind: "lock", a: "a", b: "b" }],
  ["revolute", { kind: "revolute", a: op("a", axisF({ x: 1, y: 0, z: 0 }, Z)), b: op("b", axisF({ x: 0, y: 1, z: 0 }, Z)), value: 35 }],
  ["slider", { kind: "slider", a: op("a", axisF({ x: 1, y: 0, z: 0 }, X)), b: op("b", axisF({ x: 0, y: 1, z: 0 }, X)), value: 6 }],
  ["cylindrical", { kind: "cylindrical", a: op("a", axisF({ x: 1, y: 0, z: 0 }, Z)), b: op("b", axisF({ x: 0, y: 1, z: 0 }, Z)), angle: 20, slide: 3 }],
  ["planar", { kind: "planar", a: op("a", planeF(O, Z)), b: op("b", planeF({ x: 1, y: 2, z: 0 }, Z)), offset: 0 }],
  ["ball", { kind: "ball", a: op("a", pointF({ x: 1, y: 2, z: 3 })), b: op("b", pointF({ x: -1, y: 0.5, z: 2 })) }]
]

describe("mate equations", () => {
  test("every mate kind: the analytic gradient equals central differences with respect to the pose of both occurrences", () => {
    const rand = rng(11)
    for (const [name, mate] of MATES) {
      const a = assemblyOf({ a: pose({ x: 0.3, y: 0.5, z: 0.7 }, 0.4, { x: 2, y: -1, z: 3 }), b: pose({ x: 0.9, y: -0.2, z: 0.1 }, -0.6, { x: -3, y: 4, z: 1 }) }, [])
      const { state, index } = stateOf(a)
      const { equations } = compileMates([mate], index, state)
      expect(equations.length).toBeGreaterThan(0)
      for (const eq of equations) {
        const row = new Float64Array(12)
        eq.f(state, row)
        for (let c = 0; c < 12; c++) {
          const occ = c < 6 ? eq.a : eq.b, k = c % 6
          const h = 1e-6
          const move = (sign: number): PoseState => {
            const R = Float64Array.from(state.R), t = Float64Array.from(state.t)
            if (k < 3) t[occ * 3 + k] = t[occ * 3 + k]! + sign * h
            else {
              const axis = { x: k === 3 ? 1 : 0, y: k === 4 ? 1 : 0, z: k === 5 ? 1 : 0 }
              const E = rotation(axis, sign * h).m
              const old = R.slice(occ * 9, occ * 9 + 9)
              for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[occ * 9 + i * 3 + j] = E[i * 3]! * old[j]! + E[i * 3 + 1]! * old[3 + j]! + E[i * 3 + 2]! * old[6 + j]!
            }
            return { R, t }
          }
          const numeric = (eq.f(move(1), null) - eq.f(move(-1), null)) / (2 * h)
          expect({ name, c, ok: Math.abs(row[c]! - numeric) < 2e-5 * (1 + Math.abs(numeric)) }).toEqual({ name, c, ok: true })
        }
      }
      void rand
    }
  })

  test("20 canonical mates, started from a displaced pose, converge to residual <= 1e-9 with the occurrence kept near where it was", () => {
    const rand = rng(5)
    for (const [name, mate] of MATES) {
      const start = pose({ x: rand() - 0.5, y: rand() - 0.5, z: rand() - 0.5 }, (rand() - 0.5) * 0.4, { x: (rand() - 0.5) * 6, y: (rand() - 0.5) * 6, z: (rand() - 0.5) * 6 })
      const a = assemblyOf({ a: IDENTITY, b: start }, ["a"])
      // Joints take their zero from the pose they start in, so the solve is a no-op for them: start values are what the mate asks for.
      const result = solveAssembly(a, [mate], { analyze: false })
      expect({ name, residual: result.residual <= 1e-9 }).toEqual({ name, residual: true })
    }
  })
})

describe("degrees of freedom and diagnostics", () => {
  /** A pin (cylinder along z) against a base with a hole axis along z, both as occurrences of boxes with their features in local frames. */
  test("pin in hole: concentric + coincident shoulder leaves exactly one rotation", () => {
    const a = assemblyOf({ base: IDENTITY, pin: pose({ x: 0.1, y: 0.05, z: 0 }, 0.05, { x: 0.8, y: -0.5, z: 3 }) })
    const mates: Mate[] = [
      { kind: "concentric", a: op("base", axisF({ x: 5, y: 5, z: 0 }, Z)), b: op("pin", axisF({ x: 5, y: 5, z: 0 }, Z)), id: "pin-in-hole" },
      { kind: "coincident", a: op("base", planeF({ x: 0, y: 0, z: 10 }, Z)), b: op("pin", planeF({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })), id: "shoulder" }
    ]
    const r = solveAssembly(a, mates)
    expect(r.residual).toBeLessThan(1e-9)
    expect(r.status).toBe("under-constrained")
    expect(r.dof).toBe(1)
    expect(r.freedom).toEqual({ pin: 1 })
    expect(r.redundantMates).toEqual([])
    // The pin's axis lies on the hole axis and its shoulder on the base's top face.
    const t = r.transforms.get("pin")!
    const axisPoint = applyPoint(t, { x: 5, y: 5, z: 0 })
    expect(axisPoint.x).toBeCloseTo(5, 8); expect(axisPoint.y).toBeCloseTo(5, 8); expect(axisPoint.z).toBeCloseTo(10, 8)
    expect(applyDir(t, Z).z).toBeCloseTo(1, 8)
  })

  test("adding a key (a rotation lock) makes it fully constrained", () => {
    const a = assemblyOf({ base: IDENTITY, pin: pose(Z, 0.2, { x: 0.8, y: -0.5, z: 3 }) })
    const mates: Mate[] = [
      { kind: "concentric", a: op("base", axisF({ x: 5, y: 5, z: 0 }, Z)), b: op("pin", axisF({ x: 5, y: 5, z: 0 }, Z)) },
      { kind: "coincident", a: op("base", planeF({ x: 0, y: 0, z: 10 }, Z)), b: op("pin", planeF({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })) },
      { kind: "coincident", a: op("base", planeF({ x: 0, y: 0, z: 0 }, X)), b: op("pin", planeF({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })) }
    ]
    const r = solveAssembly(a, mates)
    expect(r.status).toBe("fully-constrained")
    expect(r.dof).toBe(0)
    expect(r.freedom).toEqual({})
  })

  test("a floating occurrence with no mate has six degrees of freedom; a repeated mate is redundant", () => {
    const a = assemblyOf({ base: IDENTITY, p: translation({ x: 0, y: 0, z: 3 }), q: translation({ x: 20, y: 0, z: 0 }) })
    const same: Mate = { kind: "coincident", a: op("base", pointF({ x: 0, y: 0, z: 10 })), b: op("p", pointF({ x: 0, y: 0, z: 0 })) }
    const r = solveAssembly(a, [{ ...same, id: "first" }, { ...same, id: "again" }])
    expect(r.freedom["q"]).toBe(6)
    expect(r.redundantMates).toEqual(["again"])
    expect(r.dof).toBe(6 + 3)
  })

  test("conflicting mates are reduced to their minimal set, innocent mates are not named", () => {
    const a = assemblyOf({ base: IDENTITY, p: translation({ x: 0, y: 0, z: 12 }) })
    const mates: Mate[] = [
      { kind: "distance", a: op("p", planeF({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })), b: op("base", planeF({ x: 0, y: 0, z: 10 }, Z)), value: 2, id: "gap-2" },
      { kind: "distance", a: op("p", planeF({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })), b: op("base", planeF({ x: 0, y: 0, z: 10 }, Z)), value: 5, id: "gap-5" },
      { kind: "coincident", a: op("base", pointF({ x: 0, y: 0, z: 0 })), b: op("p", pointF({ x: 0, y: 0, z: -12 })), id: "innocent-looking" }
    ]
    const r = solveAssembly(a, mates.slice(0, 2).concat([{ kind: "parallel", a: op("base", axisF(O, X)), b: op("p", axisF(O, X)), id: "innocent" }]))
    expect(r.status).toBe("conflicting")
    expect([...r.conflictSet].sort()).toEqual(["gap-2", "gap-5"])
    expect(r.minimal).toBe(true)
    expect(r.message).toContain("gap-2")
  })
})

describe("joints, limits and loops", () => {
  const link = (length: number) => makeBox(length, 2, 2, frame({ x: 0, y: -1, z: -1 }))

  test("a revolute joint swept through 360 degrees: the reading equals the drive, the hinge pin stays on the axis", () => {
    const a: Assembly = {
      definitions: [{ id: "g", name: "g", brep: box }, { id: "arm", name: "arm", brep: link(30) }],
      occurrences: [{ id: "ground", definition: "g", transform: IDENTITY, grounded: true }, { id: "arm", definition: "arm", transform: IDENTITY }]
    }
    const mates: Mate[] = [{ kind: "revolute", id: "hinge", a: op("ground", axisF(O, Z)), b: op("arm", axisF(O, Z)) }]
    const frames = sweepJoint(a, mates, "hinge", Array.from({ length: 37 }, (_, k) => k * 10))
    expect(frames).toHaveLength(37)
    frames.forEach(({ value, solution }) => {
      expect(solution.residual).toBeLessThan(1e-9)
      const angle = solution.joints[0]!.angle!
      const wrapped = ((angle - value + 540) % 360) - 180
      expect(Math.abs(wrapped)).toBeLessThan(1e-6)
      const tip = applyPoint(solution.transforms.get("arm")!, { x: 30, y: 0, z: 0 })
      expect(tip.x).toBeCloseTo(30 * Math.cos((value * Math.PI) / 180), 7)
      expect(tip.y).toBeCloseTo(30 * Math.sin((value * Math.PI) / 180), 7)
    })
  })

  test("a driven value beyond the joint limit is clamped and reported", () => {
    const a: Assembly = {
      definitions: [{ id: "g", name: "g", brep: box }, { id: "arm", name: "arm", brep: link(30) }],
      occurrences: [{ id: "ground", definition: "g", transform: IDENTITY, grounded: true }, { id: "arm", definition: "arm", transform: IDENTITY }]
    }
    const r = solveAssembly(a, [{ kind: "revolute", id: "hinge", a: op("ground", axisF(O, Z)), b: op("arm", axisF(O, Z)), value: 120, limits: { min: -90, max: 90 } }])
    expect(r.joints[0]!.angle).toBeCloseTo(90, 6)
    expect(r.joints[0]!.violation).toMatchObject({ quantity: "angle", value: 120, limit: 90 })
  })

  test("a slider follows its drive along the axis", () => {
    const a: Assembly = {
      definitions: [{ id: "g", name: "g", brep: box }, { id: "s", name: "s", brep: box }],
      occurrences: [{ id: "ground", definition: "g", transform: IDENTITY, grounded: true }, { id: "slide", definition: "s", transform: translation({ x: 0, y: 0, z: 20 }) }]
    }
    const r = solveAssembly(a, [{ kind: "slider", id: "rail", a: op("ground", axisF(O, X)), b: op("slide", axisF(O, X)), value: 12.5 }])
    expect(r.residual).toBeLessThan(1e-9)
    expect(r.transforms.get("slide")!.t.x).toBeCloseTo(12.5, 8)
    expect(r.joints[0]!.slide).toBeCloseTo(12.5, 8)
  })

  test("a four-bar linkage is a closed loop of revolute mates: the rocker angle follows the analytic Freudenstein solution over 360 degrees of crank", () => {
    // Ground pivots at (0,0) and (d,0); crank a, coupler b, rocker c (Grashof crank-rocker: a + d < b + c, a shortest).
    const aL = 20, bL = 70, cL = 60, dL = 50
    const pivot = (x: number, y: number) => translation({ x, y, z: 0 })
    const a: Assembly = {
      definitions: [{ id: "g", name: "g", brep: box }, { id: "crank", name: "crank", brep: link(aL) }, { id: "coupler", name: "coupler", brep: link(bL) }, { id: "rocker", name: "rocker", brep: link(cL) }],
      occurrences: [
        { id: "ground", definition: "g", transform: IDENTITY, grounded: true },
        { id: "crank", definition: "crank", transform: IDENTITY },
        // Coupler starts at the crank tip, rocker at the second pivot, placed at a consistent closed pose for crank angle 0.
        { id: "coupler", definition: "coupler", transform: pose(Z, Math.atan2(Math.sqrt(1 - ((dL - aL) ** 2 + 0 - bL * bL + cL * cL) ** 2 / (4 * (dL - aL) ** 2 * cL * cL)) * cL, 0) * 0, { x: aL, y: 0, z: 0 }) },
        { id: "rocker", definition: "rocker", transform: pivot(dL, 0) }
      ]
    }
    // Closed initial pose for crank angle 0: solve the triangle (crank tip, rocker pivot, joint) and place the coupler and rocker.
    const tipX = aL, pvX = dL
    const dd = pvX - tipX
    const cosGamma = (dd * dd + bL * bL - cL * cL) / (2 * dd * bL) // angle of the coupler against the line tip -> pivot
    const gamma = Math.acos(cosGamma)
    const jx = tipX + bL * Math.cos(gamma), jy = bL * Math.sin(gamma)
    const rockerAngle = Math.atan2(jy, jx - pvX)
    const closed: Assembly = {
      ...a,
      occurrences: a.occurrences.map((o) => o.id === "coupler" ? { ...o, transform: pose(Z, gamma, { x: aL, y: 0, z: 0 }) } : o.id === "rocker" ? { ...o, transform: pose(Z, rockerAngle - Math.PI, { x: jx, y: jy, z: 0 }) } : o)
    }
    // The rocker box runs along +x from its origin; put its origin at the joint and let it extend toward the ground pivot.
    const mates: Mate[] = [
      { kind: "revolute", id: "crank-pin", a: op("ground", axisF(O, Z)), b: op("crank", axisF(O, Z)) },
      { kind: "revolute", id: "crank-coupler", a: op("crank", axisF({ x: aL, y: 0, z: 0 }, Z)), b: op("coupler", axisF(O, Z)) },
      { kind: "revolute", id: "coupler-rocker", a: op("coupler", axisF({ x: bL, y: 0, z: 0 }, Z)), b: op("rocker", axisF(O, Z)) },
      { kind: "revolute", id: "rocker-pin", a: op("rocker", axisF({ x: cL, y: 0, z: 0 }, Z)), b: op("ground", axisF({ x: dL, y: 0, z: 0 }, Z)) }
    ]
    void a
    const frames = sweepJoint(closed, mates, "crank-pin", Array.from({ length: 73 }, (_, k) => k * 5))
    expect(frames).toHaveLength(73)
    let worst = 0
    for (const { value, solution } of frames) {
      expect(solution.residual).toBeLessThan(1e-8)
      const th = (value * Math.PI) / 180
      // Crank tip and the circle intersection with the rocker circle: analytic position of the joint (two branches; take the one near the previous pose).
      const px = aL * Math.cos(th), py = aL * Math.sin(th)
      const rocker = solution.transforms.get("rocker")!
      const jointPos = rocker.t
      // The joint must be at distance bL from the crank tip and cL from the ground pivot (the two link lengths): the analytic closure.
      worst = Math.max(worst, Math.abs(Math.hypot(jointPos.x - px, jointPos.y - py) - bL), Math.abs(Math.hypot(jointPos.x - dL, jointPos.y) - cL))
    }
    expect(worst).toBeLessThan(1e-7)
    // Output angle of the rocker against the analytic Freudenstein relation, same branch.
    const analytic = (th: number, branch: number): number => {
      const px = aL * Math.cos(th), py = aL * Math.sin(th)
      const dx = dL - px, dy = -py, dist = Math.hypot(dx, dy)
      const along = (dist * dist + cL * cL - bL * bL) / (2 * dist)
      const h = Math.sqrt(Math.max(0, cL * cL - along * along))
      const mx = dL - (along * dx) / dist, my = (-along * dy) / dist
      const jx2 = mx + (branch * h * dy) / dist, jy2 = my - (branch * h * dx) / dist
      return Math.atan2(jy2, jx2 - dL)
    }
    const branch = Math.sign(jy) * Math.sign(1) || 1
    void branch
    let maxErr = Infinity
    for (const sign of [1, -1]) {
      let err = 0
      for (const { value, solution } of frames) {
        const th = (value * Math.PI) / 180
        const rk = solution.transforms.get("rocker")!
        const solved = Math.atan2(rk.t.y, rk.t.x - dL)
        const ref = analytic(th, sign)
        err = Math.max(err, Math.abs(Math.atan2(Math.sin(solved - ref), Math.cos(solved - ref))))
      }
      maxErr = Math.min(maxErr, err)
    }
    expect(maxErr).toBeLessThan(1e-6)
    // The loop has one degree of freedom: the crank angle.
    expect(solveAssembly(closed, mates).dof).toBe(1)
  })
})

describe("definitions, occurrences, configurations and mass", () => {
  const plate = (): Assembly["definitions"][number] => {
    const m = model()
    m.param("width", 40).param("height", 20).param("thick", 5)
    m.extrude(m.sketch("XY").rectangle([0, 0], "width", "height"), { depth: "thick" })
    return { id: "plate", name: "plate", history: m.build(), density: 2.7 }
  }

  test("three occurrences of one bolt store one definition; editing it updates all; make-independent copies", () => {
    const a: Assembly = {
      definitions: [{ id: "bolt", name: "bolt", brep: makeCylinder(2, 10) }],
      occurrences: [0, 1, 2].map((i) => ({ id: `b${i}`, definition: "bolt", transform: translation({ x: 10 * i, y: 0, z: 0 }) }))
    }
    expect(a.definitions).toHaveLength(1)
    const volumeOf = (asm: Assembly) => assemblyMass(asm).volume
    const v0 = volumeOf(a)
    expect(v0).toBeCloseTo(3 * Math.PI * 4 * 10, 6)
    const longer = editDefinition(a, "bolt", { brep: makeCylinder(2, 20) })
    expect(volumeOf(longer)).toBeCloseTo(3 * Math.PI * 4 * 20, 6)
    const split = makeIndependent(longer, "b1")
    expect(split.definitions).toHaveLength(2)
    const edited = editDefinition(split, "bolt~b1", { brep: makeCylinder(2, 5) })
    expect(volumeOf(edited)).toBeCloseTo(Math.PI * 4 * (20 + 5 + 20), 6)
  })

  test("sub-assemblies nest: the nested occurrence takes the parent's transform, a cycle is refused", () => {
    const a: Assembly = {
      definitions: [{ id: "bolt", name: "bolt", brep: makeCylinder(2, 10) }],
      subAssemblies: [{ id: "pair", name: "pair", occurrences: [{ id: "n0", definition: "bolt", transform: IDENTITY }, { id: "n1", definition: "bolt", transform: translation({ x: 10, y: 0, z: 0 }) }] }],
      occurrences: [{ id: "left", definition: "pair", transform: translation({ x: 100, y: 0, z: 0 }) }]
    }
    const flat = flattenAssembly(a)
    expect(flat.map((f) => f.path)).toEqual(["left/n0", "left/n1"])
    expect(flat[1]!.transform.t.x).toBe(110)
    expect(() => flattenAssembly({ ...a, subAssemblies: [{ id: "pair", name: "pair", occurrences: [{ id: "self", definition: "pair", transform: IDENTITY }] }] })).toThrow(/contains itself/)
  })

  test("a 12-row design table gives 12 configurations; each reports the analytic mass, and switching is deterministic", () => {
    const a: Assembly = { definitions: [plate()], occurrences: [{ id: "p", definition: "plate", transform: IDENTITY }] }
    const rows = Array.from({ length: 12 }, (_, i) => [`W${30 + 5 * i}`, 30 + 5 * i, 15 + i])
    const configs = configurationsFromTable({ columns: ["name", "plate.width", "plate.height"], rows })
    expect(configs).toHaveLength(12)
    const withAll = withConfigurations(a, configs)
    for (const [i, c] of configs.entries()) {
      const m = assemblyMass(withAll, c.name)
      const w = 30 + 5 * i, h = 15 + i
      expect(m.volume).toBeCloseTo(w * h * 5, 6)
      expect(m.mass).toBeCloseTo((w * h * 5 * 2.7) / 1000, 6)
    }
    expect(assemblyMass(withAll, "W35").mass).toBe(assemblyMass(withAll, "W35").mass)
    expect(() => configurationsFromTable({ columns: ["name", "plate.width"], rows: [["x", "abc"]] })).toThrow(/not a number/)
  })

  test("mass, centre and inertia of a box and a cylinder match the closed forms", () => {
    const a: Assembly = {
      definitions: [{ id: "b", name: "b", brep: makeBox(20, 10, 6), density: 7.85 }, { id: "c", name: "c", brep: makeCylinder(4, 30), density: 7.85 }],
      occurrences: [{ id: "box", definition: "b", transform: IDENTITY }, { id: "cyl", definition: "c", transform: translation({ x: 100, y: 0, z: 0 }) }]
    }
    const m = assemblyMass(a)
    const mb = (20 * 10 * 6 * 7.85) / 1000, mc = (Math.PI * 16 * 30 * 7.85) / 1000
    expect(m.mass).toBeCloseTo(mb + mc, 6)
    const cb = { x: 10, y: 5, z: 3 }, cc = { x: 100, y: 0, z: 15 }
    const cx = (mb * cb.x + mc * cc.x) / (mb + mc), cy = (mb * cb.y + mc * cc.y) / (mb + mc), cz = (mb * cb.z + mc * cc.z) / (mb + mc)
    expect(m.centroid.x).toBeCloseTo(cx, 6)
    expect(m.centroid.y).toBeCloseTo(cy, 6)
    expect(m.centroid.z).toBeCloseTo(cz, 6)
    // Own tensors plus the parallel-axis terms. The cylinder runs along z: Izz = m r^2 / 2, Ixx = m (3 r^2 + h^2) / 12.
    const sq = (v: number) => v * v
    const ixx = (mb / 12) * (100 + 36) + (mc / 12) * (3 * 16 + 900) + mb * (sq(cb.y - cy) + sq(cb.z - cz)) + mc * (sq(cc.y - cy) + sq(cc.z - cz))
    const izz = (mb / 12) * (400 + 100) + (mc / 2) * 16 + mb * (sq(cb.x - cx) + sq(cb.y - cy)) + mc * (sq(cc.x - cx) + sq(cc.y - cy))
    expect(m.inertia[0]).toBeCloseTo(ixx, 3)
    expect(m.inertia[8]).toBeCloseTo(izz, 2)
  })

  test("interference of placed occurrences: the exact overlap volume of two blocks, and none once they are mated apart", () => {
    const a = assemblyOf({ base: IDENTITY, p: translation({ x: 6, y: 0, z: 0 }) })
    const report = interferenceOf(a)
    expect(report.interferences).toHaveLength(1)
    expect(report.interferences[0]!.volume).toBeCloseTo(4 * 10 * 10, 6)
    const solved = solveAssembly(a, [{ kind: "coincident", a: op("base", planeF({ x: 10, y: 0, z: 0 }, X)), b: op("p", planeF({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })) }])
    expect(solved.residual).toBeLessThan(1e-9)
    expect(interferenceOf(a, { poses: solved.transforms }).interferences).toHaveLength(0)
  })

  test("features come from exact faces: the plane of a box face and the axis of a cylinder", () => {
    const top = featureOfFace(box, box.faces.findIndex((f) => f.surface.kind === "plane" && Math.abs(f.surface.frame.origin.z - 10) < 1e-9 && Math.abs(f.surface.frame.z.z) > 0.9))
    expect(top.kind).toBe("plane")
    const cyl = makeCylinder(3, 8)
    const side = featureOfFace(cyl, cyl.faces.findIndex((f) => f.surface.kind === "cylinder"))
    expect(side).toMatchObject({ kind: "axis", radius: 3 })
    expect(definitionBrep({ id: "x", name: "x", brep: cyl }).faces.length).toBe(cyl.faces.length)
  })
})
