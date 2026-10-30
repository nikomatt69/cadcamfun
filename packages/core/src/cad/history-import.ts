/**
 * An imported STEP body as the base of a history (spec 72 step 2.2, second half; spec 42 R6).
 *
 * `importStepToHistory` reads a STEP file with the exact reader, validates every solid, heals the ones a foreign exporter wrote
 * per face (`healBrep`: welds, re-projects the corners and refits curves within the healing tolerance), and turns each healed
 * solid into an `imported` feature. A body that is not a valid closed solid after healing is *refused*, with the diagnostics of
 * the heal (the open edges and the gap to their nearest copy, or the validator's issues); nothing is passed on in a state the
 * Boolean would then fail on far from the cause. A body that healed but still carries a tolerance above the declared limit
 * is accepted and said to be loose: it can be worked on, and STEP export refuses it until it is tightened or allowed.
 *
 * The features go into a history with `withImported`; every later feature (hole, pocket, fillet, move, mirror, pattern) then
 * acts on the imported body as on a body the history built itself, in the mesh replay and in the exact replay.
 */
import { healBrep, readStepBreps, validateBrep, type Brep, type HealOptions, type HealReport } from "./brep/index.ts"
import { looseFaceIndices, toleranceLimit } from "./brep/tolerance.ts"
import type { Feature, History, ImportedFeature } from "./history.ts"

export interface ImportedBodyReport {
  readonly name: string
  /** `exact`: valid as written; `healed`: valid after healing; `refused`: not a closed solid after healing. */
  readonly status: "exact" | "healed" | "refused"
  readonly faces: number
  readonly volume?: number
  /** The largest vertex or edge tolerance of the body that was kept (or, for a refused body, of the healed attempt), mm. */
  readonly maxTolerance: number
  /** The declared tolerance limit for this body, mm. */
  readonly limit: number
  /** The body is accepted but a face is flagged loose or the tolerance is above the limit. */
  readonly loose: boolean
  /** Why a body was refused (and what a larger tolerance would have to close); empty otherwise. */
  readonly diagnostics: ReadonlyArray<string>
  readonly healed?: Pick<HealReport, "verticesWelded" | "edgesWelded" | "verticesTightened" | "edgesRefitted" | "circlesRefitted" | "maxMove">
}

export interface HistoryImport {
  /** One `imported` feature per accepted solid, ids `<prefix><n>`. */
  readonly features: ReadonlyArray<ImportedFeature>
  readonly report: ReadonlyArray<ImportedBodyReport>
  /** The refused bodies (a subset of `report`). */
  readonly refused: ReadonlyArray<ImportedBodyReport>
  readonly warnings: ReadonlyArray<string>
}

export interface HistoryImportOptions {
  /** Healing options (welding tolerance, tightening, loose limit). */
  readonly heal?: HealOptions
  /** Feature id prefix (default `imported`). */
  readonly idPrefix?: string
}

/** Reads a STEP file into `imported` features. Never throws for a bad body: it is reported as refused. */
export const importStepToHistory = (text: string, options: HistoryImportOptions = {}): HistoryImport => {
  const read = readStepBreps(text)
  const prefix = options.idPrefix ?? "imported"
  const features: ImportedFeature[] = []
  const report: ImportedBodyReport[] = []
  const warnings = [...read.warnings]
  read.parts.forEach((part, index) => {
    const name = part.name === "" ? `body ${index + 1}` : part.name
    const first = validateBrep(part.brep)
    let brep: Brep = part.brep
    let healed: HealReport | undefined
    let status: ImportedBodyReport["status"] = "exact"
    let valid = first.valid && first.manifoldSolid
    if (!valid) {
      const h = healBrep(part.brep, options.heal)
      healed = h.report
      status = "healed"
      brep = h.brep
      valid = h.report.after.valid && h.report.after.manifoldSolid
      if (!valid) {
        const why = h.report.diagnostics.length > 0 ? h.report.diagnostics : h.report.after.issues.slice(0, 6).map((i) => i.message)
        const open = h.report.after.valid && !h.report.after.manifoldSolid
        report.push({
          name, status: "refused", faces: part.brep.faces.length, maxTolerance: h.report.maxTolerance, limit: toleranceLimit(h.brep), loose: false,
          diagnostics: [
            open ? "the shell is open after healing: a surface body is not a solid" : `not a closed solid after healing (${h.report.after.issues.length} issue(s))`,
            ...why,
            ...(h.report.closestOpenGap !== undefined ? [`closing the nearest open gap needs a healing tolerance of at least ${h.report.closestOpenGap.toExponential(2)} mm (it was ${h.report.tol.toExponential(1)} mm)`] : [])
          ]
        })
        return
      }
    }
    const rep = validateBrep(brep)
    const limit = toleranceLimit(brep)
    const maxTol = rep.maxTolerance ?? 0
    const flagged = looseFaceIndices(brep)
    const loose = flagged.length > 0 || maxTol > limit
    const summary = healed === undefined ? undefined : { verticesWelded: healed.verticesWelded, edgesWelded: healed.edgesWelded, verticesTightened: healed.verticesTightened, edgesRefitted: healed.edgesRefitted, circlesRefitted: healed.circlesRefitted, maxMove: healed.maxMove }
    if (loose) warnings.push(`${name}: the healed body is loose (largest tolerance ${maxTol.toExponential(2)} mm against the limit ${limit.toExponential(1)} mm, ${flagged.length} face(s) flagged); it can be modelled on, but STEP export refuses it unless allowed`)
    report.push({ name, status, faces: brep.faces.length, ...(rep.volume !== undefined ? { volume: rep.volume } : {}), maxTolerance: maxTol, limit, loose, diagnostics: [], ...(summary !== undefined ? { healed: summary } : {}) })
    features.push({
      id: `${prefix}${index + 1}`,
      type: "imported",
      brep,
      operation: "new",
      source: { format: "step", name, ...(summary !== undefined ? { healed: { verticesWelded: summary.verticesWelded, edgesWelded: summary.edgesWelded, verticesTightened: summary.verticesTightened, maxMove: summary.maxMove } } : {}), maxTolerance: maxTol }
    })
  })
  return { features, report, refused: report.filter((r) => r.status === "refused"), warnings }
}

/** The history with the imported bodies in front of its features (they are base bodies), ids made unique against the history's. */
export const withImported = (history: History, imported: HistoryImport | ReadonlyArray<ImportedFeature>): History => {
  const list = Array.isArray(imported) ? (imported as ReadonlyArray<ImportedFeature>) : (imported as HistoryImport).features
  const taken = new Set(history.features.map((f) => f.id))
  const fresh = list.map((f): Feature => {
    let id = f.id
    for (let n = 2; taken.has(id); n++) id = `${f.id}-${n}`
    taken.add(id)
    return id === f.id ? f : { ...f, id }
  })
  return { ...history, features: [...fresh, ...history.features] }
}
