/**
 * Swarf (flank) milling (spec 51 F4): a ruled wall (a cone, a cylinder or a plane) is cut with the **side** of the cutter. The
 * wall is a family of straight rulings; the cutter's axis is laid along a ruling and moved away from the wall by the cutter radius
 * along the wall's normal, so the cutter's flank touches the wall along the whole ruling at once. One pass cuts the wall as high as
 * the flutes are long; a taller wall takes several passes up the ruling.
 *
 * A wall is given as its rulings (`SwarfWall`): per ruling the two ends on the wall and the outward normal. The tool axis of a ruling
 * is the ruling itself, so for a cone it leans with the wall (the table tilts along the rail) and for a cylinder it stays parallel to
 * the axis. Between two rulings the controller moves the tip and the axis linearly: the rulings are as close as the chord tolerance
 * asks, so the flank stays within it of the wall everywhere (a tilted flank on a developable wall is exact at the rulings).
 *
 * Gouge: the cutter body, shrunk by 0.02 mm so that the contact line itself is not counted, must stay out of the material of the part
 * at every sample (a neighbouring wall or a feature in the way); a sample that fails is left out and counted. A wall that is concave
 * with a radius smaller than the cutter's is refused: the flank cannot lie against it.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { solveOrientation, tipPosition, type FiveAxisKinematic } from "../five-axis.ts"
import type { RotaryAngles } from "../indexing.ts"
import type { TriangleSoup } from "../model/mesh-queries.ts"
import type { Tool } from "../tool.ts"
import type { MultiaxisParams, Sample } from "./multiaxis.ts"

export interface SwarfWall {
  /** Ruling ends on the wall, low end first (the tool axis points from the low end to the high end). Same length as `top`. */
  readonly bottom: ReadonlyArray<Vec3>
  readonly top: ReadonlyArray<Vec3>
  /** Outward unit normal of the wall (into the air) at each ruling. */
  readonly normal: ReadonlyArray<Vec3>
  /** Smallest radius of curvature of a concave wall across its rulings, mm; absent for a convex or planar wall. */
  readonly concaveRadius?: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: Vec3): Vec3 => mul(a, 1 / len(a))

/** The cutter body is checked this much inside its radius, mm, so the contact line with the wall is not a gouge. */
const SHRINK = 0.02

/** A cutter axis the table has turned to `angles`, carried continuously from the previous sample (the table may wind past ±180 degrees). */
const unwrapC = (angles: RotaryAngles, previous: RotaryAngles | undefined, k: FiveAxisKinematic): RotaryAngles | undefined => {
  if (previous === undefined) return angles
  const [lo, hi] = k.limits.rotation ?? [-180, 180]
  let c = angles.c
  while (c - previous.c > 180) c -= 360
  while (c - previous.c < -180) c += 360
  return c < lo - 1e-9 || c > hi + 1e-9 ? undefined : { ...angles, c }
}

/** The cutter as the kernel's library describes it: the flutes cut the band, the shank and the holder must stay out of the part. */
export interface SwarfCutter {
  readonly fluteLength: number
  readonly shankDiameter: number
  readonly stickout: number
  readonly holder?: { readonly diameter: number; readonly length: number }
}

export interface SwarfStats {
  lines: number
  skipped: number
  /** Poses left out because the shank or the holder would be inside the part (counted in `skipped` too). */
  collided?: number
}

/** The sections (one per pass up a wall) of the samples that cut `walls` with the side of `tool`, or why none could be cut in `warnings`. */
export const swarfSections = (
  walls: ReadonlyArray<SwarfWall>, params: MultiaxisParams, tool: Tool, soup: TriangleSoup, k: FiveAxisKinematic, stats: SwarfStats, warnings: string[], cutter?: SwarfCutter
): Sample[][] => {
  const R = tool.diameter / 2
  const out: Sample[][] = []
  walls.forEach((wall, wi) => {
    const name = `wall ${wi + 1}`
    if (wall.bottom.length < 2 || wall.bottom.length !== wall.top.length || wall.normal.length !== wall.bottom.length) {
      warnings.push(`${name}: a wall needs at least two rulings with an end, a top and a normal each`)
      return
    }
    if (tool.kind === "ballnose") { warnings.push(`${name}: a ball nose cutter has no straight flank; use an end mill`); return }
    if (wall.concaveRadius !== undefined && R > wall.concaveRadius - 1e-3) {
      warnings.push(`${name}: the wall is concave with a radius of ${wall.concaveRadius.toFixed(2)} mm, smaller than the cutter (${R.toFixed(2)} mm): the flank cannot lie against it`)
      return
    }
    const rulings = wall.bottom.map((b, i) => {
      const t = wall.top[i]!
      const dir = unit(sub(t, b))
      // The normal of the wall is square to its ruling: remove any trace of the ruling from it.
      const n = unit(sub(wall.normal[i]!, mul(dir, dot(wall.normal[i]!, dir))))
      return { b, dir, n, length: len(sub(t, b)) }
    })
    const shortest = Math.min(...rulings.map((r) => r.length))
    // Flutes: `flute` radii long; a taller wall is cut in bands that overlap by a fifth.
    const cutLength = Math.min(shortest, cutter !== undefined ? cutter.fluteLength : params.flute * R)
    const bands = shortest <= cutLength + 1e-9 ? 1 : Math.ceil((shortest - cutLength) / (0.8 * cutLength)) + 1
    for (let band = 0; band < bands; band++) {
      const reverse = !params.oneWay && band % 2 === 1
      const order = reverse ? [...rulings.keys()].reverse() : [...rulings.keys()]
      let run: Sample[] = []
      let previous: RotaryAngles | undefined
      stats.lines += 1
      const flush = (): void => { if (run.length > 0) out.push(run); run = []; previous = undefined }
      for (const i of order) {
        const r = rulings[i]!
        const along = bands === 1 ? 0 : (band * (r.length - cutLength)) / (bands - 1)
        const tip = add(add(r.b, mul(r.dir, along)), mul(r.n, R))
        const solved = solveOrientation(r.dir, k)
        let angles = solved === undefined ? undefined : unwrapC(solved, previous, k)
        // The table cannot wind further: the pass ends here, the tool retracts and the table unwinds, and the pass resumes from the principal angle.
        if (solved !== undefined && angles === undefined) { flush(); angles = solved }
        // The body of the cutter, shrunk: nothing of the part may be inside it.
        const seed: Vec3 = Math.abs(r.dir.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
        const u = unit(cross(r.dir, seed)), v = cross(r.dir, u)
        let free = angles !== undefined
        for (const h of [0.05, 0.5, 1]) {
          const centre = add(tip, mul(r.dir, h * cutLength))
          for (let a = 0; a < 8 && free; a++) {
            const ang = (a * Math.PI) / 4
            const q = add(centre, add(mul(u, (R - SHRINK) * Math.cos(ang)), mul(v, (R - SHRINK) * Math.sin(ang))))
            if (soup.inside(q)) free = false
          }
        }
        // Above the flutes: the shank, and the holder past the stickout, with the part's material nowhere inside them.
        let collides = false
        if (free && cutter !== undefined) {
          const ring = (h: number, radius: number): boolean => {
            const centre = add(tip, mul(r.dir, h))
            for (let a = 0; a < 8; a++) {
              const ang = (a * Math.PI) / 4
              if (soup.inside(add(centre, add(mul(u, radius * Math.cos(ang)), mul(v, radius * Math.sin(ang)))))) return true
            }
            return false
          }
          // A shank as wide as the flutes is their continuation, lying against the wall along the same line: shrunk like the flutes, so touching is not a collision.
          const shank = cutter.shankDiameter / 2 - SHRINK
          for (const f of [0.05, 0.35, 0.7, 1]) if (!collides && ring(cutter.fluteLength + f * Math.max(0, cutter.stickout - cutter.fluteLength), shank)) collides = true
          if (cutter.holder !== undefined) for (const f of [0, 0.35, 0.7, 1]) if (!collides && ring(cutter.stickout + f * cutter.holder.length, cutter.holder.diameter / 2)) collides = true
          if (collides) stats.collided = (stats.collided ?? 0) + 1
        }
        if (!free || collides || angles === undefined) {
          stats.skipped += 1
          flush()
          continue
        }
        previous = angles
        run.push({ point: tip, angles, tip: tipPosition(tip, angles, k), leaned: false })
      }
      flush()
    }
  })
  return out
}
