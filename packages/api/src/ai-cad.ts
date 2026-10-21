/**
 * The inputs of the `cad` and `cad_edit` actions that are not parametric (`ai-parametric.ts`) or inspection
 * (`ai-inspection.ts`), declared once in Effect. The AI package derives the model-visible nikcli schema from these and
 * decodes every call with them. Lengths are millimetres.
 */
import { Effect, Schema, SchemaTransformation } from "effect"
import { EmptyActionInput as empty } from "./ai-cam.ts"

const optional = Schema.optionalKey
const nonEmpty = Schema.String.check(Schema.isMinLength(1))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const withDefault = <S extends Schema.Top>(schema: S, value: S["Encoded"]) => Schema.withDecodingDefaultKey<S>(Effect.succeed(value))(schema)
const axis = Schema.Literals(["x", "y", "z"])

/** What the model asks the viewport capture to look at; trimmed, so whitespace alone is no focus. */
export const VisionInput = Schema.Struct({
  focus: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)).pipe(
    Schema.decodeTo(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)), SchemaTransformation.trim())
  ))
})

export const CadGrepInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  layerId: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  /** Restrict to parametric parts. Off by default so one search also finds the plain geometry of a big project. */
  parametricOnly: withDefault(Schema.Boolean, false),
  /** Inline each parametric hit's full parameter set, so finding a part and reading its parameters is one call. */
  includeParameters: withDefault(Schema.Boolean, true),
  offset: withDefault(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), 0),
  limit: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })), 20)
})
export type CadGrepInput = typeof CadGrepInput.Type

/** The exact kernel over the whole drawing: `ids` narrows it to some elements, `machining` skips the CAM feature evaluation. */
export const CadExactInput = Schema.Struct({
  ids: optional(Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))).check(Schema.isMinLength(1), Schema.isMaxLength(40))
    .annotate({ description: "Element ids to analyse (default: every solid of the drawing)." })),
  machining: optional(Schema.Boolean.annotate({ description: "Include how the CAM planner machines each solid (features or 3D surface job); default true." }))
})
export type CadExactInput = typeof CadExactInput.Type

export const CadAssemblyInput = Schema.Struct({
  washers: optional(Schema.Boolean.annotate({ description: "Count missing washers as missing fasteners; default true." }))
})
export type CadAssemblyInput = typeof CadAssemblyInput.Type

/** What hollowing a solid would give, on paper: nothing in the drawing changes. */
export const CadShellInput = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)).annotate({ description: "Id of the solid to hollow." }),
  thickness: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(1000)).annotate({ description: "Wall thickness, mm." }),
  open: optional(Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))).check(Schema.isMaxLength(20))
    .annotate({ description: "Names of the faces to leave open (from cad.exact), e.g. [\"plate.top\"]; none = a closed hollow." })),
  wallByFace: optional(Schema.Array(Schema.Struct({ face: nonEmpty, thickness: positive })).check(Schema.isMaxLength(40))
    .annotate({ description: "Override the default wall on named faces from cad.exact; duplicate or unknown names are refused." }))
})
export type CadShellInput = typeof CadShellInput.Type

export const CadOffsetInput = Schema.Struct({ id: nonEmpty, distance: positive.annotate({ description: "Outward offset distance in mm. Convex corners round. Unsupported geometry returns a reason." }) })
export type CadOffsetInput = typeof CadOffsetInput.Type

const xyz = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
const limits = Schema.Struct({ min: Schema.Finite, max: Schema.Finite })
export const CadMotionInput = Schema.Struct({
  model: Schema.Struct({
    ground: nonEmpty,
    joints: Schema.Array(Schema.Struct({
      id: nonEmpty, parent: nonEmpty, child: nonEmpty, kind: Schema.Literals(["fixed", "revolute", "prismatic", "cylindrical", "ball", "planar"]),
      origin: xyz, axis: xyz, limits: optional(limits), slideLimits: optional(limits), closesLoop: optional(Schema.Boolean)
    })).check(Schema.isMaxLength(40)),
    couplings: optional(Schema.Array(Schema.Union([
      Schema.Struct({ kind: Schema.Literal("gear"), driver: nonEmpty, driven: nonEmpty, ratio: Schema.Finite }),
      Schema.Struct({ kind: Schema.Literal("rack"), pinion: nonEmpty, rack: nonEmpty, pitchRadius: positive })
    ])).check(Schema.isMaxLength(40))),
    contacts: optional(Schema.Array(Schema.Struct({ a: nonEmpty, b: nonEmpty, clearance: optional(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))) })).check(Schema.isMaxLength(40)))
  }),
  sweep: Schema.Struct({ joint: nonEmpty, from: Schema.Finite, to: Schema.Finite, steps: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })), quantity: optional(Schema.Literals(["angle", "slide", "rx", "ry", "rz", "u", "v"])) })
}).annotate({ description: "Motion study over exact scene part ids. Revolute angles are degrees, slides mm. closesLoop marks a constraint outside the pose tree; passive joints solve closure. Contacts report gaps and penetration; they do not simulate contact forces." })
export type CadMotionInput = typeof CadMotionInput.Type

const degree = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))
const knots = Schema.Array(Schema.Finite).check(Schema.isMinLength(4), Schema.isMaxLength(80))
const controlRow = Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite])).check(Schema.isMinLength(2), Schema.isMaxLength(64))
export const CadSurfaceInput = Schema.Struct({
  operation: Schema.Literals(["patch", "stitch", "thicken"]),
  patches: Schema.Array(Schema.Struct({
    data: Schema.Struct({ degreeU: degree, degreeV: degree, knotsU: knots, knotsV: knots,
      points: Schema.Array(controlRow).check(Schema.isMinLength(2), Schema.isMaxLength(64)),
      weights: optional(Schema.Array(Schema.Array(positive).check(Schema.isMaxLength(64))).check(Schema.isMaxLength(64))) }),
    trim: optional(Schema.Struct({ u0: Schema.Finite, u1: Schema.Finite, v0: Schema.Finite, v1: Schema.Finite }))
  })).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  thickness: optional(positive), direction: optional(xyz), tolerance: optional(positive), name: optional(nonEmpty)
}).annotate({ description: "Open NURBS patch, exact rectangular trim along isoparametric curves, stitch full matching edges, or thicken one patch. Without direction thicken is an exact normal thickness for planar patches only. Curved patches require an explicit axial direction; this is a translated surface, not a general normal offset. Open surfaces remain surface bodies and cannot be machined as solids." })
export type CadSurfaceInput = typeof CadSurfaceInput.Type

export const CadExchangeInput = Schema.Struct({ format: Schema.Literals(["step", "iges", "parasolid"]), ids: optional(Schema.Array(nonEmpty).check(Schema.isMinLength(1), Schema.isMaxLength(40))) })
export type CadExchangeInput = typeof CadExchangeInput.Type

/** The exact smallest gap between two solids. */
export const CadDistanceInput = Schema.Struct({
  firstId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  secondId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
})
export type CadDistanceInput = typeof CadDistanceInput.Type

// ---------------------------------------------------------------- `cad_edit`

const point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: optional(Schema.Finite) })
const label = { layer: optional(nonEmpty), name: optional(nonEmpty), color: optional(nonEmpty) }

/** Flat 2D sketch entities, for the sketch a user explicitly asks for. */
export const CadSketchEntity = Schema.Union([
  Schema.Struct({ type: Schema.Literal("line"), start: point, end: point, ...label }),
  Schema.Struct({ type: Schema.Literal("circle"), center: point, radius: positive, ...label }),
  Schema.Struct({ type: Schema.Literal("arc"), center: point, radius: positive, startAngle: Schema.Finite, endAngle: Schema.Finite, ...label }),
  Schema.Struct({ type: Schema.Literal("polyline"), points: Schema.Array(point).check(Schema.isMinLength(2)), closed: optional(Schema.Boolean), ...label }),
  Schema.Struct({ type: Schema.Literal("rectangle"), origin: point, width: positive, height: positive, ...label })
])

/** What the editor can be told to do besides editing elements: layers, the view, the selection, what is shown. */
export const EDITOR_ACTIONS = [
  "layer_create", "layer_rename", "layer_color", "layer_show", "layer_hide", "layer_lock", "layer_unlock", "layer_delete", "layer_activate",
  "view_3d", "view_2d", "view_fit", "section_on", "section_off", "select", "select_none", "show", "hide", "isolate", "undo", "redo"
] as const

export const CadEditorAction = Schema.Struct({
  action: Schema.Literals(EDITOR_ACTIONS),
  layer: optional(Schema.String), newName: optional(Schema.String), color: optional(Schema.String), moveTo: optional(Schema.String),
  ids: optional(Schema.Array(Schema.String)),
  /** section_on: the axis the cut is made along, where on it (mm), and which side is kept. */
  axis: optional(axis), position: optional(Schema.Finite), inverted: optional(Schema.Boolean)
})

/** The largest drawing text `cad_edit.import` takes inline. */
export const MAX_IMPORT_CHARS = 2_000_000

/** DXF/SVG/STEP text to 3D: closed outlines become solids of `depth`, circles and inner loops holes. */
export const CadImportInput = Schema.Struct({
  /** Defaults to the attachment's extension. */
  format: optional(Schema.Literals(["dxf", "svg", "step", "iges", "parasolid", "mesh"])),
  /** The file text, or ... */
  content: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_IMPORT_CHARS))),
  /** ... the name of a file the user attached to the chat (preferred: no need to repeat the file). */
  attachment: optional(nonEmpty),
  /** Thickness, mm. Required for DXF and SVG; a STEP part brings its own height. */
  depth: optional(positive),
  /** STEP only: the axis the part stands on (default z). */
  up: optional(axis),
  scale: optional(positive),
  gap: optional(positive),
  tolerance: optional(positive),
  name: optional(nonEmpty),
  color: optional(nonEmpty),
  layer: optional(nonEmpty)
})
export type CadImportInput = typeof CadImportInput.Type

export const CAD_ACTION_INPUTS = {
  "cad.describe": empty,
  "cad.check": empty,
  "cad.relations": Schema.Struct({ firstId: nonEmpty, secondId: nonEmpty }),
  "cad.grep": CadGrepInput,
  "cad.vision": VisionInput,
  "cad.exact": CadExactInput,
  "cad.assembly": CadAssemblyInput,
  "cad.shell": CadShellInput,
  "cad.offset": CadOffsetInput,
  "cad.motion": CadMotionInput,
  "cad.surface": CadSurfaceInput,
  "cad.exchange": CadExchangeInput,
  "cad_edit.surface": CadSurfaceInput,
  "cad_edit.shell": CadShellInput,
  "cad_edit.offset": CadOffsetInput,
  "cad.distance": CadDistanceInput,
  "cad_edit.add_entities": Schema.Struct({ entities: Schema.Array(CadSketchEntity).check(Schema.isMinLength(1), Schema.isMaxLength(500)) }),
  "cad_edit.modify": Schema.Struct({
    changes: Schema.Array(Schema.Struct({ id: nonEmpty, changes: Schema.Record(Schema.String, Schema.Unknown) })).check(Schema.isMinLength(1))
  }),
  "cad_edit.transform": Schema.Struct({
    ids: Schema.Array(nonEmpty).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    dx: optional(Schema.Finite), dy: optional(Schema.Finite), dz: optional(Schema.Finite),
    rotateAxis: optional(axis), rotateDegrees: optional(Schema.Finite),
    scale: optional(positive), about: optional(Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })),
    copies: optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })))
  }),
  "cad_edit.group": Schema.Struct({
    ids: Schema.Array(nonEmpty).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    name: optional(nonEmpty), ungroup: optional(Schema.Boolean), layer: optional(nonEmpty)
  }),
  // `confirm: true` is the model's own acknowledgement that the user asked for this; the native `ask` permission the host
  // registers for `cad_edit` is the human decision. Both are required, and neither one alone is enough.
  "cad_edit.delete": Schema.Struct({ ids: Schema.Array(nonEmpty).check(Schema.isMinLength(1)), confirm: Schema.Literal(true) }),
  "cad_edit.editor": Schema.Struct({ actions: Schema.Array(CadEditorAction).check(Schema.isMinLength(1), Schema.isMaxLength(40)) }),
  "cad_edit.import": CadImportInput
} as const
