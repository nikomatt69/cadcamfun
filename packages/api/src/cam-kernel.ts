import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"
import { CamManufactureInput, CamStockSetInput } from "./ai-cam.ts"

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const strings = Schema.Array(Schema.String)
const id = Schema.NonEmptyString

/** Where to announce a run's progress: a `cam.progress` frame per step on the project's live stream; never stored with the program. */
export const CamProgressTarget = Schema.Struct({ projectId: id, runId: id })

/** An explicit CAD snapshot: no stored document or AI session is mutated by this endpoint. */
export const CamKernelRequest = Schema.Struct({
  setupOrientation: CamManufactureInput.fields.setupOrientation,
  material: CamManufactureInput.fields.material, machine: CamManufactureInput.fields.machine,
  /** A machine configuration the user saved: it wins over the preset id, because it is the machine they configured. */
  machineConfig: CamManufactureInput.fields.machineConfig,
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
  deburr: CamManufactureInput.fields.deburr,
  tabs: CamManufactureInput.fields.tabs,
  breadth: CamManufactureInput.fields.breadth,
  subprograms: CamManufactureInput.fields.subprograms,
  nativeCycles: CamManufactureInput.fields.nativeCycles,
  tcp: CamManufactureInput.fields.tcp,
  smoothing: CamManufactureInput.fields.smoothing,
  /** A post definition (spec 54 C1; library category "post") that writes the NC in place of the machine's post; checked by the kernel. */
  postDefinition: CamManufactureInput.fields.postDefinition,
  print: CamManufactureInput.fields.print,
  /** Where to announce progress (a `cam.progress` frame per operation and stage on the project's live stream); never stored with the program. */
  progress: Schema.optionalKey(CamProgressTarget)
})
export type CamKernelRequest = typeof CamKernelRequest.Type

export const CamKernelIssue = Schema.Struct({
  tag: Schema.Literals(["InvalidInput", "UnknownMaterial", "UnknownTool", "NoSuitableTool", "UnsupportedCapability", "GenerationFailed", "EmptyToolpath", "MachineLimit", "RapidInStock", "HolderCollision", "Gouge", "RemainingStock", "ReplayMismatch", "Cancelled"]),
  severity: Schema.Literals(["error", "warning"]),
  stage: Schema.Literals(["prepare", "plan", "cutting-data", "generate", "post", "replay", "evidence"]),
  message: Schema.String, operationId: Schema.optionalKey(Schema.String), line: Schema.optionalKey(Schema.Int), point: Schema.optionalKey(cad.Vec3Schema)
})
const cutting = Schema.Struct({
  cut: Schema.Literals(["face", "slot", "rough-side", "adaptive", "finish-wall", "finish-floor", "finish-3d", "drill", "spot", "chamfer", "engrave", "thread-mill", "tap", "ream"]),
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
  id, name: Schema.String, kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer"]),
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
  machine: Schema.Struct({ id, name: Schema.String, post: Schema.Literals(["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"]) }),
  setupOrientation: Schema.optionalKey(cam.kernel.SetupOrientationSchema),
  origin: cad.Vec3Schema,
  stockBounds: Schema.Struct({ min: cad.Vec3Schema, max: cad.Vec3Schema }),
  operations: Schema.Array(Schema.Struct({
    id, name: Schema.String, strategy: Schema.Literals(["face", "adaptive", "pocket", "profile", "bore", "drill", "thread", "engrave", "chamfer", "surface", "multiaxis", "print"]),
    toolId: id, cut: Schema.Union([cutting.fields.cut, Schema.Literal("print")]), status: Schema.Literals(["ok", "failed"]), cutting: Schema.optionalKey(cutting),
    parameters: Schema.Record(Schema.String, Schema.Unknown), overridden: strings, warnings: strings, startZ: Schema.optionalKey(Schema.Finite),
    cutLength: Schema.Finite, timeSeconds: Schema.Finite, removedVolume: Schema.Finite
  })),
  program: cam.ProgramSchema, tools: Schema.Array(cutter), nc: Schema.String,
  claims: Schema.Array(Schema.Struct({
    id: Schema.Literals(["bed-fit", "heated-start", "layers-rise", "wall-coverage", "skin-coverage", "no-spill", "filament", "cutting-data", "machine-limits", "operations-complete", "no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed", "nc-replay", "machine-travel", "machine-clearance", "setup-workholding", "part-coverage"]),
    status: Schema.Literals(["passed", "failed", "unsupported", "unresolved"]), detail: Schema.String
  })),
  issues: Schema.Array(CamKernelIssue), release: Schema.Literals(["blocked", "preview", "verified-program"]),
  stock: Schema.Struct({ initialVolume: Schema.Finite, finalVolume: Schema.Finite, partVolume: Schema.Finite, remainingVolume: Schema.Finite, maxRemaining: Schema.Finite, cellSize: Schema.Finite, fiveAxis: Schema.optionalKey(Schema.Struct({ voxelMm: Schema.Finite, removedLower: Schema.Finite, removedUpper: Schema.Finite, remainingLower: Schema.Finite, remainingUpper: Schema.Finite })) }),
  cycleTimeSeconds: Schema.Finite, identity: Schema.Struct({ job: id, part: id, nc: id, algorithm: id }), notes: strings,
  /** Present when the machine is a printer: what was printed and how it was measured. */
  print: Schema.optionalKey(Schema.Struct({
    dialect: Schema.Literals(["marlin", "klipper", "reprap"]),
    filament: Schema.Struct({ material: Schema.String, densityGcm3: Schema.Finite, diameter: Schema.Finite }),
    nozzle: Schema.Struct({ diameter: Schema.Finite, temperature: Schema.Finite, bedTemperature: Schema.Finite }),
    layers: Schema.Int, layerHeight: Schema.Finite, filamentMm: Schema.Finite, filamentGrams: Schema.Finite,
    timeSeconds: Schema.Finite, travelMm: Schema.Finite, retractions: Schema.Int,
    lengthByKind: Schema.Record(Schema.String, Schema.Finite),
    size: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
    orientation: Schema.String,
    settings: cam.kernel.PrintRequirementSchema
  })),
  /** The deviation the program can be promised, term by term; informational, it does not move the release level. */
  tolerance: Schema.optionalKey(Schema.Struct({
    requested: Schema.Finite,
    terms: Schema.Array(Schema.Struct({ id: Schema.Literals(["source-tessellation", "part-model", "path", "nc-rounding", "stock-replay"]), mm: Schema.Finite, basis: Schema.String })),
    achieved: Schema.Finite, unbounded: strings, met: Schema.Boolean
  }))
})
export type CamKernelArtifact = typeof CamKernelArtifact.Type

export const CamKernelResult: Schema.Codec<cam.kernel.CamResult<cam.kernel.CamArtifact>> = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok"), value: CamKernelArtifact }),
  Schema.Struct({ status: Schema.Literal("failed"), issues: Schema.Array(CamKernelIssue) })
])
export type CamKernelResult = typeof CamKernelResult.Type

const xyz = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })

/** The setup sheet of a stored program (`cam.kernel.setupSheetData`): everything on it comes from the program's own artifact. */
export const CamSetupSheetData = Schema.Struct({
  title: Schema.String, jobId: Schema.String, release: Schema.Literals(["blocked", "preview", "verified-program"]),
  material: Schema.Struct({ name: Schema.String, iso: Schema.String }),
  machine: Schema.Struct({ name: Schema.String, post: Schema.String }),
  setup: Schema.Struct({ orientation: Schema.String, workOffset: Schema.String, origin: xyz, stock: xyz }),
  tools: Schema.Array(Schema.Struct({
    number: Schema.Int, id: Schema.String, name: Schema.String, kind: Schema.String, diameter: Schema.Finite, flutes: Schema.Int, fluteLength: Schema.Finite,
    shankDiameter: Schema.Finite, stickout: Schema.Finite, holder: Schema.optionalKey(Schema.String), operations: strings, seconds: Schema.Finite
  })),
  operations: Schema.Array(Schema.Struct({
    index: Schema.Int, id: Schema.String, name: Schema.String, strategy: Schema.String, status: Schema.Literals(["ok", "failed"]), tool: Schema.optionalKey(Schema.Int),
    seconds: Schema.Finite, cutLength: Schema.Finite, removedVolume: Schema.Finite,
    rpm: Schema.optionalKey(Schema.Finite), feed: Schema.optionalKey(Schema.Finite), ap: Schema.optionalKey(Schema.Finite), ae: Schema.optionalKey(Schema.Finite), warnings: strings
  })),
  totals: Schema.Struct({ tools: Schema.Int, operations: Schema.Int, cycleSeconds: Schema.Finite, cuttingSeconds: Schema.Finite, removedVolume: Schema.Finite }),
  claims: Schema.Array(Schema.Struct({ id: Schema.String, status: Schema.String, detail: Schema.String })),
  notes: strings,
  issues: Schema.Array(Schema.Struct({ severity: Schema.String, message: Schema.String })),
  identity: Schema.Struct({ job: Schema.String, part: Schema.String, nc: Schema.String, algorithm: Schema.String }),
  /** The title block of the drawing the program belongs to (every field complete), printed at the bottom right of the sheet. */
  titleBlock: Schema.optionalKey(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite])))
})
export const CamSetupSheet = Schema.Struct({ data: CamSetupSheetData, html: Schema.String })
export type CamSetupSheet = typeof CamSetupSheet.Type
