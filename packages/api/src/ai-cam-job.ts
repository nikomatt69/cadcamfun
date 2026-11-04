/**
 * `cam.job`: a multi-setup machining job run in process by the kernel (spec 69 C1-C5, spec 72 0.5), for the assistant.
 *
 *   plan  the operations the kernel would run in every setup, what it cannot machine, and the part coverage of the setups (cheap)
 *   run   every setup is run and replayed; the answer carries each setup's release, every claim with its detail and failure reason,
 *         the tolerance budget with its terms (the declared bounds), the issues, and the coverage of the whole job
 *
 * The part is inline (CAD elements or closed triangle meshes); lengths are millimetres in CAD world coordinates. A setup names its
 * orientation (the CAD direction facing the spindle), work offset, stock (a box, a bar or any closed solid), fixtures (boxes) and operations.
 */
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const optional = Schema.optionalKey
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const vec3 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
const vec2 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })

export const CamJobFixture = Schema.Struct({ id, min: vec3, max: vec3 })

export const CamJobStockModel = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cylinder"), center: vec2, radius: positive, z0: Schema.Finite, z1: Schema.Finite, segments: optional(Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: 512 }))) }),
  Schema.Struct({ kind: Schema.Literal("mesh"), mesh: Schema.Struct({ positions: Schema.Array(Schema.Finite).check(Schema.isMinLength(9), Schema.isMaxLength(600_000)), indices: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(Schema.isMinLength(12), Schema.isMaxLength(600_000)) }) })
])

export const CamJobSetup = Schema.Struct({
  id,
  name: optional(Schema.String.check(Schema.isMaxLength(120))),
  /** CAD direction facing the spindle; default +Z. */
  orientation: optional(cam.kernel.SetupOrientationSchema),
  origin: optional(Schema.Literals(["stock-center", "stock-corner"])),
  /** Its own datum; default G54, G55, ... in order. */
  workOffset: optional(cam.WorkOffsetSchema),
  stock: optional(Schema.Struct({ min: vec3, max: vec3 })),
  /** A bar or any closed solid as the raw stock (a casting, a scan); replaces `stock` by its bounds. */
  stockModel: optional(CamJobStockModel),
  /** Vise jaws, clamps, parallels as boxes in CAD world coordinates. */
  fixtures: optional(Schema.Array(CamJobFixture).check(Schema.isMaxLength(40))),
  /** Operations of this setup in its oriented coordinates; planned from the part when absent. */
  operations: optional(Schema.Array(cam.kernel.OperationSpecSchema).check(Schema.isMaxLength(300)))
})

/** The part without the one-of check (that check is a filter the generated HTTP clients cannot port; the route applies it itself). */
export const CamJobPartFields = Schema.Struct({
  elements: optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(Schema.isMinLength(1), Schema.isMaxLength(500))),
  meshes: optional(Schema.Array(Schema.Struct({
    positions: Schema.Array(Schema.Finite).check(Schema.isMinLength(9), Schema.isMaxLength(600_000)),
    indices: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(Schema.isMinLength(3), Schema.isMaxLength(600_000))
  })).check(Schema.isMinLength(1), Schema.isMaxLength(50)))
})
export const isOnePartSource = (part: typeof CamJobPartFields.Type): boolean => (part.elements === undefined) !== (part.meshes === undefined)
export const CamJobPart = CamJobPartFields.check(Schema.makeFilter(isOnePartSource, { message: "Send exactly one of elements or meshes" }))

export const CamJobInput = Schema.Struct({
  op: Schema.Literals(["plan", "run"]),
  material: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  /** A machine preset id (see cam materials); default the standard VMC. A five-axis preset (trunnion-5ax) lets multiaxis operations run. */
  machine: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))),
  part: CamJobPart,
  tools: optional(Schema.Array(cam.kernel.CutterSchema).check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  quality: optional(Schema.Struct({
    resolution: optional(positive.check(Schema.isLessThanOrEqualTo(5))),
    tolerance: optional(positive.check(Schema.isLessThanOrEqualTo(5))),
    finishAllowance: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
    scallop: optional(positive.check(Schema.isLessThanOrEqualTo(1))),
    /** Release only when the tolerance budget is met (claim `tolerance`). */
    enforceTolerance: optional(Schema.Boolean)
  })),
  setups: Schema.Array(CamJobSetup).check(Schema.isMinLength(1), Schema.isMaxLength(6)),
  /** `run`: how many NC lines of each setup to return (default 0: only its length and hash). */
  nc: optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 })))
})
export type CamJobInput = typeof CamJobInput.Type

/** `POST /api/cam/jobs`: the same job; the handler refuses a part with both or neither of elements and meshes (400). */
export const CamJobRequest = Schema.Struct({ ...CamJobInput.fields, part: CamJobPartFields })
export type CamJobRequest = typeof CamJobRequest.Type

const record = Schema.Record(Schema.String, Schema.Unknown)
/**
 * What a job answers: `ok` false with `error` (and the kernel's `issues`) when it could not be planned or run; otherwise each setup,
 * every claim with its detail, the failed and the undecided ones again, the coverage of the job and the notes. A failed claim is an
 * answer (a verdict), not an error. Shared by `POST /api/cam/jobs` and the assistant's `cam.job`.
 */
export const CamJobResult = Schema.Struct({
  ok: Schema.Boolean, op: Schema.Literals(["plan", "run"]), release: optional(Schema.String),
  setups: optional(Schema.Array(record)), claims: optional(Schema.Array(record)), failed: optional(Schema.Array(record)), unresolved: optional(Schema.Array(record)),
  coverage: optional(record), notes: optional(Schema.Array(Schema.String)), issues: optional(Schema.Array(record)),
  cycleTimeSeconds: optional(Schema.Finite), error: optional(Schema.String)
})
export type CamJobResult = typeof CamJobResult.Type
