/**
 * The assembly data model (spec 46 A1, A5): part DEFINITIONS (stored once) and OCCURRENCES (placements of a definition), nested
 * through sub-assemblies, with named CONFIGURATIONS (parameter values, suppression and visibility) generated from a design table.
 *
 * A definition owns the geometry: either a parametric `history` (rebuilt exactly with the configuration's parameter values) or a
 * fixed `brep`. Editing a definition therefore changes every occurrence; `makeIndependent` copies it for one occurrence only.
 * Mass properties of an assembly are the sum over occurrences of the definition's mass properties moved by the occurrence's
 * transform, so no occurrence is re-tessellated and 500 occurrences of 50 definitions cost 50 mass-property evaluations.
 */
import { applyDir, applyPoint, compose, IDENTITY, massProperties, transformBrep, type Brep, type Transform, type Vec3 } from "../brep/index.ts"
import { rebuildExact } from "../history-brep.ts"
import { rebuild, type History } from "../history.ts"

export class AssemblyError extends Error {
  constructor(message: string) { super(message); this.name = "AssemblyError" }
}

export interface PartDefinition {
  readonly id: string
  readonly name: string
  /** Parametric source; wins over `brep` when present. */
  readonly history?: History
  readonly brep?: Brep
  /** Catalogue designation (BOM rows with one designation are one row). */
  readonly designation?: string
  readonly material?: string
  /** g/cm^3. */
  readonly density?: number
}

export interface Occurrence {
  readonly id: string
  /** A part definition id, or an assembly definition id (a sub-assembly) in `Assembly.subAssemblies`. */
  readonly definition: string
  /** Placement relative to the parent occurrence (or the world for a top-level occurrence). */
  readonly transform: Transform
  readonly grounded?: boolean
  readonly suppressed?: boolean
  readonly visible?: boolean
  /** Overrides of the definition's parameters for this occurrence (a configuration's values are applied first). */
  readonly overrides?: Readonly<Record<string, number>>
}

export interface Configuration {
  readonly name: string
  /** Parameter values by definition id: `{ plate: { width: 80 } }`. */
  readonly parameters?: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** Occurrence paths suppressed in this configuration, and hidden ones. */
  readonly suppressed?: ReadonlyArray<string>
  readonly hidden?: ReadonlyArray<string>
}

export interface Assembly {
  readonly definitions: ReadonlyArray<PartDefinition>
  /** Sub-assembly definitions: reusable groups of occurrences. */
  readonly subAssemblies?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly occurrences: ReadonlyArray<Occurrence> }>
  readonly occurrences: ReadonlyArray<Occurrence>
  readonly configurations?: ReadonlyArray<Configuration>
  readonly activeConfiguration?: string
}

/** A leaf occurrence with its world transform and the path that names it (`gearbox/bolt2`). */
export interface FlatOccurrence {
  readonly path: string
  readonly definition: string
  readonly transform: Transform
  readonly grounded: boolean
  readonly overrides: Readonly<Record<string, number>>
}

const configurationOf = (a: Assembly, name?: string): Configuration | undefined => {
  const wanted = name ?? a.activeConfiguration
  return wanted === undefined ? undefined : a.configurations?.find((c) => c.name === wanted)
}

/**
 * Leaf occurrences in the world, sub-assemblies expanded (a nested occurrence's transform is composed with its parents'),
 * suppressed occurrences (and everything below them) left out. The active configuration's suppression applies.
 */
export const flattenAssembly = (a: Assembly, configuration?: string): FlatOccurrence[] => {
  const config = configurationOf(a, configuration)
  const suppressed = new Set(config?.suppressed ?? [])
  const part = new Set(a.definitions.map((d) => d.id))
  const subs = new Map((a.subAssemblies ?? []).map((s) => [s.id, s] as const))
  const out: FlatOccurrence[] = []
  const visit = (occ: Occurrence, prefix: string, parent: Transform, grounded: boolean, stack: ReadonlyArray<string>): void => {
    const path = prefix === "" ? occ.id : `${prefix}/${occ.id}`
    if (occ.suppressed === true || suppressed.has(path)) return
    const world = compose(occ.transform, parent)
    const fixed = grounded || occ.grounded === true
    if (part.has(occ.definition)) {
      out.push({ path, definition: occ.definition, transform: world, grounded: fixed, overrides: occ.overrides ?? {} })
      return
    }
    const sub = subs.get(occ.definition)
    if (sub === undefined) throw new AssemblyError(`Occurrence '${path}' uses the unknown definition '${occ.definition}'`)
    if (stack.includes(sub.id)) throw new AssemblyError(`Sub-assembly '${sub.id}' contains itself (${[...stack, sub.id].join(" > ")})`)
    for (const child of sub.occurrences) visit(child, path, world, fixed, [...stack, sub.id])
  }
  const seen = new Set<string>()
  for (const occ of a.occurrences) {
    if (seen.has(occ.id)) throw new AssemblyError(`Duplicate occurrence id '${occ.id}'`)
    seen.add(occ.id)
    visit(occ, "", IDENTITY, false, [])
  }
  return out
}

/** Writes solved world transforms back as parent-relative occurrence transforms (top-level occurrences only; nested ones stay in their sub-assembly). */
export const withTransforms = (a: Assembly, world: ReadonlyMap<string, Transform>): Assembly => ({
  ...a,
  occurrences: a.occurrences.map((o) => {
    const t = world.get(o.id)
    return t === undefined ? o : { ...o, transform: t }
  })
})

/** Replaces one definition: every occurrence of it follows. */
export const editDefinition = (a: Assembly, id: string, change: Partial<Omit<PartDefinition, "id">>): Assembly => {
  if (!a.definitions.some((d) => d.id === id)) throw new AssemblyError(`Unknown definition '${id}'`)
  return { ...a, definitions: a.definitions.map((d) => (d.id === id ? { ...d, ...change } : d)) }
}

/** Gives one occurrence its own copy of its definition (`<definition>~<occurrence>`) so editing it leaves the others alone. */
export const makeIndependent = (a: Assembly, occurrenceId: string): Assembly => {
  const occ = a.occurrences.find((o) => o.id === occurrenceId)
  if (occ === undefined) throw new AssemblyError(`Unknown top-level occurrence '${occurrenceId}'`)
  const def = a.definitions.find((d) => d.id === occ.definition)
  if (def === undefined) throw new AssemblyError(`'${occurrenceId}' is not a part occurrence`)
  const copyId = `${def.id}~${occurrenceId}`
  if (a.definitions.some((d) => d.id === copyId)) throw new AssemblyError(`'${occurrenceId}' is already independent`)
  return {
    ...a,
    definitions: [...a.definitions, { ...def, id: copyId, name: `${def.name} (${occurrenceId})` }],
    occurrences: a.occurrences.map((o) => (o.id === occurrenceId ? { ...o, definition: copyId } : o))
  }
}

// ------------------------------------------------------------------------------------------------ geometry of a definition

const bodyCache = new WeakMap<History, Map<string, Brep | null>>()

/** The exact body of a definition under parameter values (a history is rebuilt with them; a fixed body is returned as is). */
export const definitionBrep = (d: PartDefinition, parameters: Readonly<Record<string, number>> = {}): Brep => {
  if (d.history === undefined) {
    if (d.brep === undefined) throw new AssemblyError(`Definition '${d.id}' has neither a history nor a body`)
    return d.brep
  }
  const key = JSON.stringify(Object.entries(parameters).sort(([p], [q]) => (p < q ? -1 : 1)))
  let byKey = bodyCache.get(d.history)
  if (byKey === undefined) { byKey = new Map(); bodyCache.set(d.history, byKey) }
  const hit = byKey.get(key)
  if (hit !== undefined && hit !== null) return hit
  const history: History = { ...d.history, parameters: { ...d.history.parameters, ...parameters } }
  const exact = rebuildExact(history, rebuild(history)).bodies[0]?.brep
  if (exact === undefined) throw new AssemblyError(`Definition '${d.id}' has no exact body under ${JSON.stringify(parameters)}`)
  byKey.set(key, exact)
  return exact
}

/** The parameter values a leaf occurrence has in a configuration: the configuration's, then the occurrence's own overrides. */
export const occurrenceParameters = (a: Assembly, flat: FlatOccurrence, configuration?: string): Readonly<Record<string, number>> => ({
  ...(configurationOf(a, configuration)?.parameters?.[flat.definition] ?? {}),
  ...flat.overrides
})

/** The exact body of a leaf occurrence in the world. */
export const occurrenceBrep = (a: Assembly, flat: FlatOccurrence, configuration?: string): Brep => {
  const def = a.definitions.find((d) => d.id === flat.definition)!
  return transformBrep(definitionBrep(def, occurrenceParameters(a, flat, configuration)), flat.transform)
}

export interface AssemblyMass {
  /** mm^3. */
  readonly volume: number
  /** g, for the occurrences whose definition has a density; the rest are listed in `unweighted`. */
  readonly mass: number
  readonly centroid: Vec3
  /** Inertia tensor about the centroid, g*mm^2, row-major, of the weighted occurrences. */
  readonly inertia: readonly [number, number, number, number, number, number, number, number, number]
  readonly occurrences: number
  readonly unweighted: ReadonlyArray<string>
  /** Distinct (definition, parameters) bodies whose mass properties were evaluated. */
  readonly evaluated: number
}

/**
 * Mass, centre of gravity and inertia of the assembly by summing definitions: the mass properties of a body are evaluated once
 * per (definition, parameters) and moved by each occurrence's rigid transform (parallel-axis theorem and rotation of the tensor).
 */
export const assemblyMass = (a: Assembly, configuration?: string): AssemblyMass => {
  const flat = flattenAssembly(a, configuration)
  const cache = new Map<string, ReturnType<typeof massProperties>>()
  const items: Array<{ volume: number; mass: number; c: Vec3; I: number[] }> = []
  const unweighted: string[] = []
  let volume = 0
  for (const f of flat) {
    const def = a.definitions.find((d) => d.id === f.definition)!
    const params = occurrenceParameters(a, f, configuration)
    const key = `${def.id}|${JSON.stringify(Object.entries(params).sort(([p], [q]) => (p < q ? -1 : 1)))}`
    let props = cache.get(key)
    if (props === undefined) { props = massProperties(definitionBrep(def, params)); cache.set(key, props) }
    volume += props.volume
    if (def.density === undefined) { unweighted.push(f.path); continue }
    const density = def.density / 1000 // g/mm^3
    const R = f.transform.m
    // Inertia tensor rotated into the world: R I R^T, times the density.
    const I = props.inertia
    const RI = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => R[i * 3]! * I[j]! + R[i * 3 + 1]! * I[3 + j]! + R[i * 3 + 2]! * I[6 + j]!))
    const world = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => RI[i * 3]! * R[j * 3]! + RI[i * 3 + 1]! * R[j * 3 + 1]! + RI[i * 3 + 2]! * R[j * 3 + 2]!))
    items.push({ volume: props.volume, mass: props.volume * density, c: applyPoint(f.transform, props.centroid), I: world.map((v) => v * density) })
  }
  const mass = items.reduce((s, i) => s + i.mass, 0)
  const centroid = mass > 0
    ? { x: items.reduce((s, i) => s + i.mass * i.c.x, 0) / mass, y: items.reduce((s, i) => s + i.mass * i.c.y, 0) / mass, z: items.reduce((s, i) => s + i.mass * i.c.z, 0) / mass }
    : { x: 0, y: 0, z: 0 }
  const inertia = new Array<number>(9).fill(0)
  for (const it of items) {
    const d = { x: it.c.x - centroid.x, y: it.c.y - centroid.y, z: it.c.z - centroid.z }
    const d2 = d.x * d.x + d.y * d.y + d.z * d.z
    const dd = [d.x, d.y, d.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) inertia[i * 3 + j]! += it.I[i * 3 + j]! + it.mass * ((i === j ? d2 : 0) - dd[i]! * dd[j]!)
  }
  return {
    volume, mass, centroid,
    inertia: inertia as unknown as AssemblyMass["inertia"], occurrences: flat.length, unweighted, evaluated: cache.size
  }
}

// ------------------------------------------------------------------------------------------------ configurations (A5)

export interface DesignTable {
  /** Column names: the first is the configuration name; the others are `definition.parameter` or `suppress:<occurrence path>`. */
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<ReadonlyArray<string | number>>
}

/**
 * Configurations from a design table. Column `name`; `definition.parameter` columns carry numbers; `suppress:<path>` columns carry
 * 0/1 (or yes/no, true/false). A row with a missing or non-numeric parameter is refused with its row number.
 */
export const configurationsFromTable = (table: DesignTable): Configuration[] => {
  if (table.columns[0] !== "name") throw new AssemblyError("The first column of a design table must be 'name'")
  const names = new Set<string>()
  return table.rows.map((row, r) => {
    const name = String(row[0] ?? "")
    if (name === "") throw new AssemblyError(`Design table row ${r + 1} has no name`)
    if (names.has(name)) throw new AssemblyError(`Design table has two rows named '${name}'`)
    names.add(name)
    const parameters: Record<string, Record<string, number>> = {}
    const suppressed: string[] = []
    table.columns.forEach((column, k) => {
      if (k === 0) return
      const cell = row[k]
      if (column.startsWith("suppress:")) {
        const on = typeof cell === "number" ? cell !== 0 : /^(1|yes|true|y)$/i.test(String(cell).trim())
        if (on) suppressed.push(column.slice("suppress:".length))
        return
      }
      const dot = column.indexOf(".")
      if (dot < 1) throw new AssemblyError(`Column '${column}' must be 'definition.parameter' or 'suppress:<path>'`)
      const value = typeof cell === "number" ? cell : Number(String(cell).replace(",", "."))
      if (!Number.isFinite(value)) throw new AssemblyError(`Design table row ${r + 1} (${name}): '${column}' is not a number (${String(cell)})`)
      const def = column.slice(0, dot)
      parameters[def] = { ...(parameters[def] ?? {}), [column.slice(dot + 1)]: value }
    })
    return { name, parameters, suppressed }
  })
}

export const withConfigurations = (a: Assembly, configurations: ReadonlyArray<Configuration>, active?: string): Assembly => ({
  ...a, configurations, ...(active !== undefined ? { activeConfiguration: active } : {})
})

/** The rigid motion between two poses of one occurrence expressed for tests and exploded views: the displacement of a point. */
export const displacement = (from: Transform, to: Transform, p: Vec3): number => {
  const a = applyPoint(from, p), b = applyPoint(to, p)
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
export { applyDir }
