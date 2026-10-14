/**
 * Continuous clearance of the tool assembly from the machine table over the NC (spec 29 §12 "check swept machine motion"). Each
 * linear or arc move of the replayed NC is checked between its start and its end, not only at the end points: the spindle nose
 * moves on the linear axes and the flutes, shank and holder hang from it (`linearScene`).
 *
 *   linear / rapid  one move from the previous point to this one
 *   arc             chords whose sagitta is at most `ARC_SAGITTA` mm; the clearance is then required to exceed that sagitta
 *   rotary          moves that change the A/B/C words are counted and not checked: the rotating part body is not modelled here
 *                   (a turning box needs an exact cylinder-to-box distance; the capsules of the probes over-approximate a flat
 *                   end too much to decide it), so the claim stays unsupported rather than passed
 *
 * The stock is not an obstacle: the height-field replay already checks the cutter against the material with the exact tool
 * profile, and a stock box would flag every normal cut of a flute. The table is the fixture the tool can reach past the stock's bottom.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import { checkMotion, linearScene, tableBox, type Pose } from "./collision.ts"
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
  /** Linear and arc moves checked (chords for arcs). */
  readonly checked: number
  /** Moves that change the A/B/C words. They are not checked (see the module note). */
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

/** The table angles a segment carries: linear and rapid moves only (an arc and a dwell carry none). */
const rotaryOf = (s: GSegment): { readonly a?: number; readonly b?: number; readonly c?: number } | undefined =>
  s.kind === "linear" || s.kind === "rapid" ? s.rotary : undefined

/** Whether a segment changes the table angles it carries (a segment without rotary words keeps the angles in force). */
const turnsTable = (s: GSegment, angles: { readonly a?: number; readonly b?: number; readonly c?: number }): boolean => {
  const r = rotaryOf(s)
  if (r === undefined) return false
  return (r.a ?? 0) !== (angles.a ?? 0) || (r.b ?? 0) !== (angles.b ?? 0) || (r.c ?? 0) !== (angles.c ?? 0)
}

/** Check every linear and arc move of the replayed NC against the table. `cutterOf` gives the cutter active at an NC line. */
export const checkNcClearance = (
  segments: ReadonlyArray<GSegment>,
  cutterOf: (line: number) => Cutter | undefined,
  table: TableGeometry,
  options: { readonly maxDepth?: number } = {}
): ClearanceResult => {
  const obstacles = [tableBox(table.cx, table.cy, table.top, table.length, table.width, 200)]
  const depth = options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}
  let checked = 0, rotaryMoves = 0, unresolved = 0
  let minClearance: number | undefined
  let first: ClearanceFinding | undefined
  let angles: { a?: number; b?: number; c?: number } = {}
  for (const s of segments) {
    if (s.kind === "dwell") continue
    const turns = turnsTable(s, angles)
    const r = rotaryOf(s)
    if (r !== undefined) angles = { ...(r.a !== undefined ? { a: r.a } : {}), ...(r.b !== undefined ? { b: r.b } : {}), ...(r.c !== undefined ? { c: r.c } : {}) }
    // A move that turns the table, or runs with the table already turned, is not checked: the table box is fixed in the machine.
    if (turns || (angles.a ?? 0) !== 0 || (angles.b ?? 0) !== 0 || (angles.c ?? 0) !== 0) { rotaryMoves++; continue }
    const cutter = cutterOf(s.line)
    if (cutter === undefined) continue
    const scene = linearScene(cutter, obstacles)
    const nose = (p: Vec3): Pose => ({ tilt: 0, c: 0, nose: { x: p.x, y: p.y, z: p.z + cutter.stickout } })
    // A chord is checked with the spindle nose at the stick-out above its tip; the arc's sagitta is the margin it must keep.
    const margin = s.kind === "arc" ? ARC_SAGITTA : 0
    const points: Vec3[] = s.kind === "arc" ? arcChords(s) : [s.from, s.to]
    for (let k = 1; k < points.length; k++) {
      const from = points[k - 1]!, to = points[k]!
      const r = checkMotion(scene, nose(from), nose(to), { margin, ...depth })
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
