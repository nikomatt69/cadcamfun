import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"
import { CamManufactureInput, CamStockSetInput } from "./ai-cam.ts"

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const strings = Schema.Array(Schema.String)
const id = Schema.NonEmptyString

/** Where to announce a run's progress: a `cam.progress` frame per step on the project's live stream; never stored with the program. */
export const CamProgressTarget = Schema.Struct({ projectId: id, runId: id })

/**
 * Process physics of a run (spec 61): per-move feed optimisation on the carried stock (`chip` holds the chip thickness, `power` the
 * spindle power), the machine dynamics of the cycle-time model, Taylor constants per tool id and the share of life a tool may use.
 * Every figure the report carries is labelled uncalibrated. Absent: the program and the artifact are unchanged.
 */
export const CamProcessRequest = Schema.Struct({
  feedOptimisation: Schema.optionalKey(Schema.Literals(["off", "chip", "power"])),
  dynamics: Schema.optionalKey(Schema.Struct({
    preset: Schema.optionalKey(Schema.Literals(["economy", "standard", "high-speed"])),
    /** mm/s². */
    acceleration: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(100_000))),
    /** mm/s³. */
    jerk: Schema.optionalKey(positive),
    /** Blocks the control looks ahead (0: exact stop). */
    lookAhead: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2000 })))
  })),
  taylor: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ n: positive.check(Schema.isLessThanOrEqualTo(1)), c: positive }))),
  lifeLimit: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0.05, maximum: 1 })))
})
export type CamProcessRequest = typeof CamProcessRequest.Type

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
  /** Release only when the tolerance budget is within `tolerance` (claim `tolerance`, spec 69 B4). */
  enforceTolerance: Schema.optionalKey(Schema.Boolean),
  /** Process physics and its evidence (`artifact.process`); see `CamProcessRequest`. */
  process: Schema.optionalKey(CamProcessRequest),
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
export const CamKernelCutter = Schema.Struct({
  id, name: Schema.String, kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer", "countersink", "boringbar", "tslot", "dovetail"]),
  diameter: positive, flutes: Schema.Int, material: Schema.Literals(["hss", "hss-co", "carbide", "pcd"]),
  coating: Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]),
  cornerRadius: Schema.optionalKey(Schema.Finite), angle: Schema.optionalKey(Schema.Finite), tipDiameter: Schema.optionalKey(Schema.Finite), pitch: Schema.optionalKey(Schema.Finite),
  fluteLength: positive, shankDiameter: positive, stickout: positive,
  holder: Schema.optionalKey(Schema.Struct({ diameter: positive, length: positive })), maxRpm: Schema.optionalKey(positive), number: Schema.Int
})

const uncalibrated = Schema.Literal(false)
/** The `process` evidence of a run (`cam.kernel.ProcessReport`); every figure uncalibrated, a stability result never a pass. */
export const CamProcessReport = Schema.Struct({
  feedOptimisation: Schema.Struct({
    mode: Schema.Literals(["off", "chip", "power"]),
    operations: Schema.Array(Schema.Struct({
      operation: Schema.String,
      report: Schema.Struct({
        mode: Schema.Literals(["off", "chip", "power"]), changed: Schema.Int, pieces: Schema.Int, unresolved: Schema.Int, airPieces: Schema.Int, entryPieces: Schema.Int,
        feedMin: Schema.Number, feedMax: Schema.Number, chip: Schema.Number, bound: Schema.Record(Schema.String, Schema.Number), belowFloor: Schema.Int,
        cutSecondsBefore: Schema.Number, cutSecondsAfter: Schema.Number, totalSecondsBefore: Schema.Number, totalSecondsAfter: Schema.Number, cutTimeSaved: Schema.Number,
        claimBefore: Schema.Literals(["passed", "failed", "unresolved"]), claimAfter: Schema.Literals(["passed", "failed", "unresolved"]),
        worstRatioBefore: Schema.Number, worstRatioAfter: Schema.Number, aeBound: Schema.Number
      })
    }))
  }),
  cycleTime: Schema.Struct({ seconds: Schema.Finite, kinematicSeconds: Schema.Finite, blocks: Schema.Int, calibrated: uncalibrated, basis: Schema.String, withToolChangesSeconds: Schema.Finite }),
  toolLife: Schema.Array(Schema.Struct({
    toolId: Schema.String, tool: Schema.Int, lifeUsed: Schema.Number, perOperation: Schema.Array(Schema.Struct({ operation: Schema.String, lifeUsed: Schema.Number })),
    status: Schema.Literals(["ok", "change", "exceeded"]), changeBefore: strings, calibrated: uncalibrated
  })),
  stability: Schema.Array(Schema.Struct({
    toolId: Schema.String,
    result: Schema.Struct({
      status: Schema.Literals(["measured", "indicative"]), aLimMin: Schema.Number, chatterHz: Schema.Number,
      curve: Schema.Array(Schema.Struct({ rpm: Schema.Number, aLim: Schema.Number, lobe: Schema.Int })),
      windows: Schema.Array(Schema.Struct({ fromRpm: Schema.Number, toRpm: Schema.Number, aLim: Schema.Number })), calibrated: uncalibrated, note: Schema.String
    })
  })),
  calibrated: uncalibrated, label: Schema.String
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
  program: cam.ProgramSchema, tools: Schema.Array(CamKernelCutter), nc: Schema.String,
  claims: Schema.Array(Schema.Struct({
    id: Schema.Literals(["bed-fit", "heated-start", "layers-rise", "wall-coverage", "skin-coverage", "no-spill", "filament", "cutting-data", "machine-limits", "operations-complete", "no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed", "nc-replay", "machine-travel", "machine-clearance", "setup-workholding", "part-coverage", "tolerance"]),
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
  })),
  /** Present when the request asked for `process`: feed optimisation per operation, dynamic cycle time, tool life, indicative stability. */
  process: Schema.optionalKey(CamProcessReport),
  /** Tool-centre-point output only: the largest distance of the tip the NC makes from the planned path, with its declared limit, mm. */
  tipError: Schema.optionalKey(Schema.Struct({ max: Schema.Finite, mean: Schema.Finite, samples: Schema.Int, limit: Schema.Finite, line: Schema.optionalKey(Schema.Int) }))
})
export type CamKernelArtifact = typeof CamKernelArtifact.Type

export const CamKernelResult: Schema.Codec<cam.kernel.CamResult<cam.kernel.CamArtifact>> = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok"), value: CamKernelArtifact }),
  Schema.Struct({ status: Schema.Literal("failed"), issues: Schema.Array(CamKernelIssue) })
])
export type CamKernelResult = typeof CamKernelResult.Type

/**
 * What the kernel would run for a request, without running it (`cam.kernel.planOnly`): the planned operations in machining order (each an
 * `OperationSpec` record, to edit and send back as `operations`), the planner's notes and what it cannot machine in this setup.
 */
export const CamKernelPlanResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok"), value: Schema.Struct({ operations: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)), notes: strings, unmachined: strings }) }),
  Schema.Struct({ status: Schema.Literal("failed"), issues: Schema.Array(CamKernelIssue) })
])
export type CamKernelPlanResult = typeof CamKernelPlanResult.Type

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

/**
 * Whether the drawing still matches the model a stored kernel program was made from (spec 59 A2). Derived on read, never stored.
 * `stale` carries the class (`topology`: elements added or removed; `geometry`: a shape or placement changed; `rigid`: the whole part moved
 * by `move`; `inputs`: only a setting differs) and the element ids; `unknown` always carries its reason and is never read as `current`.
 */
export const CamProgramStatus = Schema.Union([
  Schema.Struct({ status: Schema.Literal("current"), displayOnly: strings }),
  Schema.Struct({
    status: Schema.Literal("stale"), class: Schema.Literals(["topology", "geometry", "rigid", "inputs"]),
    added: strings, removed: strings, changed: strings, move: Schema.optionalKey(xyz), inputs: strings, reasons: strings
  }),
  Schema.Struct({ status: Schema.Literal("unknown"), reason: Schema.String })
])
export type CamProgramStatus = typeof CamProgramStatus.Type

const claimStatus = Schema.Literals(["passed", "failed", "unsupported", "unresolved"])
const beforeAfter = Schema.Struct({ before: Schema.Finite, after: Schema.Finite })

/** What a regeneration changes against the stored program (`cam.kernel.programDiff`, spec 59 A4). */
export const CamProgramDiff = Schema.Struct({
  same: Schema.Boolean,
  operations: Schema.Struct({
    added: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
    removed: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
    changed: Schema.Array(Schema.Struct({
      id: Schema.String, name: Schema.String, from: Schema.optionalKey(Schema.String), confidence: Schema.optionalKey(Schema.Finite),
      fields: Schema.Array(Schema.Literals(["status", "strategy", "tool", "cut", "parameters", "cutLength", "time", "removedVolume"])),
      timeSeconds: beforeAfter, removedVolume: beforeAfter, parameters: strings
    })),
    /** Operations paired by the geometry they machine (a moved or resized feature whose id changed), with the confidence of each pair. */
    matched: Schema.Array(Schema.Struct({ before: Schema.String, after: Schema.String, by: Schema.Literals(["id", "signature"]), confidence: Schema.Finite })),
    /** Overrides of the stored program that the new one does not carry, and why. */
    droppedOverrides: Schema.Array(Schema.Struct({ id: Schema.String, parameters: strings, reason: Schema.String })),
    /** Overrides to set on the new operations to keep what the person tuned on the paired ones. */
    carried: Schema.Array(Schema.Struct({ before: Schema.String, after: Schema.String, parameters: Schema.Record(Schema.String, Schema.Unknown) }))
  }),
  tools: Schema.Struct({ added: strings, removed: strings }),
  cycleTimeSeconds: Schema.Struct({ before: Schema.Finite, after: Schema.Finite, delta: Schema.Finite }),
  removedVolume: Schema.Struct({ before: Schema.Finite, after: Schema.Finite, delta: Schema.Finite }),
  claims: Schema.Array(Schema.Struct({ id: Schema.String, before: Schema.Union([claimStatus, Schema.Literal("absent")]), after: Schema.Union([claimStatus, Schema.Literal("absent")]), direction: Schema.Literals(["worse", "better", "changed"]) })),
  release: Schema.Struct({ before: Schema.Literals(["blocked", "preview", "verified-program"]), after: Schema.Literals(["blocked", "preview", "verified-program"]), direction: Schema.Literals(["same", "lower", "higher"]) }),
  nc: Schema.Struct({ linesBefore: Schema.Int, linesAfter: Schema.Int, linesAdded: Schema.Int, linesRemoved: Schema.Int, identical: Schema.Boolean }),
  safe: Schema.Boolean
})
export type CamProgramDiff = typeof CamProgramDiff.Type

/**
 * `scope: "program"` (default) regenerates from the current version of the elements the program was made from; `"drawing"` from every part
 * element of the drawing now (a program the assistant made from the whole drawing, with a feature added since).
 */
export const CamRegenerateRequest = Schema.Struct({
  scope: Schema.optionalKey(Schema.Literals(["program", "drawing"])),
  /**
   * Replace the stored program with the regenerated one (needs write access). The old program is kept first as a version of the toolpath
   * (a restore point), and nothing is replaced when the drawing or the toolpath changed while the kernel ran. A diff that is not `safe`
   * (a lower release or a claim that got worse) is refused unless `force` is true.
   */
  accept: Schema.optionalKey(Schema.Boolean),
  force: Schema.optionalKey(Schema.Boolean),
  /** The note on the restore point (default: what changed). */
  message: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200)))
})

/** A preview of regenerating a stored program: the new artifact and its diff against the stored one. Nothing is stored. */
export const CamRegenerateResult = Schema.Struct({
  status: CamProgramStatus,
  scope: Schema.Literals(["program", "drawing"]),
  /** True when the stored program was replaced; `refusal` says why it was not when `accept` was asked. */
  accepted: Schema.Boolean,
  refusal: Schema.optionalKey(Schema.String),
  /** The restore point (a version of the toolpath) holding the program that was replaced. */
  versionId: Schema.optionalKey(Schema.String),
  outcome: Schema.Union([
    Schema.Struct({ status: Schema.Literal("ok"), artifact: CamKernelArtifact, diff: CamProgramDiff }),
    Schema.Struct({ status: Schema.Literal("failed"), issues: Schema.Array(CamKernelIssue) })
  ])
})
export type CamRegenerateResult = typeof CamRegenerateResult.Type
