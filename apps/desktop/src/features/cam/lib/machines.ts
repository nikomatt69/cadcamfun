/**
 * The machines of the Resources library (`/machine`), as the CAM sidebar reads them (legacy
 * `EnanchedSidebarCam` machine tab).
 *
 * The list endpoint answers the legacy envelope (`{ success, data: { data: rows, pagination } }`);
 * older answers carried `{ data: rows }` or `{ configs }`, and the assistant writes a config shape of
 * its own (`kinematics`, `maxRPM`, `maxFeed`). Everything that reads a row goes through here, so the
 * sidebar, the CAD workpiece panel and the resources pages agree on what a machine is.
 */
import { cam } from "@cadcamfun/core"
import type { MachineConfig } from "../../cad/store/cadStore.ts"

/** Where the CAM sidebar and the other selectors get their machines from. */
export const MACHINES_PATH = "/machine"

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** The rows of a machine list answer: the envelope is unwrapped wherever the rows are nested. */
export const machineRowsOf = (value: unknown, depth = 0): ReadonlyArray<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.map(asRecord).filter((row) => typeof row["id"] === "string")
  if (depth > 3) return []
  const record = asRecord(value)
  const nested = record["data"] ?? record["configs"] ?? record["rows"]
  return nested === undefined ? [] : machineRowsOf(nested, depth + 1)
}

/** The three numbers of an envelope, or nothing when any of them is missing. */
const envelopeOf = (value: unknown): { readonly x: number; readonly y: number; readonly z: number } | undefined => {
  const record = asRecord(value)
  const x = finite(record["x"]), y = finite(record["y"]), z = finite(record["z"])
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined
}

/** The envelope of a machine, in millimetres: its work volume, else the assistant's `kinematics`. */
export const machineEnvelopeOf = (machine: MachineConfig): { readonly x: number; readonly y: number; readonly z: number } | undefined =>
  envelopeOf(machine.config?.workVolume) ?? envelopeOf(machine.config?.kinematics)

export const machineSpindleOf = (machine: MachineConfig): number | undefined =>
  finite(machine.config?.maxSpindleSpeed) ?? finite(machine.config?.maxRPM)

export const machineFeedOf = (machine: MachineConfig): number | undefined =>
  finite(machine.config?.maxFeedRate) ?? finite(machine.config?.maxFeed)

/** The post / controller a machine's programs are written for, if it names one. */
export const machineControllerOf = (machine: MachineConfig): string | undefined => {
  const controller = machine.config?.controller
  if (typeof controller === "string" && controller.trim() !== "") return controller
  const post = machine.config?.postProcessor
  return typeof post === "string" && post.trim() !== "" ? post : undefined
}

/**
 * The kind of machine a resource is, for the preview and the generator: the resources say
 * `mill` / `lathe` / `printer` / `laser`, the CAM knows `mill` / `lathe` / `3dprinter`. A laser runs
 * like a mill (XYZ, no turning), and so does anything unrecognised.
 */
export const machineKindOf = (type: unknown): cam.MachineKind => {
  const kind = typeof type === "string" ? type.trim().toLowerCase() : ""
  if (kind === "lathe" || kind === "turn" || kind === "turning") return "lathe"
  if (kind === "printer" || kind === "3dprinter" || kind === "3d-printer" || kind === "fff" || kind === "additive") return "3dprinter"
  return "mill"
}

/** The kind of a resource row, reading the row's `type` and the config's `type` the assistant writes. */
export const machineResourceKind = (machine: MachineConfig): cam.MachineKind =>
  machineKindOf(machine.type ?? machine.config?.type)

/** The badge on a machine row: the resources page's words for the kind. */
export const MACHINE_TYPE_LABELS: Readonly<Record<string, string>> = {
  mill: "Mill", lathe: "Lathe", printer: "3D Printer", laser: "Laser", "3dprinter": "3D Printer"
}

export const machineTypeLabel = (machine: MachineConfig): string => {
  const kind = (machine.type ?? machine.config?.type ?? "").trim().toLowerCase()
  return MACHINE_TYPE_LABELS[kind] ?? (kind === "" ? "Machine" : kind.charAt(0).toUpperCase() + kind.slice(1))
}

/** A machine as a typed `MachineConfig` of the store: the id and the name are what the panels need. */
export const machineConfigOf = (row: Record<string, unknown>): MachineConfig => ({
  id: String(row["id"] ?? ""),
  name: String(row["name"] ?? ""),
  ...(typeof row["type"] === "string" ? { type: row["type"] } : {}),
  ...(typeof row["description"] === "string" || row["description"] === null ? { description: row["description"] as string | null } : {}),
  config: asRecord(row["config"]) as MachineConfig["config"]
})

/** Sorts by name, case-insensitively, so the sidebar lists machines the way a shop names them. */
export const sortMachines = (machines: ReadonlyArray<MachineConfig>): ReadonlyArray<MachineConfig> =>
  [...machines].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

/** The whole answer of `machineConfigs.list`, normalised and sorted. */
export const machinesFromResponse = (value: unknown): ReadonlyArray<MachineConfig> =>
  sortMachines(machineRowsOf(value).map(machineConfigOf).filter((machine) => machine.id !== ""))
