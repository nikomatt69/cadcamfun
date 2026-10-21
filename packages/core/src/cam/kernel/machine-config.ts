/**
 * A machine is one fact in two shapes: the `MachineConfig` row the Resources library stores (free-form JSON a person
 * edits: work volume, spindle and feed ceilings, the controller, the rotary table) and the kernel's `KernelMachine`
 * (the limits, the post and the axes a run needs). This module translates between them:
 *
 *   - `kernelMachineOfConfig` makes a machine the user configured usable by the kernel, so what they configured is
 *     what the program is planned against;
 *   - `machineConfigOf` and `DEFAULT_MACHINE_CONFIGS` make the built-in catalogue visible in the Resources list, so the
 *     presets are the machines the library already shows.
 *
 * A configuration that cannot be a machine (no spindle ceiling, a kind the kernel does not machine) is refused, never
 * guessed: the caller says so instead of planning against a default.
 */
import type { KernelMachine } from "./contracts.ts"
import { MACHINE_CATALOGUE } from "./machines.ts"
import type { PostId } from "../post/types.ts"

/** The stored shape of a machine configuration row (the Resources page and the assistant write it). */
export interface MachineConfigRow {
  readonly id: string
  readonly name: string
  /** The library's own kinds: `mill`, `lathe`, `printer`, `laser`. */
  readonly type: string
  readonly description?: string
  readonly config: {
    readonly workVolume?: { readonly x: number; readonly y: number; readonly z: number }
    readonly maxSpindleSpeed?: number
    readonly maxFeedRate?: number
    readonly controller?: string
    readonly axes?: 3 | 4 | 5
    readonly rotary?: {
      readonly layout: "table-AC" | "table-BC"
      readonly tilt: { readonly min: number; readonly max: number }
      readonly rotation?: { readonly min: number; readonly max: number }
      readonly pivot?: { readonly x: number; readonly y: number; readonly z: number }
      readonly tcp?: "control" | "program"
    }
    readonly additionalSettings?: Readonly<Record<string, unknown>>
  }
}

/** The controllers the kernel has a post for, and the control families that speak one of them. */
const POSTS: Readonly<Record<string, PostId>> = {
  fanuc: "fanuc", "fanuc 0i": "fanuc", "fanuc 0i-md": "fanuc", mazatrol: "fanuc", smoothai: "fanuc", mazak: "fanuc",
  haas: "haas", grbl: "grbl", linuxcnc: "generic", generic: "generic", iso: "generic",
  sinumerik: "siemens", "840d": "siemens", siemens: "siemens",
  osp: "fanuc", okuma: "fanuc", doosan: "fanuc", dmgmori: "fanuc", dmu: "fanuc",
  heidenhain: "heidenhain", tnc: "heidenhain", tnc7: "heidenhain", klartext: "heidenhain"
}

/** The post a controller's name asks for; an unknown control gets the plain ISO post, never a silent mismatch. */
export const postOfController = (controller: string | undefined): PostId => {
  const key = (controller ?? "").trim().toLowerCase()
  if (key === "") return "generic"
  const direct = POSTS[key]
  if (direct !== undefined) return direct
  const partial = Object.entries(POSTS).find(([name]) => name !== "" && key.includes(name))
  return partial?.[1] ?? "generic"
}

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const numberOf = (value: unknown): number | undefined => {
  const direct = finite(value)
  if (direct !== undefined) return direct
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined
}

const rangeOf = (value: unknown): readonly [number, number] | undefined => {
  if (value === null || typeof value !== "object") return undefined
  const record = value as { readonly min?: unknown; readonly max?: unknown }
  const min = numberOf(record.min), max = numberOf(record.max)
  return min !== undefined && max !== undefined && min <= max ? [min, max] : undefined
}

const extra = (row: MachineConfigRow): Readonly<Record<string, unknown>> => row.config.additionalSettings ?? {}

/**
 * The kernel machine a saved configuration describes, or `undefined` when it cannot be one: the library's kinds the
 * kernel does not machine (`printer`, `laser`) and a configuration without a spindle ceiling are refused.
 */
export const kernelMachineOfConfig = (row: MachineConfigRow): KernelMachine | undefined => {
  const config = row.config
  const kind = row.type === "lathe" ? "lathe" : row.type === "mill" ? "mill" : undefined
  if (kind === undefined) return undefined
  const maxRpm = numberOf(config.maxSpindleSpeed)
  if (maxRpm === undefined || maxRpm <= 0) return undefined
  const maxFeed = numberOf(config.maxFeedRate)
  if (maxFeed === undefined || maxFeed <= 0) return undefined
  const rotary = config.rotary
  const tilt = rangeOf(rotary?.tilt)
  const rotation = rangeOf(rotary?.rotation)
  const pivot = rotary?.pivot
  const additional = extra(row)
  const barDiameter = numberOf(additional["maxBarDiameter"])
  const barLength = numberOf(additional["maxBarLength"])
  const chuckDiameter = numberOf(additional["chuckDiameter"])
  const b = rangeOf(additional["b"])
  const c = rangeOf(additional["c"])
  const yTravel = numberOf(additional["yTravel"])
  const powerKw = numberOf(additional["powerKw"])
  const torqueNm = numberOf(additional["torqueNm"])
  const table = additional["table"]
  const tableRecord = table !== null && typeof table === "object" ? table as { readonly length?: unknown; readonly width?: unknown; readonly gap?: unknown } : undefined
  const tableLength = numberOf(tableRecord?.length), tableWidth = numberOf(tableRecord?.width), tableGap = numberOf(tableRecord?.gap)
  const travel = additional["travel"]
  const travelRecord = travel !== null && typeof travel === "object" ? travel as { readonly minX?: unknown; readonly maxX?: unknown; readonly minY?: unknown; readonly maxY?: unknown; readonly minZ?: unknown; readonly maxZ?: unknown } : undefined
  const minX = numberOf(travelRecord?.minX), maxX = numberOf(travelRecord?.maxX)
  const minY = numberOf(travelRecord?.minY), maxY = numberOf(travelRecord?.maxY)
  const minZ = numberOf(travelRecord?.minZ), maxZ = numberOf(travelRecord?.maxZ)
  const assumptions: string[] = []
  if (config.workVolume !== undefined) assumptions.push("The work volume is the space the part takes, not the axis travel: the travel check stays off unless the configuration carries one")
  if (rotary !== undefined && pivot === undefined) assumptions.push("The rotary table's pivot is not configured: the preview assumes the rotation centre at the work origin")
  return {
    id: `config:${row.id}`,
    name: row.name,
    kind,
    limits: { maxRpm, minRpm: numberOf(additional["minRpm"]) ?? 100, maxFeed, ...(powerKw !== undefined ? { powerKw } : {}), ...(torqueNm !== undefined ? { torqueNm } : {}) },
    post: postOfController(config.controller),
    ...(config.workVolume !== undefined ? { reference: { controller: config.controller ?? "unknown", source: `machine configuration ${row.id}`, stroke: config.workVolume, assumptions } } : {}),
    ...(kind === "lathe"
      ? {
        turning: {
          maxBarDiameter: barDiameter ?? 0, maxBarLength: barLength ?? 0, chuckDiameter: chuckDiameter ?? 0,
          ...(b !== undefined ? { b } : {}), ...(c !== undefined ? { c } : {}),
          ...(additional["continuousC"] === true ? { continuousC: true } : {}),
          ...(yTravel !== undefined ? { yTravel } : {})
        }
      }
      : {}),
    ...(kind === "mill" && rotary !== undefined && tilt !== undefined
      ? { fiveAxis: { layout: rotary.layout, pivot: pivot ?? { x: 0, y: 0, z: 0 }, tilt, ...(rotation !== undefined ? { rotation } : {}) } }
      : {}),
    ...(tableLength !== undefined && tableWidth !== undefined ? { table: { length: tableLength, width: tableWidth, gap: tableGap ?? 30 } } : {}),
    ...(minX !== undefined && maxX !== undefined && minY !== undefined && maxY !== undefined && minZ !== undefined && maxZ !== undefined
      ? { travel: { minX, maxX, minY, maxY, minZ, maxZ } }
      : {})
  }
}

/**
 * A kernel machine as the library stores it: the shape the Resources page edits and the shape a saved configuration has.
 * The built-in catalogue is shown in the library through this.
 */
export const machineConfigOf = (machine: KernelMachine): MachineConfigRow => {
  const rotary = machine.fiveAxis
  const stroke = machine.reference?.stroke
  return {
    id: machine.id,
    name: machine.name,
    type: machine.kind === "lathe" ? "lathe" : "mill",
    description: machine.reference !== undefined ? `${machine.reference.controller} — built-in preset` : "Built-in preset",
    config: {
      ...(stroke !== undefined ? { workVolume: stroke } : {}),
      maxSpindleSpeed: machine.limits.maxRpm,
      maxFeedRate: machine.limits.maxFeed,
      controller: machine.post,
      axes: machine.fiveAxis !== undefined ? 5 : 3,
      ...(rotary !== undefined
        ? { rotary: { layout: rotary.layout, tilt: { min: rotary.tilt[0], max: rotary.tilt[1] }, ...(rotary.rotation !== undefined ? { rotation: { min: rotary.rotation[0], max: rotary.rotation[1] } } : {}), ...(machine.reference !== undefined && rotary.pivot !== undefined ? { pivot: rotary.pivot } : {}) } }
        : {}),
      additionalSettings: {
        ...(machine.limits.powerKw !== undefined ? { powerKw: machine.limits.powerKw } : {}),
        ...(machine.limits.torqueNm !== undefined ? { torqueNm: machine.limits.torqueNm } : {}),
        ...(machine.turning !== undefined
          ? {
            ...(machine.turning.maxBarDiameter > 0 ? { maxBarDiameter: machine.turning.maxBarDiameter } : {}),
            ...(machine.turning.maxBarLength > 0 ? { maxBarLength: machine.turning.maxBarLength } : {}),
            ...(machine.turning.chuckDiameter > 0 ? { chuckDiameter: machine.turning.chuckDiameter } : {}),
            ...(machine.turning.b !== undefined ? { b: { min: machine.turning.b[0], max: machine.turning.b[1] } } : {}),
            ...(machine.turning.c !== undefined ? { c: { min: machine.turning.c[0], max: machine.turning.c[1] } } : {}),
            ...(machine.turning.continuousC === true ? { continuousC: true } : {}),
            ...(machine.turning.yTravel !== undefined ? { yTravel: machine.turning.yTravel } : {})
          }
          : {})
      }
    }
  }
}

/** The built-in catalogue as library rows: what the Resources list shows as the default machines. */
export const DEFAULT_MACHINE_CONFIGS: ReadonlyArray<MachineConfigRow> = MACHINE_CATALOGUE.map(machineConfigOf)
