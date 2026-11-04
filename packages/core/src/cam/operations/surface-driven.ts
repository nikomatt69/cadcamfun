/**
 * Drive-curve finishing (spec 69 F3): the 3D finishing strategies that are defined by curves rather than by a raster, all resting on the
 * exact mesh drop-cutter (`mesh-drop-cutter.ts`) so the tool is on the surface at every point and never below it.
 *
 *   projection     curves drawn in XY, dropped onto the part
 *   morph          the curves between two boundary curves A and B, equal shares of arc length (a flow between two edges)
 *   isoparametric  lines of constant u or v of a parametric surface `(u, v) -> point`, dropped onto the part
 *   equidistant    the boundary offset inwards in steps of the stepover, each dropped onto the part
 *   engrave        projection with the tip held `depth` below the surface (a V-bit or ball cuts a groove following the relief)
 *   deburr         the sharp edges of the mesh (dihedral turn above `edgeAngle`) broken with a cone cutter: the cone's centre is moved off
 *                  the edge along the horizontal part of the edge's outward bisector so that the cone cuts the chamfer of the asked width
 *
 * Not built: flowline along the surface's own UV flow of an arbitrary mesh (only the morph between two boundaries), and deburring of
 * edges that run vertically (a vertical tool cannot break them: they are reported). The pencil strategy is `rest finishing` in `surface.ts`.
 *
 * Every strategy returns an ordinary `Toolpath` made of `Linear` moves; points where nothing of the part lies under the tool are left out
 * (the curve is split there) and counted.
 */
import { Schema } from "effect"
import { offsetPolyline } from "../../cad/offset.ts"
import { signedArea } from "../../cad/shapes.ts"
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { Toolpath } from "../ir.ts"
import { NonNegative, OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Stock, Tool } from "../tool.ts"
import { chamferGeometry } from "./chamfer.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"
import { MeshDropCutter, type DropMesh } from "./mesh-drop-cutter.ts"
import { cutterOf } from "./surface-field.ts"

export class DrivenParams extends Schema.Class<DrivenParams>("cam/DrivenParams")(
  Schema.Struct({
    ...OperationFields,
    /** Spacing of the points along a curve, mm. */
    sampling: withDefault(Positive, 0.5),
    /** Material left on the part, mm (the tool is held this far off the surface). */
    allowance: withDefault(NonNegative, 0),
    /** Distance between neighbouring curves of `morph`, `isoparametric` and `equidistant`, percent of the tool diameter. */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 20),
    /** `engrave`: depth of the groove below the surface, mm. */
    depth: withDefault(Positive, 0.2),
    /** `deburr`: edges whose faces turn by more than this many degrees are sharp. */
    edgeAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 170 })), 30),
    /** `deburr`: width of the chamfer on the faces, mm. */
    width: withDefault(Positive, 0.3),
    tipOffset: withDefault(NonNegative, 0.2)
  }).check(heightsOrdered)
) {}

export type DriveSpec =
  | { readonly kind: "projection"; readonly curves: ReadonlyArray<ReadonlyArray<Vec2>> }
  | { readonly kind: "morph"; readonly a: ReadonlyArray<Vec2>; readonly b: ReadonlyArray<Vec2> }
  | { readonly kind: "isoparametric"; readonly surface: (u: number, v: number) => Vec3; readonly direction: "u" | "v"; readonly samples?: number }
  | { readonly kind: "equidistant"; readonly boundary: ReadonlyArray<Vec2>; readonly count?: number }
  | { readonly kind: "engrave"; readonly curves: ReadonlyArray<ReadonlyArray<Vec2>> }
  | { readonly kind: "deburr" }

export interface DrivenResult {
  readonly toolpath: Toolpath
  readonly warnings: ReadonlyArray<string>
  readonly stats: { readonly curves: number; readonly points: number; readonly dropped: number; readonly edges?: number; readonly skippedEdges?: number }
}

const len = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/** The polyline resampled at `step` (the last point is kept). */
const resample = (pts: ReadonlyArray<Vec2>, step: number): Vec2[] => {
  if (pts.length < 2) return [...pts]
  const out: Vec2[] = [pts[0]!]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, l = len(a, b), n = Math.max(1, Math.ceil(l / step))
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return out
}

const lengthOf = (pts: ReadonlyArray<Vec2>): number => pts.reduce((s, p, i) => (i === 0 ? 0 : s + len(pts[i - 1]!, p)), 0)

/** The point at arc length fraction t of a polyline. */
const at = (pts: ReadonlyArray<Vec2>, cum: ReadonlyArray<number>, t: number): Vec2 => {
  const s = t * cum[cum.length - 1]!
  let i = 1
  while (i < cum.length - 1 && cum[i]! < s) i++
  const span = cum[i]! - cum[i - 1]!
  const u = span > 0 ? (s - cum[i - 1]!) / span : 0
  return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * u, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * u }
}
const cumulative = (pts: ReadonlyArray<Vec2>): number[] => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + len(pts[i - 1]!, pts[i]!)); return c }

/** Sharp edges of the mesh: shared by two faces whose normals differ by more than `degrees`, as segments with the outward bisector. */
const sharpEdges = (mesh: DropMesh, degrees: number): Array<{ readonly a: Vec3; readonly b: Vec3; readonly out: Vec3 }> => {
  const P = mesh.positions, I = mesh.indices
  const normals: Vec3[] = []
  const edges = new Map<string, { readonly a: number; readonly b: number; faces: number[] }>()
  for (let t = 0; t < I.length / 3; t++) {
    const [i0, i1, i2] = [I[t * 3]!, I[t * 3 + 1]!, I[t * 3 + 2]!]
    const u = { x: P[i1 * 3]! - P[i0 * 3]!, y: P[i1 * 3 + 1]! - P[i0 * 3 + 1]!, z: P[i1 * 3 + 2]! - P[i0 * 3 + 2]! }
    const w = { x: P[i2 * 3]! - P[i0 * 3]!, y: P[i2 * 3 + 1]! - P[i0 * 3 + 1]!, z: P[i2 * 3 + 2]! - P[i0 * 3 + 2]! }
    const n = { x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x }
    const l = Math.hypot(n.x, n.y, n.z) || 1
    normals.push({ x: n.x / l, y: n.y / l, z: n.z / l })
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const e = edges.get(key)
      if (e === undefined) edges.set(key, { a, b, faces: [t] }); else e.faces.push(t)
    }
  }
  const cosLimit = Math.cos((degrees * Math.PI) / 180)
  const out: Array<{ a: Vec3; b: Vec3; out: Vec3 }> = []
  for (const e of edges.values()) {
    if (e.faces.length !== 2) continue
    const n1 = normals[e.faces[0]!]!, n2 = normals[e.faces[1]!]!
    if (n1.x * n2.x + n1.y * n2.y + n1.z * n2.z > cosLimit) continue
    const bis = { x: n1.x + n2.x, y: n1.y + n2.y, z: n1.z + n2.z }
    const a = { x: P[e.a * 3]!, y: P[e.a * 3 + 1]!, z: P[e.a * 3 + 2]! }, b = { x: P[e.b * 3]!, y: P[e.b * 3 + 1]!, z: P[e.b * 3 + 2]! }
    out.push({ a, b, out: bis })
  }
  return out
}

/** Generates the path of one drive strategy over `part`. */
export const generateDriven = (params: DrivenParams, drive: DriveSpec, part: DropMesh, tool: Tool, stock: Stock): DrivenResult => {
  const warnings: string[] = []
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Drive finishing (${drive.kind}): ${params.name}`)
  const cutter = cutterOf(tool, params.allowance)
  const dc = new MeshDropCutter(part, cutter)
  const step = Math.max(1e-3, params.sampling)
  const spacing = Math.max(1e-3, (params.stepover / 100) * tool.diameter)
  let curves = 0, points = 0, dropped = 0, edges: number | undefined, skippedEdges: number | undefined

  /** Cuts a 3D polyline: the tool rises to the retract plane between runs. */
  const cut = (pts: ReadonlyArray<Vec3>): void => {
    if (pts.length < 2) return
    curves++
    approach(b, pts[0]!, levels)
    b.linear({ x: pts[0]!.x, y: pts[0]!.y, z: pts[0]!.z }, params.plungeFeed)
    for (let i = 1; i < pts.length; i++) b.linear(pts[i]!, params.feed)
    points += pts.length
    liftTo(b, levels.retractZ)
  }
  /** Drops a planar curve onto the part (minus `below`); splits it where nothing is under the tool. */
  const projectCurve = (curve: ReadonlyArray<Vec2>, below: number): void => {
    let run: Vec3[] = []
    for (const p of resample(curve, step)) {
      const z = dc.drop(p.x, p.y)
      if (z === -Infinity) { dropped++; cut(run); run = []; continue }
      run.push({ x: p.x, y: p.y, z: z + cutter.lift - below })
    }
    cut(run)
  }

  switch (drive.kind) {
    case "projection": drive.curves.forEach((c) => projectCurve(c, 0)); break
    case "engrave": drive.curves.forEach((c) => projectCurve(c, params.depth)); break
    case "morph": {
      const ca = cumulative(drive.a), cb = cumulative(drive.b)
      const gap = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => len(at(drive.a, ca, t), at(drive.b, cb, t))))
      const n = Math.max(1, Math.ceil(gap / spacing))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const m = Math.max(2, Math.ceil(Math.max(lengthOf(drive.a), lengthOf(drive.b)) / step))
        const curve = Array.from({ length: m + 1 }, (_, i) => {
          const s = i / m, p = at(drive.a, ca, s), q = at(drive.b, cb, s)
          return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
        })
        projectCurve(k % 2 === 0 ? curve : [...curve].reverse(), 0)
      }
      break
    }
    case "isoparametric": {
      const count = Math.max(2, drive.samples ?? 40)
      // Spacing between the lines from the surface's own extent across the lines, measured at mid-parameter.
      const probe = (a: number): number => { const p = drive.direction === "u" ? drive.surface(a, 0.5) : drive.surface(0.5, a), q = drive.direction === "u" ? drive.surface(a, 0.5 + 1e-3) : drive.surface(0.5 + 1e-3, a); return Math.hypot(q.x - p.x, q.y - p.y) / 1e-3 }
      const across = Math.max(...[0, 0.5, 1].map(probe)) || 1
      const lines = Math.max(2, Math.ceil(across / spacing) + 1)
      for (let i = 0; i < lines; i++) {
        const c = i / (lines - 1)
        const curve = Array.from({ length: count + 1 }, (_, k) => { const s = k / count; const p = drive.direction === "u" ? drive.surface(s, c) : drive.surface(c, s); return { x: p.x, y: p.y } })
        projectCurve(i % 2 === 0 ? curve : [...curve].reverse(), 0)
      }
      break
    }
    case "equidistant": {
      const ring = signedArea(drive.boundary) >= 0 ? [...drive.boundary] : [...drive.boundary].reverse()
      const maxN = drive.count ?? 1000
      for (let k = 0; k < maxN; k++) {
        const loops = offsetPolyline(ring, -k * spacing, true, { arcJoins: true, arcTolerance: 1e-3 })
        if (loops.length === 0) break
        for (const loop of loops) projectCurve([...loop, loop[0]!], 0)
      }
      break
    }
    case "deburr": {
      const geometry = chamferGeometry({ radius: tool.diameter / 2, tipRadius: tool.tipRadius ?? 0, halfAngle: ((tool.angle ?? 90) * Math.PI) / 360 }, params.width, params.tipOffset)
      if (!geometry.fits) { warnings.push(`The cone reaches Ø${tool.diameter}; a ${params.width} mm chamfer needs Ø${(2 * geometry.topRadius).toFixed(3)}`); break }
      const found = sharpEdges(part, params.edgeAngle)
      edges = found.length
      skippedEdges = 0
      const runs: Vec3[][] = []
      for (const e of found) {
        const horiz = Math.hypot(e.out.x, e.out.y)
        const lenXY = len(e.a, e.b)
        // A vertical tool cannot break an edge that has no horizontal outward direction, that is itself vertical, or that faces down.
        if (horiz < 0.2 || lenXY < 1e-6 || e.out.z <= 1e-6) { skippedEdges++; continue }
        const ox = (e.out.x / horiz) * geometry.offset, oy = (e.out.y / horiz) * geometry.offset
        const n = Math.max(1, Math.ceil(lenXY / step))
        runs.push(Array.from({ length: n + 1 }, (_, k) => {
          const t = k / n
          return { x: e.a.x + (e.b.x - e.a.x) * t + ox, y: e.a.y + (e.b.y - e.a.y) * t + oy, z: e.a.z + (e.b.z - e.a.z) * t - geometry.tipDepth }
        }))
      }
      runs.forEach(cut)
      if (skippedEdges > 0) warnings.push(`${skippedEdges} sharp edge(s) face down, run vertically or have no horizontal outward direction: a vertical tool cannot break them`)
      break
    }
  }
  if (!b.started) b.comment("nothing to cut: no drive curve meets the part")
  finish(b, levels)
  return {
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves },
    warnings, stats: { curves, points, dropped, ...(edges !== undefined ? { edges, skippedEdges: skippedEdges ?? 0 } : {}) }
  }
}
