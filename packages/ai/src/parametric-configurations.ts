/**
 * Design configurations as the assistant reads them: the design table (what differs between the variants of a part) and the
 * comparison (every variant rebuilt and measured, the stored part untouched). The variants themselves are core's
 * `history-config.ts`; this module only presents them and measures each one with the same rebuild and verdict every other
 * parametric answer uses, so a variant's volume, mass and bounds are the numbers the person would see after activating it.
 */
import { configurationHistory, configurationsOf, designTable, type History } from "@cadcamfun/core"
import { parametricReport } from "./parametric.ts"
import { verificationOf, type VerificationMaterial } from "./parametric-verification.ts"

/** The most variants one comparison rebuilds (the history schema allows 24; each is a full rebuild with its exact model). */
export const COMPARE_CONFIGURATION_CAP = 24

export interface DesignTableView {
  readonly active: string | null
  readonly configurations: ReadonlyArray<{ readonly id: string; readonly name: string; readonly active: boolean }>
  /** The parameters whose value differs between variants (the rows of the table), one value per variant id. */
  readonly parameters: ReadonlyArray<{ readonly name: string; readonly values: Readonly<Record<string, number | string>> }>
  /** The features some variants leave out: the variants that suppress each. */
  readonly suppressed: ReadonlyArray<{ readonly feature: string; readonly in: ReadonlyArray<string> }>
  /** Parameters and features every variant shares are not listed; this counts them. */
  readonly constant: { readonly parameters: number; readonly features: number }
}

/** The design table of a history, without the rows that do not vary; `undefined` for a part with no configurations. */
export const designTableView = (history: History): DesignTableView | undefined => {
  if (configurationsOf(history).length === 0) return undefined
  const table = designTable(history)
  const varying = table.parameters.filter((p) => p.varies)
  const features = table.features.filter((f) => f.varies)
  return {
    active: history.configuration ?? null,
    configurations: table.configurations,
    parameters: varying.map((p) => ({ name: p.name, values: p.values })),
    suppressed: features.map((f) => ({ feature: f.id, in: Object.entries(f.suppressed).filter(([, on]) => on).map(([id]) => id) })),
    constant: { parameters: table.parameters.length - varying.length, features: table.features.length - features.length }
  }
}

export interface VariantMeasure {
  readonly id: string
  readonly name: string
  readonly active: boolean
  readonly ok: boolean
  readonly verdict?: string
  readonly bodies?: number
  readonly volumeMm3?: number | null
  readonly volumeSource?: string
  readonly massG?: number
  readonly sizeMm?: { readonly x: number; readonly y: number; readonly z: number } | null
  readonly boundsMm?: unknown
  readonly centerOfGravityMm?: unknown
  /** The first thing to read: why the variant does not build, or what the build asks to look at. */
  readonly problems?: ReadonlyArray<string>
  readonly error?: string
}

/**
 * Every variant rebuilt and measured (volume, mass when the material is known, bounds, centre of gravity), in the order stored. A
 * variant that cannot be shown or does not build is a row with its reason, not a failure of the comparison. The stored history is
 * never changed: `configurationHistory` returns the variant as a history of its own.
 */
export const compareVariants = (history: History, material?: VerificationMaterial): ReadonlyArray<VariantMeasure> =>
  configurationsOf(history).slice(0, COMPARE_CONFIGURATION_CAP).map((c): VariantMeasure => {
    const head = { id: c.id, name: c.name, active: c.id === history.configuration }
    const variant = configurationHistory(history, c.id)
    if (variant.refusal !== undefined) return { ...head, ok: false, error: variant.refusal }
    const report = parametricReport(variant.history)
    const v = verificationOf(variant.history, report, material)
    const errors = report.issues.filter((i) => i.severity === "error" && !i.message.startsWith("Not built:")).slice(0, 3).map((i) => `${i.feature}: ${i.message}`)
    return {
      ...head, ok: report.ok, verdict: v.verdict, bodies: v.bodies, volumeMm3: v.volumeMm3, volumeSource: v.volumeSource,
      ...(v.massG !== undefined ? { massG: v.massG } : {}), sizeMm: v.sizeMm, boundsMm: v.boundsMm,
      ...(v.centerOfGravityMm !== undefined ? { centerOfGravityMm: v.centerOfGravityMm } : {}),
      ...(errors.length > 0 ? { problems: errors } : v.attention.length > 0 ? { problems: v.attention.slice(0, 3) } : {})
    }
  })
