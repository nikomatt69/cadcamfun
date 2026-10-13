/**
 * Design for manufacture: the engineering rules a part has to meet before it is worth programming, checked on a parametric history
 * and the bodies it builds. It answers "can this be made, with this tool, on this process" with numbers, not opinions: each finding
 * carries the measured value, the required one and what to change.
 *
 *   mill   internal corner radius against the cutter, pocket depth against the cutter diameter, drilled-hole depth ratio, hole edge
 *          distance and spacing, thin walls, machine envelope
 *   turn   length / diameter of the turned body (tailstock, steady rest), thin walls
 *   print  overhangs steeper than 45 degrees that need support, thin walls, holes below the nozzle resolution
 *
 * and, for every process, the habits that keep a parametric model editable: fully constrained sketches and dimensions that are
 * named parameters instead of literals. The rules are the usual shop-floor limits (they are in `DFM_LIMITS`); a process, tool or
 * material changes them, a project can override each.
 */
import { dimensionValue, type Dimension } from "./expr.ts"
import { minEdgeDistance } from "./fasteners.ts"
import { rebuild, type Feature, type History, type PlaneName, type RebuildResult } from "./history.ts"
import { sharpVertices, treatCorners } from "./profile-shape.ts"
import { sketchProfiles } from "./sketch.ts"
import { meshBounds, meshVolume, type Mesh } from "./solid.ts"
import type { Vec2 } from "./vec.ts"

export type DfmProcess = "mill" | "turn" | "print"
export type DfmMaterial = "metal" | "cast" | "plastic"
export type DfmSeverity = "error" | "warning" | "info"

export interface DfmOptions {
  readonly process?: DfmProcess
  /** The smallest cutter that finishes the part (endmill diameter), mm. Default 6. */
  readonly toolDiameter?: number
  readonly material?: DfmMaterial
  /** Overrides the minimum wall of the process / material, mm. */
  readonly minWall?: number
  /** Travel of the machine (or the build volume): a body that does not fit is an error. */
  readonly envelope?: { readonly x: number; readonly y: number; readonly z: number }
  /** Overrides any limit of `DFM_LIMITS`. */
  readonly limits?: Partial<DfmLimits>
}

export interface DfmLimits {
  /** Pocket depth / cutter diameter: above this the tool is long and deflects (warning); above `pocketDepthHard` it needs a special tool. */
  readonly pocketDepthRatio: number
  readonly pocketDepthHard: number
  /** Drilled hole depth / diameter: peck drilling above `drillRatio`, deep-hole drilling above `drillHard`. */
  readonly drillRatio: number
  readonly drillHard: number
  /** Turned part length / diameter: tailstock above `turnRatio`, steady rest above `turnHard`. */
  readonly turnRatio: number
  readonly turnHard: number
  /** Fraction of the surface that overhangs before a print needs a support warning. */
  readonly overhangShare: number
  /** Overhang angle from the vertical, degrees, beyond which a face needs support. */
  readonly overhangAngle: number
  /** Smallest hole a printer resolves, mm. */
  readonly printMinHole: number
}

export const DFM_LIMITS: DfmLimits = {
  pocketDepthRatio: 4, pocketDepthHard: 8,
  drillRatio: 5, drillHard: 10,
  turnRatio: 8, turnHard: 12,
  overhangShare: 0.05, overhangAngle: 45,
  printMinHole: 1
}

/** Minimum wall, mm, by process and material (rules of thumb for rigid walls of 10 to 50 mm height). */
export const MIN_WALL: Readonly<Record<DfmProcess, Readonly<Record<DfmMaterial, number>>>> = {
  mill: { metal: 0.8, cast: 3, plastic: 1.5 },
  turn: { metal: 1, cast: 3, plastic: 1.5 },
  print: { metal: 1, cast: 1, plastic: 1.2 }
}

export interface DfmIssue {
  readonly severity: DfmSeverity
  readonly code: string
  readonly feature?: string
  readonly message: string
  readonly measured?: number
  readonly required?: number
  readonly at?: { readonly x: number; readonly y: number; readonly z: number }
  /** What to change. */
  readonly fix?: string
}

export interface DfmReport {
  /** No errors (warnings and info do not stop a part). */
  readonly ok: boolean
  readonly process: DfmProcess
  readonly toolDiameter: number
  readonly issues: ReadonlyArray<DfmIssue>
  readonly metrics: {
    readonly bodies: number
    readonly volumeMm3: number
    readonly surfaceMm2: number
    readonly size: { readonly x: number; readonly y: number; readonly z: number } | null
    /** Thinnest wall found by ray sampling, mm (null when there is no solid). */
    readonly minWallMm: number | null
  }
}

type V3 = { readonly x: number; readonly y: number; readonly z: number }

const FRAME_UV: Readonly<Record<PlaneName, { readonly u: V3; readonly v: V3 }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 } }
}

const round = (value: number, decimals = 3): number => Number(value.toFixed(decimals))

const pointSegmentDistance = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const insideRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const ringArea = (ring: ReadonlyArray<Vec2>): number => {
  let a = 0
  for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.y - q.x * p.y }
  return a / 2
}

/** Circumradius of three points (Infinity when collinear). */
const circumradius = (a: Vec2, b: Vec2, c: Vec2): number => {
  const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y)
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return twiceArea < 1e-12 ? Infinity : (ab * bc * ca) / (2 * twiceArea)
}

export interface CornerReport {
  /** Smallest radius of curvature of the free-space corners, mm (0 for a sharp corner). */
  readonly minRadius: number
  /** Number of sharp (zero radius) free-space corners. */
  readonly sharp: number
  readonly at: Vec2
}

/**
 * The tightest corners a cutter has to turn in a loop. `freeInside` says on which side the cutter works: inside a pocket, the free
 * space is the loop's inside and its convex vertices are the corners to check; round an outer contour, the free space is outside and
 * the reflex vertices are. A vertex that turns more than 10 degrees is sharp (radius 0); a gentler one is part of a curve and its
 * radius is that of the circle through it and its neighbours.
 */
export const freeSpaceCorners = (loop: ReadonlyArray<Vec2>, freeInside: boolean): CornerReport => {
  const ccw = ringArea(loop) >= 0 ? loop : [...loop].reverse()
  const n = ccw.length
  const sharpAt = sharpVertices(ccw)
  let minRadius = Infinity, sharp = 0
  let at: Vec2 = ccw[0]!
  for (let i = 0; i < n; i++) {
    const a = ccw[(i + n - 1) % n]!, b = ccw[i]!, c = ccw[(i + 1) % n]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const convex = cross > 0
    if (convex !== freeInside) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9 || Math.hypot(c.x - b.x, c.y - b.y) < 1e-9) continue
    const radius = sharpAt[i]! ? 0 : circumradius(a, b, c)
    if (sharpAt[i]!) sharp++
    if (radius < minRadius) { minRadius = radius; at = b }
  }
  return { minRadius, sharp, at }
}

/** Möller-Trumbore, two-sided: the distance along the ray to the triangle, or undefined. */
const rayTriangle = (o: V3, d: V3, p: Float32Array, i0: number, i1: number, i2: number): number | undefined => {
  const ax = p[i0]!, ay = p[i0 + 1]!, az = p[i0 + 2]!
  const e1x = p[i1]! - ax, e1y = p[i1 + 1]! - ay, e1z = p[i1 + 2]! - az
  const e2x = p[i2]! - ax, e2y = p[i2 + 1]! - ay, e2z = p[i2 + 2]! - az
  const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x
  const det = e1x * hx + e1y * hy + e1z * hz
  if (Math.abs(det) < 1e-12) return undefined
  const inv = 1 / det
  const sx = o.x - ax, sy = o.y - ay, sz = o.z - az
  const u = inv * (sx * hx + sy * hy + sz * hz)
  if (u < -1e-9 || u > 1 + 1e-9) return undefined
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
  const v = inv * (d.x * qx + d.y * qy + d.z * qz)
  if (v < -1e-9 || u + v > 1 + 1e-9) return undefined
  const t = inv * (e2x * qx + e2y * qy + e2z * qz)
  return t > 1e-7 ? t : undefined
}

/** Cosine of the steepest angle between the sampling ray and a surface normal that still counts as the far side of a wall (65 degrees). */
const GRAZING = Math.cos((65 * Math.PI) / 180)

export interface WallReport {
  /** Thinnest wall seen, mm. */
  readonly min: number
  readonly at: V3
  /** Share of the sampled faces thinner than the threshold. */
  readonly thinShare: number
  readonly samples: number
}

/**
 * Wall thickness by ray sampling: from the centre of up to `maxSamples` faces a ray goes into the solid (against the face normal) and
 * the distance to the first surface it meets is the local thickness. The thinnest sample is the thin wall; its position says where.
 * Needs a closed mesh with outward faces, which is what the history builds.
 */
export const wallThickness = (mesh: Mesh, threshold: number, maxSamples = 400): WallReport | undefined => {
  const p = mesh.positions, idx = mesh.indices
  const triangles = Math.floor(idx.length / 3)
  if (triangles === 0) return undefined
  const stride = Math.max(1, Math.floor(triangles / maxSamples))
  let min = Infinity, at: V3 = { x: 0, y: 0, z: 0 }, thin = 0, samples = 0
  for (let t = 0; t < triangles; t += stride) {
    const i0 = idx[3 * t]! * 3, i1 = idx[3 * t + 1]! * 3, i2 = idx[3 * t + 2]! * 3
    const e1 = { x: p[i1]! - p[i0]!, y: p[i1 + 1]! - p[i0 + 1]!, z: p[i1 + 2]! - p[i0 + 2]! }
    const e2 = { x: p[i2]! - p[i0]!, y: p[i2 + 1]! - p[i0 + 1]!, z: p[i2 + 2]! - p[i0 + 2]! }
    const nx = e1.y * e2.z - e1.z * e2.y, ny = e1.z * e2.x - e1.x * e2.z, nz = e1.x * e2.y - e1.y * e2.x
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) continue
    const dir = { x: -nx / len, y: -ny / len, z: -nz / len }
    const c = { x: (p[i0]! + p[i1]! + p[i2]!) / 3, y: (p[i0 + 1]! + p[i1 + 1]! + p[i2 + 1]!) / 3, z: (p[i0 + 2]! + p[i1 + 2]! + p[i2 + 2]!) / 3 }
    let best = Infinity
    for (let u = 0; u < triangles; u++) {
      if (u === t) continue
      const hit = rayTriangle(c, dir, p, idx[3 * u]! * 3, idx[3 * u + 1]! * 3, idx[3 * u + 2]! * 3)
      if (hit === undefined || hit >= best) continue
      // A surface the ray meets at a grazing angle (steeper than 65 degrees off its normal) is a tapering wall seen edge-on, not
      // the other side of this wall: the distance to it says nothing about the thickness.
      const j0 = idx[3 * u]! * 3, j1 = idx[3 * u + 1]! * 3, j2 = idx[3 * u + 2]! * 3
      const f1 = { x: p[j1]! - p[j0]!, y: p[j1 + 1]! - p[j0 + 1]!, z: p[j1 + 2]! - p[j0 + 2]! }, f2 = { x: p[j2]! - p[j0]!, y: p[j2 + 1]! - p[j0 + 1]!, z: p[j2 + 2]! - p[j0 + 2]! }
      const hx = f1.y * f2.z - f1.z * f2.y, hy = f1.z * f2.x - f1.x * f2.z, hz = f1.x * f2.y - f1.y * f2.x
      const hl = Math.hypot(hx, hy, hz)
      if (hl < 1e-12 || Math.abs(hx * dir.x + hy * dir.y + hz * dir.z) / hl < GRAZING) continue
      best = hit
    }
    if (!Number.isFinite(best)) continue
    samples++
    if (best < threshold) thin++
    if (best < min) { min = best; at = c }
  }
  return samples === 0 ? undefined : { min, at, thinShare: thin / samples, samples }
}

/** Area of the mesh, and the part of it facing down more steeply than `angle` degrees from the vertical, off the bed. */
export const overhangArea = (mesh: Mesh, angle: number): { readonly total: number; readonly overhang: number } => {
  const p = mesh.positions, idx = mesh.indices
  const bounds = meshBounds(mesh)
  const limit = -Math.sin((angle * Math.PI) / 180)
  let total = 0, overhang = 0
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const i0 = idx[t]! * 3, i1 = idx[t + 1]! * 3, i2 = idx[t + 2]! * 3
    const e1 = { x: p[i1]! - p[i0]!, y: p[i1 + 1]! - p[i0 + 1]!, z: p[i1 + 2]! - p[i0 + 2]! }
    const e2 = { x: p[i2]! - p[i0]!, y: p[i2 + 1]! - p[i0 + 1]!, z: p[i2 + 2]! - p[i0 + 2]! }
    const nx = e1.y * e2.z - e1.z * e2.y, ny = e1.z * e2.x - e1.x * e2.z, nz = e1.x * e2.y - e1.y * e2.x
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue
    const area = len / 2
    total += area
    const onBed = Math.max(p[i0 + 2]!, p[i1 + 2]!, p[i2 + 2]!) < bounds.minZ + 1e-4
    if (!onBed && nz / len < limit) overhang += area
  }
  return { total, overhang }
}

const meshArea = (mesh: Mesh): number => overhangArea(mesh, 90).total

export interface HoleSite {
  readonly feature: string
  readonly plane: PlaneName
  readonly offset: number
  readonly u: number
  readonly v: number
  readonly diameter: number
  readonly depth: number
  /** The id of the hole feature this site comes from (a pattern copy keeps its source's id). */
  readonly source: string
}

/** The numeric value of a dimension, or undefined when it cannot be evaluated (the rebuild reports why). */
const value = (d: Dimension | undefined, parameters: Readonly<Record<string, number>>): number | undefined => {
  if (d === undefined) return undefined
  try { return dimensionValue(d, parameters) } catch { return undefined }
}

/** Every hole of the history in plane coordinates, with the copies the patterns make. */
export const holeSites = (history: History, parameters: Readonly<Record<string, number>>): HoleSite[] => {
  const base = new Map<string, HoleSite>()
  const sites: HoleSite[] = []
  for (const f of history.features) {
    if (f.type === "hole") {
      // Holes on a work plane (not XY, YZ or ZX) are outside this check: it measures in the three base planes.
      if (!Object.hasOwn(FRAME_UV, f.plane)) continue
      const u = value(f.at[0], parameters), v = value(f.at[1], parameters), diameter = value(f.diameter, parameters), depth = value(f.depth, parameters)
      if (u === undefined || v === undefined || diameter === undefined || depth === undefined) continue
      const site: HoleSite = { feature: f.id, source: f.id, plane: f.plane as PlaneName, offset: value(f.offset, parameters) ?? 0, u, v, diameter, depth }
      base.set(f.id, site)
      sites.push(site)
    } else if (f.type === "pattern") {
      const source = base.get(f.feature)
      const count = value(f.count, parameters)
      if (source === undefined || count === undefined || !Number.isInteger(count) || count < 2) continue
      if (f.kind === "grid") {
        const rows = value(f.countB, parameters)
        const a = (f.step ?? [0, 0, 0]).map((d) => value(d, parameters)), b = (f.stepB ?? [0, 0, 0]).map((d) => value(d, parameters))
        if (rows === undefined || !Number.isInteger(rows) || a.some((d) => d === undefined) || b.some((d) => d === undefined)) continue
        const { u, v } = FRAME_UV[source.plane]
        const proj = (w: ReadonlyArray<number | undefined>, axis: V3): number => w[0]! * axis.x + w[1]! * axis.y + w[2]! * axis.z
        for (let i = 0; i < count; i++) for (let j = 0; j < rows; j++) {
          if (i === 0 && j === 0) continue
          sites.push({ ...source, feature: `${f.id}#${i}.${j}`, u: source.u + proj(a, u) * i + proj(b, u) * j, v: source.v + proj(a, v) * i + proj(b, v) * j })
        }
      } else if (f.kind === "linear") {
        const step = (f.step ?? [0, 0, 0]).map((s) => value(s, parameters))
        if (step.some((s) => s === undefined)) continue
        const { u, v } = FRAME_UV[source.plane]
        const du = step[0]! * u.x + step[1]! * u.y + step[2]! * u.z, dv = step[0]! * v.x + step[1]! * v.y + step[2]! * v.z
        for (let i = 1; i < count; i++) sites.push({ ...source, feature: `${f.id}#${i}`, u: source.u + du * i, v: source.v + dv * i })
      } else if (source.plane === "XY") {
        const c = (f.centre ?? [0, 0]).map((s) => value(s, parameters))
        const span = f.span === undefined ? 360 : value(f.span, parameters)
        if (c.some((s) => s === undefined) || span === undefined) continue
        const each = span >= 360 - 1e-9 ? span / count : span / (count - 1)
        for (let i = 1; i < count; i++) {
          const a = (each * i * Math.PI) / 180
          const dx = source.u - c[0]!, dy = source.v - c[1]!
          sites.push({ ...source, feature: `${f.id}#${i}`, u: c[0]! + dx * Math.cos(a) - dy * Math.sin(a), v: c[1]! + dx * Math.sin(a) + dy * Math.cos(a) })
        }
      }
      // The copies of a pattern are never sources themselves.
    }
  }
  return sites
}

/** Segments of the outlines of the material in a plane: every loop of the sketches that add material on that plane. */
const outlineSegments = (history: History, result: RebuildResult, plane: PlaneName): Array<readonly [Vec2, Vec2]> => {
  const segments: Array<readonly [Vec2, Vec2]> = []
  for (const f of history.features) {
    if (f.type !== "extrude" || f.operation === "subtract" || f.operation === "intersect") continue
    const sk = result.sketches[f.sketch]
    if (sk === undefined || sk.plane !== plane || sk.solve.status === "conflicting" || sk.solve.status === "failed") continue
    for (const loop of sketchProfiles(sk.solve.sketch).loops) for (let i = 0; i < loop.length; i++) segments.push([loop[i]!, loop[(i + 1) % loop.length]!])
  }
  return segments
}

/** The rectangle of the bodies seen along the plane's normal: the fallback outline when no sketch lies on the plane. */
const bodyOutline = (result: RebuildResult, plane: PlaneName): Array<readonly [Vec2, Vec2]> => {
  if (result.bodies.length === 0) return []
  const { u, v } = FRAME_UV[plane]
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const body of result.bodies) {
    const p = body.mesh.positions
    for (let i = 0; i < p.length; i += 3) {
      const a = p[i]! * u.x + p[i + 1]! * u.y + p[i + 2]! * u.z, b = p[i]! * v.x + p[i + 1]! * v.y + p[i + 2]! * v.z
      if (a < minU) minU = a
      if (a > maxU) maxU = a
      if (b < minV) minV = b
      if (b > maxV) maxV = b
    }
  }
  const c = [{ x: minU, y: minV }, { x: maxU, y: minV }, { x: maxU, y: maxV }, { x: minU, y: maxV }]
  return c.map((p, i) => [p, c[(i + 1) % 4]!] as const)
}

const sizeOf = (result: RebuildResult): { x: number; y: number; z: number } | null => {
  if (result.bodies.length === 0) return null
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const body of result.bodies) {
    const b = meshBounds(body.mesh)
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); minZ = Math.min(minZ, b.minZ)
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); maxZ = Math.max(maxZ, b.maxZ)
  }
  return Number.isFinite(minX) ? { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } : null
}

const LITERAL_PATHS: ReadonlyArray<readonly [Feature["type"], string]> = [["extrude", "depth"], ["hole", "diameter"], ["hole", "depth"]]

/** Reads a parametric history for what cannot be made, or made well, on the process; never changes anything. */
export const analyzeManufacturability = (history: History, options: DfmOptions = {}): DfmReport => {
  const process = options.process ?? "mill"
  const material = options.material ?? "metal"
  const tool = options.toolDiameter ?? 6
  const limits: DfmLimits = { ...DFM_LIMITS, ...options.limits }
  const issues: DfmIssue[] = []
  const add = (issue: DfmIssue): void => { issues.push(issue) }
  const result = rebuild(history)
  for (const i of result.issues) add({ severity: i.severity === "error" ? "error" : "warning", code: "REBUILD", feature: i.feature, message: i.message })
  const parameters = result.parameters

  // Sketch intent: a fully constrained sketch survives a parameter change; a loose one moves.
  for (const [id, sk] of Object.entries(result.sketches)) {
    if (sk.solve.status === "under-constrained") {
      add({ severity: "info", code: "UNDER_CONSTRAINED", feature: id, message: `Sketch '${id}' has ${sk.solve.dof} degree(s) of freedom left: a parameter change can move it`, measured: sk.solve.dof, required: 0, fix: "Add dimensions and relations (fixed origin, horizontal / vertical, lengths) until it is fully constrained" })
    }
  }
  const literals = history.features.flatMap((f) => LITERAL_PATHS.filter(([type]) => type === f.type).flatMap(([, key]) => {
    const dim = (f as unknown as Record<string, Dimension>)[key]
    return typeof dim === "number" ? [`${f.id}.${key}`] : []
  }))
  if (literals.length > 0 && Object.keys(history.parameters).length > 0) {
    add({ severity: "info", code: "LITERAL_DIMENSION", message: `${literals.length} key dimension(s) are literals, not parameters: ${literals.slice(0, 6).join(", ")}${literals.length > 6 ? ", ..." : ""}`, measured: literals.length, fix: "Name them as parameters so one edit drives the part" })
  }

  const toolRadius = tool / 2
  if (process === "mill") {
    for (const f of history.features) {
      if (f.type !== "extrude") continue
      const sk = result.sketches[f.sketch]
      if (sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed") continue
      const pocket = f.operation === "subtract"
      const depthValue = value(f.depth, parameters)
      const raw = sketchProfiles(sk.solve.sketch).loops
      // The corners the feature rounds or bevels are not the corners the cutter meets.
      const cornerSize = f.corner === undefined ? undefined : value(f.corner.size, parameters)
      let loops = raw
      if (f.corner !== undefined && cornerSize !== undefined) {
        try { loops = raw.map((l) => treatCorners(l, f.corner!.style, cornerSize)) } catch { loops = raw }
      }
      const nesting = loops.map((l, i) => loops.filter((o, j) => j !== i && insideRing(l[0]!, o)).length)
      let worst: { radius: number; sharp: number; at: Vec2; loop: number } | undefined
      loops.forEach((loop, i) => {
        // In a pocket the even loops are cut away (free inside); in a boss the even loops are material (free outside).
        const freeInside = pocket ? nesting[i]! % 2 === 0 : nesting[i]! % 2 === 1
        const corners = freeSpaceCorners(loop, freeInside)
        if (corners.minRadius < toolRadius - 1e-6 && (worst === undefined || corners.minRadius < worst.radius)) worst = { radius: corners.minRadius, sharp: corners.sharp, at: corners.at, loop: i }
      })
      if (worst !== undefined) {
        const w = worst as { radius: number; sharp: number; at: Vec2; loop: number }
        add({
          severity: "error", code: "INTERNAL_CORNER", feature: f.id,
          message: `${w.sharp > 0 ? `${w.sharp} sharp inside corner(s)` : "A tight curve"} in '${f.sketch}' (radius ${round(w.radius)} mm at ${round(w.at.x)}, ${round(w.at.y)}) cannot be cut by a ${tool} mm cutter, which leaves a radius of ${round(toolRadius)} mm`,
          measured: round(w.radius), required: round(toolRadius),
          fix: `Round the inside corners to at least R${round(toolRadius)} (extrude.corner fillet), or finish with a cutter of ${round(Math.max(0, w.radius * 2))} mm or less`
        })
      }
      if (pocket && depthValue !== undefined && depthValue / tool > limits.pocketDepthRatio) {
        const hard = depthValue / tool > limits.pocketDepthHard
        add({
          severity: hard ? "error" : "warning", code: "DEEP_POCKET", feature: f.id,
          message: `Pocket ${round(depthValue)} mm deep is ${round(depthValue / tool, 1)} diameters of the ${tool} mm cutter${hard ? ": beyond what a standard cutter reaches" : ": the cutter deflects, so it cuts in layers with reduced feed"}`,
          measured: round(depthValue / tool, 2), required: hard ? limits.pocketDepthHard : limits.pocketDepthRatio,
          fix: hard ? "Use a larger cutter, a reduced-neck tool, or make the pocket shallower or wider" : "Use a larger cutter or accept reduced feed and stepdown"
        })
      }
    }
  }

  // Holes, for every process that drills or prints them.
  const sites = holeSites(history, parameters)
  for (const site of sites) {
    const ratio = site.depth / site.diameter
    if (process === "mill" && ratio > limits.drillRatio) {
      const hard = ratio > limits.drillHard
      add({
        severity: hard ? "error" : "warning", code: "DEEP_HOLE", feature: site.feature,
        message: `Hole Ø${round(site.diameter)} x ${round(site.depth)} mm deep is ${round(ratio, 1)} diameters: ${hard ? "it needs deep-hole (gun) drilling" : "it needs peck drilling with chip breaks"}`,
        measured: round(ratio, 2), required: hard ? limits.drillHard : limits.drillRatio,
        fix: hard ? "Make the hole shallower, larger, or through from both sides" : "Use a peck cycle (G83), or reduce the depth"
      })
    }
    if (process === "print" && site.diameter < limits.printMinHole) {
      add({ severity: "warning", code: "SMALL_HOLE", feature: site.feature, message: `Hole Ø${round(site.diameter)} mm is below what the printer resolves (${limits.printMinHole} mm)`, measured: round(site.diameter), required: limits.printMinHole, fix: "Print it undersized and drill it, or enlarge it" })
    }
    if (process === "mill" && site.diameter < 14 && Math.abs(site.diameter * 10 - Math.round(site.diameter * 10)) > 1e-6) {
      add({ severity: "info", code: "NON_STANDARD_DRILL", feature: site.feature, message: `Hole Ø${round(site.diameter, 4)} mm is not a standard drill size (steps of 0.1 mm below 14 mm)`, measured: site.diameter, fix: "Use a standard size, or plan to ream / bore it" })
    }
    const own = outlineSegments(history, result, site.plane)
    const segments = own.length > 0 ? own : bodyOutline(result, site.plane)
    let edge = Infinity
    for (const [a, b] of segments) edge = Math.min(edge, pointSegmentDistance({ x: site.u, y: site.v }, a, b))
    const needed = minEdgeDistance(site.diameter, material)
    if (Number.isFinite(edge) && edge < needed - 1e-6) {
      add({
        severity: edge < site.diameter / 2 ? "error" : "warning", code: "HOLE_EDGE_DISTANCE", feature: site.feature,
        message: `Hole Ø${round(site.diameter)} mm is ${round(edge)} mm from the edge (centre to edge); ${round(needed)} mm keeps the web strong`,
        measured: round(edge), required: round(needed), fix: "Move the hole inwards or make the part larger there"
      })
    }
  }
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    const a = sites[i]!, b = sites[j]!
    if (a.plane !== b.plane || Math.abs(a.offset - b.offset) > 1e-6) continue
    const centres = Math.hypot(a.u - b.u, a.v - b.v)
    const needed = 2 * Math.max(a.diameter, b.diameter)
    if (centres < needed - 1e-6) {
      add({
        severity: centres < (a.diameter + b.diameter) / 2 ? "error" : "warning", code: "HOLE_SPACING", feature: a.feature,
        message: `Holes '${a.feature}' and '${b.feature}' are ${round(centres)} mm apart (centre to centre); ${round(needed)} mm leaves a web as wide as the hole`,
        measured: round(centres), required: round(needed), fix: "Space the holes further apart or reduce their diameter"
      })
    }
  }

  // The solid itself: envelope, walls, overhangs, slenderness.
  const size = sizeOf(result)
  if (size !== null && options.envelope !== undefined) {
    const e = options.envelope
    const axes = ([["X", size.x, e.x], ["Y", size.y, e.y], ["Z", size.z, e.z]] as const).filter(([, have, limit]) => have > limit + 1e-6)
    for (const [axis, have, limit] of axes) add({ severity: "error", code: "EXCEEDS_ENVELOPE", message: `The part is ${round(have)} mm along ${axis}; the machine / build volume allows ${round(limit)} mm`, measured: round(have), required: round(limit), fix: "Make the part smaller, split it, or choose a bigger machine" })
  }
  const minWall = options.minWall ?? MIN_WALL[process][material]
  let thinnest: number | null = null
  let surface = 0
  let overhang = 0
  for (const body of result.bodies) {
    surface += meshArea(body.mesh)
    const walls = wallThickness(body.mesh, minWall)
    if (walls !== undefined) {
      thinnest = thinnest === null ? walls.min : Math.min(thinnest, walls.min)
      if (walls.min < minWall - 1e-6) {
        add({
          severity: walls.min < minWall / 2 ? "error" : "warning", code: "THIN_WALL", feature: body.feature,
          message: `Wall of ${round(walls.min)} mm near ${round(walls.at.x, 1)}, ${round(walls.at.y, 1)}, ${round(walls.at.z, 1)} (${Math.round(walls.thinShare * 100)} % of the sampled faces are thin); the ${process} process needs ${round(minWall)} mm in ${material}`,
          measured: round(walls.min), required: round(minWall), at: walls.at, fix: "Thicken the wall, or reduce the depth of the pocket beside it"
        })
      }
    }
    if (process === "print") overhang += overhangArea(body.mesh, limits.overhangAngle).overhang
    if (process === "turn" && body.feature !== undefined) {
      const b = meshBounds(body.mesh)
      const extents = [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ].sort((x, y) => y - x)
      const length = extents[0]!, diameter = extents[1]!
      if (diameter > 0 && length / diameter > limits.turnRatio) {
        const hard = length / diameter > limits.turnHard
        add({
          severity: hard ? "error" : "warning", code: "SLENDER_TURNING", feature: body.feature,
          message: `Turned part ${round(length)} mm long on Ø${round(diameter)} mm is ${round(length / diameter, 1)} diameters: ${hard ? "it needs a steady rest as well as the tailstock" : "it needs the tailstock"}`,
          measured: round(length / diameter, 2), required: hard ? limits.turnHard : limits.turnRatio,
          fix: "Turn it between centres, or shorten it / thicken it"
        })
      }
    }
  }
  if (process === "print" && surface > 0 && overhang / surface > limits.overhangShare) {
    add({ severity: "warning", code: "OVERHANG", message: `${Math.round((overhang / surface) * 100)} % of the surface overhangs more than ${limits.overhangAngle} degrees and needs support`, measured: round(overhang / surface, 3), required: limits.overhangShare, fix: "Orient the part so the large faces lie flat, add chamfers of 45 degrees instead of overhangs, or accept supports" })
  }

  const volume = result.bodies.reduce((sum, b) => sum + Math.abs(meshVolume(b.mesh)), 0)
  return {
    ok: !issues.some((i) => i.severity === "error"),
    process, toolDiameter: tool, issues,
    metrics: { bodies: result.bodies.length, volumeMm3: round(volume, 2), surfaceMm2: round(surface, 2), size: size === null ? null : { x: round(size.x), y: round(size.y), z: round(size.z) }, minWallMm: thinnest === null ? null : round(thinnest) }
  }
}
