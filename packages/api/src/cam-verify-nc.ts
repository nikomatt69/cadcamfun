import { Schema } from "effect"
import { cad } from "@cadcamfun/core"
import { CamKernelCutter } from "./cam-kernel.ts"

const vec3 = cad.Vec3Schema
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const bounded = (max: number) => Schema.Array(Schema.Finite).check(Schema.isMaxLength(max))

/**
 * A closed triangle mesh of the part in the work frame the program is written in: flat `x y z` positions and triangle indices.
 * Overlapping closed meshes are read as their union.
 */
export const NcPartMesh = Schema.Struct({
  positions: bounded(3_000_000).check(Schema.isMinLength(9)),
  indices: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(Schema.isMinLength(3), Schema.isMaxLength(3_000_000))
})

/** The cutter in the spindle for a tool number the program selects: the kernel's own cutter record, with the heads of boring bars and T-slot cutters. */
export const NcTool = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cutter: Schema.Struct({
    ...CamKernelCutter.fields,
    neckDiameter: Schema.optionalKey(positive),
    headHeight: Schema.optionalKey(positive),
    holder: Schema.optionalKey(Schema.Struct({
      diameter: positive, length: positive,
      steps: Schema.optionalKey(Schema.Array(Schema.Struct({ diameter: positive, length: positive })).check(Schema.isMaxLength(16)))
    })),
    number: Schema.optionalKey(Schema.Int)
  })
})

/**
 * NC the kernel did not write (spec 72 step 0.6, spec 53 V2): the bytes, the part, the stock and the tools in the spindle. The kernel
 * replays the program on the tri-dexel stock and reports gouges (with the first NC line), leftover, rapids through material and
 * travel violations, every figure with its declared error.
 */
export const CamVerifyNcRequest = Schema.Struct({
  nc: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(40_000_000)),
  part: Schema.Array(NcPartMesh).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  stock: Schema.Struct({ min: vec3, max: vec3 }),
  tools: Schema.Array(NcTool).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  /** The job tolerance, mm (default 0.01). */
  tolerance: Schema.optionalKey(positive),
  /** Finish stock the program may leave on purpose, mm (default 0.05). */
  allowance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  /** The lattice cell asked for, mm (default 0.1); it grows when the stock would pass the ray budget. */
  cell: Schema.optionalKey(positive),
  machine: Schema.optionalKey(Schema.Struct({
    travel: Schema.optionalKey(Schema.Struct({ minX: Schema.Finite, maxX: Schema.Finite, minY: Schema.Finite, maxY: Schema.Finite, minZ: Schema.Finite, maxZ: Schema.Finite })),
    fiveAxis: Schema.optionalKey(Schema.Struct({ layout: Schema.Literals(["table-AC", "table-BC"]), pivot: vec3 }))
  })),
  dwell: Schema.optionalKey(Schema.Literals(["seconds", "milliseconds"])),
  okuma: Schema.optionalKey(Schema.Boolean),
  /** Where the tool stands before the first block, in the work frame (default: 50 mm above the stock's top corner). */
  start: Schema.optionalKey(vec3)
})
export type CamVerifyNcRequest = typeof CamVerifyNcRequest.Type

const deviation = Schema.Struct({ volume: Schema.Finite, depth: Schema.Finite, rays: Schema.Finite, at: Schema.optionalKey(vec3) })

export const CamNcFinding = Schema.Struct({
  kind: Schema.Literals(["gouge", "rapid-in-stock", "travel", "unknown-tool", "unplaced", "interpreter"]),
  message: Schema.String,
  /** NC line (1-based) of the first move that causes it. */
  line: Schema.optionalKey(Schema.Int),
  point: Schema.optionalKey(vec3),
  /** Gouge depth along the part normal, mm. */
  depth: Schema.optionalKey(Schema.Finite)
})

export const CamVerifyNcResult = Schema.Struct({
  /** Every move was placed and replayed, the part is closed and the budget held: the figures are a verdict. */
  complete: Schema.Boolean,
  reasons: Schema.Array(Schema.String),
  findings: Schema.Array(CamNcFinding),
  gouge: deviation,
  left: deviation,
  detached: Schema.Finite,
  cell: Schema.Finite,
  /** The declared error of every figure, mm. */
  errorBound: Schema.Finite,
  threshold: Schema.Finite,
  moves: Schema.Int,
  feedMoves: Schema.Int,
  /** `clean` when the replay was complete and found nothing; `faults` when a finding exists; `incomplete` otherwise (no verdict). */
  verdict: Schema.Literals(["clean", "faults", "incomplete"])
})
export type CamVerifyNcResult = typeof CamVerifyNcResult.Type

/**
 * The collision report of a mill program: the G-code, optionally the generator settings (workholding, machine preset, tool diameters)
 * and the cutter in the spindle. The stock is `params.stock` or a box round the cutting moves. Mill programs only.
 */
export const CamCollisionsRequest = Schema.Struct({
  gcode: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(20_000_000)),
  /** Generator settings laid over the machine's defaults; `stock` is `{ width, height, depth, x?, y?, topZ? }`, `machinePreset` a machine preset id. */
  params: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  /** The cutter as a tool resource (type, diameter, lengths, holder); the settings' tool when absent. */
  tool: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json))
})
export type CamCollisionsRequest = typeof CamCollisionsRequest.Type

const finding = Schema.Struct({ code: Schema.String, severity: Schema.Literals(["error", "warning"]), line: Schema.optionalKey(Schema.Int), count: Schema.Int, message: Schema.String })
export const CamCollisionsReport = Schema.Struct({
  duration: Schema.Finite, moves: Schema.Int,
  /** Stock, shank, holder, machine-body collisions and near misses, with the first contact's time and NC line. */
  collisions: Schema.Array(Schema.Struct({ ...finding.fields, seconds: Schema.Finite })),
  /** Travel and rotary-limit findings of the machine model. */
  limits: Schema.Array(finding),
  /** Set-up findings (vise jaws, bed, stock); `assumed` marks a finding that rests on a default the request did not state. */
  findings: Schema.Array(Schema.Struct({ ...finding.fields, assumed: Schema.Boolean })),
  setupProblems: Schema.Array(Schema.String),
  unsupported: Schema.Array(Schema.String),
  clear: Schema.Boolean
})
export type CamCollisionsReport = typeof CamCollisionsReport.Type
