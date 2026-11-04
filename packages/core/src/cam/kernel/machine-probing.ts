/**
 * The probing part of a machine profile (spec 73 §5.4): the spindle probe, the tool setter, the work-offset table the machine holds,
 * the rotary calibration, and how they become the kernel's records (`KernelProbing`, `ProbeSettings`, `WorkOffsetTable`).
 *
 * The profile is stored JSON in the shapes the library, the assistant and the catalogue write, so everything here is read field by
 * field and a field that does not read is left out (never guessed). Angles in the profile are degrees, the core's records radians.
 * The legacy `probing {cycles, stylusRadius, feed, dialect}` is kept as it was and still read: `stylusDiameter` wins over
 * `stylusRadius`, `feeds.touch` over `feed`.
 */
import { Schema } from "effect"
import type { Vec3 } from "../../cad/vec.ts"
import { DEFAULT_PROBE_SETTINGS, MACRO_STYLES, type KernelProbing, type MacroStyle, type ProbeDevice, type ProbeSettings, type ToolSetter } from "../probing/device.ts"
import { OffsetCapacitySchema, offsetEntryFromWire, offsetEntryToWire, parseOffsetRef, type OffsetCapacity, type OffsetEntry, type WorkOffsetRef, type WorkOffsetTable } from "../work-offset.ts"

const DEG = Math.PI / 180

/** A work offset as the profile stores it: mm, and degrees for the rotary and rotation parts. */
export interface OffsetEntryConfig {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly a?: number
  readonly b?: number
  readonly c?: number
  readonly rotation?: number
}

/** The work offsets the machine holds (decision §1 of spec 73: machine state, not project state). */
export interface MachineWorkOffsetTable {
  /** By offset key (`G54`, `G54.1 P3`, `G505`). */
  readonly entries: Readonly<Record<string, OffsetEntryConfig>>
  /** Values that only hold for one setup (by setup id), over `entries`. */
  readonly bySetup?: Readonly<Record<string, Readonly<Record<string, OffsetEntryConfig>>>>
}

/** The touch probe: what it can measure and how. Every field optional; angles are degrees. */
export interface MachineProbing {
  /** The cycles the control offers (legacy list of names). */
  readonly cycles?: readonly string[]
  /** Legacy: the radius of the stylus, mm. `stylusDiameter` wins when both are given. */
  readonly stylusRadius?: number
  /** Legacy: the feed the probe moves at, mm/min (`feeds.touch` wins). */
  readonly feed?: number
  /** Legacy: the dialect the probe reports in. */
  readonly dialect?: "linuxcnc" | "fanuc"
  readonly id?: string
  readonly stylusDiameter?: number
  readonly toolNumber?: number
  readonly stylusLength?: number
  readonly shankDiameter?: number
  readonly body?: { readonly diameter: number; readonly length: number }
  readonly feeds?: { readonly positioning?: number; readonly fast?: number; readonly touch?: number; readonly max?: number }
  readonly overtravel?: { readonly xy?: number; readonly z?: number }
  readonly backoff?: number
  readonly doubleTouch?: boolean
  /** Spindle orientation before probing, degrees. */
  readonly orientSpindle?: number
  readonly on?: readonly string[]
  readonly off?: readonly string[]
  readonly calibration?: {
    readonly effectiveRadius: number
    /** Effective radius by touch direction, `angle` degrees from +X. */
    readonly directional?: ReadonlyArray<{ readonly angle: number; readonly radius: number }>
    readonly zTrigger?: number
    readonly centreOffset?: { readonly x: number; readonly y: number }
    readonly calibratedAt?: string
  }
  readonly macroStyle?: MacroStyle
  readonly skipCode?: string
  readonly skipFrame?: "program" | "work"
  readonly tiltedPlane?: boolean
  readonly offsets?: OffsetCapacity
  readonly calibrationSource?: "baked" | "variables"
}

/** The tool setter on the table, machine coordinates (top-level `config.toolSetter`). */
export type MachineToolSetter = ToolSetter

/** What a rotary calibration measured (written by a calibration run, read by the kernel: `pivotMeasured` replaces `pivot`). */
export interface MachineRotaryCalibration {
  readonly pivotMeasured?: Vec3
  /** Measured unit direction of the axis. */
  readonly axisDirection?: Vec3
  /** Angle between the measured and the nominal axis, degrees. */
  readonly axisError?: number
  readonly rms?: number
  /** ISO 8601 date-time of the run. */
  readonly at: string
}

// ---------------------------------------------------------------- schemas (the canonical shape, wire units)

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const vec3 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
const blocks = Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120), Schema.isPattern(/^[^\r\n]*$/))).check(Schema.isMaxLength(8))

const PROBING_FIELDS = {
  cycles: Schema.Array(Schema.String),
  stylusRadius: positive,
  feed: positive,
  dialect: Schema.Literals(["linuxcnc", "fanuc"]),
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  stylusDiameter: positive,
  toolNumber: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 })),
  stylusLength: positive,
  shankDiameter: positive,
  body: Schema.Struct({ diameter: positive, length: positive }),
  feeds: Schema.Struct({ positioning: Schema.optionalKey(positive), fast: Schema.optionalKey(positive), touch: Schema.optionalKey(positive), max: Schema.optionalKey(positive) }),
  overtravel: Schema.Struct({ xy: Schema.optionalKey(positive), z: Schema.optionalKey(positive) }),
  backoff: positive,
  doubleTouch: Schema.Boolean,
  orientSpindle: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 360 })),
  on: blocks,
  off: blocks,
  calibration: Schema.Struct({
    effectiveRadius: positive,
    directional: Schema.optionalKey(Schema.Array(Schema.Struct({ angle: Schema.Finite, radius: positive })).check(Schema.isMaxLength(64))),
    zTrigger: Schema.optionalKey(Schema.Finite),
    centreOffset: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite })),
    calibratedAt: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(40)))
  }),
  macroStyle: Schema.Literals(MACRO_STYLES),
  skipCode: Schema.String.check(Schema.isPattern(/^G31(\.\d)?( P\d)?$|^G38\.[2-5]$/)),
  skipFrame: Schema.Literals(["program", "work"]),
  tiltedPlane: Schema.Boolean,
  offsets: OffsetCapacitySchema,
  calibrationSource: Schema.Literals(["baked", "variables"])
} as const

const optionalAll = <F extends Record<string, Schema.Top>>(fields: F): { readonly [K in keyof F]: Schema.optionalKey<F[K]> } =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Schema.optionalKey(v)])) as { readonly [K in keyof F]: Schema.optionalKey<F[K]> }

export const MachineProbingSchema = Schema.Struct(optionalAll(PROBING_FIELDS))

export const MachineToolSetterSchema = Schema.Struct({
  kind: Schema.Literals(["contact", "laser"]), position: vec3, triggerZ: Schema.Finite, discDiameter: Schema.optionalKey(positive),
  maxToolDiameter: positive, feeds: Schema.Struct({ fast: positive, touch: positive }), radiusRpm: Schema.optionalKey(positive), brokenTolerance: positive
})

const OffsetEntryConfigSchema = Schema.Struct({
  x: Schema.Finite, y: Schema.Finite, z: Schema.Finite,
  a: Schema.optionalKey(Schema.Finite), b: Schema.optionalKey(Schema.Finite), c: Schema.optionalKey(Schema.Finite), rotation: Schema.optionalKey(Schema.Finite)
})
const offsetKeySchema = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(24))

export const MachineWorkOffsetTableSchema = Schema.Struct({
  entries: Schema.Record(offsetKeySchema, OffsetEntryConfigSchema),
  bySetup: Schema.optionalKey(Schema.Record(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)), Schema.Record(offsetKeySchema, OffsetEntryConfigSchema)))
})

export const MachineRotaryCalibrationSchema = Schema.Struct({
  pivotMeasured: Schema.optionalKey(vec3),
  axisDirection: Schema.optionalKey(vec3),
  axisError: Schema.optionalKey(nonNegative),
  rms: Schema.optionalKey(nonNegative),
  at: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))
})

// ---------------------------------------------------------------- reading stored JSON

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** Each field that decodes on its own; the rest is dropped (a stored block with one bad figure keeps its good ones). */
const pick = <F extends Record<string, Schema.Top>>(fields: F, value: unknown): Record<string, unknown> => {
  const source = record(value)
  const out: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(fields)) {
    if (source[key] === undefined) continue
    const decoded = Schema.decodeUnknownOption(schema as Schema.Codec<unknown, unknown>)(source[key])
    if (decoded._tag === "Some") out[key] = decoded.value
  }
  return out
}

/** The probing block of a stored configuration, or undefined when it says nothing. */
export const probingOfConfig = (value: unknown): MachineProbing | undefined => {
  if (Object.keys(record(value)).length === 0) return undefined
  const picked = pick(PROBING_FIELDS, value) as MachineProbing
  return picked
}

export const toolSetterOfConfig = (value: unknown): MachineToolSetter | undefined => {
  const decoded = Schema.decodeUnknownOption(MachineToolSetterSchema)(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}

export const workOffsetTableOfConfig = (value: unknown): MachineWorkOffsetTable | undefined => {
  if (value === undefined) return undefined
  const decoded = Schema.decodeUnknownOption(MachineWorkOffsetTableSchema)(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}

export const rotaryCalibrationOfConfig = (value: unknown): MachineRotaryCalibration | undefined => {
  if (value === undefined) return undefined
  const decoded = Schema.decodeUnknownOption(MachineRotaryCalibrationSchema)(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}

// ---------------------------------------------------------------- into the core's records

/** The profile fields this module reads (so it needs no import of the profile module). */
export interface ProbingProfile {
  readonly post?: string
  readonly probing?: MachineProbing
  readonly toolSetter?: MachineToolSetter
  readonly workOffsetTable?: MachineWorkOffsetTable
  readonly workOffsets?: { readonly default?: string }
  readonly feed?: { readonly max: number }
}

/** The stylus diameter the profile states: `stylusDiameter`, else twice the legacy `stylusRadius`. */
export const stylusDiameterOf = (p: MachineProbing | undefined): number | undefined =>
  p?.stylusDiameter ?? (p?.stylusRadius !== undefined ? 2 * p.stylusRadius : undefined)

/** The spindle probe a profile describes, or undefined when it names no stylus. */
export const probeDeviceOfProfile = (profile: ProbingProfile): ProbeDevice | undefined => {
  const p = profile.probing
  const ball = stylusDiameterOf(p)
  if (p === undefined || ball === undefined) return undefined
  const d = DEFAULT_PROBE_SETTINGS
  const touch = p.feeds?.touch ?? p.feed ?? d.feed
  const fast = p.feeds?.fast ?? Math.max(touch, d.fastFeed)
  const positioning = p.feeds?.positioning ?? Math.max(fast, d.positioningFeed)
  const max = p.feeds?.max ?? Math.max(touch, fast, positioning)
  const cal = p.calibration
  return {
    id: p.id ?? "probe",
    toolNumber: p.toolNumber ?? 99,
    stylus: { ballDiameter: ball, length: p.stylusLength ?? 50, shankDiameter: p.shankDiameter ?? Math.min(ball, Math.max(1, ball * 0.6)) },
    body: p.body ?? { diameter: 40, length: 60 },
    ...(cal !== undefined
      ? {
        calibration: {
          ballDiameter: ball,
          effectiveRadius: cal.effectiveRadius,
          ...(cal.directional !== undefined ? { directional: cal.directional.map((e) => ({ angle: e.angle * DEG, radius: e.radius })) } : {}),
          ...(cal.zTrigger !== undefined ? { zTrigger: cal.zTrigger } : {}),
          ...(cal.centreOffset !== undefined ? { centreOffset: cal.centreOffset } : {}),
          ...(cal.calibratedAt !== undefined ? { calibratedAt: cal.calibratedAt } : {})
        }
      }
      : {}),
    overtravel: { xy: p.overtravel?.xy ?? d.overtravel, z: p.overtravel?.z ?? d.overtravel },
    feeds: { positioning, fast, touch, max },
    backoff: p.backoff ?? d.backoff,
    doubleTouch: p.doubleTouch ?? d.doubleTouch,
    ...(p.orientSpindle !== undefined ? { orientSpindle: p.orientSpindle * DEG } : {}),
    ...(p.on !== undefined ? { on: p.on } : {}),
    ...(p.off !== undefined ? { off: p.off } : {})
  }
}

const DEFAULT_SKIP_FRAME: Readonly<Record<string, "program" | "work">> = { siemens: "program", heidenhain: "program", fanuc: "work", haas: "work" }

/** What the machine offers for probing, or undefined when it has neither a probe nor a tool setter. */
export const kernelProbingOfProfile = (profile: ProbingProfile): KernelProbing | undefined => {
  const probe = probeDeviceOfProfile(profile)
  const setter = profile.toolSetter
  if (probe === undefined && setter === undefined) return undefined
  const p = profile.probing
  return {
    probes: probe === undefined ? [] : [probe],
    ...(setter !== undefined ? { toolSetter: setter } : {}),
    macroStyle: p?.macroStyle ?? "inline",
    ...(p?.skipCode !== undefined ? { skipCode: p.skipCode } : {}),
    skipFrame: p?.skipFrame ?? DEFAULT_SKIP_FRAME[profile.post ?? ""] ?? "program",
    tiltedPlane: p?.tiltedPlane ?? false,
    offsets: p?.offsets ?? {},
    calibrationSource: p?.calibrationSource ?? "baked"
  }
}

/**
 * Planning settings from the machine: the probe's stylus (the calibrated effective radius when there is one), its feeds, back-off and
 * double touch, the machine's default work offset; then `overrides` (a request's own values) win. Without a probe in the profile the
 * core defaults stand.
 */
export const settingsFromMachine = (profile: ProbingProfile | undefined, overrides: Partial<ProbeSettings> = {}): ProbeSettings => {
  const d = DEFAULT_PROBE_SETTINGS
  const device = profile === undefined ? undefined : probeDeviceOfProfile(profile)
  const offset = profile?.workOffsets?.default !== undefined ? parseOffsetRef(profile.workOffsets.default) : undefined
  const fromMachine: Partial<ProbeSettings> = device === undefined ? {} : {
    stylusDiameter: device.stylus.ballDiameter,
    feed: device.feeds.touch,
    fastFeed: device.feeds.fast,
    positioningFeed: device.feeds.positioning,
    overtravel: Math.min(device.overtravel.xy, device.overtravel.z),
    backoff: device.backoff,
    doubleTouch: device.doubleTouch,
    toolNumber: device.toolNumber,
    ...(device.calibration !== undefined ? { effectiveRadius: device.calibration.effectiveRadius } : {}),
    ...(device.orientSpindle !== undefined ? { orientSpindle: device.orientSpindle } : {})
  }
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) as Partial<ProbeSettings>
  return { ...d, ...(offset !== undefined ? { workOffset: offset } : {}), ...fromMachine, ...defined }
}

/** The machine's work-offset table for a setup (its own values over the machine's), in core units. */
export const workOffsetTableOf = (profile: ProbingProfile, setupId?: string): WorkOffsetTable => {
  const t = profile.workOffsetTable
  if (t === undefined) return { entries: {} }
  const merged = { ...t.entries, ...(setupId !== undefined ? t.bySetup?.[setupId] ?? {} : {}) }
  return { entries: Object.fromEntries(Object.entries(merged).map(([k, e]) => [k, offsetEntryFromWire(e)])) }
}

/** The stored table with `table` written for the machine (no `setupId`) or for one setup, in profile units. */
export const withWorkOffsetTable = (stored: MachineWorkOffsetTable | undefined, table: WorkOffsetTable, setupId?: string): MachineWorkOffsetTable => {
  const wire: Record<string, OffsetEntryConfig> = Object.fromEntries(Object.entries(table.entries).map(([k, e]) => [k, offsetEntryToWire(e as OffsetEntry)]))
  if (setupId === undefined) return { entries: wire, ...(stored?.bySetup !== undefined ? { bySetup: stored.bySetup } : {}) }
  return { entries: stored?.entries ?? {}, bySetup: { ...(stored?.bySetup ?? {}), [setupId]: wire } }
}

/** One offset of the machine's table as the probe cycle's reference reads it (undefined when the key does not parse). */
export const offsetRefOfKey = (key: string): WorkOffsetRef | undefined => parseOffsetRef(key)
