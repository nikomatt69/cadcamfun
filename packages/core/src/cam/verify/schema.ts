/**
 * Schemas of the toolpath verifier (spec 04-core-cam.md §10).
 *
 * One definition serves the pure verifier, the sidecar `toolpathGenerator` HTTP group, the AI tool
 * `cam_verify_toolpath` and the Solid panel. Every length is a millimetre, every coordinate is in the
 * coordinate system of the G-code / program that is verified.
 */
import { Schema } from "effect"
import { Vec3Schema } from "../../cad/entities.ts"
import { SolidSchema } from "../../cad/solid.ts"
import { ProgramSchema } from "../ir.ts"
import { NonNegative, Positive, withDefault } from "../params.ts"

export const VerifyToolKindSchema = Schema.Literals(["endmill", "ballnose", "drill", "vbit", "facemill"])
export type VerifyToolKind = typeof VerifyToolKindSchema.Type

/**
 * Cutter, shank and holder of the tool being verified. Optional fields mean "not modelled": a missing
 * `cuttingLength` disables the shank check, a missing `holderDiameter` the holder check, so an unknown
 * holder never produces a false collision.
 */
export const VerifyToolSchema = Schema.Struct({
  kind: withDefault(VerifyToolKindSchema, "endmill"),
  diameter: Positive,
  /** Flute length from the tip, mm. Stock above it, inside the shank radius, is a shank collision. */
  cuttingLength: Schema.optionalKey(Positive),
  /** Shank diameter, mm (default: the cutting diameter). */
  shankDiameter: Schema.optionalKey(Positive),
  /** Length from the tip to the holder face, mm. */
  stickout: Schema.optionalKey(Positive),
  holderDiameter: Schema.optionalKey(Positive),
  holderLength: Schema.optionalKey(Positive),
  /** Included angle of a `vbit`, degrees (default 60). */
  angle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 179 }))),
  /** Corner radius of an `endmill` (bull-nose), mm; a `ballnose` always uses its full radius. */
  tipRadius: Schema.optionalKey(Positive)
})
export type VerifyTool = typeof VerifyToolSchema.Type

export const BoundsSchema = Schema.Struct({
  minX: Schema.Finite, maxX: Schema.Finite,
  minY: Schema.Finite, maxY: Schema.Finite,
  minZ: Schema.Finite, maxZ: Schema.Finite
})
export type VerifyBounds = typeof BoundsSchema.Type

export const VerifyFixtureSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  bounds: BoundsSchema
})

export const VerifyRequestSchema = Schema.Struct({
  /** G-code text; replayed through the reference interpreter. Exactly one of `gcode` / `program`. */
  gcode: Schema.optionalKey(Schema.String),
  program: Schema.optionalKey(ProgramSchema),
  /** Raw block, an axis-aligned box. */
  stock: BoundsSchema,
  tool: VerifyToolSchema,
  fixtures: withDefault(Schema.Array(VerifyFixtureSchema), []),
  /** Finished part. Without it, only collisions and the removal statistics are reported. */
  target: Schema.optionalKey(Schema.Struct({ solids: Schema.Array(SolidSchema) })),
  /** Grid cell size, mm. Default: a tenth of the tool diameter, coarsened to fit the compute budget. */
  resolution: Schema.optionalKey(Positive),
  /** Allowed deviation from the target before a cell counts as gouged / uncut, mm. */
  tolerance: withDefault(NonNegative, 0.05),
  /** Tool position before the first move (default: the origin, as the interpreter assumes). */
  start: Schema.optionalKey(Vec3Schema)
})
export type VerifyRequest = typeof VerifyRequestSchema.Type

export const VerifyCodeSchema = Schema.Literals([
  "InvalidInput",
  "InterpreterWarning",
  "RapidInMaterial",
  "ShankCollision",
  "HolderCollision",
  "FixtureCollision",
  "BelowStock",
  "Gouge",
  "UncutStock",
  "ResolutionCoarsened"
])
export type VerifyCode = typeof VerifyCodeSchema.Type

export const VerifySeveritySchema = Schema.Literals(["error", "warning", "info"])

export const VerifyIssueSchema = Schema.Struct({
  code: VerifyCodeSchema,
  severity: VerifySeveritySchema,
  message: Schema.String,
  /** 1-based G-code line, or the move index for a `program`. */
  line: Schema.optionalKey(Schema.Int),
  /** Tool tip at the first occurrence. */
  point: Schema.optionalKey(Vec3Schema),
  /** Path segments affected (grid cells for `Gouge` / `UncutStock`). */
  count: Schema.Int,
  fixtureId: Schema.optionalKey(Schema.String)
})
export type VerifyIssue = typeof VerifyIssueSchema.Type

export const VerifyStatsSchema = Schema.Struct({
  /** Nominal (square) cell size requested / chosen; actual cells divide the stock evenly. */
  cellSize: Schema.Finite,
  cellsX: Schema.Int,
  cellsY: Schema.Int,
  /** Path samples stamped into the model. */
  samples: Schema.Int,
  stockVolume: Schema.Finite,
  removedVolume: Schema.Finite,
  remainingVolume: Schema.Finite,
  /** Feed length that removed material / that cut only air, mm. */
  engagedLength: Schema.Finite,
  airCutLength: Schema.Finite,
  /** Present only with a target. */
  gougeVolume: Schema.optionalKey(Schema.Finite),
  maxGouge: Schema.optionalKey(Schema.Finite),
  uncutVolume: Schema.optionalKey(Schema.Finite),
  maxUncut: Schema.optionalKey(Schema.Finite)
})

/** Remaining stock height field, downsampled for display (row-major, `nx` x `ny`, X fastest). */
export const VerifyPreviewSchema = Schema.Struct({
  nx: Schema.Int,
  ny: Schema.Int,
  minX: Schema.Finite,
  minY: Schema.Finite,
  cellX: Schema.Finite,
  cellY: Schema.Finite,
  minZ: Schema.Finite,
  maxZ: Schema.Finite,
  heights: Schema.Array(Schema.Finite),
  /** Cells that gouge the target, same layout as `heights` (0 / 1); empty without a target. */
  gouge: Schema.Array(Schema.Int)
})

export const VerifyResponseSchema = Schema.Struct({
  /** No `error` issue. A passing verification is evidence, not a machine certification. */
  ok: Schema.Boolean,
  issues: Schema.Array(VerifyIssueSchema),
  stats: VerifyStatsSchema,
  preview: VerifyPreviewSchema
})
export type VerifyResponse = typeof VerifyResponseSchema.Type
