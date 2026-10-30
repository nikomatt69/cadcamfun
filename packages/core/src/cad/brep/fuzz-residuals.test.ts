import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, massProperties, validateBrep, type Brep, type Vec3 } from "./index.ts"
import { booleanCounters, resetBooleanCounters } from "./boolean.ts"
import { fuzzPair } from "./fuzz-sweep.ts"

setDefaultTimeout(120_000)

/**
 * The aligned fuzz seeds that used the displacement recovery before (spec 42 gate 1, spec 72 step 2.1): seed 81 (a sphere pole on
 * a torus), seed 116 (an intersection circle that is the sphere's seam through its poles) and seed 33 (a torus against a
 * cylinder whose rim touches the torus where the intersection curve crosses itself). Every result is checked three ways: the
 * result is a valid solid, the volume identities hold, and the volume of the intersection agrees with a point-sampling oracle
 * built from the analytic definition of the two solids (a Halton sequence, so the same on every machine).
 */

const halton = (i: number, base: number): number => {
  let f = 1, r = 0
  for (let n = i; n > 0; n = Math.floor(n / base)) { f /= base; r += f * (n % base) }
  return r
}

/** Volume of `inside` over the box `lo..hi` by `n` Halton points. */
const sampledVolume = (lo: Vec3, hi: Vec3, inside: (p: Vec3) => boolean, n = 400_000): number => {
  let hit = 0
  for (let i = 1; i <= n; i++) {
    const p = { x: lo.x + (hi.x - lo.x) * halton(i, 2), y: lo.y + (hi.y - lo.y) * halton(i, 3), z: lo.z + (hi.z - lo.z) * halton(i, 5) }
    if (inside(p)) hit++
  }
  return ((hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z) * hit) / n
}

const vol = (b: Brep) => (b.faces.length === 0 ? 0 : massProperties(b).volume)

const box = (b: Brep): { lo: Vec3; hi: Vec3 } => {
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const v of b.vertices) {
    lo.x = Math.min(lo.x, v.point.x); hi.x = Math.max(hi.x, v.point.x)
    lo.y = Math.min(lo.y, v.point.y); hi.y = Math.max(hi.y, v.point.y)
    lo.z = Math.min(lo.z, v.point.z); hi.z = Math.max(hi.z, v.point.z)
  }
  // A torus or a sphere has few vertices: take the surface extents.
  for (const f of b.faces) {
    const s = f.surface
    if (s.kind === "sphere") for (const k of ["x", "y", "z"] as const) { lo[k] = Math.min(lo[k], s.frame.origin[k] - s.radius); hi[k] = Math.max(hi[k], s.frame.origin[k] + s.radius) }
    if (s.kind === "torus") for (const k of ["x", "y", "z"] as const) {
      const e = k === "z" ? s.minor : s.major + s.minor
      lo[k] = Math.min(lo[k], s.frame.origin[k] - e); hi[k] = Math.max(hi[k], s.frame.origin[k] + e)
    }
  }
  return { lo, hi }
}

const overlap = (a: Brep, b: Brep): { lo: Vec3; hi: Vec3 } => {
  const x = box(a), y = box(b)
  return { lo: { x: Math.max(x.lo.x, y.lo.x), y: Math.max(x.lo.y, y.lo.y), z: Math.max(x.lo.z, y.lo.z) }, hi: { x: Math.min(x.hi.x, y.hi.x), y: Math.min(x.hi.y, y.hi.y), z: Math.min(x.hi.z, y.hi.z) } }
}

const sphereAt = (c: Vec3, r: number) => (p: Vec3) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2 < r * r
const torusAt = (c: Vec3, R: number, r: number) => (p: Vec3) => (Math.hypot(p.x - c.x, p.y - c.y) - R) ** 2 + (p.z - c.z) ** 2 < r * r

interface Outcome { readonly u: Brep; readonly i: Brep; readonly d: Brep; readonly warnings: ReadonlyArray<string>; readonly counters: ReturnType<typeof booleanCounters> }

const run = (seed: number): { A: Brep; B: Brep; out: Outcome } => {
  const [A, B] = fuzzPair(seed, true)
  resetBooleanCounters()
  const u = booleanBrep(A, B, "union"), i = booleanBrep(A, B, "intersect"), d = booleanBrep(A, B, "subtract")
  for (const x of [u, i, d]) expect(validateBrep(x.brep).issues.map((m) => m.message)).toEqual([])
  return { A, B, out: { u: u.brep, i: i.brep, d: d.brep, warnings: [...u.warnings, ...i.warnings, ...d.warnings], counters: booleanCounters() } }
}

const identities = (A: Brep, B: Brep, o: Outcome, tol: number) => {
  const va = vol(A), vb = vol(B)
  expect(Math.abs(vol(o.u) + vol(o.i) - va - vb) / (va + vb)).toBeLessThan(tol)
  expect(Math.abs(vol(o.d) - (va - vol(o.i))) / va).toBeLessThan(tol)
}

describe("aligned fuzz residuals are solved in place or named (spec 42 gate 1)", () => {
  test("seed 81: a sphere pole on a torus is solved exactly by re-parametrising the sphere", () => {
    const { A, B, out } = run(81)
    expect(A.faces[0]!.surface.kind).toBe("torus")
    expect(B.faces[0]!.surface.kind).toBe("sphere")
    expect(out.warnings).toEqual([])
    expect(out.counters.recoveredByDisplacement).toBe(0)
    expect(out.counters.reframed).toBeGreaterThan(0)
    identities(A, B, out, 1e-7)
    // Oracle: the intersection by sampling the two analytic solids over the overlap of their boxes.
    const t = A.faces[0]!.surface, s = B.faces[0]!.surface
    if (t.kind !== "torus" || s.kind !== "sphere") throw new Error("unexpected operands")
    const inT = torusAt(t.frame.origin, t.major, t.minor), inS = sphereAt(s.frame.origin, s.radius)
    const { lo, hi } = overlap(A, B)
    const mc = sampledVolume(lo, hi, (p) => inT(p) && inS(p))
    expect(Math.abs(vol(out.i) - mc) / mc).toBeLessThan(0.01)
  })

  test("seed 116: a circle that is the sphere's seam through its poles is solved exactly", () => {
    const { A, B, out } = run(116)
    expect(A.faces[0]!.surface.kind).toBe("sphere")
    expect(out.warnings).toEqual([])
    expect(out.counters.recoveredByDisplacement).toBe(0)
    expect(out.counters.reframed).toBeGreaterThan(0)
    identities(A, B, out, 1e-7)
    const s = A.faces[0]!.surface
    if (s.kind !== "sphere") throw new Error("unexpected operand")
    const b = box(B)
    const inS = sphereAt(s.frame.origin, s.radius)
    const { lo, hi } = overlap(A, B)
    const mc = sampledVolume(lo, hi, (p) => inS(p) && p.x > b.lo.x && p.x < b.hi.x && p.y > b.lo.y && p.y < b.hi.y && p.z > b.lo.z && p.z < b.hi.z)
    expect(Math.abs(vol(out.i) - mc) / mc).toBeLessThan(0.01)
  })

  test("seed 33: torus x cylinder with a crossing intersection curve on the rim is displaced, reported, and named", () => {
    const { A, B, out } = run(33)
    expect(A.faces[0]!.surface.kind).toBe("torus")
    expect(out.counters.recoveredByDisplacement).toBeGreaterThan(0)
    // Never silent: every displaced Boolean says which surfaces and why.
    const named = out.warnings.filter((w) => w.includes("degenerate alignment"))
    expect(named.length).toBeGreaterThan(0)
    for (const w of named) {
      expect(w).toContain("torus x cylinder")
      expect(w).toContain("singular surface intersection")
      expect(w).toContain("exact only to that distance")
    }
    identities(A, B, out, 1e-3)
    const t = A.faces[0]!.surface
    if (t.kind !== "torus") throw new Error("unexpected operand")
    const inT = torusAt(t.frame.origin, t.major, t.minor)
    // The cylinder: axis along y through (2, ., 1.5), radius 3, y from 1.5 to 7.5.
    const inC = (p: Vec3) => (p.x - 2) ** 2 + (p.z - 1.5) ** 2 < 9 && p.y > 1.5 && p.y < 7.5
    expect(Math.abs(vol(B) - Math.PI * 9 * 6) / vol(B)).toBeLessThan(1e-9)
    const lo = { x: -1, y: 1.5, z: -1.5 }, hi = { x: 5, y: 7.5, z: 0.5 }
    const mc = sampledVolume(lo, hi, (p) => inT(p) && inC(p))
    expect(Math.abs(vol(out.i) - mc) / mc).toBeLessThan(0.02)
  })
})
