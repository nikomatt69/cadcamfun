/**
 * Upload contract for the companion preview.
 *
 * The desktop already caps a preview. The phone checks again, because the GPU copy must not
 * trust the network: a non-finite coordinate or an index past the vertex buffer is a Metal fault,
 * not a blank frame. Numbers here are the same caps as `packages/core` (`MAX_PREVIEW_TRIANGLES`,
 * `MAX_PREVIEW_SEGMENTS`) plus the twelve edges of a stock box and the machine scene's own
 * triangles (`machine-bodies.ts`). `PreviewUpload.swift` repeats them; `preview-scene.test.ts`
 * fails if the two copies drift.
 *
 * The playhead is a second buffer. Scrubbing a toolpath recolours one move and leaves the path
 * allocation alone.
 */

import { boundsRadius, boxEdges, niceStep, type Bounds } from "./preview-math"

/** Triangles. Matches the desktop preview cap. */
export const PREVIEW_MAX_TRIANGLES = 80_000

/** Motion segments, not counting the stock box. */
export const PREVIEW_MAX_SEGMENTS = 20_000

/** A stock box is twelve edges and nothing else. */
export const PREVIEW_MAX_STOCK_EDGES = 12

/** Feature edges, grid and axes drawn over the scene. Extra edges are dropped, never refused. */
export const PREVIEW_MAX_OVERLAY_SEGMENTS = 40_000

/** Dihedral angle above which a shared edge is drawn, like the desktop's crease outline. */
export const FEATURE_EDGE_ANGLE = (30 * Math.PI) / 180

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
  // Amber reads on both the dark and the light background; the old pale yellow vanished on light.
  active: [1, 0.62, 0.12],
  /** A move that runs into the workholding (`machine.collisions`), the desktop's `0xff2d2d`. */
  collision: [1, 0.18, 0.18],
  tool: [0.98, 0.98, 1],
  edge: [0.1, 0.12, 0.16],
  axisX: [0.9, 0.3, 0.3],
  axisY: [0.35, 0.78, 0.4],
  axisZ: [0.35, 0.55, 0.95],
} as const

/**
 * The desktop's tool palette (`viewport/view3d/playback.ts` `TOOL_COLORS`), so an operation has the same colour on the
 * phone as on the desktop.
 */
export const OPERATION_PALETTE: ReadonlyArray<Rgb> = [
  [0.22, 0.74, 0.97],
  [0.13, 0.77, 0.37],
  [0.98, 0.45, 0.09],
  [0.91, 0.47, 0.98],
  [0.98, 0.8, 0.08],
  [0.96, 0.25, 0.37],
  [0.18, 0.83, 0.75],
  [0.66, 0.55, 0.98],
  [0.52, 0.8, 0.09],
  [0.98, 0.57, 0.24],
] as const

/** The colour of operation `index`, the desktop's `operationColor`. */
export const operationColor = (index: number): Rgb => OPERATION_PALETTE[index % OPERATION_PALETTE.length]!

export const PREVIEW_MESSAGE = {
  meshTooLarge: "This preview is too large for the phone.",
  meshInvalid: "This preview could not be drawn.",
  pathTooLarge: "This toolpath is too large for the phone.",
  pathInvalid: "This toolpath could not be drawn.",
  machineTooLarge: "This machine scene is too large for the phone.",
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

/** No move runs into the workholding; the common case, shared so the default allocates nothing. */
const NO_COLLISIONS: ReadonlySet<number> = new Set()

/** How the path is coloured and what it shows. */
export interface PathStyle {
  /** The colour of a segment; undefined keeps the move-class colour. */
  readonly colorOf?: (index: number) => Rgb | undefined
  /** Segments to leave out: the operations the user put away. */
  readonly hidden?: (index: number) => boolean
}

/**
 * Coloured path and stock edges. The playhead is not baked in. Segment indices in `collisions` are drawn red
 * (`machine.collisions`); the stock box is left out of a machine scene (`stock === undefined`), whose outline the
 * bodies carry instead.
 *
 * A hidden segment is left out of the buffer, not greyed: the phone shows one operation at a time, like the desktop's
 * operation browser. The buffer is built in two passes, because its size depends on how many segments are shown.
 */
export const prepareToolpathLines = (
  segments: readonly PreviewSegment[],
  stock: Bounds | undefined,
  collisions: ReadonlySet<number> = NO_COLLISIONS,
  style: PathStyle = {},
): Float32Array => {
  if (segments.length > PREVIEW_MAX_SEGMENTS) throw new PreviewPayloadError("pathTooLarge")
  const edges = stock ? boxEdges(stock) : []
  if (stock && (!finitePoint(stock.min) || !finitePoint(stock.max))) throw new PreviewPayloadError("pathInvalid")
  if (edges.length > PREVIEW_MAX_STOCK_EDGES) throw new PreviewPayloadError("pathTooLarge")
  const shown: number[] = []
  for (let index = 0; index < segments.length; index++) {
    if (style.hidden?.(index) === true) continue
    shown.push(index)
  }
  const data = new Float32Array((shown.length + edges.length) * SEGMENT_FLOATS)
  let cursor = 0
  for (const index of shown) {
    const segment = segments[index]!
    assertPoint(segment.from)
    assertPoint(segment.to)
    const color = collisions.has(index) ? LINE_COLOR.collision : style.colorOf?.(index) ?? LINE_COLOR[segment.kind]
    cursor = writeVertex(data, cursor, segment.from, color)
    cursor = writeVertex(data, cursor, segment.to, color)
  }
  for (const edge of edges) {
    cursor = writeVertex(data, cursor, edge.from, LINE_COLOR.stock)
    cursor = writeVertex(data, cursor, edge.to, LINE_COLOR.stock)
  }
  return data
}

/** Facets of the wireframe tool drawn at the playhead. */
export const TOOL_GLYPH_SIDES = 16

/** The current move, plus a wireframe tool: a ring at the tip, a ring at the top and four flutes between them. */
export const MILL_TOOL_VERTICES = 2 + TOOL_GLYPH_SIDES * 2 * 2 + 4 * 2

/** The largest machine glyph beside the playhead: the printer nozzle's ring, four spokes and the stub above it. */
export const MACHINE_GLYPH_MAX_VERTICES = 42

/** The current move, the mill wireframe tool and the largest machine glyph; the Metal module repeats this cap. */
export const PREVIEW_MAX_ACTIVE_VERTICES = MILL_TOOL_VERTICES + MACHINE_GLYPH_MAX_VERTICES

/** How strongly the not-yet-cut path fades toward the background while simulating (0 = no fade). */
export const REMAINING_PATH_FADE = 0.72

/** Tool radius relative to its drawn height: a stubby end mill, wide enough to read at a glance. */
const TOOL_GLYPH_RADIUS = 0.2

/**
 * The current move, plus a wireframe tool of height `toolLength` standing on the tool tip when it is positive,
 * plus the machine's own glyph (`machine-bodies.ts` `toolGlyphLines`: the lathe insert or the printer nozzle)
 * appended in the same buffer. `toolColor` is the theme ink so the tool reads on light and dark. Empty when no
 * move is current.
 */
export const prepareActiveLine = (
  segment: PreviewSegment | undefined,
  toolLength = 0,
  toolColor: Rgb = LINE_COLOR.tool,
  glyph: readonly { readonly from: PreviewPoint; readonly to: PreviewPoint; readonly color?: Rgb }[] = [],
): Float32Array => {
  if (!segment) return new Float32Array()
  assertPoint(segment.from)
  assertPoint(segment.to)
  const tool = Number.isFinite(toolLength) && toolLength > 0
  const vertices = (tool ? MILL_TOOL_VERTICES : 2) + glyph.length * 2
  if (vertices > PREVIEW_MAX_ACTIVE_VERTICES) throw new PreviewPayloadError("pathInvalid")
  const data = new Float32Array(vertices * LINE_VERTEX_FLOATS)
  let cursor = writeVertex(data, 0, segment.from, LINE_COLOR.active)
  cursor = writeVertex(data, cursor, segment.to, LINE_COLOR.active)
  if (tool) {
    const x = segment.to[0], y = segment.to[1], z = segment.to[2]
    const radius = toolLength * TOOL_GLYPH_RADIUS
    const at = (side: number, height: number): PreviewPoint => {
      const angle = (side / TOOL_GLYPH_SIDES) * Math.PI * 2
      return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z + height]
    }
    for (const height of [0, toolLength]) {
      for (let side = 0; side < TOOL_GLYPH_SIDES; side++) {
        cursor = writeVertex(data, cursor, at(side, height), toolColor)
        cursor = writeVertex(data, cursor, at(side + 1, height), toolColor)
      }
    }
    for (let flute = 0; flute < 4; flute++) {
      const side = (flute * TOOL_GLYPH_SIDES) / 4
      cursor = writeVertex(data, cursor, at(side, 0), toolColor)
      cursor = writeVertex(data, cursor, at(side, toolLength), toolColor)
    }
  }
  for (const line of glyph) {
    assertPoint(line.from)
    assertPoint(line.to)
    cursor = writeVertex(data, cursor, line.from, line.color ?? toolColor)
    cursor = writeVertex(data, cursor, line.to, line.color ?? toolColor)
  }
  return data
}

/**
 * Line vertices drawn at full colour vs faded. The path buffer is `segments` first, stock edges after,
 * so `pathVertices` bounds the faded range and the stock box always stays at full colour.
 * Not simulating: everything is "travelled", i.e. the whole path at full colour.
 *
 * `travelledSegments` overrides the playhead's own segment count: when operations are hidden, only the segments the
 * phone shows are in the buffer, so the playhead has passed a different number of them.
 */
export const progressRange = (
  playhead: number,
  segmentCount: number,
  simulating: boolean,
  travelledSegments?: number,
): { travelled: number; path: number } => {
  const count = Math.max(0, Math.trunc(segmentCount))
  if (!simulating || count === 0) return { travelled: count * 2, path: count * 2 }
  const done = travelledSegments ?? Math.min(count, Math.max(0, Math.trunc(playhead)) + 1)
  return { travelled: Math.min(count, Math.max(0, Math.trunc(done))) * 2, path: count * 2 }
}

/** Tool marker height: a sixth of the part's size, so it reads at every zoom of a fitted view. */
export const toolMarkerLength = (bounds: Bounds): number => {
  const radius = boundsRadius(bounds)
  return Number.isFinite(radius) ? radius * 0.3 : 0
}

export const finiteMatrix = (mvp: readonly number[]): boolean => mvp.length === 16 && mvp.every((value) => Number.isFinite(value))

/** Theme backgrounds are `#rrggbb`. Anything else falls back to the preview's neutral ground. */
export const rgbFromHex = (value: string): readonly [number, number, number] => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return [0.08, 0.09, 0.1]
  const parsed = Number.parseInt(value.slice(1), 16)
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255]
}

type Rgb = readonly [number, number, number]
export type OverlaySegment = { readonly from: PreviewPoint; readonly to: PreviewPoint; readonly color: Rgb }

/** An overlay line: the mesh's feature edges take the caller's ink, the machine's own wire bodies carry their colour. */
export type OverlayEdge = { readonly from: PreviewPoint; readonly to: PreviewPoint; readonly color?: Rgb }

/**
 * Boundary, non-manifold and crease edges of a triangle mesh.
 * Vertices are welded by position first: crease normals split vertices, and an unwelded
 * mesh would outline every triangle.
 */
export const meshFeatureEdges = (
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  angle = FEATURE_EDGE_ANGLE,
  limit = PREVIEW_MAX_OVERLAY_SEGMENTS,
): Array<{ from: [number, number, number]; to: [number, number, number] }> => {
  const vertices = Math.floor(positions.length / 3)
  if (vertices === 0 || indices.length < 3) return []
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let v = 0; v < vertices; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!, z = positions[v * 3 + 2]!
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z
  }
  const tolerance = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 1e-6, 1e-9)
  const welded = new Uint32Array(vertices)
  const byPosition = new Map<string, number>()
  for (let v = 0; v < vertices; v++) {
    const key = `${Math.round(positions[v * 3]! / tolerance)},${Math.round(positions[v * 3 + 1]! / tolerance)},${Math.round(positions[v * 3 + 2]! / tolerance)}`
    const known = byPosition.get(key)
    if (known === undefined) { byPosition.set(key, v); welded[v] = v } else welded[v] = known
  }
  const triangles = Math.floor(indices.length / 3)
  const normals = new Float64Array(triangles * 3)
  // Edge key -> first face, or -1 once the edge is already known to be drawn (non-manifold).
  const faces = new Map<number, number>()
  const drawn = new Set<number>()
  const cosLimit = Math.cos(angle)
  for (let t = 0; t < triangles; t++) {
    const a = welded[indices[t * 3]!]!, b = welded[indices[t * 3 + 1]!]!, c = welded[indices[t * 3 + 2]!]!
    const ux = positions[b * 3]! - positions[a * 3]!, uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!, uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!
    const vx = positions[c * 3]! - positions[a * 3]!, vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!, vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (a === b || b === c || a === c || len < 1e-20) { normals[t * 3 + 2] = Number.NaN; continue }
    normals[t * 3] = nx / len; normals[t * 3 + 1] = ny / len; normals[t * 3 + 2] = nz / len
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = Math.min(p, q) * vertices + Math.max(p, q)
      const other = faces.get(key)
      if (other === undefined) { faces.set(key, t); continue }
      faces.set(key, -1)
      if (other < 0) { drawn.add(key); continue }
      const cos = normals[other * 3]! * normals[t * 3]! + normals[other * 3 + 1]! * normals[t * 3 + 1]! + normals[other * 3 + 2]! * normals[t * 3 + 2]!
      if (cos < cosLimit) drawn.add(key); else drawn.delete(key)
    }
  }
  for (const [key, face] of faces) if (face >= 0) drawn.add(key)
  const out: Array<{ from: [number, number, number]; to: [number, number, number] }> = []
  for (const key of drawn) {
    if (out.length >= limit) break
    const p = Math.floor(key / vertices), q = key % vertices
    out.push({ from: [positions[p * 3]!, positions[p * 3 + 1]!, positions[p * 3 + 2]!], to: [positions[q * 3]!, positions[q * 3 + 1]!, positions[q * 3 + 2]!] })
  }
  return out
}

/** Floor grid under the bounds plus X/Y/Z axes at the origin, or at the grid corner when the origin is off the grid. */
export const sceneGuides = (bounds: Bounds, grid: Rgb): OverlaySegment[] => {
  if (!finitePoint(bounds.min) || !finitePoint(bounds.max)) return []
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], boundsRadius(bounds))
  const step = niceStep(span * 1.6, 12)
  const cx = (bounds.min[0] + bounds.max[0]) / 2, cy = (bounds.min[1] + bounds.max[1]) / 2
  const half = Math.ceil((span * 0.8) / step) * step
  const x0 = Math.floor((cx - half) / step) * step, x1 = Math.ceil((cx + half) / step) * step
  const y0 = Math.floor((cy - half) / step) * step, y1 = Math.ceil((cy + half) / step) * step
  // Slightly below the part so its bottom face never fights the grid for depth.
  const z = bounds.min[2] - span * 1e-3
  const out: OverlaySegment[] = []
  for (let x = x0; x <= x1 + step / 2; x += step) out.push({ from: [x, y0, z], to: [x, y1, z], color: grid })
  for (let y = y0; y <= y1 + step / 2; y += step) out.push({ from: [x0, y, z], to: [x1, y, z], color: grid })
  const onGrid = 0 >= x0 && 0 <= x1 && 0 >= y0 && 0 <= y1
  const origin: PreviewPoint = onGrid ? [0, 0, z] : [x0, y0, z]
  const axis = step * 2
  out.push({ from: origin, to: [origin[0] + axis, origin[1], z], color: LINE_COLOR.axisX })
  out.push({ from: origin, to: [origin[0], origin[1] + axis, z], color: LINE_COLOR.axisY })
  out.push({ from: origin, to: [origin[0], origin[1], z + axis], color: LINE_COLOR.axisZ })
  return out
}

/**
 * Guides first, then the machine's wire bodies, then feature edges, capped so a dense mesh drops outline rather
 * than the frame. An edge without a colour takes `edgeColor` (a wire body keeps its own).
 */
export const prepareOverlayLines = (
  guides: readonly OverlaySegment[],
  edges: readonly OverlayEdge[],
  edgeColor: Rgb = LINE_COLOR.edge,
): Float32Array => {
  const segments = [...guides, ...edges.map((edge) => ({ from: edge.from, to: edge.to, color: edge.color ?? edgeColor }))]
    .filter((segment) => finitePoint(segment.from) && finitePoint(segment.to))
    .slice(0, PREVIEW_MAX_OVERLAY_SEGMENTS)
  const data = new Float32Array(segments.length * SEGMENT_FLOATS)
  let cursor = 0
  for (const segment of segments) {
    cursor = writeVertex(data, cursor, segment.from, segment.color)
    cursor = writeVertex(data, cursor, segment.to, segment.color)
  }
  return data
}

/** Grid ink: the background moved a little toward the theme's ink so it reads in light and dark. */
export const guideColor = (background: string, ink: string, amount = 0.1): Rgb => {
  const a = rgbFromHex(background), b = rgbFromHex(ink)
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]
}
