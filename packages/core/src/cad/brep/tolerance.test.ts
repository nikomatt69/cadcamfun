import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, healBrep, makeBox, makeCylinder, massProperties, parseStep, readStepBreps, StepExportError, validateBrep, writeStepBreps, type Brep, type Edge, type Face } from "./index.ts"
import { LOOSE_TOLERANCE, maxTolerance, toleranceLimit } from "./index.ts"

setDefaultTimeout(240_000)

const hole = (x: number, y: number, r = 1.5) => makeCylinder(r, 10, frame({ x, y, z: 0 }, { x: 0, y: 0, z: 1 }))

/** A box written face by face with its corners moved apart by up to `gap` (see heal.test.ts), healed without tightening: loose. */
const looseBox = (): Brep => {
  const b = makeBox(10, 20, 30)
  const vertices: Brep["vertices"][number][] = []
  const edges: Edge[] = []
  const faces: Face[] = []
  let k = 0
  b.faces.forEach((f) => {
    const vmap = new Map<number, number>()
    const vert = (v: number) => {
      let m = vmap.get(v)
      if (m === undefined) {
        const p = b.vertices[v]!.point
        const s = (k++ % 5) - 2
        m = vertices.length
        vertices.push({ point: { x: p.x + (s * 3e-5) / 2, y: p.y - (s * 3e-5) / 3, z: p.z + (s % 2 === 0 ? 1 : -1) * 1.5e-5 }, tol: 1e-6 })
        vmap.set(v, m)
      }
      return m
    }
    faces.push({
      ...f,
      loops: f.loops.map((l) => ({
        coedges: l.coedges.map((c) => {
          const e = b.edges[c.edge]!
          const v0 = vert(e.v0), v1 = vert(e.v1)
          const P0 = vertices[v0]!.point, P1 = vertices[v1]!.point
          const L = Math.hypot(P1.x - P0.x, P1.y - P0.y, P1.z - P0.z)
          edges.push({ curve: { kind: "line", origin: P0, dir: { x: (P1.x - P0.x) / L, y: (P1.y - P0.y) / L, z: (P1.z - P0.z) / L } }, t0: 0, t1: L, v0, v1, tol: 1e-6 })
          return { edge: edges.length - 1, reversed: c.reversed }
        })
      }))
    })
  })
  return healBrep({ vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] }, { tol: 1e-4, tighten: false }).brep
}

describe("tolerance across Booleans (spec 42 R6)", () => {
  test("a chain of 50 Booleans on a plate with holes keeps the model tolerance", () => {
    let plate: Brep = makeBox(100, 50, 10)
    let n = 0
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 5; j++) {
        const r = booleanBrep(plate, hole(5 + i * 9.5, 5 + j * 10), "subtract")
        expect(r.warnings).toEqual([])
        plate = r.brep
        n++
      }
    }
    expect(n).toBe(50)
    expect(validateBrep(plate).valid).toBe(true)
    const volume = 100 * 50 * 10 - 50 * Math.PI * 1.5 * 1.5 * 10
    expect(Math.abs(massProperties(plate).volume - volume) / volume).toBeLessThan(1e-9)
    // Exact operands and an exact operation: nothing accumulates, the tolerance is the model's.
    expect(maxTolerance(plate)).toBeLessThanOrEqual(1.0001e-6)
    expect(plate.faces.some((f) => f.loose === true)).toBe(false)
  })

  test("a result carries its operands' largest tolerance, and the measured fit on top of it", () => {
    const loose = looseBox()
    const tol0 = maxTolerance(loose)
    expect(tol0).toBeGreaterThan(LOOSE_TOLERANCE)
    const r = booleanBrep(loose, hole(5, 10, 1.5), "subtract")
    expect(maxTolerance(r.brep)).toBeGreaterThanOrEqual(tol0)
    expect(r.stats.maxTolerance).toBe(maxTolerance(r.brep))
    // The inherited slack is above the limit: the result says so instead of passing as a sound body.
    expect(r.brep.faces.every((f) => f.loose === true)).toBe(true)
    expect(r.warnings.some((w) => w.includes("tolerance grew") && w.includes("loose"))).toBe(true)
  })

  test("a chain on a loose body cannot silently pass the limit: the tolerance grows and the faces stay loose", () => {
    let body = looseBox()
    const t0 = maxTolerance(body)
    const warned: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = booleanBrep(body, hole(2 + i * 1.5, 4 + (i % 2) * 8, 0.5), "subtract")
      warned.push(...r.warnings)
      body = r.brep
    }
    expect(maxTolerance(body)).toBeGreaterThan(t0)
    expect(body.faces.every((f) => f.loose === true)).toBe(true)
    expect(warned.some((w) => w.includes("above the declared limit"))).toBe(true)
    expect(validateBrep(body).valid).toBe(true)
  })

  test("a declared limit can be set per call", () => {
    const r = booleanBrep(makeBox(10, 10, 10), hole(5, 5), "subtract", { maxTolerance: 1e-9 })
    expect(r.brep.faces.every((f) => f.loose === true)).toBe(true)
    expect(r.warnings.some((w) => w.includes("tolerance grew"))).toBe(true)
  })

  test("the limit grows with the size of the body", () => {
    expect(toleranceLimit(makeBox(10, 10, 10))).toBe(LOOSE_TOLERANCE)
    expect(toleranceLimit(makeBox(100000, 10, 10))).toBeGreaterThan(LOOSE_TOLERANCE)
  })
})

describe("STEP export of loose bodies (spec 42 R6)", () => {
  test("an exact body exports as before", () => {
    const text = writeStepBreps([{ name: "plate", brep: booleanBrep(makeBox(20, 20, 5), hole(10, 10), "subtract").brep }])
    expect(text).toContain("LENGTH_MEASURE(1.E-06)")
    expect(text).not.toContain("LOOSE")
  })

  test("a loose body is refused with the part, its tolerance and the limit", () => {
    const loose = looseBox()
    expect(loose.faces.some((f) => f.loose === true)).toBe(true)
    let error: unknown
    try { writeStepBreps([{ name: "foreign", brep: loose }]) } catch (e) { error = e }
    expect(error).toBeInstanceOf(StepExportError)
    const e = error as StepExportError
    expect(e.part).toBe("foreign")
    expect(e.maxTolerance).toBeGreaterThan(e.limit)
    expect(e.looseFaces.length).toBeGreaterThan(0)
    expect(e.message).toContain("loose")
  })

  test("opted in, a loose body is written with the reason in the file and its tolerance as the file's uncertainty", () => {
    const loose = looseBox()
    const text = writeStepBreps([{ name: "foreign", brep: loose }], { allowLoose: true })
    expect(text).toMatch(/FILE_DESCRIPTION\(\('CADCAMFUN exact B-rep','LOOSE foreign: /)
    expect(text).not.toContain("LENGTH_MEASURE(1.E-06)")
    expect(parseStep(text).records.size).toBeGreaterThan(0)
    expect(readStepBreps(text).parts.length).toBe(1)
  })

  test("a loose Boolean result is refused too, and a tight healed body is not", () => {
    const loose = booleanBrep(looseBox(), hole(5, 10), "subtract").brep
    expect(() => writeStepBreps([{ name: "x", brep: loose }])).toThrow(StepExportError)
    expect(() => writeStepBreps([{ name: "x", brep: makeBox(10, 10, 10) }])).not.toThrow()
  })
})
