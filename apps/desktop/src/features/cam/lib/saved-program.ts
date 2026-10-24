import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamKernelArtifact, CamKernelRequest, CamProgramDocument, type ToolpathRow } from "@cadcamfun/api"
import type { AppState } from "../../../shared/state/context.ts"
import { toJsonSafe } from "../../../shared/state/json-safe.ts"
import { drawingPayload } from "../../cad/lib/projectSnapshot.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { combineOperationResults, useCamStore } from "../store/camStore.ts"
import { restoreKernelSettings, useGeneratorStore } from "../store/generatorStore.ts"
import { useVerifyStore } from "../store/verifyStore.ts"
import { makeToolpathGenerator } from "../api/generator.ts"
import { t } from "../../../i18n/index.ts"

/** A portable program is also the JSON stored in the existing Toolpath.data column. */
export const SavedCamProgram = CamProgramDocument
export type SavedCamProgram = typeof SavedCamProgram.Type

/** Shared-state refreshes may replace a clean program; a local code, settings or stock edit keeps its ownership. */
export const camEditorRevision = (): string => {
  const store = useCamStore.getState(), generator = useGeneratorStore.getState()
  return cam.kernel.sha256(JSON.stringify([store.gcode, generator.settings, generator.printer,
    useCADStore.getState().workpiece, store.operationResults, store.kernelArtifact, store.kernelRequest]))
}
export const storedProgramRevision = (row: { readonly gcode?: string | null; readonly data: unknown }): string =>
  cam.kernel.sha256(JSON.stringify([row.gcode ?? "", row.data]))

export const snapshotCamProgram = async (app: AppState, gcode: string): Promise<SavedCamProgram> => {
  const store = useCamStore.getState(), generator = useGeneratorStore.getState()
  const artifact = store.kernelArtifact?.nc === gcode && cam.kernel.sha256(gcode) === store.kernelArtifact.identity.nc ? store.kernelArtifact : undefined
  const request = artifact ? store.kernelRequest : undefined
  const operations = !artifact && store.operationResults.length > 0 && combineOperationResults(store.operationResults).gcode === gcode ? store.operationResults : undefined
  const stock = artifact ? {
    ...useCADStore.getState().workpiece,
    width: artifact.stockBounds.max.x - artifact.stockBounds.min.x, height: artifact.stockBounds.max.y - artifact.stockBounds.min.y, depth: artifact.stockBounds.max.z - artifact.stockBounds.min.z,
    x: (artifact.stockBounds.max.x + artifact.stockBounds.min.x) / 2, y: (artifact.stockBounds.max.y + artifact.stockBounds.min.y) / 2
  } : useCADStore.getState().workpiece
  const drawing = drawingPayload(app)
  if (request?.stock) drawing["stock"] = request.stock
  const snapshot = structuredClone(toJsonSafe({ settings: generator.settings, printer: generator.printer, stock, drawing, ...(operations ? { operations } : {}), ...(request ? { kernelRequest: request } : {}) })) as Record<string, unknown>
  // Parse the captured bytes, never the delayed editor preview, which may belong to earlier NC.
  const program = artifact?.program ?? (operations ? combineOperationResults(operations).program : (await app.runtime.run(makeToolpathGenerator(app.client).parse(gcode))).program)
  return Schema.decodeUnknownSync(SavedCamProgram)({ format: "cadcamfun-cam", version: 1, gcode, program, ...snapshot, ...(artifact ? { kernelArtifact: artifact } : {}) })
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Keep free-form metadata, but never attach earlier verification to changed program bytes. */
export const savedProgramData = (previous: unknown, snapshot: SavedCamProgram): Record<string, unknown> => {
  const data = { ...record(previous) }
  for (const key of ["kernelArtifact", "kernelRequest", "turningPlan", "turningRequest", "identity", "verification", "response", "sourceRevision", "operations"]) delete data[key]
  const old = record(previous), oldArtifact = record(old["kernelArtifact"])
  if (snapshot.kernelArtifact && oldArtifact["nc"] === snapshot.gcode && typeof old["sourceRevision"] === "string") data["sourceRevision"] = old["sourceRevision"]
  return { ...data, ...Schema.encodeSync(SavedCamProgram)(snapshot) }
}

export const restoreCamProgram = async (app: AppState, row: Pick<ToolpathRow, "id" | "name" | "gcode" | "data" | "projectId" | "drawingId"> & Partial<Pick<ToolpathRow, "description" | "isPublic">>, current: () => boolean): Promise<void> => {
  const code = row.gcode ?? "", data = record(row.data)
  let snapshot: SavedCamProgram | undefined
  if (data["format"] === "cadcamfun-cam") snapshot = Schema.decodeUnknownSync(SavedCamProgram)(data)
  let artifact: cam.kernel.CamArtifact | undefined
  if (data["kernelArtifact"] !== undefined) {
    try {
      const decoded = Schema.decodeUnknownSync(CamKernelArtifact)(data["kernelArtifact"])
      if (decoded.nc === code && decoded.identity.nc === cam.kernel.sha256(code) && decoded.release !== "blocked") artifact = decoded
    } catch { /* Older stored metadata can still be opened as ordinary G-code. */ }
  }
  const program = artifact?.program ?? (snapshot?.gcode === code ? snapshot.program : (await app.runtime.run(makeToolpathGenerator(app.client).parse(code))).program)
  if (!current()) return
  const store = useCamStore.getState(), generator = useGeneratorStore.getState()
  store.clearOperationResults()
  if (snapshot?.gcode === code && snapshot.operations?.length && combineOperationResults(snapshot.operations).gcode === code) {
    for (const operation of snapshot.operations) store.upsertOperationResult(operation)
  }
  useVerifyStore.getState().reset()
  store.setKernelArtifact(artifact)
  store.setKernelRequest(data["kernelRequest"] !== undefined ? Schema.decodeUnknownSync(CamKernelRequest)(data["kernelRequest"]) : undefined)
  store.setGcode(code)
  store.setProgram(program)
  store.setActiveTab("editor")
  if (snapshot) {
    useGeneratorStore.setState({ settings: snapshot.settings, printer: snapshot.printer })
    useCADStore.getState().setWorkpiece({ ...useCADStore.getState().workpiece, ...snapshot.stock, configured: true })
    store.setWorkpiece({ x: snapshot.stock.width, y: snapshot.stock.height, z: snapshot.stock.depth })
    store.setStockAllowance(snapshot.stock.allowance)
  }
  generator.setResult(code, [])
  if (store.kernelRequest) restoreKernelSettings(store.kernelRequest)
  store.setSavedProgram(row.id ? { id: row.id, name: row.name, projectId: row.projectId, drawingId: row.drawingId,
    description: row.description ?? null, isPublic: row.isPublic ?? false, editorRevision: camEditorRevision(), storedRevision: storedProgramRevision(row) } : undefined)
}

export const reconcileSavedProgram = async (app: AppState, current: () => boolean): Promise<void> => {
  const saved = useCamStore.getState().savedProgram
  const clean = () => current() && useCamStore.getState().savedProgram?.id === saved?.id && saved?.editorRevision === camEditorRevision()
  if (!saved?.editorRevision || !clean()) return
  const row = await app.runtime.run(app.client.toolpaths.get({ params: { id: saved.id } }))
  if (!clean() || saved.storedRevision === storedProgramRevision(row)) return
  await restoreCamProgram(app, row, clean)
}

export const downloadCamFile = (contents: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  try { link.href = url; link.download = filename; document.body.appendChild(link); link.click() }
  finally { link.remove(); URL.revokeObjectURL(url) }
}

/** The stored program was changed by someone else (the phone, another window) since this editor read it. */
export class ProgramConflict extends Error {
  readonly retryable = false
  constructor(readonly programId: string) {
    super(t("save.programChangedElsewhere"))
    this.name = "ProgramConflict"
  }
}

/** A version of the replaced program is kept at most this often by automatic saves (a manual save always keeps one). */
export const PROGRAM_VERSION_INTERVAL_MS = 10 * 60_000
const lastVersionAt = new Map<string, number>()

/**
 * Writes the editor's program over the stored one it was opened from (or last saved as), keeping the replaced program as a
 * version. `auto` is the unattended path: it refuses to overwrite a program that changed elsewhere (`ProgramConflict`, which
 * the user resolves with a manual save), keeps a version only every `PROGRAM_VERSION_INTERVAL_MS`, and never replaces a
 * post-processed program with the raw one. Returns the editor revision that was written.
 */
export const updateSavedProgram = async (
  app: AppState,
  options: { readonly auto: boolean; readonly gcode?: string; readonly name?: string; readonly description?: string | null; readonly isPublic?: boolean; readonly now?: () => number }
): Promise<string> => {
  const saved = useCamStore.getState().savedProgram
  if (!saved) throw Object.assign(new Error(t("save.noProgram")), { retryable: false })
  const store = useCamStore.getState()
  const gcode = options.gcode ?? store.gcode
  if (options.auto && saved.postProcessed) throw Object.assign(new Error(t("save.postProcessed")), { retryable: false })
  if (gcode.trim() === "") throw Object.assign(new Error(t("save.emptyProgram")), { retryable: false })
  const started = camEditorRevision()
  const snapshot = await snapshotCamProgram(app, gcode)
  const settings = snapshot.settings
  const previous = await app.runtime.run(app.client.toolpaths.get({ params: { id: saved.id } }))
  if (options.auto && saved.storedRevision !== undefined && storedProgramRevision(previous) !== saved.storedRevision) throw new ProgramConflict(saved.id)
  const now = (options.now ?? Date.now)()
  if (!options.auto || now - (lastVersionAt.get(saved.id) ?? 0) >= PROGRAM_VERSION_INTERVAL_MS) {
    // Preserve the previous complete program before replacing it; the detail screen can restore this version.
    await app.runtime.run(app.client.toolpathExtras.createVersion({ params: { id: saved.id }, payload: { data: previous.data, gcode: previous.gcode ?? "", changeMessage: t(options.auto ? "save.autoVersion" : "cam.save.previousVersion") } }))
    lastVersionAt.set(saved.id, now)
  }
  const description = options.description !== undefined ? options.description : saved.description ?? null
  const row = await app.runtime.run(app.client.toolpaths.update({ params: { id: saved.id }, payload: {
    name: options.name ?? saved.name, description, isPublic: options.isPublic ?? saved.isPublic ?? false, gcode: snapshot.gcode, type: settings.machineType,
    operationType: snapshot.kernelArtifact ? "kernel" : (snapshot.operations?.length ?? 0) > 1 ? "multi-operation" : settings.operationType,
    data: savedProgramData(previous.data, snapshot)
  } }))
  // The revision of what was written, not of what the editor holds now: an edit made during the save stays unsaved.
  const current = useCamStore.getState().savedProgram
  if (current?.id === saved.id) {
    const linked = { id: row.id, name: row.name, projectId: row.projectId, drawingId: row.drawingId, description: row.description, isPublic: row.isPublic, storedRevision: storedProgramRevision(row) }
    // Post-processed text is stored but the editor's program is not what was written: the link keeps its editor revision and
    // is flagged, so autosave leaves the stored text alone until the user saves it themselves.
    useCamStore.getState().setSavedProgram(gcode === store.gcode ? { ...linked, editorRevision: started, postProcessed: false } : { ...linked, ...(current.editorRevision !== undefined ? { editorRevision: current.editorRevision } : {}), postProcessed: true })
  }
  return started
}
