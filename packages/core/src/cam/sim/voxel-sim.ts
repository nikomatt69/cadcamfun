/**
 * The stock as a 3+2 / 4-axis / 5-axis program removes it (spec 32 §4.5, tier S2): a voxel grid over the stock in the part
 * frame, cut by the tool along its own axis at every sample of every feed move — the axis the rotary angles give
 * (`rotary.ts`: R^T H Z in the part), so a tilted tool, an indexed face or an undercut tool removes what it really reaches.
 *
 * A voxel is removed when its centre lies inside the cutting part of the tool as the preview draws it (the same profile as
 * `tool-model.ts`). Exactness is the voxel size: the evidence keeps the kernel's sure / possible bracket (`kernel/stock.ts`);
 * this is the picture. The playhead moves forward by applying moves; backward from the nearest checkpoint.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { toolProfile, type ToolModel } from "../tool-model.ts"
import { lerpAngles, partPointOf, toolAxisInPart, type RotarySetup } from "../viewer/rotary.ts"
import { pointOn, type TimedMove, type Timeline } from "../viewer/timeline.ts"

export interface VoxelSimInput {
  readonly timeline: Timeline
  readonly rotary?: RotarySetup
  /** The stock box in program (part) coordinates. */
  readonly stock: { readonly min: Vec3; readonly max: Vec3 }
  /** Voxel side, mm; by default the stock is cut into about `budget` voxels. */
  readonly voxel?: number
  readonly budget?: number
  /** The tool of each toolpath (the preview's models); no mill tool, no removal. */
  readonly toolOf: (path: number) => ToolModel | undefined
}

interface Cutting { readonly segs: ReadonlyArray<readonly [number, number, number, number]>; readonly top: number; readonly reach: number }

const cuttingOf = (model: ToolModel | undefined): Cutting | undefined => {
  if (model === undefined || model.family !== "mill") return undefined
  const p = toolProfile(model)
  const segs: Array<readonly [number, number, number, number]> = []
  for (let i = 0; i + 1 < p.points.length; i++) if (p.parts[i] === "cutting") { const a = p.points[i]!, b = p.points[i + 1]!; segs.push([a.r, a.z, b.r, b.z]) }
  if (segs.length === 0) return undefined
  return { segs, top: Math.max(...segs.map((s) => Math.max(s[1], s[3]))), reach: Math.max(...segs.map((s) => Math.max(s[0], s[2]))) }
}

/** The cutting radius `dz` above the tip; -1 outside the flutes. */
const radiusAt = (c: Cutting, dz: number): number => {
  if (dz < 0 || dz > c.top) return -1
  let best = -1
  for (const [ar, az, br, bz] of c.segs) {
    const lo = Math.min(az, bz), hi = Math.max(az, bz)
    if (dz < lo - 1e-12 || dz > hi + 1e-12) continue
    if (hi - lo < 1e-12) { best = Math.max(best, ar, br); continue }
    best = Math.max(best, ar + ((br - ar) * (dz - az)) / (bz - az))
  }
  return best
}

export interface VoxelSim {
  readonly origin: Vec3
  readonly voxel: number
  readonly nx: number
  readonly ny: number
  readonly nz: number
  /** 1 where material is left. */
  readonly material: Uint8Array
  /** Bring the stock to the playhead; true when it changed. */
  readonly advanceTo: (seconds: number) => boolean
  readonly removedVolume: () => number
  readonly remainingVolume: () => number
  /** The faces of the material that touch air: two triangles each, positions and normals (part frame). */
  readonly surface: () => { readonly positions: Float32Array; readonly normals: Float32Array }
}

export const createVoxelSim = (input: VoxelSimInput): VoxelSim => {
  const { min, max } = input.stock
  const volume = Math.max(1e-9, (max.x - min.x) * (max.y - min.y) * (max.z - min.z))
  const voxel = input.voxel ?? Math.max(0.25, Math.cbrt(volume / (input.budget ?? 1_000_000)))
  const nx = Math.max(1, Math.ceil((max.x - min.x) / voxel)), ny = Math.max(1, Math.ceil((max.y - min.y) / voxel)), nz = Math.max(1, Math.ceil((max.z - min.z) / voxel))
  const n = nx * ny * nz
  const material = new Uint8Array(n).fill(1)
  const total = n
  let left = n
  const cuttings = new Map<number, Cutting | undefined>()
  const cuttingFor = (path: number) => { if (!cuttings.has(path)) cuttings.set(path, cuttingOf(input.toolOf(path))); return cuttings.get(path) }
  const moves = input.timeline.moves
  // Checkpoints: the material after every `every`-th move, so going back replays a bounded stretch.
  const every = Math.max(50, Math.ceil(moves.length / 40))
  const checkpoints = new Map<number, Uint8Array>([[0, material.slice()]])
  const leftAt = new Map<number, number>([[0, n]])
  let done = 0 // moves fully applied
  let partial = -1 // fraction of move `done` applied (-1: none)

  const cutAt = (c: Cutting, tip: Vec3, d: Vec3): void => {
    const ex = c.reach + c.top * Math.abs(d.x), ey = c.reach + c.top * Math.abs(d.y), ez = c.reach + c.top * Math.abs(d.z)
    const i0 = Math.max(0, Math.floor((tip.x - ex - min.x) / voxel)), i1 = Math.min(nx - 1, Math.floor((tip.x + ex - min.x) / voxel))
    const j0 = Math.max(0, Math.floor((tip.y - ey - min.y) / voxel)), j1 = Math.min(ny - 1, Math.floor((tip.y + ey - min.y) / voxel))
    const k0 = Math.max(0, Math.floor((tip.z - ez - min.z) / voxel)), k1 = Math.min(nz - 1, Math.floor((tip.z + ez - min.z) / voxel))
    for (let k = k0; k <= k1; k++) {
      const vz = min.z + (k + 0.5) * voxel - tip.z
      for (let j = j0; j <= j1; j++) {
        const vy = min.y + (j + 0.5) * voxel - tip.y
        let id = (k * ny + j) * nx + i0
        for (let i = i0; i <= i1; i++, id++) {
          if (material[id] === 0) continue
          const vx = min.x + (i + 0.5) * voxel - tip.x
          const s = vx * d.x + vy * d.y + vz * d.z
          if (s < 0 || s > c.top) continue
          const rho2 = vx * vx + vy * vy + vz * vz - s * s
          const r = radiusAt(c, s)
          if (r >= 0 && rho2 <= r * r) { material[id] = 0; left-- }
        }
      }
    }
  }
  /** Cut along move `m` from fraction f0 to f1. */
  const cutMove = (m: TimedMove, f0: number, f1: number): void => {
    if (m.kind !== "feed" || m.state.spindle === "off" || m.state.probe) return
    const c = cuttingFor(m.path)
    if (c === undefined) return
    const length = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z) * (f1 - f0)
    const steps = Math.max(1, Math.ceil(length / (voxel / 2)))
    for (let k = 0; k <= steps; k++) {
      const f = f0 + ((f1 - f0) * k) / steps
      const p = pointOn(m, f)
      const angles = lerpAngles(m.anglesFrom, m.angles, f)
      const tip = input.rotary !== undefined ? partPointOf(p, angles, input.rotary) : p
      const d = input.rotary !== undefined ? toolAxisInPart(angles, input.rotary) : { x: 0, y: 0, z: 1 }
      cutAt(c, tip, d)
    }
  }
  const restore = (to: number): void => {
    let best = 0
    for (const k of checkpoints.keys()) if (k <= to && k > best) best = k
    material.set(checkpoints.get(best)!)
    left = leftAt.get(best)!
    done = best
    partial = -1
  }
  const advanceTo = (seconds: number): boolean => {
    const before = left
    let restored = false
    // The move playing at `seconds` and how far into it.
    let target = 0
    while (target < moves.length && moves[target]!.start + moves[target]!.duration <= seconds) target++
    const playing = moves[target]
    const fraction = playing !== undefined && playing.duration > 0 ? Math.max(0, Math.min(1, (seconds - playing.start) / playing.duration)) : 0
    if (target < done || (target === done && partial > fraction)) { restore(target); restored = true }
    else if (partial >= 0 && target > done) {
      // The move that was partly cut: finish it before going on (idempotent: a cut voxel stays cut).
      cutMove(moves[done]!, partial, 1)
      done++
      partial = -1
      if (done % every === 0 && !checkpoints.has(done)) { checkpoints.set(done, material.slice()); leftAt.set(done, left) }
    }
    while (done < target) {
      cutMove(moves[done]!, 0, 1)
      done++
      if (done % every === 0 && !checkpoints.has(done)) { checkpoints.set(done, material.slice()); leftAt.set(done, left) }
    }
    if (playing !== undefined && fraction > 0 && target === done) { cutMove(playing, Math.max(0, partial), fraction); partial = fraction }
    return restored || left !== before
  }
  const surface = () => {
    const pos: number[] = [], nor: number[] = []
    const at = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && material[(k * ny + j) * nx + i] === 1
    const quad = (corners: ReadonlyArray<readonly [number, number, number]>, normal: readonly [number, number, number]) => {
      for (const idx of [0, 1, 2, 0, 2, 3]) { const c = corners[idx]!; pos.push(c[0], c[1], c[2]); nor.push(normal[0], normal[1], normal[2]) }
    }
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (material[(k * ny + j) * nx + i] !== 1) continue
      const x0 = min.x + i * voxel, x1 = x0 + voxel, y0 = min.y + j * voxel, y1 = y0 + voxel, z0 = min.z + k * voxel, z1 = z0 + voxel
      if (!at(i + 1, j, k)) quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0])
      if (!at(i - 1, j, k)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0])
      if (!at(i, j + 1, k)) quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0])
      if (!at(i, j - 1, k)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0])
      if (!at(i, j, k + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
      if (!at(i, j, k - 1)) quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1])
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor) }
  }
  const cell = voxel ** 3
  return {
    origin: min, voxel, nx, ny, nz, material, advanceTo, surface,
    removedVolume: () => (total - left) * cell, remainingVolume: () => left * cell
  }
}
