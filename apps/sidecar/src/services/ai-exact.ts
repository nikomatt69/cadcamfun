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
      const holes = capped(p.holes), bosses = capped(p.bosses)
      const fillets = capped(p.fillets ?? []), walls = capped(p.swarfWalls ?? [])
      return {
        ...p, holes: holes.items, holesTotal: holes.total, ...(holes.total > holes.items.length ? { holesOmitted: holes.total - holes.items.length } : {}), bosses: bosses.items, bossesTotal: bosses.total,
        ...(fillets.total > 0 ? { fillets: fillets.items, filletsTotal: fillets.total } : {}), ...(walls.total > 0 ? { swarfWalls: walls.items, swarfWallsTotal: walls.total } : {})
      }
    }),
    skipped: analysis.skipped
  }) as object),
  ...drawing
})

/** Setup plans for the assistant: face lists are summarised (counts), the long lists capped, the totals kept. */
export const setupsForModel = (report: cad.SceneSetups, drawing: Record<string, unknown>) => {
  const parts = capped(report.parts)
  return {
    ok: true,
    ...(round({
      parts: parts.items.map((p) => ({
        id: p.id, name: p.name,
        plan: {
          faces: p.plan.faces, area: p.plan.area, notes: p.plan.notes,
          setups: p.plan.setups.map((s) => ({ ...s, faces: s.faces.length, holes: capped(s.holes).items, holesTotal: s.holes.length })),
          uncovered: capped(p.plan.uncovered).items, uncoveredTotal: p.plan.uncovered.length,
          held: p.plan.held.length, indexed: capped(p.plan.indexed).items, indexedTotal: p.plan.indexed.length,
          reach: p.plan.reach
        }
      })),
      partsTotal: parts.total,
      skipped: report.skipped
    }) as object),
    ...drawing
  }
}

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
      clearance: capped(report.clearance).items, clearanceTotal: report.clearance.length,
      bom: bom.items, bomTotal: bom.total,
      joints: capped(report.joints).items, jointsTotal: report.joints.length,
      fasteners: { plans: plans.items, plansTotal: plans.total, unfastened: report.fasteners.unfastened, existing: report.fasteners.existing },
      skipped: report.skipped
    }) as object),
    ...drawing
  }
}
