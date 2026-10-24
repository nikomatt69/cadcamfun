/**
 * Print orientation. Each of the six axis-aligned faces is tried on the plate; an orientation is scored by the area that
 * overhangs (it needs support and prints badly), the area resting on the plate (it holds the part and is smooth) and the height
 * (more layers, a less stable build). The best one is used only if it clearly beats the part as designed.
 */
import type { Mesh64 } from "../model/element-mesh.ts"

type M3 = readonly [number, number, number, number, number, number, number, number, number]

/** Rotations that bring +X, -X, +Y, -Y, +Z or -Z to face down, and the identity. */
const ROTATIONS: ReadonlyArray<{ readonly name: string; readonly m: M3 }> = [
  { name: "as designed", m: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  // -Z down is the design; flipping it over puts +Z down.
  { name: "top face down", m: [1, 0, 0, 0, -1, 0, 0, 0, -1] },
  { name: "+X face down", m: [0, 0, 1, 0, 1, 0, -1, 0, 0] },
  { name: "-X face down", m: [0, 0, -1, 0, 1, 0, 1, 0, 0] },
  { name: "+Y face down", m: [1, 0, 0, 0, 0, 1, 0, -1, 0] },
  { name: "-Y face down", m: [1, 0, 0, 0, 0, -1, 0, 1, 0] }
]

const apply = (m: M3, x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z
]

export interface Orientation {
  readonly name: string
  readonly rotation: M3
  readonly score: number
  readonly overhang: number
  readonly contact: number
  readonly height: number
}

const score = (meshes: ReadonlyArray<Mesh64>, m: M3, overhangSin: number): Orientation & { name: string } => {
  // Rotate every vertex, then measure.
  let minZ = Infinity
  let maxZ = -Infinity
  const rotated = meshes.map((mesh) => {
    const p = mesh.positions
    const out = new Float64Array(p.length)
    for (let k = 0; k < p.length; k += 3) {
      const [x, y, z] = apply(m, p[k]!, p[k + 1]!, p[k + 2]!)
      out[k] = x; out[k + 1] = y; out[k + 2] = z
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    return { positions: out, indices: mesh.indices }
  })
  let overhang = 0
  let contact = 0
  for (const mesh of rotated) {
    const p = mesh.positions
    for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
      const a = mesh.indices[k]! * 3, b = mesh.indices[k + 1]! * 3, c = mesh.indices[k + 2]! * 3
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-12) continue
      const area = len / 2
      const down = -nz / len
      if (down <= overhangSin) continue
      const highest = Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!)
      if (highest - minZ < 0.05) contact += area
      else overhang += area
    }
  }
  const height = maxZ - minZ
  return { name: "", rotation: m, score: overhang - 0.5 * contact + 2 * height, overhang, contact, height }
}

/**
 * The best orientation of the group (the same rotation for all bodies) and the one it was compared with. `rotation` is the
 * identity when the part as designed is already as good, within 10 %.
 */
export const bestOrientation = (meshes: ReadonlyArray<Mesh64>, overhangAngle = 45): { readonly chosen: Orientation; readonly designed: Orientation } => {
  const overhangSin = Math.sin((overhangAngle * Math.PI) / 180)
  const all = ROTATIONS.map((r) => ({ ...score(meshes, r.m, overhangSin), name: r.name }))
  const designed = all[0]!
  const best = all.reduce((a, b) => (b.score < a.score ? b : a))
  const clearlyBetter = best.score < designed.score - Math.max(5, Math.abs(designed.score) * 0.1)
  return { chosen: clearlyBetter ? best : designed, designed }
}

export const rotateMeshes = (meshes: ReadonlyArray<Mesh64>, m: M3): Mesh64[] =>
  meshes.map((mesh) => {
    const p = mesh.positions
    const out = new Float64Array(p.length)
    for (let k = 0; k < p.length; k += 3) {
      const [x, y, z] = apply(m, p[k]!, p[k + 1]!, p[k + 2]!)
      out[k] = x; out[k + 1] = y; out[k + 2] = z
    }
    // A proper rotation keeps the winding.
    return { positions: out, indices: mesh.indices }
  })
