/**
 * How the simulated stock differs from the part it should become (spec 32 §4.5).
 *
 * Shared by the verifier and by the live simulation, so the numbers the preview shows and the numbers
 * the report gives are the same by construction, not by coincidence.
 *
 * A cell is a gouge when the machine cut below the finished surface (more than the tolerance) and
 * uncut when material is still above it. The comparison allows one cell of lateral slack: the
 * columns are sampled at their centres, so a wall is quantised to half a cell.
 */
import { EPS, HeightField } from "./heightfield.ts"

export interface DeviationResult {
  /** Per cell: the remaining material's top minus the part's top. Negative means the machine cut below the part. */
  readonly deviation: Float32Array
  /** The cells cut below the part by more than the tolerance. */
  readonly gougeCells: Uint8Array
  /** Volume cut below the part, mm³. */
  readonly gougeVolume: number
  /** The deepest cut below the part, mm. */
  readonly maxGouge: number
  /** Volume of material still above the part, mm³. */
  readonly uncutVolume: number
  /** The most material left above the part, mm. */
  readonly maxUncut: number
  /** The cells with material left above the part. */
  readonly uncutCells: Uint8Array
  /** The index of the worst gouge cell, or -1. */
  readonly worstIndex: number
}

/**
 * Compares the remaining stock in `field` with the finished part's top surface (`target`, one height
 * per column of the same field).
 */
export const deviationOf = (field: HeightField, target: Float64Array, tolerance: number): DeviationResult => {
  const around = field.neighbourhood(target)
  const area = field.cellArea
  const count = field.top.length
  const deviation = new Float32Array(count)
  const gougeCells = new Uint8Array(count)
  const uncutCells = new Uint8Array(count)
  let gouge = 0
  let maxGouge = 0
  let uncut = 0
  let maxUncut = 0
  let worst = -1
  for (let k = 0; k < count; k++) {
    const top = field.top[k]!
    const low = around.min[k]! - top
    const high = top - around.max[k]!
    deviation[k] = top - target[k]!
    if (low > tolerance) {
      gougeCells[k] = 1
      gouge += low * area
      if (low > maxGouge) { maxGouge = low; worst = k }
    }
    if (high > tolerance) {
      uncutCells[k] = 1
      uncut += high * area
      if (high > maxUncut) maxUncut = high
    }
  }
  return { deviation, gougeCells, gougeVolume: gouge, maxGouge, uncutVolume: uncut, maxUncut, uncutCells, worstIndex: worst }
}

/** Whether any column was cut below the part by more than the tolerance. */
export const hasGouge = (result: DeviationResult): boolean => result.gougeVolume > EPS
