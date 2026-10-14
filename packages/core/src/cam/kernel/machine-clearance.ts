/**
 * Continuous clearance of the tool assembly from the machine table over the NC (spec 29 §12 "check swept machine motion"). Each
 * linear or arc move of the replayed NC moves the spindle nose; the flutes, shank and holder hang from it and are checked against
 * the table by `checkMotion`, between the start and the end of the move, not only at its end points.
 *
 *   linear / rapid  one move from the previous point to this one
 *   arc             chords whose sagitta is at most `ARC_SAGITTA` mm; the clearance is then required to exceed that sagitta
 *   rotary          moves with A/B/C words are not modelled (the table is fixed here): reported, never passed as clear
 *
 * The stock is not an obstacle here: the height-field replay already checks the cutter against the material, and the stock box
 * would flag every normal cut of a flute. The table is the fixture the tool can reach past the stock's bottom.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import { checkMotion, linearScene, tableBox } from "./collision.ts"
import type { Cutter } from "./cutters.ts"

/** The table as the machine has it: its footprint centred on (`cx`, `cy`) in work coordinates, its top at `top`. */
export interface TableGeometry {
  readonly cx: number
  readonly cy: number
  readonly top: number
  readonly length: number
  readonly width: number
}

/** The largest chord sagitta of an arc, mm: the arc is checked as chords that stay within it of the arc. */
export const ARC_SAGITTA = 0.01

export interface ClearanceFinding {
  readonly line: number
  /** The spindle nose at the point where the move was found to overlap, machine (= work) coordinates. */
  readonly point: Vec3
  readonly clearance: number
}

export interface ClearanceResult {
  /** Moves checked (chords for arcs). */
  readonly checked: number
  /** Moves with A/B/C words, which the fixed table does not model. */
  readonly rotaryMoves: number
  /** Moves that could not be proven clear within the subdivision depth. */
  readonly unresolved: number
  /** Smallest certified clearance over the clear moves, mm; `undefined` when no move was checked. */
  readonly minClearance?: number
  /** First overlap, in NC order. */
  readonly first?: ClearanceFinding
}

const arcChords = (s: Extract<GSegment, { kind: "arc" }>): Vec3[] => {
  const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
  const a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
  let sweep = a1 - a0
  // G2 (clockwise) sweeps negative, G3 positive; coincident end points are a full circle.
  if (Math.abs(sweep) < 1e-12) sweep = s.clockwise ? -2 * Math.PI : 2 * Math.PI
  else if (s.clockwise) { while (sweep >= 0) sweep -= 2 * Math.PI } else { while (sweep <= 0) sweep += 2 * Math.PI }
  const r = Math.max(s.radiusStart, s.radiusEnd, 1e-9)
  const step = r > ARC_SAGITTA ? 2 * Math.acos(1 - ARC_SAGITTA / r) : Math.abs(sweep)
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / step))
  const out: Vec3[] = []
  for (let k = 0; k <= n; k++) {
    const f = k / n
    const th = a0 + sweep * f
    const rr = s.radiusStart + (s.radiusEnd - s.radiusStart) * f
    out.push(k === 0 ? s.from : k === n ? s.to : { x: s.center.x + rr * Math.cos(th), y: s.center.y + rr * Math.sin(th), z: s.from.z + (s.to.z - s.from.z) * f })
  }
  return out
}

/** Check every motion of the replayed NC against the table. `cutterOf` gives the cutter active at an NC line (undefined: skipped). */
export const checkNcClearance = (
  segments: ReadonlyArray<GSegment>,
  cutterOf: (line: number) => Cutter | undefined,
  table: TableGeometry,
  options: { readonly maxDepth?: number } = {}
): ClearanceResult => {
  const obstacles = [tableBox(table.cx, table.cy, table.top, table.length, table.width, 200)]
  let checked = 0, rotaryMoves = 0, unresolved = 0
  let minClearance: number | undefined
  let first: ClearanceFinding | undefined
  for (const s of segments) {
    if (s.kind === "dwell") continue
    if (s.kind !== "arc" && s.rotary !== undefined && Object.keys(s.rotary).length > 0) rotaryMoves++
    const cutter = cutterOf(s.line)
    if (cutter === undefined) continue
    const scene = linearScene(cutter, obstacles)
    // A chord is checked with the spindle nose at the stick-out above its tip; the arc's sagitta is the margin it must keep.
    const margin = s.kind === "arc" ? ARC_SAGITTA : 0
    const points: Vec3[] = s.kind === "arc" ? arcChords(s) : [s.from, s.to]
    const nose = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z + cutter.stickout })
    for (let k = 1; k < points.length; k++) {
      const from = points[k - 1]!, to = points[k]!
      const r = checkMotion(scene, { tilt: 0, c: 0, nose: nose(from) }, { tilt: 0, c: 0, nose: nose(to) }, { margin, ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}) })
      checked++
      if (r.verdict === "collision") {
        const at = r.at ?? 0
        const point = { x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at, z: from.z + (to.z - from.z) * at }
        first ??= { line: s.line, point, clearance: r.clearance }
      } else if (r.verdict === "unresolved") unresolved++
      else minClearance = minClearance === undefined ? r.clearance : Math.min(minClearance, r.clearance)
    }
  }
  return { checked, rotaryMoves, unresolved, ...(minClearance !== undefined ? { minClearance } : {}), ...(first !== undefined ? { first } : {}) }
}
