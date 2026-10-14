/**
 * Shows what the assistant did on a CAM operation in the CAM page.
 *
 * The tools work on stored operations in the sidecar; the page shows its own editor, program and verification. When
 * a CAM tool finishes, this reads the operation back and puts its settings in the generator, its G-code in the editor
 * (and the program in the preview), and its verification report in the Verify tab, so the user sees the same thing
 * the assistant is talking about.
 */
import { cam as coreCam } from "@cadcamfun/core"
import { Schema } from "effect"
import { CamKernelArtifact, CamKernelRequest } from "@cadcamfun/api"
import { useCADStore } from "../../cad/store/cadStore.ts"
import type { AppState } from "../../../shared/state/context.ts"
import { makeToolpathGenerator, type VerifyResponse } from "../../cam/api/generator.ts"
import { useCamStore } from "../../cam/store/camStore.ts"
import { restoreKernelSettings, useGeneratorStore, type ToolpathSettings } from "../../cam/store/generatorStore.ts"
import { useVerifyStore } from "../../cam/store/verifyStore.ts"
import { captureEditorOwner, type EditorOwner } from "./editor-sync.ts"

/** The four actions whose result changes what the CAM page shows; the key is `tool.action`. */
const CAM_ACTIONS = ["create", "update", "generate", "verify", "manufacture"] as const
type CamAction = (typeof CAM_ACTIONS)[number]

/**
 * Which CAM action a call is, from its `tool.action` key. `cam_edit.create` names the operation in its result (there was
 * no id to ask for), the other three in their input or their result — so `create` and the rest are read differently below.
 */
const actionOfKey = (key: string): CamAction | undefined =>
  CAM_ACTIONS.find((action) => key === `cam_edit.${action}` || key.endsWith(`.${action}`) || key.endsWith(action))
const isStockSet = (key: string): boolean => key === "cam_edit.stock_set" || key === "cam.stock_set" || key.endsWith("cam_stock")

const parse = (text: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
  } catch { return {} }
}

/** The operation a CAM call was about: `create` names it in its result, the other actions in the input they were given. */
export const operationIdOf = (key: string, input: unknown, output: string): string | undefined => {
  const result = parse(output)
  if (result["ok"] === false || typeof result["error"] === "string") return undefined
  // A receipt is evidence of an earlier commit, not a fresh operation edit to mirror from this call's input.
  if (result["_tag"] === "ActionCommitted") return undefined
  const fromInput = input !== null && typeof input === "object" ? (input as { operationId?: unknown }).operationId : undefined
  const id = actionOfKey(key) === "create" ? result["operationId"] : fromInput ?? result["operationId"]
  return typeof id === "string" && id !== "" ? id : undefined
}

interface OperationRow {
  readonly description?: string | null
  readonly isPublic?: boolean
  readonly name?: string | null
  readonly gcode: string | null
  readonly data: { readonly request?: { readonly settings?: ToolpathSettings }; readonly verification?: { readonly report?: VerifyResponse } } | null
  readonly drawingId?: string | null
  readonly projectId?: string | null
}

/** `key` is the call's action key (`cam_edit.generate`). Reads the operation back and mirrors it into the CAM stores. Best effort: a failure leaves the page as it was. */
export async function mirrorCamResult(app: AppState, key: string, input: unknown, output: string, owner: EditorOwner = captureEditorOwner()): Promise<boolean> {
  if (!owner.current()) return false
  if (isStockSet(key)) {
    const result = parse(output)
    if (result["ok"] !== true || result["action"] !== "set") return false
    const stock = Schema.decodeUnknownSync(coreCam.generator.StockSchema)(result["stock"])
    if (!owner.current()) return false
    useCADStore.getState().setWorkpiece({ ...useCADStore.getState().workpiece, ...stock, configured: true, material: stock.material ?? "", elementId: stock.elementId })
    useCamStore.getState().setWorkpiece({ x: stock.width, y: stock.height, z: stock.depth })
    useCamStore.getState().setStockAllowance(stock.allowance)
    useCamStore.getState().setSelectedWorkpieceElementId(stock.elementId ?? null)
    // A new stock invalidates every program generated on the old one.
    useCamStore.getState().clearOperationResults()
    useGeneratorStore.getState().setResult("", [])
    useVerifyStore.getState().reset()
    return true
  }
  const kind = actionOfKey(key)
  if (kind === undefined) return false
  const id = operationIdOf(key, input, output)
  if (id === undefined || !owner.current()) return false
  try {
    const row = await app.runtime.run(app.client.toolpaths.get({ params: { id } })) as unknown as OperationRow
    if (!owner.current()) return false
    if (kind === "manufacture") {
      if (owner.projectId !== row.projectId || owner.drawingId !== row.drawingId) return false
      const data = row.data as Record<string, unknown> | null
      const artifact = Schema.decodeUnknownSync(CamKernelArtifact)(data?.["kernelArtifact"])
      if (artifact.nc !== row.gcode || coreCam.kernel.sha256(artifact.nc) !== artifact.identity.nc || artifact.release === "blocked" || !owner.current()) return false
      const cam = useCamStore.getState()
      cam.clearOperationResults()
      cam.setKernelArtifact(artifact)
      cam.setKernelRequest(data?.["kernelRequest"] !== undefined ? Schema.decodeUnknownSync(CamKernelRequest)(data["kernelRequest"]) : undefined)
      if (cam.kernelRequest) restoreKernelSettings(cam.kernelRequest)
      cam.setSelectedOperationId(id)
      if (row.projectId) cam.setSavedProgram({ id, name: row.name ?? "Native CAM program", projectId: row.projectId, drawingId: row.drawingId ?? null, description: row.description ?? null, isPublic: row.isPublic ?? false })
      cam.setGcode(artifact.nc)
      cam.setProgram(artifact.program)
      useGeneratorStore.getState().setResult(artifact.nc, [])
      useVerifyStore.getState().reset()
      return true
    }
    const settings = row.data?.request?.settings
    const gcode = row.gcode ?? ""
    const parsesProgram = kind !== "create" && kind !== "update" && gcode.trim() !== ""
    const parsed = parsesProgram ? await app.runtime.run(makeToolpathGenerator(app.client).parse(gcode)) : undefined
    const report = row.data?.verification?.report
    if (!owner.current()) return false
    // Set directly: the panel's own `replaceSettings` would re-apply material presets over the assistant's values.
    if (settings !== undefined) useGeneratorStore.setState({ settings })
    const cam = useCamStore.getState()
    cam.setSelectedOperationId(id)
    if (kind === "create" || kind === "update") {
      // Only this operation's program is stale; the programs of the other operations stay on the page.
      cam.removeOperationResult(id)
      useGeneratorStore.getState().setResult("", [])
      useVerifyStore.getState().reset()
      return settings !== undefined
    }
    if (gcode.trim() === "") return settings !== undefined
    const name = typeof row.name === "string" && row.name !== "" ? row.name : settings?.operationType ?? id
    const tool = settings !== undefined ? `${settings.toolType} Ø${settings.toolDiameter}` : undefined
    cam.upsertOperationResult({ id, name, gcode, program: (parsed?.program as never) ?? coreCam.makeProgram(name, [], {}), ...(tool !== undefined ? { tool } : {}), ...(settings !== undefined ? { settings } : {}) })
    useGeneratorStore.getState().setResult(gcode, [])
    if (kind === "verify" && report !== undefined) {
      useVerifyStore.getState().finish(report, gcode)
      cam.setRightTab("verify")
    }
    return true
  } catch (cause) {
    console.error("Could not mirror the CAM result into the page", cause)
    return false
  }
}
