/**
 * The machine profile: what a machine configuration *means*, whatever shape it was written in.
 *
 * A machine configuration is one fact that reaches the kernel from three directions: the Resources form, the assistant's
 * `library_edit.upsert_machine_config` and the built-in catalogue. They wrote it in three different shapes, and the kernel
 * read only one of them — so a machine the assistant configured was refused by the kernel it was configured for. This
 * module is the one place that knows the shapes: `profileOfConfig` reads any of them into a single `MachineProfile`, and
 * `configOfProfile` writes the canonical one back. Nothing else has to know that the wild was once tamed.
 *
 * The profile is a *description*, not a claim: a field that is absent says "the machine does not say", never a default
 * the kernel would then plan against. What the kernel can act on it takes from the profile; what it cannot is refused or
 * reported, never guessed.
 */
import { Schema } from "effect"
import { CoolantSchema, WorkOffsetSchema, type Coolant, type WorkOffset } from "../ir.ts"
import type { PostId } from "../post/types.ts"
import type { Rigidity } from "./cutting-data.ts"

/** The post ids the kernel can write; the controller's name picks one when the profile does not name it. */
export const POST_IDS = ["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain"] as const

/**
 * The controllers the kernel has a post for, and the control families that speak one of them. A controller's name picks
 * the post that writes its NC; an unknown control gets the plain ISO post, never a silent mismatch.
 */
const POSTS: Readonly<Record<string, (typeof POST_IDS)[number]>> = {
  fanuc: "fanuc", "fanuc 0i": "fanuc", "fanuc 0i-md": "fanuc", mazatrol: "fanuc", smoothai: "fanuc", mazak: "fanuc",
  haas: "haas", grbl: "grbl", linuxcnc: "generic", generic: "generic", iso: "generic",
  sinumerik: "siemens", "840d": "siemens", siemens: "siemens",
  osp: "fanuc", okuma: "fanuc", doosan: "fanuc", dmgmori: "fanuc", dmu: "fanuc",
  heidenhain: "heidenhain", tnc: "heidenhain", tnc7: "heidenhain", klartext: "heidenhain"
}

/** The post a controller's name asks for; an unknown control gets the plain ISO post, never a silent mismatch. */
export const postOfController = (controller: string | undefined): (typeof POST_IDS)[number] => {
  const key = (controller ?? "").trim().toLowerCase()
  if (key === "") return "generic"
  const direct = POSTS[key]
  if (direct !== undefined) return direct
  const partial = Object.entries(POSTS).find(([name]) => name !== "" && key.includes(name))
  return partial?.[1] ?? "generic"
}

/** The kinds of machine the library knows; the kernel machines the mill and the lathe. */
export const MACHINE_KINDS = ["mill", "lathe", "printer", "laser"] as const
export type MachineKind = (typeof MACHINE_KINDS)[number]

/** The axis names a machine can have. A, B and C are the rotary ones; U, V and W the linear tables. */
export const AXIS_IDS = ["X", "Y", "Z", "A", "B", "C", "U", "V", "W"] as const
export type AxisId = (typeof AXIS_IDS)[number]

/** One axis of the machine: what it moves, how far, and which way its positive word points. */
export interface MachineAxis {
  readonly id: AxisId
  /** A linear axis travels in millimetres; a rotary one in degrees. */
  readonly kind: "linear" | "rotary"
  /** The lowest position of the axis, in its own unit. */
  readonly min: number
  /** The highest position of the axis, in its own unit. */
  readonly max: number
  /** +1 when the positive word moves the axis the positive way, -1 when it is reversed. */
  readonly sense: 1 | -1
  /** A rotary axis that turns without end (a C spindle) rather than indexing. */
  readonly continuous?: boolean
}

/** The spindle: what it turns at, and how hard it can work. */
export interface MachineSpindle {
  /** The highest programmable speed, rpm. */
  readonly maxRpm: number
  /** The lowest programmable speed, rpm. */
  readonly minRpm?: number
  /** The power the spindle can deliver, kW. */
  readonly powerKw?: number
  /** The torque the spindle can deliver at the low end, N·m. */
  readonly torqueNm?: number
  /** The spindle efficiency between the motor and the cut, 0..1. */
  readonly efficiency?: number
  /**
   * The power available by speed band: the spindle holds `kW` up to `rpm`, and the next band takes over above it. A real
   * spindle is constant-power to its base speed and constant-torque above it, so one number overstates the high end.
   */
  readonly powerCurve?: ReadonlyArray<{ readonly rpm: number; readonly kW: number }>
}

/** The feeds the machine takes, mm/min. */
export interface MachineFeed {
  /** The highest programmable cutting feed. */
  readonly max: number
  /** The rapid traverse rate, mm/min. */
  readonly rapid?: number
}

/** The travel of the machine in work coordinates, mm. */
export interface MachineTravel {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/** The table the spindle must clear: its footprint and the gap under the stock. */
export interface MachineTable {
  readonly length: number
  readonly width: number
  readonly gap: number
}

/** The rotary table of a 4/5-axis machine. */
export interface MachineRotary {
  /** Which axes the table turns about: A and C, or B and C. */
  readonly layout: "table-AC" | "table-BC"
  /** The tilt range, degrees; absent on a table that only indexes about C. */
  readonly tilt?: { readonly min: number; readonly max: number }
  /** The rotation range about C, degrees. */
  readonly rotation?: { readonly min: number; readonly max: number }
  /** The centre of rotation of the table in the work frame, mm. */
  readonly pivot?: { readonly x: number; readonly y: number; readonly z: number }
  /** `control`: the control applies the tool centre point; `program`: the program is in machine coordinates. */
  readonly tcp?: "control" | "program"
}

/** What a turning centre holds and turns. */
export interface MachineTurning {
  /** Largest bar the chuck takes, mm. */
  readonly maxBarDiameter?: number
  /** Longest bar the machine takes, mm. */
  readonly maxBarLength?: number
  readonly chuckDiameter?: number
  /** B head range, degrees; absent on a lathe without a tilting head. */
  readonly b?: { readonly min: number; readonly max: number }
  /** C spindle indexing range, degrees. */
  readonly c?: { readonly min: number; readonly max: number }
  /** The C spindle turns on without end. */
  readonly continuousC?: boolean
  /** Y travel of a mill-turn centre, mm. */
  readonly yTravel?: number
  /** Where the turret sits. */
  readonly turret?: "rear" | "front"
}

/** The work offsets the control has, and the one the machine starts in. */
export interface MachineWorkOffsets {
  /** The offsets the control can address. */
  readonly available: readonly WorkOffset[]
  /** The offset the machine is in when the program starts. */
  readonly default?: WorkOffset
}

/** The touch probe: what it can measure and how. */
export interface MachineProbing {
  /** The cycles the control offers (surface, edge, corner, bore, boss, tool length). */
  readonly cycles?: readonly string[]
  /** The radius of the stylus, mm. */
  readonly stylusRadius?: number
  /** The feed the probe moves at, mm/min. */
  readonly feed?: number
  /** The dialect the probe reports in: linuxcnc/grbl style G38.2, or Fanuc style G31. */
  readonly dialect?: "linuxcnc" | "fanuc"
}

/** The tool changer: what it holds and how long a change takes. */
export interface MachineToolChanger {
  /** The kind of changer: manual, carousel, chain, umbrella or rack. */
  readonly type?: "manual" | "carousel" | "chain" | "umbrella" | "rack"
  /** How many tools the magazine holds. */
  readonly capacity?: number
  /** Seconds a tool change takes. */
  readonly changeSeconds?: number
  /** Largest tool the machine takes, mm. */
  readonly maxToolDiameter?: number
  /** Longest tool the machine takes, mm. */
  readonly maxToolLength?: number
}

/** The coolant the machine can deliver. */
export interface MachineCoolant {
  /** The modes the machine has: flood, mist, or neither. */
  readonly modes: readonly Coolant[]
}

/** How accurately the machine holds a position. */
export interface MachineAccuracy {
  /** The positioning accuracy, mm: the deviation a move can carry on its own. */
  readonly positioningMm?: number
  /** The repeatability, mm. */
  readonly repeatabilityMm?: number
  /** The runout of the spindle, mm. */
  readonly runoutMm?: number
}

/** Where the machine's figures come from. */
export interface MachineReference {
  /** The catalogue, brochure or measurement the figures come from. */
  readonly source?: string
  /** What the figures assume (the datum, the calibration, the table). */
  readonly notes?: string
}

/** What a filament printer is: the plate, the nozzle, the filament, the limits and the firmware. */
export interface MachinePrinter {
  /** `FDM` / `FFF` prints with filament; a resin printer (`MSLA`, `SLA`, `DLP`) is another process. */
  readonly technology?: string
  /** The plate, mm; `center` puts X0 Y0 in the middle (delta printers). */
  readonly bed?: { readonly width: number; readonly depth: number; readonly origin?: "corner" | "center" }
  /** The tallest print, mm. */
  readonly buildHeight?: number
  readonly nozzleDiameter?: number
  readonly filamentDiameter?: number
  readonly maxNozzleTemperature?: number
  readonly maxBedTemperature?: number
  /** The highest print speed, mm/s. */
  readonly maxSpeed?: number
  readonly kinematics?: "cartesian" | "corexy" | "bed-slinger" | "delta"
  readonly flavor?: "marlin" | "klipper" | "reprap"
  readonly extruder?: "direct" | "bowden"
}

/**
 * The fields a machine configuration may carry: the canonical ones and the legacy spellings that are still written.
 * Everything is optional, because a configuration says what the machine is and leaves the rest out.
 */
export type MachineConfigFields = Partial<Omit<MachineProfile, "kind" | "extra">> & {
  readonly kind?: MachineKind
  /** The legacy bag of figures the older shapes wrote their details into. */
  readonly additionalSettings?: Readonly<Record<string, unknown>>
  readonly [key: string]: unknown
}

/**
 * A machine, as one record. Every field the library, the assistant or the catalogue wrote is read into this shape, and
 * this is the shape the kernel plans against.
 */
export interface MachineProfile {
  /** What kind of machine it is. */
  readonly kind: MachineKind
  /** The control, in the shop's words ("Fanuc 0i-MD", "Heidenhain TNC7"). */
  readonly controller?: string
  /** The post that writes the NC, when the controller's name does not decide it. */
  readonly post?: PostId
  /** How many axes the machine has. */
  readonly axes?: 3 | 4 | 5 | 6
  /** Each axis and its travel, when the machine says. */
  readonly axisTable?: readonly MachineAxis[]
  readonly spindle?: MachineSpindle
  readonly feed?: MachineFeed
  /** How rigid the machine is: it scales the depth and the feed the cutting data may take. */
  readonly rigidity?: Rigidity
  /** The space the part takes, mm. It is not the travel of the machine. */
  readonly workVolume?: { readonly x: number; readonly y: number; readonly z: number }
  /** The travel of the machine in work coordinates, mm. */
  readonly travel?: MachineTravel
  readonly table?: MachineTable
  readonly rotary?: MachineRotary
  readonly turning?: MachineTurning
  readonly workOffsets?: MachineWorkOffsets
  readonly probing?: MachineProbing
  readonly toolChanger?: MachineToolChanger
  readonly coolant?: MachineCoolant
  readonly accuracy?: MachineAccuracy
  readonly reference?: MachineReference
  /** Present on a printer. */
  readonly printer?: MachinePrinter
  /** What the configuration carried that this profile does not name, kept as it was written. */
  readonly extra: Readonly<Record<string, unknown>>
}

// ---------------------------------------------------------------- the canonical shape, as a schema

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const unit = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
const range = Schema.Struct({ min: Schema.Finite, max: Schema.Finite })

export const MachineAxisSchema = Schema.Struct({
  id: Schema.Literals(AXIS_IDS),
  kind: Schema.Literals(["linear", "rotary"]),
  min: Schema.Finite,
  max: Schema.Finite,
  sense: Schema.Literals([1, -1]),
  continuous: Schema.optionalKey(Schema.Boolean)
})

export const MachineProfileSchema = Schema.Struct({
  kind: Schema.Literals(MACHINE_KINDS),
  controller: Schema.optionalKey(Schema.String),
  post: Schema.optionalKey(Schema.Literals(POST_IDS)),
  axes: Schema.optionalKey(Schema.Literals([3, 4, 5, 6])),
  axisTable: Schema.optionalKey(Schema.Array(MachineAxisSchema)),
  spindle: Schema.optionalKey(Schema.Struct({
    maxRpm: positive,
    minRpm: Schema.optionalKey(positive),
    powerKw: Schema.optionalKey(nonNegative),
    torqueNm: Schema.optionalKey(nonNegative),
    efficiency: Schema.optionalKey(unit),
    powerCurve: Schema.optionalKey(Schema.Array(Schema.Struct({ rpm: positive, kW: positive })))
  })),
  feed: Schema.optionalKey(Schema.Struct({ max: positive, rapid: Schema.optionalKey(positive) })),
  rigidity: Schema.optionalKey(Schema.Literals(["hobby", "light", "standard", "heavy"])),
  workVolume: Schema.optionalKey(Schema.Struct({ x: positive, y: positive, z: positive })),
  travel: Schema.optionalKey(Schema.Struct({
    minX: Schema.Finite, maxX: Schema.Finite, minY: Schema.Finite, maxY: Schema.Finite, minZ: Schema.Finite, maxZ: Schema.Finite
  })),
  table: Schema.optionalKey(Schema.Struct({ length: positive, width: positive, gap: nonNegative })),
  rotary: Schema.optionalKey(Schema.Struct({
    layout: Schema.Literals(["table-AC", "table-BC"]),
    tilt: Schema.optionalKey(range),
    rotation: Schema.optionalKey(range),
    pivot: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })),
    tcp: Schema.optionalKey(Schema.Literals(["control", "program"]))
  })),
  turning: Schema.optionalKey(Schema.Struct({
    maxBarDiameter: Schema.optionalKey(nonNegative),
    maxBarLength: Schema.optionalKey(nonNegative),
    chuckDiameter: Schema.optionalKey(nonNegative),
    b: Schema.optionalKey(range),
    c: Schema.optionalKey(range),
    continuousC: Schema.optionalKey(Schema.Boolean),
    yTravel: Schema.optionalKey(positive),
    turret: Schema.optionalKey(Schema.Literals(["rear", "front"]))
  })),
  workOffsets: Schema.optionalKey(Schema.Struct({
    available: Schema.Array(WorkOffsetSchema),
    default: Schema.optionalKey(WorkOffsetSchema)
  })),
  probing: Schema.optionalKey(Schema.Struct({
    cycles: Schema.optionalKey(Schema.Array(Schema.String)),
    stylusRadius: Schema.optionalKey(positive),
    feed: Schema.optionalKey(positive),
    dialect: Schema.optionalKey(Schema.Literals(["linuxcnc", "fanuc"]))
  })),
  toolChanger: Schema.optionalKey(Schema.Struct({
    type: Schema.optionalKey(Schema.Literals(["manual", "carousel", "chain", "umbrella", "rack"])),
    capacity: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
    changeSeconds: Schema.optionalKey(nonNegative),
    maxToolDiameter: Schema.optionalKey(positive),
    maxToolLength: Schema.optionalKey(positive)
  })),
  coolant: Schema.optionalKey(Schema.Struct({ modes: Schema.Array(CoolantSchema) })),
  accuracy: Schema.optionalKey(Schema.Struct({
    positioningMm: Schema.optionalKey(nonNegative),
    repeatabilityMm: Schema.optionalKey(nonNegative),
    runoutMm: Schema.optionalKey(nonNegative)
  })),
  reference: Schema.optionalKey(Schema.Struct({
    source: Schema.optionalKey(Schema.String),
    notes: Schema.optionalKey(Schema.String)
  })),
  printer: Schema.optionalKey(Schema.Struct({
    technology: Schema.optionalKey(Schema.String),
    bed: Schema.optionalKey(Schema.Struct({ width: positive, depth: positive, origin: Schema.optionalKey(Schema.Literals(["corner", "center"])) })),
    buildHeight: Schema.optionalKey(positive),
    nozzleDiameter: Schema.optionalKey(positive),
    filamentDiameter: Schema.optionalKey(positive),
    maxNozzleTemperature: Schema.optionalKey(positive),
    maxBedTemperature: Schema.optionalKey(nonNegative),
    maxSpeed: Schema.optionalKey(positive),
    kinematics: Schema.optionalKey(Schema.Literals(["cartesian", "corexy", "bed-slinger", "delta"])),
    flavor: Schema.optionalKey(Schema.Literals(["marlin", "klipper", "reprap"])),
    extruder: Schema.optionalKey(Schema.Literals(["direct", "bowden"]))
  })),
  extra: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
})
export type MachineProfileSchema = typeof MachineProfileSchema

// ---------------------------------------------------------------- reading the shapes that exist

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const numberOf = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const rangeOf = (value: unknown): { readonly min: number; readonly max: number } | undefined => {
  const source = record(value)
  const min = numberOf(source["min"])
  const max = numberOf(source["max"])
  return min !== undefined && max !== undefined && min <= max ? { min, max } : undefined
}

const pointOf = (value: unknown): { readonly x: number; readonly y: number; readonly z: number } | undefined => {
  const source = record(value)
  const x = numberOf(source["x"]), y = numberOf(source["y"]), z = numberOf(source["z"])
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined
}

const stringsOf = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined

const kindOf = (value: unknown): MachineKind | undefined => {
  const key = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (key === "mill" || key === "lathe" || key === "laser") return key
  if (key === "printer" || key === "3dprinter" || key === "3-d-printer" || key === "fff" || key === "additive") return "printer"
  return undefined
}

/** The axis table a configuration carries, in either of the two shapes it was written in. */
const axesOf = (config: Record<string, unknown>, extra: Record<string, unknown>): readonly MachineAxis[] | undefined => {
  const table = config["axisTable"]
  if (Array.isArray(table)) {
    const axes = table.flatMap((entry): MachineAxis[] => {
      const source = record(entry)
      const id = typeof source["id"] === "string" ? source["id"].trim().toUpperCase() : ""
      if (!(AXIS_IDS as readonly string[]).includes(id)) return []
      const kind = source["kind"] === "rotary" ? "rotary" : "linear"
      const min = numberOf(source["min"])
      const max = numberOf(source["max"])
      if (min === undefined || max === undefined || min > max) return []
      const sense = numberOf(source["sense"]) === -1 ? -1 : 1
      return [{ id: id as AxisId, kind, min, max, sense, ...(source["continuous"] === true ? { continuous: true } : {}) }]
    })
    return axes.length > 0 ? axes : undefined
  }
  // The assistant's shape: a record of axis name to `{ min, max }`, or to the plain travel of the axis.
  const kinematics = record(config["kinematics"])
  const axes = Object.entries(kinematics).flatMap(([name, value]): MachineAxis[] => {
    const id = name.trim().toUpperCase()
    if (!(AXIS_IDS as readonly string[]).includes(id)) return []
    const travel = rangeOf(value) ?? (() => {
      const size = numberOf(value)
      return size !== undefined && size > 0 ? { min: 0, max: size } : undefined
    })()
    if (travel === undefined) return []
    return [{ id: id as AxisId, kind: "XYZ".includes(id) ? "linear" : "rotary", min: travel.min, max: travel.max, sense: 1 }]
  })
  if (axes.length > 0) return axes
  // The legacy travel box: the three linear axes, when the configuration carries one.
  const travel = travelOf(config, extra)
  if (travel === undefined) return undefined
  return [
    { id: "X", kind: "linear", min: travel.minX, max: travel.maxX, sense: 1 },
    { id: "Y", kind: "linear", min: travel.minY, max: travel.maxY, sense: 1 },
    { id: "Z", kind: "linear", min: travel.minZ, max: travel.maxZ, sense: 1 }
  ]
}

const travelOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineTravel | undefined => {
  const source = record(config["travel"])["minX"] === undefined ? record(extra["travel"]) : record(config["travel"])
  const minX = numberOf(source["minX"]), maxX = numberOf(source["maxX"])
  const minY = numberOf(source["minY"]), maxY = numberOf(source["maxY"])
  const minZ = numberOf(source["minZ"]), maxZ = numberOf(source["maxZ"])
  if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined || minZ === undefined || maxZ === undefined) return undefined
  if (minX > maxX || minY > maxY || minZ > maxZ) return undefined
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/**
 * The travel of the machine read from its axis table: the linear axes give the box the moves are checked against. A
 * configuration that names its axes but no travel box still bounds the program.
 */
const travelOfAxes = (axes: readonly MachineAxis[] | undefined): MachineTravel | undefined => {
  if (axes === undefined) return undefined
  const x = axes.find((axis) => axis.id === "X")
  const y = axes.find((axis) => axis.id === "Y")
  const z = axes.find((axis) => axis.id === "Z")
  if (x === undefined || y === undefined || z === undefined) return undefined
  if (x.kind !== "linear" || y.kind !== "linear" || z.kind !== "linear") return undefined
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max, minZ: z.min, maxZ: z.max }
}

const tableOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineTable | undefined => {
  const source = record(config["table"])["length"] === undefined ? record(extra["table"]) : record(config["table"])
  const length = numberOf(source["length"]), width = numberOf(source["width"]), gap = numberOf(source["gap"])
  if (length === undefined || width === undefined || gap === undefined) return undefined
  return { length, width, gap }
}

const rotaryOf = (config: Record<string, unknown>): MachineRotary | undefined => {
  const source = record(config["rotary"])
  const layout = source["layout"] === "table-BC" ? "table-BC" : source["layout"] === "table-AC" ? "table-AC" : undefined
  if (layout === undefined) return undefined
  const tilt = rangeOf(source["tilt"])
  const rotation = rangeOf(source["rotation"])
  const pivot = pointOf(source["pivot"])
  const tcp = source["tcp"] === "program" ? "program" : source["tcp"] === "control" ? "control" : undefined
  return {
    layout,
    ...(tilt !== undefined ? { tilt } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(pivot !== undefined ? { pivot } : {}),
    ...(tcp !== undefined ? { tcp } : {})
  }
}

const turningOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineTurning | undefined => {
  const source = record(config["turning"])
  const pick = (key: string, legacy: string): number | undefined =>
    numberOf(source[key]) ?? numberOf(extra[legacy])
  const maxBarDiameter = pick("maxBarDiameter", "maxBarDiameter")
  const maxBarLength = pick("maxBarLength", "maxBarLength")
  const chuckDiameter = pick("chuckDiameter", "chuckDiameter")
  const b = rangeOf(source["b"]) ?? rangeOf(extra["b"])
  const c = rangeOf(source["c"]) ?? rangeOf(extra["c"])
  const continuousC = source["continuousC"] === true || extra["continuousC"] === true ? true : undefined
  const yTravel = pick("yTravel", "yTravel")
  const turret = source["turret"] === "front" || extra["turret"] === "front" ? "front" : source["turret"] === "rear" || extra["turret"] === "rear" ? "rear" : undefined
  if (maxBarDiameter === undefined && maxBarLength === undefined && chuckDiameter === undefined && b === undefined && c === undefined && continuousC === undefined && yTravel === undefined && turret === undefined) {
    return undefined
  }
  return {
    ...(maxBarDiameter !== undefined ? { maxBarDiameter } : {}),
    ...(maxBarLength !== undefined ? { maxBarLength } : {}),
    ...(chuckDiameter !== undefined ? { chuckDiameter } : {}),
    ...(b !== undefined ? { b } : {}),
    ...(c !== undefined ? { c } : {}),
    ...(continuousC !== undefined ? { continuousC } : {}),
    ...(yTravel !== undefined ? { yTravel } : {}),
    ...(turret !== undefined ? { turret } : {})
  }
}

const probingOf = (config: Record<string, unknown>): MachineProbing | undefined => {
  const source = record(config["probing"])
  if (Object.keys(source).length === 0) return undefined
  const cycles = stringsOf(source["cycles"])
  const stylusRadius = numberOf(source["stylusRadius"])
  const feed = numberOf(source["feed"])
  const dialect = source["dialect"] === "fanuc" ? "fanuc" : source["dialect"] === "linuxcnc" ? "linuxcnc" : undefined
  return {
    ...(cycles !== undefined && cycles.length > 0 ? { cycles } : {}),
    ...(stylusRadius !== undefined ? { stylusRadius } : {}),
    ...(feed !== undefined ? { feed } : {}),
    ...(dialect !== undefined ? { dialect } : {})
  }
}

const toolChangerOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineToolChanger | undefined => {
  const source = record(config["toolChanger"])
  const type = ["manual", "carousel", "chain", "umbrella", "rack"].find((entry) => source["type"] === entry) as MachineToolChanger["type"] | undefined
  const capacity = numberOf(source["capacity"])
  const changeSeconds = numberOf(source["changeSeconds"]) ?? numberOf(extra["toolChangeSeconds"])
  const maxToolDiameter = numberOf(source["maxToolDiameter"])
  const maxToolLength = numberOf(source["maxToolLength"])
  if (type === undefined && capacity === undefined && changeSeconds === undefined && maxToolDiameter === undefined && maxToolLength === undefined) {
    return undefined
  }
  return {
    ...(type !== undefined ? { type } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(changeSeconds !== undefined ? { changeSeconds } : {}),
    ...(maxToolDiameter !== undefined ? { maxToolDiameter } : {}),
    ...(maxToolLength !== undefined ? { maxToolLength } : {})
  }
}

const coolantOf = (config: Record<string, unknown>): MachineCoolant | undefined => {
  const source = record(config["coolant"])
  const modes = stringsOf(source["modes"])?.filter((mode): mode is Coolant => mode === "off" || mode === "flood" || mode === "mist")
  return modes !== undefined && modes.length > 0 ? { modes } : undefined
}

const printerOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachinePrinter | undefined => {
  const block = record(config["printer"])
  const pick = (key: string): unknown => block[key] ?? config[key] ?? extra[key]
  const technology = typeof pick("technology") === "string" ? (pick("technology") as string).trim() : undefined
  const bedSource = record(block["bed"])
  const volume = pointOf(config["workVolume"])
  const width = numberOf(bedSource["width"]) ?? numberOf(config["bedWidth"]) ?? volume?.x
  const depth = numberOf(bedSource["depth"]) ?? numberOf(config["bedDepth"]) ?? volume?.y
  const buildHeight = numberOf(block["buildHeight"]) ?? numberOf(config["buildHeight"]) ?? volume?.z
  const originWord = bedSource["origin"] ?? config["bedOrigin"]
  const kinematicsWord = typeof pick("kinematics") === "string" ? (pick("kinematics") as string).trim().toLowerCase() : undefined
  const kinematics = kinematicsWord === "cartesian" || kinematicsWord === "corexy" || kinematicsWord === "bed-slinger" || kinematicsWord === "delta" ? kinematicsWord : undefined
  const origin = originWord === "center" || originWord === "corner" ? originWord : kinematics === "delta" ? "center" : undefined
  const controller = typeof config["controller"] === "string" ? config["controller"].toLowerCase() : ""
  const flavorWord = typeof block["flavor"] === "string" ? block["flavor"].toLowerCase() : controller
  const flavor = flavorWord.includes("klipper") ? "klipper" : flavorWord.includes("reprap") || flavorWord.includes("duet") ? "reprap" : flavorWord.includes("marlin") ? "marlin" : undefined
  const extruderWord = pick("extruder")
  const extruder = extruderWord === "direct" || extruderWord === "bowden" ? extruderWord : undefined
  const nozzleDiameter = numberOf(pick("nozzleDiameter"))
  const filamentDiameter = numberOf(pick("filamentDiameter"))
  const maxNozzleTemperature = numberOf(block["maxNozzleTemperature"]) ?? numberOf(config["maxTemperature"]) ?? numberOf(extra["maxTemperature"])
  const maxBedTemperature = numberOf(block["maxBedTemperature"]) ?? numberOf(config["maxBedTemperature"])
  // The library's `maxFeedRate` is a print speed in mm/s (150 for a desktop printer); a figure over 1000 is mm/min.
  const rate = numberOf(block["maxSpeed"]) ?? numberOf(config["maxFeedRate"])
  const maxSpeed = rate === undefined ? undefined : rate > 1000 ? rate / 60 : rate
  if (technology === undefined && width === undefined && buildHeight === undefined && nozzleDiameter === undefined && filamentDiameter === undefined && maxNozzleTemperature === undefined && maxSpeed === undefined && kinematics === undefined && flavor === undefined) return undefined
  return {
    ...(technology !== undefined ? { technology } : {}),
    ...(width !== undefined && depth !== undefined ? { bed: { width, depth, ...(origin !== undefined ? { origin } : {}) } } : {}),
    ...(buildHeight !== undefined ? { buildHeight } : {}),
    ...(nozzleDiameter !== undefined ? { nozzleDiameter } : {}),
    ...(filamentDiameter !== undefined ? { filamentDiameter } : {}),
    ...(maxNozzleTemperature !== undefined ? { maxNozzleTemperature } : {}),
    ...(maxBedTemperature !== undefined ? { maxBedTemperature } : {}),
    ...(maxSpeed !== undefined ? { maxSpeed } : {}),
    ...(kinematics !== undefined ? { kinematics } : {}),
    ...(flavor !== undefined ? { flavor } : {}),
    ...(extruder !== undefined ? { extruder } : {})
  }
}

const accuracyOf = (config: Record<string, unknown>): MachineAccuracy | undefined => {
  const source = record(config["accuracy"])
  const positioningMm = numberOf(source["positioningMm"])
  const repeatabilityMm = numberOf(source["repeatabilityMm"])
  const runoutMm = numberOf(source["runoutMm"])
  if (positioningMm === undefined && repeatabilityMm === undefined && runoutMm === undefined) return undefined
  return {
    ...(positioningMm !== undefined ? { positioningMm } : {}),
    ...(repeatabilityMm !== undefined ? { repeatabilityMm } : {}),
    ...(runoutMm !== undefined ? { runoutMm } : {})
  }
}

const workOffsetsOf = (config: Record<string, unknown>): MachineWorkOffsets | undefined => {
  const source = record(config["workOffsets"])
  const available = stringsOf(source["available"])?.filter((entry): entry is WorkOffset =>
    entry === "G54" || entry === "G55" || entry === "G56" || entry === "G57" || entry === "G58" || entry === "G59")
  const list = available ?? stringsOf(config["workOffsets"])?.filter((entry): entry is WorkOffset =>
    entry === "G54" || entry === "G55" || entry === "G56" || entry === "G57" || entry === "G58" || entry === "G59")
  if (list === undefined || list.length === 0) return undefined
  const fallback = source["default"]
  const chosen = fallback === "G54" || fallback === "G55" || fallback === "G56" || fallback === "G57" || fallback === "G58" || fallback === "G59" ? fallback : undefined
  return { available: list, ...(chosen !== undefined ? { default: chosen } : {}) }
}

const spindleOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineSpindle | undefined => {
  const source = record(config["spindle"])
  const maxRpm = numberOf(source["maxRpm"]) ?? numberOf(config["maxSpindleSpeed"]) ?? numberOf(config["maxRPM"]) ?? numberOf(extra["maxRpm"])
  if (maxRpm === undefined || maxRpm <= 0) return undefined
  const minRpm = numberOf(source["minRpm"]) ?? numberOf(extra["minRpm"])
  const powerKw = numberOf(source["powerKw"]) ?? numberOf(extra["powerKw"])
  const torqueNm = numberOf(source["torqueNm"]) ?? numberOf(extra["torqueNm"])
  const efficiency = numberOf(source["efficiency"]) ?? numberOf(extra["efficiency"])
  const curve = Array.isArray(source["powerCurve"])
    ? source["powerCurve"].flatMap((entry): Array<{ rpm: number; kW: number }> => {
      const band = record(entry)
      const rpm = numberOf(band["rpm"])
      const kW = numberOf(band["kW"])
      return rpm !== undefined && kW !== undefined && rpm > 0 && kW > 0 ? [{ rpm, kW }] : []
    }).sort((a, b) => a.rpm - b.rpm)
    : undefined
  return {
    maxRpm,
    ...(minRpm !== undefined ? { minRpm } : {}),
    ...(powerKw !== undefined ? { powerKw } : {}),
    ...(torqueNm !== undefined ? { torqueNm } : {}),
    ...(efficiency !== undefined ? { efficiency } : {}),
    ...(curve !== undefined && curve.length > 0 ? { powerCurve: curve } : {})
  }
}

const feedOf = (config: Record<string, unknown>, extra: Record<string, unknown>): MachineFeed | undefined => {
  const source = record(config["feed"])
  const max = numberOf(source["max"]) ?? numberOf(config["maxFeedRate"]) ?? numberOf(config["maxFeed"]) ?? numberOf(extra["maxFeed"])
  if (max === undefined || max <= 0) return undefined
  const rapid = numberOf(source["rapid"]) ?? numberOf(config["rapidFeedRate"]) ?? numberOf(extra["rapidFeed"])
  return { max, ...(rapid !== undefined ? { rapid } : {}) }
}

const rigidityOf = (value: unknown): Rigidity | undefined =>
  value === "hobby" || value === "light" || value === "standard" || value === "heavy" ? value : undefined

/**
 * The profile a machine configuration describes, read from whichever shape it was written in.
 *
 * The kind comes from the configuration when it names one and from the row's own type otherwise; the fields that only
 * one shape has (`kinematics`, `maxRPM`, `postProcessor`, `workOffsets` as a list, `probing`) are read as well as the
 * canonical ones, and the legacy `additionalSettings` bag is read last so an old row keeps its figures. What the
 * configuration does not say stays absent: the profile never fills a gap with a default the kernel would plan against.
 */
export const profileOfConfig = (config: unknown, type?: string): MachineProfile => {
  const source = record(config)
  const extra = record(source["additionalSettings"])
  const kind = kindOf(source["kind"]) ?? kindOf(type) ?? "mill"
  const controller = typeof source["controller"] === "string" && source["controller"].trim() !== ""
    ? source["controller"].trim()
    : typeof source["postProcessor"] === "string" && source["postProcessor"].trim() !== "" ? source["postProcessor"].trim() : undefined
  // The post the profile names, else the one its controller asks for: the control decides the dialect.
  const named = POST_IDS.find((entry) => source["post"] === entry)
  const post = named ?? (controller !== undefined ? postOfController(controller) : undefined)
  const axes = source["axes"] === 3 || source["axes"] === 4 || source["axes"] === 5 || source["axes"] === 6 ? source["axes"] : undefined
  const axisTable = axesOf(source, extra)
  const spindle = spindleOf(source, extra)
  const feed = feedOf(source, extra)
  const rigidity = rigidityOf(source["rigidity"]) ?? rigidityOf(extra["rigidity"])
  const workVolume = pointOf(source["workVolume"])
  const travel = travelOf(source, extra) ?? travelOfAxes(axisTable)
  const table = tableOf(source, extra)
  const rotary = rotaryOf(source)
  const turning = turningOf(source, extra)
  const workOffsets = workOffsetsOf(source)
  const probing = probingOf(source)
  const toolChanger = toolChangerOf(source, extra)
  const coolant = coolantOf(source)
  const accuracy = accuracyOf(source)
  const printer = kind === "printer" ? printerOf(source, extra) : undefined
  // Where the figures come from: the canonical `reference` block, else the flat `source` / `notes` a row may carry.
  const referenceBlock = record(source["reference"])
  const referenceSource = typeof referenceBlock["source"] === "string" ? referenceBlock["source"] : typeof source["source"] === "string" ? source["source"] : undefined
  const referenceNotes = typeof referenceBlock["notes"] === "string" ? referenceBlock["notes"] : typeof source["notes"] === "string" ? source["notes"] : undefined
  const reference = referenceSource !== undefined || referenceNotes !== undefined
    ? { ...(referenceSource !== undefined ? { source: referenceSource } : {}), ...(referenceNotes !== undefined ? { notes: referenceNotes } : {}) }
    : undefined
  return {
    kind,
    ...(controller !== undefined ? { controller } : {}),
    ...(post !== undefined ? { post } : {}),
    ...(axes !== undefined ? { axes } : {}),
    ...(axisTable !== undefined ? { axisTable } : {}),
    ...(spindle !== undefined ? { spindle } : {}),
    ...(feed !== undefined ? { feed } : {}),
    ...(rigidity !== undefined ? { rigidity } : {}),
    ...(workVolume !== undefined ? { workVolume } : {}),
    ...(travel !== undefined ? { travel } : {}),
    ...(table !== undefined ? { table } : {}),
    ...(rotary !== undefined ? { rotary } : {}),
    ...(turning !== undefined ? { turning } : {}),
    ...(workOffsets !== undefined ? { workOffsets } : {}),
    ...(probing !== undefined ? { probing } : {}),
    ...(toolChanger !== undefined ? { toolChanger } : {}),
    ...(coolant !== undefined ? { coolant } : {}),
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(reference !== undefined ? { reference } : {}),
    ...(printer !== undefined ? { printer } : {}),
    extra
  }
}

/** The profile written back as a configuration: the canonical shape, plus what the profile did not name. */
export const configOfProfile = (profile: MachineProfile): MachineConfigFields => {
  const config: MachineConfigFields = {
    kind: profile.kind,
    ...(profile.controller !== undefined ? { controller: profile.controller } : {}),
    ...(profile.post !== undefined ? { post: profile.post } : {}),
    ...(profile.axes !== undefined ? { axes: profile.axes } : {}),
    ...(profile.axisTable !== undefined ? { axisTable: profile.axisTable } : {}),
    ...(profile.spindle !== undefined ? { spindle: profile.spindle } : {}),
    ...(profile.feed !== undefined ? { feed: profile.feed } : {}),
    ...(profile.rigidity !== undefined ? { rigidity: profile.rigidity } : {}),
    ...(profile.workVolume !== undefined ? { workVolume: profile.workVolume } : {}),
    ...(profile.travel !== undefined ? { travel: profile.travel } : {}),
    ...(profile.table !== undefined ? { table: profile.table } : {}),
    ...(profile.rotary !== undefined ? { rotary: profile.rotary } : {}),
    ...(profile.turning !== undefined ? { turning: profile.turning } : {}),
    ...(profile.workOffsets !== undefined ? { workOffsets: profile.workOffsets } : {}),
    ...(profile.probing !== undefined ? { probing: profile.probing } : {}),
    ...(profile.toolChanger !== undefined ? { toolChanger: profile.toolChanger } : {}),
    ...(profile.coolant !== undefined ? { coolant: profile.coolant } : {}),
    ...(profile.accuracy !== undefined ? { accuracy: profile.accuracy } : {}),
    ...(profile.reference !== undefined ? { reference: profile.reference } : {}),
    ...(profile.printer !== undefined ? { printer: profile.printer } : {}),
    ...(Object.keys(profile.extra).length > 0 ? { additionalSettings: profile.extra } : {})
  }
  return config
}
