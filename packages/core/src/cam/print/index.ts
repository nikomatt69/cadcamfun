/**
 * The print slicer: triangle meshes in, a printable program out. The part is set on the plate, cut into layers
 * (`slice.ts`), each layer is turned into walls, skin, bridges, infill and supports (`plan.ts`, `support.ts`), the adhesion is
 * added, and `gcode.ts` writes it for the printer with retraction, cooling and speeds. The statistics (time, filament, size)
 * come from the program that is written, not from a rule of thumb.
 */
import type { PrinterSettings } from "../generator/printer-base.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import { meshBounds } from "../model/element-mesh.ts"
import { emitGcode } from "./gcode.ts"
import { bestOrientation, rotateMeshes } from "./orient.ts"
import { planLayers, planRaft } from "./plan.ts"
import { resolveProfile, type PrintProfile } from "./profile.ts"
import { meshVolume, printMeshIssue, printSolidIssue, sliceMesh } from "./slice.ts"
import { verifyPrint, type PrintCheck } from "./verify.ts"
import { planSupports } from "./support.ts"
import { repairMesh, type RepairOptions, type RepairReport } from "./repair.ts"
import type { PlannedLayer, PrintStats } from "./types.ts"
import type { Region } from "./geom.ts"

export * from "./bodies.ts"
export * from "./filament.ts"
export * from "./geom.ts"
export * from "./infill.ts"
export * from "./orient.ts"
export * from "./plan.ts"
export * from "./profile.ts"
export * from "./repair.ts"
export * from "./slice.ts"
export * from "./support.ts"
export type { Extrusion, PathKind, PlannedLayer, PrintStats } from "./types.ts"
export { emitGcode } from "./gcode.ts"
export * from "./verify.ts"

export interface PrintOptions {
  readonly onProgress?: (fraction: number, stage: string) => void
  /** Read between layers; a slice that sees it set stops with an `AbortError`. */
  readonly signal?: { readonly aborted: boolean }
  /**
   * Repair the meshes before slicing (weld, drop degenerate faces, make the winding consistent, close holes; see `repair.ts`).
   * Without it a mesh that is not a closed manifold is refused, as before.
   */
  readonly repair?: boolean | RepairOptions
}

export interface PrintResult {
  readonly gcode: string
  readonly stats: PrintStats
  /** Messages for the user: fit on the plate, overhangs, features too thin, open meshes. */
  readonly warnings: ReadonlyArray<string>
  readonly layers: ReadonlyArray<PlannedLayer>
  readonly orientation: string
  /** Checks of the program against the material it was cut from (plate, walls, skin, stray beads, filament). */
  readonly checks: ReadonlyArray<PrintCheck>
  /** The material of each printed model layer, bottom first, in bed coordinates. */
  readonly regions: ReadonlyArray<Region>
  readonly profile: PrintProfile
  /** One report per input mesh when `repair` was asked for. */
  readonly repairs: ReadonlyArray<RepairReport>
}

const boundsOfAll = (meshes: ReadonlyArray<Mesh64>): { min: [number, number, number]; max: [number, number, number] } => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes) {
    const b = meshBounds(m)
    for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, b.min[a]!); max[a] = Math.max(max[a]!, b.max[a]!) }
  }
  return { min, max }
}

const translate = (meshes: ReadonlyArray<Mesh64>, dx: number, dy: number, dz: number): Mesh64[] =>
  meshes.map((m) => {
    const p = Float64Array.from(m.positions)
    for (let k = 0; k < p.length; k += 3) { p[k] = p[k]! + dx; p[k + 1] = p[k + 1]! + dy; p[k + 2] = p[k + 2]! + dz }
    return { positions: p, indices: m.indices }
  })

/**
 * Sets the part down on the build plate: its lowest point goes to Z0 and it is centred on the plate (see `centerOnBed`). The CAD
 * model keeps its own coordinates; only the program uses the plate's.
 */
export const bedPlacement = (bounds: { min: ReadonlyArray<number>; max: ReadonlyArray<number> }, p: PrintProfile): { readonly dx: number; readonly dy: number; readonly dz: number; readonly note: string; readonly fits: boolean } => {
  const cx = (bounds.min[0]! + bounds.max[0]!) / 2
  const cy = (bounds.min[1]! + bounds.max[1]!) / 2
  const originX = p.bedOrigin === "center" ? 0 : p.bedWidth / 2
  const originY = p.bedOrigin === "center" ? 0 : p.bedDepth / 2
  const dx = p.centerOnBed ? originX - cx : p.bedOrigin === "center" ? -p.bedWidth / 2 : 0
  const dy = p.centerOnBed ? originY - cy : p.bedOrigin === "center" ? -p.bedDepth / 2 : 0
  const dz = -bounds.min[2]!
  const width = bounds.max[0]! - bounds.min[0]!
  const depth = bounds.max[1]! - bounds.min[1]!
  const fits = width <= p.bedWidth + 1e-9 && depth <= p.bedDepth + 1e-9
  const note = `; Part placed on the bed (XY zero: ${p.bedOrigin === "center" ? "plate centre" : "front-left corner"}): bottom at Z0${p.centerOnBed ? `, centred at X${(cx + dx).toFixed(3)} Y${(cy + dy).toFixed(3)}` : ""}`
  return { dx, dy, dz, note, fits }
}

/** Layers one print may have: a layer thinner than a hundredth of a millimetre on a tall part is a unit mistake, not a print. */
export const PRINT_MAX_LAYERS = 40_000
/**
 * Layers times the bead-wide cells of a layer's material (area / bead width squared): the planning and the evidence both cost
 * about this much. At 2e9 a slice takes a few minutes; past it the job cannot finish inside the kernel's deadline.
 */
export const PRINT_WORK_LIMIT = 2e9

/** Why a print this large cannot be sliced, or undefined: said before any layer is cut. */
export const printWorkIssue = (layers: number, area: number, beadWidth: number, layerHeight: number): string | undefined => {
  if (layers > PRINT_MAX_LAYERS) return `The part would take ${layers.toLocaleString("en-US")} layers of ${layerHeight} mm (the most is ${PRINT_MAX_LAYERS.toLocaleString("en-US")}): use a thicker layer`
  const work = layers * (area / (beadWidth * beadWidth))
  if (work > PRINT_WORK_LIMIT) return `The part is too large to slice in one job: ${layers.toLocaleString("en-US")} layers of about ${area.toFixed(0)} mm2 at a ${beadWidth} mm bead (${work.toExponential(1)} planning cells, the most is ${PRINT_WORK_LIMIT.toExponential(0)}): use a thicker layer or a wider nozzle, or print it in parts`
  return undefined
}

const layerStack = (height: number, p: PrintProfile): { tops: number[]; heights: number[] } => {
  if (!Number.isFinite(height) || height <= 0) throw new RangeError("The model height must be finite and positive")
  const first = Math.min(p.firstLayerHeight, height)
  const count = Math.max(1, Math.ceil((height - first) / p.layerHeight - 1e-6) + 1)
  if (count > PRINT_MAX_LAYERS) throw new RangeError(printWorkIssue(count, 1, 1, p.layerHeight)!)
  const tops: number[] = []
  const heights: number[] = []
  for (let i = 0; i < count; i++) {
    heights.push(i === 0 ? first : p.layerHeight)
    tops.push(i === 0 ? first : first + i * p.layerHeight)
  }
  // Slice the final slab inside the solid, even when a full nominal layer would miss it entirely.
  const last = count - 1
  tops[last] = height
  heights[last] = height - (tops[last - 1] ?? 0)
  if (last > 0 && heights[last]! < 0.04) {
    const shared = Math.min(p.layerHeight, (heights[last - 1]! + heights[last]!) / 2)
    tops[last - 1] = height - shared
    heights[last - 1] = tops[last - 1]! - (tops[last - 2] ?? 0)
    heights[last] = shared
  }
  return { tops, heights }
}

/** Slices meshes (CAD scene coordinates) into a program. Throws when the signal is aborted. */
export const slicePrint = (input: ReadonlyArray<Mesh64>, settings: PrinterSettings, options: PrintOptions = {}): PrintResult => {
  const profile = resolveProfile(settings)
  const warnings: string[] = []
  const notes: string[] = []
  const stage = (name: string, fraction: number): void => options.onProgress?.(fraction, name)
  if (input.length === 0) throw new Error("There is nothing to slice")
  const repairs: RepairReport[] = []
  const prepared: Mesh64[] = []
  for (let i = 0; i < input.length; i++) {
    let mesh = input[i]!
    if (options.repair !== undefined && options.repair !== false) {
      const malformed = printMeshIssue(mesh)
      if (malformed !== undefined) throw new RangeError(`Mesh ${i + 1}: ${malformed}`)
      const repaired = repairMesh(mesh, { ...(options.repair === true ? {} : options.repair), ...(options.signal ? { signal: options.signal } : {}) })
      repairs.push(repaired.report)
      if (repaired.report.status === "unrepairable") throw new RangeError(`Mesh ${i + 1} cannot be repaired: ${repaired.report.problems.join("; ")}`)
      if (repaired.report.status === "repaired") {
        const r = repaired.report
        warnings.push(`mesh ${i + 1} was repaired before slicing: ${[
          r.weldedVertices > 0 ? `${r.weldedVertices} vertices welded` : "", r.degenerateRemoved + r.duplicateRemoved + r.internalRemoved > 0 ? `${r.degenerateRemoved + r.duplicateRemoved + r.internalRemoved} faulty faces removed` : "",
          r.flippedTriangles > 0 ? `${r.flippedTriangles} faces re-oriented` : "", r.holesFilled > 0 ? `${r.holesFilled} hole(s) closed with ${r.holeTriangles} triangles` : ""
        ].filter((x) => x !== "").join(", ")}`)
      }
      if ((repaired.report.selfIntersections?.pairs ?? 0) > 0) warnings.push(`mesh ${i + 1}: ${repaired.report.selfIntersections!.pairs} triangle pair(s) cross each other; the slice treats the overlap as material`)
      mesh = repaired.mesh
    }
    const malformed = printSolidIssue(mesh)
    if (malformed !== undefined) throw new RangeError(`Mesh ${i + 1}: ${malformed}`)
    prepared.push(mesh)
  }

  let meshes: Mesh64[] = prepared
  let orientation = "as designed"
  if (profile.autoOrient) {
    const { chosen } = bestOrientation(meshes, profile.supportAngle)
    orientation = chosen.name
    if (chosen.name !== "as designed") {
      meshes = rotateMeshes(meshes, chosen.rotation)
      notes.push(`; Part turned onto its best face (${chosen.name}): overhang ${chosen.overhang.toFixed(0)} mm2, height ${chosen.height.toFixed(1)} mm`)
    }
  }
  const raw = boundsOfAll(meshes)
  const place = bedPlacement(raw, profile)
  meshes = translate(meshes, place.dx, place.dy, place.dz)
  notes.push(place.note)
  if (!place.fits) warnings.push(`the part (${(raw.max[0] - raw.min[0]).toFixed(1)} x ${(raw.max[1] - raw.min[1]).toFixed(1)} mm) does not fit the ${profile.bedWidth} x ${profile.bedDepth} mm bed`)
  const partHeight = raw.max[2] - raw.min[2]

  const { tops: modelTops, heights } = layerStack(partHeight, profile)
  // The part's mean cross-section (its volume over its height), never less than a tenth of its box: a box is not its material.
  const area = Math.max(meshes.reduce((v, m) => v + Math.abs(meshVolume(m)), 0) / Math.max(partHeight, 1e-9), 0.1 * (raw.max[0] - raw.min[0]) * (raw.max[1] - raw.min[1]))
  const tooLarge = printWorkIssue(modelTops.length + profile.raftLayers, area, profile.extrusionWidth, profile.layerHeight)
  if (tooLarge !== undefined) throw new RangeError(tooLarge)
  const raftCount = profile.raftLayers
  const raftHeights = Array.from({ length: raftCount }, (_, r) => (r === 0 ? Math.max(profile.layerHeight, 0.3) : profile.layerHeight))
  const raftTops: number[] = []
  raftHeights.reduce((sum, h) => { raftTops.push(sum + h); return sum + h }, 0)
  const lift = raftCount > 0 ? raftTops[raftTops.length - 1]! + 0.15 : 0
  if (partHeight + lift > profile.buildHeight + 1e-9) warnings.push(`the print is ${(partHeight + lift).toFixed(1)} mm tall; the printer builds ${profile.buildHeight} mm`)

  stage("slice", 0)
  const planes = modelTops.map((top, i) => top - heights[i]! / 2)
  const sliced = meshes.map((m) => sliceMesh(m, planes))
  const openRings = sliced.reduce((s, r) => s + r.openRings, 0)
  if (openRings > 0) warnings.push(`${openRings} outline(s) of the mesh could not be closed and were left out: the model has holes`)
  const regions: Region[] = planes.map((_, i) => sliced.flatMap((s) => s.regions[i] ?? []))
  if (regions.every((r) => r.length === 0)) throw new Error("The slice is empty: the model has no closed solid to print")
  // Trailing layers above the top of an uneven stack are empty; they are dropped.
  let lastFilled = regions.length - 1
  while (lastFilled > 0 && regions[lastFilled]!.length === 0) lastFilled--
  const keep = lastFilled + 1

  stage("supports", 0.2)
  const supports = planSupports(regions.slice(0, keep), profile, profile.support === "none")
  warnings.push(...supports.warnings)
  if (profile.support === "none" && supports.overhangArea > 4) warnings.push(`${supports.overhangArea.toFixed(0)} mm2 overhangs more than ${profile.supportAngle} degrees and is printed without support: turn supports on or change the orientation`)

  stage("layers", 0.3)
  const tops = modelTops.slice(0, keep).map((t) => t + lift)
  const planned = planLayers({
    regions: regions.slice(0, keep), tops, heights: heights.slice(0, keep), profile, supports, start: { x: 0, y: 0 },
    firstIndex: raftCount,
    ...(options.onProgress ? { onProgress: (f: number) => options.onProgress!(0.3 + f * 0.6, "layers") } : {}),
    ...(options.signal ? { signal: options.signal } : {})
  })
  warnings.push(...planned.warnings)
  const raft = raftCount > 0 ? planRaft(regions[0] ?? [], profile, raftTops, raftHeights, { x: 0, y: 0 }) : { layers: [] as PlannedLayer[] }
  const layers = [...raft.layers, ...planned.layers]

  stage("g-code", 0.9)
  const emitted = emitGcode({ layers, profile, notes: [...notes, ...warnings.map((w) => `Warning: ${w}`)] })
  stage("verify", 0.95)
  const checks = verifyPrint({ gcode: emitted.gcode, regions: regions.slice(0, keep), profile, firstModelLayer: raftCount, layers })
  stage("done", 1)
  return { gcode: emitted.gcode, stats: emitted.stats, warnings, layers, orientation, checks, regions: regions.slice(0, keep), profile, repairs }
}
