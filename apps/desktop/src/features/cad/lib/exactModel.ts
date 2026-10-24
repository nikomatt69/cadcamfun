/**
 * The exact model of a drawing element, as the property panel shows it: what the B-rep kernel (`@cadcamfun/core` `brep`)
 * says about the solid, not about its display mesh. Every element with an exact model counts: STEP imports (`brep`),
 * catalogue solids, parametric parts and Boolean elements (computed exactly on their operands).
 *
 * The analysis is the one the sidecar (`/api/cad/exact/analyze`) and the assistant (`cad.exact`) run, `analyzeBrep` of
 * `@cadcamfun/core`, so the panel, the API and the CAM planner agree on holes and on how the part will be machined.
 */
import { analyzeBrep, brep, elementBrep, sceneBossEditBody, sceneHoleEditBody, type SceneBoss, type SceneHole, type SceneMachining } from "@cadcamfun/core"

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
      /** The holes the kernel recognises on the faces (drilled, counterbored, countersunk), as the CAM planner will drill them. */
      readonly drilled: ReadonlyArray<SceneHole>
      /** The bosses, pins and shaft sections (convex cylinders all the way round), in the order the boss edit indexes them. */
      readonly bosses: ReadonlyArray<SceneBoss>
      /** Whether the CAM planner machines the solid by its features (holes, pockets, outlines) or as a 3D surface job, and why. */
      readonly machining: SceneMachining
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
  const a = analyzeBrep(String(element["id"] ?? ""), String(element["name"] ?? element["type"] ?? "part"), placed.brep)
  return {
    ok: true, faces: a.faces, edges: a.edges, vertices: a.vertices, surfaces: a.surfaces,
    volume: a.volume, area: a.area, centroid: a.centroid, holes: a.throughHoles, valid: a.valid, issues: a.issues.slice(0, 5),
    drilled: a.holes, bosses: a.bosses, machining: a.machining
  }
}

/** The element alone as a STEP AP214 file (exact), or the reason it has no exact model. */
export const elementStep = (element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>> = []): { readonly step: string } | { readonly reason: string } => {
  const placed = elementBrep(element, byIdOf(all))
  if (placed.brep === undefined) return { reason: placed.reason }
  const name = typeof element["name"] === "string" && element["name"] !== "" ? (element["name"] as string) : String(element["type"] ?? "part")
  return { step: brep.writeStepBreps([{ name, brep: placed.brep }], { author: "CAD/CAM FUN" }) }
}

export type HoleChange = { readonly kind: "resize"; readonly diameter: number; readonly taper?: number } | { readonly kind: "fill" }

/**
 * Resize or fill the `hole`-th recognised hole of an element (the order `ExactAnalysis.drilled` lists them in): the same checked
 * construction as the sidecar's `/api/cad/exact/hole` and the assistant's `cad_edit.hole`. The result is a new solid for the
 * drawing, never an edit in place; a refusal says why and changes nothing.
 */
export const editElementHole = (
  element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>>, hole: number, change: HoleChange
): { readonly ok: true; readonly element: Record<string, unknown>; readonly volume: number; readonly volumeChange: number } | { readonly ok: false; readonly error: string } => {
  let built: ReturnType<typeof sceneHoleEditBody>
  try { built = sceneHoleEditBody(all, String(element["id"] ?? ""), hole, change) } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }
  if (!built.ok) return built
  const base = typeof element["name"] === "string" && element["name"] !== "" ? (element["name"] as string) : String(element["type"] ?? "part")
  const what = change.kind === "fill" ? "filled" : `Ø${Math.round(change.diameter * 1000) / 1000}${change.taper ? ` ${change.taper}°` : ""}`
  return {
    ok: true, volume: built.report.volume, volumeChange: built.report.volumeChange,
    element: { type: "brep", name: `${base} hole ${hole + 1} ${what}`, brep: built.brep, x: 0, y: 0, z: 0 }
  }
}

/** Resize the `boss`-th recognised boss of an element (the order `ExactAnalysis.bosses` lists them in) into a new solid. */
export const editElementBoss = (
  element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>>, boss: number, diameter: number, taper = 0
): { readonly ok: true; readonly element: Record<string, unknown>; readonly volume: number; readonly volumeChange: number } | { readonly ok: false; readonly error: string } => {
  let built: ReturnType<typeof sceneBossEditBody>
  try { built = sceneBossEditBody(all, String(element["id"] ?? ""), boss, diameter, taper) } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }
  if (!built.ok) return built
  const base = typeof element["name"] === "string" && element["name"] !== "" ? (element["name"] as string) : String(element["type"] ?? "part")
  return {
    ok: true, volume: built.report.volume, volumeChange: built.report.volumeChange,
    element: { type: "brep", name: `${base} boss ${boss + 1} Ø${Math.round(diameter * 1000) / 1000}${taper ? ` ${taper}°` : ""}`, brep: built.brep, x: 0, y: 0, z: 0 }
  }
}
