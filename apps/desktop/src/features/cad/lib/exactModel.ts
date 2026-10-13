/**
 * The exact model of a drawing element, as the property panel shows it: what the B-rep kernel (`@cadcamfun/core` `brep`)
 * says about the solid, not about its display mesh. Every element with an exact model counts: STEP imports (`brep`),
 * catalogue solids, parametric parts and Boolean elements (computed exactly on their operands).
 */
import { brep, elementBrep } from "@cadcamfun/core"

export type ExactAnalysis =
  | {
      readonly ok: true
      readonly faces: number
      readonly edges: number
      readonly vertices: number
      readonly surfaces: Readonly<Record<string, number>>
      readonly volume: number
      readonly area: number
      readonly centroid: { readonly x: number; readonly y: number; readonly z: number }
      /** Through-holes (genus) when the solid is a closed manifold. */
      readonly holes: number | undefined
      readonly valid: boolean
      readonly issues: ReadonlyArray<string>
    }
  | { readonly ok: false; readonly reason: string }

const byIdOf = (all: ReadonlyArray<Record<string, unknown>>) => {
  const m = new Map<string, Record<string, unknown>>()
  for (const e of all) if (typeof e["id"] === "string") m.set(e["id"] as string, e)
  return m
}

export const analyzeExact = (element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>> = []): ExactAnalysis => {
  let placed: ReturnType<typeof elementBrep>
  try {
    placed = elementBrep(element, byIdOf(all))
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
  }
  if (placed.brep === undefined) return { ok: false, reason: placed.reason }
  const b = placed.brep
  const report = brep.validateBrep(b)
  const mass = brep.massProperties(b)
  const surfaces: Record<string, number> = {}
  for (const f of b.faces) surfaces[f.surface.kind] = (surfaces[f.surface.kind] ?? 0) + 1
  return {
    ok: true,
    faces: b.faces.length,
    edges: b.edges.length,
    vertices: b.vertices.length,
    surfaces,
    volume: mass.volume,
    area: mass.area,
    centroid: mass.centroid,
    holes: report.genus,
    valid: report.valid,
    issues: report.issues.slice(0, 5).map((i) => i.message)
  }
}

/** The element alone as a STEP AP214 file (exact), or the reason it has no exact model. */
export const elementStep = (element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>> = []): { readonly step: string } | { readonly reason: string } => {
  const placed = elementBrep(element, byIdOf(all))
  if (placed.brep === undefined) return { reason: placed.reason }
  const name = typeof element["name"] === "string" && element["name"] !== "" ? (element["name"] as string) : String(element["type"] ?? "part")
  return { step: brep.writeStepBreps([{ name, brep: placed.brep }], { author: "CAD/CAM FUN" }) }
}
