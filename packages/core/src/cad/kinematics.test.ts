import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { AssemblyPart } from "./assembly-analysis.ts"
import { frame, makeBox, makeCylinder } from "./brep/index.ts"
import { motionStudy, poseOfPoint, solvePose, validateKinematics, type KinematicModel } from "./kinematics.ts"

setDefaultTimeout(60_000)
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)
const Z = { x: 0, y: 0, z: 1 }, X = { x: 1, y: 0, z: 0 }, O = { x: 0, y: 0, z: 0 }

describe("forward kinematics", () => {
  test("a revolute joint turns its child about the axis through the origin", () => {
    const m: KinematicModel = { ground: "base", joints: [{ id: "j", parent: "base", child: "arm", kind: "revolute", origin: { x: 10, y: 0, z: 0 }, axis: Z }] }
    const p = solvePose(m, { j: 90 })
    const tip = poseOfPoint(p, "arm", { x: 30, y: 0, z: 0 })
    near(tip.x, 10); near(tip.y, 20); near(tip.z, 0)
    near(poseOfPoint(p, "base", { x: 5, y: 5, z: 5 }).x, 5)
  })
  test("a chain composes: the second joint moves with the first", () => {
    const m: KinematicModel = { ground: "g", joints: [
      { id: "shoulder", parent: "g", child: "upper", kind: "revolute", origin: O, axis: Z },
      { id: "elbow", parent: "upper", child: "fore", kind: "revolute", origin: { x: 20, y: 0, z: 0 }, axis: Z }
    ] }
    const p = solvePose(m, { shoulder: 90, elbow: -90 })
    // The forearm, 20 long from the elbow, ends up pointing along +x again after the two quarter turns cancel.
    const tip = poseOfPoint(p, "fore", { x: 40, y: 0, z: 0 })
    near(tip.x, 20); near(tip.y, 20)
  })
  test("prismatic and cylindrical joints slide along the axis", () => {
    const m: KinematicModel = { ground: "g", joints: [
      { id: "s", parent: "g", child: "a", kind: "prismatic", origin: O, axis: { x: 0, y: 3, z: 0 } },
      { id: "c", parent: "g", child: "b", kind: "cylindrical", origin: O, axis: Z }
    ] }
    const p = solvePose(m, { s: 7, c: { angle: 90, slide: 4 } })
    near(poseOfPoint(p, "a", O).y, 7)
    const t = poseOfPoint(p, "b", { x: 10, y: 0, z: 0 })
    near(t.x, 0); near(t.y, 10); near(t.z, 4)
  })
})

describe("couplings and limits", () => {
  const rackModel: KinematicModel = {
    ground: "frame",
    joints: [
      { id: "pinion", parent: "frame", child: "gear", kind: "revolute", origin: O, axis: Z },
      { id: "rack", parent: "frame", child: "bar", kind: "prismatic", origin: { x: 0, y: 10, z: 0 }, axis: X, limits: { min: 0, max: 20 } }
    ],
    couplings: [{ kind: "rack", pinion: "pinion", rack: "rack", pitchRadius: 10 }]
  }
  test("a rack slides the arc its pinion rolls, and a limit is reported rather than clamped", () => {
    const p = solvePose(rackModel, { pinion: 90 })
    near(p.values.get("rack")!.slide, (Math.PI / 2) * 10)
    near(poseOfPoint(p, "bar", { x: 0, y: 10, z: 0 }).x, 5 * Math.PI)
    expect(p.violations).toEqual([])
    const over = solvePose(rackModel, { pinion: 180 })
    expect(over.violations).toEqual([{ joint: "rack", quantity: "slide", value: 10 * Math.PI, limit: 20 }])
    near(over.values.get("rack")!.slide, 10 * Math.PI)
  })
  test("a gear pair reverses and scales", () => {
    const m: KinematicModel = { ground: "g", joints: [
      { id: "a", parent: "g", child: "ga", kind: "revolute", origin: O, axis: Z },
      { id: "b", parent: "g", child: "gb", kind: "revolute", origin: { x: 30, y: 0, z: 0 }, axis: Z }
    ], couplings: [{ kind: "gear", driver: "a", driven: "b", ratio: -2 }] }
    const p = solvePose(m, { a: 30 })
    near(p.values.get("b")!.angle, -60)
  })
  test("bad models are refused with a reason", () => {
    const j = (id: string, parent: string, child: string) => ({ id, parent, child, kind: "revolute" as const, origin: O, axis: Z })
    expect(validateKinematics({ ground: "g", joints: [j("a", "x", "y")] })).toContain("ground does not reach")
    expect(validateKinematics({ ground: "g", joints: [j("a", "g", "y"), j("b", "g", "y")] })).toContain("child of two joints")
    expect(validateKinematics({ ground: "g", joints: [j("a", "g", "y"), j("a", "g", "z")] })).toContain("twice")
    expect(validateKinematics({ ground: "g", joints: [{ ...j("a", "g", "y"), axis: O }] })).toContain("no axis")
    expect(validateKinematics({ ground: "g", joints: [j("a", "g", "y")], couplings: [{ kind: "rack", pinion: "a", rack: "a", pitchRadius: 5 }] })).toContain("prismatic")
    expect(() => solvePose({ ground: "g", joints: [j("a", "x", "y")] })).toThrow()
  })
})

describe("motion study", () => {
  const part = (id: string, brep: AssemblyPart["brep"]): AssemblyPart => ({ id, name: id, brep })
  // A 30 mm arm pinned at the origin; a post 12 mm off its sweep.
  const arm = part("arm", makeBox(30, 4, 4, frame({ x: 0, y: -2, z: 0 }, Z)))
  const base = part("base", makeCylinder(2, 6, frame({ x: 0, y: 0, z: -1 }, Z)))
  const post = part("post", makeBox(4, 4, 6, frame({ x: -4, y: 14, z: -1 }, Z)))
  const model: KinematicModel = { ground: "base", joints: [{ id: "pin", parent: "base", child: "arm", kind: "revolute", origin: O, axis: Z, limits: { min: 0, max: 120 } }] }
  test("the arm clashes with the post once it has swung far enough, and passes the limit later", () => {
    const study = motionStudy([base, arm, post], model, { joint: "pin", from: 0, to: 150, steps: 15 }, { expected: (a, b) => (a === "base" && b === "arm") || (a === "arm" && b === "base") })
    expect(study.frames.length).toBe(16)
    expect(study.frames[0]!.clashes).toEqual([])
    // The post (x -4..0, y 14..18) is hit when the arm, rotating from +x, reaches about 90 degrees.
    expect(study.firstClash).toBeDefined()
    expect(study.firstClash!.value).toBeGreaterThan(60)
    expect(study.firstClash!.value).toBeLessThan(130)
    expect(study.firstClash!.clashes[0]!.a === "arm" || study.firstClash!.clashes[0]!.b === "arm").toBe(true)
    expect(study.firstViolation!.value).toBe(130)
  })
  test("an arm that stays in its quadrant never clashes", () => {
    const study = motionStudy([base, arm, post], model, { joint: "pin", from: 0, to: 40, steps: 4 }, { expected: (a, b) => a === "base" || b === "base" })
    expect(study.firstClash).toBeUndefined()
    expect(study.firstViolation).toBeUndefined()
  })
})

describe("closed loops and contacts", () => {
  test("a four-bar: the loop joint's two ends coincide after the free joints are solved", () => {
    const m: KinematicModel = { ground: "g", joints: [
      { id: "crank", parent: "g", child: "crank", kind: "revolute", origin: O, axis: Z },
      { id: "rod", parent: "crank", child: "rod", kind: "revolute", origin: { x: 10, y: 0, z: 0 }, axis: Z },
      { id: "rocker", parent: "g", child: "rocker", kind: "revolute", origin: { x: 30, y: 0, z: 0 }, axis: Z },
      { id: "closer", parent: "rod", child: "rocker", kind: "revolute", origin: { x: 40, y: 0, z: 0 }, axis: Z, closesLoop: true }
    ] }
    expect(validateKinematics(m)).toBeUndefined()
    for (const driver of [0, 40, -25]) {
      const p = solvePose(m, { crank: driver })
      const a = poseOfPoint(p, "rod", { x: 40, y: 0, z: 0 }), b = poseOfPoint(p, "rocker", { x: 40, y: 0, z: 0 })
      near(a.x, b.x, 1e-6); near(a.y, b.y, 1e-6); near(a.z, b.z, 1e-6)
      if (driver !== 0) expect(Math.abs(p.values.get("rocker")!.angle) + Math.abs(p.values.get("rod")!.angle)).toBeGreaterThan(0.1)
    }
    // A loop with every joint driven cannot close somewhere else: it is reported, not forced.
    expect(() => solvePose(m, { crank: 40, rod: 3, rocker: 7 })).toThrow(/loop does not close/)
    // Without the marker the same shape is still refused as a closed loop.
    const unmarked: KinematicModel = { ...m, joints: m.joints.map((j) => (j.id === "closer" ? { ...j, closesLoop: undefined } : j)) }
    expect(validateKinematics(unmarked)).toContain("child of two joints")
  })
  test("a declared contact reports its exact distance per frame and the first contact", () => {
    const part = (id: string, brep: AssemblyPart["brep"]): AssemblyPart => ({ id, name: id, brep })
    const arm = part("arm", makeBox(30, 4, 4, frame({ x: 0, y: -2, z: 0 }, Z)))
    const base = part("base", makeCylinder(2, 6, frame({ x: 0, y: 0, z: -1 }, Z)))
    const post = part("post", makeBox(4, 4, 6, frame({ x: 24, y: 6, z: -1 }, Z)))
    const m: KinematicModel = { ground: "base", joints: [
      { id: "pin", parent: "base", child: "arm", kind: "revolute", origin: O, axis: Z },
      { id: "postFixed", parent: "base", child: "post", kind: "fixed", origin: O, axis: Z }
    ], contacts: [{ a: "arm", b: "post", clearance: 2 }] }
    const study = motionStudy([base, arm, post], m, { joint: "pin", from: 0, to: 30, steps: 6 }, { expected: () => true })
    expect(study.frames[0]!.contacts[0]!.inContact).toBe(false)
    expect(study.frames[0]!.contacts[0]!.distance).toBeGreaterThan(2)
    // The arm's tip sweeps toward the post at (24..28, 6..10): the gap closes monotonically over this range.
    const ds = study.frames.map((f) => f.contacts[0]!.distance)
    expect(ds[ds.length - 1]).toBeLessThan(ds[0]!)
    expect(validateKinematics({ ...m, contacts: [{ a: "arm", b: "ghost" }] })).toContain("not in the model")
  })
})

describe("ball and planar joints", () => {
  test("a ball turns about the world axes through its origin, x then y then z", () => {
    const m: KinematicModel = { ground: "g", joints: [{ id: "b", parent: "g", child: "arm", kind: "ball", origin: { x: 5, y: 0, z: 0 }, axis: O }] }
    // 90 about x takes +y to +z; then 90 about z takes the +x offset (10, 0, 0) from the ball to +y.
    const p = solvePose(m, { b: { rx: 90, rz: 90 } })
    const tip = poseOfPoint(p, "arm", { x: 15, y: 0, z: 0 })
    near(tip.x, 5); near(tip.y, 10); near(tip.z, 0)
    const up = poseOfPoint(p, "arm", { x: 5, y: 1, z: 0 })
    near(up.x, 5); near(up.y, 0); near(up.z, 1)
    expect(validateKinematics(m)).toBeUndefined()
  })
  test("a planar joint slides in the plane square to its axis and turns about it", () => {
    const m: KinematicModel = { ground: "g", joints: [{ id: "pl", parent: "g", child: "slider", kind: "planar", origin: O, axis: Z }] }
    const p = solvePose(m, { pl: { u: 3, v: -2, angle: 90 } })
    // The turn happens first, about the axis through the origin; then the slides in the plane's own axes.
    const t = poseOfPoint(p, "slider", { x: 10, y: 0, z: 4 })
    near(t.z, 4)
    near(t.x, 0 + 3); near(t.y, 10 - 2)
  })
})


test("loop constraints cannot mask unreachable parts or angular misclosure", () => {
  const disconnected: KinematicModel = { ground: "g", joints: [
    { id: "tree", parent: "ghost", child: "a", kind: "revolute", origin: O, axis: Z },
    { id: "loop", parent: "g", child: "a", kind: "ball", origin: O, axis: Z, closesLoop: true }
  ] }
  expect(validateKinematics(disconnected)).toContain("ground does not reach")
  const m: KinematicModel = { ground: "g", joints: [
    { id: "ball", parent: "g", child: "a", kind: "ball", origin: O, axis: Z },
    { id: "loop", parent: "g", child: "a", kind: "revolute", origin: O, axis: Z, closesLoop: true }
  ] }
  expect(() => solvePose(m, { ball: { rx: 30 } })).toThrow("loop does not close")
  expect(solvePose(m, { ball: { rz: 30 } }).closure[0]!.angularError).toBeLessThan(1e-7)
  expect(() => solvePose(m, { ball: NaN })).toThrow("finite")
  expect(() => solvePose(m, { missing: 0 })).toThrow("tree joint")
})

test("contacts report clearance violations even when clashes are expected, and missing contact parts are refused", () => {
  const parts: AssemblyPart[] = [{ id: "g", name: "ground", brep: makeBox(10, 10, 10) }, { id: "a", name: "slider", brep: makeBox(10, 10, 10, frame({ x: 20, y: 0, z: 0 }, Z)) }]
  const model: KinematicModel = { ground: "g", joints: [{ id: "slide", parent: "g", child: "a", kind: "prismatic", origin: O, axis: { x: -1, y: 0, z: 0 } }], contacts: [{ a: "g", b: "a", clearance: 2 }] }
  const study = motionStudy(parts, model, { joint: "slide", from: 0, to: 15, steps: 3 }, { expected: () => true })
  expect(study.firstContactViolation).toBeDefined()
  expect(study.frames.at(-1)!.contacts[0]!.clearanceViolated).toBe(true)
  expect(() => motionStudy(parts.slice(0, 1), model, { joint: "slide", from: 0, to: 1, steps: 1 })).toThrow("contact part")
})
