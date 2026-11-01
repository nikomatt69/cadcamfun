/**
 * The 10-node (quadratic) tetrahedron and its 6-node triangular face. Straight-sided: the geometry map is affine, so the
 * gradients of the barycentric coordinates are constant per element.
 *
 * Node order: 0-3 corners, then edge midpoints 4:(0,1) 5:(1,2) 6:(0,2) 7:(0,3) 8:(1,3) 9:(2,3).
 * Face order: 0-2 corners, then 3:(0,1) 4:(1,2) 5:(2,0).
 */
export const TET10_EDGES: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3]]

/** Shape functions at barycentric point `L`. */
export const tet10Shape = (L: readonly number[], out: Float64Array): void => {
  for (let i = 0; i < 4; i++) out[i] = L[i]! * (2 * L[i]! - 1)
  for (let e = 0; e < 6; e++) { const [a, b] = TET10_EDGES[e]!; out[4 + e] = 4 * L[a]! * L[b]! }
}

/** `dN_i / dL_k` at `L`, index `i * 4 + k`. */
export const tet10DShape = (L: readonly number[], out: Float64Array): void => {
  out.fill(0)
  for (let i = 0; i < 4; i++) out[i * 4 + i] = 4 * L[i]! - 1
  for (let e = 0; e < 6; e++) {
    const [a, b] = TET10_EDGES[e]!
    out[(4 + e) * 4 + a] = 4 * L[b]!
    out[(4 + e) * 4 + b] = 4 * L[a]!
  }
}

export interface TetGeometry {
  /** Signed volume, mm³. */
  volume: number
  /** `∇L_k`, index `k * 3 + d`. */
  gradL: Float64Array
}

/** Volume and barycentric gradients from the four corner coordinates (12 numbers). */
export const tetGeometry = (x: ArrayLike<number>, out: TetGeometry = { volume: 0, gradL: new Float64Array(12) }): TetGeometry => {
  const x1 = x[3]! - x[0]!, y1 = x[4]! - x[1]!, z1 = x[5]! - x[2]!
  const x2 = x[6]! - x[0]!, y2 = x[7]! - x[1]!, z2 = x[8]! - x[2]!
  const x3 = x[9]! - x[0]!, y3 = x[10]! - x[1]!, z3 = x[11]! - x[2]!
  const det = x1 * (y2 * z3 - y3 * z2) - y1 * (x2 * z3 - x3 * z2) + z1 * (x2 * y3 - x3 * y2)
  out.volume = det / 6
  const inv = 1 / det
  // rows of the inverse Jacobian: gradients of L2, L3, L4
  const g = out.gradL
  g[3] = (y2 * z3 - y3 * z2) * inv; g[4] = (x3 * z2 - x2 * z3) * inv; g[5] = (x2 * y3 - x3 * y2) * inv
  g[6] = (y3 * z1 - y1 * z3) * inv; g[7] = (x1 * z3 - x3 * z1) * inv; g[8] = (x3 * y1 - x1 * y3) * inv
  g[9] = (y1 * z2 - y2 * z1) * inv; g[10] = (x2 * z1 - x1 * z2) * inv; g[11] = (x1 * y2 - x2 * y1) * inv
  g[0] = -(g[3]! + g[6]! + g[9]!); g[1] = -(g[4]! + g[7]! + g[10]!); g[2] = -(g[5]! + g[8]! + g[11]!)
  return out
}

/** Physical gradients of the ten shape functions (`i * 3 + d`) from `dN/dL` and `∇L`. */
export const physicalGradients = (dN: Float64Array, gradL: Float64Array, out: Float64Array): void => {
  for (let i = 0; i < 10; i++) for (let d = 0; d < 3; d++) {
    out[i * 3 + d] = dN[i * 4]! * gradL[d]! + dN[i * 4 + 1]! * gradL[3 + d]! + dN[i * 4 + 2]! * gradL[6 + d]! + dN[i * 4 + 3]! * gradL[9 + d]!
  }
}

/** Strain-displacement matrix (6 × 30, Voigt xx yy zz xy yz zx with engineering shear) from the shape gradients. */
export const strainMatrix = (grad: Float64Array, out: Float64Array): void => {
  out.fill(0)
  for (let i = 0; i < 10; i++) {
    const gx = grad[i * 3]!, gy = grad[i * 3 + 1]!, gz = grad[i * 3 + 2]!
    const c = i * 3
    out[0 * 30 + c] = gx; out[3 * 30 + c] = gy; out[5 * 30 + c] = gz
    out[1 * 30 + c + 1] = gy; out[3 * 30 + c + 1] = gx; out[4 * 30 + c + 1] = gz
    out[2 * 30 + c + 2] = gz; out[4 * 30 + c + 2] = gy; out[5 * 30 + c + 2] = gx
  }
}

/** Isotropic elasticity matrix (6 × 6) for E in MPa. */
export const elasticityMatrix = (E: number, nu: number): Float64Array => {
  const lambda = E * nu / ((1 + nu) * (1 - 2 * nu)), mu = E / (2 * (1 + nu))
  const D = new Float64Array(36)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i * 6 + j] = i === j ? lambda + 2 * mu : lambda
  D[3 * 6 + 3] = mu; D[4 * 6 + 4] = mu; D[5 * 6 + 5] = mu
  return D
}

/** Triangle (6-node) shape functions at area coordinates. */
export const tri6Shape = (s: readonly number[], out: Float64Array): void => {
  for (let i = 0; i < 3; i++) out[i] = s[i]! * (2 * s[i]! - 1)
  out[3] = 4 * s[0]! * s[1]!; out[4] = 4 * s[1]! * s[2]!; out[5] = 4 * s[2]! * s[0]!
}
