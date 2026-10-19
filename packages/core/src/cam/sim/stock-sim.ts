/**
 * The stock as the program removes it (spec 32 §4.5, tier S1): a height field over the stock, one
 * column per cell, the column's top being the material that is left.
 *
 * Exact for 3-axis work with a vertical tool — the same model the verifier uses, so the preview and
 * the report give the same numbers — and cheap enough to replay a whole program while the playhead
 * moves. A rotary mill, a lathe and a printer are not simulated here: the lathe has its turned
 * profile, the printer its layers.
 */
import { HeightField, type CuttingProfile } from "../verify/heightfield.ts"
import { forEachSample } from "../verify/path.ts"
import type { P3 } from "../testing/gcode-interpreter.ts"

/** What the simulation needs of a cutter: its radius and the shape of its cutting surface. */
export type SimCutter = CuttingProfile

export interface StockBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/** A move of the program, as the simulation replays it. */
export interface SimMove {
  readonly rapid: boolean
  readonly from: P3
  readonly to: P3
  /** Present for arcs. */
  readonly center?: { readonly x: number; readonly y: number }
  readonly clockwise?: boolean
}

/** The remaining stock as a mesh: the top surface of the columns, as a grid. */
export interface StockMesh {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
  /** The cell size, mm. */
  readonly cell: number
  /** The grid's origin (the centre of the first cell), mm. */
  readonly minX: number
  readonly minY: number
}

/** The part of a move up to a fraction of it: where the tool has been. */
const partial = (move: SimMove, fraction: number): SimMove => {
  if (fraction >= 1) return move
  const f = Math.max(0, fraction)
  const to: P3 = move.center === undefined
    ? { x: move.from.x + (move.to.x - move.from.x) * f, y: move.from.y + (move.to.y - move.from.y) * f, z: move.from.z + (move.to.z - move.from.z) * f }
    : { ...pointOnArc(move, f) }
  return { rapid: move.rapid, from: move.from, to, ...(move.center !== undefined ? { center: move.center, clockwise: move.clockwise } : {}) }
}

/** The point at a fraction of an arc: the radius and the angle interpolate like the sampling does. */
const pointOnArc = (move: SimMove, f: number): P3 => {
  const c = move.center!
  const r0 = Math.hypot(move.from.x - c.x, move.from.y - c.y)
  const r1 = Math.hypot(move.to.x - c.x, move.to.y - c.y)
  const a0 = Math.atan2(move.from.y - c.y, move.from.x - c.x)
  const a1 = Math.atan2(move.to.y - c.y, move.to.x - c.x)
  let sweep = move.clockwise === true ? a0 - a1 : a1 - a0
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
  const a = a0 + (move.clockwise === true ? -1 : 1) * sweep * f
  const r = r0 + (r1 - r0) * f
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: move.from.z + (move.to.z - move.from.z) * f }
}

/**
 * The stock of a program, cut as the program runs.
 *
 * The class holds the height field; `StockSimulation` (in `simulation.ts`) drives it along a
 * timeline, with the checkpoints that make scrubbing back possible.
 */
export class StockSim {
  readonly field: HeightField
  private readonly initial: Float64Array

  constructor(readonly bounds: StockBounds, cell: number) {
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY
    const nx = Math.max(1, Math.ceil(width / cell))
    const ny = Math.max(1, Math.ceil(height / cell))
    this.field = new HeightField(nx, ny, bounds.minX, bounds.minY, width, height, bounds.minZ, bounds.maxZ)
    this.initial = Float64Array.from(this.field.top)
  }

  /** The cell size the stock was built with, mm. */
  get cell(): number {
    return this.field.cellX
  }

  /** The volume removed so far, mm³ (the stock that is no longer there). */
  get removedVolume(): number {
    return this.stockVolume - this.field.volume()
  }

  /** The volume of the whole stock, mm³. */
  get stockVolume(): number {
    return this.field.width * this.field.height * (this.field.ceiling - this.field.floor)
  }

  /** Counts the changes of the stock, so a viewer knows when to redraw it. */
  version = 0

  /**
   * Cuts one move with the tool and returns the removed volume, mm³. Only the first `fraction` of
   * the move is cut, so the live preview can show the material as the tool advances.
   */
  cut(move: SimMove, tool: SimCutter, step: number, fraction = 1): number {
    if (fraction <= 0 || tool.radius <= 0) return 0
    let removed = 0
    forEachSample(partial(move, fraction), step, (x, y, z) => { removed += this.field.cut(tool, x, y, z) })
    if (removed > 0) this.version++
    return removed
  }

  /** The volume of material left, mm³. */
  volume(): number {
    return this.field.volume()
  }

  /** A copy of the column tops: a checkpoint the simulation can come back to. */
  snapshot(): Float64Array {
    return Float64Array.from(this.field.top)
  }

  /** Restores the column tops of a checkpoint. */
  restore(top: Float64Array): void {
    const current = this.field.top
    let changed = false
    for (let k = 0; k < current.length; k++) {
      if (current[k] !== top[k]) { changed = true; break }
    }
    if (!changed) return
    current.set(top)
    this.version++
  }

  /** Puts the whole stock back. */
  reset(): void {
    this.restore(this.initial)
  }

  /** The remaining stock as a mesh: the top surface of the columns. */
  mesh(): StockMesh {
    const { nx, ny } = this.field
    const positions = new Float32Array(nx * ny * 3)
    const normals = new Float32Array(nx * ny * 3)
    this.writeMesh(positions, normals)
    const indices = new Uint32Array((nx - 1) * (ny - 1) * 6)
    let at = 0
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i
        indices[at++] = a
        indices[at++] = a + 1
        indices[at++] = a + nx
        indices[at++] = a + 1
        indices[at++] = a + nx + 1
        indices[at++] = a + nx
      }
    }
    return { positions, normals, indices, cell: this.field.cellX, minX: this.field.minX, minY: this.field.minY }
  }

  /**
   * Writes the top surface of the columns into the caller's arrays (the same shape as `mesh`'s), so
   * a viewer can update its geometry without allocating on every frame.
   */
  writeMesh(positions: Float32Array, normals: Float32Array): void {
    const { nx, ny } = this.field
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        positions[k * 3] = this.field.centreX(i)
        positions[k * 3 + 1] = this.field.centreY(j)
        positions[k * 3 + 2] = this.field.top[k]!
      }
    }
    // Normals from the neighbouring columns: the surface's slope, so the light shows the cut.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        const left = this.field.top[j * nx + Math.max(0, i - 1)]!
        const right = this.field.top[j * nx + Math.min(nx - 1, i + 1)]!
        const down = this.field.top[Math.max(0, j - 1) * nx + i]!
        const up = this.field.top[Math.min(ny - 1, j + 1) * nx + i]!
        const dzdx = (right - left) / (2 * this.field.cellX)
        const dzdy = (up - down) / (2 * this.field.cellY)
        const length = Math.hypot(dzdx, dzdy, 1)
        normals[k * 3] = -dzdx / length
        normals[k * 3 + 1] = -dzdy / length
        normals[k * 3 + 2] = 1 / length
      }
    }
  }
}
