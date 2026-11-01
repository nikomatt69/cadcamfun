/**
 * An imported STEP body as the base of a history (spec 72 step 2.2, second half; spec 42 R6).
 *
 * `importStepToHistory` reads a STEP file with the exact reader, validates every solid, heals the ones a foreign exporter wrote
 * per face (`healBrep`: welds, re-projects the corners and refits curves within the healing tolerance), and keeps each healed
 * solid as a base body (`ImportedBase`). A body that is not a valid closed solid after healing is *refused*, with the diagnostics
 * of the heal (the open edges and the gap to their nearest copy, or the validator's issues); nothing is passed on in a state the
 * Boolean would then fail on far from the cause. A body that healed but still carries a tolerance above the declared limit
 * is accepted and said to be loose: it can be worked on, and STEP export refuses it until it is tightened or allowed.
 *
 * The bodies go into a history with `withImported` (`History.bases`); every later feature (hole, pocket, fillet, move, mirror,
 * pattern) then acts on the imported body as on a body the history built itself, in the mesh replay and in the exact replay.
 */
import { BREP_LIMITS, MAX_BASES, MAX_BASES_BYTES, brepFromJson, brepToJson, formatPath, healBrep, readStepBreps, validateBrep, type Brep, type BrepLimits, type HealOptions, type HealReport } from "./brep/index.ts"
import { looseFaceIndices, toleranceLimit } from "./brep/tolerance.ts"
import type { History, ImportedBase } from "./history.ts"
import { bodyCreator, bodyRefs } from "./history-timeline.ts"

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
  /** One base body per accepted solid, ids `<prefix><n>`. */
  readonly bases: ReadonlyArray<ImportedBase>
  readonly report: ReadonlyArray<ImportedBodyReport>
  /** The refused bodies (a subset of `report`). */
  readonly refused: ReadonlyArray<ImportedBodyReport>
  readonly warnings: ReadonlyArray<string>
}

export interface HistoryImportOptions {
  /** Healing options (welding tolerance, tightening, loose limit). */
  readonly heal?: HealOptions
  /** Body id prefix (default `imported`). */
  readonly idPrefix?: string
  /** What one stored body may weigh (default `BREP_LIMITS`); a body above it is refused with the reason. */
  readonly limits?: BrepLimits
}

/**
 * Why a body cannot be stored as a base: too many faces or characters (`BrepLimits`), or a shape the JSON form refuses (a number
 * that is not finite, an index that points nowhere). Undefined when it can be stored.
 */
export const baseStorageProblem = (brep: Brep, limits: BrepLimits = BREP_LIMITS): string | undefined => {
  let json: ReturnType<typeof brepToJson>
  try { json = brepToJson(brep) } catch (error) { return error instanceof Error ? error.message : String(error) }
  const decoded = brepFromJson(json, limits)
  if (decoded.ok) return undefined
  const first = decoded.problems[0]!
  return `${formatPath(first.path)}: ${first.message}`
}

/** Reads a STEP file into base bodies. Never throws for a bad body: it is reported as refused. */
export const importStepToHistory = (text: string, options: HistoryImportOptions = {}): HistoryImport => {
  const read = readStepBreps(text)
  const prefix = options.idPrefix ?? "imported"
  const bases: ImportedBase[] = []
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
    const stored = baseStorageProblem(brep, options.limits)
    if (stored !== undefined || bases.length >= MAX_BASES) {
      report.push({
        name, status: "refused", faces: brep.faces.length, maxTolerance: validateBrep(brep).maxTolerance ?? 0, limit: toleranceLimit(brep), loose: false,
        diagnostics: [stored !== undefined ? `too large or not storable as a base body: ${stored}` : `a history holds at most ${MAX_BASES} imported bodies`]
      })
      return
    }
    const rep = validateBrep(brep)
    const limit = toleranceLimit(brep)
    const maxTol = rep.maxTolerance ?? 0
    const flagged = looseFaceIndices(brep)
    const loose = flagged.length > 0 || maxTol > limit
    const summary = healed === undefined ? undefined : { verticesWelded: healed.verticesWelded, edgesWelded: healed.edgesWelded, verticesTightened: healed.verticesTightened, edgesRefitted: healed.edgesRefitted, circlesRefitted: healed.circlesRefitted, maxMove: healed.maxMove }
    if (loose) warnings.push(`${name}: the healed body is loose (largest tolerance ${maxTol.toExponential(2)} mm against the limit ${limit.toExponential(1)} mm, ${flagged.length} face(s) flagged); it can be modelled on, but STEP export refuses it unless allowed`)
    report.push({ name, status, faces: brep.faces.length, ...(rep.volume !== undefined ? { volume: rep.volume } : {}), maxTolerance: maxTol, limit, loose, diagnostics: [], ...(summary !== undefined ? { healed: summary } : {}) })
    bases.push({
      id: `${prefix}${index + 1}`,
      brep,
      source: { format: "step", name, ...(summary !== undefined ? { healed: { verticesWelded: summary.verticesWelded, edgesWelded: summary.edgesWelded, verticesTightened: summary.verticesTightened, maxMove: summary.maxMove } } : {}), maxTolerance: maxTol }
    })
  })
  return { bases, report, refused: report.filter((r) => r.status === "refused"), warnings }
}

/**
 * The history with the imported bodies as its base bodies (`History.bases`), ids made unique against the bodies already there and
 * the features' ids (a feature id is also a body id). Bodies already in the history stay first.
 */
export const withImported = (history: History, imported: HistoryImport | ReadonlyArray<ImportedBase>): History => {
  const list = Array.isArray(imported) ? (imported as ReadonlyArray<ImportedBase>) : (imported as HistoryImport).bases
  const taken = new Set([...history.features.map((f) => f.id), ...(history.bases ?? []).map((b) => b.id)])
  const fresh = list.map((b): ImportedBase => {
    let id = b.id
    for (let n = 2; taken.has(id); n++) id = `${b.id}-${n}`
    taken.add(id)
    return id === b.id ? b : { ...b, id }
  })
  return { ...history, bases: [...(history.bases ?? []), ...fresh] }
}

/** The features that name an imported body (`targets`, `body`, `bodies`, `tools`, ...), by id. */
export const importedUses = (history: History, id: string): ReadonlyArray<string> =>
  history.features.filter((f) => bodyRefs(f).some((ref) => ref === id || bodyCreator(ref) === id)).map((f) => f.id)

/**
 * The history without one imported body. A body that a feature names is not dropped silently: the refusal lists the features, which
 * the person removes or retargets first. A feature that acts on "the bodies built so far" without naming it simply no longer sees it.
 */
export const removeImported = (history: History, id: string): { readonly history: History; readonly refusal?: string } => {
  if (!(history.bases ?? []).some((b) => b.id === id)) return { history, refusal: `'${id}' is not an imported body of this history` }
  const uses = importedUses(history, id)
  if (uses.length > 0) return { history, refusal: `'${id}' is named by ${uses.join(", ")}` }
  const bases = (history.bases ?? []).filter((b) => b.id !== id)
  const { bases: _gone, ...rest } = history
  return { history: bases.length === 0 ? rest : { ...history, bases } }
}

/** The history with each base body in its JSON form (version tag), the form the API, the store and the desktop carry. */
export const historyToJson = (history: History): History =>
  history.bases === undefined ? history : { ...history, bases: history.bases.map((b) => ({ ...b, brep: brepToJson(b.brep) })) }

/** Why the bases of `history` cannot be stored together (their sum is above `MAX_BASES_BYTES`), or undefined. */
export const basesStorageProblem = (history: History): string | undefined => {
  const bases = history.bases ?? []
  if (bases.length > MAX_BASES) return `a history holds at most ${MAX_BASES} imported bodies, this one has ${bases.length}`
  let total = 0
  for (const b of bases) total += JSON.stringify(b.brep).length
  return total > MAX_BASES_BYTES ? `the imported bodies are ${total} characters of JSON together, above the limit of ${MAX_BASES_BYTES}` : undefined
}
