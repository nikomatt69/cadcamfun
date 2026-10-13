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
import { COIL_MAX_TURNS, coilGeometry } from "./helix.ts"
import { developedLength, sheetOutline, thickenPath, withHems, type Developed } from "./sheet-metal.ts"
import { threadProblem, threadTool } from "./thread.ts"
import { textSolid } from "./text-solid.ts"
import { findPlanarFace, type PlanarFace } from "./face-edit.ts"
import { metricThread } from "./fasteners.ts"
export { COIL_STEPS_PER_TURN, coilGeometry } from "./helix.ts"
import { blendEdges, findEdges, selectEdges } from "./edge-blend.ts"
import { expandSketch, type SketchShape } from "./sketch-shapes.ts"
import { elementMesh } from "../cam/model/element-mesh.ts"

export type PlaneName = "XY" | "YZ" | "ZX"
/** A plane a sketch, hole or text lies on: one of the three base planes, or the id of an earlier `plane` feature. */
export type PlaneRef = PlaneName | (string & {})
type V3 = { readonly x: number; readonly y: number; readonly z: number }
/** An orthonormal right-handed frame (u x v = n) at `origin`. */
export interface PlaneFrame { readonly u: V3; readonly v: V3; readonly n: V3; readonly origin: V3 }

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
  /** Parametric profiles (rectangle, circle, polygon, ellipse, slot, polyline) expanded into the sketch before it is solved. */
  readonly shapes?: ReadonlyArray<SketchShape>
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

export interface SketchFeature { readonly id: string; readonly type: "sketch"; readonly plane: PlaneRef; readonly offset?: Dimension; readonly sketch: HistorySketch }
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
  readonly plane: PlaneRef
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
  /**
   * A cosmetic thread note (Fusion's cosmetic thread): the hole is the tap drill and the drawing says `M4 - 6H depth 8`. `designation` is
   * `M4`, `M8x1` or a pipe thread such as `G1/2"`; the geometry is not changed.
   */
  readonly thread?: { readonly designation: string; readonly depth: Dimension; readonly fit?: string }
  /** Tolerance of the diameter in mm, written on the drawing (`+upper / -lower`; equal values print as +-). */
  readonly tolerance?: { readonly upper: Dimension; readonly lower: Dimension }
  /** ISO 286 hole fit for the drawing, such as `H7`: the deviation is derived from the IT grade (H holes only). */
  readonly fit?: string
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
/** A helical sweep of a round or square wire about the Z axis: a spring, a thread form, a coiled pipe (Fusion's Coil). */
export interface CoilFeature {
  readonly id: string
  readonly type: "coil"
  /** Radius of the helix, to the centre of the wire. */
  readonly radius: Dimension
  /** Axial advance per turn. */
  readonly pitch: Dimension
  readonly turns: Dimension
  /** Wire diameter (the side of a square wire). */
  readonly wireDiameter: Dimension
  readonly section?: "round" | "square"
  readonly handedness?: "right" | "left"
  /** Where the axis stands on the XY plane and the height of the start of the helix. */
  readonly centre?: readonly [Dimension, Dimension]
  readonly offset?: Dimension
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
/** Moves, turns or copies bodies (Fusion's Move/Copy): the turn is applied first, about a point, then the translation. */
export interface MoveFeature {
  readonly id: string
  readonly type: "move"
  readonly targets?: ReadonlyArray<string>
  readonly translate?: readonly [Dimension, Dimension, Dimension]
  readonly rotate?: { readonly axis: "x" | "y" | "z"; readonly angle: Dimension; readonly about?: readonly [Dimension, Dimension, Dimension] }
  /** Leave the bodies where they are and make moved copies instead. */
  readonly copy?: boolean
}
/** Scales bodies about a point (Fusion's Scale): one factor for a uniform scale, three for a stretch along x, y and z. */
export interface ScaleFeature {
  readonly id: string
  readonly type: "scale"
  readonly factor: Dimension | readonly [Dimension, Dimension, Dimension]
  readonly about?: readonly [Dimension, Dimension, Dimension]
  readonly targets?: ReadonlyArray<string>
}
/** Cuts bodies with a plane (Fusion's Split Body): keep the side the normal points to, the other side, or both as two bodies. */
export interface SplitFeature {
  readonly id: string
  readonly type: "split"
  readonly plane: PlaneName
  readonly offset?: Dimension
  readonly keep: "above" | "below" | "both"
  readonly targets?: ReadonlyArray<string>
}
/** Joins, cuts or intersects whole bodies by their ids (Fusion's Combine). Tool bodies are consumed unless `keepTools`. */
export interface CombineFeature {
  readonly id: string
  readonly type: "combine"
  readonly target: string
  readonly tools: ReadonlyArray<string>
  readonly operation: "join" | "cut" | "intersect"
  readonly keepTools?: boolean
}
/** A web standing on the bodies (Fusion's Rib): the open lines of a sketch, thickened and extruded, united with what they touch. */
export interface RibFeature {
  readonly id: string
  readonly type: "rib"
  /** A sketch with open chains of lines and arcs (the centre lines of the ribs). */
  readonly sketch: string
  readonly thickness: Dimension
  /** How far the rib stands from the sketch plane. */
  readonly depth: Dimension
  readonly direction?: "up" | "down" | "symmetric"
  /** Default `union`. */
  readonly operation?: Operation
  readonly targets?: ReadonlyArray<string>
}
/**
 * A bent strip of constant thickness (sheet metal): one open chain of the sketch is the profile line, thickened to `thickness` on
 * `side`, its corners bent with the INSIDE radius `bendRadius`, and extruded `width` along the sketch normal (a base flange).
 */
export interface SheetFeature {
  readonly id: string
  readonly type: "sheet"
  readonly sketch: string
  readonly thickness: Dimension
  readonly width: Dimension
  readonly bendRadius?: Dimension
  /** Which side of the drawn line the material lies on, looking along it (default `centre`). */
  readonly side?: "centre" | "left" | "right"
  /** Hems folded back at the ends of the line: a hem is two 90 degree bends, so with a bend radius `gap` must be at least twice the inside radius. */
  readonly hems?: ReadonlyArray<{ readonly end: "start" | "end"; readonly length: Dimension; readonly gap?: Dimension; readonly fold?: "left" | "right" }>
  readonly direction?: "up" | "down" | "symmetric"
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
/**
 * A modelled ISO metric thread along Z (Fusion's Thread with Modeled on): `external` is a threaded rod, `internal` the tool that
 * cuts a tapped hole. The default operation is `new` for an external thread and `subtract` for an internal one.
 */
export interface ThreadFeature {
  readonly id: string
  readonly type: "thread"
  readonly kind: "external" | "internal"
  readonly diameter: Dimension
  readonly pitch: Dimension
  readonly length: Dimension
  /** Where the axis stands on the XY plane and the Z where the thread starts. */
  readonly at?: readonly [Dimension, Dimension]
  readonly offset?: Dimension
  /** How the thread is named on a drawing (`M8`, `G1/2"`); the default is `M` + diameter. */
  readonly designation?: string
  readonly handedness?: "right" | "left"
  readonly operation?: Operation
  readonly targets?: ReadonlyArray<string>
}
/** Text raised from, or cut into, a plane (Fusion's Text): a single-stroke font given a stroke width and a depth. */
export interface TextFeature {
  readonly id: string
  readonly type: "text"
  readonly text: string
  readonly height: Dimension
  readonly depth: Dimension
  /** Stroke width; the default is a ninth of the height. */
  readonly strokeWidth?: Dimension
  readonly plane: PlaneRef
  readonly offset?: Dimension
  /** Where the text sits on the plane: its lower-left corner, or its centre with `align: "centre"`. */
  readonly at?: readonly [Dimension, Dimension]
  readonly align?: "left" | "centre"
  readonly spacing?: Dimension
  readonly direction?: "up" | "down" | "symmetric"
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
/** Moves a planar face of a body along its normal (Fusion's Press Pull): positive grows the body, negative cuts into it. */
export interface PushPullFeature {
  readonly id: string
  readonly type: "pushpull"
  /** A point on, or near, the face: the face nearest it is taken. */
  readonly near: readonly [Dimension, Dimension, Dimension]
  /** Only faces whose outward normal points this way (within 60 degrees) are considered. */
  readonly normal?: readonly [Dimension, Dimension, Dimension]
  readonly distance: Dimension
  /** The body to search; by default the one with the face nearest `near`. */
  readonly body?: string
}
/**
 * Draft on one planar face of a body (Fusion's Draft): the face is tilted by `angle` degrees about its hinge, the line where it meets
 * the neutral plane (`pull` · p = `neutral`). Above the neutral plane (along `pull`) a positive angle takes material away, below it adds,
 * so the walls of a body lean towards the pull direction. Works on any body, not only on an extrusion.
 */
export interface DraftFeature {
  readonly id: string
  readonly type: "draft"
  readonly near: readonly [Dimension, Dimension, Dimension]
  readonly normal?: readonly [Dimension, Dimension, Dimension]
  readonly angle: Dimension
  /** Pull direction (default +Z). */
  readonly pull?: readonly [Dimension, Dimension, Dimension]
  /** Position of the neutral plane along the pull direction, mm from the origin (default 0). */
  readonly neutral?: Dimension
  readonly body?: string
}
/**
 * A rigid joint between two bodies (Fusion's Joint, rigid): a face of `body` is brought flush against a face of `to.body`, the two face
 * centres on top of each other, `offset` mm apart along the target face's normal, then turned `spin` degrees about that normal.
 * `body` moves; `to.body` stays.
 */
export interface MateFeature {
  readonly id: string
  readonly type: "mate"
  readonly body: string
  readonly face: { readonly near: readonly [Dimension, Dimension, Dimension]; readonly normal?: readonly [Dimension, Dimension, Dimension] }
  readonly to: { readonly body: string; readonly near: readonly [Dimension, Dimension, Dimension]; readonly normal?: readonly [Dimension, Dimension, Dimension] }
  readonly offset?: Dimension
  readonly spin?: Dimension
}
/**
 * A work plane (Fusion's Construct): a plane other than XY, YZ and ZX for a sketch, a hole or a text to lie on. Name it by this
 * feature's id in the `plane` field of the feature that uses it.
 *
 *   offset   `base` moved `distance` along its normal
 *   angle    `base` turned `angle` degrees about a line of it: the u axis (`about: "u"`) or the v axis, through the point `at` along the other axis
 *   points   through three points: u runs from the first to the second, the normal is u x (third - first)
 *   face     on the planar face of a body nearest `near` (`normal` picks between faces, `body` limits the search), at the face's centre
 *            and square to it; `offset` lifts it off the face. The plane follows the face when the history is rebuilt.
 */
export type PlaneDefinition =
  | { readonly kind: "offset"; readonly base: PlaneRef; readonly distance: Dimension }
  | { readonly kind: "angle"; readonly base: PlaneRef; readonly angle: Dimension; readonly about: "u" | "v"; readonly at?: Dimension }
  | { readonly kind: "points"; readonly points: readonly [readonly [Dimension, Dimension, Dimension], readonly [Dimension, Dimension, Dimension], readonly [Dimension, Dimension, Dimension]] }
  | { readonly kind: "face"; readonly near: readonly [Dimension, Dimension, Dimension]; readonly normal?: readonly [Dimension, Dimension, Dimension]; readonly body?: string; readonly offset?: Dimension }
export interface PlaneFeature { readonly id: string; readonly type: "plane"; readonly from: PlaneDefinition }
/** The solid elements of the 3D catalogue a history can place, built by the same code that draws them in the editor. */
export const PRIMITIVE_ELEMENTS = [
  "cube", "sphere", "ellipsoid", "cylinder", "cone", "prism", "pyramid", "hemisphere", "capsule", "torus", "gear", "extrusion", "revolution", "sweep", "loft",
  "spring", "bolt", "screw", "nut", "washer", "wall", "floor", "window", "door", "column", "roof", "stair"
] as const
/** Primitive fields that may be zero or negative: a gear without a bore, a start angle. */
const PRIMITIVE_MAY_BE_ZERO: ReadonlySet<string> = new Set(["holeDiameter", "phiStart"])
export type PrimitiveElement = (typeof PRIMITIVE_ELEMENTS)[number]
/**
 * A catalogue solid with parametric measures: `params` are its numeric fields (width, radius, teeth, moduleValue, ...), each a number or
 * an expression of the history's parameters; `options` its choices (direction, shape, axis, style, a metric `size` such as "M8");
 * `profile` the outline of an extrusion, a revolution or a sweep; `path` the points of a sweep and `positions` those of a loft (relative
 * to `at`), `radii` the radius of each loft section. It is placed at `at` and turned by `rotation` (degrees, about its centre), then
 * combined like any other tool.
 */
export interface PrimitiveFeature {
  readonly id: string
  readonly type: "primitive"
  readonly element: PrimitiveElement
  readonly params?: Readonly<Record<string, Dimension>>
  readonly options?: Readonly<Record<string, string>>
  readonly profile?: ReadonlyArray<readonly [Dimension, Dimension]>
  readonly path?: ReadonlyArray<readonly [Dimension, Dimension, Dimension]>
  readonly positions?: ReadonlyArray<readonly [Dimension, Dimension, Dimension]>
  readonly radii?: ReadonlyArray<Dimension>
  readonly at?: readonly [Dimension, Dimension, Dimension]
  readonly rotation?: readonly [Dimension, Dimension, Dimension]
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}

export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | HoleFeature | PatternFeature | MirrorFeature | SweepFeature | LoftFeature | ShellFeature | FilletFeature | PrimitiveFeature | CoilFeature | MoveFeature | ScaleFeature | SplitFeature | CombineFeature | RibFeature | SheetFeature | ThreadFeature | TextFeature | PushPullFeature | DraftFeature | MateFeature | PlaneFeature

export interface History {
  readonly parameters: ParameterTable
  readonly features: ReadonlyArray<Feature>
}

export interface Issue { readonly feature: string; readonly severity: "error" | "warning"; readonly message: string }

export interface Body { readonly id: string; readonly mesh: Mesh; readonly feature: string }

export interface RebuildResult {
  readonly bodies: ReadonlyArray<Body>
  readonly parameters: Readonly<Record<string, number>>
  readonly sketches: Readonly<Record<string, { readonly plane: PlaneRef; readonly offset: number; readonly frame: PlaneFrame; readonly solve: SolveResult }>>
  /** The flat pattern of each sheet-metal feature: straight length, bends and the strip's length before bending. */
  readonly flatPatterns: Readonly<Record<string, Developed>>
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

/**
 * Whether a loop lies inside another: every one of its vertices does (up to a point on the border). Testing one point is not enough:
 * two circles that overlap, the figure-eight of a boss, each have a point inside the other and neither contains the other.
 */
const ringInside = (inner: ReadonlyArray<Vec2>, outer: ReadonlyArray<Vec2>): boolean => {
  let on = 0
  for (const p of inner) {
    if (insideRing(p, outer)) continue
    // A vertex on the outer border counts as inside; one clearly outside decides.
    let near = Infinity
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const a = outer[j]!, b = outer[i]!
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
      near = Math.min(near, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
    }
    if (near > 1e-6) return false
    on++
  }
  return on < inner.length
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
  const depth = rounded.map((l, i) => rounded.filter((o, j) => j !== i && ringInside(l, o)).length)
  const parent = (i: number): number | undefined => {
    let best: number | undefined
    rounded.forEach((o, j) => {
      if (j === i || depth[j] !== depth[i]! - 1 || !ringInside(rounded[i]!, o)) return
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

/** A mesh scaled about a point; the factors are positive, so the winding is kept. */
const scaleMesh = (mesh: Mesh, factor: V3, about: V3): Mesh => {
  const positions = Float32Array.from(mesh.positions)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = about.x + (positions[i]! - about.x) * factor.x
    positions[i + 1] = about.y + (positions[i + 1]! - about.y) * factor.y
    positions[i + 2] = about.z + (positions[i + 2]! - about.z) * factor.z
  }
  return { positions, indices: mesh.indices }
}

/** Which world axis (0 = x, 1 = y, 2 = z) each local axis of a sketch plane lies along. */
const PLANE_AXES: Readonly<Record<PlaneName, { readonly u: number; readonly v: number; readonly n: number }>> = {
  XY: { u: 0, v: 1, n: 2 }, YZ: { u: 1, v: 2, n: 0 }, ZX: { u: 2, v: 0, n: 1 }
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

const vsub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const vdot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const vcross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const vadd = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const vmul = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const vunit = (a: V3): V3 => vmul(a, 1 / Math.hypot(a.x, a.y, a.z))
const meshExtent = (mesh: Mesh): number => { const b = meshBounds(mesh); return Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ, 1e-6) }

/** The planar face nearest `near` over several bodies (each searched; the face with the nearest triangle wins). */
const pickFace = (candidates: ReadonlyArray<Body>, near: V3, normal: V3 | undefined): { readonly body: Body; readonly face: PlanarFace } | { readonly error: string } => {
  let chosen: { body: Body; face: PlanarFace } | undefined
  let reason = "No face found"
  for (const body of candidates) {
    const found = findPlanarFace(body.mesh, { near, ...(normal !== undefined ? { normal } : {}) })
    if ("error" in found) { reason = found.error; continue }
    if (chosen === undefined || found.face.distance < chosen.face.distance) chosen = { body, face: found.face }
  }
  return chosen ?? { error: reason }
}

/** A box of side `2 half` with the frame (u, v, n) at `origin`, between `lo` and `hi` along n: the half-space tool of a draft. */
const slabTool = (u: V3, v: V3, n: V3, origin: V3, half: number, lo: number, hi: number): Mesh =>
  place(prism([{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }], lo, hi), u, v, n, origin)

/**
 * The material a draft adds and removes. The drafted plane is the face's plane turned by `angle` about the hinge (face plane meeting
 * the neutral plane `w . p = neutral`). Adds: the face outline pushed out, kept inside the new plane. Removes: pushed in, kept outside it.
 * Returns a reason when the draft cannot be made.
 */
const draftTools = (face: PlanarFace, w: V3, neutral: number, angle: number, extent: number): { readonly add?: Mesh; readonly remove?: Mesh } | string => {
  const n = face.normal
  const wn = vdot(w, n)
  const q0 = vsub(w, vmul(n, wn))
  const ql = Math.hypot(q0.x, q0.y, q0.z)
  if (ql < 1e-6) return "A face square to the pull direction cannot be drafted"
  if (Math.abs(angle) < 1e-12) return {}
  const q = vmul(q0, 1 / ql)
  // The hinge: the point of the face plane at the neutral height, on the line through the face origin along its steepest direction.
  const t = (neutral - vdot(w, face.origin)) / vdot(w, q)
  const hinge = vadd(face.origin, vmul(q, t))
  const e = vunit(vcross(n, w))
  const rotate = (v: V3, theta: number): V3 => vadd(vadd(vmul(v, Math.cos(theta)), vmul(vcross(e, v), Math.sin(theta))), vmul(e, vdot(e, v) * (1 - Math.cos(theta))))
  // Positive angle: higher up the face (along the pull direction) the new plane lies inside the body.
  const displacement = (nn: V3, p: V3): number => -vdot(nn, vsub(p, hinge)) / vdot(nn, n)
  const lean = displacement(rotate(n, Math.abs(angle)), vadd(hinge, q)) < 0 ? 1 : -1
  const tilted = rotate(n, lean * angle)
  const tv = vunit(vcross(tilted, Math.abs(tilted.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }))
  const tu = vcross(tv, tilted)
  const at = (p: Vec2): V3 => vadd(face.origin, vadd(vmul(face.u, p.x), vmul(face.v, p.y)))
  let sMax = 0, sMin = 0
  for (const loop of face.loops) for (const p of loop) { const s = displacement(tilted, at(p)); sMax = Math.max(sMax, s); sMin = Math.min(sMin, s) }
  if (Math.max(sMax, -sMin) > 2 * extent) return "The draft is too large for this body (the face tilts away by more than twice the body's size)"
  const half = 4 * extent + 4 * Math.max(sMax, -sMin)
  const margin = 0.01
  const out: { add?: Mesh; remove?: Mesh } = {}
  if (sMax > 1e-9) {
    const pushed = profileSolid(face.loops, -margin, sMax + margin)
    if (pushed !== undefined) {
      const inside = slabTool(tu, tv, tilted, hinge, half, -half, 0)
      const part = booleanMesh(place(pushed, face.u, face.v, n, face.origin), inside, "intersect")
      if (part.indices.length > 0) out.add = part
    }
  }
  if (sMin < -1e-9) {
    const pushed = profileSolid(face.loops, sMin - margin, margin)
    if (pushed !== undefined) {
      const outside = slabTool(tu, tv, tilted, hinge, half, 0, half)
      const part = booleanMesh(place(pushed, face.u, face.v, n, face.origin), outside, "intersect")
      if (part.indices.length > 0) out.remove = part
    }
  }
  return out
}

/** The mesh moved so that `mine` lies flush against `theirs` (normals opposed, centres together, `offset` apart), then spun about their normal. */
const mateMesh = (mesh: Mesh, mine: PlanarFace, theirs: PlanarFace, offset: number, spin: number): Mesh => {
  const target = vmul(theirs.normal, -1)
  const d = Math.max(-1, Math.min(1, vdot(mine.normal, target)))
  let turned = mesh
  if (d < 1 - 1e-12) {
    let axis = vcross(mine.normal, target)
    if (Math.hypot(axis.x, axis.y, axis.z) < 1e-9) axis = vcross(mine.normal, Math.abs(mine.normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 })
    turned = rotateMesh(mesh, vunit(axis), Math.acos(d), mine.centroid)
  }
  const goal = vadd(theirs.centroid, vmul(theirs.normal, offset))
  const moved = translateMesh(turned, goal.x - mine.centroid.x, goal.y - mine.centroid.y, goal.z - mine.centroid.z)
  return Math.abs(spin) < 1e-12 ? moved : rotateMesh(moved, theirs.normal, spin, goal)
}

/** The corners of a sketched chain: its points where the direction turns by more than a degree (the points of an arc's chords drop out only when straight). */
const cornersOf = (line: ReadonlyArray<Vec2>): Vec2[] => {
  const pts = line.filter((p, i) => i === 0 || Math.hypot(p.x - line[i - 1]!.x, p.y - line[i - 1]!.y) > 1e-9)
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true
    const a = pts[i - 1]!, b = pts[i + 1]!
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)
    const dot = (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)
    return Math.abs(Math.atan2(cross, dot)) > (Math.PI / 180)
  })
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
  const sketches: Record<string, { plane: PlaneRef; offset: number; frame: PlaneFrame; solve: SolveResult }> = {}
  /** Work planes made by `plane` features, with their offset already applied. */
  const planes = new Map<string, PlaneFrame>()
  const frameFor = (ref: string, offset: number): PlaneFrame | undefined => {
    const base: PlaneFrame | undefined = Object.hasOwn(FRAMES, ref) ? { ...FRAMES[ref as PlaneName], origin: { x: 0, y: 0, z: 0 } } : planes.get(ref)
    if (base === undefined) return undefined
    return offset === 0 ? base : { ...base, origin: { x: base.origin.x + base.n.x * offset, y: base.origin.y + base.n.y * offset, z: base.origin.z + base.n.z * offset } }
  }
  const bodies: Body[] = []
  const flatPatterns: Record<string, Developed> = {}
  const tools = new Map<string, { readonly meshes: ReadonlyArray<Mesh>; readonly operation: Operation; readonly targets?: ReadonlyArray<string> }>()
  /** What a shell needs from an extrusion: its profile after the corner treatment, its depths and its plane. */
  const extrusions = new Map<string, { readonly loops: ReadonlyArray<Vec2[]>; readonly from: number; readonly to: number; readonly frame: PlaneFrame; readonly tapered: boolean }>()
  /** Full revolutions, for a shell: the profile as (axial, radial) points and how to put a mesh built in the revolve's local frame in the world. */
  const revolutions = new Map<string, { readonly ring: ReadonlyArray<{ readonly a: number; readonly r: number }>; readonly full: boolean; readonly put: (mesh: Mesh) => Mesh }>()
  /** Sweeps, for a shell: the profile loops in their plane, the path in the world and the plane's data. */
  const sweeps = new Map<string, { readonly sketch: { frame: PlaneFrame }; readonly loops: ReadonlyArray<Vec2[]>; readonly path: ReadonlyArray<V3>; readonly closed: boolean }>()
  const usable = (id: string): { plane: PlaneRef; offset: number; frame: PlaneFrame; solve: SolveResult } | undefined => {
    const sk = sketches[id]
    return sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed" ? undefined : sk
  }
  /** A point of a sketch's plane in the world. */
  const worldOf = (sk: { frame: PlaneFrame }, p: Vec2): V3 => ptOf(sk.frame, sk.frame.origin, { x: p.x, y: p.y, z: 0 })

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
  const sweepLoops = (sk: { frame: PlaneFrame }, loops: ReadonlyArray<Vec2[]>, path: ReadonlyArray<V3>, closed: boolean): Mesh | undefined => {
    const fr = sk.frame
    const nesting = loops.map((l, i) => loops.filter((o, j) => j !== i && ringInside(l, o)).length)
    const solids: Mesh[] = []
    loops.forEach((loop, i) => {
      if (nesting[i]! % 2 !== 0) return
      const world = (l: ReadonlyArray<Vec2>): P3[] => l.map((p) => worldOf(sk, p))
      const ring = world(loop)
      const centre = { x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length, z: ring.reduce((a, p) => a + p.z, 0) / ring.length }
      let solid = sweepSolid({ ring, ring2d: loop, normal: fr.n, centre, path, closed })
      loops.forEach((hole, j) => {
        if (nesting[j] !== nesting[i]! + 1 || !ringInside(hole, loop)) return
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
          const expanded = expandSketch(f.sketch, (d) => {
            const v = dim(d, f.id)
            if (v === undefined) { ok = false; return 0 }
            return v
          })
          if (!ok) break
          for (const c of expanded.constraints) {
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
          const solve = solveSketch({ entities: expanded.entities, constraints })
          const planeFrame = frameFor(f.plane, offset)
          if (planeFrame === undefined) { issues.push({ feature: f.id, severity: "error", message: `Plane '${f.plane}' is not XY, YZ, ZX or an earlier plane feature` }); break }
          sketches[f.id] = { plane: f.plane, offset, frame: planeFrame, solve }
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
          if (local !== undefined) extrusions.set(f.id, { loops: rounded, from, to: from + depth, frame: sk.frame, tapered: shape.taper !== undefined })
          if (local === undefined) { issues.push({ feature: f.id, severity: "error", message: "The sketch has no closed profile to extrude" }); break }
          const frame = sk.frame
          const tool = place(local, frame.u, frame.v, frame.n, frame.origin)
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
          const frame = sk.frame
          const ax = ptOf(frame, { x: 0, y: 0, z: 0 }, { x: dirA.x, y: dirA.y, z: 0 })
          const nrm = frame.n
          const ex = { x: nrm.y * ax.z - nrm.z * ax.y, y: nrm.z * ax.x - nrm.x * ax.z, z: nrm.x * ax.y - nrm.y * ax.x }
          const origin = ptOf(frame, frame.origin, { x: a0.x, y: a0.y, z: 0 })
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
          if (f.thread !== undefined) {
            const metric = /^M(\d+(?:\.\d+)?)(?:x[\d.]+)?$/.exec(f.thread.designation)
            const known = metric === null ? undefined : metricThread(`M${metric[1]}`)
            if (known !== undefined && Math.abs(known.tapDrill - d) > 0.15) issues.push({ feature: f.id, severity: "warning", message: `The tap drill of ${known.name} is ${known.tapDrill} mm, this hole is ${d} mm` })
          }
          const frame = frameFor(f.plane, offset)
          if (frame === undefined) { issues.push({ feature: f.id, severity: "error", message: `Plane '${f.plane}' is not XY, YZ, ZX or an earlier plane feature` }); break }
          const offsetVec = frame.origin
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
            const depthOf = extrusion.loops.map((l, i) => extrusion.loops.filter((o, j) => j !== i && ringInside(l, o)).length)
            const cavities: Mesh[] = []
            extrusion.loops.forEach((loop, i) => {
              if (depthOf[i]! % 2 !== 0) return
              let cavity = prism(moveRing(loop, t), z0, z1)
              extrusion.loops.forEach((hole, j) => {
                if (depthOf[j] !== depthOf[i]! + 1 || !ringInside(hole, loop)) return
                cavity = booleanMesh(cavity, prism(moveRing(hole, -t), z0 - 1, z1 + 1), "subtract")
              })
              cavities.push(cavity)
            })
            if (cavities.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is nothing to hollow out" }); break }
            const fr = extrusion.frame
            const local = cavities.slice(1).reduce((acc, m) => booleanMesh(acc, m, "union"), cavities[0]!)
            tool = place(local, fr.u, fr.v, fr.n, fr.origin)
          } else if (revolution !== undefined) {
            if (!revolution.full) { issues.push({ feature: f.id, severity: "error", message: "Only a full revolution (360 degrees) can be shelled" }); break }
            const profile = shellRevolveProfile(revolution.ring, t, open)
            tool = revolution.put(meshOf({ _tag: "Revolve", profile, angle: 2 * Math.PI }, 0.01))
          } else if (swept !== undefined) {
            // The cavity is the same sweep of the profile moved inwards by the wall; a closed hollow stops a wall short of each end.
            const inner = swept.loops.map((l, i) => {
              const nesting = swept.loops.filter((o, j) => j !== i && ringInside(l, o)).length
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
          sweeps.set(f.id, { sketch: { frame: profileSketch.frame }, loops: profile.loops, path, closed: closedPath })
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
        case "primitive": {
          const fields: Record<string, unknown> = { type: f.element, ...(f.options ?? {}) }
          let failed = false
          for (const [key, value] of Object.entries(f.params ?? {})) {
            const v = dim(value, f.id)
            if (v === undefined) failed = true
            else fields[key] = v
          }
          const at = (f.at ?? [0, 0, 0]).map((d) => dim(d, f.id)), turn = f.rotation?.map((d) => dim(d, f.id))
          const outline = f.profile?.map(([x, y]) => ({ x: dim(x, f.id), y: dim(y, f.id) }))
          const triples = (list: ReadonlyArray<readonly [Dimension, Dimension, Dimension]> | undefined) => list?.map(([x, y, z]) => ({ x: dim(x, f.id), y: dim(y, f.id), z: dim(z, f.id) }))
          const route = triples(f.path), stations = triples(f.positions)
          const sections = f.radii?.map((r) => dim(r, f.id))
          const incomplete = [...(route ?? []), ...(stations ?? [])].some((p) => p.x === undefined || p.y === undefined || p.z === undefined) || sections?.some((r) => r === undefined)
          if (failed || incomplete || at.some((v) => v === undefined) || turn?.some((v) => v === undefined) || outline?.some((p) => p.x === undefined || p.y === undefined)) break
          fields["x"] = at[0]; fields["y"] = at[1]; fields["z"] = at[2]
          if (turn !== undefined) fields["rotation"] = { x: turn[0], y: turn[1], z: turn[2] }
          if (outline !== undefined) fields["profile"] = outline
          if (route !== undefined) fields["path"] = route
          if (stations !== undefined) fields["positions"] = stations
          if (sections !== undefined) fields["profiles"] = sections.map((radius) => ({ radius }))
          // The element builder would quietly use its default for a size that is not positive: say so instead.
          for (const key of Object.keys(f.params ?? {})) {
            const v = fields[key] as number
            if (!(v > 0) && !PRIMITIVE_MAY_BE_ZERO.has(key)) { issues.push({ feature: f.id, severity: "error", message: `${f.element}.${key} must be positive (it is ${v})` }); failed = true }
          }
          if (failed) break
          const built = elementMesh(fields)
          if (built === undefined) { issues.push({ feature: f.id, severity: "error", message: `The ${f.element} cannot be built from these measures${f.element === "extrusion" || f.element === "revolution" ? " (it needs a profile of points; a revolution needs them on one side of the axis)" : ""}` }); break }
          const tool: Mesh = { positions: Float32Array.from(built.positions), indices: built.indices }
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "coil": {
          const radius = dim(f.radius, f.id), pitch = dim(f.pitch, f.id), turns = dim(f.turns, f.id), wire = dim(f.wireDiameter, f.id)
          const cx = f.centre === undefined ? 0 : dim(f.centre[0], f.id), cy = f.centre === undefined ? 0 : dim(f.centre[1], f.id)
          const z0 = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if ([radius, pitch, turns, wire, cx, cy, z0].some((v) => v === undefined)) break
          if (!(wire! > 0 && radius! > 0 && pitch! > 0 && turns! > 0)) { issues.push({ feature: f.id, severity: "error", message: "A coil needs a positive radius, pitch, number of turns and wire diameter" }); break }
          if (turns! > COIL_MAX_TURNS) { issues.push({ feature: f.id, severity: "error", message: `A coil has at most ${COIL_MAX_TURNS} turns (it has ${turns})` }); break }
          if (!(radius! > wire! / 2 + 1e-9)) { issues.push({ feature: f.id, severity: "error", message: `The coil radius (${radius}) must exceed the wire radius (${wire! / 2}) or the wire crosses the axis` }); break }
          if (!(pitch! > wire! + 1e-9)) { issues.push({ feature: f.id, severity: "error", message: `The pitch (${pitch} mm) must exceed the wire diameter (${wire} mm): neighbouring turns would overlap` }); break }
          const g = coilGeometry({ cx: cx!, cy: cy!, z0: z0!, radius: radius!, pitch: pitch!, turns: turns!, wire: wire!, square: f.section === "square", left: f.handedness === "left" })
          const tool = sweepSolid({ ring: g.ring, ring2d: g.ring2d, normal: g.normal, centre: g.centre, path: g.path, closed: false, axis: { point: { x: cx!, y: cy!, z: z0! }, direction: { x: 0, y: 0, z: 1 } } })
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "move": {
          const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
          if (chosen.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is no body to move" }); break }
          if (f.translate === undefined && f.rotate === undefined) { issues.push({ feature: f.id, severity: "error", message: "A move needs a translation, a rotation or both" }); break }
          const shift = f.translate?.map((d) => dim(d, f.id))
          const angle = f.rotate === undefined ? undefined : dim(f.rotate.angle, f.id)
          const about = f.rotate?.about?.map((d) => dim(d, f.id))
          if (shift?.some((v) => v === undefined) || (f.rotate !== undefined && angle === undefined) || about?.some((v) => v === undefined)) break
          const axis = f.rotate === undefined ? undefined : f.rotate.axis === "x" ? { x: 1, y: 0, z: 0 } : f.rotate.axis === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }
          for (const b of chosen) {
            let mesh = b.mesh
            if (axis !== undefined) mesh = rotateMesh(mesh, axis, (angle! * Math.PI) / 180, about === undefined ? { x: 0, y: 0, z: 0 } : { x: about[0]!, y: about[1]!, z: about[2]! })
            if (shift !== undefined) mesh = translateMesh(mesh, shift[0]!, shift[1]!, shift[2]!)
            if (f.copy === true) bodies.push({ id: chosen.length === 1 ? f.id : `${f.id}#${b.id}`, mesh, feature: f.id })
            else bodies[bodies.indexOf(b)] = { ...b, mesh }
          }
          break
        }
        case "scale": {
          const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
          if (chosen.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is no body to scale" }); break }
          const factors = (Array.isArray(f.factor) ? f.factor : [f.factor, f.factor, f.factor]).map((d) => dim(d as Dimension, f.id))
          const about = f.about?.map((d) => dim(d, f.id))
          if (factors.some((v) => v === undefined) || about?.some((v) => v === undefined)) break
          if (factors.some((v) => !(v! > 0))) { issues.push({ feature: f.id, severity: "error", message: `A scale factor must be positive (they are ${factors.join(", ")})` }); break }
          const centre = about === undefined ? { x: 0, y: 0, z: 0 } : { x: about[0]!, y: about[1]!, z: about[2]! }
          for (const b of chosen) bodies[bodies.indexOf(b)] = { ...b, mesh: scaleMesh(b.mesh, { x: factors[0]!, y: factors[1]!, z: factors[2]! }, centre) }
          break
        }
        case "split": {
          const value = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if (value === undefined) break
          const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
          if (chosen.length === 0) { issues.push({ feature: f.id, severity: "error", message: "There is no body to split" }); break }
          const frame = FRAMES[f.plane], axes = PLANE_AXES[f.plane]
          /** The part of a body on one side of the plane: the body cut with a box that fills that half-space. */
          const side = (mesh: Mesh, above: boolean): Mesh | undefined => {
            const bb = meshBounds(mesh)
            const lo = [bb.minX, bb.minY, bb.minZ], hi = [bb.maxX, bb.maxY, bb.maxZ]
            const ring = [{ x: lo[axes.u]! - 1, y: lo[axes.v]! - 1 }, { x: hi[axes.u]! + 1, y: lo[axes.v]! - 1 }, { x: hi[axes.u]! + 1, y: hi[axes.v]! + 1 }, { x: lo[axes.u]! - 1, y: hi[axes.v]! + 1 }]
            const box = above ? prism(ring, value, Math.max(hi[axes.n]!, value) + 1) : prism(ring, Math.min(lo[axes.n]!, value) - 1, value)
            const part = booleanMesh(mesh, place(box, frame.u, frame.v, frame.n, { x: 0, y: 0, z: 0 }), "intersect")
            return part.indices.length === 0 ? undefined : part
          }
          for (const b of chosen) {
            const kept = f.keep === "below" ? [false] : f.keep === "above" ? [true] : [true, false]
            const parts = kept.map((above) => ({ above, mesh: side(b.mesh, above) }))
            const present = parts.filter((p) => p.mesh !== undefined)
            if (present.length === 0) { issues.push({ feature: f.id, severity: "error", message: `The plane leaves nothing of '${b.id}' on the side asked for` }); continue }
            if (f.keep === "both" && present.length < 2) issues.push({ feature: f.id, severity: "warning", message: `The plane does not cut through '${b.id}': it stays whole` })
            bodies[bodies.indexOf(b)] = { ...b, mesh: present[0]!.mesh! }
            if (present.length > 1) bodies.push({ id: `${f.id}:${b.id}:below`, mesh: present[1]!.mesh!, feature: f.id })
          }
          break
        }
        case "combine": {
          const target = bodies.find((b) => b.id === f.target)
          if (target === undefined) { issues.push({ feature: f.id, severity: "error", message: `Body '${f.target}' does not exist at this point of the history` }); break }
          const toolBodies = f.tools.map((id) => bodies.find((b) => b.id === id))
          const missing = f.tools.filter((_, i) => toolBodies[i] === undefined)
          if (missing.length > 0) { issues.push({ feature: f.id, severity: "error", message: `Tool bod${missing.length === 1 ? "y" : "ies"} ${missing.map((m) => `'${m}'`).join(", ")} do${missing.length === 1 ? "es" : ""} not exist at this point of the history` }); break }
          if (f.tools.includes(f.target)) { issues.push({ feature: f.id, severity: "error", message: "A body cannot be combined with itself" }); break }
          const op = f.operation === "join" ? "union" : f.operation === "cut" ? "subtract" : "intersect"
          let mesh = target.mesh
          for (const tool of toolBodies) mesh = booleanMesh(mesh, tool!.mesh, op)
          bodies[bodies.indexOf(target)] = { ...target, mesh }
          if (f.keepTools !== true) for (const tool of toolBodies) bodies.splice(bodies.indexOf(tool!), 1)
          break
        }
        case "rib": {
          const sk = usable(f.sketch)
          if (sk === undefined) { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const thickness = dim(f.thickness, f.id), depth = dim(f.depth, f.id)
          if (thickness === undefined || depth === undefined) break
          if (!(thickness > 0 && depth > 0)) { issues.push({ feature: f.id, severity: "error", message: `A rib needs a positive thickness and depth (they are ${thickness} and ${depth})` }); break }
          const { loops, open } = sketchProfiles(sk.solve.sketch)
          if (open.length === 0) { issues.push({ feature: f.id, severity: "error", message: "A rib needs an open line in the sketch (its centre line); the sketch has none" }); break }
          if (loops.length > 0) issues.push({ feature: f.id, severity: "warning", message: `${loops.length} closed loop(s) in the sketch are ignored (a rib is drawn with open lines)` })
          const dir = f.direction ?? "up"
          const from = dir === "up" ? 0 : dir === "down" ? -depth : -depth / 2
          const frame = sk.frame
          const origin = frame.origin
          const webs = open.map((line) => place(prism(thickenPath(line, -thickness / 2, thickness / 2), from, from + depth), frame.u, frame.v, frame.n, origin))
          const tool = webs.slice(1).reduce((acc, m) => booleanMesh(acc, m, "union"), webs[0]!)
          const operation = f.operation ?? "union"
          tools.set(f.id, { meshes: [tool], operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, operation, f.targets, f.id)
          break
        }
        case "sheet": {
          const sk = usable(f.sketch)
          if (sk === undefined) { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const thickness = dim(f.thickness, f.id), width = dim(f.width, f.id)
          const radius = f.bendRadius === undefined ? 0 : dim(f.bendRadius, f.id)
          if (thickness === undefined || width === undefined || radius === undefined) break
          if (!(thickness > 0 && width > 0)) { issues.push({ feature: f.id, severity: "error", message: `A sheet needs a positive thickness and width (they are ${thickness} and ${width})` }); break }
          const { open } = sketchProfiles(sk.solve.sketch)
          if (open.length !== 1) { issues.push({ feature: f.id, severity: "error", message: `A sheet profile is one open line (lines and arcs end to end); the sketch has ${open.length}` }); break }
          const side = f.side ?? "centre"
          let line: Vec2[] = open[0]!
          if (f.hems !== undefined && f.hems.length > 0) {
            const specs = f.hems.map((h) => ({ end: h.end, length: dim(h.length, f.id), gap: h.gap === undefined ? 0 : dim(h.gap, f.id), fold: h.fold ?? "left" }))
            if (specs.some((h) => h.length === undefined || h.gap === undefined)) break
            if (new Set(specs.map((h) => h.end)).size !== specs.length) { issues.push({ feature: f.id, severity: "error", message: "A sheet has at most one hem at each end" }); break }
            line = withHems(cornersOf(line), thickness, specs as never)
          }
          const outline = sheetOutline(line, thickness, side, radius)
          const dir = f.direction ?? "up"
          const from = dir === "up" ? 0 : dir === "down" ? -width : -width / 2
          const frame = sk.frame
          const tool = place(prism(outline, from, from + width), frame.u, frame.v, frame.n, frame.origin)
          // The flat pattern is read off the drawn line with its arcs replaced by their corners: only the corners count.
          flatPatterns[f.id] = developedLength(cornersOf(line), thickness, radius, side)
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "thread": {
          const diameter = dim(f.diameter, f.id), pitch = dim(f.pitch, f.id), length = dim(f.length, f.id)
          const cx = f.at === undefined ? 0 : dim(f.at[0], f.id), cy = f.at === undefined ? 0 : dim(f.at[1], f.id)
          const z0 = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if ([diameter, pitch, length, cx, cy, z0].some((v) => v === undefined)) break
          const spec = { diameter: diameter!, pitch: pitch!, length: length!, internal: f.kind === "internal", left: f.handedness === "left", cx: cx!, cy: cy!, z0: z0! }
          const problem = threadProblem(spec)
          if (problem !== undefined) { issues.push({ feature: f.id, severity: "error", message: problem }); break }
          const tool = threadTool(spec)
          const operation = f.operation ?? (f.kind === "internal" ? "subtract" : "new")
          tools.set(f.id, { meshes: [tool], operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, operation, f.targets, f.id)
          break
        }
        case "text": {
          const height = dim(f.height, f.id), depth = dim(f.depth, f.id)
          const stroke = f.strokeWidth === undefined ? undefined : dim(f.strokeWidth, f.id)
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id)
          const at = f.at === undefined ? [0, 0] : [dim(f.at[0], f.id), dim(f.at[1], f.id)]
          const spacing = f.spacing === undefined ? 1 : dim(f.spacing, f.id)
          if ([height, depth, offset, spacing, ...at].some((v) => v === undefined) || (f.strokeWidth !== undefined && stroke === undefined)) break
          if (!(height! > 0 && depth! > 0)) { issues.push({ feature: f.id, severity: "error", message: `Text needs a positive height and depth (they are ${height} and ${depth})` }); break }
          if (f.text.trim().length === 0) { issues.push({ feature: f.id, severity: "error", message: "The text is empty" }); break }
          if (f.text.length > 200) { issues.push({ feature: f.id, severity: "error", message: "A text feature takes at most 200 characters" }); break }
          const built = textSolid({ text: f.text, height: height!, strokeWidth: stroke ?? height! / 9, depth: depth!, spacing: spacing!, align: f.align ?? "left" })
          if (built.unsupported.length > 0) issues.push({ feature: f.id, severity: "warning", message: `No glyph for ${built.unsupported.map((c) => `'${c}'`).join(", ")}: not drawn` })
          if (built.mesh === undefined) { issues.push({ feature: f.id, severity: "error", message: "Nothing of the text could be drawn" }); break }
          const dir = f.direction ?? "up"
          const local = translateMesh(built.mesh, at[0]!, at[1]!, dir === "up" ? 0 : dir === "down" ? -depth! : -depth! / 2)
          const frame = frameFor(f.plane, offset!)
          if (frame === undefined) { issues.push({ feature: f.id, severity: "error", message: `Plane '${f.plane}' is not XY, YZ, ZX or an earlier plane feature` }); break }
          const tool = place(local, frame.u, frame.v, frame.n, frame.origin)
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "plane": {
          const d = f.from
          let frame: PlaneFrame | undefined
          if (d.kind === "offset") {
            const distance = dim(d.distance, f.id)
            if (distance === undefined) break
            frame = frameFor(d.base, distance)
            if (frame === undefined) { issues.push({ feature: f.id, severity: "error", message: `Base plane '${d.base}' is not XY, YZ, ZX or an earlier plane feature` }); break }
          } else if (d.kind === "angle") {
            const angle = dim(d.angle, f.id), at = d.at === undefined ? 0 : dim(d.at, f.id)
            const base = frameFor(d.base, 0)
            if (angle === undefined || at === undefined) break
            if (base === undefined) { issues.push({ feature: f.id, severity: "error", message: `Base plane '${d.base}' is not XY, YZ, ZX or an earlier plane feature` }); break }
            const axis = d.about === "u" ? base.u : base.v
            const across = d.about === "u" ? base.v : base.u
            const turn = (vec: V3): V3 => {
              const c = Math.cos((angle * Math.PI) / 180), sn = Math.sin((angle * Math.PI) / 180)
              return vadd(vadd(vmul(vec, c), vmul(vcross(axis, vec), sn)), vmul(axis, vdot(axis, vec) * (1 - c)))
            }
            const origin = vadd(base.origin, vmul(across, at))
            frame = d.about === "u" ? { u: base.u, v: turn(base.v), n: turn(base.n), origin } : { u: turn(base.u), v: base.v, n: turn(base.n), origin }
          } else if (d.kind === "points") {
            const c = d.points.map((p) => p.map((x) => dim(x, f.id)))
            if (c.some((p) => p.some((x) => x === undefined))) break
            const [p1, p2, p3] = c.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2]! })) as [V3, V3, V3]
            const e1 = vsub(p2, p1), nn = vcross(e1, vsub(p3, p1))
            if (Math.hypot(e1.x, e1.y, e1.z) < 1e-9 || Math.hypot(nn.x, nn.y, nn.z) < 1e-9) { issues.push({ feature: f.id, severity: "error", message: "The three points of a plane must not be on one line" }); break }
            const u = vunit(e1), n = vunit(nn)
            frame = { u, v: vcross(n, u), n, origin: p1 }
          } else {
            const near = d.near.map((x) => dim(x, f.id)), wanted = d.normal?.map((x) => dim(x, f.id))
            const lift = d.offset === undefined ? 0 : dim(d.offset, f.id)
            if (near.some((x) => x === undefined) || wanted?.some((x) => x === undefined) || lift === undefined) break
            const candidates = bodies.filter((b) => d.body === undefined || b.id === d.body)
            if (candidates.length === 0) { issues.push({ feature: f.id, severity: "error", message: d.body === undefined ? "There is no body to take a face from" : `Body '${d.body}' does not exist at this point of the history` }); break }
            const pick = pickFace(candidates, { x: near[0]!, y: near[1]!, z: near[2]! }, wanted === undefined ? undefined : { x: wanted[0]!, y: wanted[1]!, z: wanted[2]! })
            if ("error" in pick) { issues.push({ feature: f.id, severity: "error", message: pick.error }); break }
            const n = pick.face.normal
            // u is the world X (or Y when the face is square to X) projected on the face, so a top face is read like XY.
            const hint = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
            const u = vunit(vsub(hint, vmul(n, vdot(hint, n))))
            frame = { u, v: vcross(n, u), n, origin: vadd(pick.face.centroid, vmul(n, lift)) }
          }
          if (frame !== undefined) planes.set(f.id, frame)
          break
        }
        case "draft": {
          const near = f.near.map((d) => dim(d, f.id)), wanted = f.normal?.map((d) => dim(d, f.id))
          const pullRaw = (f.pull ?? [0, 0, 1]).map((d) => dim(d, f.id))
          const angle = dim(f.angle, f.id), neutral = f.neutral === undefined ? 0 : dim(f.neutral, f.id)
          if (near.some((v) => v === undefined) || wanted?.some((v) => v === undefined) || pullRaw.some((v) => v === undefined) || angle === undefined || neutral === undefined) break
          if (!(Math.abs(angle) < 45)) { issues.push({ feature: f.id, severity: "error", message: `The draft angle must be between -45 and 45 degrees (it is ${angle})` }); break }
          const pl = Math.hypot(pullRaw[0]!, pullRaw[1]!, pullRaw[2]!)
          if (!(pl > 0)) { issues.push({ feature: f.id, severity: "error", message: "The pull direction is a zero vector" }); break }
          const w: V3 = { x: pullRaw[0]! / pl, y: pullRaw[1]! / pl, z: pullRaw[2]! / pl }
          const candidates = bodies.filter((b) => f.body === undefined || b.id === f.body)
          if (candidates.length === 0) { issues.push({ feature: f.id, severity: "error", message: f.body === undefined ? "There is no body to draft" : `Body '${f.body}' does not exist at this point of the history` }); break }
          const pick = pickFace(candidates, { x: near[0]!, y: near[1]!, z: near[2]! }, wanted === undefined ? undefined : { x: wanted[0]!, y: wanted[1]!, z: wanted[2]! })
          if ("error" in pick) { issues.push({ feature: f.id, severity: "error", message: pick.error }); break }
          const { face, body } = pick
          const parts = draftTools(face, w, neutral, (angle * Math.PI) / 180, meshExtent(body.mesh))
          if (typeof parts === "string") { issues.push({ feature: f.id, severity: "error", message: parts }); break }
          if (parts.add !== undefined) apply(f.id, parts.add, "union", [body.id], f.id)
          if (parts.remove !== undefined) apply(f.id, parts.remove, "subtract", [body.id], f.id)
          if (parts.add === undefined && parts.remove === undefined) issues.push({ feature: f.id, severity: "warning", message: "The draft changes nothing (the neutral plane lies beyond the face, or the angle is 0)" })
          break
        }
        case "mate": {
          const a = f.face.near.map((d) => dim(d, f.id)), an = f.face.normal?.map((d) => dim(d, f.id))
          const b = f.to.near.map((d) => dim(d, f.id)), bn = f.to.normal?.map((d) => dim(d, f.id))
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id), spin = f.spin === undefined ? 0 : dim(f.spin, f.id)
          if ([...a, ...b, ...(an ?? []), ...(bn ?? [])].some((v) => v === undefined) || offset === undefined || spin === undefined) break
          const moving = bodies.find((x) => x.id === f.body), fixed = bodies.find((x) => x.id === f.to.body)
          if (moving === undefined || fixed === undefined) { issues.push({ feature: f.id, severity: "error", message: `Body '${moving === undefined ? f.body : f.to.body}' does not exist at this point of the history` }); break }
          if (moving === fixed) { issues.push({ feature: f.id, severity: "error", message: "A body cannot be mated to itself" }); break }
          const v3 = (c: ReadonlyArray<number | undefined>): V3 => ({ x: c[0]!, y: c[1]!, z: c[2]! })
          const first = pickFace([moving], v3(a), an === undefined ? undefined : v3(an)), second = pickFace([fixed], v3(b), bn === undefined ? undefined : v3(bn))
          if ("error" in first) { issues.push({ feature: f.id, severity: "error", message: `Face of '${f.body}': ${first.error}` }); break }
          if ("error" in second) { issues.push({ feature: f.id, severity: "error", message: `Face of '${f.to.body}': ${second.error}` }); break }
          const mesh = mateMesh(moving.mesh, first.face, second.face, offset, (spin * Math.PI) / 180)
          bodies[bodies.indexOf(moving)] = { ...moving, mesh }
          break
        }
        case "pushpull": {
          const near = f.near.map((d) => dim(d, f.id)), wantedNormal = f.normal?.map((d) => dim(d, f.id))
          const distance = dim(f.distance, f.id)
          if (near.some((v) => v === undefined) || wantedNormal?.some((v) => v === undefined) || distance === undefined) break
          if (distance === 0) { issues.push({ feature: f.id, severity: "warning", message: "A push/pull of 0 changes nothing" }); break }
          const candidates = bodies.filter((b) => f.body === undefined || b.id === f.body)
          if (candidates.length === 0) { issues.push({ feature: f.id, severity: "error", message: f.body === undefined ? "There is no body to push or pull" : `Body '${f.body}' does not exist at this point of the history` }); break }
          const pick = pickFace(candidates, { x: near[0]!, y: near[1]!, z: near[2]! }, wantedNormal === undefined ? undefined : { x: wantedNormal[0]!, y: wantedNormal[1]!, z: wantedNormal[2]! })
          if ("error" in pick) { issues.push({ feature: f.id, severity: "error", message: pick.error }); break }
          const { face, body } = pick
          const margin = 0.01
          const local = distance > 0 ? profileSolid(face.loops, -margin, distance) : profileSolid(face.loops, distance, margin)
          if (local === undefined) { issues.push({ feature: f.id, severity: "error", message: "The face has no closed outline to push" }); break }
          const tool = place(local, face.u, face.v, face.normal, face.origin)
          apply(f.id, tool, distance > 0 ? "union" : "subtract", [body.id], f.id)
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
  return { bodies, parameters: values, sketches, flatPatterns, issues }
}

/** Volume of the bodies together, mm^3 (they may touch but are assumed not to overlap). */
export const historyVolume = (result: RebuildResult): number => result.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)

/** A history with one parameter set to a new value (a number or an expression). */
export const withParameter = (history: History, name: string, value: number | string): History => ({
  ...history,
  parameters: { ...history.parameters, [name]: value }
})
