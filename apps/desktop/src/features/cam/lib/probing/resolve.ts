/**
 * Which figure a probe cycle really runs with (spec 73 §4): the cycle's own override, then the machine's stored probe, then the
 * defaults of Settings > Machining, then the core's defaults. One function, so the panel's "effective" column, the planner request
 * and the local preview all read the same numbers.
 */
import type { ProbingDefaults } from "../../../../shared/state/settings.ts"
import { DEFAULT_PROBE_SETTINGS, parseOffsetRef, probing, settingsFromMachine, type MachineProfile, type ProbeContext, type ProbeSettings, type WorkOffsetRef } from "./contract.ts"

/** What one cycle overrides: every field optional, absent means "inherit". */
export interface ProbeOverrides {
  readonly stylusDiameter?: number
  readonly touchFeed?: number
  readonly fastFeed?: number
  readonly positioningFeed?: number
  readonly search?: number
  readonly clearance?: number
  readonly safeZ?: number
  readonly overtravel?: number
  readonly backoff?: number
  readonly doubleTouch?: boolean
}

export const OVERRIDE_KEYS = ["touchFeed", "fastFeed", "search", "clearance", "safeZ", "overtravel", "backoff", "stylusDiameter"] as const
export type OverrideKey = (typeof OVERRIDE_KEYS)[number]
export type FigureSource = "cycle" | "machine" | "settings" | "default"

export interface ResolveInput {
  readonly overrides?: ProbeOverrides
  readonly profile?: Pick<MachineProfile, "post" | "probing" | "toolSetter" | "workOffsets" | "workOffsetTable" | "feed" | "controller"> | undefined
  readonly defaults?: ProbingDefaults | undefined
  /** The work offset the cycle updates (its own choice wins over the machine's default and the settings'). */
  readonly workOffset?: string | undefined
}

const FIELD: Readonly<Record<OverrideKey, keyof ProbeSettings>> = {
  touchFeed: "feed", fastFeed: "fastFeed", search: "search", clearance: "clearance", safeZ: "safeZ", overtravel: "overtravel", backoff: "backoff", stylusDiameter: "stylusDiameter"
}

/** Where the machine states a figure (a profile that lacks it leaves the settings or core default standing). */
const machineHas = (profile: ResolveInput["profile"], key: OverrideKey): boolean => {
  const p = profile?.probing
  if (p === undefined) return false
  switch (key) {
    case "touchFeed": return p.feeds?.touch !== undefined || p.feed !== undefined
    case "fastFeed": return p.feeds?.fast !== undefined
    case "overtravel": return p.overtravel?.xy !== undefined || p.overtravel?.z !== undefined
    case "backoff": return p.backoff !== undefined
    case "stylusDiameter": return probing.stylusDiameterOf(p) !== undefined
    default: return false
  }
}

const settingsBase = (d: ProbingDefaults): Partial<ProbeSettings> => ({
  feed: d.touchFeed, fastFeed: d.fastFeed, clearance: d.clearance, safeZ: d.safeHeight, search: d.search, overtravel: d.overtravel
})

const overrideOf = (o: ProbeOverrides): Partial<ProbeSettings> => ({
  ...(o.stylusDiameter !== undefined ? { stylusDiameter: o.stylusDiameter } : {}),
  ...(o.touchFeed !== undefined ? { feed: o.touchFeed } : {}),
  ...(o.fastFeed !== undefined ? { fastFeed: o.fastFeed } : {}),
  ...(o.positioningFeed !== undefined ? { positioningFeed: o.positioningFeed } : {}),
  ...(o.search !== undefined ? { search: o.search } : {}),
  ...(o.clearance !== undefined ? { clearance: o.clearance } : {}),
  ...(o.safeZ !== undefined ? { safeZ: o.safeZ } : {}),
  ...(o.overtravel !== undefined ? { overtravel: o.overtravel } : {}),
  ...(o.backoff !== undefined ? { backoff: o.backoff } : {}),
  ...(o.doubleTouch !== undefined ? { doubleTouch: o.doubleTouch } : {})
})

/** The settings the planner runs with: cycle > machine > Settings > core. */
export const resolveSettings = (input: ResolveInput): ProbeSettings => {
  const machine = settingsFromMachine(input.profile)
  const base = input.defaults === undefined ? {} : settingsBase(input.defaults)
  const fromSettings: Record<string, unknown> = {}
  // A stored probe wins over the Settings defaults for the figures it states; everything it leaves out comes from Settings.
  for (const key of OVERRIDE_KEYS) {
    const field = FIELD[key]
    if (!machineHas(input.profile, key) && base[field] !== undefined) fromSettings[field] = base[field]
  }
  if (!machineHas(input.profile, "fastFeed") && base.fastFeed !== undefined) fromSettings["fastFeed"] = base.fastFeed
  const defaultOffset = input.defaults !== undefined && input.profile?.workOffsets?.default === undefined ? parseOffsetRef(input.defaults.defaultWorkOffset) : undefined
  const chosen = input.workOffset !== undefined ? parseOffsetRef(input.workOffset) : undefined
  const offset: WorkOffsetRef | undefined = chosen ?? defaultOffset
  return { ...machine, ...fromSettings, ...(offset !== undefined ? { workOffset: offset } : {}), ...overrideOf(input.overrides ?? {}) }
}

/** Where each overridable figure comes from, for the editor's "inherited from" hint. */
export const sourcesOf = (input: ResolveInput): Readonly<Record<OverrideKey, FigureSource>> =>
  Object.fromEntries(OVERRIDE_KEYS.map((key) => {
    const own = key === "stylusDiameter" ? input.overrides?.stylusDiameter : input.overrides?.[key]
    if (own !== undefined) return [key, "cycle"]
    if (machineHas(input.profile, key)) return [key, "machine"]
    if (input.defaults !== undefined && FIELD[key] in settingsBase(input.defaults)) return [key, "settings"]
    return [key, "default"]
  })) as Record<OverrideKey, FigureSource>

/**
 * The planning context for `settings`: the machine's real stylus (length, shank, calibration) with the resolved feeds laid over it,
 * else the device the settings describe.
 */
export const contextOf = (settings: ProbeSettings, input: Pick<ResolveInput, "profile">, options: { readonly prefix?: string } = {}): ProbeContext => {
  const stored = input.profile === undefined ? undefined : probing.probeDeviceOfProfile(input.profile)
  const synthetic = probing.deviceOfSettings(settings)
  const probe = stored === undefined ? synthetic : {
    ...stored,
    stylus: { ...stored.stylus, ballDiameter: settings.stylusDiameter },
    feeds: { ...stored.feeds, ...synthetic.feeds, positioning: synthetic.feeds.positioning, max: Math.max(stored.feeds.max, synthetic.feeds.max) },
    overtravel: synthetic.overtravel, backoff: synthetic.backoff, doubleTouch: settings.doubleTouch
  }
  return {
    probe, safeZ: settings.safeZ, clearance: settings.clearance, search: settings.search, prefix: options.prefix ?? "p",
    ...(input.profile?.toolSetter !== undefined ? { setter: input.profile.toolSetter } : {})
  }
}

export { DEFAULT_PROBE_SETTINGS }
