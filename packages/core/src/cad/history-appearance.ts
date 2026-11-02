/**
 * Appearance and material of the bodies of a history (colour and a library material per body and per feature result).
 *
 * Where it lives in the schema (`history.ts`):
 *   `Feature.appearance`        the look and material of the bodies the feature creates or changes (the last feature that sets one wins; a
 *                               pattern or mirror copy of a body takes the look of its source)
 *   `History.appearances`      per body id, laid over the features'
 *   `Configuration.appearances` the same per variant: showing a configuration writes it into `History.appearances`
 *   `Body.appearance`           the resolved look of a body of a replay
 * It is plain JSON, so it is carried by serialization, by every edit that spreads the history (parameters, timeline, rename) and by
 * the replays, and it never changes the geometry.
 *
 * The material is a library id. The CAM workpiece grades (`cam/kernel/materials.ts`, density in g/cm3) and the FEA materials
 * (`sim-fea/materials.ts`, density in kg/m3) are both accepted; the density gives the mass (`bodyMasses`, `historyMass`).
 */
import { findMaterial } from "../cam/kernel/materials.ts"
import { materialById } from "../sim-fea/materials.ts"
import { massProperties } from "./brep/mass.ts"
import type { Appearance, Configuration, Feature, History, RebuildResult } from "./history.ts"
import type { ExactRebuild } from "./history-brep.ts"
import type { TimelineEdit } from "./history-edit.ts"
import { meshVolume } from "./solid.ts"

/** The material's name and density in g/cm3, or undefined for an id that is in neither library. */
export const materialDensity = (id: string): { readonly name: string; readonly density: number } | undefined => {
  const cam = findMaterial(id)
  if (cam !== undefined) return { name: cam.name, density: cam.density }
  const fea = materialById(id)
  return fea === undefined ? undefined : { name: fea.name, density: fea.density / 1000 }
}

/** `#rgb` or `#rrggbb` (any case) as `#rrggbb` lower case; undefined for anything else. */
export const normaliseColor = (color: string): string | undefined => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (m === null) return undefined
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`
}

/** The appearance cleaned up, or the reason it is not valid. An empty appearance is refused: remove it instead. */
export const checkAppearance = (a: Appearance): { readonly ok: true; readonly appearance: Appearance } | { readonly ok: false; readonly problem: string } => {
  const out: { color?: string; material?: string } = {}
  if (a.color !== undefined) {
    const color = normaliseColor(a.color)
    if (color === undefined) return { ok: false, problem: `'${a.color}' is not a colour (use #rgb or #rrggbb)` }
    out.color = color
  }
  if (a.material !== undefined) {
    if (materialDensity(a.material) === undefined) return { ok: false, problem: `'${a.material}' is not a library material` }
    out.material = a.material
  }
  if (out.color === undefined && out.material === undefined) return { ok: false, problem: "an appearance needs a colour or a material" }
  return { ok: true, appearance: out }
}

const withAppearances = (history: History, appearances: Readonly<Record<string, Appearance>>): History => {
  const { appearances: _old, ...rest } = history
  return Object.keys(appearances).length === 0 ? rest : { ...rest, appearances }
}

/** The look and material of a body (`undefined` clears it). The body must exist in the replay of the history, so a typo is not stored. */
export const setBodyAppearance = (history: History, bodyId: string, appearance: Appearance | undefined, known?: ReadonlyArray<string>): TimelineEdit => {
  if (known !== undefined && !known.includes(bodyId)) return { history, refusal: `no body '${bodyId}' (the bodies are ${known.join(", ") || "none"})` }
  const table = { ...(history.appearances ?? {}) }
  if (appearance === undefined) delete table[bodyId]
  else {
    const checked = checkAppearance(appearance)
    if (!checked.ok) return { history, refusal: checked.problem }
    table[bodyId] = checked.appearance
  }
  return { history: withAppearances(history, table) }
}

/** The look and material of what a feature creates or changes (`undefined` clears it). */
export const setFeatureAppearance = (history: History, featureId: string, appearance: Appearance | undefined): TimelineEdit => {
  if (!history.features.some((f) => f.id === featureId)) return { history, refusal: `no feature '${featureId}' in the history` }
  let value: Appearance | undefined
  if (appearance !== undefined) {
    const checked = checkAppearance(appearance)
    if (!checked.ok) return { history, refusal: checked.problem }
    value = checked.appearance
  }
  return {
    history: {
      ...history,
      features: history.features.map((f): Feature => {
        if (f.id !== featureId) return f
        if (value !== undefined) return { ...f, appearance: value }
        const { appearance: _gone, ...rest } = f
        return rest as Feature
      })
    }
  }
}

/** The look and material of one body in one configuration (on the shown one the live table changes too). */
export const setConfigurationAppearance = (history: History, configurationId: string, bodyId: string, appearance: Appearance | undefined): TimelineEdit => {
  const list = history.configurations ?? []
  const target = list.find((c) => c.id === configurationId)
  if (target === undefined) return { history, refusal: `no configuration '${configurationId}'` }
  const table = { ...(target.appearances ?? {}) }
  if (appearance === undefined) delete table[bodyId]
  else {
    const checked = checkAppearance(appearance)
    if (!checked.ok) return { history, refusal: checked.problem }
    table[bodyId] = checked.appearance
  }
  const update = (c: Configuration): Configuration => {
    if (c.id !== configurationId) return c
    const { appearances: _old, ...rest } = c
    return Object.keys(table).length === 0 ? rest : { ...rest, appearances: table }
  }
  const next: History = { ...history, configurations: list.map(update) }
  return { history: configurationId === history.configuration ? setBodyAppearance(next, bodyId, appearance).history : next }
}

export interface BodyMass {
  readonly id: string
  /** mm3 (exact when an exact model was given and the body has one, else the mesh). */
  readonly volume: number
  readonly material?: string
  /** g/cm3. */
  readonly density?: number
  /** Grams; absent when the body has no material (or an unknown one). */
  readonly mass?: number
  readonly color?: string
}

export interface HistoryMass {
  readonly bodies: ReadonlyArray<BodyMass>
  /** Grams, of the bodies that have a material. */
  readonly mass: number
  /** Bodies without a material: their mass is unknown, not zero. */
  readonly unweighted: ReadonlyArray<string>
  /** mm3 of every body. */
  readonly volume: number
}

/**
 * The mass of every body from its material's density (`Body.appearance.material`), g. `defaultMaterial` weighs the bodies that have none
 * (the stock of the part, say). A body whose material is not in the libraries is unweighted.
 */
export const bodyMasses = (result: RebuildResult, options: { readonly exact?: ExactRebuild; readonly defaultMaterial?: string } = {}): HistoryMass => {
  const rows = result.bodies.map((b): BodyMass => {
    const brep = options.exact?.bodies.find((x) => x.id === b.id)?.brep
    const volume = brep !== undefined ? massProperties(brep).volume : Math.abs(meshVolume(b.mesh))
    const material = b.appearance?.material ?? options.defaultMaterial
    const found = material === undefined ? undefined : materialDensity(material)
    return {
      id: b.id, volume,
      ...(material !== undefined ? { material } : {}),
      ...(found !== undefined ? { density: found.density, mass: (volume * found.density) / 1000 } : {}),
      ...(b.appearance?.color !== undefined ? { color: b.appearance.color } : {})
    }
  })
  return {
    bodies: rows,
    mass: rows.reduce((s, r) => s + (r.mass ?? 0), 0),
    unweighted: rows.filter((r) => r.mass === undefined).map((r) => r.id),
    volume: rows.reduce((s, r) => s + r.volume, 0)
  }
}

/** The mass of the whole history in grams, or undefined when any body has no material (a partial mass would pass for the whole). */
export const historyMass = (result: RebuildResult, options: { readonly exact?: ExactRebuild; readonly defaultMaterial?: string } = {}): number | undefined => {
  const m = bodyMasses(result, options)
  return m.bodies.length === 0 || m.unweighted.length > 0 ? undefined : m.mass
}
