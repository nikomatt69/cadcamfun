/**
 * Bounded preview payloads for the phone companion.
 *
 * The desktop kernel stays here: a drawing or component becomes a triangle mesh, and a toolpath becomes
 * coloured segments whose `line` is the 1-based G-code row they came from. The phone draws the payload.
 * It never receives the stored CAD document and it never runs this module.
 */
import type { Vec3 } from "../cad/vec.ts"
import { expandMoves, moveTarget, type Program } from "../cam/ir.ts"
import { elementMesh, type Element } from "../cam/model/element-mesh.ts"
import { hasG, tokenize, valuesOf } from "../cam/viewer/words.ts"

/** Hard cap so one part cannot fill the local network. */
export const MAX_PREVIEW_TRIANGLES = 80_000
/** One segment per motion block, capped the same way. */
export const MAX_PREVIEW_SEGMENTS = 20_000

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
    else normals.push(nx / len, ny / len, nz / len)
  }
  return normals
}

export interface MeshPreviewOptions {
  readonly maxTriangles?: number
  readonly tolerance?: number
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
    const mesh = elementMesh(element, tolerance)
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
      const x = mesh.positions[i]!, y = mesh.positions[i + 1]!, z = mesh.positions[i + 2]!
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

/**
 * One segment per motion block. Arcs are the chord from the current point to the end point; every point of that
 * block shares the source line so the G-code list and the 3D path stay locked together.
 */
export const toolpathPreviewFromGcode = (gcode: string, options: ToolpathPreviewOptions = {}): ToolpathPreview => {
  const maxSegments = options.maxSegments ?? MAX_PREVIEW_SEGMENTS
  const lines = gcode.split("\n")
  const segments: ToolpathSegment[] = []
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let machineFunctions = 0
  let motion: Motion | undefined
  let absolute = true
  let x = 0
  let y = 0
  let z = 0
  let truncated = false

  for (let index = 0; index < lines.length; index++) {
    const block = tokenize(lines[index]!)
    if (block.words.length === 0) continue
    if (valuesOf(block, "M").length > 0) machineFunctions++
    if (hasG(block, 90)) absolute = true
    if (hasG(block, 91)) absolute = false
    const explicit = motionOf(block)
    if (explicit !== undefined) motion = explicit
    const hasCoordinate = block.words.some((word) => word.letter === "X" || word.letter === "Y" || word.letter === "Z")
    if (motion === undefined || (explicit === undefined && !hasCoordinate)) continue
    if (explicit === undefined && valuesOf(block, "G").length > 0) continue

    let nx = x
    let ny = y
    let nz = z
    for (const word of block.words) {
      if (word.letter === "X") nx = absolute ? word.value : x + word.value
      else if (word.letter === "Y") ny = absolute ? word.value : y + word.value
      else if (word.letter === "Z") nz = absolute ? word.value : z + word.value
    }
    if (motion === "rapid") rapidMoves++
    else if (motion === "linear") linearMoves++
    else circularMoves++
    if (segments.length >= maxSegments) {
      truncated = true
      x = nx
      y = ny
      z = nz
      continue
    }
    segments.push({ kind: motion, line: index + 1, from: [x, y, z], to: [nx, ny, nz] })
    x = nx
    y = ny
    z = nz
  }

  return pack(segments, { rapidMoves, linearMoves, circularMoves, machineFunctions }, truncated)
}

const xyz = (v: Vec3): readonly [number, number, number] => [v.x, v.y, v.z]

/** Fallback when a toolpath has a program and no stored G-code. Line numbers are then the segment order. */
export const toolpathPreviewFromProgram = (program: Program, options: ToolpathPreviewOptions = {}): ToolpathPreview => {
  const maxSegments = options.maxSegments ?? MAX_PREVIEW_SEGMENTS
  const segments: ToolpathSegment[] = []
  let at: Vec3 = { x: 0, y: 0, z: 0 }
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let truncated = false

  for (const toolpath of program.toolpaths) {
    for (const move of expandMoves(toolpath.moves, at)) {
      const target = moveTarget(move)
      if (move._tag === "Rapid" || move._tag === "Linear" || move._tag === "Arc") {
        const kind: SegmentKind = move._tag === "Rapid" ? "rapid" : move._tag === "Arc" ? "circular" : "linear"
        if (kind === "rapid") rapidMoves++
        else if (kind === "linear") linearMoves++
        else circularMoves++
        if (segments.length < maxSegments && target) {
          segments.push({ kind, line: segments.length + 1, from: xyz(at), to: xyz(target) })
        } else truncated = true
      }
      if (target) at = target
    }
    if (truncated) break
  }

  return pack(segments, { rapidMoves, linearMoves, circularMoves, machineFunctions: 0 }, truncated)
}

export const emptyToolpathPreview = (): ToolpathPreview => pack([], EMPTY_STATS, false)
