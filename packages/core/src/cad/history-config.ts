/**
 * Configurations: named variants of one parametric part (spec 46 A5, a design table). A configuration is a set of parameter values
 * and the exact set of suppressed features; activating one writes them into the history, so every reader of `parameters` and
 * `suppressed` (the replay, the exact replay, the CAM, drawings) sees the variant with no extra step, and nothing but the two
 * existing mechanisms is involved: parameters (`history-edit.ts`) and suppression (`history-timeline.ts`).
 *
 * The active configuration owns the live values: editing a parameter while one is active changes that configuration, and the
 * change is written back into it (`syncConfiguration`) before another is activated, so no edit is ever lost on a switch.
 * Parameters a configuration does not name keep their current value when it is activated. Pure and immutable.
 */
import { resolveParameters } from "./expr.ts"
import { historyVolume, rebuild, type Configuration, type Feature, type History } from "./history.ts"
import { parameterProblem, type TimelineEdit } from "./history-edit.ts"

const ID = /^[A-Za-z0-9_-]{1,40}$/

const withConfigurations = (history: History, configurations: ReadonlyArray<Configuration>, active: string | undefined): History => {
  const { configurations: _c, configuration: _a, ...rest } = history
  return { ...rest, ...(configurations.length === 0 ? {} : { configurations }), ...(active === undefined || configurations.length === 0 ? {} : { configuration: active }) }
}

const suppressedIds = (history: History): ReadonlyArray<string> => history.features.filter((f) => f.suppressed === true).map((f) => f.id)

/** The state the history is in now, as a configuration's content: every parameter and the suppressed features. */
export const currentState = (history: History): Pick<Configuration, "values" | "suppressed" | "appearances"> => ({
  values: { ...history.parameters }, suppressed: suppressedIds(history), ...(history.appearances !== undefined ? { appearances: history.appearances } : {})
})

/** The history with the active configuration holding what the history shows now (a no-op without one). */
export const syncConfiguration = (history: History): History => {
  const active = history.configuration
  if (active === undefined || !(history.configurations ?? []).some((c) => c.id === active)) return history
  return withConfigurations(history, (history.configurations ?? []).map((c) => { if (c.id !== active) return c; const { appearances: _own, ...rest } = c; return { ...rest, ...currentState(history) } }), active)
}

/** The configurations, with the active one brought up to date with the live values. */
export const configurationsOf = (history: History): ReadonlyArray<Configuration> => syncConfiguration(history).configurations ?? []

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "config"

/**
 * A configuration named `name` holding the state the history is in now. The first one also records the state as "Default", so the
 * original part can always be returned to; the new one becomes the active configuration. Refused for a name already used.
 */
export const addConfiguration = (history: History, name: string, id?: string): TimelineEdit => {
  const trimmed = name.trim()
  if (trimmed === "" || trimmed.length > 100) return { history, refusal: "a configuration needs a name of 1 to 100 characters" }
  const synced = syncConfiguration(history)
  const existing = synced.configurations ?? []
  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return { history, refusal: `there is already a configuration named '${trimmed}'` }
  const taken = new Set(existing.map((c) => c.id))
  let chosen = id ?? slug(trimmed)
  if (id !== undefined && !ID.test(id)) return { history, refusal: `'${id}' is not a valid configuration id` }
  if (id !== undefined && taken.has(id)) return { history, refusal: `the configuration id '${id}' is already used` }
  for (let n = 2; taken.has(chosen); n++) chosen = `${slug(trimmed)}-${n}`
  const state = currentState(synced)
  const base: Configuration[] = existing.length === 0 ? [{ id: taken.has("default") ? "base" : "default", name: "Default", ...state }] : [...existing]
  return { history: withConfigurations(synced, [...base, { id: chosen, name: trimmed, ...state }], chosen) }
}

/**
 * Makes `id` the shown configuration: the live values are saved into the one being left, then the target's values and suppressed
 * set are written. Refused when the target's values do not resolve (a formula that refers to a parameter that was removed since).
 */
export const activateConfiguration = (history: History, id: string): TimelineEdit => {
  const synced = syncConfiguration(history)
  const target = (synced.configurations ?? []).find((c) => c.id === id)
  if (target === undefined) return { history, refusal: `no configuration '${id}'` }
  const parameters: Record<string, number | string> = { ...synced.parameters }
  for (const [name, value] of Object.entries(target.values)) if (Object.hasOwn(parameters, name)) parameters[name] = value
  const { errors } = resolveParameters(parameters)
  const failed = Object.entries(errors)[0]
  if (failed !== undefined) return { history, refusal: `configuration '${target.name}' cannot be shown: parameter '${failed[0]}' ${failed[1]}` }
  const suppressed = new Set(target.suppressed)
  const features = synced.features.map((f): Feature => {
    if (suppressed.has(f.id)) return f.suppressed === true ? f : { ...f, suppressed: true }
    if (f.suppressed !== true) return f
    const { suppressed: _flag, ...rest } = f
    return rest as Feature
  })
  // The look and material of the variant (a configuration that never recorded one leaves the live table as it is).
  const { appearances: _live, ...unpainted } = synced
  const painted = target.appearances !== undefined ? { ...unpainted, ...(Object.keys(target.appearances).length > 0 ? { appearances: target.appearances } : {}) } : synced
  return { history: withConfigurations({ ...painted, parameters, features }, synced.configurations ?? [], id) }
}

/** A configuration renamed (the name is unique, case-insensitively). */
export const renameConfiguration = (history: History, id: string, name: string): TimelineEdit => {
  const trimmed = name.trim()
  if (trimmed === "" || trimmed.length > 100) return { history, refusal: "a configuration needs a name of 1 to 100 characters" }
  const list = history.configurations ?? []
  if (!list.some((c) => c.id === id)) return { history, refusal: `no configuration '${id}'` }
  if (list.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) return { history, refusal: `there is already a configuration named '${trimmed}'` }
  return { history: withConfigurations(history, list.map((c) => (c.id === id ? { ...c, name: trimmed } : c)), history.configuration) }
}

/**
 * A configuration removed. Removing the shown one leaves the model as it is (it just stops being a configuration); removing all but
 * one leaves a single configuration, which is still a record of that state.
 */
export const removeConfiguration = (history: History, id: string): TimelineEdit => {
  const synced = syncConfiguration(history)
  const list = synced.configurations ?? []
  if (!list.some((c) => c.id === id)) return { history, refusal: `no configuration '${id}'` }
  const rest = list.filter((c) => c.id !== id)
  return { history: withConfigurations(synced, rest, synced.configuration === id ? undefined : synced.configuration) }
}

/**
 * One value of one configuration set (or cleared with `undefined`, which makes it follow the current value). Checked like any
 * parameter edit (`parameterProblem`) against the table the configuration would produce. On the shown configuration the live
 * parameter changes too.
 */
export const setConfigurationValue = (history: History, id: string, parameter: string, value: number | string | undefined): TimelineEdit => {
  const synced = syncConfiguration(history)
  const list = synced.configurations ?? []
  const target = list.find((c) => c.id === id)
  if (target === undefined) return { history, refusal: `no configuration '${id}'` }
  if (!Object.hasOwn(synced.parameters, parameter)) return { history, refusal: `no parameter '${parameter}'` }
  if (value !== undefined) {
    const table: History = { ...synced, parameters: { ...synced.parameters, ...target.values } }
    const problem = parameterProblem(table, parameter, value)
    if (problem !== undefined) return { history, refusal: problem }
  }
  const values = { ...target.values }
  if (value === undefined) delete values[parameter]
  else values[parameter] = value
  const next = withConfigurations(synced, list.map((c) => (c.id === id ? { ...c, values } : c)), synced.configuration)
  return { history: id === synced.configuration && value !== undefined ? { ...next, parameters: { ...next.parameters, [parameter]: value } } : next }
}

/** Which features a configuration suppresses (unknown ids are refused; on the shown configuration the flags change too). */
export const setConfigurationSuppressed = (history: History, id: string, featureIds: ReadonlyArray<string>, suppressed: boolean): TimelineEdit => {
  const synced = syncConfiguration(history)
  const list = synced.configurations ?? []
  const target = list.find((c) => c.id === id)
  if (target === undefined) return { history, refusal: `no configuration '${id}'` }
  const unknown = featureIds.find((f) => !synced.features.some((x) => x.id === f))
  if (unknown !== undefined) return { history, refusal: `no feature '${unknown}' in the history` }
  const set = new Set(target.suppressed)
  for (const f of featureIds) { if (suppressed) set.add(f); else set.delete(f) }
  const ordered = synced.features.map((f) => f.id).filter((f) => set.has(f))
  const next = withConfigurations(synced, list.map((c) => (c.id === id ? { ...c, suppressed: ordered } : c)), synced.configuration)
  if (id !== synced.configuration) return { history: next }
  return { history: { ...next, features: next.features.map((f) => (featureIds.includes(f.id) ? setFlag(f, suppressed) : f)) } }
}

const setFlag = (f: Feature, suppressed: boolean): Feature => {
  if (suppressed) return f.suppressed === true ? f : { ...f, suppressed: true }
  if (f.suppressed !== true) return f
  const { suppressed: _flag, ...rest } = f
  return rest as Feature
}

/** The history exactly as configuration `id` shows it, without touching the stored one (for a variant that is built, measured or machined). */
export const configurationHistory = (history: History, id: string): TimelineEdit => {
  const activated = activateConfiguration(history, id)
  if (activated.refusal !== undefined) return activated
  return { history: withConfigurations(activated.history, [], undefined) }
}

/** The design table: a row per parameter, a column per configuration, and the suppressed features of each. */
export interface DesignTable {
  readonly configurations: ReadonlyArray<{ readonly id: string; readonly name: string; readonly active: boolean }>
  readonly parameters: ReadonlyArray<{ readonly name: string; readonly values: Readonly<Record<string, number | string>>; readonly varies: boolean }>
  readonly features: ReadonlyArray<{ readonly id: string; readonly suppressed: Readonly<Record<string, boolean>>; readonly varies: boolean }>
}

export const designTable = (history: History): DesignTable => {
  const list = configurationsOf(history)
  const parameters = Object.keys(history.parameters).map((name) => {
    const values: Record<string, number | string> = {}
    for (const c of list) values[c.id] = Object.hasOwn(c.values, name) ? c.values[name]! : history.parameters[name]!
    const all = Object.values(values)
    return { name, values, varies: all.some((v) => v !== all[0]) }
  })
  const features = history.features.map((f) => {
    const suppressed: Record<string, boolean> = {}
    for (const c of list) suppressed[c.id] = c.suppressed.includes(f.id)
    const all = Object.values(suppressed)
    return { id: f.id, suppressed, varies: all.some((v) => v !== all[0]) }
  })
  return { configurations: list.map((c) => ({ id: c.id, name: c.name, active: c.id === history.configuration })), parameters, features }
}

export interface ConfigurationMeasure {
  readonly id: string
  readonly name: string
  readonly bodies: number
  readonly volume: number
  readonly errors: number
  readonly refusal?: string
}

/** Every configuration built and measured (mesh replay), the stored history untouched: the comparison a design table is for. */
export const compareConfigurations = (history: History): ReadonlyArray<ConfigurationMeasure> =>
  configurationsOf(history).map((c) => {
    const variant = configurationHistory(history, c.id)
    if (variant.refusal !== undefined) return { id: c.id, name: c.name, bodies: 0, volume: 0, errors: 1, refusal: variant.refusal }
    const built = rebuild(variant.history)
    return { id: c.id, name: c.name, bodies: built.bodies.length, volume: historyVolume(built), errors: built.issues.filter((i) => i.severity === "error").length }
  })
