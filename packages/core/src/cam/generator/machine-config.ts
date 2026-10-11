/**
 * Reads a machine library entry into what the toolpath generator needs (`MachineForProgram`).
 *
 * The library stores a free-form `config` (the sidecar keeps it as JSON). The 5-axis fields are:
 *   axes        3 | 4 | 5 (default 3)
 *   controller  the post id: haas, fanuc, grbl, generic (case-insensitive: the library has "Haas")
 *   rotary      { layout: "table-AC" | "table-BC", tilt: {min, max}, rotation?: {min, max}, pivot?: {x, y, z},
 *                 tcp?: "control" | "program" }
 * A 4/5-axis machine without a valid `rotary` table is returned without `fiveAxis`, so the generator reports the missing
 * table instead of guessing one.
 */
import { Schema } from "effect"
import { MachineForProgramSchema, type MachineForProgram } from "./schema.ts"

export interface MachineConfigEntry {
  readonly id: string
  readonly name: string
  readonly config: Readonly<Record<string, unknown>>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const rangeOf = (value: unknown): { min: number; max: number } | undefined => {
  if (!isRecord(value) || typeof value["min"] !== "number" || typeof value["max"] !== "number") return undefined
  return { min: value["min"], max: value["max"] }
}

export const machineForProgramOf = (entry: MachineConfigEntry): MachineForProgram => {
  const config = entry.config
  const axes = config["axes"] === 4 || config["axes"] === 5 ? config["axes"] : 3
  const controller = typeof config["controller"] === "string" && config["controller"].trim() !== ""
    ? config["controller"].trim().toLowerCase()
    : "generic"
  const rotary = isRecord(config["rotary"]) ? config["rotary"] : undefined
  const tilt = rotary === undefined ? undefined : rangeOf(rotary["tilt"])
  const layout = rotary?.["layout"]
  const fiveAxis = rotary !== undefined && tilt !== undefined && (layout === "table-AC" || layout === "table-BC") && axes >= 4
    ? {
        layout,
        tilt,
        ...(rangeOf(rotary["rotation"]) !== undefined ? { rotation: rangeOf(rotary["rotation"])! } : {}),
        ...(isRecord(rotary["pivot"]) ? { pivot: rotary["pivot"] as { x: number; y: number; z: number } } : {}),
        ...(rotary["tcp"] === "program" ? { tcp: "program" as const } : { tcp: "control" as const })
      }
    : undefined
  return Schema.decodeUnknownSync(MachineForProgramSchema)({
    id: entry.id,
    name: entry.name,
    axes,
    controller,
    ...(fiveAxis !== undefined ? { fiveAxis } : {})
  })
}

/** What is wrong with the 5-axis part of a machine configuration, or `undefined` when it is consistent. */
export const fiveAxisProblem = (config: Readonly<Record<string, unknown>>): string | undefined => {
  if (config["axes"] !== 4 && config["axes"] !== 5) return undefined
  const rotary = isRecord(config["rotary"]) ? config["rotary"] : undefined
  if (rotary === undefined) return "A 4/5-axis machine needs its rotary table in the configuration (layout, tilt range)"
  if (rotary["layout"] !== "table-AC" && rotary["layout"] !== "table-BC") return "The rotary table layout must be table-AC or table-BC"
  const tilt = rangeOf(rotary["tilt"])
  if (tilt === undefined) return "The rotary table needs a tilt range (min, max in degrees)"
  if (!(tilt.min <= tilt.max) || tilt.min < -360 || tilt.max > 360) return "The tilt range must be min <= max, within -360..360 degrees"
  const turn = rotary["rotation"] === undefined ? undefined : rangeOf(rotary["rotation"])
  if (rotary["rotation"] !== undefined && turn === undefined) return "The rotation range needs min and max in degrees"
  if (turn !== undefined && !(turn.min <= turn.max)) return "The rotation range must be min <= max"
  return undefined
}
