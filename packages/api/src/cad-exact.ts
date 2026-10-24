import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"

const vec3 = cad.Vec3Schema
const num = Schema.Finite
const int = Schema.Int
const id = Schema.NonEmptyString

/**
 * Where the exact kernel reads the solids from: the elements in the body (an explicit snapshot, nothing stored is touched), or a
 * stored drawing the caller can open (the sidecar reads its elements; the scene never travels over HTTP).
 */
const source = {
  elements: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, Schema.Json)).check(Schema.isMinLength(1), Schema.isMaxLength(2000))),
  drawingId: Schema.optionalKey(id)
}

export const CadExactRequest = Schema.Struct({
  ...source,
  /** Only these solids (ids as in the drawing, component children included). */
  ids: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(200))),
  /** Also tell how the CAM planner will machine each solid (default true). */
  machining: Schema.optionalKey(Schema.Boolean)
})
export type CadExactRequest = typeof CadExactRequest.Type

export const CadExactStepRequest = Schema.Struct({
  ...source,
  ids: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(200))),
  /** Write mesh-only solids as faceted solids (default true). */
  faceted: Schema.optionalKey(Schema.Boolean),
  author: Schema.optionalKey(Schema.String)
})
export type CadExactStepRequest = typeof CadExactStepRequest.Type

export const CadAssemblyRequest = Schema.Struct({
  ...source,
  /** Washers under heads and nuts in the fastener plans (default true). */
  washers: Schema.optionalKey(Schema.Boolean)
})
export type CadAssemblyRequest = typeof CadAssemblyRequest.Type

const skipped = Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, reason: Schema.String }))

export const CadExactHole = Schema.Struct({
  entry: vec3, direction: vec3, diameter: num, depth: num,
  form: Schema.Literals(["simple", "counterbore", "countersink"]),
  bottom: Schema.Literals(["through", "flat", "drill-point"]),
  headDiameter: Schema.optionalKey(num), headDepth: Schema.optionalKey(num)
})

export const CadExactMachining = Schema.Union([
  Schema.Struct({ prismatic: Schema.Literal(true), holes: int, pockets: int, outlines: int, top: num, bottom: num, islands: Schema.optionalKey(int), sideHoles: Schema.optionalKey(int), hiddenFaces: Schema.optionalKey(int) }),
  Schema.Struct({ prismatic: Schema.Literal(false), reason: Schema.String })
])

export const CadExactBoss = Schema.Struct({
  diameter: num, length: num, free: Schema.Literals(["near", "far", "both", "none"]), origin: vec3, axis: vec3
})

export const CadExactPart = Schema.Struct({
  id: Schema.String, name: Schema.String, valid: Schema.Boolean, issues: Schema.Array(Schema.String),
  volume: num, area: num, centroid: vec3, bounds: Schema.Struct({ min: vec3, max: vec3 }),
  faces: int, edges: int, vertices: int, surfaces: Schema.Record(Schema.String, int),
  throughHoles: Schema.optionalKey(int),
  holes: Schema.Array(CadExactHole), machining: CadExactMachining,
  /** Bosses, pins and shaft sections (convex cylinders all the way round); `boss` indexes of the hole / boss edit. */
  bosses: Schema.Array(CadExactBoss),
  /** Names of the faces (the first 40): the handles `cad.shell` takes for open faces. */
  faceNames: Schema.optionalKey(Schema.Array(Schema.String)),
  /** For a solid that does not validate: what healing it would do and whether the healed solid is valid. */
  repair: Schema.optionalKey(Schema.Struct({ verticesWelded: int, edgesWelded: int, collapsedUses: int, validAfter: Schema.Boolean, issuesAfter: Schema.Array(Schema.String) }))
})

export const CadExactAnalysis = Schema.Struct({
  parts: Schema.Array(CadExactPart), skipped,
  totals: Schema.Struct({ parts: int, volume: num, area: num })
})
export type CadExactAnalysis = typeof CadExactAnalysis.Type

export const CadExactStep = Schema.Struct({
  /** STEP AP214 text; absent when the selection holds no solid. */
  step: Schema.optionalKey(Schema.String),
  parts: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, exact: Schema.Boolean, faces: int, valid: Schema.Boolean, note: Schema.optionalKey(Schema.String) })),
  skipped
})
export type CadExactStep = typeof CadExactStep.Type

const washer = Schema.Struct({ designation: Schema.String, inner: num, outer: num, thickness: num })

export const CadAssemblyReport = Schema.Struct({
  parts: int,
  interference: Schema.Struct({
    clashes: Schema.Array(Schema.Struct({ a: Schema.String, b: Schema.String, aName: Schema.String, bName: Schema.String, volume: num, centroid: vec3 })),
    expected: Schema.Array(Schema.Struct({ a: Schema.String, b: Schema.String, aName: Schema.String, bName: Schema.String, volume: num, note: Schema.String })),
    touching: Schema.Array(Schema.Struct({ a: Schema.String, b: Schema.String })),
    undetermined: Schema.Array(Schema.Struct({ a: Schema.String, b: Schema.String, reason: Schema.String })),
    checked: int
  }),
  clearance: Schema.optionalKey(Schema.Array(Schema.Struct({ a: Schema.String, b: Schema.String, aName: Schema.String, bName: Schema.String, distance: num, overlap: Schema.Boolean }))),
  bom: Schema.Array(Schema.Struct({
    item: int, name: Schema.String, designation: Schema.optionalKey(Schema.String), material: Schema.optionalKey(Schema.String),
    quantity: int, volume: num, mass: Schema.optionalKey(num), parts: Schema.Array(Schema.String)
  })),
  joints: Schema.Array(Schema.Struct({
    parent: Schema.String, child: Schema.String, parentName: Schema.String, childName: Schema.String,
    kind: Schema.Literals(["revolute", "fixed"]), origin: vec3, axis: vec3, axes: int
  })),
  fasteners: Schema.Struct({
    plans: Schema.Array(Schema.Struct({
      id: Schema.String, size: Schema.String, threadName: Schema.String, designation: Schema.String, length: num, seat: vec3, direction: vec3,
      bodies: Schema.Array(Schema.String), tapped: Schema.optionalKey(Schema.String), grip: num, engagement: Schema.optionalKey(num),
      headWasher: Schema.optionalKey(washer), nutWasher: Schema.optionalKey(washer), nutWasherAt: Schema.optionalKey(vec3),
      nut: Schema.optionalKey(Schema.Struct({ designation: Schema.String, across: num, height: num, at: vec3 })),
      warnings: Schema.Array(Schema.String)
    })),
    unfastened: Schema.Array(Schema.Struct({ bodies: Schema.Array(Schema.String), at: vec3, reason: Schema.String })),
    existing: int
  }),
  skipped
})
export type CadAssemblyReport = typeof CadAssemblyReport.Type

const orientation = cam.kernel.SetupOrientationSchema

export const CadSetupsRequest = Schema.Struct({
  ...source,
  ids: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(200))),
  /** "bottom" (default): the planar bottom of the part is the fixturing face; "none": every face needs a setup. */
  fixture: Schema.optionalKey(Schema.Literals(["bottom", "none"])),
  /** Orientations the shop can use (default all six). */
  allowed: Schema.optionalKey(Schema.Array(orientation).check(Schema.isMinLength(1), Schema.isMaxLength(6)))
})
export type CadSetupsRequest = typeof CadSetupsRequest.Type

const setupFace = { face: int, kind: Schema.String, area: num }
const setupHole = Schema.Struct({
  entry: vec3, direction: vec3, diameter: num, depth: num, form: Schema.Literals(["simple", "counterbore", "countersink"])
})

export const CadSetupPlan = Schema.Struct({
  /** In machining order; `orientation` is what the planner takes as `setupOrientation`. */
  setups: Schema.Array(Schema.Struct({
    orientation, faces: Schema.Array(int), area: num, share: num, holes: Schema.Array(setupHole),
    prismatic: Schema.Union([
      Schema.Struct({ ok: Schema.Literal(true), holes: int, pockets: int, outlines: int }),
      Schema.Struct({ ok: Schema.Literal(false), reason: Schema.String })
    ])
  })),
  uncovered: Schema.Array(Schema.Struct({ ...setupFace, reason: Schema.String })),
  held: Schema.Array(Schema.Struct(setupFace)),
  indexed: Schema.Array(setupHole),
  reach: Schema.Array(Schema.Struct({ orientation, faces: int, area: num, share: num })),
  faces: int, area: num, notes: Schema.Array(Schema.String)
})

export const CadSetupsReport = Schema.Struct({
  parts: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, plan: CadSetupPlan })),
  skipped
})
export type CadSetupsReport = typeof CadSetupsReport.Type

export const CadHoleRequest = Schema.Struct({
  ...source,
  id,
  /** Index in the solid's recognised holes, in the order `analyze` lists them; exactly one of `hole` and `boss`. */
  hole: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 }))),
  /** Index in the solid's recognised bosses (`analyze` lists them); a boss takes a `diameter` only. */
  boss: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 }))),
  /** New diameter, mm: of the drill of a hole (exactly one of `diameter` and `fill`) or of a boss. */
  diameter: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** Draft angle of the new bore or boss wall, degrees (0-30): a cone narrowing towards the bottom of a hole or the free end of a boss. Needs `diameter`. */
  taper: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 30 }))),
  fill: Schema.optionalKey(Schema.Boolean)
})
export type CadHoleRequest = typeof CadHoleRequest.Type

/** What the edit of a hole or a boss would do, on paper: nothing in the drawing changes. A refusal is an `ok: false` answer with its reason. */
export const CadHoleReport = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true), id: Schema.String, name: Schema.String, hole: int, holes: int,
    before: Schema.Struct({ diameter: num, depth: num, form: Schema.Literals(["simple", "counterbore", "countersink"]) }),
    edit: Schema.Union([Schema.Struct({ kind: Schema.Literal("resize"), diameter: num, taper: Schema.optionalKey(num) }), Schema.Struct({ kind: Schema.Literal("fill") })]),
    volume: num, originalVolume: num, volumeChange: num, faces: int, valid: Schema.Boolean
  }),
  Schema.Struct({
    ok: Schema.Literal(true), id: Schema.String, name: Schema.String, boss: int, bosses: int,
    before: Schema.Struct({ diameter: num, length: num }), diameter: num, taper: Schema.optionalKey(num),
    volume: num, originalVolume: num, volumeChange: num, faces: int, valid: Schema.Boolean
  }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.String })
])
export type CadHoleReport = typeof CadHoleReport.Type
