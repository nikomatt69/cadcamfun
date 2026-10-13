import { describe, expect, setDefaultTimeout, test } from "bun:test"

// Kernel tests tessellate and integrate exact geometry; under a full-suite run the default 5 s is too short.
setDefaultTimeout(60_000)
import {
  BooleanError,
  booleanBrep,
  frame,
  gaussLegendre,
  makeBox,
  makeCylinder,
  makeSphere,
  massProperties,
  meshEdgeDefects,
  readStepBreps,
  tessellateBrep,
  transformBrep,
  validateBrep,
  writeStepBreps,
  type Brep,
  type BooleanOp
} from "./index.ts"

const PI = Math.PI
const at = (x: number, y: number, z: number, axis = { x: 0, y: 0, z: 1 }) => frame({ x, y, z }, axis)
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** Runs the Boolean and checks the result is a valid, watertight solid of the expected volume. */
const check = (A: Brep, B: Brep, op: BooleanOp, volume: number, relTol = 1e-9, shells = 1) => {
  const r = booleanBrep(A, B, op)
  expect(r.warnings).toEqual([])
  const rep = validateBrep(r.brep)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  expect(r.brep.shells.length).toBe(shells)
  expect(meshEdgeDefects(tessellateBrep(r.brep).indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
  expect(rel(massProperties(r.brep).volume, volume)).toBeLessThan(relTol)
  return r.brep
}

describe("Booleans of boxes (planar, exact)", () => {
  const A = makeBox(10, 10, 10)
  const B = makeBox(10, 10, 10, at(5, 5, 5))
  test("overlapping corner: union, difference, intersection", () => {
    expect(check(A, B, "union", 2000 - 125).faces.length).toBe(12)
    expect(check(A, B, "subtract", 875).faces.length).toBe(9)
    expect(check(A, B, "intersect", 125).faces.length).toBe(6)
  })
  test("coplanar faces: a flush pocket, side-by-side and offset stacking merge their coplanar faces", () => {
    expect(check(makeBox(20, 20, 10), makeBox(10, 10, 4, at(5, 5, 6)), "subtract", 3600).faces.length).toBe(11)
    // Two boxes side by side are one box: 6 faces.
    expect(check(A, makeBox(10, 10, 10, at(10, 0, 0)), "union", 2000).faces.length).toBe(6)
    check(A, makeBox(10, 10, 10, at(3, 4, 10)), "union", 2000)
  })
  test("disjoint solids and an inner void give two shells", () => {
    check(A, makeBox(5, 5, 5, at(20, 0, 0)), "union", 1125, 1e-9, 2)
    const v = check(A, makeBox(2, 2, 2, at(4, 4, 4)), "subtract", 992, 1e-9, 2)
    // The void's faces point into the cavity: its shell alone has a negative volume.
    expect(v.faces.length).toBe(12)
  })
})

describe("Booleans with curved faces", () => {
  const plate = makeBox(20, 20, 10)
  test("through hole, blind hole, boss", () => {
    const hole = check(plate, makeCylinder(4, 20, at(10, 10, -5)), "subtract", 4000 - PI * 16 * 10)
    expect(hole.faces.map((f) => f.surface.kind).sort()).toEqual(["cylinder", "plane", "plane", "plane", "plane", "plane", "plane"])
    // The hole's rims are exact circles.
    expect(hole.edges.filter((e) => e.curve.kind === "circle").length).toBe(2)
    check(plate, makeCylinder(4, 6, at(10, 10, 6)), "subtract", 4000 - PI * 16 * 4)
    check(plate, makeCylinder(4, 6, at(10, 10, 6)), "union", 4000 + PI * 16 * 2)
  })
  test("box ∩ sphere: the sphere less six caps of height 1", () => {
    check(makeBox(10, 10, 10), makeSphere(6, at(5, 5, 5)), "intersect", (4 / 3) * PI * 216 - 6 * ((PI * 17) / 3), 1e-8)
  })
  test("sphere with a through bore: the napkin-ring volume", () => {
    check(makeSphere(8), makeCylinder(3, 30, at(0, 0, -15)), "subtract", (4 / 3) * PI * Math.pow(64 - 9, 1.5), 1e-8)
  })
  test("crossed cylinders: the removed volume is the Steinmetz-type integral", () => {
    // ∫_{-2}^{2} 2√(25 − y²) · 2√(4 − y²) dy, with y = 2 sin θ.
    const g = gaussLegendre(64)
    let removed = 0
    for (let i = 0; i < g.x.length; i++) {
      const th = (g.x[i]! * PI) / 2
      removed += g.w[i]! * (PI / 2) * 4 * Math.sqrt(25 - 4 * Math.sin(th) ** 2) * 4 * Math.cos(th) ** 2
    }
    const r = check(makeCylinder(5, 20), makeCylinder(2, 20, at(-10, 0, 10, { x: 1, y: 0, z: 0 })), "subtract", PI * 25 * 20 - removed, 1e-7)
    // The intersection curves are not planar: fitted B-splines.
    expect(r.edges.some((e) => e.curve.kind === "nurbs")).toBe(true)
  })
})

describe("Boolean results are exchangeable", () => {
  test("a drilled plate round-trips through STEP with its exact volume", () => {
    const r = booleanBrep(makeBox(20, 20, 10), makeCylinder(4, 20, at(10, 10, -5)), "subtract").brep
    const back = readStepBreps(writeStepBreps([{ name: "plate", brep: r }], { timestamp: "2026-10-13T00:00:00" }))
    expect(back.warnings).toEqual([])
    expect(validateBrep(back.parts[0]!.brep).valid).toBe(true)
    expect(rel(massProperties(back.parts[0]!.brep).volume, 4000 - PI * 160)).toBeLessThan(1e-9)
  })
  test("Booleans chain: a plate with two holes and a pocket", () => {
    let p = makeBox(40, 30, 10)
    p = booleanBrep(p, makeCylinder(3, 20, at(10, 15, -5)), "subtract").brep
    p = booleanBrep(p, makeCylinder(3, 20, at(30, 15, -5)), "subtract").brep
    p = booleanBrep(p, makeBox(10, 10, 5, at(15, 10, 5)), "subtract").brep
    const rep = validateBrep(p)
    expect(rep.issues.map((i) => i.message)).toEqual([])
    expect(rep.genus).toBe(2)
    expect(meshEdgeDefects(tessellateBrep(p).indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
    expect(rel(massProperties(p).volume, 12000 - 2 * PI * 9 * 10 - 500)).toBeLessThan(1e-9)
  })
  test("reversed cavity faces survive union and intersection, including as operand B", () => {
    const cavity = check(makeBox(20, 20, 10), makeBox(2, 2, 2, at(4, 4, 4)), "subtract", 3992, 1e-9, 2)
    check(cavity, makeBox(2, 2, 2, at(20, 0, 0)), "union", 4000, 1e-9, 2)
    check(makeBox(2, 2, 2, at(20, 0, 0)), cavity, "union", 4000, 1e-9, 2)
    check(cavity, makeBox(22, 22, 12, at(-1, -1, -1)), "intersect", 3992, 1e-9, 2)
    check(makeBox(22, 22, 12, at(-1, -1, -1)), cavity, "intersect", 3992, 1e-9, 2)
    // Subtracting B restores B's inner void as a material island: the two orientation flips cancel.
    check(makeBox(22, 22, 12, at(-1, -1, -1)), cavity, "subtract", 22 * 22 * 12 - 3992, 1e-9, 3)
  })
  test("a STEP-imported drilled plate can be drilled again after reflection", () => {
    const first = booleanBrep(makeBox(40, 30, 10), makeCylinder(3, 20, at(10, 15, -5)), "subtract").brep
    const imported = readStepBreps(writeStepBreps([{ name: "plate", brep: first }])).parts[0]!.brep
    const reflected = transformBrep(imported, { m: [-1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 40, y: 0, z: 0 } })
    check(reflected, makeCylinder(3, 20, at(10, 15, -5)), "subtract", 12000 - 2 * PI * 90)
  })
  test("BooleanError carries the validator's issues when a result would be invalid", () => {
    expect(new BooleanError("x", [{ kind: "edge-open", message: "m" }]).issues.length).toBe(1)
  })
})
