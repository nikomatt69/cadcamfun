/**
 * Cutting-data library, tool life and magazine (spec 69 D4).
 *
 *  - `MaterialLibrary`: the workpiece-material table as an immutable, versioned value. A shop edits a grade (a cutting speed, a chip
 *    load, the stock to leave) or adds its own; every edit is a new version with a change log (field, before, after, note), and
 *    `libraryHash` identifies the table, so a plan can say which table it was made from. The same table gives the same cutting data
 *    (`cuttingData` is a pure function of the material record), so a table change changes the plan deterministically.
 *  - Tool life: a `ToolLifeBook` counts the cutting minutes per tool against the life the Taylor model of `process.ts` predicts
 *    (constants uncalibrated until a shop records its own, spec 61 Z6, owner decision D11).
 *  - Sister tools: an ordered group of cutters that are interchangeable (the same job, a fresh edge); the first member with enough life
 *    left is chosen.
 *  - Magazine: tool numbers in order of first use; more tools than pockets are split into loads with the stop between them reported.
 */
import { MATERIALS, type WorkpieceMaterial } from "./materials.ts"

// ---------------------------------------------------------------- versioned library

export type MaterialChange =
  | { readonly kind: "patch"; readonly id: string; readonly patch: Partial<Omit<WorkpieceMaterial, "id">> }
  | { readonly kind: "add"; readonly material: WorkpieceMaterial }
  | { readonly kind: "remove"; readonly id: string }

export interface LibraryLogEntry {
  readonly version: number
  readonly note: string
  readonly changes: ReadonlyArray<{ readonly id: string; readonly field: string; readonly before: unknown; readonly after: unknown }>
}

export interface MaterialLibrary {
  readonly version: number
  readonly materials: ReadonlyArray<WorkpieceMaterial>
  readonly log: ReadonlyArray<LibraryLogEntry>
}

export const baseLibrary = (materials: ReadonlyArray<WorkpieceMaterial> = MATERIALS): MaterialLibrary => ({ version: 0, materials, log: [] })

const POSITIVE: ReadonlyArray<keyof WorkpieceMaterial> = ["density", "kc11", "mc", "fz10", "drillFeed10", "drillSpeedFactor", "slotAp", "sideAp", "sideAe", "adaptiveAe", "rampAngle", "peckFactor", "minFz", "threadPasses"]

/** Problems that make a material record meaningless for the cutting-data model. */
export const materialIssues = (m: WorkpieceMaterial): ReadonlyArray<string> => {
  const out: string[] = []
  for (const k of POSITIVE) { const v = m[k] as number; if (!(Number.isFinite(v) && v > 0)) out.push(`${m.id}: ${String(k)} must be a positive number`) }
  for (const [label, pair] of [["vcCarbide", m.vcCarbide], ["vcHss", m.vcHss]] as const) {
    if (pair === undefined) continue
    if (!(pair.rough > 0 && pair.finish > 0)) out.push(`${m.id}: ${label} speeds must be positive`)
    else if (pair.finish < pair.rough * 0.5) out.push(`${m.id}: ${label} finish speed is below half of the rough speed`)
  }
  if (m.finishAllowance < 0 || !Number.isFinite(m.finishAllowance)) out.push(`${m.id}: finishAllowance cannot be negative`)
  return out
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Applies `changes` as the next version. Throws a `RangeError` naming the problem (the library is untouched). */
export const editLibrary = (lib: MaterialLibrary, changes: ReadonlyArray<MaterialChange>, note: string): MaterialLibrary => {
  let materials = [...lib.materials]
  const log: LibraryLogEntry["changes"][number][] = []
  for (const c of changes) {
    if (c.kind === "add") {
      if (materials.some((m) => m.id === c.material.id)) throw new RangeError(`Material '${c.material.id}' already exists`)
      const issues = materialIssues(c.material)
      if (issues.length > 0) throw new RangeError(issues.join("; "))
      materials.push(c.material)
      log.push({ id: c.material.id, field: "*", before: undefined, after: "added" })
    } else if (c.kind === "remove") {
      if (!materials.some((m) => m.id === c.id)) throw new RangeError(`Unknown material '${c.id}'`)
      materials = materials.filter((m) => m.id !== c.id)
      log.push({ id: c.id, field: "*", before: "present", after: "removed" })
    } else {
      const at = materials.findIndex((m) => m.id === c.id)
      if (at < 0) throw new RangeError(`Unknown material '${c.id}'`)
      const before = materials[at]!
      const next = { ...before, ...c.patch } as WorkpieceMaterial
      const issues = materialIssues(next)
      if (issues.length > 0) throw new RangeError(issues.join("; "))
      for (const k of Object.keys(c.patch) as Array<keyof WorkpieceMaterial>) if (!same(before[k], next[k])) log.push({ id: c.id, field: String(k), before: before[k], after: next[k] })
      materials[at] = next
    }
  }
  return { version: lib.version + 1, materials, log: [...lib.log, { version: lib.version + 1, note, changes: log }] }
}

/** A grade of the library by id, or an error listing the known ids. */
export const libraryMaterial = (lib: MaterialLibrary, id: string): WorkpieceMaterial => {
  const found = lib.materials.find((m) => m.id === id)
  if (found === undefined) throw new RangeError(`Unknown material '${id}'. Known: ${lib.materials.map((m) => m.id).join(", ")}`)
  return found
}

/** Deterministic 32-bit FNV-1a hash of the table (versions and logs excluded: two tables with equal content hash equal). */
export const libraryHash = (lib: MaterialLibrary): string => {
  const text = JSON.stringify([...lib.materials].sort((a, b) => a.id.localeCompare(b.id)))
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, "0")
}

/** What changed between two libraries, per material and field. */
export const diffLibraries = (a: MaterialLibrary, b: MaterialLibrary): ReadonlyArray<LibraryLogEntry["changes"][number]> => {
  const out: LibraryLogEntry["changes"][number][] = []
  const ia = new Map(a.materials.map((m) => [m.id, m])), ib = new Map(b.materials.map((m) => [m.id, m]))
  for (const [id, m] of ib) {
    const old = ia.get(id)
    if (old === undefined) { out.push({ id, field: "*", before: undefined, after: "added" }); continue }
    for (const k of Object.keys(m) as Array<keyof WorkpieceMaterial>) if (!same(old[k], m[k])) out.push({ id, field: String(k), before: old[k], after: m[k] })
  }
  for (const id of ia.keys()) if (!ib.has(id)) out.push({ id, field: "*", before: "present", after: "removed" })
  return out
}

// ---------------------------------------------------------------- tool life

// Expected life per tool comes from the Taylor model of `process.ts` (`taylorFor`, `toolLifeMinutes`, labelled uncalibrated); this module only counts it.

export interface ToolLifeBook { readonly usedMinutes: Readonly<Record<string, number>> }
export const emptyLifeBook: ToolLifeBook = { usedMinutes: {} }

export const consumeLife = (book: ToolLifeBook, toolId: string, minutes: number): ToolLifeBook => {
  if (!(minutes >= 0)) throw new RangeError("Cutting minutes cannot be negative")
  return { usedMinutes: { ...book.usedMinutes, [toolId]: (book.usedMinutes[toolId] ?? 0) + minutes } }
}
export const remainingLife = (book: ToolLifeBook, toolId: string, lifeMinutes: number): number => Math.max(0, lifeMinutes - (book.usedMinutes[toolId] ?? 0))
export const resetLife = (book: ToolLifeBook, toolId: string): ToolLifeBook => { const { [toolId]: _, ...rest } = book.usedMinutes; return { usedMinutes: rest } }

// ---------------------------------------------------------------- sister tools

export interface SisterGroup { readonly id: string; readonly members: ReadonlyArray<string> }

export interface SisterChoice { readonly toolId: string | undefined; readonly reason: string }

/** The first member of the group with at least `needMinutes` of life left; `toolId` undefined with the reason when none has. */
export const pickSister = (group: SisterGroup, book: ToolLifeBook, lifeMinutes: (toolId: string) => number, needMinutes: number): SisterChoice => {
  for (const id of group.members) if (remainingLife(book, id, lifeMinutes(id)) >= needMinutes) return { toolId: id, reason: id === group.members[0] ? "primary tool has enough life" : `${group.members[0]} is worn out, sister ${id} has enough life` }
  return { toolId: undefined, reason: `no member of ${group.id} has ${needMinutes.toFixed(1)} min of life left: replace or regrind a tool` }
}

// ---------------------------------------------------------------- magazine

export interface MagazinePlan {
  /** Pocket of each tool (1-based), in order of first use. Tools of a later load reuse the pockets of the earlier one. */
  readonly pockets: Readonly<Record<string, number>>
  /** The tools of each load; more than one load means the operator reloads the magazine between them. */
  readonly loads: ReadonlyArray<ReadonlyArray<string>>
  /** Tool changes the sequence makes (each change of tool along the sequence). */
  readonly changes: number
  /** The sequence as it must run (reordered by tool when `movable` allowed it). */
  readonly sequence: ReadonlyArray<string>
  readonly notes: ReadonlyArray<string>
}

/**
 * Pockets for a sequence of tools (one entry per operation). With `movable` (operations that may run in any order) the sequence is
 * grouped by tool in order of first use, which gives the fewest changes; otherwise the order is kept. If there are more distinct tools
 * than `capacity`, consecutive tools are split into loads of at most `capacity` and each load numbers its pockets from 1.
 */
export const planMagazine = (sequence: ReadonlyArray<string>, capacity: number, movable = false): MagazinePlan => {
  if (!(capacity >= 1) || !Number.isInteger(capacity)) throw new RangeError("The magazine needs a whole number of pockets")
  const notes: string[] = []
  let order = [...sequence]
  if (movable) {
    const first = [...new Set(sequence)]
    order = first.flatMap((t) => sequence.filter((x) => x === t))
    if (order.some((t, i) => t !== sequence[i])) notes.push("operations were grouped by tool")
  }
  const distinct = [...new Set(order)]
  const loads: string[][] = []
  for (let i = 0; i < distinct.length; i += capacity) loads.push(distinct.slice(i, i + capacity))
  if (loads.length > 1) notes.push(`${distinct.length} tools do not fit ${capacity} pockets: ${loads.length} loads, reload between them`)
  const pockets: Record<string, number> = {}
  loads.forEach((load) => load.forEach((t, k) => { pockets[t] = k + 1 }))
  let changes = 0
  order.forEach((t, i) => { if (i > 0 && t !== order[i - 1]) changes++ })
  return { pockets, loads, changes, sequence: order, notes }
}
