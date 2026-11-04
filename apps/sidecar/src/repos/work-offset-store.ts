import { cam } from "@cadcamfun/core"
import { DatabaseError } from "@cadcamfun/db"
import { Context, Effect, Layer } from "effect"
import { MachineConfigRepo } from "./machine-config-repo.ts"

/** One work-offset row as the machine holds it (mm; `rotation` in radians about the tool axis). */
export interface OffsetEntryValue { x: number; y: number; z: number; a?: number; b?: number; c?: number; rotation?: number }
export type OffsetEntries = Record<string, OffsetEntryValue>

/**
 * `MachineConfig.config.workOffsetTable` (spec 73 §1): the machine's table, plus per-setup tables for setups that probe their own
 * offsets. It is machine state, not project state, so it lives on the machine configuration and its history is the library history.
 */
export interface StoredWorkOffsetTable { entries: OffsetEntries; bySetup: Record<string, OffsetEntries> }

/** The machine's probing configuration: `config.probing`, `config.toolSetter`, `config.rotaryCalibration` (spec 73 §1). */
export interface StoredProbeConfig {
  probing: cam.kernel.MachineProbing | null
  toolSetter: cam.kernel.MachineToolSetter | null
  rotaryCalibration: cam.kernel.MachineRotaryCalibration | null
}

export interface WorkOffsetsView { machineConfigId: string; setupId: string | null; entries: OffsetEntries; updatedAt: string; isOwner: boolean }
export interface ProbeConfigView extends StoredProbeConfig { machineConfigId: string; updatedAt: string; isOwner: boolean }

export type StoreRefusal = { refused: "not-found" | "forbidden" | "conflict"; message: string }

type Mutated = { config: Record<string, unknown>; updatedAt: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const configOf = (row: { config: unknown }) => (isObj(row.config) ? row.config : {})

const entriesOf = (v: unknown): OffsetEntries => {
  if (!isObj(v)) return {}
  const out: OffsetEntries = {}
  for (const [key, e] of Object.entries(v)) {
    if (!isObj(e) || typeof e.x !== "number" || typeof e.y !== "number" || typeof e.z !== "number") continue
    const entry: OffsetEntryValue = { x: e.x, y: e.y, z: e.z }
    for (const k of ["a", "b", "c", "rotation"] as const) if (typeof e[k] === "number") entry[k] = e[k] as number
    out[key] = entry
  }
  return out
}
/** Reads the stored table; a missing or hand-edited table reads as empty rows rather than failing the machine. */
export const workOffsetTableOf = (config: unknown): StoredWorkOffsetTable => {
  const t = isObj(config) && isObj(config.workOffsetTable) ? config.workOffsetTable : {}
  const bySetup: Record<string, OffsetEntries> = {}
  if (isObj(t.bySetup)) for (const [id, e] of Object.entries(t.bySetup)) bySetup[id] = entriesOf(e)
  return { entries: entriesOf(t.entries), bySetup }
}
export const probeConfigOf = (config: unknown): StoredProbeConfig => {
  const c = isObj(config) ? config : {}
  return {
    probing: cam.kernel.probingOfConfig(c.probing) ?? null,
    toolSetter: cam.kernel.toolSetterOfConfig(c.toolSetter) ?? null,
    rotaryCalibration: cam.kernel.rotaryCalibrationOfConfig(c.rotaryCalibration) ?? null
  }
}

/** A read-modify-write without the caller's base retries this often when another save lands in between. */
const RETRIES = 3

/**
 * Work-offset tables and probe configuration of a machine configuration (spec 73 §3.2): reads need access to the machine (owner,
 * public, or used by a reachable project), writes need ownership. Every write is a compare-and-set through
 * `MachineConfigRepo.updateIfCurrent`, so it keeps the previous version in the library history and announces `resources.changed`;
 * a caller's stale `baseUpdatedAt` writes nothing and answers `conflict`.
 */
export class WorkOffsetStore extends Context.Service<WorkOffsetStore, {
  get(userId: string, machineConfigId: string, setupId?: string | undefined): Effect.Effect<WorkOffsetsView | StoreRefusal, DatabaseError>
  /** Replaces the table (or the setup's table) with `entries`; `null` entries for a setup drop that setup's table. */
  put(userId: string, machineConfigId: string, input: { entries: OffsetEntries | null; setupId?: string | undefined; baseUpdatedAt?: string | undefined }, by?: string): Effect.Effect<WorkOffsetsView | StoreRefusal, DatabaseError>
  getProbeConfig(userId: string, machineConfigId: string): Effect.Effect<ProbeConfigView | StoreRefusal, DatabaseError>
  /** Each given key replaces that slice; `null` removes it; an omitted key is kept. */
  putProbeConfig(userId: string, machineConfigId: string, input: { [K in keyof StoredProbeConfig]?: StoredProbeConfig[K] | undefined } & { baseUpdatedAt?: string | undefined }, by?: string): Effect.Effect<ProbeConfigView | StoreRefusal, DatabaseError>
}>()("cadcamfun/WorkOffsetStore") {
  static readonly layer = Layer.effect(WorkOffsetStore, Effect.gen(function*() {
    const machines = yield* MachineConfigRepo
    const load = Effect.fn("WorkOffsetStore.load")(function*(userId: string, id: string, write: boolean) {
      const found = yield* machines.find(userId, id)
      if (!found) return { refused: "not-found", message: "Machine configuration not found" } as StoreRefusal
      if (!found.permission.hasAccess) return { refused: "forbidden", message: `You do not have permission to access this machine configuration. ${found.permission.reason ?? ""}`.trim() } as StoreRefusal
      if (write && !found.permission.isOwner) return { refused: "forbidden", message: "Only the owner can change this machine configuration" } as StoreRefusal
      return found
    })
    /** Applies `edit` to the stored config as one compare-and-set; retries a lost race only when the caller gave no base. */
    const mutate = Effect.fn("WorkOffsetStore.mutate")(function*(userId: string, id: string, base: string | undefined, by: string | undefined, edit: (config: Record<string, unknown>) => Record<string, unknown>) {
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        const found = yield* load(userId, id, true)
        if ("refused" in found) return found as Mutated | StoreRefusal
        const row = found.row
        const expected = base ?? row.updatedAt.toISOString()
        const config = edit({ ...configOf(row) })
        const saved = yield* machines.updateIfCurrent(id, { name: row.name, description: row.description, type: row.type, config, isPublic: row.isPublic }, expected, by ?? userId)
        if (saved !== "conflict") return { config, updatedAt: saved.view.updatedAt } as Mutated | StoreRefusal
        if (base !== undefined) break
      }
      return { refused: "conflict", message: "The machine configuration was saved elsewhere since it was read. Nothing was overwritten." } as StoreRefusal
    })
    const offsetsView = (id: string, config: unknown, updatedAt: string, isOwner: boolean, setupId: string | undefined): WorkOffsetsView => {
      const table = workOffsetTableOf(config)
      return { machineConfigId: id, setupId: setupId ?? null, entries: setupId !== undefined ? table.bySetup[setupId] ?? {} : table.entries, updatedAt, isOwner }
    }
    return WorkOffsetStore.of({
      get: (userId, id, setupId) => load(userId, id, false).pipe(Effect.map((found) => "refused" in found ? found
        : offsetsView(id, found.row.config, found.view.updatedAt, found.permission.isOwner, setupId))),
      put: (userId, id, input, by) => mutate(userId, id, input.baseUpdatedAt, by, (config) => {
        const table = workOffsetTableOf(config)
        if (input.setupId === undefined) table.entries = input.entries ?? {}
        else if (input.entries === null) delete table.bySetup[input.setupId]
        else table.bySetup[input.setupId] = input.entries
        return { ...config, workOffsetTable: table }
      }).pipe(Effect.map((r) => "refused" in r ? r : offsetsView(id, r.config, r.updatedAt, true, input.setupId))),
      getProbeConfig: (userId, id) => load(userId, id, false).pipe(Effect.map((found) => "refused" in found ? found
        : { machineConfigId: id, updatedAt: found.view.updatedAt, isOwner: found.permission.isOwner, ...probeConfigOf(found.row.config) })),
      putProbeConfig: (userId, id, input, by) => mutate(userId, id, input.baseUpdatedAt, by, (config) => {
        const next = { ...config }
        for (const key of ["probing", "toolSetter", "rotaryCalibration"] as const) {
          const value = input[key]
          if (value === undefined) continue
          if (value === null) delete next[key]
          else next[key] = value
        }
        return next
      }).pipe(Effect.map((r) => "refused" in r ? r : { machineConfigId: id, updatedAt: r.updatedAt, isOwner: true, ...probeConfigOf(r.config) }))
    })
  }))
}
