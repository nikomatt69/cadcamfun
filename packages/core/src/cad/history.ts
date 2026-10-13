/**
 * Parametric feature history: a model described as a table of named parameters and an ordered list of features (sketches, extrusions,
 * revolutions, holes, patterns) that are replayed from the top whenever anything changes. Edit `width` and every sketch that uses it
 * re-solves, every solid built from those sketches is rebuilt, and every Boolean after it is redone.
 *
 *   parameters  numbers or expressions of other parameters (`expr.ts`): `"width": 40`, `"half": "width / 2"`, `"hole": "half - 3in"`
 *   sketch      a plane (XY, YZ or ZX, with an offset along its normal) and a constraint sketch (`sketch.ts`) whose dimensions are
 *               numbers or expressions; solved at every rebuild
 *   extrude     the closed profiles of a sketch pushed along the plane's normal; loops inside loops are holes (even-odd), so a ring is
 *               drawn as two circles; combined with the existing bodies as a new body, a union, a subtraction or an intersection
 *   revolve     a profile turned about an axis of its sketch (a line, or the plane's own x or y axis) through an angle
 *   hole        a cylinder at a point of a plane, subtracted
 *   pattern     copies of the tool of an earlier extrude / revolve / hole along a line or round the Z axis, each applied the same way
 *
 * Bodies are triangle meshes (`csg.ts`): the Boolean results are exact up to the meshing tolerance, not an exact B-rep, and there is
 * no fillet, chamfer or shell yet (they need the topology a mesh does not have; see spec 12). A feature that cannot be built is
 * reported in `issues` and skipped; the features that do not depend on it still build.
 *
 * Planes are right-handed: XY has u = X, v = Y, normal +Z; YZ has u = Y, v = Z, normal +X; ZX has u = Z, v = X, normal +Y.
 */
import { booleanMesh, mergeMeshes, rotateMesh, translateMesh } from "./csg.ts"
import { dimensionValue, resolveParameters, type Dimension, type ParameterTable } from "./expr.ts"
import { SketchError, polygonArea, sketchProfiles, solveSketch, type Constraint, type SketchEntity, type SolveResult } from "./sketch.ts"
import type { Vec2 } from "./vec.ts"
import { meshBounds, meshOf, meshVolume, type Mesh } from "./solid.ts"
import { edgedHoleTool, edgedPrism, moveRing, taperedHoleTool, taperedPrism, treatCorners, type EdgeShape, type TreatmentStyle } from "./profile-shape.ts"
import { loftSolid, roundPath, sweepSolid, type P3 } from "./sweep-loft.ts"
import { blendEdges, findEdges, selectEdges } from "./edge-blend.ts"

export type PlaneName = "XY" | "YZ" | "ZX"
type V3 = { readonly x: number; readonly y: number; readonly z: number }

const FRAMES: Readonly<Record<PlaneName, { readonly u: V3; readonly v: V3; readonly n: V3 }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 } }
}

type Dimensioned<C> = C extends { readonly value: number } ? Omit<C, "value"> & { readonly value: Dimension } : C
/** A constraint whose dimension may be an expression. */
export type DimConstraint = Dimensioned<Constraint>

export interface HistorySketch {
  readonly entities: ReadonlyArray<SketchEntity>
  readonly constraints: ReadonlyArray<DimConstraint>
}

export type Operation = "new" | "union" | "subtract" | "intersect"

/** How an edge of an extrusion is broken: a chamfer is a straight bevel, a fillet a quarter-round of radius `size`. */
export interface EdgeTreatment {
  readonly style: "chamfer" | "fillet"
  readonly size: Dimension
  /** Which end faces of the extrusion get it (default `both`). */
  readonly ends?: "top" | "bottom" | "both"
  /** Also break the rim of the holes (inner loops) the same way; the default is the outer boundary only. */
  readonly holes?: boolean
}
/** The sharp vertical corners of the profile, rounded (`fillet`) or bevelled (`chamfer`) before the extrusion. */
export interface CornerTreatment { readonly style: "chamfer" | "fillet"; readonly size: Dimension }

export interface SketchFeature { readonly id: string; readonly type: "sketch"; readonly plane: PlaneName; readonly offset?: Dimension; readonly sketch: HistorySketch }
export interface ExtrudeFeature {
  readonly id: string
  readonly type: "extrude"
  readonly sketch: string
  readonly depth: Dimension
  readonly direction?: "up" | "down" | "symmetric"
  readonly operation: Operation
  /** Bodies the operation applies to; the default is every body so far. */
  readonly targets?: ReadonlyArray<string>
  /** Chamfer or fillet of the edges round the end faces. */
  readonly edge?: EdgeTreatment
  /** Chamfer or fillet of the sharp vertical corners of the profile. */
  readonly corner?: CornerTreatment
  /** Draft: the walls lean by this angle (degrees) from the extrusion direction; positive narrows the solid towards its far end. */
  readonly taper?: Dimension
}
export interface RevolveFeature {
  readonly id: string
  readonly type: "revolve"
  readonly sketch: string
  /** A line of the sketch, or the plane's own `x` (u) or `y` (v) axis through its origin. */
  readonly axis: "x" | "y" | { readonly line: string }
  /** Degrees; the default is 360. */
  readonly angle?: Dimension
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
export interface HoleFeature {
  readonly id: string
  readonly type: "hole"
  readonly plane: PlaneName
  readonly offset?: Dimension
  readonly at: readonly [Dimension, Dimension]
  readonly diameter: Dimension
  readonly depth: Dimension
  readonly targets?: ReadonlyArray<string>
  /** `simple` (default), `counterbore` (a flat-bottomed recess for a screw head) or `countersink` (a cone for a flat head). */
  readonly kind?: "simple" | "counterbore" | "countersink"
  /** Counterbore / countersink diameter at the surface. */
  readonly headDiameter?: Dimension
  /** Counterbore depth (the countersink depth follows from its diameter and angle). */
  readonly headDepth?: Dimension
  /** Included angle of the countersink cone, degrees (default 90). */
  readonly angle?: Dimension
}
export interface PatternFeature {
  readonly id: string
  readonly type: "pattern"
  /** The extrude / revolve / hole whose tool is copied. */
  readonly feature: string
  readonly kind: "linear" | "circular" | "grid"
  readonly count: Dimension
  /** `linear` and `grid`: the offset between two copies. */
  readonly step?: readonly [Dimension, Dimension, Dimension]
  /** `grid`: the number of rows and the offset between two rows (`count` is the number along `step`). */
  readonly countB?: Dimension
  readonly stepB?: readonly [Dimension, Dimension, Dimension]
  /** `circular`: the centre on the XY plane (the axis is Z) and the angle spanned by all the copies, degrees (default 360). */
  readonly centre?: readonly [Dimension, Dimension]
  readonly span?: Dimension
}
export interface MirrorFeature {
  readonly id: string
  readonly type: "mirror"
  /** The extrude / revolve / hole whose tool is reflected. */
  readonly feature: string
  /** The mirror plane: XY reflects Z, YZ reflects X, ZX reflects Y, at `offset` along the plane's normal. */
  readonly plane: PlaneName
  readonly offset?: Dimension
}
export interface SweepFeature {
  readonly id: string
  readonly type: "sweep"
  /** A sketch with the closed profile (loops inside loops are holes: a hollow tube is two circles). */
  readonly profile: string
  /** A sketch with one open chain of lines and arcs, or one closed loop (a ring). The profile's centre rides the path. */
  readonly path: string
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
  /** Round the corners of the path with bends of this centre-line radius (a pipe bend) instead of mitred corners. */
  readonly bendRadius?: Dimension
}
export interface LoftFeature {
  readonly id: string
  readonly type: "loft"
  /** Two or more sketches, each with a closed profile, in order along the loft. */
  readonly sections: ReadonlyArray<string>
  /** A smooth curve through the sections rather than straight spans. */
  readonly smooth?: boolean
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
export interface ShellFeature {
  readonly id: string
  readonly type: "shell"
  /** The extrusion to hollow out. */
  readonly feature: string
  readonly thickness: Dimension
  /** The faces left open: none (a closed hollow), the top or bottom face of the extrusion, or both (a tube). */
  readonly open?: "none" | "top" | "bottom" | "both"
  readonly targets?: ReadonlyArray<string>
}
/** Which edges of the bodies a fillet or chamfer takes. */
export interface EdgeSelection {
  readonly parallel?: "x" | "y" | "z"
  readonly within?: { readonly min: readonly [Dimension, Dimension, Dimension]; readonly max: readonly [Dimension, Dimension, Dimension] }
  /** Convex (outside) edges, concave (inside) edges or both; the default is convex. */
  readonly kind?: "convex" | "concave" | "both"
  readonly minLength?: Dimension
  /** Also take the rims of curved surfaces (every facet edge of a tessellated hole or cylinder); slow, one Boolean per facet. */
  readonly curved?: boolean
}
export interface FilletFeature {
  readonly id: string
  readonly type: "fillet"
  /** The radius of a fillet or the setback of a chamfer. */
  readonly radius: Dimension
  readonly style?: "fillet" | "chamfer"
  /** Without a selection every convex edge between planar faces is taken. */
  readonly edges?: EdgeSelection
  readonly targets?: ReadonlyArray<string>
}
export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | HoleFeature | PatternFeature | MirrorFeature | SweepFeature | LoftFeature | ShellFeature | FilletFeature

export interface History {
  readonly parameters: ParameterTable
  readonly features: ReadonlyArray<Feature>
}

export interface Issue { readonly feature: string; readonly severity: "error" | "warning"; readonly message: string }

export interface Body { readonly id: string; readonly mesh: Mesh; readonly feature: string }

export interface RebuildResult {
  readonly bodies: ReadonlyArray<Body>
  readonly parameters: Readonly<Record<string, number>>
  readonly sketches: Readonly<Record<string, { readonly plane: PlaneName; readonly offset: number; readonly solve: SolveResult }>>
  readonly issues: ReadonlyArray<Issue>
}

const ptOf = (frame: { u: V3; v: V3; n: V3 }, origin: V3, p: V3): V3 => ({
  x: origin.x + frame.u.x * p.x + frame.v.x * p.y + frame.n.x * p.z,
  y: origin.y + frame.u.y * p.x + frame.v.y * p.y + frame.n.y * p.z,
  z: origin.z + frame.u.z * p.x + frame.v.z * p.y + frame.n.z * p.z
})

/** A mesh built in local (x, y, z) carried to the frame: world = origin + x ex + y ey + z ez (rigid, so the winding is kept). */
const place = (mesh: Mesh, ex: V3, ey: V3, ez: V3, origin: V3): Mesh => {
  const out = new Float32Array(mesh.positions.length)
  for (let i = 0; i < out.length; i += 3) {
    const p = ptOf({ u: ex, v: ey, n: ez }, origin, { x: mesh.positions[i]!, y: mesh.positions[i + 1]!, z: mesh.positions[i + 2]! })
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z
  }
  return { positions: out, indices: mesh.indices }
}

const insideRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const prism = (ring: ReadonlyArray<Vec2>, from: number, to: number): Mesh =>
  meshOf({ _tag: "Extrude", profile: ring.map((p) => ({ x: p.x, y: p.y })), height: to - from, origin: { x: 0, y: 0, z: from } }, 0.01)

/** What shapes an extruded profile beyond the plain prism: rounded corners and broken end-face edges. */
interface ProfileShape {
  readonly corner?: { readonly style: TreatmentStyle; readonly size: number }
  readonly edge?: EdgeShape
  readonly holes?: boolean
  /** Draft angle, radians. */
  readonly taper?: number
}

/** Solid of a set of loops in the plane between two depths along the normal: loops inside loops are holes, loops inside holes are solids. */
const profileSolid = (loops: ReadonlyArray<Vec2[]>, from: number, to: number, shape: ProfileShape = {}): Mesh | undefined => {
  if (loops.length === 0) return undefined
  const rounded = shape.corner === undefined ? loops : loops.map((l) => treatCorners(l, shape.corner!.style, shape.corner!.size))
  const depth = rounded.map((l, i) => rounded.filter((o, j) => j !== i && insideRing(l[0]!, o)).length)
  const parent = (i: number): number | undefined => {
    let best: number | undefined
    rounded.forEach((o, j) => {
      if (j === i || depth[j] !== depth[i]! - 1 || !insideRing(rounded[i]![0]!, o)) return
      if (best === undefined || Math.abs(polygonArea(o)) < Math.abs(polygonArea(rounded[best]!))) best = j
    })
    return best
  }
  const solids: Mesh[] = []
  rounded.forEach((loop, i) => {
    if (depth[i]! % 2 !== 0) return
    let solid = shape.taper !== undefined ? taperedPrism(loop, from, to, shape.taper) : shape.edge === undefined ? prism(loop, from, to) : edgedPrism(loop, from, to, shape.edge)
    rounded.forEach((_, j) => {
      if (depth[j] !== depth[i]! + 1 || parent(j) !== i) return
      const tool = shape.taper !== undefined ? taperedHoleTool(rounded[j]!, from, to, shape.taper) : shape.edge !== undefined && shape.holes === true ? edgedHoleTool(rounded[j]!, from, to, shape.edge) : prism(rounded[j]!, from - 1, to + 1)
      solid = booleanMesh(solid, tool, "subtract")
    })
    solids.push(solid)
  })
  return solids.length === 0 ? undefined : solids.slice(1).reduce((acc, m) => booleanMesh(acc, m, "union"), solids[0]!)
}

/** A mesh reflected through the plane `coordinate = value` (the winding is reversed so the faces keep facing outward). */
const mirrorMesh = (mesh: Mesh, axis: "x" | "y" | "z", value: number): Mesh => {
  const at = axis === "x" ? 0 : axis === "y" ? 1 : 2
  const positions = Float32Array.from(mesh.positions)
  for (let i = at; i < positions.length; i += 3) positions[i] = 2 * value - positions[i]!
  const indices = Uint32Array.from(mesh.indices)
  for (let i = 0; i + 2 < indices.length; i += 3) { const b = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = b }
  return { positions, indices }
}

/**
 * A path with its two ends moved along it: a positive shift trims that much off the end, a negative one extends the end straight
 * along its last segment. Throws when the trim would eat the whole path.
 */
const adjustPath = (path: ReadonlyArray<V3>, startShift: number, endShift: number): V3[] => {
  const trim = (pts: V3[], amount: number): V3[] => {
    let left = amount
    const out = [...pts]
    while (left > 1e-9) {
      if (out.length < 2) throw new RangeError("The wall is thicker than the path is long")
      const a = out[0]!, b = out[1]!
      const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      if (l > left + 1e-9) { out[0] = { x: a.x + ((b.x - a.x) * left) / l, y: a.y + ((b.y - a.y) * left) / l, z: a.z + ((b.z - a.z) * left) / l }; return out }
      out.shift()
      left -= l
    }
    return out
  }
  const extend = (pts: V3[], amount: number): V3[] => {
    const a = pts[0]!, b = pts[1]!
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    return [{ x: a.x - ((b.x - a.x) / l) * amount, y: a.y - ((b.y - a.y) / l) * amount, z: a.z - ((b.z - a.z) / l) * amount }, ...pts]
  }
  let pts = [...path]
  pts = startShift >= 0 ? trim(pts, startShift) : extend(pts, -startShift)
  pts = (endShift >= 0 ? trim(pts.reverse(), endShift) : extend(pts.reverse(), -endShift)).reverse()
  return pts
}

/**
 * The cavity profile (radial x, axial y) of a revolved solid hollowed with wall `t`. A profile that touches the axis is mirrored
 * across it, moved inwards as one polygon and cut back to the positive side, so the cavity reaches the axis and the wall is
 * uniform; an open end carries the cavity a millimetre past the end face.
 */
const shellRevolveProfile = (ring: ReadonlyArray<{ readonly a: number; readonly r: number }>, t: number, open: "none" | "top" | "bottom" | "both"): Vec2[] => {
  const pts = ring.map((p) => ({ x: p.r, y: p.a }))
  const onAxis = pts.map((p) => p.x <= 1e-6)
  let full: Vec2[]
  if (!onAxis.some(Boolean)) full = pts
  else {
    // Rotate so the run of axis points is at the end, leaving the open chain of the outline first.
    const start = onAxis.findIndex((on, i) => on && !onAxis[(i + 1) % onAxis.length]!)
    const rotated = pts.map((_, k) => pts[(start + 1 + k) % pts.length]!)
    const rotatedAxis = rotated.map((p) => p.x <= 1e-6)
    const firstAxis = rotatedAxis.indexOf(true)
    const chain = rotated.slice(0, firstAxis)
    const run = rotated.slice(firstAxis)
    if (chain.length < 2) throw new RangeError("The profile of a revolution to shell has too few points off the axis")
    const mirrored = [...chain].reverse().map((p) => ({ x: -p.x, y: p.y }))
    full = [...chain, { x: 0, y: run[0]!.y }, ...mirrored, { x: 0, y: run[run.length - 1]!.y }]
  }
  // A wall as thick as the smallest radius of the profile moves the boundary past the axis, where it collapses or crosses itself:
  // that is the same "no cavity" case the check below reports, told in the language of this feature.
  let inner: Vec2[]
  try { inner = moveRing(full, t) } catch { throw new RangeError(`A ${t} mm wall leaves no cavity in this revolution`) }
  // Cut back to the half-plane x >= 0 (Sutherland-Hodgman).
  const clipped: Vec2[] = []
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]!, b = inner[(i + 1) % inner.length]!
    const ina = a.x >= -1e-9, inb = b.x >= -1e-9
    if (ina) clipped.push({ x: Math.max(0, a.x), y: a.y })
    if (ina !== inb) { const u = (0 - a.x) / (b.x - a.x); clipped.push({ x: 0, y: a.y + u * (b.y - a.y) }) }
  }
  const unique = clipped.filter((p, k) => k === 0 || Math.hypot(p.x - clipped[k - 1]!.x, p.y - clipped[k - 1]!.y) > 1e-9)
  if (unique.length < 3) throw new RangeError(`A ${t} mm wall leaves no cavity in this revolution`)
  const top = Math.max(...unique.map((p) => p.y)), bottom = Math.min(...unique.map((p) => p.y))
  return unique.map((p) => ({ x: p.x, y: open !== "none" && (open === "top" || open === "both") && Math.abs(p.y - top) < 1e-6 ? p.y + t + 1 : open !== "none" && (open === "bottom" || open === "both") && Math.abs(p.y - bottom) < 1e-6 ? p.y - t - 1 : p.y }))
}

/** Replays the history from the top. Never throws: what cannot be built is in `issues`. */
export const rebuild = (history: History): RebuildResult => {
  const issues: Issue[] = []
  const { values, errors } = resolveParameters(history.parameters)
  for (const [name, message] of Object.entries(errors)) issues.push({ feature: `parameter ${name}`, severity: "error", message })
  const dim = (d: Dimension, feature: string): number | undefined => {
    try { return dimensionValue(d, values) } catch (error) {
      issues.push({ feature, severity: "error", message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }
  const sketches: Record<string, { plane: PlaneName; offset: number; solve: SolveResult }> = {}
  const bodies: Body[] = []
  const tools = new Map<string, { readonly meshes: ReadonlyArray<Mesh>; readonly operation: Operation; readonly targets?: ReadonlyArray<string> }>()
  /** What a shell needs from an extrusion: its profile after the corner treatment, its depths and its plane. */
  const extrusions = new Map<string, { readonly loops: ReadonlyArray<Vec2[]>; readonly from: number; readonly to: number; readonly plane: PlaneName; readonly offset: number; readonly tapered: boolean }>()
  /** Full revolutions, for a shell: the profile as (axial, radial) points and how to put a mesh built in the revolve's local frame in the world. */
  const revolutions = new Map<string, { readonly ring: ReadonlyArray<{ readonly a: number; readonly r: number }>; readonly full: boolean; readonly put: (mesh: Mesh) => Mesh }>()
  /** Sweeps, for a shell: the profile loops in their plane, the path in the world and the plane's data. */
  const sweeps = new Map<string, { readonly sketch: { plane: PlaneName; offset: number }; readonly loops: ReadonlyArray<Vec2[]>; readonly path: ReadonlyArray<V3>; readonly closed: boolean }>()
  const usable = (id: string): { plane: PlaneName; offset: number; solve: SolveResult } | undefined => {
    const sk = sketches[id]
    return sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed" ? undefined : sk
  }
  /** A point of a sketch's plane in the world. */
  const worldOf = (sk: { plane: PlaneName; offset: number }, p: Vec2): V3 => {
    const fr = FRAMES[sk.plane]
    return ptOf(fr, { x: fr.n.x * sk.offset, y: fr.n.y * sk.offset, z: fr.n.z * sk.offset }, { x: p.x, y: p.y, z: 0 })
  }

  const apply = (feature: string, tool: Mesh, operation: Operation, targets: ReadonlyArray<string> | undefined, label: string): void => {
    if (operation === "new") { bodies.push({ id: label, mesh: tool, feature }); return }
    const chosen = bodies.filter((b) => targets === undefined || targets.includes(b.id))
    if (chosen.length === 0) { issues.push({ feature, severity: "error", message: "There is no body for this operation to act on" }); return }
    if (operation === "union") {
      const merged = chosen.reduce((acc, b) => booleanMesh(b.mesh, acc, "union"), tool)
      const first = bodies.indexOf(chosen[0]!)
      for (const b of chosen.slice(1)) bodies.splice(bodies.indexOf(b), 1)
      bodies[first] = { ...chosen[0]!, mesh: merged }
      return
    }
    for (const b of chosen) bodies[bodies.indexOf(b)] = { ...b, mesh: booleanMesh(b.mesh, tool, operation === "subtract" ? "subtract" : "intersect") }
  }

  /** The solid swept from the loops of a profile sketch along a world path: loops inside loops are holes. */
  const sweepLoops = (sk: { plane: PlaneName; offset: number }, loops: ReadonlyArray<Vec2[]>, path: ReadonlyArray<V3>, closed: boolean): Mesh | undefined => {
    const fr = FRAMES[sk.plane]
    const nesting = loops.map((l, i) => loops.filter((o, j) => j !== i && insideRing(l[0]!, o)).length)
    const solids: Mesh[] = []
    loops.forEach((loop, i) => {
      if (nesting[i]! % 2 !== 0) return
      const world = (l: ReadonlyArray<Vec2>): P3[] => l.map((p) => worldOf(sk, p))
      const ring = world(loop)
      const centre = { x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length, z: ring.reduce((a, p) => a + p.z, 0) / ring.length }
      let solid = sweepSolid({ ring, ring2d: loop, normal: fr.n, centre, path, closed })
      loops.forEach((hole, j) => {
        if (nesting[j] !== nesting[i]! + 1 || !insideRing(hole[0]!, loop)) return
        solid = booleanMesh(solid, sweepSolid({ ring: world(hole), ring2d: hole, normal: fr.n, centre, path, closed, extend: true }), "subtract")
      })
      solids.push(solid)
    })
    return solids.length === 0 ? undefined : solids.slice(1).reduce((acc, m) => booleanMesh(acc, m, "union"), solids[0]!)
  }

  /**
   * The copies a pattern makes, applied in one Boolean when they do not overlap each other (their bounding boxes are disjoint,
   * which holds for holes and bosses spaced apart): one cut instead of one per copy. Overlapping copies and a pattern that makes
   * new bodies are applied one by one.
   */
  const applyCopies = (feature: string, copies: ReadonlyArray<{ readonly mesh: Mesh; readonly label: string }>, operation: Operation, targets: ReadonlyArray<string> | undefined): void => {
    if (copies.length === 0) return
    const boxes = copies.map((c) => meshBounds(c.mesh))
    const disjoint = boxes.every((a, i) => boxes.every((b, j) => j <= i || a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY || a.maxZ < b.minZ || b.maxZ < a.minZ))
    if (operation === "new" || !disjoint) { for (const c of copies) apply(feature, c.mesh, operation, targets, c.label); return }
    apply(feature, mergeMeshes(copies.map((c) => c.mesh)), operation, targets, `${feature}#all`)
  }

  for (const f of history.features) {
    try {
      switch (f.type) {
        case "sketch": {
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if (offset === undefined) break
          const constraints: Constraint[] = []
          let ok = true
          for (const c of f.sketch.constraints) {
            if ("value" in c) {
              const v = dim(c.value as Dimension, f.id)
              if (v === undefined) { ok = false; continue }
              if ((c.type === "radius" || c.type === "diameter") && !(v > 0)) {
                issues.push({ feature: f.id, severity: "error", message: `A ${c.type} constraint needs a positive value (it is ${v})` })
                ok = false
                continue
              }
              constraints.push({ ...c, value: v } as Constraint)
            } else constraints.push(c as Constraint)
          }
          if (!ok) break
          const solve = solveSketch({ entities: f.sketch.entities, constraints })
          sketches[f.id] = { plane: f.plane, offset, solve }
          if (solve.status === "conflicting" || solve.status === "failed") {
            issues.push({ feature: f.id, severity: "error", message: solve.message ?? `The sketch could not be solved (${solve.status})` })
          } else if (solve.status === "over-constrained") issues.push({ feature: f.id, severity: "warning", message: `The sketch has ${solve.redundant} redundant constraint(s)` })
          break
        }
        case "extrude": {
          const sk = sketches[f.sketch]
          if (sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed") { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const depth = dim(f.depth, f.id)
          if (depth === undefined) break
          if (!(depth > 0)) { issues.push({ feature: f.id, severity: "error", message: `The extrusion depth must be positive (it is ${depth})` }); break }
          const { loops, open } = sketchProfiles(sk.solve.sketch)
          if (open.length > 0) issues.push({ feature: f.id, severity: "warning", message: `${open.length} open chain(s) in the sketch are ignored` })
          const dir = f.direction ?? "up"
          const from = dir === "up" ? 0 : dir === "down" ? -depth : -depth / 2
          const shape: { corner?: ProfileShape["corner"]; edge?: EdgeShape; holes?: boolean; taper?: number } = {}
          if (f.taper !== undefined) {
            const degrees = dim(f.taper, f.id)
            if (degrees === undefined) break
            if (!(Math.abs(degrees) < 45)) { issues.push({ feature: f.id, severity: "error", message: `The draft angle must be between -45 and 45 degrees (it is ${degrees})` }); break }
            if (f.edge !== undefined) { issues.push({ feature: f.id, severity: "error", message: "An extrusion takes a draft angle or an edge treatment, not both" }); break }
            if (degrees !== 0) shape.taper = (degrees * Math.PI) / 180
          }
          if (f.corner !== undefined) {
            const size = dim(f.corner.size, f.id)
            if (size === undefined) break
            shape.corner = { style: f.corner.style, size }
          }
          if (f.edge !== undefined) {
            const size = dim(f.edge.size, f.id)
            if (size === undefined) break
            shape.edge = { style: f.edge.style, size, ends: f.edge.ends ?? "both" }
            shape.holes = f.edge.holes === true
          }
          const rounded = shape.corner === undefined ? loops : loops.map((l) => treatCorners(l, shape.corner!.style, shape.corner!.size))
          const { corner: _corner, ...rest } = shape
          const local = profileSolid(rounded, from, from + depth, rest)
          if (local !== undefined) extrusions.set(f.id, { loops: rounded, from, to: from + depth, plane: sk.plane, offset: sk.offset, tapered: shape.taper !== undefined })
          if (local === undefined) { issues.push({ feature: f.id, severity: "error", message: "The sketch has no closed profile to extrude" }); break }
          const frame = FRAMES[sk.plane]
          const tool = place(local, frame.u, frame.v, frame.n, { x: frame.n.x * sk.offset, y: frame.n.y * sk.offset, z: frame.n.z * sk.offset })
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "revolve": {
          const sk = sketches[f.sketch]
          if (sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed") { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const degrees = f.angle === undefined ? 360 : dim(f.angle, f.id)
          if (degrees === undefined) break
          if (!(degrees > 0 && degrees <= 360)) { issues.push({ feature: f.id, severity: "error", message: `The revolution angle must be in (0, 360] degrees (it is ${degrees})` }); break }
          const { loops } = sketchProfiles(sk.solve.sketch)
          if (loops.length !== 1) { issues.push({ feature: f.id, severity: "error", message: `A revolution needs exactly one closed profile (the sketch has ${loops.length})` }); break }
          const pts = new Map(sk.solve.sketch.entities.flatMap((e) => (e.kind === "point" ? [[e.id, e] as const] : [])))
          let a0: Vec2, dirA: Vec2
          if (f.axis === "x") { a0 = { x: 0, y: 0 }; dirA = { x: 1, y: 0 } }
          else if (f.axis === "y") { a0 = { x: 0, y: 0 }; dirA = { x: 0, y: 1 } }
          else {
            const axisId = f.axis.line
            const line = sk.solve.sketch.entities.find((e) => e.id === axisId && e.kind === "line")
            if (line === undefined || line.kind !== "line") { issues.push({ feature: f.id, severity: "error", message: `Axis '${axisId}' is not a line of the sketch` }); break }
            const p1 = pts.get(line.p1)!, p2 = pts.get(line.p2)!
            const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            if (len < 1e-9) { issues.push({ feature: f.id, severity: "error", message: "The axis line has no length" }); break }
            a0 = { x: p1.x, y: p1.y }; dirA = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len }
          }
          // (axial, radial) of every profile point relative to the axis. The profile has to lie on one side; the axis is turned about
          // so that side is the positive radial one, which keeps the frame (radial, normal, axis) right-handed with no mirroring.
          const sideOf = (dir: Vec2) => loops[0]!.map((p) => (p.x - a0.x) * -dir.y + (p.y - a0.y) * dir.x)
          if (sideOf(dirA).every((r) => r <= 1e-6)) dirA = { x: -dirA.x, y: -dirA.y }
          const radial = sideOf(dirA)
          if (radial.some((r) => r < -1e-6)) { issues.push({ feature: f.id, severity: "error", message: "The profile crosses the axis of revolution" }); break }
          const ring = loops[0]!.map((p, i) => ({ a: (p.x - a0.x) * dirA.x + (p.y - a0.y) * dirA.y, r: Math.max(0, radial[i]!) }))
          const local = meshOf({ _tag: "Revolve", profile: ring.map((p) => ({ x: p.r, y: p.a })), angle: (degrees * Math.PI) / 180 }, 0.01)
          // Local x is the radial direction (N x axis), y the plane normal, z the axis: x cross y = z.
          const frame = FRAMES[sk.plane]
          const ax = ptOf(frame, { x: 0, y: 0, z: 0 }, { x: dirA.x, y: dirA.y, z: 0 })
          const nrm = frame.n
          const ex = { x: nrm.y * ax.z - nrm.z * ax.y, y: nrm.z * ax.x - nrm.x * ax.z, z: nrm.x * ax.y - nrm.y * ax.x }
          const origin = ptOf(frame, { x: nrm.x * sk.offset, y: nrm.y * sk.offset, z: nrm.z * sk.offset }, { x: a0.x, y: a0.y, z: 0 })
          const fixed = place(local, ex, nrm, ax, origin)
          revolutions.set(f.id, { ring, full: degrees >= 360 - 1e-9, put: (mesh) => place(mesh, ex, nrm, ax, origin) })
          tools.set(f.id, { meshes: [fixed], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, fixed, f.operation, f.targets, f.id)
          break
        }
        case "hole": {
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id)
          const x = dim(f.at[0], f.id), y = dim(f.at[1], f.id), d = dim(f.diameter, f.id), depth = dim(f.depth, f.id)
          if (offset === undefined || x === undefined || y === undefined || d === undefined || depth === undefined) break
          if (!(d > 0 && depth > 0)) { issues.push({ feature: f.id, severity: "error", message: "A hole needs a positive diameter and depth" }); break }
          const frame = FRAMES[f.plane]
          const offsetVec = { x: frame.n.x * offset, y: frame.n.y * offset, z: frame.n.z * offset }
          let tool: Mesh
          if (f.kind === undefined || f.kind === "simple") {
            const n = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - 0.01 / (d / 2)))))
            const ring = Array.from({ length: n }, (_, k) => ({ x: x + (d / 2) * Math.cos((2 * Math.PI * k) / n), y: y + (d / 2) * Math.sin((2 * Math.PI * k) / n) }))
            // The hole goes into the part, against the plane's normal; a little beyond the face so the cut is clean.
            tool = place(prism(ring, -depth, 0.01), frame.u, frame.v, frame.n, offsetVec)
          } else {
            const head = f.headDiameter === undefined ? undefined : dim(f.headDiameter, f.id)
            if (head === undefined) { if (f.headDiameter === undefined) issues.push({ feature: f.id, severity: "error", message: `A ${f.kind} needs headDiameter` }); break }
            if (!(head > d)) { issues.push({ feature: f.id, severity: "error", message: `The ${f.kind} diameter (${head}) must exceed the hole diameter (${d})` }); break }
            const e = 0.01
            let profile: Array<{ x: number; y: number }>
            if (f.kind === "counterbore") {
              const headDepth = f.headDepth === undefined ? undefined : dim(f.headDepth, f.id)
              if (headDepth === undefined) { if (f.headDepth === undefined) issues.push({ feature: f.id, severity: "error", message: "A counterbore needs headDepth" }); break }
              if (!(headDepth > 0 && headDepth < depth)) { issues.push({ feature: f.id, severity: "error", message: `The counterbore depth (${headDepth}) must be positive and less than the hole depth (${depth})` }); break }
              profile = [{ x: 0, y: e }, { x: head / 2, y: e }, { x: head / 2, y: -headDepth }, { x: d / 2, y: -headDepth }, { x: d / 2, y: -depth }, { x: 0, y: -depth }]
            } else {
              const included = f.angle === undefined ? 90 : dim(f.angle, f.id)
              if (included === undefined) break
              if (!(included > 0 && included < 180)) { issues.push({ feature: f.id, severity: "error", message: `The countersink angle must be between 0 and 180 degrees (it is ${included})` }); break }
              const slope = Math.tan((included * Math.PI) / 360)
              const coneDepth = (head / 2 - d / 2) / slope
              if (!(coneDepth < depth)) { issues.push({ feature: f.id, severity: "error", message: `The countersink cone (${coneDepth.toFixed(2)} mm deep) must be shallower than the hole depth (${depth})` }); break }
              profile = [{ x: 0, y: e }, { x: head / 2 + e * slope, y: e }, { x: d / 2, y: -coneDepth }, { x: d / 2, y: -depth }, { x: 0, y: -depth }]
            }
            const local = meshOf({ _tag: "Revolve", profile, angle: 2 * Math.PI }, 0.01)
            tool = place(local, frame.u, frame.v, frame.n, { x: offsetVec.x + frame.u.x * x + frame.v.x * y, y: offsetVec.y + frame.u.y * x + frame.v.y * y, z: offsetVec.z + frame.u.z * x + frame.v.z * y })
          }
          tools.set(f.id, { meshes: [tool], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, "subtract", f.targets, f.id)
          break
        }
        case "mirror": {
          const source = tools.get(f.feature)
          if (source === undefined) { issues.push({ feature: f.id, severity: "error", message: `Feature '${f.feature}' has no tool to mirror` }); break }
          const value = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if (value === undefined) break
          const axis = f.plane === "XY" ? "z" : f.plane === "YZ" ? "x" : "y"
          const meshes = source.meshes.map((m) => mirrorMesh(m, axis, value))
          tools.set(f.id, { meshes, operation: source.operation, ...(source.targets !== undefined ? { targets: source.targets } : {}) })
          apply(f.id, meshes.length === 1 ? meshes[0]! : mergeMeshes(meshes), source.operation, source.targets, f.id)
          break
        }
        case "fillet": {
          const radius = dim(f.radius, f.id)
          if (radius === undefined) break
          if (!(radius > 0)) { issues.push({ feature: f.id, severity: "error", message: `The ${f.style ?? "fillet"} size must be positive (it is ${radius})` }); break }
          const within = f.edges?.within === undefined ? undefined : { min: f.edges.within.min.map((d) => dim(d, f.id)), max: f.edges.within.max.map((d) => dim(d, f.id)) }
          if (within !== undefined && [...within.min, ...within.max].some((v) => v === undefined)) break
          const minLength = f.edges?.minLength === undefined ? undefined : dim(f.edges.minLength, f.id)
          const selector = {
            ...(f.edges?.parallel !== undefined ? { parallel: f.edges.parallel } : {}), ...(f.edges?.kind !== undefined ? { kind: f.edges.kind } : {}),
            ...(minLength !== undefined ? { minLength } : {}), ...(f.edges?.curved === true ? { curved: true } : {}),
            ...(within !== undefined ? { within: { min: within.min as [number, number, number], max: within.max as [number, number, number] } } : {})
          }
          const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
          if (chosen.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is no body for this operation to act on" }); break }
          let blended = 0
          for (const b of chosen) {
            const found = findEdges(b.mesh)
            const picked = selectEdges(found.edges, selector)
            const result = blendEdges(b.mesh, picked, radius, f.style ?? "fillet")
            blended += result.blended
            for (const why of result.rejected.slice(0, 4)) issues.push({ feature: f.id, severity: "warning", message: `Not blended: ${why}` })
            bodies[bodies.indexOf(b)] = { ...b, mesh: result.mesh }
          }
          if (blended === 0) issues.push({ feature: f.id, severity: "error", message: "No edge matched the selection (edges are found between planar faces that meet at 25 degrees or more)" })
          break
        }
        case "shell": {
          const t = dim(f.thickness, f.id)
          if (t === undefined) break
          if (!(t > 0)) { issues.push({ feature: f.id, severity: "error", message: `The shell thickness must be positive (it is ${t})` }); break }
          const open = f.open ?? "none"
          let tool: Mesh | undefined
          const extrusion = extrusions.get(f.feature)
          const revolution = revolutions.get(f.feature)
          const swept = sweeps.get(f.feature)
          if (extrusion !== undefined) {
            if (extrusion.tapered) { issues.push({ feature: f.id, severity: "error", message: "A drafted (tapered) extrusion cannot be shelled" }); break }
            const z0 = extrusion.from + (open === "bottom" || open === "both" ? -1 : t)
            const z1 = extrusion.to + (open === "top" || open === "both" ? 1 : -t)
            if (!(z1 - z0 > 1e-6)) { issues.push({ feature: f.id, severity: "error", message: `A ${t} mm shell leaves no cavity in a ${(extrusion.to - extrusion.from).toFixed(3)} mm deep part` }); break }
            const depthOf = extrusion.loops.map((l, i) => extrusion.loops.filter((o, j) => j !== i && insideRing(l[0]!, o)).length)
            const cavities: Mesh[] = []
            extrusion.loops.forEach((loop, i) => {
              if (depthOf[i]! % 2 !== 0) return
              let cavity = prism(moveRing(loop, t), z0, z1)
              extrusion.loops.forEach((hole, j) => {
                if (depthOf[j] !== depthOf[i]! + 1 || !insideRing(hole[0]!, loop)) return
                cavity = booleanMesh(cavity, prism(moveRing(hole, -t), z0 - 1, z1 + 1), "subtract")
              })
              cavities.push(cavity)
            })
            if (cavities.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is nothing to hollow out" }); break }
            const fr = FRAMES[extrusion.plane]
            const local = cavities.slice(1).reduce((acc, m) => booleanMesh(acc, m, "union"), cavities[0]!)
            tool = place(local, fr.u, fr.v, fr.n, { x: fr.n.x * extrusion.offset, y: fr.n.y * extrusion.offset, z: fr.n.z * extrusion.offset })
          } else if (revolution !== undefined) {
            if (!revolution.full) { issues.push({ feature: f.id, severity: "error", message: "Only a full revolution (360 degrees) can be shelled" }); break }
            const profile = shellRevolveProfile(revolution.ring, t, open)
            tool = revolution.put(meshOf({ _tag: "Revolve", profile, angle: 2 * Math.PI }, 0.01))
          } else if (swept !== undefined) {
            // The cavity is the same sweep of the profile moved inwards by the wall; a closed hollow stops a wall short of each end.
            const inner = swept.loops.map((l, i) => {
              const nesting = swept.loops.filter((o, j) => j !== i && insideRing(l[0]!, o)).length
              return moveRing(l, nesting % 2 === 0 ? t : -t)
            })
            const startShift = open === "bottom" || open === "both" ? -1 : t, endShift = open === "top" || open === "both" ? -1 : t
            const path = swept.closed ? [...swept.path] : adjustPath(swept.path, startShift, endShift)
            tool = sweepLoops(swept.sketch, inner, path, swept.closed)
          } else { issues.push({ feature: f.id, severity: "error", message: `'${f.feature}' is not an extrusion, a full revolution or a sweep that can be shelled` }); break }
          if (tool === undefined) { issues.push({ feature: f.id, severity: "error", message: "There is nothing to hollow out" }); break }
          apply(f.id, tool, "subtract", f.targets, f.id)
          break
        }
        case "sweep": {
          const profileSketch = usable(f.profile), pathSketch = usable(f.path)
          if (profileSketch === undefined || pathSketch === undefined) { issues.push({ feature: f.id, severity: "error", message: `Sketch '${profileSketch === undefined ? f.profile : f.path}' is not available` }); break }
          const profile = sketchProfiles(profileSketch.solve.sketch)
          const route = sketchProfiles(pathSketch.solve.sketch)
          const closedPath = route.open.length === 0 && route.loops.length === 1
          if (!closedPath && !(route.open.length === 1 && route.loops.length === 0)) { issues.push({ feature: f.id, severity: "error", message: `The path sketch '${f.path}' must hold exactly one open chain of lines and arcs, or one closed loop` }); break }
          if (profile.loops.length === 0) { issues.push({ feature: f.id, severity: "error", message: `The profile sketch '${f.profile}' has no closed loop` }); break }
          let path = (closedPath ? route.loops[0]! : route.open[0]!).map((p) => worldOf(pathSketch, p))
          if (f.bendRadius !== undefined) {
            const bend = dim(f.bendRadius, f.id)
            if (bend === undefined) break
            // Zero is the mitred elbow and a closed route has no bend at all; a negative radius is not a shape, so it is refused
            // instead of being read as "no bend" and silently producing a mitred elbow nobody asked for.
            if (bend < 0) { issues.push({ feature: f.id, severity: "error", message: `The bend radius cannot be negative (it is ${bend} mm); zero is the mitred elbow` }); break }
            if (!closedPath && bend > 0) path = roundPath(path, bend)
          }
          const tool = sweepLoops(profileSketch, profile.loops, path, closedPath)
          if (tool === undefined) { issues.push({ feature: f.id, severity: "error", message: "The profile has no solid loop to sweep" }); break }
          sweeps.set(f.id, { sketch: { plane: profileSketch.plane, offset: profileSketch.offset }, loops: profile.loops, path, closed: closedPath })
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "loft": {
          if (f.sections.length < 2) { issues.push({ feature: f.id, severity: "error", message: "A loft needs at least two sections" }); break }
          const rings: Array<{ ring: P3[] }> = []
          let missing: string | undefined
          for (const id of f.sections) {
            const sk = usable(id)
            if (sk === undefined) { missing = id; break }
            const { loops } = sketchProfiles(sk.solve.sketch)
            if (loops.length === 0) { missing = id; break }
            if (loops.length > 1) issues.push({ feature: f.id, severity: "warning", message: `Section '${id}' has ${loops.length} loops; only the largest is lofted` })
            const biggest = loops.reduce((a, b) => (Math.abs(polygonArea(b)) > Math.abs(polygonArea(a)) ? b : a))
            rings.push({ ring: biggest.map((p) => worldOf(sk, p)) })
          }
          if (missing !== undefined) { issues.push({ feature: f.id, severity: "error", message: `Section '${missing}' is not available or has no closed loop` }); break }
          const tool = loftSolid(rings, { smooth: f.smooth === true })
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "pattern": {
          const source = tools.get(f.feature)
          if (source === undefined) { issues.push({ feature: f.id, severity: "error", message: `Feature '${f.feature}' has no tool to copy` }); break }
          const count = dim(f.count, f.id)
          if (count === undefined) break
          if (!Number.isInteger(count) || count < 2 || count > 500) { issues.push({ feature: f.id, severity: "error", message: `The pattern count must be an integer from 2 to 500 (it is ${count})` }); break }
          const tool0 = source.meshes.length === 1 ? source.meshes[0]! : mergeMeshes(source.meshes)
          const copies: Array<{ readonly mesh: Mesh; readonly label: string }> = []
          const emit = (mesh: Mesh, label: string): void => { copies.push({ mesh, label }) }
          if (f.kind === "grid") {
            const rows = f.countB === undefined ? undefined : dim(f.countB, f.id)
            const a = (f.step ?? [0, 0, 0]).map((d) => dim(d, f.id)), b = (f.stepB ?? [0, 0, 0]).map((d) => dim(d, f.id))
            if (f.countB === undefined) { issues.push({ feature: f.id, severity: "error", message: "A grid needs countB (the number of rows) and stepB (the offset between rows)" }); break }
            if (rows === undefined || a.some((v) => v === undefined) || b.some((v) => v === undefined)) break
            if (!Number.isInteger(rows) || rows < 2 || count * rows > 500) { issues.push({ feature: f.id, severity: "error", message: `A grid needs an integer number of rows of at least 2 and at most 500 copies in all (it is ${count} x ${rows})` }); break }
            for (let i = 0; i < count; i++) for (let j = 0; j < rows; j++) {
              if (i === 0 && j === 0) continue
              emit(translateMesh(tool0, a[0]! * i + b[0]! * j, a[1]! * i + b[1]! * j, a[2]! * i + b[2]! * j), `${f.id}#${i}.${j}`)
            }
          } else if (f.kind === "linear") {
            const step = (f.step ?? [0, 0, 0]).map((d) => dim(d, f.id))
            if (step.some((s) => s === undefined)) break
            for (let i = 1; i < count; i++) emit(translateMesh(tool0, step[0]! * i, step[1]! * i, step[2]! * i), `${f.id}#${i}`)
          } else {
            const c = (f.centre ?? [0, 0]).map((d) => dim(d, f.id))
            const span = f.span === undefined ? 360 : dim(f.span, f.id)
            if (c.some((s) => s === undefined) || span === undefined) break
            // A full circle divides by the count (the last copy is the first again); a partial one spreads the copies end to end.
            const each = span >= 360 - 1e-9 ? span / count : span / (count - 1)
            for (let i = 1; i < count; i++) emit(rotateMesh(tool0, { x: 0, y: 0, z: 1 }, (each * i * Math.PI) / 180, { x: c[0]!, y: c[1]!, z: 0 }), `${f.id}#${i}`)
          }
          applyCopies(f.id, copies, source.operation, source.targets)
          break
        }
      }
    } catch (error) {
      issues.push({ feature: f.id, severity: "error", message: error instanceof SketchError || error instanceof Error ? error.message : String(error) })
    }
  }
  return { bodies, parameters: values, sketches, issues }
}

/** Volume of the bodies together, mm^3 (they may touch but are assumed not to overlap). */
export const historyVolume = (result: RebuildResult): number => result.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)

/** A history with one parameter set to a new value (a number or an expression). */
export const withParameter = (history: History, name: string, value: number | string): History => ({
  ...history,
  parameters: { ...history.parameters, [name]: value }
})
