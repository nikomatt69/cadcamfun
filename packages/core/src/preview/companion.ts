/**
 * Bounded preview payloads for the phone companion.
 *
 * The desktop kernel stays here: a drawing or component becomes a triangle mesh, and a toolpath becomes
 * coloured segments whose `line` is the 1-based G-code row they came from. The phone draws the payload.
 * It never receives the stored CAD document and it never runs this module.
 */
import type { Vec3 } from "../cad/vec.ts"
import { arcSweepBetween, expandMoves, moveTarget, type Program } from "../cam/ir.ts"
import type { CamArtifact } from "../cam/kernel/contracts.ts"
import type { Stock, ToolpathSettings } from "../cam/generator/schema.ts"
import { analyseGcode } from "../cam/generator/analysis.ts"
import { inferMachineKind } from "../cam/machine.ts"
import { findMachine } from "../cam/kernel/machines.ts"
import { elementMesh, type Element } from "../cam/model/element-mesh.ts"
import { displayPoint, displaySpinRate, spinSense } from "../cam/viewer/frames.ts"
import { checkCollisions, toolReachOf } from "../cam/viewer/collisions.ts"
import { checkSetup, collidingMoves } from "../cam/viewer/setup-checks.ts"
import { buildTimeline, programStart, type Timeline } from "../cam/viewer/timeline.ts"
import { parseToolpath, type ToolpathPoint } from "../cam/viewer/toolpath.ts"
import { tokenize, valuesOf } from "../cam/viewer/words.ts"
import { toolEnvelope, toolMachineOf, toolModelOf, type ToolModel, type ToolResource } from "../cam/tool-model.ts"
import { previewToolModel } from "../cam/operation-tools.ts"
import {
  choosePreviewMachine,
  finishBounds,
  freshBounds,
  grow,
  previewBodyBounds,
  previewCutterOf,
  previewMachineBlock,
  previewSetupOf,
  previewStockBounds,
  EMPTY_BOUNDS,
  type BoundsSink,
  type PreviewBounds,
  type PreviewCollisionEvent,
  type PreviewMachine,
  type PreviewOperation,
  type PreviewSpinRun,
} from "./machine.ts"

/** Hard cap so one part cannot fill the local network. */
export const MAX_PREVIEW_TRIANGLES = 80_000
/** One segment per motion block, capped the same way. */
export const MAX_PREVIEW_SEGMENTS = 20_000
/**
 * Bump when the payload a given revision produces changes (rounding, caps, arc expansion), so a phone holding an
 * entity tag of the old shape fetches the new one instead of being told nothing changed.
 */
export const PREVIEW_FORMAT = 4

/**
 * Mesh coordinates and normals travel rounded to 1e-5. The phone uploads them as float32, whose spacing is already
 * coarser than that above 64 mm, so the rounding is invisible; it roughly halves the JSON a dense part costs on Wi-Fi.
 */
const MESH_PRECISION = 1e5
const round = (value: number, scale: number): number => Math.round(value * scale) / scale

export interface MeshPart {
  readonly id: string
  readonly name: string
  /** Index of the first triangle in `indices` (three indices per triangle). */
  readonly triangleStart: number
  readonly triangleCount: number
}

export interface MeshPreview {
  readonly positions: readonly number[]
  readonly indices: readonly number[]
  readonly normals: readonly number[]
  readonly bounds: PreviewBounds
  readonly parts: readonly MeshPart[]
  readonly truncated: boolean
}

export interface PreviewParameter {
  readonly key: string
  readonly value: string
}

/** One feature of a parametric part, as the feature tree shows it. */
export interface PreviewFeature {
  readonly id: string
  readonly type: string
  /** The feature's own values: the numbers and names the tree shows next to it. */
  readonly parameters: ReadonlyArray<PreviewParameter>
}

/** The features one element is made of, in the order they were built. */
export interface PreviewFeatureTree {
  readonly elementId: string
  readonly name: string
  readonly features: ReadonlyArray<PreviewFeature>
}

/** The structural fields of a feature: the tree shows the values, not the model's wiring. */
const FEATURE_STRUCTURE = new Set(["id", "type", "sketch", "plane", "from", "entities", "constraints", "shapes", "history", "profiles"])

/** A feature's own values: the numbers and the parameter names it uses. */
const featureParameters = (feature: Record<string, unknown>): PreviewParameter[] => {
  const out: PreviewParameter[] = []
  for (const [key, value] of Object.entries(feature)) {
    if (FEATURE_STRUCTURE.has(key)) continue
    if (typeof value === "number" && Number.isFinite(value)) out.push({ key, value: String(value) })
    else if (typeof value === "string" && value.length > 0) out.push({ key, value })
    if (out.length >= 24) break
  }
  return out
}

/**
 * The feature trees of a drawing's parametric elements: what the part is made of, in the order it was built.
 *
 * The desktop shows this tree in the property panel; the phone shows the same list, so a part can be read on the
 * phone without the desktop. An element that is not parametric has no tree.
 */
export const featureTrees = (elements: readonly Element[]): PreviewFeatureTree[] => {
  const out: PreviewFeatureTree[] = []
  for (const element of elements) {
    const history = isRecord(element["history"]) ? element["history"] : undefined
    if (history === undefined) continue
    const features = Array.isArray(history["features"]) ? history["features"] : []
    const list: PreviewFeature[] = []
    for (const feature of features) {
      if (!isRecord(feature)) continue
      const type = typeof feature["type"] === "string" ? feature["type"] : "feature"
      list.push({
        id: typeof feature["id"] === "string" ? feature["id"] : type,
        type,
        parameters: featureParameters(feature),
      })
    }
    if (list.length === 0) continue
    out.push({
      elementId: label(element.id, "element"),
      name: label(element.name, label(element.type, "element")),
      features: list,
    })
  }
  return out
}

export type SegmentKind = "rapid" | "linear" | "circular"

export interface ToolpathSegment {
  readonly kind: SegmentKind
  /** 1-based source line. Program-only previews use the segment order when no G-code is stored. */
  readonly line: number
  readonly from: readonly [number, number, number]
  readonly to: readonly [number, number, number]
}

export interface ToolpathStats {
  readonly rapidMoves: number
  readonly linearMoves: number
  readonly circularMoves: number
  readonly machineFunctions: number
}

export interface ToolpathPreview {
  readonly segments: readonly ToolpathSegment[]
  readonly bounds: PreviewBounds
  readonly stock: PreviewBounds
  readonly truncated: boolean
  readonly stats: ToolpathStats
}

const EMPTY_STATS: ToolpathStats = { rapidMoves: 0, linearMoves: 0, circularMoves: 0, machineFunctions: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const label = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback

/** Elements of a stored drawing or component document. Objects keyed by id are accepted as well as arrays. */
export const elementsOfDocument = (data: unknown): Element[] => {
  if (!isRecord(data)) return []
  const read = (value: unknown): Element[] => {
    if (Array.isArray(value)) return value.filter(isRecord)
    if (isRecord(value)) return Object.values(value).filter(isRecord)
    return []
  }
  const direct = read(data.elements)
  if (direct.length > 0) return direct
  return isRecord(data.geometry) ? read(data.geometry.elements) : []
}

/** Read-only scalars a component detail can show. Nested `properties` are flattened in front. */
export const documentParameters = (data: unknown): PreviewParameter[] => {
  if (!isRecord(data)) return []
  const skipped = new Set(["elements", "geometry", "metadata", "id", "properties"])
  const source: Record<string, unknown> = isRecord(data.properties) ? { ...data, ...data.properties } : data
  const out: PreviewParameter[] = []
  for (const [key, value] of Object.entries(source)) {
    if (skipped.has(key)) continue
    if (typeof value === "number" && Number.isFinite(value)) out.push({ key, value: String(value) })
    else if (typeof value === "string" || typeof value === "boolean") out.push({ key, value: String(value) })
    if (out.length >= 48) break
  }
  return out
}

const vertexNormal = (positions: Float64Array, indices: Uint32Array): number[] => {
  const acc = new Float64Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]!, ib = indices[t + 1]!, ic = indices[t + 2]!
    const ax = positions[ia * 3]!, ay = positions[ia * 3 + 1]!, az = positions[ia * 3 + 2]!
    const bx = positions[ib * 3]!, by = positions[ib * 3 + 1]!, bz = positions[ib * 3 + 2]!
    const cx = positions[ic * 3]!, cy = positions[ic * 3 + 1]!, cz = positions[ic * 3 + 2]!
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const add = (vertex: number) => {
      const slot = vertex * 3
      acc[slot] = (acc[slot] ?? 0) + nx
      acc[slot + 1] = (acc[slot + 1] ?? 0) + ny
      acc[slot + 2] = (acc[slot + 2] ?? 0) + nz
    }
    add(ia)
    add(ib)
    add(ic)
  }
  const normals: number[] = []
  for (let v = 0; v < positions.length; v += 3) {
    let nx = acc[v]!, ny = acc[v + 1]!, nz = acc[v + 2]!
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) normals.push(0, 0, 1)
    else normals.push(round(nx / len, MESH_PRECISION), round(ny / len, MESH_PRECISION), round(nz / len, MESH_PRECISION))
  }
  return normals
}

export interface MeshPreviewOptions {
  readonly maxTriangles?: number
  readonly tolerance?: number
}

const finiteMesh = (positions: ArrayLike<number>): boolean => {
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i]!)) return false
  return true
}

/**
 * The element's mesh, or undefined when it has none or the kernel cannot build one. One malformed element (a NaN
 * width, a profile the tessellator rejects) must not fail the whole preview, and a non-finite vertex would make the
 * phone refuse the entire payload, so such an element is listed with no triangles instead.
 */
const safeMesh = (element: Element, tolerance: number): ReturnType<typeof elementMesh> => {
  try {
    const mesh = elementMesh(element, tolerance)
    return mesh && finiteMesh(mesh.positions) ? mesh : undefined
  } catch {
    return undefined
  }
}

/** Tessellate solid elements. 2D elements stay in `parts` with a zero triangle count so the phone can still name them. */
export const meshPreview = (elements: readonly Element[], options: MeshPreviewOptions = {}): MeshPreview => {
  const maxTriangles = options.maxTriangles ?? MAX_PREVIEW_TRIANGLES
  const tolerance = options.tolerance ?? 0.2
  const positions: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const parts: MeshPart[] = []
  const bounds = freshBounds()
  let triangles = 0
  let truncated = false

  for (let n = 0; n < elements.length; n++) {
    const element = elements[n]!
    const id = label(element.id, `element-${n}`)
    const name = label(element.name, label(element.type, id))
    const mesh = safeMesh(element, tolerance)
    const count = mesh ? Math.floor(mesh.indices.length / 3) : 0
    if (!mesh || count === 0) {
      parts.push({ id, name, triangleStart: triangles, triangleCount: 0 })
      continue
    }
    if (triangles + count > maxTriangles) {
      truncated = true
      parts.push({ id, name, triangleStart: triangles, triangleCount: 0 })
      break
    }
    const base = positions.length / 3
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = round(mesh.positions[i]!, MESH_PRECISION), y = round(mesh.positions[i + 1]!, MESH_PRECISION), z = round(mesh.positions[i + 2]!, MESH_PRECISION)
      positions.push(x, y, z)
      grow(bounds, x, y, z)
    }
    for (let i = 0; i < mesh.indices.length; i++) indices.push(base + mesh.indices[i]!)
    normals.push(...vertexNormal(mesh.positions, mesh.indices))
    parts.push({ id, name, triangleStart: triangles, triangleCount: count })
    triangles += count
  }

  return { positions, indices, normals, bounds: finishBounds(bounds), parts, truncated }
}

type Motion = "rapid" | "linear" | "circular"

const motionOf = (block: ReturnType<typeof tokenize>): Motion | undefined => {
  const gs = valuesOf(block, "G")
  for (let i = gs.length - 1; i >= 0; i--) {
    const g = gs[i]!
    if (g === 0) return "rapid"
    if (g === 1) return "linear"
    if (g === 2 || g === 3) return "circular"
  }
  return undefined
}

const boundsOfSegments = (segments: readonly ToolpathSegment[]): PreviewBounds => {
  const bounds = freshBounds()
  for (const segment of segments) {
    grow(bounds, segment.from[0], segment.from[1], segment.from[2])
    grow(bounds, segment.to[0], segment.to[1], segment.to[2])
  }
  return finishBounds(bounds)
}

const pack = (
  segments: readonly ToolpathSegment[],
  stats: ToolpathStats,
  truncated: boolean,
): ToolpathPreview => {
  const bounds = boundsOfSegments(segments)
  return { segments, bounds, stock: bounds, truncated, stats }
}

export interface ToolpathPreviewOptions {
  readonly maxSegments?: number
}

/** Longest chord, in mm, an arc, fixed cycle or shape block is split into on the phone. */
export const PREVIEW_ARC_RESOLUTION = 1

/**
 * The desktop visualizer's parse (`parseToolpath`): arcs follow their centre, fixed cycles and G12/G13 shapes are
 * expanded, and the path starts at the first programmed point instead of an assumed origin. Every point of a block
 * keeps the source line so the G-code list and the 3D path stay locked together. Stats count motion blocks.
 */
export const toolpathPreviewFromGcode = (gcode: string, options: ToolpathPreviewOptions = {}): ToolpathPreview => {
  const maxSegments = options.maxSegments ?? MAX_PREVIEW_SEGMENTS
  const segments: ToolpathSegment[] = []
  let truncated = false
  const { points } = parseToolpath(gcode, PREVIEW_ARC_RESOLUTION)
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!
    const to = points[index]!
    if (from.x === to.x && from.y === to.y && from.z === to.z) continue
    // A malformed word (`X1e999`) must not poison the payload: the phone refuses non-finite geometry outright.
    if (!finitePoint(from) || !finitePoint(to)) continue
    if (segments.length >= maxSegments) {
      truncated = true
      break
    }
    segments.push({ kind: pointKind(to), line: to.line ?? 0, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z] })
  }
  return pack(segments, gcodeStats(gcode), truncated)
}

const pointKind = (point: ToolpathPoint): SegmentKind =>
  point.isRapid ? "rapid" : point.isArc || point.isShape || point.type === "G2" || point.type === "G3" ? "circular" : "linear"

/** One count per motion block, modal blocks included (`X10` after `G1` is a linear move). */
export const gcodeStats = (gcode: string): ToolpathStats => {
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let machineFunctions = 0
  let motion: Motion | undefined
  for (const line of gcode.split("\n")) {
    const block = tokenize(line)
    if (block.words.length === 0) continue
    if (valuesOf(block, "M").length > 0) machineFunctions++
    const explicit = motionOf(block)
    if (explicit !== undefined) motion = explicit
    const hasCoordinate = block.words.some((word) => word.letter === "X" || word.letter === "Y" || word.letter === "Z")
    if (motion === undefined || (explicit === undefined && !hasCoordinate)) continue
    if (explicit === undefined && valuesOf(block, "G").length > 0) continue
    if (motion === "rapid") rapidMoves++
    else if (motion === "linear") linearMoves++
    else circularMoves++
  }
  return { rapidMoves, linearMoves, circularMoves, machineFunctions }
}

const xyz = (v: Vec3): readonly [number, number, number] => [v.x, v.y, v.z]

const finitePoint = (v: { readonly x: number; readonly y: number; readonly z: number }): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)

/** Hard ceiling on chords per arc, so a huge radius cannot turn one move into the whole segment budget. */
const MAX_ARC_CHORDS = 720

/**
 * The points after `from` along an XY arc (helical when Z changes), at most `PREVIEW_ARC_RESOLUTION` mm apart: the same
 * chord length the G-code preview uses, so a program-only toolpath and its posted G-code draw the same curve.
 */
export const arcChordPoints = (from: Vec3, to: Vec3, center: { readonly x: number; readonly y: number }, clockwise: boolean): Vec3[] => {
  const radius = Math.hypot(from.x - center.x, from.y - center.y)
  if (!(radius > 1e-9)) return [to]
  const sweep = arcSweepBetween(from, to, center, clockwise)
  const chords = Math.min(MAX_ARC_CHORDS, Math.max(1, Math.ceil((radius * sweep) / PREVIEW_ARC_RESOLUTION)))
  const start = Math.atan2(from.y - center.y, from.x - center.x)
  const direction = clockwise ? -1 : 1
  const points: Vec3[] = []
  for (let i = 1; i < chords; i++) {
    const t = i / chords
    const angle = start + direction * sweep * t
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z: from.z + (to.z - from.z) * t })
  }
  // The programmed end point exactly, not a trigonometric approximation of it.
  points.push(to)
  return points
}

/**
 * Fallback when a toolpath has a program and no stored G-code. `line` is the 1-based order of the motion move (every
 * chord of one arc shares it), the counterpart of the G-code row. Cycles are expanded and arcs follow their centre.
 */
export const toolpathPreviewFromProgram = (program: Program, options: ToolpathPreviewOptions = {}): ToolpathPreview => {
  const maxSegments = options.maxSegments ?? MAX_PREVIEW_SEGMENTS
  const segments: ToolpathSegment[] = []
  let at: Vec3 = { x: 0, y: 0, z: 0 }
  // The machine's position before the first move is unknown: that move only sets the start.
  let known = false
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let block = 0
  let truncated = false

  const draw = (kind: SegmentKind, from: Vec3, points: readonly Vec3[]): void => {
    let previous = from
    for (const point of points) {
      if (truncated) return
      if (!finitePoint(point)) return
      if (point.x !== previous.x || point.y !== previous.y || point.z !== previous.z) {
        if (segments.length >= maxSegments) {
          truncated = true
          return
        }
        segments.push({ kind, line: block, from: xyz(previous), to: xyz(point) })
      }
      previous = point
    }
  }

  for (const toolpath of program.toolpaths) {
    for (const move of expandMoves(toolpath.moves, at)) {
      const target = moveTarget(move)
      if (move._tag === "Rapid" || move._tag === "Linear" || move._tag === "Arc") {
        block++
        if (move._tag === "Rapid") rapidMoves++
        else if (move._tag === "Linear") linearMoves++
        else circularMoves++
        if (known && target && finitePoint(at)) {
          if (move._tag === "Arc") draw("circular", at, arcChordPoints(at, target, move.center, move.clockwise))
          else draw(move._tag === "Rapid" ? "rapid" : "linear", at, [target])
        }
      }
      if (target) {
        at = target
        known = true
      }
    }
    if (truncated) break
  }

  return pack(segments, { rapidMoves, linearMoves, circularMoves, machineFunctions: 0 }, truncated)
}

export const emptyToolpathPreview = (): ToolpathPreview => pack([], EMPTY_STATS, false)

// ---------------------------------------------------------------- the machine around the program

export interface MachineSceneOptions {
  /** The generator settings of the stored document (the machine setting is the last word on the kind). */
  readonly settings: ToolpathSettings
  readonly stock: Stock
  /** The G-code the route draws. When empty or absent, the program alone is drawn. */
  readonly gcode?: string | undefined
  readonly program?: Program | undefined
  /** The kernel artifact of the document: its stock and table replace the generator's for its own program. */
  readonly artifact?: CamArtifact | undefined
  /** The NC text of the artifact, for the identity check against `gcode`. */
  readonly kernelNc?: string | undefined
  /** The generator's own G-code of the document, for the identity and machine check against `gcode`. */
  readonly generatorGcode?: string | undefined
  /** Kernel machine id (`kernelRequest.machine`), for the table of the mill set-up. */
  readonly machineId?: string | undefined
  readonly tool?: ToolModel | undefined
  /** The stored tool resource of the document: the scene picks the model once it knows the machine (§5.6). */
  readonly toolResource?: ToolResource | undefined
  /** The tools the program's toolpaths name, by tool id (a program that changes tools). */
  readonly tools?: ReadonlyArray<{ readonly toolId: string; readonly resource: ToolResource }>
  readonly maxSegments?: number
}

/** The toolpath, and the machine the phone draws it on. `segments` are in the display world (`cam.viewer.frames`). */
export interface MachineScenePreview extends ToolpathPreview {
  readonly machine: PreviewMachine
}

const timelineStats = (timeline: Timeline): ToolpathStats => {
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  for (const move of timeline.moves) {
    if (move.kind === "rapid") rapidMoves++
    else if (move.kind === "feed") {
      if (move.center !== undefined) circularMoves++
      else linearMoves++
    }
  }
  return { rapidMoves, linearMoves, circularMoves, machineFunctions: 0 }
}

/**
 * The timeline's moves as payload segments in display coordinates. `move` records which timeline move produced each
 * segment, so the spin runs and the collisions of the machine block stay attached to the right chord (an arc is many
 * segments of one move). Zero-length chords after the mapping are dropped: a Y move on a lathe draws nothing.
 */
const timelineSegments = (
  setup: ReturnType<typeof previewSetupOf>,
  timeline: Timeline,
  maxSegments: number,
): { readonly segments: ToolpathSegment[]; readonly move: number[]; readonly truncated: boolean } => {
  const segments: ToolpathSegment[] = []
  const move: number[] = []
  let truncated = false
  for (let index = 0; index < timeline.moves.length && !truncated; index++) {
    const timed = timeline.moves[index]!
    if (timed.kind === "dwell") continue
    const points = timed.center !== undefined ? arcChordPoints(timed.from, timed.to, timed.center, timed.clockwise ?? false) : [timed.to]
    let previous = timed.from
    for (const point of points) {
      // A malformed word must not poison the payload: the phone refuses non-finite geometry outright.
      if (finitePoint(previous) && finitePoint(point)) {
        const from = displayPoint(setup, previous, timed.state.xMode)
        const to = displayPoint(setup, point, timed.state.xMode)
        if (to.x !== from.x || to.y !== from.y || to.z !== from.z) {
          if (segments.length >= maxSegments) {
            truncated = true
            break
          }
          const kind: SegmentKind = timed.kind === "rapid" ? "rapid" : timed.center !== undefined ? "circular" : "linear"
          segments.push({ kind, line: timed.state.line ?? 0, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z] })
          move.push(index)
        }
      }
      previous = point
    }
  }
  return { segments, move, truncated }
}

/** Signed display revolutions per second of every change of spindle state, keyed by payload segment. */
const spinRunsOf = (timeline: Timeline, move: readonly number[], kind: PreviewMachine["kind"]): PreviewSpinRun[] => {
  const runs: PreviewSpinRun[] = []
  let current = 0
  for (let segment = 0; segment < move.length; segment++) {
    const state = timeline.moves[move[segment]!]!.state
    const rate = spinSense(kind, state.spindle) * displaySpinRate(state.rpm)
    if (rate !== current) {
      runs.push({ segment, rate })
      current = rate
    }
  }
  return runs
}

const unionBounds = (a: PreviewBounds, b: PreviewBounds): PreviewBounds => {
  const sink: BoundsSink = { min: [a.min[0], a.min[1], a.min[2]], max: [a.max[0], a.max[1], a.max[2]] }
  if (!Number.isFinite(a.min[0])) {
    sink.min = [b.min[0], b.min[1], b.min[2]]
    sink.max = [b.max[0], b.max[1], b.max[2]]
    return finishBounds(sink)
  }
  if (!Number.isFinite(b.min[0])) return a
  grow(sink, b.min[0], b.min[1], b.min[2])
  grow(sink, b.max[0], b.max[1], b.max[2])
  return finishBounds(sink)
}

/** The longest move list the workholding check reads; a surfacing program is longer than the phone can draw anyway. */
const MAX_COLLISION_MOVES = MAX_PREVIEW_SEGMENTS

/**
 * The program's operations as the phone needs them: the toolpath, the run of path segments it drew and its cutter.
 *
 * A toolpath that drew nothing (a tool change, a dwell-only path) is left out: the phone lists operations it can
 * show. The order is the program's order, like the desktop's operation list.
 */
const operationsOf = (
  program: Program | undefined,
  timeline: Timeline | undefined,
  move: readonly number[],
  toolOf: (path: number) => ToolModel | undefined,
): PreviewOperation[] => {
  if (program === undefined || timeline === undefined) return []
  const out: PreviewOperation[] = []
  for (let index = 0; index < program.toolpaths.length; index++) {
    const toolpath = program.toolpaths[index]!
    let start = -1
    let end = -1
    for (let segment = 0; segment < move.length; segment++) {
      const timed = timeline.moves[move[segment]!]
      if (timed === undefined || timed.path !== index) continue
      if (start < 0) start = segment
      end = segment
    }
    if (start < 0) continue
    const cutter = previewCutterOf(toolOf(index))
    out.push({
      index,
      name: toolpath.name,
      toolId: toolpath.toolId,
      startSegment: start,
      endSegment: end,
      ...(cutter !== undefined ? { cutter } : {}),
    })
  }
  return out
}

/**
 * The contacts on the playback clock: the tool into the workholding (the desktop's setup checks) and the collisions
 * the core replays against the stock left at each moment (spec 32 P7).
 *
 * The live stock replay costs one height field per program, so it runs only for a program the phone can draw; a
 * bigger one still reports the fixture contacts.
 */
const eventsOf = (
  setup: ReturnType<typeof previewSetupOf>,
  timeline: Timeline | undefined,
  move: readonly number[],
  envelope: ReturnType<typeof toolEnvelope> | undefined,
  toolOf: (path: number) => ToolModel | undefined,
): PreviewCollisionEvent[] => {
  if (timeline === undefined) return []
  const segmentsOfMove = new Map<number, number[]>()
  move.forEach((timed, segment) => {
    const known = segmentsOfMove.get(timed)
    if (known === undefined) segmentsOfMove.set(timed, [segment])
    else known.push(segment)
  })
  const out: PreviewCollisionEvent[] = []
  for (const finding of checkSetup(setup, timeline, envelope)) {
    const segment = segmentsOfMove.get(finding.move)?.[0]
    if (segment === undefined) continue
    out.push({
      code: finding.code,
      severity: finding.severity,
      seconds: timeline.moves[finding.move]?.start ?? 0,
      segment,
      ...(finding.line !== undefined ? { line: finding.line } : {}),
      message: finding.message,
    })
  }
  // The live stock replay is a 3-axis program's: a rotary one has no height field to cut.
  const live = setup.kind === "mill" && setup.rotary === undefined && timeline.moves.length <= MAX_PREVIEW_SEGMENTS
  for (const event of checkCollisions({
    setup,
    timeline,
    reachOf: (path) => toolReachOf(toolOf(path)),
    ...(live ? { live: { toolOf } } : {}),
    clearance: 2,
  })) {
    const segment = segmentsOfMove.get(event.move)?.[0]
    if (segment === undefined) continue
    out.push({
      code: event.code,
      severity: event.severity,
      seconds: event.seconds,
      segment,
      ...(event.line !== undefined ? { line: event.line } : {}),
      message: event.message,
    })
  }
  return out.sort((a, b) => a.seconds - b.seconds)
}

/**
 * The toolpath in display coordinates plus the machine around it (spec 31 §5, the payload contract of spec 13 §6):
 * which machine the program is for, how it is set up, its bodies, the tool glyph, what turns while it runs and which
 * segments run into the workholding. The phone never maps a program coordinate itself.
 *
 * With stored G-code the desktop's own replay (`analyseGcode`) drives the payload, so the phone and the desktop machine
 * view play the same motion; a program the interpreter cannot read (G12/G13 shapes) falls back to the toolpath parser,
 * which draws the shapes but has no motion state, so its payload carries no spin runs and no collisions.
 */
export const machineScenePreview = (options: MachineSceneOptions): MachineScenePreview => {
  const maxSegments = options.maxSegments ?? MAX_PREVIEW_SEGMENTS
  const gcode = options.gcode ?? ""
  const stored = gcode.trim().length > 0
  const produced = !stored ? undefined
    : options.kernelNc !== undefined && options.kernelNc === gcode ? { kind: "mill" as const, source: "kernel" as const }
    : options.generatorGcode !== undefined && options.generatorGcode !== "" && options.generatorGcode === gcode ? { kind: options.settings.machineType, source: "generator" as const }
    : undefined
  const choice = choosePreviewMachine({
    ...(produced !== undefined ? { produced } : {}),
    ...(stored ? { inferred: inferMachineKind(gcode) } : {}),
    setting: options.settings.machineType,
  })
  const kernelTable = options.machineId !== undefined ? findMachine(options.machineId)?.table : undefined
  const tool = options.tool ?? (options.toolResource !== undefined ? previewToolModel(choice.kind, options.settings, options.toolResource) : undefined)
  const setup = previewSetupOf(choice.kind, options.settings, options.stock, {
    ...(options.artifact !== undefined ? { artifact: options.artifact } : {}),
    ...(options.program !== undefined ? { program: options.program } : {}),
    gcode,
    ...(tool !== undefined ? { tool } : {}),
    ...(kernelTable !== undefined ? { table: { length: kernelTable.length, width: kernelTable.width } } : {}),
  })

  let segments: ToolpathSegment[] = []
  const move: number[] = []
  let truncated = false
  let stats: ToolpathStats = EMPTY_STATS
  let timeline: Timeline | undefined
  // The program the timeline plays: the analysed G-code's own, or the stored one.
  let program: Program | undefined = options.program

  if (stored) {
    stats = gcodeStats(gcode)
    const analysis = (() => {
      try { return analyseGcode(gcode) } catch { return undefined }
    })()
    // The desktop's own replay drives the payload when it draws something (spec 31 §5.7 parity).
    if (analysis !== undefined && analysis.program.toolpaths.some((path) => path.moves.length > 0)) {
      const candidate = buildTimeline(analysis.program, analysis.motion, undefined, programStart(choice.kind, analysis.program))
      const built = timelineSegments(setup, candidate, maxSegments)
      if (built.segments.length > 0) {
        timeline = candidate
        program = analysis.program
        segments = built.segments
        move.push(...built.move)
        truncated = built.truncated
      }
    }
    if (segments.length === 0) {
      // The parser reads what the interpreter cannot (G12/G13 shapes): drawn, but with no motion state to check.
      const parsed = toolpathPreviewFromGcode(gcode, { maxSegments })
      segments = parsed.segments.map((segment) => {
        const from = displayPoint(setup, { x: segment.from[0], y: segment.from[1], z: segment.from[2] })
        const to = displayPoint(setup, { x: segment.to[0], y: segment.to[1], z: segment.to[2] })
        return { kind: segment.kind, line: segment.line, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z] }
      })
      truncated = parsed.truncated
    }
  } else if (options.program !== undefined) {
    timeline = buildTimeline(options.program, undefined, undefined, programStart(choice.kind, options.program))
    const built = timelineSegments(setup, timeline, maxSegments)
    segments = built.segments
    move.push(...built.move)
    truncated = built.truncated
    stats = timelineStats(timeline)
  }

  const envelope = tool !== undefined ? toolEnvelope(tool) : undefined
  let collisions: number[] = []
  if (timeline !== undefined && timeline.moves.length <= MAX_COLLISION_MOVES) {
    const hits = collidingMoves(setup, timeline, envelope)
    if (hits.size > 0) collisions = move.flatMap((index, segment) => (hits.has(index) ? [segment] : []))
  }

  /**
   * The tool of every toolpath: the document's tool rows by tool id first, the document's own tool next, the set-up's
   * tool last. A program that changes tools therefore draws each operation with its own cutter, like the desktop's
   * multi-operation preview.
   */
  const toolOf = (path: number): ToolModel | undefined => {
    const id = program?.toolpaths[path]?.toolId
    if (id !== undefined) {
      const resource = options.tools?.find((entry) => entry.toolId === id)?.resource
      // A tool of another machine is not this operation's tool: the set-up's own tool is used instead.
      if (resource !== undefined && toolMachineOf(resource.type) === choice.kind) return toolModelOf(resource, choice.kind)
    }
    return tool ?? previewToolModel(choice.kind, options.settings)
  }

  const operations = operationsOf(program, timeline, move, toolOf)
  const events = eventsOf(setup, timeline, move, envelope, toolOf)
  if (events.length > 0) {
    // A contact is a red segment too: the phone marks the whole move, not only its first segment.
    const red = new Set(collisions)
    for (const event of events) red.add(event.segment)
    collisions = [...red].sort((a, b) => a - b)
  }

  const machine = previewMachineBlock({
    setup,
    choice,
    ...(tool !== undefined ? { tool } : {}),
    spin: timeline !== undefined ? spinRunsOf(timeline, move, choice.kind) : [],
    collisions,
    operations,
    events,
  })

  return {
    segments,
    bounds: unionBounds(boundsOfSegments(segments), previewBodyBounds(setup)),
    stock: previewStockBounds(setup),
    truncated,
    stats,
    machine,
  }
}

export { PreviewCache, type PreviewCacheOptions } from "./cache.ts"
export * from "./machine.ts"
