/**
 * `cad.workflow`: the Fusion-class workflow around the exact kernel, for the assistant (specs 45, 46, 49, 50).
 *
 *   sketch       solve a constrained 2D sketch (dimensional and geometric constraints), report degrees of freedom, redundant and
 *                conflicting constraints (minimal set), drag an entity with every constraint holding
 *   assembly     place occurrences of part definitions, solve mates (coincident, concentric, parallel, perpendicular, distance, angle,
 *                tangent, lock, revolute, slider, cylindrical, planar, ball), sweep a joint, check interference, mass and BOM
 *   sheet        a production drawing sheet of a parametric part as a vector PDF (or SVG)
 *   mesh_import  STL / OBJ / 3MF bytes to a repaired, unit-converted mesh with a validity report
 *   mesh_export  the exact bodies of a parametric part as STL / OBJ / 3MF
 *
 * Everything runs in process on the values sent; nothing is stored in the document (a solved sketch is written into a history by
 * `cad_edit`). Lengths are millimetres, angles degrees.
 */
import { Schema } from "effect"
import { ParametricHistory } from "./ai-parametric.ts"

const optional = Schema.optionalKey
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const xy = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const xyz = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })

export const SKETCH_CONSTRAINT_TYPES = [
  "fixed", "coincident", "horizontal", "vertical", "horizontalPoints", "verticalPoints", "distance", "distanceX", "distanceY", "length", "parallel", "perpendicular",
  "equalLength", "equalRadius", "radius", "diameter", "angle", "pointOnLine", "pointOnCircle", "midpoint", "symmetric", "tangentLineCircle", "tangentCircles",
  "concentric", "ellipseSize", "pointOnEllipse", "collinear"
] as const

export const MATE_KINDS = [
  "coincident", "concentric", "parallel", "perpendicular", "distance", "angle", "tangent", "lock", "revolute", "slider", "cylindrical", "planar", "ball"
] as const

/** Points are the unknowns; lines, circles, arcs, ellipses and splines refer to them by id. */
export const WorkflowSketchEntity = Schema.Union([
  Schema.Struct({ id, kind: Schema.Literal("point"), x: Schema.Finite, y: Schema.Finite }),
  Schema.Struct({ id, kind: Schema.Literal("line"), p1: id, p2: id }),
  Schema.Struct({ id, kind: Schema.Literal("circle"), center: id, radius: positive }),
  Schema.Struct({ id, kind: Schema.Literal("arc"), center: id, start: id, end: id }),
  Schema.Struct({ id, kind: Schema.Literal("ellipse"), center: id, radiusX: positive, radiusY: positive, rotation: optional(Schema.Finite) }),
  Schema.Struct({ id, kind: Schema.Literal("spline"), points: Schema.Array(id).check(Schema.isMinLength(2), Schema.isMaxLength(200)), closed: optional(Schema.Boolean) })
])

/** A constraint: its `type` plus that type's own fields (the core checks them and names what is missing). */
export const WorkflowConstraint = Schema.StructWithRest(Schema.Struct({ type: Schema.Literals(SKETCH_CONSTRAINT_TYPES) }), [Schema.Record(Schema.String, Schema.Unknown)])

const definition = Schema.Struct({
  id,
  name: optional(id),
  /** box: corner at the origin, sides along x y z; cylinder: base centre at the origin, axis z; history: a parametric part (first exact body). */
  shape: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("box"), x: positive, y: positive, z: positive }),
    Schema.Struct({ kind: Schema.Literal("cylinder"), radius: positive, height: positive }),
    Schema.Struct({ kind: Schema.Literal("history"), history: ParametricHistory })
  ]),
  /** g/cm^3; needed for mass. */
  density: optional(positive),
  material: optional(id),
  designation: optional(id)
})

const occurrence = Schema.Struct({
  id,
  /** A definition id. */
  definition: id,
  at: optional(xyz),
  /** Rotation applied before the translation. */
  rotate: optional(Schema.Struct({ axis: xyz, degrees: Schema.Finite })),
  grounded: optional(Schema.Boolean),
  suppressed: optional(Schema.Boolean)
})

/** A mate: `kind` plus its operands `a`, `b` ({occurrence, feature | face}) and values (see the skill cad-workflow). */
export const WorkflowMate = Schema.StructWithRest(Schema.Struct({ kind: Schema.Literals(MATE_KINDS) }), [Schema.Record(Schema.String, Schema.Unknown)])

export const CadWorkflowInput = Schema.Struct({
  op: Schema.Literals(["sketch", "assembly", "sheet", "mesh_import", "mesh_export"]),
  // sketch
  entities: optional(Schema.Array(WorkflowSketchEntity).check(Schema.isMinLength(1), Schema.isMaxLength(1000))),
  constraints: optional(Schema.Array(WorkflowConstraint).check(Schema.isMaxLength(2000))),
  /** Drag `entity` (a point, a line or the centre of a circle) to `to`, every constraint holding. */
  drag: optional(Schema.Struct({ entity: id, to: xy })),
  // assembly
  definitions: optional(Schema.Array(definition).check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  occurrences: optional(Schema.Array(occurrence).check(Schema.isMinLength(1), Schema.isMaxLength(500))),
  mates: optional(Schema.Array(WorkflowMate).check(Schema.isMaxLength(1000))),
  /** Sweep the revolute or slider mate `joint` from `from` to `to` in `steps` solves. */
  drive: optional(Schema.Struct({ joint: id, from: Schema.Finite, to: Schema.Finite, steps: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 361 })) })),
  checks: optional(Schema.Array(Schema.Literals(["interference", "mass", "bom", "clearance"])).check(Schema.isMinLength(1), Schema.isMaxLength(4))),
  // sheet, mesh_export
  elementId: optional(id),
  history: optional(ParametricHistory),
  /** sheet: the sheet options of `cad.drawing` (size, views, scale, notes, dimensions, GD&T). */
  options: optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** sheet: pdf (default) or svg; mesh_export: stl, obj or 3mf (default 3mf). */
  format: optional(Schema.Literals(["pdf", "svg", "stl", "obj", "3mf"])),
  // mesh_import
  /** The name of an attached text file (OBJ, ASCII STL) ... */
  attachment: optional(id),
  /** ... or the file bytes as base64 (any format). */
  data: optional(Schema.String.check(Schema.isMinLength(4), Schema.isMaxLength(8_000_000))),
  /** mesh_import: the unit of an STL or OBJ (3MF declares its own); mesh_export 3mf: the unit written. Default millimeter. */
  unit: optional(Schema.Literals(["micron", "millimeter", "centimeter", "meter", "inch", "foot"])),
  repair: optional(Schema.Struct({ tolerance: optional(positive), maxHoleEdges: optional(Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 500 }))), maxHoleDiameter: optional(positive), orient: optional(Schema.Boolean) })),
  requireSolid: optional(Schema.Boolean)
}).annotate({ description: "Constrained sketches, assemblies with mates, drawing sheets as vector PDF and mesh exchange; computed from the values sent, nothing stored." })
export type CadWorkflowInput = typeof CadWorkflowInput.Type
