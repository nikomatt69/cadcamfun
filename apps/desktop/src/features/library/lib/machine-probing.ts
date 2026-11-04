/**
 * The probing part of a machine configuration as the library edits it (spec 73 §4): the spindle probe (`config.probing`), the tool
 * setter (`config.toolSetter`) and the rotary calibration a calibration run wrote (`config.rotary.calibration`, read only here).
 * Values are read through the core machine profile, so a configuration in the legacy `{stylusRadius, feed}` shape shows its figures;
 * writes go to the stored config draft, which the detail page saves in the canonical shape.
 */
import { kernel, stylusDiameterOf, type MachineProbing, type MachineRotaryCalibration, type MachineToolSetter } from "../../cam/lib/probing/contract.ts"

type Config = Record<string, unknown>

export const PROBE_NUMBER_FIELDS = ["stylusDiameter", "stylusLength", "toolNumber", "touchFeed", "fastFeed", "backoff", "orientSpindle"] as const
export type ProbeNumberField = (typeof PROBE_NUMBER_FIELDS)[number]

export const SETTER_NUMBER_FIELDS = ["x", "y", "z", "triggerZ", "discDiameter", "maxToolDiameter", "fastFeed", "touchFeed", "brokenTolerance"] as const
export type SetterNumberField = (typeof SETTER_NUMBER_FIELDS)[number]

export interface ProbingForm {
  readonly probe: Readonly<Partial<Record<ProbeNumberField, number>>> & { readonly doubleTouch?: boolean; readonly effectiveRadius?: number; readonly calibratedAt?: string }
  /** The tool setter as stored: possibly incomplete while it is being filled in. */
  readonly setter: Readonly<Partial<Record<SetterNumberField, number>>> & { readonly kind?: "contact" | "laser" }
  readonly hasSetter: boolean
  readonly rotary?: MachineRotaryCalibration
}

const isObj = (v: unknown): v is Config => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const defined = <A extends Record<string, unknown>>(o: A): A => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as A

/** The form of a stored configuration (any shape the profile reads). */
export const probingFormOf = (config: Config, type?: string): ProbingForm => {
  const profile = kernel.profileOfConfig(config, type)
  const p: MachineProbing | undefined = profile.probing
  // A tool setter being typed in is incomplete and the profile drops it: read the raw slice for the form.
  const rawSetter = isObj(config.toolSetter) ? config.toolSetter : undefined
  const position = isObj(rawSetter?.position) ? rawSetter.position : {}
  const feeds = isObj(rawSetter?.feeds) ? rawSetter.feeds : {}
  const rotary = profile.rotary?.calibration
  return {
    probe: defined({
      stylusDiameter: stylusDiameterOf(p), stylusLength: p?.stylusLength, toolNumber: p?.toolNumber,
      touchFeed: p?.feeds?.touch ?? p?.feed, fastFeed: p?.feeds?.fast, backoff: p?.backoff, orientSpindle: p?.orientSpindle,
      doubleTouch: p?.doubleTouch, effectiveRadius: p?.calibration?.effectiveRadius, calibratedAt: p?.calibration?.calibratedAt
    }),
    setter: defined({
      kind: rawSetter?.kind === "laser" ? "laser" as const : rawSetter?.kind === "contact" ? "contact" as const : undefined,
      x: num(position.x), y: num(position.y), z: num(position.z), triggerZ: num(rawSetter?.triggerZ), discDiameter: num(rawSetter?.discDiameter),
      maxToolDiameter: num(rawSetter?.maxToolDiameter), fastFeed: num(feeds.fast), touchFeed: num(feeds.touch), brokenTolerance: num(rawSetter?.brokenTolerance)
    }),
    hasSetter: rawSetter !== undefined,
    ...(rotary !== undefined ? { rotary } : {})
  }
}

/** Writes one probe figure into the config draft; `undefined` removes it. The legacy `stylusRadius` / `feed` follow, for older readers. */
export const writeProbe = (config: Config, field: ProbeNumberField | "doubleTouch", value: number | boolean | undefined): Config => {
  const probing: Config = { ...(isObj(config.probing) ? config.probing : {}) }
  const feeds: Config = { ...(isObj(probing.feeds) ? probing.feeds : {}) }
  const set = (target: Config, key: string, v: unknown) => { if (v === undefined) delete target[key]; else target[key] = v }
  switch (field) {
    case "stylusDiameter":
      set(probing, "stylusDiameter", value)
      set(probing, "stylusRadius", typeof value === "number" ? value / 2 : undefined)
      break
    case "touchFeed":
      set(feeds, "touch", value)
      set(probing, "feed", value)
      break
    case "fastFeed":
      set(feeds, "fast", value)
      break
    default:
      set(probing, field, value)
  }
  if (Object.keys(feeds).length > 0) probing.feeds = feeds
  else delete probing.feeds
  const next = { ...config }
  if (Object.keys(probing).length === 0) delete next.probing
  else next.probing = probing
  return next
}

/** Writes one tool-setter figure (or its kind); `null` removes the tool setter. */
export const writeSetter = (config: Config, field: SetterNumberField | "kind" | null, value?: number | string | undefined): Config => {
  const next = { ...config }
  if (field === null) { delete next.toolSetter; return next }
  const setter: Config = { ...(isObj(config.toolSetter) ? config.toolSetter : {}) }
  const position: Config = { ...(isObj(setter.position) ? setter.position : {}) }
  const feeds: Config = { ...(isObj(setter.feeds) ? setter.feeds : {}) }
  const set = (target: Config, key: string) => { if (value === undefined) delete target[key]; else target[key] = value }
  if (field === "x" || field === "y" || field === "z") set(position, field)
  else if (field === "fastFeed") set(feeds, "fast")
  else if (field === "touchFeed") set(feeds, "touch")
  else set(setter, field)
  if (Object.keys(position).length > 0) setter.position = position
  else delete setter.position
  if (Object.keys(feeds).length > 0) setter.feeds = feeds
  else delete setter.feeds
  next.toolSetter = setter
  return next
}

export type ProbingIssue = "stylusMissing" | "fastBelowTouch" | "effectiveTooLarge" | "setterIncomplete" | "toolNumber"

/** What would keep the kernel from using the probe or the setter as typed; i18n keys `library.probing.issue.<issue>`. */
export const probingIssues = (form: ProbingForm): ReadonlyArray<ProbingIssue> => {
  const out: ProbingIssue[] = []
  const p = form.probe
  const anyProbe = PROBE_NUMBER_FIELDS.some((f) => p[f] !== undefined)
  if (anyProbe && p.stylusDiameter === undefined) out.push("stylusMissing")
  if (p.touchFeed !== undefined && p.fastFeed !== undefined && p.fastFeed < p.touchFeed) out.push("fastBelowTouch")
  if (p.effectiveRadius !== undefined && p.stylusDiameter !== undefined && p.effectiveRadius > p.stylusDiameter / 2 + 0.05) out.push("effectiveTooLarge")
  if (p.toolNumber !== undefined && !(Number.isInteger(p.toolNumber) && p.toolNumber >= 1 && p.toolNumber <= 9999)) out.push("toolNumber")
  if (form.hasSetter && setterOf(form) === undefined) out.push("setterIncomplete")
  return out
}

/** The tool setter the form describes, when it is complete (what the kernel will read). */
export const setterOf = (form: ProbingForm): MachineToolSetter | undefined => {
  const s = form.setter
  if (s.kind === undefined || s.x === undefined || s.y === undefined || s.z === undefined || s.triggerZ === undefined || s.maxToolDiameter === undefined ||
    s.fastFeed === undefined || s.touchFeed === undefined || s.brokenTolerance === undefined) return undefined
  return kernel.toolSetterOfConfig({
    kind: s.kind, position: { x: s.x, y: s.y, z: s.z }, triggerZ: s.triggerZ, maxToolDiameter: s.maxToolDiameter,
    feeds: { fast: s.fastFeed, touch: s.touchFeed }, brokenTolerance: s.brokenTolerance, ...(s.discDiameter !== undefined ? { discDiameter: s.discDiameter } : {})
  })
}
