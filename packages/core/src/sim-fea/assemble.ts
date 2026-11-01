/**
 * Element loops (spec 48 §2 step 3): stiffness, mass, geometric stiffness, conduction, heat capacity and the load vectors of
 * the 10-node tetrahedron and its 6-node faces. Units are the solver's consistent set (mm, N, MPa, tonne, s, mJ, K).
 */
import { TET10_EDGES, elasticityMatrix, physicalGradients, strainMatrix, tet10DShape, tet10Shape, tetGeometry, tri6Shape } from "./element.ts"
import type { SolverMaterial } from "./materials.ts"
import type { TetMesh } from "./mesh.ts"
import { TET27, TET4, TET64, TRI6 } from "./quadrature.ts"
import { type Csr, addElement, buildPattern, zeroLike } from "./sparse.ts"
import type { Vec3 } from "./study.ts"

/** Mesh plus the per-element geometry every assembly shares. */
export interface Prepared {
  readonly mesh: TetMesh
  readonly volume: Float64Array
  readonly gradL: Float64Array
  readonly pattern3: Csr
  readonly pattern1: Csr
}

export const prepare = (mesh: TetMesh): Prepared => {
  const ne = mesh.elementCount
  const volume = new Float64Array(ne), gradL = new Float64Array(ne * 12)
  const xe = new Float64Array(12), geo = { volume: 0, gradL: new Float64Array(12) }
  for (let e = 0; e < ne; e++) {
    for (let a = 0; a < 4; a++) for (let d = 0; d < 3; d++) xe[a * 3 + d] = mesh.nodes[mesh.elements[e * 10 + a]! * 3 + d]!
    tetGeometry(xe, geo)
    volume[e] = geo.volume
    gradL.set(geo.gradL, e * 12)
  }
  return { mesh, volume, gradL, pattern3: buildPattern(mesh.nodeCount, 3, mesh.elements, 10), pattern1: buildPattern(mesh.nodeCount, 1, mesh.elements, 10) }
}

const dofs3 = (mesh: TetMesh, e: number, out: Int32Array): void => {
  for (let a = 0; a < 10; a++) { const n = mesh.elements[e * 10 + a]!; out[a * 3] = n * 3; out[a * 3 + 1] = n * 3 + 1; out[a * 3 + 2] = n * 3 + 2 }
}

/** Shape data of a rule at its points: N and dN/dL. */
const tabulate = (points: ReadonlyArray<readonly number[]>) => points.map((L) => { const N = new Float64Array(10), dN = new Float64Array(40); tet10Shape(L, N); tet10DShape(L, dN); return { N, dN } })

const TAB4 = tabulate(TET4.points), TAB27 = tabulate(TET27.points), TAB64 = tabulate(TET64.points)

/** Corner/edge integrals of the shape functions over the element, as a fraction of its volume. */
const NODAL_VOLUME_SHARE = Float64Array.from([-1 / 20, -1 / 20, -1 / 20, -1 / 20, 1 / 5, 1 / 5, 1 / 5, 1 / 5, 1 / 5, 1 / 5])

export const stiffness = (p: Prepared, mat: SolverMaterial): Csr => {
  const K = zeroLike(p.pattern3), D = elasticityMatrix(mat.E, mat.nu)
  const grad = new Float64Array(30), B = new Float64Array(180), DB = new Float64Array(180), ke = new Float64Array(900), dofs = new Int32Array(30)
  const gl = new Float64Array(12)
  for (let e = 0; e < p.mesh.elementCount; e++) {
    ke.fill(0)
    gl.set(p.gradL.subarray(e * 12, e * 12 + 12))
    const w6v = 6 * p.volume[e]!
    for (let g = 0; g < 4; g++) {
      physicalGradients(TAB4[g]!.dN, gl, grad)
      strainMatrix(grad, B)
      for (let i = 0; i < 6; i++) for (let j = 0; j < 30; j++) { let s = 0; for (let k = 0; k < 6; k++) s += D[i * 6 + k]! * B[k * 30 + j]!; DB[i * 30 + j] = s }
      const w = w6v * TET4.weights[g]!
      for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) { let s = 0; for (let k = 0; k < 6; k++) s += B[k * 30 + i]! * DB[k * 30 + j]!; ke[i * 30 + j]! += w * s }
    }
    dofs3(p.mesh, e, dofs)
    addElement(K, dofs, ke, 30)
  }
  return K
}

/** Consistent mass (3 unknowns per node) when `dpn` is 3, or the scalar heat-capacity-shaped matrix when 1, scaled by `density`. */
export const massLike = (p: Prepared, density: number, dpn: 1 | 3): Csr => {
  const M = zeroLike(dpn === 3 ? p.pattern3 : p.pattern1)
  const ms = new Float64Array(100), full = new Float64Array(900), d3 = new Int32Array(30), d1 = new Int32Array(10)
  for (let e = 0; e < p.mesh.elementCount; e++) {
    ms.fill(0)
    const w6v = 6 * p.volume[e]! * density
    for (let g = 0; g < TET64.weights.length; g++) {
      const N = TAB64[g]!.N, w = w6v * TET64.weights[g]!
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) ms[i * 10 + j]! += w * N[i]! * N[j]!
    }
    if (dpn === 1) {
      for (let a = 0; a < 10; a++) d1[a] = p.mesh.elements[e * 10 + a]!
      addElement(M, d1, ms, 10)
    } else {
      full.fill(0)
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let d = 0; d < 3; d++) full[(i * 3 + d) * 30 + j * 3 + d] = ms[i * 10 + j]!
      dofs3(p.mesh, e, d3)
      addElement(M, d3, full, 30)
    }
  }
  return M
}

/** Heat conduction matrix `k ∫ ∇Nᵀ∇N`. */
export const conduction = (p: Prepared, k: number): Csr => {
  const A = zeroLike(p.pattern1), grad = new Float64Array(30), ke = new Float64Array(100), d1 = new Int32Array(10), gl = new Float64Array(12)
  for (let e = 0; e < p.mesh.elementCount; e++) {
    ke.fill(0)
    gl.set(p.gradL.subarray(e * 12, e * 12 + 12))
    const w6v = 6 * p.volume[e]! * k
    for (let g = 0; g < 4; g++) {
      physicalGradients(TAB4[g]!.dN, gl, grad)
      const w = w6v * TET4.weights[g]!
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) ke[i * 10 + j]! += w * (grad[i * 3]! * grad[j * 3]! + grad[i * 3 + 1]! * grad[j * 3 + 1]! + grad[i * 3 + 2]! * grad[j * 3 + 2]!)
    }
    for (let a = 0; a < 10; a++) d1[a] = p.mesh.elements[e * 10 + a]!
    addElement(A, d1, ke, 10)
  }
  return A
}

/** Nodal temperature at a Gauss point of tabulated rule `tab`. */
const tempAt = (mesh: TetMesh, e: number, T: ArrayLike<number>, N: Float64Array): number => {
  let s = 0
  for (let a = 0; a < 10; a++) s += N[a]! * T[mesh.elements[e * 10 + a]!]!
  return s
}

/** Equivalent nodal forces of a thermal strain `α (T − Tref)` (isotropic): `∫ Bᵀ D ε_th`. */
export const thermalLoad = (p: Prepared, mat: SolverMaterial, T: ArrayLike<number>, reference: number, f: Float64Array): void => {
  const grad = new Float64Array(30), gl = new Float64Array(12), c = mat.E / (1 - 2 * mat.nu)
  for (let e = 0; e < p.mesh.elementCount; e++) {
    gl.set(p.gradL.subarray(e * 12, e * 12 + 12))
    const w6v = 6 * p.volume[e]!
    for (let g = 0; g < TET27.weights.length; g++) {
      const tab = TAB27[g]!
      physicalGradients(tab.dN, gl, grad)
      const kappa = w6v * TET27.weights[g]! * mat.alpha * c * (tempAt(p.mesh, e, T, tab.N) - reference)
      for (let a = 0; a < 10; a++) { const n = p.mesh.elements[e * 10 + a]!; f[n * 3]! += kappa * grad[a * 3]!; f[n * 3 + 1]! += kappa * grad[a * 3 + 1]!; f[n * 3 + 2]! += kappa * grad[a * 3 + 2]! }
    }
  }
}

/** Uniform body acceleration (mm/s²): `f = ρ a ∫N`. */
export const bodyForce = (p: Prepared, density: number, acceleration: Vec3, f: Float64Array): void => {
  for (let e = 0; e < p.mesh.elementCount; e++) for (let a = 0; a < 10; a++) {
    const n = p.mesh.elements[e * 10 + a]!, s = density * p.volume[e]! * NODAL_VOLUME_SHARE[a]!
    f[n * 3]! += s * acceleration[0]; f[n * 3 + 1]! += s * acceleration[1]; f[n * 3 + 2]! += s * acceleration[2]
  }
}

/** Volumetric heat source `q` (mJ/s/mm³) on a scalar field. */
export const heatSource = (p: Prepared, q: number, f: Float64Array): void => {
  for (let e = 0; e < p.mesh.elementCount; e++) for (let a = 0; a < 10; a++) f[p.mesh.elements[e * 10 + a]!]! += q * p.volume[e]! * NODAL_VOLUME_SHARE[a]!
}

export interface FaceInfo { readonly area: number; readonly normal: Vec3; readonly origin: Vec3; readonly corners: Float64Array }

export const faceInfo = (mesh: TetMesh, f: number): FaceInfo => {
  const c = new Float64Array(9)
  for (let a = 0; a < 3; a++) for (let d = 0; d < 3; d++) c[a * 3 + d] = mesh.nodes[mesh.faces[f * 6 + a]! * 3 + d]!
  const ux = c[3]! - c[0]!, uy = c[4]! - c[1]!, uz = c[5]! - c[2]!, vx = c[6]! - c[0]!, vy = c[7]! - c[1]!, vz = c[8]! - c[2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  return { area: len / 2, normal: len > 0 ? [nx / len, ny / len, nz / len] : [0, 0, 0], origin: [c[0]!, c[1]!, c[2]!], corners: c }
}

const faceShapes = TRI6.points.map((s) => { const N = new Float64Array(6); tri6Shape(s, N); return N })

/** Position of a face Gauss point (the face is flat, so the corner interpolation is exact). */
export const facePoint = (info: FaceInfo, s: readonly number[]): Vec3 => [
  s[0]! * info.corners[0]! + s[1]! * info.corners[3]! + s[2]! * info.corners[6]!,
  s[0]! * info.corners[1]! + s[1]! * info.corners[4]! + s[2]! * info.corners[7]!,
  s[0]! * info.corners[2]! + s[1]! * info.corners[5]! + s[2]! * info.corners[8]!
]

/** Adds `∫ N_i t(x) dA` for a traction field `t(point, normal)` (N/mm²) over the listed faces. */
export const surfaceTraction = (mesh: TetMesh, faces: ReadonlyArray<number>, traction: (x: Vec3, n: Vec3) => Vec3, f: Float64Array): void => {
  for (const face of faces) {
    const info = faceInfo(mesh, face)
    for (let g = 0; g < TRI6.weights.length; g++) {
      const t = traction(facePoint(info, TRI6.points[g]!), info.normal), w = info.area * TRI6.weights[g]!, N = faceShapes[g]!
      for (let a = 0; a < 6; a++) { const n = mesh.faces[face * 6 + a]!; f[n * 3]! += w * N[a]! * t[0]; f[n * 3 + 1]! += w * N[a]! * t[1]; f[n * 3 + 2]! += w * N[a]! * t[2] }
    }
  }
}

export const totalArea = (mesh: TetMesh, faces: ReadonlyArray<number>): number => faces.reduce((s, f) => s + faceInfo(mesh, f).area, 0)

/** Convection `h (T − T∞)` on faces: adds `h ∫ NNᵀ` to `a` and `h T∞ ∫ N` to `f`. */
export const faceConvection = (mesh: TetMesh, faces: ReadonlyArray<number>, h: number, ambient: number, a: Csr, f: Float64Array): void => {
  const ke = new Float64Array(36), ids = new Int32Array(6)
  for (const face of faces) {
    const info = faceInfo(mesh, face)
    ke.fill(0)
    for (let g = 0; g < TRI6.weights.length; g++) {
      const N = faceShapes[g]!, w = info.area * TRI6.weights[g]! * h
      for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) ke[i * 6 + j]! += w * N[i]! * N[j]!; f[mesh.faces[face * 6 + i]!]! += w * ambient * N[i]! }
    }
    for (let i = 0; i < 6; i++) ids[i] = mesh.faces[face * 6 + i]!
    addElement(a, ids, ke, 6)
  }
}

/** Heat flux `q` (mJ/s/mm²) into the part over faces. */
export const faceFlux = (mesh: TetMesh, faces: ReadonlyArray<number>, q: number, f: Float64Array): void => {
  for (const face of faces) {
    const info = faceInfo(mesh, face)
    for (let g = 0; g < TRI6.weights.length; g++) { const w = info.area * TRI6.weights[g]! * q, N = faceShapes[g]!; for (let i = 0; i < 6; i++) f[mesh.faces[face * 6 + i]!]! += w * N[i]! }
  }
}

export interface GaussStress { readonly stress: Float64Array; readonly volume: Float64Array }

/**
 * Stress `D (B u − ε_th)` at the four Gauss points of every element, then extrapolated to the ten nodes (linear field:
 * exact) and volume-averaged at shared nodes. Returns six components per node (xx yy zz xy yz zx).
 */
export const recoverStress = (p: Prepared, mat: SolverMaterial, u: Float64Array, temperature: ArrayLike<number> | undefined, reference: number): Float64Array => {
  const mesh = p.mesh, D = elasticityMatrix(mat.E, mat.nu), grad = new Float64Array(30), B = new Float64Array(180), gl = new Float64Array(12)
  const sum = new Float64Array(mesh.nodeCount * 6), weight = new Float64Array(mesh.nodeCount)
  const gp = new Float64Array(24), corner = new Float64Array(24), ue = new Float64Array(30)
  const a = 0.5854101966249685, b = 0.1381966011250105
  for (let e = 0; e < mesh.elementCount; e++) {
    gl.set(p.gradL.subarray(e * 12, e * 12 + 12))
    for (let n = 0; n < 10; n++) { const id = mesh.elements[e * 10 + n]!; ue[n * 3] = u[id * 3]!; ue[n * 3 + 1] = u[id * 3 + 1]!; ue[n * 3 + 2] = u[id * 3 + 2]! }
    for (let g = 0; g < 4; g++) {
      physicalGradients(TAB4[g]!.dN, gl, grad)
      strainMatrix(grad, B)
      const eps = [0, 0, 0, 0, 0, 0]
      for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 30; j++) s += B[i * 30 + j]! * ue[j]!; eps[i] = s }
      if (temperature !== undefined) { const th = mat.alpha * (tempAt(mesh, e, temperature, TAB4[g]!.N) - reference); eps[0]! -= th; eps[1]! -= th; eps[2]! -= th }
      for (let i = 0; i < 6; i++) { let s = 0; for (let k = 0; k < 6; k++) s += D[i * 6 + k]! * eps[k]!; gp[g * 6 + i] = s }
    }
    for (let c = 0; c < 4; c++) for (let i = 0; i < 6; i++) {
      let total = 0
      for (let g = 0; g < 4; g++) total += gp[g * 6 + i]!
      corner[c * 6 + i] = (gp[c * 6 + i]! - b * total) / (a - b)
    }
    const v = p.volume[e]!
    for (let n = 0; n < 10; n++) {
      const id = mesh.elements[e * 10 + n]!
      weight[id]! += v
      for (let i = 0; i < 6; i++) {
        const value = n < 4 ? corner[n * 6 + i]! : (corner[TET10_EDGES[n - 4]![0] * 6 + i]! + corner[TET10_EDGES[n - 4]![1] * 6 + i]!) / 2
        sum[id * 6 + i]! += v * value
      }
    }
  }
  for (let n = 0; n < mesh.nodeCount; n++) if (weight[n]! > 0) for (let i = 0; i < 6; i++) sum[n * 6 + i]! /= weight[n]!
  return sum
}

/**
 * Geometric (initial-stress) stiffness for linear buckling from the stress at the Gauss points of a prestress solution:
 * `Kg = ∫ Gᵀ S G`, one 3 × 3 stress block per node pair acting on equal directions.
 */
export const geometricStiffness = (p: Prepared, mat: SolverMaterial, u: Float64Array, temperature: ArrayLike<number> | undefined, reference: number): Csr => {
  const mesh = p.mesh, D = elasticityMatrix(mat.E, mat.nu), Kg = zeroLike(p.pattern3)
  const grad = new Float64Array(30), B = new Float64Array(180), gl = new Float64Array(12), ue = new Float64Array(30), ke = new Float64Array(900), dofs = new Int32Array(30)
  for (let e = 0; e < mesh.elementCount; e++) {
    gl.set(p.gradL.subarray(e * 12, e * 12 + 12))
    for (let n = 0; n < 10; n++) { const id = mesh.elements[e * 10 + n]!; ue[n * 3] = u[id * 3]!; ue[n * 3 + 1] = u[id * 3 + 1]!; ue[n * 3 + 2] = u[id * 3 + 2]! }
    ke.fill(0)
    const w6v = 6 * p.volume[e]!
    for (let g = 0; g < TET27.weights.length; g++) {
      physicalGradients(TAB27[g]!.dN, gl, grad)
      strainMatrix(grad, B)
      const eps = [0, 0, 0, 0, 0, 0]
      for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 30; j++) s += B[i * 30 + j]! * ue[j]!; eps[i] = s }
      if (temperature !== undefined) { const th = mat.alpha * (tempAt(mesh, e, temperature, TAB27[g]!.N) - reference); eps[0]! -= th; eps[1]! -= th; eps[2]! -= th }
      const s6 = [0, 0, 0, 0, 0, 0]
      for (let i = 0; i < 6; i++) { let s = 0; for (let k = 0; k < 6; k++) s += D[i * 6 + k]! * eps[k]!; s6[i] = s }
      const S = [[s6[0]!, s6[3]!, s6[5]!], [s6[3]!, s6[1]!, s6[4]!], [s6[5]!, s6[4]!, s6[2]!]]
      const w = w6v * TET27.weights[g]!
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
        let s = 0
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += grad[i * 3 + r]! * S[r]![c]! * grad[j * 3 + c]!
        s *= w
        for (let d = 0; d < 3; d++) ke[(i * 3 + d) * 30 + j * 3 + d]! += s
      }
    }
    dofs3(mesh, e, dofs)
    addElement(Kg, dofs, ke, 30)
  }
  return Kg
}
