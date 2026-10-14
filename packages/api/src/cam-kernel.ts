import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"
import { CamManufactureInput, CamStockSetInput } from "./ai-cam.ts"

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const strings = Schema.Array(Schema.String)
const id = Schema.NonEmptyString

/** An explicit CAD snapshot: no stored document or AI session is mutated by this endpoint. */
export const CamKernelRequest = Schema.Struct({
  material: CamManufactureInput.fields.material, machine: CamManufactureInput.fields.machine,
  origin: CamManufactureInput.fields.origin, finishAllowance: CamManufactureInput.fields.finishAllowance, scallop: CamManufactureInput.fields.scallop,
  schemaVersion: Schema.Literal(1), id, name: id,
  elements: Schema.Array(Schema.Record(Schema.String, Schema.Json)).check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  stock: Schema.optionalKey(CamStockSetInput.fields.stock),
  tolerance: Schema.optionalKey(positive), resolution: Schema.optionalKey(positive),
  workOffset: Schema.optionalKey(cam.WorkOffsetSchema),
  /** Explicit operations in machining order (the kernel plans them from the part when absent). */
  operations: CamManufactureInput.fields.operations,
  /** Cutter library with holders (the kernel's default crib when absent). */
  tools: CamManufactureInput.fields.tools,
  deburr: CamManufactureInput.fields.deburr
})
export type CamKernelRequest = typeof CamKernelRequest.Type

export const CamKernelIssue = Schema.Struct({
  tag: Schema.Literals(["InvalidInput", "UnknownMaterial", "UnknownTool", "NoSuitableTool", "UnsupportedCapability", "GenerationFailed", "EmptyToolpath", "MachineLimit", "RapidInStock", "HolderCollision", "Gouge", "RemainingStock", "ReplayMismatch"]),
  severity: Schema.Literals(["error", "warning"]),
  stage: Schema.Literals(["prepare", "plan", "cutting-data", "generate", "post", "replay", "evidence"]),
  message: Schema.String, operationId: Schema.optionalKey(Schema.String), line: Schema.optionalKey(Schema.Int), point: Schema.optionalKey(cad.Vec3Schema)
})
const cutting = Schema.Struct({
  cut: Schema.Literals(["face", "slot", "rough-side", "adaptive", "finish-wall", "finish-floor", "finish-3d", "drill", "spot", "chamfer", "engrave", "thread-mill"]),
  rpm: Schema.Finite, vc: Schema.Finite, vcRecommended: Schema.Finite, effectiveDiameter: Schema.Finite,
  fz: Schema.Finite, chipThickness: Schema.Finite, feed: Schema.Finite, plungeFeed: Schema.Finite,
  ap: Schema.Finite, ae: Schema.Finite, stepoverPercent: Schema.Finite, rampAngle: Schema.Finite, helixPitch: Schema.Finite,
  coolant: cam.CoolantSchema,
  peck: Schema.optionalKey(Schema.Finite), chipBreak: Schema.optionalKey(Schema.Boolean), feedPerRev: Schema.optionalKey(Schema.Finite), passes: Schema.optionalKey(Schema.Finite),
  mrr: Schema.Finite, powerKw: Schema.Finite, torqueNm: Schema.Finite, forceN: Schema.Finite, deflectionMm: Schema.Finite,
  limitedBy: strings, warnings: strings, exceeded: strings, source: Schema.String,
  reference: cam.generator.CuttingReferenceSchema
})
const cutter = Schema.Struct({
  id, name: Schema.String, kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver"]),
  diameter: positive, flutes: Schema.Int, material: Schema.Literals(["hss", "hss-co", "carbide", "pcd"]),
  coating: Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]),
  cornerRadius: Schema.optionalKey(Schema.Finite), angle: Schema.optionalKey(Schema.Finite), tipDiameter: Schema.optionalKey(Schema.Finite), pitch: Schema.optionalKey(Schema.Finite),
  fluteLength: positive, shankDiameter: positive, stickout: positive,
  holder: Schema.optionalKey(Schema.Struct({ diameter: positive, length: positive })), maxRpm: Schema.optionalKey(positive), number: Schema.Int
})

/** Full artifact, including the evidence bound to its NC bytes. Display meshes never replace the CAD snapshot. */
export const CamKernelArtifact: Schema.Codec<cam.kernel.CamArtifact> = Schema.Struct({
  schemaVersion: Schema.Literal(1), jobId: id,
  material: Schema.Struct({ id, name: Schema.String, iso: Schema.String }),
  machine: Schema.Struct({ id, name: Schema.String, post: Schema.Literals(["generic", "fanuc", "grbl", "linuxcnc", "haas"]) }),
  origin: cad.Vec3Schema,
  stockBounds: Schema.Struct({ min: cad.Vec3Schema, max: cad.Vec3Schema }),
  operations: Schema.Array(Schema.Struct({
    id, name: Schema.String, strategy: Schema.Literals(["face", "adaptive", "pocket", "profile", "bore", "drill", "thread", "engrave", "chamfer", "surface"]),
    toolId: id, cut: cutting.fields.cut, status: Schema.Literals(["ok", "failed"]), cutting: Schema.optionalKey(cutting),
    parameters: Schema.Record(Schema.String, Schema.Unknown), overridden: strings, warnings: strings, startZ: Schema.optionalKey(Schema.Finite),
    cutLength: Schema.Finite, timeSeconds: Schema.Finite, removedVolume: Schema.Finite
  })),
  program: cam.ProgramSchema, tools: Schema.Array(cutter), nc: Schema.String,
  claims: Schema.Array(Schema.Struct({
    id: Schema.Literals(["cutting-data", "machine-limits", "operations-complete", "no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed", "nc-replay", "machine-travel"]),
    status: Schema.Literals(["passed", "failed", "unsupported", "unresolved"]), detail: Schema.String
  })),
  issues: Schema.Array(CamKernelIssue), release: Schema.Literals(["blocked", "preview", "verified-program"]),
  stock: Schema.Struct({ initialVolume: Schema.Finite, finalVolume: Schema.Finite, partVolume: Schema.Finite, remainingVolume: Schema.Finite, maxRemaining: Schema.Finite, cellSize: Schema.Finite }),
  cycleTimeSeconds: Schema.Finite, identity: Schema.Struct({ job: id, part: id, nc: id, algorithm: id }), notes: strings
})
export type CamKernelArtifact = typeof CamKernelArtifact.Type

export const CamKernelResult: Schema.Codec<cam.kernel.CamResult<cam.kernel.CamArtifact>> = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok"), value: CamKernelArtifact }),
  Schema.Struct({ status: Schema.Literal("failed"), issues: Schema.Array(CamKernelIssue) })
])
export type CamKernelResult = typeof CamKernelResult.Type
