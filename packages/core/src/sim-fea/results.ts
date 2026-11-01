/**
 * Result fields (spec 48 §2 step 5): the stress measures a designer reads in Fusion — von Mises, Tresca, principal stresses,
 * maximum shear — and the safety factor against the criterion that suits the material.
 */
import type { FailureCriterion, SolverMaterial } from "./materials.ts"

export const SAFETY_CAP = 1000

/** Principal stresses of a symmetric tensor (xx yy zz xy yz zx), `s1 ≥ s2 ≥ s3`, by the closed trigonometric solution. */
export const principal = (s: ArrayLike<number>, o = 0): [number, number, number] => {
  const xx = s[o]!, yy = s[o + 1]!, zz = s[o + 2]!, xy = s[o + 3]!, yz = s[o + 4]!, zx = s[o + 5]!
  const q = (xx + yy + zz) / 3
  const p2 = (xx - q) ** 2 + (yy - q) ** 2 + (zz - q) ** 2 + 2 * (xy * xy + yz * yz + zx * zx)
  const p = Math.sqrt(p2 / 6)
  if (p < 1e-12) return [q, q, q]
  const b = [(xx - q) / p, xy / p, zx / p, (yy - q) / p, yz / p, (zz - q) / p]
  const det = b[0]! * (b[3]! * b[5]! - b[4]! * b[4]!) - b[1]! * (b[1]! * b[5]! - b[4]! * b[2]!) + b[2]! * (b[1]! * b[4]! - b[3]! * b[2]!)
  const r = Math.max(-1, Math.min(1, det / 2))
  const phi = Math.acos(r) / 3
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3)
  return [e1, 3 * q - e1 - e3, e3]
}

export const vonMises = (s: ArrayLike<number>, o = 0): number => {
  const xx = s[o]!, yy = s[o + 1]!, zz = s[o + 2]!, xy = s[o + 3]!, yz = s[o + 4]!, zx = s[o + 5]!
  return Math.sqrt(Math.max(0, 0.5 * ((xx - yy) ** 2 + (yy - zz) ** 2 + (zz - xx) ** 2) + 3 * (xy * xy + yz * yz + zx * zx)))
}

export interface StressFields {
  readonly vonMises: Float64Array
  readonly tresca: Float64Array
  readonly maxPrincipal: Float64Array
  readonly minPrincipal: Float64Array
  readonly maxShear: Float64Array
  /** The measure the criterion compares with the allowable (its units: MPa). */
  readonly equivalent: Float64Array
  readonly safetyFactor: Float64Array
}

/** Allowable and the equivalent stress of a criterion for one stress state. */
export const safetyOf = (criterion: FailureCriterion, mat: SolverMaterial, s1: number, s3: number, vm: number): { equivalent: number; safety: number } => {
  const limit = mat.ductility === "ductile" ? mat.yield : mat.ultimate
  const cap = (x: number) => Number.isFinite(x) ? Math.min(SAFETY_CAP, x) : SAFETY_CAP
  switch (criterion) {
    case "von_mises": return { equivalent: vm, safety: cap(vm > 0 ? limit / vm : Infinity) }
    case "tresca": return { equivalent: s1 - s3, safety: cap(s1 - s3 > 0 ? limit / (s1 - s3) : Infinity) }
    case "max_principal": return { equivalent: s1, safety: cap(s1 > 0 ? limit / s1 : Infinity) }
    case "mohr_coulomb": {
      const d = s1 / mat.ultimate - s3 / mat.compressive
      return { equivalent: Math.max(s1, 0), safety: cap(d > 0 ? 1 / d : Infinity) }
    }
  }
}

export const stressFields = (stress: Float64Array, nodeCount: number, mat: SolverMaterial, criterion: FailureCriterion): StressFields => {
  const f: StressFields = {
    vonMises: new Float64Array(nodeCount), tresca: new Float64Array(nodeCount), maxPrincipal: new Float64Array(nodeCount),
    minPrincipal: new Float64Array(nodeCount), maxShear: new Float64Array(nodeCount), equivalent: new Float64Array(nodeCount), safetyFactor: new Float64Array(nodeCount)
  }
  for (let n = 0; n < nodeCount; n++) {
    const [s1, , s3] = principal(stress, n * 6), vm = vonMises(stress, n * 6)
    f.vonMises[n] = vm; f.tresca[n] = s1 - s3; f.maxPrincipal[n] = s1; f.minPrincipal[n] = s3; f.maxShear[n] = (s1 - s3) / 2
    const r = safetyOf(criterion, mat, s1, s3, vm)
    f.equivalent[n] = r.equivalent; f.safetyFactor[n] = r.safety
  }
  return f
}

export const extremum = (a: ArrayLike<number>, stride = 1, offset = 0): { min: number; max: number; minAt: number; maxAt: number } => {
  let min = Infinity, max = -Infinity, minAt = -1, maxAt = -1
  for (let i = 0, n = a.length / stride; i < n; i++) { const v = a[i * stride + offset]!; if (v < min) { min = v; minAt = i } if (v > max) { max = v; maxAt = i } }
  return { min, max, minAt, maxAt }
}

/** Magnitude field of a 3-vector array. */
export const magnitudes = (v: ArrayLike<number>): Float64Array => {
  const n = v.length / 3, out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.hypot(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!)
  return out
}
