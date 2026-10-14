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

/** A portable program is also the JSON stored in the existing Toolpath.data column. */
export const SavedCamProgram = CamProgramDocument
export type SavedCamProgram = typeof SavedCamProgram.Type

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
  for (const key of ["kernelArtifact", "kernelRequest", "verification", "response", "sourceRevision", "operations"]) delete data[key]
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
  store.setSavedProgram(row.id ? { id: row.id, name: row.name, projectId: row.projectId, drawingId: row.drawingId, description: row.description ?? null, isPublic: row.isPublic ?? false } : undefined)
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
}

export const downloadCamFile = (contents: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  try { link.href = url; link.download = filename; document.body.appendChild(link); link.click() }
  finally { link.remove(); URL.revokeObjectURL(url) }
}
