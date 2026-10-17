/**
 * Bounded preview payloads for the phone companion.
 *
 * The desktop kernel stays here: a drawing or component becomes a triangle mesh, and a toolpath becomes
 * coloured segments whose `line` is the 1-based G-code row they came from. The phone draws the payload.
 * It never receives the stored CAD document and it never runs this module.
 */
import type { Vec3 } from "../cad/vec.ts"
import { arcSweepBetween, expandMoves, moveTarget, type Program } from "../cam/ir.ts"
import { elementMesh, type Element } from "../cam/model/element-mesh.ts"
import { parseToolpath, type ToolpathPoint } from "../cam/viewer/toolpath.ts"
import { tokenize, valuesOf } from "../cam/viewer/words.ts"

/** Hard cap so one part cannot fill the local network. */
export const MAX_PREVIEW_TRIANGLES = 80_000
/** One segment per motion block, capped the same way. */
export const MAX_PREVIEW_SEGMENTS = 20_000
/**
 * Bump when the payload a given revision produces changes (rounding, caps, arc expansion), so a phone holding an
 * entity tag of the old shape fetches the new one instead of being told nothing changed.
 */
export const PREVIEW_FORMAT = 2

/**
 * Mesh coordinates and normals travel rounded to 1e-5. The phone uploads them as float32, whose spacing is already
 * coarser than that above 64 mm, so the rounding is invisible; it roughly halves the JSON a dense part costs on Wi-Fi.
 */
const MESH_PRECISION = 1e5
const round = (value: number, scale: number): number => Math.round(value * scale) / scale

export interface PreviewBounds {
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

export const EMPTY_BOUNDS: PreviewBounds = { min: [0, 0, 0], max: [0, 0, 0] }

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

const grow = (bounds: { min: [number, number, number]; max: [number, number, number] }, x: number, y: number, z: number): void => {
  bounds.min[0] = Math.min(bounds.min[0], x)
  bounds.min[1] = Math.min(bounds.min[1], y)
  bounds.min[2] = Math.min(bounds.min[2], z)
  bounds.max[0] = Math.max(bounds.max[0], x)
  bounds.max[1] = Math.max(bounds.max[1], y)
  bounds.max[2] = Math.max(bounds.max[2], z)
}

const finishBounds = (bounds: { min: [number, number, number]; max: [number, number, number] }): PreviewBounds =>
  Number.isFinite(bounds.min[0]) ? bounds : EMPTY_BOUNDS

const freshBounds = (): { min: [number, number, number]; max: [number, number, number] } => ({
  min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
})

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
  return pack(segments, blockStats(gcode), truncated)
}

const pointKind = (point: ToolpathPoint): SegmentKind =>
  point.isRapid ? "rapid" : point.isArc || point.isShape || point.type === "G2" || point.type === "G3" ? "circular" : "linear"

/** One count per motion block, modal blocks included (`X10` after `G1` is a linear move). */
const blockStats = (gcode: string): ToolpathStats => {
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

export { PreviewCache, type PreviewCacheOptions } from "./cache.ts"
