/**
 * The work-offset table the probing panel edits (spec 73 §4): rows seeded from the machine profile, which offsets the machine's
 * control can address (G54.1 P bounds, Siemens frames, LinuxCNC G59.x), measured updates applied to the table, and the diff the panel
 * shows before Save. Rows are in the machine configuration's units: mm, and degrees for A / B / C and the rotation.
 */
import { addressOf, formatOffsetRef, kernel, offsetEntryToWire, offsetKey, parseOffsetRef, type MachineProfile, type OffsetCapacity, type OffsetEntryConfig, type OffsetFamily, type ProbeSimUpdate, type WorkOffsetRef } from "./contract.ts"

export const OFFSET_ROW_AXES = ["x", "y", "z", "a", "b", "c", "rotation"] as const
export type OffsetRowAxis = (typeof OFFSET_ROW_AXES)[number]

export interface OffsetRow {
  readonly key: string
  readonly entry: OffsetEntryConfig
  /** `setup`: the setup holds its own value; `machine`: the machine's value (or zero when the machine has none yet). */
  readonly source: "machine" | "setup"
}

export interface OffsetChange { readonly key: string; readonly axis: OffsetRowAxis; readonly before: number; readonly after: number; readonly delta: number }

const G5X = ["G54", "G55", "G56", "G57", "G58", "G59"] as const
const ZERO: OffsetEntryConfig = { x: 0, y: 0, z: 0 }

/** The control family whose offset addresses apply: the machine's post, or the post its controller implies; generic writes Fanuc. */
export const offsetFamilyOf = (profile: Pick<MachineProfile, "post" | "controller">): OffsetFamily => {
  const post = profile.post ?? kernel.postOfController(profile.controller)
  return post === "generic" ? "fanuc" : post
}

/** Why `key` is not an offset this control has, or undefined when it can be selected and written. */
export const offsetRefusal = (key: string, family: OffsetFamily, capacity?: OffsetCapacity): string | undefined => {
  const ref = parseOffsetRef(key)
  if (ref === undefined || offsetKey(ref) !== key) return `'${key}' is not a work offset (G54, G54.1 P3, G505, G59.1, preset 4)`
  const address = addressOf(ref, family, capacity)
  return "refused" in address ? address.refused : undefined
}

/** The extended offsets (`G54.1 P` / `G154 P` / `G505..`) the control has: what the "add offset" menu offers. */
export const extendedOffsetsOf = (family: OffsetFamily, capacity?: OffsetCapacity, limit = 300): ReadonlyArray<string> => {
  const candidates: WorkOffsetRef[] =
    family === "siemens" ? Array.from({ length: 95 }, (_, i) => ({ kind: "frame", n: i + 5 }))
      : family === "linuxcnc" ? [7, 8, 9].map((p) => ({ kind: "linuxcnc", p }))
        : family === "heidenhain" ? Array.from({ length: 99 }, (_, i) => ({ kind: "preset", row: i + 1 }))
          : family === "grbl" ? []
            : Array.from({ length: limit }, (_, i) => ({ kind: "extended", p: i + 1 }))
  return candidates.filter((ref) => !("refused" in addressOf(ref, family, capacity))).map(formatOffsetRef)
}

/**
 * The rows of the table: the machine's available G5x offsets (all six when the profile does not list them, minus those the control
 * refuses), then every offset the stored table holds; a setup's own values replace the machine's for that setup.
 */
export const offsetRowsOf = (profile: MachineProfile, setupId?: string): ReadonlyArray<OffsetRow> => {
  const family = offsetFamilyOf(profile)
  const capacity = profile.probing?.offsets
  const table = profile.workOffsetTable
  const own = setupId !== undefined ? table?.bySetup?.[setupId] ?? {} : {}
  const keys: string[] = []
  const add = (key: string) => { if (!keys.includes(key)) keys.push(key) }
  for (const code of profile.workOffsets?.available ?? G5X) if (offsetRefusal(code, family, capacity) === undefined) add(code)
  for (const key of Object.keys(table?.entries ?? {})) add(key)
  for (const key of Object.keys(own)) add(key)
  return keys.map((key) => own[key] !== undefined
    ? { key, entry: own[key]!, source: "setup" as const }
    : { key, entry: table?.entries[key] ?? ZERO, source: "machine" as const })
}

/** The entries a PUT writes for the machine (or for the setup: only its own rows, so the machine's stay the machine's). */
export const entriesOfRows = (rows: ReadonlyArray<OffsetRow>, scope: "machine" | "setup"): Record<string, OffsetEntryConfig> =>
  Object.fromEntries(rows.filter((row) => scope === "machine" || row.source === "setup").map((row) => [row.key, row.entry]))

/** One axis of a row changed (an edited cell): the row becomes the setup's own when editing a setup. */
export const withRowValue = (rows: ReadonlyArray<OffsetRow>, key: string, axis: OffsetRowAxis, value: number | undefined, scope: "machine" | "setup"): ReadonlyArray<OffsetRow> =>
  rows.map((row) => {
    if (row.key !== key) return row
    const entry: Record<string, number> = { ...row.entry }
    if (value === undefined && axis !== "x" && axis !== "y" && axis !== "z") delete entry[axis]
    else entry[axis] = value ?? 0
    return { key, entry: entry as unknown as OffsetEntryConfig, source: scope }
  })

const AXIS_OF: Readonly<Record<string, OffsetRowAxis>> = { X: "x", Y: "y", Z: "z", A: "a", B: "b", C: "c", R: "rotation" }
const ANGULAR = new Set<OffsetRowAxis>(["a", "b", "c", "rotation"])

/**
 * The measured offset updates of a probe run applied to the rows (`ProbeSimUpdate.after` is core units: mm, radians for A / B / C / R;
 * the rows are degrees). An update of an offset the table does not list yet adds its row.
 */
export const applyMeasured = (rows: ReadonlyArray<OffsetRow>, updates: ReadonlyArray<ProbeSimUpdate>, scope: "machine" | "setup"): ReadonlyArray<OffsetRow> => {
  let next = [...rows]
  for (const update of updates) {
    const key = offsetKey(update.ref)
    const axis = AXIS_OF[update.axis]
    if (axis === undefined) continue
    if (!next.some((row) => row.key === key)) next = [...next, { key, entry: ZERO, source: scope }]
    const value = ANGULAR.has(axis) ? offsetEntryToWire({ x: 0, y: 0, z: 0, [axis]: update.after })[axis] ?? 0 : update.after
    next = [...withRowValue(next, key, axis, value, scope)]
  }
  return next
}

/** What Save would change, axis by axis; differences below a micron (a millidegree) are not changes. */
export const diffRows = (before: ReadonlyArray<OffsetRow>, after: ReadonlyArray<OffsetRow>): ReadonlyArray<OffsetChange> => {
  const out: OffsetChange[] = []
  const old = new Map(before.map((row) => [row.key, row.entry]))
  for (const row of after) {
    const previous = old.get(row.key) ?? ZERO
    for (const axis of OFFSET_ROW_AXES) {
      const a = previous[axis] ?? 0
      const b = row.entry[axis] ?? 0
      if (Math.abs(b - a) >= 0.0005) out.push({ key: row.key, axis, before: a, after: b, delta: b - a })
    }
  }
  return out
}

/** What the work-offset select offers for a cycle: the table's rows, then the control's G5x offsets, then `current` when it is neither. */
export const offsetChoicesOf = (profile: MachineProfile | undefined, current: string): ReadonlyArray<string> => {
  const keys: string[] = []
  const add = (key: string) => { if (!keys.includes(key)) keys.push(key) }
  if (profile !== undefined) {
    const family = offsetFamilyOf(profile)
    for (const row of offsetRowsOf(profile)) add(row.key)
    for (const code of G5X) if (offsetRefusal(code, family, profile.probing?.offsets) === undefined) add(code)
  } else for (const code of G5X) add(code)
  add(current)
  return keys
}
