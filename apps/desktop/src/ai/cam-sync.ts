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
import { useCADStore } from "../cad/store/cadStore.ts"
import type { AppState } from "../state/context.ts"
import { makeToolpathGenerator, type VerifyResponse } from "../cam/api/generator.ts"
import { useCamStore } from "../cam/store/camStore.ts"
import { useGeneratorStore, type ToolpathSettings } from "../cam/store/generatorStore.ts"
import { useVerifyStore } from "../cam/store/verifyStore.ts"

const CAM_TOOLS = ["cam_create_operation", "cam_update_operation", "cam_generate_gcode", "cam_verify_toolpath"] as const
type CamTool = (typeof CAM_TOOLS)[number]

const toolOf = (tool: string): CamTool | undefined => CAM_TOOLS.find((name) => tool.endsWith(name))

const parse = (text: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
  } catch { return {} }
}

/** The operation a CAM tool call was about: its result for `create`, its input for the others. */
export const operationIdOf = (tool: string, input: unknown, output: string): string | undefined => {
  const result = parse(output)
  if (result["ok"] === false || typeof result["error"] === "string") return undefined
  const fromInput = input !== null && typeof input === "object" ? (input as { operationId?: unknown }).operationId : undefined
  const id = toolOf(tool) === "cam_create_operation" ? result["operationId"] : fromInput ?? result["operationId"]
  return typeof id === "string" && id !== "" ? id : undefined
}

interface OperationRow {
  readonly gcode: string | null
  readonly data: { readonly request?: { readonly settings?: ToolpathSettings }; readonly verification?: { readonly report?: VerifyResponse } } | null
}

/** Reads the operation back and mirrors it into the CAM stores. Best effort: a failure leaves the page as it was. */
export async function mirrorCamResult(app: AppState, tool: string, input: unknown, output: string): Promise<boolean> {
  if (tool.endsWith("cam_stock")) {
    const result = parse(output)
    if (result["ok"] !== true || result["action"] !== "set") return false
    const stock = Schema.decodeUnknownSync(coreCam.generator.StockSchema)(result["stock"])
    useCADStore.getState().setWorkpiece({ ...useCADStore.getState().workpiece, ...stock, configured: true, material: stock.material ?? "", elementId: stock.elementId })
    useCamStore.getState().setWorkpiece({ x: stock.width, y: stock.height, z: stock.depth })
    useCamStore.getState().setStockAllowance(stock.allowance)
    useCamStore.getState().setSelectedWorkpieceElementId(stock.elementId ?? null)
    useCamStore.getState().setGcode("")
    useGeneratorStore.getState().setResult("", [])
    useCamStore.getState().setProgram(coreCam.makeProgram("untitled", [], {}))
    useVerifyStore.getState().reset()
    return true
  }
  const kind = toolOf(tool)
  if (kind === undefined) return false
  const id = operationIdOf(tool, input, output)
  if (id === undefined) return false
  try {
    const row = await app.runtime.run(app.client.toolpaths.get({ params: { id } })) as unknown as OperationRow
    const settings = row.data?.request?.settings
    // Set directly: the panel's own `replaceSettings` would re-apply material presets over the assistant's values.
    if (settings !== undefined) useGeneratorStore.setState({ settings })
    const cam = useCamStore.getState()
    cam.setSelectedOperationId(id)
    if (kind === "cam_create_operation" || kind === "cam_update_operation") {
      cam.setGcode("")
      cam.setProgram(coreCam.makeProgram("untitled", [], {}))
      useGeneratorStore.getState().setResult("", [])
      useVerifyStore.getState().reset()
      return settings !== undefined
    }
    const gcode = row.gcode ?? ""
    if (gcode.trim() === "") return settings !== undefined
    cam.setGcode(gcode)
    useGeneratorStore.getState().setResult(gcode, [])
    const parsed = await app.runtime.run(makeToolpathGenerator(app.client).parse(gcode))
    cam.setProgram(parsed.program as never)
    const report = row.data?.verification?.report
    if (kind === "cam_verify_toolpath" && report !== undefined) {
      useVerifyStore.getState().finish(report, gcode)
      cam.setRightTab("verify")
    }
    return true
  } catch (cause) {
    console.error("Could not mirror the CAM result into the page", cause)
    return false
  }
}
