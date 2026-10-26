import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { createDisplayEdges } from "./native-edges.ts"
import type { LookTier } from "./render-look.ts"

/**
 * Thick lines for the 3D previews. WebGL draws every `THREE.Line` one pixel wide whatever `linewidth` says, so model edges and
 * toolpaths vanish on a high-DPI display. `LineSegments2` draws each segment as an instanced screen-space quad: any width in CSS
 * pixels, per-vertex colour, dashes, and the same segment-pair layout as `THREE.LineSegments`, so a buffer built for the old
 * line is used as it is (no copy).
 *
 * The cost is real (an instanced quad per segment, a heavier fragment shader), hence a segment budget and the `low` tier: when
 * the tier is `low`, or a line would not fit the budget, the factory returns the old one-pixel `THREE.LineSegments`, so the
 * caller never has to branch and the picture degrades instead of the frame rate.
 */

/** The render quality tiers: the shared setting of `render-look.ts` (`low | balanced | standard | high`). */
export type LineQuality = LookTier

/** Segments a tier may keep as thick lines: `total` over everything alive at once, `perObject` for one line. */
export const LINE_SEGMENT_BUDGET: Readonly<Record<LineQuality, { readonly total: number; readonly perObject: number }>> = {
  low: { total: 0, perObject: 0 },
  balanced: { total: 400_000, perObject: 150_000 },
  standard: { total: 400_000, perObject: 150_000 },
  high: { total: 1_500_000, perObject: 600_000 }
}

/** Thick lines are drawn this much of the width the caller asked for: `balanced` sits between the one-pixel edges of the plain look and the 1.5 px of standard, antialiased. */
export const LINE_WIDTH_SCALE: Readonly<Record<LineQuality, number>> = { low: 1, balanced: 0.7, standard: 1, high: 1 }

/** Counts the segments of the thick lines alive. `acquire` returns a release function, or undefined when it does not fit. */
export class LineBudget {
  private spent = 0
  constructor(private limit: number) {}
  get used(): number { return this.spent }
  get remaining(): number { return Math.max(0, this.limit - this.spent) }
  setLimit(limit: number): void { this.limit = limit }
  /** `cap` lowers the limit for this one request (the tier's total over a shared budget). */
  acquire(segments: number, cap = Infinity): (() => void) | undefined {
    if (!(segments >= 0) || this.spent + segments > Math.min(this.limit, cap)) return undefined
    this.spent += segments
    let released = false
    return () => { if (!released) { released = true; this.spent -= segments } }
  }
}

/** One budget for the process: the previews are not on screen at the same time in practice, and a disposed line gives its share back. */
export const sharedLineBudget = new LineBudget(LINE_SEGMENT_BUDGET.high.total)

let currentQuality: LineQuality = "standard"
/** The tier lines are built for when the caller passes none. The hook-ins pass the shared tier (`currentLookTier()`) explicitly; lines already built keep what they were built as. */
export const setLineQuality = (quality: LineQuality): void => { currentQuality = quality }
export const lineQuality = (): LineQuality => currentQuality

export interface LineStyle {
  /** Colour of the whole line; with `colors` it tints the vertex colours (leave it white). */
  readonly color?: number | string
  /** Width in CSS pixels (thick lines only; the fallback line is always 1 px). */
  readonly width?: number
  readonly opacity?: number
  /** Per-vertex RGB (3 floats per vertex, the same count as `positions`). */
  readonly colors?: Float32Array
  /** Dashes in world units; the line distances are computed for you. */
  readonly dash?: { readonly dash: number; readonly gap: number }
  readonly depthTest?: boolean
}

export interface LineOptions {
  readonly quality?: LineQuality
  readonly budget?: LineBudget
  /** Whether a raycast may hit the line. Off by default: the mesh under an edge is what gets picked, and a line raycast walks every segment. */
  readonly pickable?: boolean
}

/** Whether a line object is a thick one (a `LineSegments2`) rather than the one-pixel fallback. */
export const isThickLine = (object: THREE.Object3D): object is LineSegments2 => (object as { isLineSegments2?: boolean }).isLineSegments2 === true

const noRaycast = (): void => {}

/** Polyline points (`x y z` triplets) as segment endpoints (`A B B C C D`), the layout of `LineSegments`. Per-point colours convert the same way. */
export const polylineToSegments = (points: ArrayLike<number>, closed = false): Float32Array => {
  const count = Math.floor(points.length / 3)
  if (count < 2) return new Float32Array(0)
  const segments = closed ? count : count - 1
  const out = new Float32Array(segments * 6)
  for (let i = 0; i < segments; i++) {
    const a = i * 3, b = ((i + 1) % count) * 3
    out.set([points[a]!, points[a + 1]!, points[a + 2]!, points[b]!, points[b + 1]!, points[b + 2]!], i * 6)
  }
  return out
}

const asFloat32 = (data: ArrayLike<number>): Float32Array => data instanceof Float32Array ? data : Float32Array.from(data)

/** The number of vertices a line draws (two per segment), thick or not. */
export const lineVertexCount = (line: THREE.Object3D): number => {
  if (isThickLine(line)) return (line.geometry.attributes.instanceStart?.count ?? 0) * 2
  return (line as THREE.LineSegments).geometry?.getAttribute?.("position")?.count ?? 0
}

/**
 * Limits how many vertices of a line are drawn (the toolpath that grows as it plays). `Infinity` draws everything. Returns whether the
 * range changed, so the caller can ask for a frame only when it did.
 */
export const setLineDrawRange = (line: THREE.Object3D, vertices: number): boolean => {
  if (isThickLine(line)) {
    const total = line.geometry.attributes.instanceStart?.count ?? 0
    const next = Math.min(total, Math.max(0, Math.floor(vertices / 2)))
    const wanted = Number.isFinite(vertices) ? next : total
    if (line.geometry.instanceCount === wanted) return false
    line.geometry.instanceCount = wanted
    return true
  }
  const geometry = (line as THREE.LineSegments).geometry
  const count = Number.isFinite(vertices) ? Math.max(0, Math.floor(vertices)) : Infinity
  if (geometry.drawRange.count === count) return false
  geometry.setDrawRange(0, count)
  return true
}

/** Sets the resolution every thick line under `root` draws with. Rendering also keeps it right per viewport; this is for raycasting and before the first frame. */
export const syncLineResolution = (root: THREE.Object3D, width: number, height: number): void => {
  root.traverse((object) => {
    if (!isThickLine(object)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) if (material instanceof LineMaterial) material.resolution.set(Math.max(1, width), Math.max(1, height))
  })
}

/**
 * Line segments from endpoint pairs (`A B C D ...`: segment AB, segment CD). Thick when the tier and the budget allow it, else the
 * old 1 px `THREE.LineSegments` with the same colours and dashes.
 */
export const createLines = (positions: ArrayLike<number>, style: LineStyle = {}, options: LineOptions = {}): THREE.LineSegments | LineSegments2 => {
  const quality = options.quality ?? currentQuality
  const segments = Math.floor(positions.length / 6)
  const limits = LINE_SEGMENT_BUDGET[quality]
  const budget = options.budget ?? sharedLineBudget
  const release = quality !== "low" && segments > 0 && segments <= limits.perObject ? budget.acquire(segments, limits.total) : undefined
  const line = release ? thickLines(positions, style, release, LINE_WIDTH_SCALE[quality]) : plainLines(positions, style)
  if (!options.pickable) line.raycast = noRaycast
  return line
}

const plainLines = (positions: ArrayLike<number>, style: LineStyle): THREE.LineSegments => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(asFloat32(positions), 3))
  if (style.colors) geometry.setAttribute("color", new THREE.BufferAttribute(style.colors, 3))
  const common = { color: style.color ?? 0xffffff, vertexColors: style.colors !== undefined, depthTest: style.depthTest ?? true, ...(style.opacity !== undefined && style.opacity < 1 ? { transparent: true, opacity: style.opacity } : {}) }
  const material = style.dash ? new THREE.LineDashedMaterial({ ...common, dashSize: style.dash.dash, gapSize: style.dash.gap }) : new THREE.LineBasicMaterial(common)
  const line = new THREE.LineSegments(geometry, material)
  if (style.dash) line.computeLineDistances()
  return line
}

const thickLines = (positions: ArrayLike<number>, style: LineStyle, release: () => void, widthScale = 1): LineSegments2 => {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(asFloat32(positions))
  if (style.colors) geometry.setColors(style.colors)
  const material = new LineMaterial({
    color: new THREE.Color(style.color ?? 0xffffff).getHex(),
    linewidth: (style.width ?? 1.6) * widthScale,
    vertexColors: style.colors !== undefined,
    dashed: style.dash !== undefined,
    depthTest: style.depthTest ?? true,
    ...(style.opacity !== undefined && style.opacity < 1 ? { transparent: true, opacity: style.opacity } : {})
  })
  if (style.dash) { material.dashSize = style.dash.dash; material.gapSize = style.dash.gap }
  const line = new LineSegments2(geometry, material)
  if (style.dash) line.computeLineDistances()
  // The budget share goes back with the geometry, however the owner disposes of the object.
  geometry.addEventListener("dispose", release)
  return line
}

/** Edge endpoints of an `EdgesGeometry`-like geometry (its `position` attribute), or undefined while a native result is still on its way. */
const edgeEndpoints = (edges: THREE.BufferGeometry): ArrayLike<number> | undefined => edges.getAttribute("position")?.array

/**
 * The edges of a mesh as a group holding one line: `createDisplayEdges` (the native Rust path for a big mesh, with its Three.js
 * fallback) converted to a thick line. When the native result is not there yet the group is empty and fills itself in, calling
 * `onReady` once, like `createDisplayEdges` does.
 */
export const createDisplayEdgeLines = (
  source: THREE.BufferGeometry,
  thresholdAngle: number,
  onReady: (() => void) | undefined,
  style: LineStyle = {},
  options: LineOptions = {},
  prepare?: Parameters<typeof createDisplayEdges>[3]
): THREE.Group => {
  const group = new THREE.Group()
  group.name = "edges"
  let edges: THREE.BufferGeometry | undefined
  const fill = (): void => {
    const endpoints = edges && edgeEndpoints(edges)
    if (!endpoints || endpoints.length === 0) return
    const line = createLines(endpoints, style, options)
    group.add(line)
    // The converted line owns its copy of the pairs only when thick (it shares the array); the helper geometry holds no GPU data.
    edges!.dispose()
  }
  edges = createDisplayEdges(source, thresholdAngle, () => { fill(); onReady?.() }, ...(prepare ? [prepare] as const : []))
  fill()
  return group
}
