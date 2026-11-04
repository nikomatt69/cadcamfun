import { cam } from "@cadcamfun/core"
import { Schema } from "effect"

/*
 * Probing, work offsets and in-process inspection (spec 73 §3.1): the transport shapes of the `camProbing` group. Lengths are
 * millimetres; angles on the wire are degrees (spec 73 §1), as the machine configuration stores them.
 */

const finite = Schema.Finite
const iso = Schema.String.annotate({ description: "ISO-8601 timestamp" })

/** One work-offset row as the machine holds it: mm, and degrees for `a` / `b` / `c` and the `rotation` about the tool axis. */
export const CamOffsetEntry = Schema.Struct({
  x: finite, y: finite, z: finite,
  a: Schema.optionalKey(finite), b: Schema.optionalKey(finite), c: Schema.optionalKey(finite),
  rotation: Schema.optionalKey(finite)
})
export type CamOffsetEntry = typeof CamOffsetEntry.Type

/**
 * A work-offset key as the table stores it (`G54`, `G54.1 P3`, `G505`, `G59.2`, `preset 4`). The sidecar parses it with the
 * core offset grammar and answers 400 for one it does not know.
 */
export const CamOffsetKey = Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(24), Schema.isPattern(/^[A-Za-z][A-Za-z0-9 .]*$/))

/** At most this many rows in one table (G54..G59 plus a full extended range is well under it); the sidecar refuses more. */
export const WORK_OFFSET_ROWS_MAX = 320

// Any string key: a record whose key schema refuses a key drops that entry on decode instead of failing, which would silently
// empty a table, so the sidecar checks every key with the core offset grammar and refuses a bad one by name.
const entries = Schema.Record(Schema.String, CamOffsetEntry)

export const WorkOffsetTableQuery = { setupId: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))) }

/** `PUT /api/machine-configs/:id/work-offsets`: the whole table (of the machine, or of `?setupId`); a stale base answers 409. */
export const WorkOffsetTableBody = Schema.Struct({
  entries,
  baseUpdatedAt: Schema.optionalKey(iso)
})
export type WorkOffsetTableBody = typeof WorkOffsetTableBody.Type

export const WorkOffsetTableDocument = Schema.Struct({
  machineConfigId: Schema.String,
  setupId: Schema.NullOr(Schema.String),
  entries: Schema.Record(Schema.String, CamOffsetEntry),
  /** The machine configuration's revision: send it back as `baseUpdatedAt`. */
  updatedAt: iso,
  /** Only the owner may write; a reader sees the table but the panel disables Save. */
  isOwner: Schema.Boolean
})
export type WorkOffsetTableDocument = typeof WorkOffsetTableDocument.Type

const k = cam.kernel

/**
 * `PUT /api/machine-configs/:id/probe`: each given slice replaces the stored one (`config.probing`, `config.toolSetter`,
 * `config.rotaryCalibration`), `null` removes it, an omitted one is kept. The slices are the core machine-profile shapes
 * (degrees for angles); the legacy `probing {cycles, stylusRadius, feed, dialect}` keys stay valid.
 */
export const MachineProbeConfigBody = Schema.Struct({
  probing: Schema.optionalKey(Schema.NullOr(k.MachineProbingSchema)),
  toolSetter: Schema.optionalKey(Schema.NullOr(k.MachineToolSetterSchema)),
  rotaryCalibration: Schema.optionalKey(Schema.NullOr(k.MachineRotaryCalibrationSchema)),
  baseUpdatedAt: Schema.optionalKey(iso)
})
export type MachineProbeConfigBody = typeof MachineProbeConfigBody.Type

/** What the machine stores, read field by field: a stored field that does not read is left out, never guessed. */
export const MachineProbeConfigDocument = Schema.Struct({
  machineConfigId: Schema.String,
  probing: Schema.NullOr(k.MachineProbingSchema),
  toolSetter: Schema.NullOr(k.MachineToolSetterSchema),
  rotaryCalibration: Schema.NullOr(k.MachineRotaryCalibrationSchema),
  updatedAt: iso,
  isOwner: Schema.Boolean
})
export type MachineProbeConfigDocument = typeof MachineProbeConfigDocument.Type

export const ProbeReportKind = Schema.Literals(["part", "rotary", "stylus", "tool-setter"])
export const ProbeReportSource = Schema.Literals(["simulated", "machine", "imported"])
export const ProbeReportVerdict = Schema.Literals(["pass", "warn", "fail", "missed", "incomplete"])
export type ProbeReportVerdict = typeof ProbeReportVerdict.Type

const nullableId = Schema.NullOr(Schema.String)

/** One report as a list shows it: everything but the measured data. */
export const ProbeReportSummary = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  drawingId: nullableId,
  /** The probe operation (a `Toolpath` row) the report measured; null once that operation is deleted. */
  toolpathId: nullableId,
  machineConfigId: nullableId,
  setupId: nullableId,
  runId: nullableId,
  name: Schema.String,
  kind: ProbeReportKind,
  source: ProbeReportSource,
  verdict: ProbeReportVerdict,
  workOffset: nullableId,
  programHash: nullableId,
  sourceRevision: nullableId,
  measuredAt: iso,
  createdAt: iso,
  createdById: Schema.String
})
export type ProbeReportSummary = typeof ProbeReportSummary.Type

/** A report with its body: the core `ProbeReport` JSON (contacts, checks, offset updates) as it was measured. */
export const ProbeReportDocument = Schema.Struct({ ...ProbeReportSummary.fields, data: Schema.Unknown })
export type ProbeReportDocument = typeof ProbeReportDocument.Type

export const ProbeReportListQuery = {
  operationId: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
  before: Schema.optional(Schema.String)
}

const optionalId = Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))))

/** `PUT /api/projects/:id/probe-reports`: the desktop stores a report it already holds (simulated there, or read from a machine). */
export const ProbeReportSaveBody = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  kind: ProbeReportKind,
  source: ProbeReportSource,
  verdict: ProbeReportVerdict,
  data: Schema.Unknown,
  toolpathId: optionalId,
  drawingId: optionalId,
  machineConfigId: optionalId,
  setupId: optionalId,
  runId: optionalId,
  workOffset: Schema.optionalKey(Schema.NullOr(CamOffsetKey)),
  programHash: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)))),
  sourceRevision: optionalId,
  measuredAt: Schema.optionalKey(iso)
})
export type ProbeReportSaveBody = typeof ProbeReportSaveBody.Type

// ---------------------------------------------------------------- plan, emit, simulate, calibrate

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const point3 = Schema.Struct({ x: finite, y: finite, z: finite })
const name128 = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))

/** The elements of a drawing as plain records: the same snapshot every CAM route takes. */
export const CamProbingElements = Schema.Array(Schema.Record(Schema.String, Schema.Json)).check(Schema.isMinLength(1), Schema.isMaxLength(2000))

/** Where to announce a run's progress (`probe.progress` frames on the project's live stream); never stored. */
export const CamProbingProgressTarget = Schema.Struct({ projectId: name128, runId: name128 })

/**
 * The planning settings of a probe cycle, every one optional: a request's own value wins over the machine's probe, which wins over the
 * core defaults. `machineConfig` is the id of a saved machine configuration whose probe the settings start from. Lengths mm, feeds
 * mm/min, `orientSpindle` degrees.
 */
export const CamProbingSettingsInput = Schema.Struct({
  machineConfig: Schema.optionalKey(name128),
  stylusDiameter: Schema.optionalKey(positive),
  feed: Schema.optionalKey(positive),
  fastFeed: Schema.optionalKey(positive),
  positioningFeed: Schema.optionalKey(positive),
  search: Schema.optionalKey(positive),
  clearance: Schema.optionalKey(positive),
  safeZ: Schema.optionalKey(finite),
  overtravel: Schema.optionalKey(positive),
  backoff: Schema.optionalKey(positive),
  doubleTouch: Schema.optionalKey(Schema.Boolean),
  /** The offset the cycle writes to as the table keys it: `G54`, `G54.1 P3`, `G505`, `G59.2`. */
  workOffset: Schema.optionalKey(CamOffsetKey),
  toolNumber: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }))),
  effectiveRadius: Schema.optionalKey(positive),
  orientSpindle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 360 })))
})
export type CamProbingSettingsInput = typeof CamProbingSettingsInput.Type

/** The settings a plan was made with: every field resolved. */
export const CamProbingSettings = Schema.Struct({
  stylusDiameter: positive, feed: positive, fastFeed: positive, positioningFeed: positive, search: positive, clearance: positive,
  safeZ: finite, overtravel: positive, backoff: positive, doubleTouch: Schema.Boolean, workOffset: CamOffsetKey,
  toolNumber: Schema.optionalKey(Schema.Int), effectiveRadius: Schema.optionalKey(positive), orientSpindle: Schema.optionalKey(finite)
})
export type CamProbingSettings = typeof CamProbingSettings.Type

/** A tilted plane of a five-axis probe: the rotary angles the control swivels to, degrees (the cycle runs in that plane). */
export const CamProbingFrame = Schema.Struct({
  a: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -120, maximum: 120 }))),
  b: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -120, maximum: 120 }))),
  c: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -360, maximum: 360 })))
})
export type CamProbingFrame = typeof CamProbingFrame.Type

export const CamProbingFeatureHint = Schema.Literals(["bore", "boss", "z-surface", "edge", "corner", "pocket", "web", "sphere"])

/** A feature of an element of the drawing: resolved to a cycle from the element's exact solid. */
export const CamProbingFeatureRef = Schema.Struct({
  elements: CamProbingElements,
  elementId: name128,
  /** One candidate by its reference (`hole:0`, `boss:12`, `face:3`, `side:7`, `corner:4,5`, `slot:slot-0`, `web:4,6`, `sphere:9`). */
  ref: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  hint: Schema.optionalKey(CamProbingFeatureHint)
})
export type CamProbingFeatureRef = typeof CamProbingFeatureRef.Type

const CAMKINDS = cam.probing.PROBE_CYCLE_KINDS

const planCommon = {
  settings: Schema.optionalKey(CamProbingSettingsInput),
  frame: Schema.optionalKey(CamProbingFrame),
  /** Characteristics measured by the cycle and checked against their limits (PMI, ISO 286 fits). */
  checks: Schema.optionalKey(Schema.Array(k.CharacteristicSchema).check(Schema.isMaxLength(50))),
  /** What the program does with the results (offsets, tool table, reports); inspection checks are `checks`. */
  actions: Schema.optionalKey(Schema.Array(k.ProbeActionSchema).check(Schema.isMaxLength(20)))
}

/**
 * Exactly one of `operation` (a cycle) and `feature` (resolved from an element's solid); both or neither is a 400 that says so (the
 * client generators cannot carry a custom filter or a union that excludes keys, so the service checks it).
 */
export const CamProbingPlanRequest = Schema.Struct({
  operation: Schema.optionalKey(k.ProbeCycleSchema),
  feature: Schema.optionalKey(CamProbingFeatureRef),
  ...planCommon
})
export type CamProbingPlanRequest = typeof CamProbingPlanRequest.Type

/** One move of a cycle for a preview: where the probe rapids, touches or retracts (work coordinates, mm). */
export const CamProbingStep = Schema.Struct({ kind: Schema.Literals(["rapid", "probe", "retract"]), from: point3, to: point3 })

export const CamProbingPlan = Schema.Struct({
  operation: k.ProbeCycleSchema,
  cycle: Schema.Literals(CAMKINDS),
  /** Why this cycle, when the request named a feature. */
  chosenBecause: Schema.optionalKey(Schema.String),
  settings: CamProbingSettings,
  steps: Schema.Array(CamProbingStep),
  /** The IR the cycle is made of (`Probe`, `Assign`, `OffsetUpdate`, ...), what a post writes. */
  moves: Schema.Array(cam.MoveSchema),
  checks: Schema.Array(k.CharacteristicSchema),
  /** Result name -> value on a part exactly as drawn (mm; degrees for angles). */
  nominal: Schema.Record(Schema.String, Schema.Finite),
  notes: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String)
})
export type CamProbingPlan = typeof CamProbingPlan.Type

export const CamProbingDialect = Schema.Literals(["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"])

export const CamProbingEmitOptions = Schema.Struct({
  /** Orient the spindle (M19 / SPOS) before probing, degrees. */
  orientSpindle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 360 }))),
  programNumber: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }))),
  lineNumbers: Schema.optionalKey(Schema.Boolean)
})

export const CamProbingEmitRequest = Schema.Struct({
  operation: Schema.optionalKey(k.ProbeCycleSchema),
  feature: Schema.optionalKey(CamProbingFeatureRef),
  dialect: CamProbingDialect,
  options: Schema.optionalKey(CamProbingEmitOptions),
  ...planCommon
})
export type CamProbingEmitRequest = typeof CamProbingEmitRequest.Type

export const CamProbingProgram = Schema.Struct({
  dialect: CamProbingDialect,
  nc: Schema.String,
  identity: Schema.Struct({ nc: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)) }),
  /** The number of lines of `nc`. */
  lines: Schema.Int,
  steps: Schema.Array(CamProbingStep),
  notes: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String)
})
export type CamProbingProgram = typeof CamProbingProgram.Type

/** Where the part really sits against where the program believes it is: mm, and `c` (about the vertical) in degrees. */
export const CamProbingMisplacement = Schema.Struct({
  x: Schema.optionalKey(finite), y: Schema.optionalKey(finite), z: Schema.optionalKey(finite),
  a: Schema.optionalKey(finite), b: Schema.optionalKey(finite), c: Schema.optionalKey(finite)
})

export const CamProbingSimulateOperation = Schema.Struct({
  operation: k.ProbeCycleSchema,
  checks: Schema.optionalKey(Schema.Array(k.CharacteristicSchema).check(Schema.isMaxLength(50))),
  actions: Schema.optionalKey(Schema.Array(k.ProbeActionSchema).check(Schema.isMaxLength(20))),
  /** The id the report names the operation by. */
  id: Schema.optionalKey(name128)
})

export const CamProbingSimulateRequest = Schema.Struct({
  elements: CamProbingElements,
  operations: Schema.Array(CamProbingSimulateOperation).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  settings: Schema.optionalKey(CamProbingSettingsInput),
  frame: Schema.optionalKey(CamProbingFrame),
  /** The offsets the control holds before the run (key -> row); default zero. */
  workOffsets: Schema.optionalKey(Schema.Record(Schema.String, CamOffsetEntry)),
  misplacement: Schema.optionalKey(CamProbingMisplacement),
  progress: Schema.optionalKey(CamProbingProgressTarget)
})
export type CamProbingSimulateRequest = typeof CamProbingSimulateRequest.Type

const reportCheck = Schema.Struct({
  operationId: Schema.String, name: Schema.String, kind: Schema.Literals(["size", "position", "true-position", "flatness", "angle"]),
  measured: finite, nominal: finite, deviation: finite, lower: finite, upper: finite, status: Schema.Literals(["pass", "warn", "fail"])
})

/** The core `ProbeReport` as JSON (degrees for angles): what a run touched, measured and changed, with one verdict. */
export const CamProbeReportData = Schema.Struct({
  verdict: ProbeReportVerdict,
  failed: Schema.Int,
  warned: Schema.Int,
  maxDeviationMm: Schema.optionalKey(finite),
  operations: Schema.Array(Schema.Struct({
    operationId: Schema.String, cycle: Schema.Literals(CAMKINDS),
    contacts: Schema.Array(Schema.Struct({ name: Schema.optionalKey(Schema.String), tip: point3, line: Schema.optionalKey(Schema.Int) })),
    results: Schema.Record(Schema.String, Schema.Finite),
    nominal: Schema.Record(Schema.String, Schema.Finite),
    units: Schema.Record(Schema.String, Schema.Literals(["mm", "deg"])),
    alarms: Schema.Array(Schema.Struct({ code: Schema.Int, text: Schema.String, line: Schema.optionalKey(Schema.Int) })),
    stopped: Schema.optionalKey(Schema.String)
  })),
  checks: Schema.Array(reportCheck),
  updates: Schema.Array(Schema.Struct({ operationId: Schema.String, offset: Schema.String, axis: Schema.String, before: finite, after: finite })),
  tools: Schema.Array(Schema.Struct({ operationId: Schema.String, tool: Schema.Int, quantity: Schema.Literals(["length", "radius"]), part: Schema.Literals(["geometry", "wear"]), before: finite, after: finite })),
  offsets: Schema.Record(Schema.String, CamOffsetEntry)
})
export type CamProbeReportData = typeof CamProbeReportData.Type

/** A simulated run: the report, the offset table it leaves (key -> row) and the identity of what was simulated. */
export const CamProbingSimulation = Schema.Struct({
  report: CamProbeReportData,
  offsetTable: Schema.optionalKey(Schema.Record(Schema.String, CamOffsetEntry)),
  identity: Schema.Struct({ elements: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)), operations: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)) })
})
export type CamProbingSimulation = typeof CamProbingSimulation.Type

/**
 * A rotary axis calibration: a reference ball on the table measured at `angles` (degrees, 3..10, spanning at least 20). With `truth`
 * the run is simulated against a machine whose pivot or axis is not where the control believes; with `measured` the centres a
 * machine measured are fitted instead. Never writes a machine parameter.
 */
export const CamRotaryCalibrationRequest = Schema.Struct({
  axis: Schema.Literals(["A", "B", "C"]),
  sphere: Schema.Struct({ centre: point3, diameter: positive }),
  angles: Schema.Array(Schema.Finite.check(Schema.isBetween({ minimum: -360, maximum: 360 }))).check(Schema.isMinLength(3), Schema.isMaxLength(10)),
  /** What the control believes about the table (default: the machine configuration's rotary). */
  assumed: Schema.optionalKey(Schema.Struct({ layout: Schema.Literals(["table-AC", "table-BC"]), pivot: point3 })),
  settings: Schema.optionalKey(CamProbingSettingsInput),
  /** A machine whose pivot is `pivot` (mm) and whose axis leans `tilt` degrees about X: the run is simulated against it. */
  truth: Schema.optionalKey(Schema.Struct({ pivot: Schema.optionalKey(point3), tilt: Schema.optionalKey(finite) })),
  /** Centres a machine measured, one per angle (same order): fitted, nothing simulated. */
  measured: Schema.optionalKey(Schema.Array(point3).check(Schema.isMinLength(3), Schema.isMaxLength(10))),
  dialect: Schema.optionalKey(CamProbingDialect),
  progress: Schema.optionalKey(CamProbingProgressTarget)
})
export type CamRotaryCalibrationRequest = typeof CamRotaryCalibrationRequest.Type

export const CamRotaryCalibrationResult = Schema.Struct({
  axis: Schema.Literals(["A", "B", "C"]),
  /** The ball's centre at each angle (mm), as measured or simulated. */
  centres: Schema.Array(point3),
  /** The fit; absent when the centres do not make a circle (`refused` says why). */
  calibration: Schema.optionalKey(Schema.Struct({
    pivot: point3, axisDirection: point3, pivotError: point3,
    /** Degrees. */
    axisTilt: finite, radius: finite, rms: finite
  })),
  refused: Schema.optionalKey(Schema.String),
  /** The program that measures the ball, when a dialect was asked for. */
  nc: Schema.optionalKey(Schema.String),
  notes: Schema.Array(Schema.String)
})
export type CamRotaryCalibrationResult = typeof CamRotaryCalibrationResult.Type

/** `POST /api/projects/:id/probe-reports`: simulate a stored probe operation (a `Toolpath` row) and keep the report. */
export const ProbeReportRunBody = Schema.Struct({
  /** The probe operation: the id of its `Toolpath` row. */
  operationId: name128,
  misplacement: Schema.optionalKey(CamProbingMisplacement),
  machineConfig: Schema.optionalKey(name128),
  setupId: Schema.optionalKey(name128),
  /** Degrees of rotary pivot error to simulate for a rotary report (the machine's truth). */
  calibrationError: Schema.optionalKey(finite),
  runId: Schema.optionalKey(name128)
})
export type ProbeReportRunBody = typeof ProbeReportRunBody.Type
