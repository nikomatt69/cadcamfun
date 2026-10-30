import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, booleanCounters, booleanStrict, resetBooleanCounters, frame, makeBox, makeCylinder, makeSphere, massProperties, validateBrep, type Brep, type BooleanOp } from "./index.ts"

setDefaultTimeout(120_000)
const PI = Math.PI
const at = (x: number, y: number, z: number) => frame({ x, y, z }, { x: 0, y: 0, z: 1 })
const OPS: ReadonlyArray<BooleanOp> = ["union", "subtract", "intersect"]
const sphereVol = (r: number) => (4 / 3) * PI * r ** 3

interface Case {
  readonly name: string
  readonly a: () => Brep
  readonly b: () => Brep
  /** Analytic volumes of the union, the difference A - B and the intersection. */
  readonly union: number
  readonly subtract: number
  readonly intersect: number
}

/**
 * Spec 42 R3/R4: designed coincidence and tangent contact. Every case must be solved by the plain pipeline in place (no operand
 * displaced), give a valid solid (or an empty one where the volume is zero) and the analytic volume.
 */
const check = (c: Case, op: BooleanOp) => {
  const r = booleanBrep(c.a(), c.b(), op)
  expect(r.warnings.filter((w) => w.includes("degenerate alignment") || w.includes("displaced"))).toEqual([])
  const want = c[op]
  if (want === 0) {
    expect(r.brep.faces.length).toBe(0)
    return
  }
  expect(validateBrep(r.brep).issues.map((i) => i.message)).toEqual([])
  const got = massProperties(r.brep).volume
  expect(Math.abs(got - want) / want).toBeLessThan(1e-9)
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

// ---- boxes sharing faces, flush sides, touching along an edge
const boxCases: Case[] = []
for (const bx of [-10, -5, 0, 5, 10]) for (const w of [5, 10]) {
  const o = overlap(0, 10, bx, bx + w) * 100
  boxCases.push({
    name: `box 10x10x10 with a box ${w}x10x10 at x=${bx} (flush y and z faces${bx === 10 || bx + w === 0 ? ", sharing the x face" : ""})`,
    a: () => makeBox(10, 10, 10), b: () => makeBox(w, 10, 10, at(bx, 0, 0)),
    union: 1000 + w * 100 - o, subtract: 1000 - o, intersect: o
  })
}
boxCases.push({
  name: "boxes touching along one edge only",
  a: () => makeBox(10, 10, 10), b: () => makeBox(10, 10, 10, at(10, 10, 0)),
  union: 2000, subtract: 1000, intersect: 0
})
boxCases.push({
  name: "boxes touching at one corner only",
  a: () => makeBox(10, 10, 10), b: () => makeBox(10, 10, 10, at(10, 10, 10)),
  union: 2000, subtract: 1000, intersect: 0
})

// ---- cylinders on a box: coaxial bores, flush ends, bosses on a face
const boreCases: Case[] = []
for (const r of [2, 3]) for (const [z0, z1] of [[0, 10], [0, 5], [5, 10], [10, 15], [-5, 0], [-3, 12]] as const) {
  const inside = PI * r * r * overlap(0, 10, z0, z1)
  const cyl = PI * r * r * (z1 - z0)
  boreCases.push({
    name: `box and a cylinder r=${r} z=${z0}..${z1} on the centre line`,
    a: () => makeBox(10, 10, 10), b: () => makeCylinder(r, z1 - z0, at(5, 5, z0)),
    union: 1000 + cyl - inside, subtract: 1000 - inside, intersect: inside
  })
}

// ---- coaxial cylinders of equal and unequal radius, stacked and nested
const stackCases: Case[] = []
for (const [r1, r2] of [[3, 3], [3, 2], [2, 3]] as const) for (const dz of [0, 5, 10]) {
  const ov = overlap(0, 10, dz, dz + 10)
  const inter = PI * Math.min(r1, r2) ** 2 * ov
  const va = PI * r1 * r1 * 10, vb = PI * r2 * r2 * 10
  stackCases.push({
    name: `coaxial cylinders r=${r1} and r=${r2}, second raised by ${dz}`,
    a: () => makeCylinder(r1, 10), b: () => makeCylinder(r2, 10, at(0, 0, dz)),
    union: va + vb - inter, subtract: va - inter, intersect: inter
  })
}

// ---- tangent contact (R4)
const tangentCases: Case[] = []
for (const [R, r] of [[3, 2], [3, 1], [4, 2]] as const) {
  const vR = PI * R * R * 10, vr = PI * r * r * 10
  tangentCases.push({ name: `cylinder r=${r} tangent outside a cylinder R=${R}`, a: () => makeCylinder(R, 10), b: () => makeCylinder(r, 10, at(R + r, 0, 0)), union: vR + vr, subtract: vR, intersect: 0 })
  tangentCases.push({ name: `cylinder r=${r} tangent inside a cylinder R=${R}`, a: () => makeCylinder(R, 10), b: () => makeCylinder(r, 10, at(R - r, 0, 0)), union: vR, subtract: vR - vr, intersect: vr })
}
for (const r of [1, 2, 3]) {
  const vc = PI * r * r * 10
  tangentCases.push({ name: `cylinder r=${r} tangent to a box wall, inside`, a: () => makeBox(10, 10, 10), b: () => makeCylinder(r, 10, at(r, 5, 0)), union: 1000, subtract: 1000 - vc, intersect: vc })
  tangentCases.push({ name: `cylinder r=${r} tangent to a box wall, outside`, a: () => makeBox(10, 10, 10), b: () => makeCylinder(r, 10, at(-r, 5, 0)), union: 1000 + vc, subtract: 1000, intersect: 0 })
}
for (const [R, r] of [[3, 2], [3, 1], [4, 1.5]] as const) {
  tangentCases.push({ name: `sphere r=${r} tangent outside a sphere R=${R}`, a: () => makeSphere(R), b: () => makeSphere(r, at(R + r, 0, 0)), union: sphereVol(R) + sphereVol(r), subtract: sphereVol(R), intersect: 0 })
  tangentCases.push({ name: `sphere r=${r} tangent inside a sphere R=${R}`, a: () => makeSphere(R), b: () => makeSphere(r, at(R - r, 0, 0)), union: sphereVol(R), subtract: sphereVol(R) - sphereVol(r), intersect: sphereVol(r) })
}
for (const r of [1, 2]) {
  tangentCases.push({ name: `sphere r=${r} resting on a box face`, a: () => makeBox(10, 10, 10), b: () => makeSphere(r, at(5, 5, 10 + r)), union: 1000 + sphereVol(r), subtract: 1000, intersect: 0 })
  tangentCases.push({ name: `sphere r=${r} touching a box face from inside`, a: () => makeBox(10, 10, 10), b: () => makeSphere(r, at(5, 5, 10 - r)), union: 1000, subtract: 1000 - sphereVol(r), intersect: sphereVol(r) })
}
tangentCases.push({ name: "equal spheres on each other", a: () => makeSphere(3), b: () => makeSphere(3), union: sphereVol(3), subtract: 0, intersect: sphereVol(3) })

describe("designed coincidence: nothing is displaced, volumes are analytic", () => {
  const all: ReadonlyArray<readonly [string, Case[]]> = [
    ["boxes: shared faces, flush sides, edge and corner contact", boxCases],
    ["cylinders on a box: coaxial bores, flush ends, bosses", boreCases],
    ["coaxial cylinders of equal and unequal radius", stackCases],
    ["tangent contact: cylinders, spheres, box walls and faces", tangentCases]
  ]
  for (const [title, cases] of all) {
    test(`${title} (${cases.length * 3} Booleans)`, () => {
      resetBooleanCounters()
      for (const c of cases) for (const op of OPS) {
        try { check(c, op) } catch (e) { throw new Error(`${c.name} / ${op}: ${(e as Error).message}`) }
      }
      const k = booleanCounters()
      expect(k.recoveredByDisplacement).toBe(0)
      expect(k.failed).toBe(0)
    })
  }

  test("the set has at least 60 cases", () => {
    expect(all.reduce((n, [, c]) => n + c.length * 3, 0)).toBeGreaterThanOrEqual(60)
  })

  test("a tangent contact is reported as kept in place, and the strict pipeline gives the same valid solid", () => {
    // R5: a cylinder tangent to a wall leaves a pinch edge; it becomes two coincident edges, one per wedge of material.
    const A = makeBox(10, 10, 10), B = makeCylinder(2, 10, at(2, 5, 0))
    const r = booleanBrep(A, B, "subtract")
    expect(r.warnings.some((w) => w.includes("kept in place"))).toBe(true)
    expect(r.warnings.some((w) => w.includes("degenerate alignment"))).toBe(false)
    const strict = booleanStrict(A, B, "subtract")
    expect(validateBrep(strict.brep).valid).toBe(true)
    expect(Math.abs(massProperties(strict.brep).volume - (1000 - PI * 40)) / 874).toBeLessThan(1e-12)
    // Two edges of the result lie on the tangent line, each used by two faces.
    const ends = strict.brep.edges.filter((e) => e.curve.kind === "line" && Math.abs((e.curve as { origin: { x: number } }).origin.x) < 1e-9 && Math.abs((e.curve as { dir: { z: number } }).dir.z) > 0.999)
    expect(ends.length).toBeGreaterThanOrEqual(2)
  })

  test("a result that a tangent contact splits into lumps keeps the contact point: spheres tangent outside", () => {
    const r = booleanBrep(makeSphere(3), makeSphere(2, at(5, 0, 0)), "union")
    expect(validateBrep(r.brep).valid).toBe(true)
    expect(r.brep.shells.length).toBe(2)
  })

  test("same-domain merge: a stack of coaxial cylinders of one radius is one side face, and it still takes a Boolean", () => {
    const stacked = booleanBrep(makeCylinder(3, 10), makeCylinder(3, 10, at(0, 0, 5)), "union").brep
    expect(stacked.faces.filter((f) => f.surface.kind === "cylinder").length).toBe(1)
    expect(stacked.faces.length).toBe(3)
    expect(validateBrep(stacked).valid).toBe(true)
    expect(Math.abs(massProperties(stacked).volume - PI * 9 * 15) / (PI * 135)).toBeLessThan(1e-12)
    // A cross bore through the merged side face.
    const bored = booleanBrep(stacked, makeCylinder(1, 20, frame({ x: -10, y: 0, z: 7 }, { x: 1, y: 0, z: 0 })), "subtract")
    expect(validateBrep(bored.brep).issues.map((i) => i.message)).toEqual([])
    // Steinmetz-free check: the bore removes a cylinder of r=1 across a r=3 cylinder (exact: integral of the lens).
    const removed = PI * 9 * 15 - massProperties(bored.brep).volume
    expect(removed).toBeGreaterThan(PI * 1 * 2 * 3 * 0.9)
    expect(removed).toBeLessThan(PI * 1 * 6 * 1.01)
  })
})
