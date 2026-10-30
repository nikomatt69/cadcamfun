/**
 * Tri-dexel replay of an emitted program (spec 72 step 0.3, spec 69 B1): the stock the NC cuts, kept as rays in three directions,
 * compared with the part for the two verdicts the height field cannot give once the tool leaves +Z:
 *
 *   gouge   the program removed part material (the stock lost what the part has)
 *   left    the program left material beyond the part plus the finish allowance
 *
 * Every figure is true within `errorBound` (the ray lattice plus the sagitta between sampled poses), and the bound is the
 * threshold the verdict uses, so a deviation smaller than it is never reported and a "passed" never claims more than it measured.
 * A replay that did not see every move (budget stopped it, a move could not be placed, the part is an open mesh) is `complete:
 * false` and the caller must keep the claims `unresolved`.
 *
 * Pure: the same moves give the same verdict.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { PartDexels, TriDexel, comparePart, toolSolid, type Deviation, type ToolSolid } from "./tridexel.ts"

/** Most rays in the biggest of the three lattices: keeps the memory of the stock near 100 MB whatever the cell asked for. */
const MAX_RAYS = 600_000

/** The smallest cell that keeps every lattice of a box within `MAX_RAYS` rays. */
export const triCellFor = (extent: Vec3, wanted: number): number => {
  const faces = Math.max(extent.x * extent.y, extent.x * extent.z, extent.y * extent.z)
  return Math.max(wanted, Math.sqrt(faces / MAX_RAYS) * 1.001)
}

export interface TriVerdict {
  /** The replay saw every move and the part is a closed solid: the figures below are a verdict, not a sample. */
  readonly complete: boolean
  /** Why it is not complete, one line each. */
  readonly reasons: ReadonlyArray<string>
  /** The part mesh is a closed solid: a gouge seen on an open mesh may be the mesh's own hole. */
  readonly closedPart: boolean
  readonly cell: number
  readonly errorBound: number
  readonly gouge: Deviation
  readonly left: Deviation
  /** Stock volume that faces no part surface along any Z ray (uncut stock beside the part), mm³. */
  readonly detached: number
  readonly poses: number
}

export interface TriReplayOptions {
  readonly min: Vec3
  readonly max: Vec3
  readonly cell: number
  /** Cell visits the replay may spend (`poses x rays touched per pose`); over it the replay stops and is incomplete. */
  readonly budget: number
}

export class TriReplay {
  readonly stock: TriDexel
  private readonly solids = new Map<Cutter, ToolSolid>()
  private work = 0
  private stopped = false
  private readonly reasons: string[] = []

  constructor(private readonly options: TriReplayOptions) {
    this.stock = TriDexel.box(options.min, options.max, options.cell)
  }

  /** Mark the replay incomplete: a move it could not place in the part's frame, or a tool it does not know. */
  unchecked(reason: string): void {
    if (!this.reasons.includes(reason)) this.reasons.push(reason)
  }

  /** Remove the flutes of `cutter` along the tip points `tips` (tool axis up from each tip, +Z when absent). */
  cut(cutter: Cutter, tips: ReadonlyArray<Vec3>, axes?: ReadonlyArray<Vec3>): void {
    if (this.stopped || tips.length === 0) return
    let solid = this.solids.get(cutter)
    if (solid === undefined) { solid = toolSolid(cutter); this.solids.set(cutter, solid) }
    const step = this.stock.sampleStep(solid)
    let length = 0
    for (let i = 1; i < tips.length; i++) length += Math.hypot(tips[i]!.x - tips[i - 1]!.x, tips[i]!.y - tips[i - 1]!.y, tips[i]!.z - tips[i - 1]!.z)
    const reach = solid.maxRadius / this.stock.cell
    this.work += (length / step + tips.length) * 3 * (Math.PI * reach * reach + 1)
    if (this.work > this.options.budget) {
      this.stopped = true
      this.unchecked(`the tri-dexel replay stopped at its work budget (${this.options.budget.toExponential(0)} cell visits): the rest of the program is not checked`)
      return
    }
    this.stock.removePath(solid, tips, axes, step)
  }

  /**
   * Compare the replayed stock with the part. `allowance` is the finish stock the program leaves on purpose, mm; a deviation under
   * the declared error bound (plus the job tolerance) is below what the lattice can tell from noise and is not reported.
   */
  verdict(meshes: ReadonlyArray<Mesh64>, tolerance: number, allowance: number): TriVerdict {
    const part = PartDexels.fromMeshes(meshes, this.stock.min, { x: this.stock.min.x + this.stock.extent[0], y: this.stock.min.y + this.stock.extent[1], z: this.stock.min.z + this.stock.extent[2] }, this.stock.cell)
    const reasons = [...this.reasons]
    if (part.openRays > 0) reasons.push(`the part mesh is not closed (${part.openRays} rays cross it an odd number of times): the comparison ignores their last hit`)
    const bound = this.stock.errorBound
    const c = comparePart(this.stock, part, { allowance, threshold: tolerance + bound })
    return { complete: reasons.length === 0, reasons, closedPart: part.openRays === 0, cell: this.stock.cell, errorBound: bound, gouge: c.gouge, left: c.left, detached: c.detached, poses: this.stock.poses }
  }
}
