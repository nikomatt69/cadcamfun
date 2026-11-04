/**
 * Work offsets as data (spec 73 §5.3): which offset a program or a probe cycle addresses, the table of their values, where each
 * control keeps them, and the rule that decides whether a measured correction is written.
 *
 *   WorkOffsetRef   G54..G59, G54.1 P / G154 P (extended), a Siemens settable frame (G505..G599), LinuxCNC G59.1..G59.3, a
 *                   Heidenhain preset row
 *   OffsetEntry     the machine coordinates of the zero (mm) and the rotary / rotation part (radians), the shape the controls keep
 *   addressOf       the selection word and the variable (or the G10 form) of an offset on a control family, or the reason it has none
 *   applyCorrection the update policy (set / report / update-within-tolerance / alarm-outside-tolerance) applied to a measured delta;
 *                   `policyCondition` is the same rule as IR conditions, so a probe program decides on the control what the host decides
 *
 * Variable numbers follow the vendors' programming manuals as the author reads them ("read from the vendor manual, not run on a
 * control"): Fanuc-like `#5221 + 20(n-1) + axis`, G54.1 P `#7001 + 20(p-1)` (P > 48 `#14001 + 20(p-1)`), Haas G154 P1..P20 `#7001..`,
 * P21..P99 `#14001..`, Okuma `VZOFX[n]`, Siemens `$P_UIFR[n,X,TR]` (rotation `$P_UIFR[n,Z,RT]`), LinuxCNC `#5221 + 20(p-1)` written with
 * `G10 L2 P`, GRBL `G10 L20` only.
 */
import { Schema, SchemaTransformation } from "effect"
import type { Vec3 } from "../cad/vec.ts"
import { WorkOffsetSchema, type WorkOffset } from "./ir.ts"
import { binary, call, num, type Condition, type Expr } from "./macro.ts"

const DEG = Math.PI / 180

// ---------------------------------------------------------------- references

export type WorkOffsetRef =
  | { readonly kind: "g5x"; readonly code: WorkOffset }
  /** Fanuc / Mazak / Mitsubishi / Brother `G54.1 P<p>`, Haas `G154 P<p>`, Okuma `G15 H<6+p>`. */
  | { readonly kind: "extended"; readonly p: number }
  /** Siemens settable frame `n` (`$P_UIFR[n]`): 1..4 are G54..G57, 5..99 are G505..G599. */
  | { readonly kind: "frame"; readonly n: number }
  /** LinuxCNC coordinate system `P1..P9` (G54..G59, G59.1..G59.3). */
  | { readonly kind: "linuxcnc"; readonly p: number }
  /** Heidenhain preset table row. */
  | { readonly kind: "preset"; readonly row: number }

const G5X: ReadonlyArray<WorkOffset> = ["G54", "G55", "G56", "G57", "G58", "G59"]

export const WorkOffsetRefSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("g5x"), code: WorkOffsetSchema }),
  Schema.Struct({ kind: Schema.Literal("extended"), p: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300 })) }),
  Schema.Struct({ kind: Schema.Literal("frame"), n: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })) }),
  Schema.Struct({ kind: Schema.Literal("linuxcnc"), p: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9 })) }),
  Schema.Struct({ kind: Schema.Literal("preset"), row: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99_999 })) })
])

/** The canonical text of a reference, also its key in a `WorkOffsetTable`: `G54`, `G54.1 P3`, `G505`, `G59.2`, `preset 4`. */
export const formatOffsetRef = (ref: WorkOffsetRef): string => {
  switch (ref.kind) {
    case "g5x": return ref.code
    case "extended": return `G54.1 P${ref.p}`
    case "frame": return ref.n <= 4 ? G5X[ref.n - 1]! : `G${500 + ref.n}`
    case "linuxcnc": return ref.p <= 6 ? G5X[ref.p - 1]! : `G59.${ref.p - 6}`
    case "preset": return `preset ${ref.row}`
  }
}

export const offsetKey = formatOffsetRef

/** Reads `G54`, `G54.1 P3`, `G154 P3`, `G505`, `G59.2`, `preset 4` (case and spaces free). Undefined for anything else. */
export const parseOffsetRef = (text: string): WorkOffsetRef | undefined => {
  const t = text.trim().toUpperCase().replace(/\s+/g, " ")
  let m = /^G5([4-9])$/.exec(t)
  if (m) return { kind: "g5x", code: `G5${m[1]}` as WorkOffset }
  m = /^G(?:54\.1|154) ?P(\d{1,3})$/.exec(t)
  if (m) { const p = Number(m[1]); return p >= 1 && p <= 300 ? { kind: "extended", p } : undefined }
  m = /^G5(\d\d)$/.exec(t)
  if (m) { const n = Number(m[1]); return n >= 5 && n <= 99 ? { kind: "frame", n } : undefined }
  m = /^G59\.([1-3])$/.exec(t)
  if (m) return { kind: "linuxcnc", p: 6 + Number(m[1]) }
  m = /^PRESET ?(\d{1,5})$/.exec(t)
  if (m) return { kind: "preset", row: Number(m[1]) }
  return undefined
}

/** The reference a table key names (the inverse of `offsetKey`). */
export const refOf = (key: string): WorkOffsetRef | undefined => parseOffsetRef(key)

/** Two references that name the same offset (LinuxCNC P1..P6 and a Siemens frame 1..4 are G54..). */
export const sameOffset = (a: WorkOffsetRef, b: WorkOffsetRef): boolean => offsetKey(a) === offsetKey(b)

// ---------------------------------------------------------------- the table

/** One offset: machine coordinates of the zero, mm; rotary offsets and the rotation about the tool axis, radians. */
export interface OffsetEntry {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly a?: number
  readonly b?: number
  readonly c?: number
  /** Rotation of the work coordinates about the tool axis (Siemens `RT`, LinuxCNC `R`), radians. */
  readonly rotation?: number
}

export interface WorkOffsetTable {
  /** By `offsetKey`. */
  readonly entries: Readonly<Record<string, OffsetEntry>>
}

export const ZERO_OFFSET: OffsetEntry = { x: 0, y: 0, z: 0 }

export const emptyOffsetTable: WorkOffsetTable = { entries: {} }

export const getOffset = (table: WorkOffsetTable, ref: WorkOffsetRef): OffsetEntry => table.entries[offsetKey(ref)] ?? ZERO_OFFSET

export const withOffset = (table: WorkOffsetTable, ref: WorkOffsetRef, entry: OffsetEntry): WorkOffsetTable => ({
  entries: { ...table.entries, [offsetKey(ref)]: entry }
})

/** A point in the work coordinates of `entry` in machine coordinates: rotated about the tool axis, then shifted to the zero. */
export const workToMachine = (entry: OffsetEntry, p: Vec3): Vec3 => {
  const r = entry.rotation ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: entry.x + c * p.x - s * p.y, y: entry.y + s * p.x + c * p.y, z: entry.z + p.z }
}

export const machineToWork = (entry: OffsetEntry, p: Vec3): Vec3 => {
  const r = entry.rotation ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  const dx = p.x - entry.x, dy = p.y - entry.y
  return { x: c * dx + s * dy, y: -s * dx + c * dy, z: p.z - entry.z }
}

/** On the wire (machine config JSON, HTTP) the angles of an entry are degrees; the schema decodes them to radians. */
const OffsetEntryWire = Schema.Struct({
  x: Schema.Finite, y: Schema.Finite, z: Schema.Finite,
  a: Schema.optionalKey(Schema.Finite), b: Schema.optionalKey(Schema.Finite), c: Schema.optionalKey(Schema.Finite),
  rotation: Schema.optionalKey(Schema.Finite)
})
type OffsetEntryWire = typeof OffsetEntryWire.Type

const scaleAngles = (e: OffsetEntryWire, k: number): OffsetEntry => ({
  x: e.x, y: e.y, z: e.z,
  ...(e.a !== undefined ? { a: e.a * k } : {}), ...(e.b !== undefined ? { b: e.b * k } : {}), ...(e.c !== undefined ? { c: e.c * k } : {}),
  ...(e.rotation !== undefined ? { rotation: e.rotation * k } : {})
})

/** An entry as the wire carries it (degrees) to the core's (radians). */
export const offsetEntryFromWire = (e: OffsetEntryWire): OffsetEntry => scaleAngles(e, DEG)
export const offsetEntryToWire = (e: OffsetEntry): OffsetEntryWire => scaleAngles(e, 1 / DEG)

export const OffsetEntrySchema = OffsetEntryWire.pipe(Schema.decodeTo(Schema.toType(OffsetEntryWire), SchemaTransformation.transform({
  decode: offsetEntryFromWire,
  encode: offsetEntryToWire
})))

export const WorkOffsetTableSchema = Schema.Struct({
  entries: Schema.Record(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(24)), OffsetEntrySchema)
})

/** Keys of a table that do not parse as an offset reference (a table written by hand). */
export const tableProblems = (table: WorkOffsetTable): ReadonlyArray<string> =>
  Object.keys(table.entries).filter((k) => refOf(k) === undefined || offsetKey(refOf(k)!) !== k).map((k) => `'${k}' is not a work offset (G54, G54.1 P3, G505, G59.1, preset 4)`)

// ---------------------------------------------------------------- where a control keeps them

export type OffsetFamily = "fanuc" | "haas" | "mazak" | "mitsubishi" | "brother" | "okuma" | "siemens" | "heidenhain" | "linuxcnc" | "grbl"
export const OFFSET_FAMILIES: ReadonlyArray<OffsetFamily> = ["fanuc", "haas", "mazak", "mitsubishi", "brother", "okuma", "siemens", "heidenhain", "linuxcnc", "grbl"]

/** The offset axes a correction can address: linear, rotary, and `R` the rotation about the tool axis. */
export type OffsetAxis = "X" | "Y" | "Z" | "A" | "B" | "C" | "R"
export const OFFSET_AXES: ReadonlyArray<OffsetAxis> = ["X", "Y", "Z", "A", "B", "C", "R"]

/** How many offsets of each kind the control has (defaults per family when absent). */
export interface OffsetCapacity {
  /** Highest `G54.1 P` / `G154 P` number. */
  readonly extended?: number
  /** Highest Siemens settable frame. */
  readonly frames?: number
  /** Rows of the Heidenhain preset table. */
  readonly presets?: number
}

export const OffsetCapacitySchema = Schema.Struct({
  extended: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 300 }))),
  frames: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 4, maximum: 99 }))),
  presets: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99_999 })))
})

const DEFAULT_EXTENDED: Readonly<Record<OffsetFamily, number>> = { fanuc: 48, haas: 99, mazak: 48, mitsubishi: 48, brother: 48, okuma: 44, siemens: 0, heidenhain: 0, linuxcnc: 0, grbl: 0 }

export interface OffsetAddress {
  /** The block that makes the offset active (`G54`, `G54.1 P3`, `G154 P3`, `G15 H9`, `G505`, `G59.2`). */
  readonly select: string
  /** The variable holding an axis of the offset, in the control's words; undefined where the control keeps no such value. */
  readonly read: (axis: OffsetAxis) => string | undefined
  /**
   * How a probe program changes it: `variable` assigns `read(axis)`; `g10` writes `G10 L2 P<g10P>` (LinuxCNC); `native-only` the
   * control's own probing cycle writes it (Heidenhain presets); `l20-only` only `G10 L20` "the current position reads ..." (GRBL).
   */
  readonly write: "variable" | "g10" | "native-only" | "l20-only"
  readonly g10P?: number
  /** Siemens: a frame write takes effect only after the frame is selected again. */
  readonly reselect?: boolean
}

export type OffsetAddressResult = OffsetAddress | { readonly refused: string }

const LINEAR_INDEX: Readonly<Record<OffsetAxis, number | undefined>> = { X: 0, Y: 1, Z: 2, A: 3, B: 4, C: 5, R: undefined }

const fanucLike = (ref: WorkOffsetRef, family: OffsetFamily, capacity: OffsetCapacity | undefined): OffsetAddressResult => {
  const g5x = ref.kind === "g5x" ? ref.code : ref.kind === "linuxcnc" && ref.p <= 6 ? G5X[ref.p - 1]! : ref.kind === "frame" && ref.n <= 4 ? G5X[ref.n - 1]! : undefined
  // Rotary axes: the 4th and 5th axis of the offset (A/B/C in the machine's axis order), the 6th the 3rd rotary.
  const at = (base: number) => (axis: OffsetAxis): string | undefined => {
    const i = LINEAR_INDEX[axis]
    return i === undefined ? undefined : `#${base + i + 1}`
  }
  if (g5x !== undefined) {
    const n = G5X.indexOf(g5x) + 1
    return { select: g5x, read: at(5200 + 20 * n), write: "variable" }
  }
  if (ref.kind !== "extended") return { refused: `${family}: ${formatOffsetRef(ref)} is not a ${family} work offset (G54..G59 or ${family === "haas" ? "G154 P" : "G54.1 P"})` }
  const max = capacity?.extended ?? DEFAULT_EXTENDED[family]
  if (ref.p > max) return { refused: `${family}: the control has ${max} extended work offsets, not P${ref.p}` }
  const select = family === "haas" ? `G154 P${ref.p}` : `G54.1 P${ref.p}`
  const small = family === "haas" ? ref.p <= 20 : ref.p <= 48
  const base = (small ? 7000 : 14000) + 20 * (ref.p - 1)
  return { select, read: at(base), write: "variable" }
}

/**
 * Where `ref` lives on a control family: the selection block, the variable of each axis and how a program writes it, or the reason
 * the control has no such offset (Siemens G58 / G59 are programmable offsets, not settable frames; GRBL has no variables).
 */
export const addressOf = (ref: WorkOffsetRef, family: OffsetFamily, capacity?: OffsetCapacity): OffsetAddressResult => {
  switch (family) {
    case "fanuc": case "haas": case "mazak": case "mitsubishi": case "brother":
      return fanucLike(ref, family, capacity)
    case "okuma": {
      const h = ref.kind === "g5x" ? G5X.indexOf(ref.code) + 1 : ref.kind === "extended" ? 6 + ref.p : undefined
      if (h === undefined) return { refused: `okuma: ${formatOffsetRef(ref)} is not an OSP work coordinate (G15 H1..H50)` }
      const max = 6 + (capacity?.extended ?? DEFAULT_EXTENDED.okuma)
      if (h > max) return { refused: `okuma: the control has work coordinates H1..H${max}, not H${h}` }
      return { select: `G15 H${h}`, read: (axis) => (axis === "X" || axis === "Y" || axis === "Z" ? `VZOF${axis}[${h}]` : undefined), write: "variable" }
    }
    case "siemens": {
      if (ref.kind === "g5x" && (ref.code === "G58" || ref.code === "G59")) {
        return { refused: `siemens: ${ref.code} is a programmable axial offset on the 840D, not a settable frame: use G54..G57 or G505..G599` }
      }
      const n = ref.kind === "g5x" ? G5X.indexOf(ref.code) + 1 : ref.kind === "frame" ? ref.n : undefined
      if (n === undefined) return { refused: `siemens: ${formatOffsetRef(ref)} is not a settable frame (G54..G57, G505..G599)` }
      const max = capacity?.frames ?? 99
      if (n > max) return { refused: `siemens: the control has settable frames up to ${max}, not ${n}` }
      return {
        select: n <= 4 ? G5X[n - 1]! : `G${500 + n}`,
        read: (axis) => (axis === "R" ? `$P_UIFR[${n},Z,RT]` : `$P_UIFR[${n},${axis},TR]`),
        write: "variable",
        reselect: true
      }
    }
    case "heidenhain": {
      const row = ref.kind === "preset" ? ref.row : ref.kind === "g5x" ? G5X.indexOf(ref.code) + 1 : undefined
      if (row === undefined) return { refused: `heidenhain: ${formatOffsetRef(ref)} is not a preset table row` }
      const max = capacity?.presets
      if (max !== undefined && row > max) return { refused: `heidenhain: the preset table has ${max} rows, not ${row}` }
      return { select: `CYCL DEF 247 DATUM SETTING Q339=+${row}`, read: () => undefined, write: "native-only" }
    }
    case "linuxcnc": {
      const p = ref.kind === "g5x" ? G5X.indexOf(ref.code) + 1 : ref.kind === "linuxcnc" ? ref.p : undefined
      if (p === undefined) return { refused: `linuxcnc: ${formatOffsetRef(ref)} is not a coordinate system (G54..G59.3)` }
      return {
        select: formatOffsetRef({ kind: "linuxcnc", p }),
        // #5221.. X Y Z A B C U V W, #5230 R (rotation about Z, degrees).
        read: (axis) => `#${5200 + 20 * p + (axis === "R" ? 10 : LINEAR_INDEX[axis]! + 1)}`,
        write: "g10",
        g10P: p
      }
    }
    case "grbl": {
      const p = ref.kind === "g5x" ? G5X.indexOf(ref.code) + 1 : undefined
      if (p === undefined) return { refused: `grbl: ${formatOffsetRef(ref)} is not a GRBL coordinate system (G54..G59)` }
      return { select: ref.kind === "g5x" ? ref.code : "G54", read: () => undefined, write: "l20-only", g10P: p }
    }
  }
}

// ---------------------------------------------------------------- the update policy

export type UpdateMode = "set" | "report" | "update-within-tolerance" | "alarm-outside-tolerance"
export const UPDATE_MODES: ReadonlyArray<UpdateMode> = ["set", "report", "update-within-tolerance", "alarm-outside-tolerance"]

export interface UpdatePolicy {
  readonly mode: UpdateMode
  /** mm: the band `update-within-tolerance` writes in and `alarm-outside-tolerance` alarms beyond. */
  readonly tolerance?: number
  /** radians: the same for a rotation. */
  readonly angleTolerance?: number
  /** mm (radians for a rotation-only correction): a correction smaller than this is not written (`set`, `update-within-tolerance`). */
  readonly deadband?: number
  /** mm: a correction larger than this is a wrong datum or a crash, an alarm in every mode but `report`. */
  readonly limit?: number
}

const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const angle = Schema.Finite.pipe(Schema.decodeTo(Schema.Finite, SchemaTransformation.transform({ decode: (d: number) => d * DEG, encode: (r: number) => Number((r / DEG).toFixed(10)) })))

/** The policy on the wire; `angleTolerance` is in degrees there. */
export const UpdatePolicySchema = Schema.Struct({
  mode: Schema.Literals(UPDATE_MODES),
  tolerance: Schema.optionalKey(nonNegative),
  angleTolerance: Schema.optionalKey(angle.check(Schema.isGreaterThanOrEqualTo(0))),
  deadband: Schema.optionalKey(nonNegative),
  limit: Schema.optionalKey(nonNegative)
})

/** What is wrong with a policy, or undefined. */
export const policyProblem = (policy: UpdatePolicy): string | undefined => {
  if ((policy.mode === "update-within-tolerance" || policy.mode === "alarm-outside-tolerance") && policy.tolerance === undefined && policy.angleTolerance === undefined) {
    return `the update mode '${policy.mode}' needs a tolerance`
  }
  if (policy.deadband !== undefined && policy.tolerance !== undefined && policy.deadband > policy.tolerance) return "the deadband is larger than the tolerance: nothing would ever be written"
  if (policy.limit !== undefined && policy.tolerance !== undefined && policy.limit < policy.tolerance) return "the limit is smaller than the tolerance"
  return undefined
}

type Decision = { readonly write: boolean; readonly alarm: boolean; readonly reason: string }

const fmt = (v: number): string => v.toFixed(4)

/** The rule on one magnitude (`|delta|`, mm or radians) with the tolerance that applies to it. */
const decide = (m: number, policy: UpdatePolicy, tolerance: number | undefined, deadband: number | undefined, limit: number | undefined): Decision => {
  if (policy.mode === "report") return { write: false, alarm: false, reason: `report only: ${fmt(m)} measured, nothing written` }
  if (limit !== undefined && m > limit) return { write: false, alarm: true, reason: `${fmt(m)} is beyond the limit ${fmt(limit)}: a wrong datum or a crash, nothing written` }
  const tol = tolerance ?? Infinity
  switch (policy.mode) {
    case "set":
      if (deadband !== undefined && m < deadband) return { write: false, alarm: false, reason: `${fmt(m)} is inside the deadband ${fmt(deadband)}: not written` }
      return { write: true, alarm: false, reason: `set: ${fmt(m)} written` }
    case "update-within-tolerance":
      if (deadband !== undefined && m < deadband) return { write: false, alarm: false, reason: `${fmt(m)} is inside the deadband ${fmt(deadband)}: not written` }
      if (m > tol) return { write: false, alarm: false, reason: `${fmt(m)} is outside the tolerance ${fmt(tol)}: not written` }
      return { write: true, alarm: false, reason: `${fmt(m)} is within the tolerance ${fmt(tol)}: written` }
    case "alarm-outside-tolerance":
      if (m > tol) return { write: false, alarm: true, reason: `${fmt(m)} is outside the tolerance ${fmt(tol)}: alarm, nothing written` }
      return { write: true, alarm: false, reason: `${fmt(m)} is within the tolerance ${fmt(tol)}: written` }
  }
}

export interface Correction {
  readonly ref: WorkOffsetRef
  /** Change per axis: mm for X / Y / Z, radians for A / B / C / R. */
  readonly delta: Partial<Record<OffsetAxis, number>>
}

export interface CorrectionResult {
  readonly applied: boolean
  readonly alarm?: string
  readonly reason: string
  readonly table: WorkOffsetTable
}

const ENTRY_KEY: Readonly<Record<OffsetAxis, keyof OffsetEntry>> = { X: "x", Y: "y", Z: "z", A: "a", B: "b", C: "c", R: "rotation" }

/**
 * The policy applied to a correction: the linear part is judged on its length against `tolerance` / `deadband` / `limit`, the angular
 * part on its largest component against `angleTolerance`. An alarm on either part writes nothing; otherwise each part that passes is
 * added to the offset.
 */
export const applyCorrection = (table: WorkOffsetTable, correction: Correction, policy: UpdatePolicy): CorrectionResult => {
  const d = correction.delta
  const linear = (["X", "Y", "Z"] as const).some((a) => d[a] !== undefined)
  const angular = (["A", "B", "C", "R"] as const).some((a) => d[a] !== undefined)
  const lin = linear ? decide(Math.hypot(d.X ?? 0, d.Y ?? 0, d.Z ?? 0), policy, policy.tolerance, policy.deadband, policy.limit) : undefined
  const ang = angular ? decide(Math.max(...(["A", "B", "C", "R"] as const).map((a) => Math.abs(d[a] ?? 0))), policy, policy.angleTolerance, linear ? undefined : policy.deadband, undefined) : undefined
  const reason = [lin?.reason, ang === undefined ? undefined : `rotation ${ang.reason}`].filter((r): r is string => r !== undefined).join("; ") || "no correction"
  if (lin?.alarm === true || ang?.alarm === true) return { applied: false, alarm: reason, reason, table }
  const before = getOffset(table, correction.ref)
  let after: OffsetEntry = before
  let applied = false
  for (const axis of OFFSET_AXES) {
    const v = d[axis]
    if (v === undefined) continue
    const ok = axis === "X" || axis === "Y" || axis === "Z" ? lin?.write === true : ang?.write === true
    if (!ok) continue
    const key = ENTRY_KEY[axis]
    after = { ...after, [key]: ((after[key] as number | undefined) ?? 0) + v }
    applied = true
  }
  return { applied, reason, table: applied ? withOffset(table, correction.ref, after) : table }
}

/**
 * The same rule as IR conditions on a magnitude the control computes: alarm when `alarm` holds (checked first: an alarm stops the
 * program), then write when `write` holds (`true`: always; absent: never). One comparison each: the band `deadband <= m <= tol` is
 * `|m - mid| <= half`.
 */
export const policyCondition = (policy: UpdatePolicy, magnitude: Expr, tolerance: number | undefined = policy.tolerance): { readonly write?: Condition | true; readonly alarm?: Condition } => {
  if (policy.mode === "report") return {}
  const limit = policy.limit
  const tol = tolerance
  switch (policy.mode) {
    case "set": {
      const alarm = limit === undefined ? undefined : { cmp: "gt" as const, a: magnitude, b: num(limit) }
      const write = policy.deadband === undefined ? true : { cmp: "ge" as const, a: magnitude, b: num(policy.deadband) }
      return { write, ...(alarm !== undefined ? { alarm } : {}) }
    }
    case "update-within-tolerance": {
      const alarm = limit === undefined ? undefined : { cmp: "gt" as const, a: magnitude, b: num(limit) }
      const lo = policy.deadband ?? 0
      const hi = tol ?? Infinity
      const write: Condition | true = !Number.isFinite(hi)
        ? (lo > 0 ? { cmp: "ge", a: magnitude, b: num(lo) } : true)
        : lo > 0
          ? { cmp: "le", a: call("abs", binary("-", magnitude, num((lo + hi) / 2))), b: num((hi - lo) / 2) }
          : { cmp: "le", a: magnitude, b: num(hi) }
      return { write, ...(alarm !== undefined ? { alarm } : {}) }
    }
    case "alarm-outside-tolerance": {
      const bound = Math.min(tol ?? Infinity, limit ?? Infinity)
      return { write: true, ...(Number.isFinite(bound) ? { alarm: { cmp: "gt" as const, a: magnitude, b: num(bound) } } : {}) }
    }
  }
}
