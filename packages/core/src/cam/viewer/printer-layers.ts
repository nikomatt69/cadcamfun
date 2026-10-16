/**
 * What a printer has deposited (spec 31 §5.4): the extruding moves of the timeline as beads, their layers, and what was laid
 * down by time t. Travel (no filament) and retractions are kept apart so the preview draws them differently.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { pointOn, type Timeline } from "./timeline.ts"

export interface Bead {
  readonly from: Vec3
  readonly to: Vec3
  readonly start: number
  readonly end: number
  /** Index of the layer (`layers`) the bead belongs to. */
  readonly layer: number
  readonly move: number
}

export interface Deposits {
  readonly beads: ReadonlyArray<Bead>
  /** Distinct heights of extruding moves, ascending. */
  readonly layers: ReadonlyArray<number>
  /** Moves of the timeline that travel without extruding. */
  readonly travels: ReadonlyArray<number>
}

/** Heights closer than this are one layer (float noise of the slicer); a spiral (vase) is quantised to `vaseStep`. */
const LAYER_EPS = 1e-3

export const printerDeposits = (timeline: Timeline, vaseStep = 0.2): Deposits => {
  const extruding = timeline.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "feed" && m.state.extrude > 1e-9)
  const travels = timeline.moves.flatMap((m, i) => (m.kind !== "dwell" && m.state.extrude <= 1e-9 ? [i] : []))
  // A spiral prints at a different Z on every move: quantise to the layer step instead of making thousands of layers.
  const distinct = new Set(extruding.map(({ m }) => Math.round(m.to.z / LAYER_EPS)))
  const quantum = distinct.size > 5000 ? Math.max(vaseStep, LAYER_EPS) : LAYER_EPS
  const key = (z: number) => Math.round(z / quantum)
  const keys = [...new Set(extruding.map(({ m }) => key(Math.max(m.from.z, m.to.z))))].sort((a, b) => a - b)
  const layerOf = new Map(keys.map((k, i) => [k, i]))
  return {
    beads: extruding.map(({ m, i }) => ({ from: m.from, to: m.to, start: m.start, end: m.start + m.duration, layer: layerOf.get(key(Math.max(m.from.z, m.to.z)))!, move: i })),
    layers: keys.map((k) => k * quantum),
    travels
  }
}

/** The beads laid down by `seconds`, the one being printed cut at the nozzle; optionally only up to layer `maxLayer`. */
export const depositedAt = (deposits: Deposits, timeline: Timeline, seconds: number, maxLayer?: number): ReadonlyArray<{ readonly from: Vec3; readonly to: Vec3; readonly layer: number }> => {
  const out: Array<{ from: Vec3; to: Vec3; layer: number }> = []
  for (const bead of deposits.beads) {
    if (maxLayer !== undefined && bead.layer > maxLayer) continue
    if (bead.start >= seconds) break
    if (bead.end <= seconds) out.push({ from: bead.from, to: bead.to, layer: bead.layer })
    else {
      const move = timeline.moves[bead.move]!
      out.push({ from: bead.from, to: pointOn(move, (seconds - bead.start) / Math.max(1e-12, bead.end - bead.start)), layer: bead.layer })
    }
  }
  return out
}
