import { Schema } from "effect"

/*
 * Probing, work offsets and in-process inspection (spec 73 §3.1): the transport shapes of the `camProbing` group. Lengths are
 * millimetres; angles on the wire are degrees (spec 73 §1), work-offset rotations radians as the machine table stores them.
 */

const finite = Schema.Finite
const iso = Schema.String.annotate({ description: "ISO-8601 timestamp" })

/** One work-offset row as the machine holds it (mm; `rotation` in radians about the tool axis). */
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
/**
 * The same rule as a predicate, for record keys: a record whose key schema refuses a key drops that entry on decode instead of
 * failing, which would silently empty a table, so tables take any string key and the sidecar refuses a bad one by name.
 */
export const isCamOffsetKey = (key: string): boolean => key.length >= 2 && key.length <= 24 && /^[A-Za-z][A-Za-z0-9 .]*$/.test(key)

/** At most this many rows in one table (G54..G59 plus a full extended range is well under it). */
export const WORK_OFFSET_ROWS_MAX = 320

const entries = Schema.Record(Schema.String, CamOffsetEntry).check(Schema.makeFilter((record) =>
  Object.keys(record).length <= WORK_OFFSET_ROWS_MAX || `at most ${WORK_OFFSET_ROWS_MAX} work offsets`))

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

const slice = Schema.Record(Schema.String, Schema.Unknown)

/**
 * `PUT /api/machine-configs/:id/probe`: each given slice replaces the stored one (`config.probing`, `config.toolSetter`,
 * `config.rotaryCalibration`), `null` removes it, an omitted one is kept.
 */
export const MachineProbeConfigBody = Schema.Struct({
  probing: Schema.optionalKey(Schema.NullOr(slice)),
  toolSetter: Schema.optionalKey(Schema.NullOr(slice)),
  rotaryCalibration: Schema.optionalKey(Schema.NullOr(slice)),
  baseUpdatedAt: Schema.optionalKey(iso)
})
export type MachineProbeConfigBody = typeof MachineProbeConfigBody.Type

export const MachineProbeConfigDocument = Schema.Struct({
  machineConfigId: Schema.String,
  probing: Schema.NullOr(slice),
  toolSetter: Schema.NullOr(slice),
  rotaryCalibration: Schema.NullOr(slice),
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
