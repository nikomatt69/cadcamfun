/**
 * The exact kernel's answers as the assistant reads them: the same data as the `cadExact` HTTP group, rounded to 1e-4 mm and
 * with the long lists capped (a plate with two hundred holes must not fill the context), always with the true totals.
 */
import { cad } from "@cadcamfun/core"

const LIST_CAP = 40

const round = (value: unknown): unknown => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : null
  if (Array.isArray(value)) return value.map(round)
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]))
  return value
}

const capped = <T>(list: ReadonlyArray<T>): { readonly items: ReadonlyArray<T>; readonly total: number } => ({ items: list.slice(0, LIST_CAP), total: list.length })

export const exactForModel = (analysis: cad.SceneAnalysis, drawing: Record<string, unknown>) => ({
  ok: true,
  ...(round({
    totals: analysis.totals,
    parts: analysis.parts.map((p) => {
      const holes = capped(p.holes)
      return { ...p, holes: holes.items, holesTotal: holes.total, ...(holes.total > holes.items.length ? { holesOmitted: holes.total - holes.items.length } : {}) }
    }),
    skipped: analysis.skipped
  }) as object),
  ...drawing
})

export const assemblyForModel = (report: cad.AssemblyReport, drawing: Record<string, unknown>) => {
  const clashes = capped(report.interference.clashes), plans = capped(report.fasteners.plans), bom = capped(report.bom)
  return {
    ok: true,
    ...(round({
      parts: report.parts,
      interference: {
        clashes: clashes.items, clashesTotal: clashes.total, expected: report.interference.expected.length,
        touching: report.interference.touching.length, undetermined: report.interference.undetermined, checked: report.interference.checked
      },
      bom: bom.items, bomTotal: bom.total,
      joints: capped(report.joints).items, jointsTotal: report.joints.length,
      fasteners: { plans: plans.items, plansTotal: plans.total, unfastened: report.fasteners.unfastened, existing: report.fasteners.existing },
      skipped: report.skipped
    }) as object),
    ...drawing
  }
}
