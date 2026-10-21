import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, booleanBrep, BooleanError, frame, makeBox, makeCone, makeCylinder, makeSphere, makeTorus, massProperties, validateBrep, type Brep } from "./index.ts"

setDefaultTimeout(120_000)

/** Seeded generator (mulberry32): the same seed is the same case on every machine. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const AXES = [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 0.3, y: -0.5, z: 0.8 }]

/** A random primitive; with `aligned` the placement snaps to coordinates that make poles, seams and tangencies coincide. */
const primitive = (r: () => number, aligned: boolean): Brep => {
  const q = (x: number) => (aligned ? Math.round(x * 2) / 2 : x)
  const at = frame({ x: q(r() * 6 - 3), y: q(r() * 6 - 3), z: q(r() * 6 - 3) }, AXES[Math.floor(r() * (aligned ? 3 : AXES.length))]!)
  const k = Math.floor(r() * 5)
  const size = (lo: number, hi: number) => q(lo + r() * (hi - lo))
  if (k === 0) return makeBox(size(3, 8), size(3, 8), size(3, 8), at)
  if (k === 1) return makeCylinder(size(1.5, 4), size(4, 10), at)
  if (k === 2) return makeSphere(size(2, 5), at)
  if (k === 3) return makeCone(size(2, 4), size(0.5, 2), size(4, 8), at)
  return makeTorus(size(4, 7), size(1, 2.5), at)
}

const volume = (b: Brep) => (b.faces.length === 0 ? 0 : massProperties(b).volume)

describe("Boolean fuzzing: valid results and inclusion-exclusion", () => {
  const CASES = 16
  for (const aligned of [true, false]) {
    test(`${CASES} seeded pairs, ${aligned ? "aligned to the coordinate grid" : "generic placements"}`, () => {
      const failures: string[] = []
      for (let seed = 1; seed <= CASES; seed++) {
        const r = rng(seed * (aligned ? 7919 : 104729))
        const A = primitive(r, aligned), B = primitive(r, aligned)
        try {
          const u = booleanBrep(A, B, "union"), i = booleanBrep(A, B, "intersect"), d = booleanBrep(A, B, "subtract")
          for (const x of [u, i, d]) if (x.brep.faces.length > 0 && validateBrep(x.brep).issues.length > 0) throw new Error("invalid result")
          const displaced = [u, i, d].some((x) => x.warnings.length > 0)
          const tol = displaced ? 2e-4 : 1e-6
          const va = volume(A), vb = volume(B)
          const e1 = Math.abs(volume(u.brep) + volume(i.brep) - va - vb) / (va + vb)
          const e2 = Math.abs(volume(d.brep) - (va - volume(i.brep))) / va
          if (e1 > tol || e2 > tol) throw new Error(`volume balance off by ${Math.max(e1, e2).toExponential(2)}`)
        } catch (e) {
          if (!(e instanceof BooleanError || e instanceof Error)) throw e
          failures.push(`seed ${seed}: ${String((e as Error).message).slice(0, 110)}`)
        }
      }
      if (failures.length > 0) console.log(failures.join("\n"))
      // Known open case: generic seed 14 (a torus and a sphere whose intersection curve folds back within 1e-4 mm of itself;
      // see spec 33 §7.4). Anything beyond it is a regression.
      expect(failures.filter((f) => !f.startsWith("seed 14:")).length).toBe(0)
      expect(failures.length).toBeLessThanOrEqual(aligned ? 0 : 1)
    })
  }
})

describe("blend fuzzing: boxes with a bore, a boss or a dome, every edge filleted or chamfered", () => {
  test("12 seeded bodies: valid result, volume between 80 % and 100 % of the original", () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed * 977)
      const w = 8 + r() * 10, h = 8 + r() * 10, d = 6 + r() * 8
      const at = (x: number, y: number, z: number) => frame({ x, y, z }, { x: 0, y: 0, z: 1 })
      let b: Brep = makeBox(w, h, d)
      const k = Math.floor(r() * 4)
      if (k === 1) b = booleanBrep(b, makeCylinder(1 + r() * 2, d, at(w / 2, h / 2, 0)), "subtract").brep
      if (k === 2) b = booleanBrep(b, makeCylinder(2 + r() * 2, d, at(w * 0.8, h * 0.5, 0)), "union").brep
      if (k === 3) b = booleanBrep(b, makeSphere(2 + r() * 2, at(w / 2, h / 2, d)), "union").brep
      const radius = 0.3 + r() * 1.2
      try {
        const out = blendBrep(b, blendCandidates(b), radius, r() < 0.5 ? "fillet" : "chamfer").brep
        const v0 = volume(b), v1 = volume(out)
        if (validateBrep(out).issues.length > 0 || !(v1 < v0 && v1 > 0.8 * v0)) failures.push(`seed ${seed}: invalid or implausible volume ${v0.toFixed(1)} -> ${v1.toFixed(1)}`)
      } catch (e) {
        failures.push(`seed ${seed}: ${String((e as Error).message).slice(0, 100)}`)
      }
    }
    expect(failures).toEqual([])
  })
})
