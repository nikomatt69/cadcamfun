/**
 * Bench workloads of the exact CAD kernel (spec 58 T4): a 50-feature plate (36 sketches, a base extrude, 12 holes). `full` replays the
 * whole history each run; `resumed` edits the last hole's diameter and replays through the stage cache, so only the dirty feature runs.
 * Both return a topology checksum (faces + edges) so the work cannot be skipped. The mesh rebuild of each variant is done once, outside the timing
 * (the mesh replay is not incremental yet: it is the dominant remaining cost of an edit, see spec 58 T4).
 */
import { newExactStageCache, rebuildExact } from "../../src/cad/history-brep.ts"
import { rebuild, type Feature, type History } from "../../src/cad/history.ts"

/**
 * 50 features: the base sketch and extrude, 12 holes (solid-changing), and 36 sketches that a model of this size carries (one per
 * pad, pocket or reference): they cost the exact replay nothing but are part of the history every edit has to get through.
 */
const plate = (lastDiameter: number): History => {
  const features: Feature[] = [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 120, height: 80 }] } } as Feature,
    { id: "plate", type: "extrude", sketch: "s", depth: "thick", operation: "new" } as Feature
  ]
  for (let i = 0; i < 36; i++) {
    features.push({ id: `ref${i}`, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "c", kind: "circle", at: [5 + i, 5], diameter: 2 }] } } as Feature)
  }
  for (let i = 0; i < 12; i++) {
    features.push({ id: `h${i}`, type: "hole", plane: "XY", offset: "thick", at: [15 + (i % 4) * 28, 15 + Math.floor(i / 4) * 25], diameter: i === 11 ? lastDiameter : 4, depth: "thick" } as Feature)
  }
  return { parameters: { thick: 10 }, features }
}

const MESH = new Map<number, { readonly history: History; readonly result: ReturnType<typeof rebuild> }>()
const variant = (lastDiameter: number) => {
  let v = MESH.get(lastDiameter)
  if (v === undefined) { const history = plate(lastDiameter); v = { history, result: rebuild(history) }; MESH.set(lastDiameter, v) }
  return v
}

const topologyOf = (lastDiameter: number, cache?: ReturnType<typeof newExactStageCache>): number => {
  const { history, result } = variant(lastDiameter)
  const exact = rebuildExact(history, result, cache === undefined ? {} : { cache })
  const brep = exact.bodies[0]?.brep
  if (brep === undefined) throw new Error(`bench input has no exact model: ${exact.bodies[0]?.reason}`)
  return brep.faces.length + brep.edges.length
}

let primed: ReturnType<typeof newExactStageCache> | undefined
let flip = 0

export const CAD_KERNEL_WORKLOADS: Readonly<Record<string, () => number>> = {
  "history.exact-50-features-full": () => topologyOf(4 + (flip++ % 2)),
  "history.exact-50-features-resumed": () => {
    if (primed === undefined) { primed = newExactStageCache(); topologyOf(4, primed) }
    return topologyOf(5 + (flip++ % 2), primed)
  }
}
