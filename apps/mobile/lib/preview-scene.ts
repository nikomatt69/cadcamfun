/**
 * Upload contract for the companion preview.
 *
 * The desktop already caps a preview. The phone checks again, because the GPU copy must not
 * trust the network: a non-finite coordinate or an index past the vertex buffer is a Metal fault,
 * not a blank frame. Numbers here are the same caps as `packages/core` (`MAX_PREVIEW_TRIANGLES`,
 * `MAX_PREVIEW_SEGMENTS`) plus the twelve edges of a stock box. `PreviewUpload.swift` repeats
 * them; `preview-scene.test.ts` fails if the two copies drift.
 *
 * The playhead is a second buffer. Scrubbing a toolpath recolours one move and leaves the path
 * allocation alone.
 */

import { boxEdges, type Bounds } from "./preview-math"

/** Triangles. Matches the desktop preview cap. */
export const PREVIEW_MAX_TRIANGLES = 80_000

/** Motion segments, not counting the stock box. */
export const PREVIEW_MAX_SEGMENTS = 20_000

/** A stock box is twelve edges and nothing else. */
export const PREVIEW_MAX_STOCK_EDGES = 12

/** xyz, tightly packed. */
const VERTEX_FLOATS = 3

/** xyzrgb, tightly packed. Metal reads this as two `packed_float3`s (24 bytes). */
export const LINE_VERTEX_FLOATS = 6

const SEGMENT_FLOATS = LINE_VERTEX_FLOATS * 2

export const MESH_COLOR = [0.72, 0.75, 0.8] as const
export const SELECTED_COLOR = [0.95, 0.55, 0.22] as const

export const LINE_COLOR = {
  rapid: [0.38, 0.58, 0.96],
  linear: [0.28, 0.78, 0.46],
  circular: [0.66, 0.46, 0.94],
  stock: [0.48, 0.5, 0.55],
  active: [1, 0.86, 0.32],
} as const

export const PREVIEW_MESSAGE = {
  meshTooLarge: "This preview is too large for the phone.",
  meshInvalid: "This preview could not be drawn.",
  pathTooLarge: "This toolpath is too large for the phone.",
  pathInvalid: "This toolpath could not be drawn.",
} as const

export class PreviewPayloadError extends Error {
  readonly code: keyof typeof PREVIEW_MESSAGE

  constructor(code: keyof typeof PREVIEW_MESSAGE) {
    super(PREVIEW_MESSAGE[code])
    this.name = "PreviewPayloadError"
    this.code = code
  }
}

export interface MeshUpload {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
}

export interface PreviewPoint {
  readonly 0: number
  readonly 1: number
  readonly 2: number
}

export interface PreviewSegment {
  readonly kind: "rapid" | "linear" | "circular"
  readonly from: PreviewPoint
  readonly to: PreviewPoint
}

const finitePoint = (point: PreviewPoint): boolean => Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2])

const finiteBuffer = (values: ArrayLike<number>): boolean => {
  for (let index = 0; index < values.length; index++) {
    if (!Number.isFinite(values[index])) return false
  }
  return true
}

/**
 * Copy a mesh into typed arrays, or refuse it.
 * An empty mesh is a clear. Anything else must be in range before it is handed to Metal.
 */
export const prepareMeshUpload = (mesh: {
  readonly positions: ArrayLike<number>
  readonly normals: ArrayLike<number>
  readonly indices: ArrayLike<number>
}): MeshUpload => {
  const { positions, normals, indices } = mesh
  if (positions.length === 0 && normals.length === 0 && indices.length === 0) {
    return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }
  }
  if (positions.length % VERTEX_FLOATS !== 0 || normals.length !== positions.length || indices.length % VERTEX_FLOATS !== 0) {
    throw new PreviewPayloadError("meshInvalid")
  }
  const triangles = indices.length / VERTEX_FLOATS
  const vertices = positions.length / VERTEX_FLOATS
  if (triangles > PREVIEW_MAX_TRIANGLES || vertices > PREVIEW_MAX_TRIANGLES * VERTEX_FLOATS) {
    throw new PreviewPayloadError("meshTooLarge")
  }
  if (vertices === 0 || !finiteBuffer(positions) || !finiteBuffer(normals)) throw new PreviewPayloadError("meshInvalid")
  for (let index = 0; index < indices.length; index++) {
    const value = indices[index]
    if (!Number.isInteger(value) || value === undefined || value < 0 || value >= vertices) throw new PreviewPayloadError("meshInvalid")
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
  }
}

/** Triangle range for the selected element, clamped so the second draw cannot run past the index buffer. */
export const highlightRange = (triangleCount: number, start: number, count: number): { start: number; count: number } => {
  if (!Number.isInteger(triangleCount) || triangleCount <= 0) return { start: 0, count: 0 }
  if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count <= 0 || start >= triangleCount) {
    return { start: 0, count: 0 }
  }
  return { start, count: Math.min(count, triangleCount - start) }
}

const writeVertex = (data: Float32Array, cursor: number, point: PreviewPoint, color: readonly [number, number, number]): number => {
  data[cursor] = point[0]
  data[cursor + 1] = point[1]
  data[cursor + 2] = point[2]
  data[cursor + 3] = color[0]
  data[cursor + 4] = color[1]
  data[cursor + 5] = color[2]
  return cursor + LINE_VERTEX_FLOATS
}

const assertPoint = (point: PreviewPoint): void => {
  if (!finitePoint(point)) throw new PreviewPayloadError("pathInvalid")
}

/** Coloured path and stock edges. The playhead is not baked in. */
export const prepareToolpathLines = (segments: readonly PreviewSegment[], stock: Bounds | undefined): Float32Array => {
  if (segments.length > PREVIEW_MAX_SEGMENTS) throw new PreviewPayloadError("pathTooLarge")
  const edges = stock ? boxEdges(stock) : []
  if (stock && (!finitePoint(stock.min) || !finitePoint(stock.max))) throw new PreviewPayloadError("pathInvalid")
  if (edges.length > PREVIEW_MAX_STOCK_EDGES) throw new PreviewPayloadError("pathTooLarge")
  const data = new Float32Array((segments.length + edges.length) * SEGMENT_FLOATS)
  let cursor = 0
  for (const segment of segments) {
    assertPoint(segment.from)
    assertPoint(segment.to)
    cursor = writeVertex(data, cursor, segment.from, LINE_COLOR[segment.kind])
    cursor = writeVertex(data, cursor, segment.to, LINE_COLOR[segment.kind])
  }
  for (const edge of edges) {
    cursor = writeVertex(data, cursor, edge.from, LINE_COLOR.stock)
    cursor = writeVertex(data, cursor, edge.to, LINE_COLOR.stock)
  }
  return data
}

/** Two vertices, or an empty buffer when no move is current. */
export const prepareActiveLine = (segment: PreviewSegment | undefined): Float32Array => {
  if (!segment) return new Float32Array()
  assertPoint(segment.from)
  assertPoint(segment.to)
  const data = new Float32Array(SEGMENT_FLOATS)
  let cursor = writeVertex(data, 0, segment.from, LINE_COLOR.active)
  writeVertex(data, cursor, segment.to, LINE_COLOR.active)
  return data
}

export const finiteMatrix = (mvp: readonly number[]): boolean => mvp.length === 16 && mvp.every((value) => Number.isFinite(value))

/** Theme backgrounds are `#rrggbb`. Anything else falls back to the preview's neutral ground. */
export const rgbFromHex = (value: string): readonly [number, number, number] => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return [0.08, 0.09, 0.1]
  const parsed = Number.parseInt(value.slice(1), 16)
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255]
}
