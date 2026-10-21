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
 * The shapes a configuration may be written in are read by `profileOfConfig` (the machine profile), so this module only
 * has to know how a profile becomes a machine the kernel plans against.
 *
 * A configuration that cannot be a machine (no spindle ceiling, a kind the kernel does not machine) is refused, never
 * guessed: the caller says so instead of planning against a default.
 */
import type { KernelMachine } from "./contracts.ts"
import { MACHINE_CATALOGUE } from "./machines.ts"
import type { PostId } from "../post/types.ts"
import { configOfProfile, profileOfConfig, type MachineConfigFields, type MachineProfile } from "./machine-profile.ts"

/** The stored shape of a machine configuration row (the Resources page and the assistant write it). */
export interface MachineConfigRow {
  readonly id: string
  readonly name: string
  /** The library's own kinds: `mill`, `lathe`, `printer`, `laser`. */
  readonly type: string
  readonly description?: string
  /** The machine's parameters, in whichever shape they were written. */
  readonly config: MachineConfigFields
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

/**
 * The kernel machine a saved configuration describes, or `undefined` when it cannot be one: the library's kinds the
 * kernel does not machine (`printer`, `laser`) and a configuration without a spindle ceiling are refused.
 */
export const kernelMachineOfConfig = (row: MachineConfigRow): KernelMachine | undefined => {
  const profile = profileOfConfig(row.config, row.type)
  return kernelMachineOfProfile(profile, row.id, row.name)
}

/** The kernel machine a machine profile describes. */
export const kernelMachineOfProfile = (profile: MachineProfile, id: string, name: string): KernelMachine | undefined => {
  const kind = profile.kind === "lathe" ? "lathe" : profile.kind === "mill" ? "mill" : undefined
  if (kind === undefined) return undefined
  const maxRpm = profile.spindle?.maxRpm
  if (maxRpm === undefined || maxRpm <= 0) return undefined
  const maxFeed = profile.feed?.max
  if (maxFeed === undefined || maxFeed <= 0) return undefined
  const rotary = profile.rotary
  const turning = profile.turning
  // The travel of the machine: the explicit box, or the linear axes of the axis table when the configuration gives one.
  const travel = profile.travel ?? travelOfAxisTable(profile)
  const assumptions: string[] = []
  if (profile.workVolume !== undefined) {
    assumptions.push("The work volume is the space the part takes, not the axis travel: the travel check stays off unless the configuration carries one")
  }
  if (rotary !== undefined && rotary.pivot === undefined) {
    assumptions.push("The rotary table's pivot is not configured: the preview assumes the rotation centre at the work origin")
  }
  if (kind === "mill" && rotary !== undefined && rotary.tilt === undefined && rotary.rotation !== undefined) {
    assumptions.push("The rotary table only indexes about C: the kernel plans three-axis programs on this machine")
  }
  if (profile.accuracy === undefined) {
    assumptions.push("The machine states no positioning accuracy: the promised deviation does not include what the machine itself adds")
  }
  return {
    id: `config:${id}`,
    name,
    kind,
    limits: {
      maxRpm,
      ...(profile.spindle?.minRpm !== undefined ? { minRpm: profile.spindle.minRpm } : { minRpm: 100 }),
      maxFeed,
      ...(profile.spindle?.powerKw !== undefined ? { powerKw: profile.spindle.powerKw } : {}),
      ...(profile.spindle?.powerCurve !== undefined ? { powerCurve: profile.spindle.powerCurve } : {}),
      ...(profile.spindle?.torqueNm !== undefined ? { torqueNm: profile.spindle.torqueNm } : {}),
      ...(profile.spindle?.efficiency !== undefined ? { efficiency: profile.spindle.efficiency } : {}),
      ...(profile.rigidity !== undefined ? { rigidity: profile.rigidity } : {})
    },
    post: profile.post ?? postOfController(profile.controller),
    ...(profile.workVolume !== undefined || profile.reference !== undefined
      ? {
        reference: {
          controller: profile.controller ?? "unknown",
          source: profile.reference?.source ?? `machine configuration ${id}`,
          ...(profile.workVolume !== undefined ? { stroke: profile.workVolume } : {}),
          assumptions
        }
      }
      : {}),
    ...(profile.feed?.rapid !== undefined ? { rapidFeed: profile.feed.rapid } : {}),
    ...(profile.toolChanger?.changeSeconds !== undefined ? { toolChangeSeconds: profile.toolChanger.changeSeconds } : {}),
    ...(travel !== undefined ? { travel } : {}),
    ...(profile.table !== undefined ? { table: profile.table } : {}),
    ...(profile.workOffsets !== undefined ? { workOffsets: profile.workOffsets } : {}),
    ...(profile.coolant !== undefined ? { coolant: profile.coolant } : {}),
    ...(profile.accuracy !== undefined ? { accuracy: profile.accuracy } : {}),
    ...(profile.toolChanger?.capacity !== undefined ? { toolCapacity: profile.toolChanger.capacity } : {}),
    ...(kind === "lathe" && turning !== undefined
      ? {
        turning: {
          maxBarDiameter: turning.maxBarDiameter ?? 0,
          maxBarLength: turning.maxBarLength ?? 0,
          chuckDiameter: turning.chuckDiameter ?? 0,
          ...(turning.b !== undefined ? { b: [turning.b.min, turning.b.max] as const } : {}),
          ...(turning.c !== undefined ? { c: [turning.c.min, turning.c.max] as const } : {}),
          ...(turning.continuousC === true ? { continuousC: true } : {}),
          ...(turning.yTravel !== undefined ? { yTravel: turning.yTravel } : {}),
          ...(turning.turret !== undefined ? { turret: turning.turret } : {})
        }
      }
      : {}),
    ...(kind === "mill" && rotary !== undefined && rotary.tilt !== undefined
      ? {
        fiveAxis: {
          layout: rotary.layout,
          pivot: rotary.pivot ?? { x: 0, y: 0, z: 0 },
          tilt: [rotary.tilt.min, rotary.tilt.max] as const,
          ...(rotary.rotation !== undefined ? { rotation: [rotary.rotation.min, rotary.rotation.max] as const } : {})
        }
      }
      : {})
  }
}

/**
 * The travel of the machine read from the axis table: the linear axes give the box the moves are checked against. A
 * configuration that names its axes but no travel box still bounds the program.
 */
const travelOfAxisTable = (profile: MachineProfile): { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ: number; readonly maxZ: number } | undefined => {
  const axes = profile.axisTable
  if (axes === undefined) return undefined
  const x = axes.find((axis) => axis.id === "X")
  const y = axes.find((axis) => axis.id === "Y")
  const z = axes.find((axis) => axis.id === "Z")
  if (x === undefined || y === undefined || z === undefined) return undefined
  if (x.kind !== "linear" || y.kind !== "linear" || z.kind !== "linear") return undefined
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max, minZ: z.min, maxZ: z.max }
}

/**
 * A kernel machine as the library stores it: the shape the Resources page edits and the shape a saved configuration has.
 * The built-in catalogue is shown in the library through this.
 */
export const machineConfigOf = (machine: KernelMachine): MachineConfigRow => {
  const rotary = machine.fiveAxis
  const stroke = machine.reference?.stroke
  const profile: MachineProfile = {
    kind: machine.kind === "lathe" ? "lathe" : "mill",
    ...(machine.reference?.controller !== undefined ? { controller: machine.reference.controller } : {}),
    post: machine.post,
    axes: machine.fiveAxis !== undefined ? 5 : 3,
    ...(machine.travel !== undefined
      ? {
        axisTable: [
          { id: "X", kind: "linear", min: machine.travel.minX, max: machine.travel.maxX, sense: 1 },
          { id: "Y", kind: "linear", min: machine.travel.minY, max: machine.travel.maxY, sense: 1 },
          { id: "Z", kind: "linear", min: machine.travel.minZ, max: machine.travel.maxZ, sense: 1 }
        ] as const
      }
      : {}),
    spindle: {
      maxRpm: machine.limits.maxRpm,
      ...(machine.limits.minRpm !== undefined ? { minRpm: machine.limits.minRpm } : {}),
      ...(machine.limits.powerKw !== undefined ? { powerKw: machine.limits.powerKw } : {}),
      ...(machine.limits.powerCurve !== undefined ? { powerCurve: machine.limits.powerCurve } : {}),
      ...(machine.limits.torqueNm !== undefined ? { torqueNm: machine.limits.torqueNm } : {}),
      ...(machine.limits.efficiency !== undefined ? { efficiency: machine.limits.efficiency } : {}),
      ...(machine.limits.rigidity !== undefined ? { rigidity: machine.limits.rigidity } : {})
    },
    feed: {
      max: machine.limits.maxFeed,
      ...(machine.rapidFeed !== undefined ? { rapid: machine.rapidFeed } : {})
    },
    ...(stroke !== undefined ? { workVolume: stroke } : {}),
    ...(machine.table !== undefined ? { table: machine.table } : {}),
    ...(machine.workOffsets !== undefined ? { workOffsets: machine.workOffsets } : {}),
    ...(machine.coolant !== undefined ? { coolant: machine.coolant } : {}),
    ...(machine.accuracy !== undefined ? { accuracy: machine.accuracy } : {}),
    ...(machine.toolCapacity !== undefined || machine.toolChangeSeconds !== undefined
      ? {
        toolChanger: {
          ...(machine.toolCapacity !== undefined ? { capacity: machine.toolCapacity } : {}),
          ...(machine.toolChangeSeconds !== undefined ? { changeSeconds: machine.toolChangeSeconds } : {})
        }
      }
      : {}),
    ...(rotary !== undefined
      ? {
        rotary: {
          layout: rotary.layout,
          tilt: { min: rotary.tilt[0], max: rotary.tilt[1] },
          ...(rotary.rotation !== undefined ? { rotation: { min: rotary.rotation[0], max: rotary.rotation[1] } } : {}),
          ...(machine.reference !== undefined && rotary.pivot !== undefined ? { pivot: rotary.pivot } : {})
        }
      }
      : {}),
    ...(machine.turning !== undefined
      ? {
        turning: {
          ...(machine.turning.maxBarDiameter > 0 ? { maxBarDiameter: machine.turning.maxBarDiameter } : {}),
          ...(machine.turning.maxBarLength > 0 ? { maxBarLength: machine.turning.maxBarLength } : {}),
          ...(machine.turning.chuckDiameter > 0 ? { chuckDiameter: machine.turning.chuckDiameter } : {}),
          ...(machine.turning.b !== undefined ? { b: { min: machine.turning.b[0], max: machine.turning.b[1] } } : {}),
          ...(machine.turning.c !== undefined ? { c: { min: machine.turning.c[0], max: machine.turning.c[1] } } : {}),
          ...(machine.turning.continuousC === true ? { continuousC: true } : {}),
          ...(machine.turning.yTravel !== undefined ? { yTravel: machine.turning.yTravel } : {}),
          ...(machine.turning.turret !== undefined ? { turret: machine.turning.turret } : {})
        }
      }
      : {}),
    extra: {}
  }
  return {
    id: machine.id,
    name: machine.name,
    type: machine.kind === "lathe" ? "lathe" : "mill",
    description: machine.reference !== undefined ? `${machine.reference.controller} — built-in preset` : "Built-in preset",
    config: configOfProfile(profile)
  }
}

/** The built-in catalogue as library rows: what the Resources list shows as the default machines. */
export const DEFAULT_MACHINE_CONFIGS: ReadonlyArray<MachineConfigRow> = MACHINE_CATALOGUE.map(machineConfigOf)
