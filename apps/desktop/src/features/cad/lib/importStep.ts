/**
 * A STEP file brought into a parametric part as the base of its history (spec 72 step 2.2): the same `importStepToHistory` the sidecar
 * route and the assistant run, so the desktop, the API and the CAM see one body. All or nothing: a body that is not a closed solid
 * after healing is refused with the heal's diagnostics and nothing is added.
 */
import { basesStorageProblem, historyToJson, importStepToHistory, withImported, type History } from "@cadcamfun/core"

export type StepImportOutcome =
  | { readonly ok: true; readonly history: History; readonly lines: ReadonlyArray<string> }
  | { readonly ok: false; readonly lines: ReadonlyArray<string> }

const mm3 = (v: number): string => `${Math.round(v * 100) / 100} mm³`

/** The history with the solids of `text` added as imported bodies, or why not; `lines` is what the person is told either way. */
export const importStepIntoHistory = (text: string, history: History): StepImportOutcome => {
  let imported: ReturnType<typeof importStepToHistory>
  try { imported = importStepToHistory(text) } catch (cause) {
    return { ok: false, lines: [`The file could not be read as STEP: ${cause instanceof Error ? cause.message : String(cause)}`] }
  }
  const lines = imported.report.map((r) =>
    r.status === "refused"
      ? `${r.name}: refused. ${r.diagnostics.join("; ")}`
      : `${r.name}: ${r.status === "healed" ? "healed" : "exact"}, ${r.faces} faces${r.volume !== undefined ? `, ${mm3(r.volume)}` : ""}${r.loose ? ", loose (STEP export refuses it until tightened)" : ""}`)
  if (imported.refused.length > 0) return { ok: false, lines: [...lines, "Nothing was added."] }
  if (imported.bases.length === 0) return { ok: false, lines: [...lines, "The file holds no solid."] }
  const joined = historyToJson(withImported(history, imported))
  const problem = basesStorageProblem(joined)
  if (problem !== undefined) return { ok: false, lines: [...lines, `Not added: ${problem}`] }
  return { ok: true, history: joined, lines: [...lines, ...imported.warnings] }
}
