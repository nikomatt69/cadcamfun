/**
 * What the assistant knows about the workspace, and how the workspace and the assistant's stored drawing are kept
 * the same document.
 *
 * The context is built from the editor the user is looking at (the elements, layers and selection stores, the
 * generator and the CAM program, the last verification), not from a second model. Before a message is sent the
 * live elements are written into the stored drawing the assistant's tools work on (creating the project and the
 * drawing if there are none), so "what you see" and "what the tools change" are one thing.
 */
import { cam } from "@cadcamfun/core"
import type { AppState } from "../../../shared/state/context.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useLayerStore } from "../../cad/store/layerStore.ts"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"
import { useCamStore } from "../../cam/store/camStore.ts"
import { captureEditorOwner, rememberPushed } from "./editor-sync.ts"
import { useGeneratorStore } from "../../cam/store/generatorStore.ts"
import { useVerifyStore } from "../../cam/store/verifyStore.ts"
import { drawingPayload } from "../../cad/lib/projectSnapshot.ts"

const { estimateTime } = cam

/** Elements listed in the prompt; selected ones come first. */
const MAX_CONTEXT_ELEMENTS = 100
const MAX_GCODE_LINES = 60
const RAPID_RATE_MM_PER_MIN = 5000

const KEYS = ["x", "y", "z", "x1", "y1", "z1", "x2", "y2", "z2", "width", "height", "depth", "radius", "visible", "locked"] as const

const summary = (element: Record<string, unknown>) => ({
  id: element["id"], type: element["type"], name: element["name"], layerId: element["layerId"],
  ...Object.fromEntries(KEYS.filter((key) => element[key] !== undefined).map((key) => [key, element[key]]))
})

/** The verdict of the last verification, in the words the assistant needs. */
export const verificationState = (): { readonly state: "not-run" | "stale" | "ok" | "errors"; readonly errors: number; readonly issues: ReadonlyArray<{ code: string; severity: string; message: string; line?: number }> } => {
  const verify = useVerifyStore.getState()
  const report = verify.report
  if (report === null) return { state: "not-run", errors: 0, issues: [] }
  const errors = report.issues.filter((issue) => issue.severity === "error").length
  const issues = report.issues.slice(0, 8).map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message, ...(issue.line !== undefined ? { line: issue.line } : {}) }))
  if (verify.verifiedGcode !== useCamStore.getState().gcode) return { state: "stale", errors, issues }
  return { state: errors > 0 ? "errors" : "ok", errors, issues }
}

/** The workspace as the assistant sees it. `page` is where the user is: the CAD editor or the CAM page. */
export function currentDrawingContext(app: AppState) {
  const elements = useElementsStore.getState().elements as ReadonlyArray<Record<string, unknown>>
  const selectedIds = new Set(useSelectionStore.getState().selectedElementIds)
  const layers = useLayerStore.getState()
  const cad = useCADStore.getState()
  const camStore = useCamStore.getState()
  const generator = useGeneratorStore.getState()
  const document = useDocumentStore.getState()
  const listed = [...elements.filter((e) => selectedIds.has(String(e["id"]))), ...elements.filter((e) => !selectedIds.has(String(e["id"])))].slice(0, MAX_CONTEXT_ELEMENTS)
  const program = camStore.program
  const gcode = camStore.gcode || generator.currentGCode
  const page = typeof window !== "undefined" && window.location.pathname.startsWith("/cam") ? "cam" : "cad"
  return {
    capturedAt: new Date().toISOString(),
    page,
    projectId: document.projectId,
    drawingId: document.drawingId,
    name: document.name,
    // Every number in a tool call is millimetres, whatever the user reads on screen.
    units: "mm",
    displayUnits: app.settings.settings().units,
    tolerance: app.settings.settings().tolerance,
    decimals: app.settings.settings().decimals,
    viewMode: cad.viewMode,
    coordinateSystem: { axes: "right-handed XYZ; Z up", originOffset: cad.originOffset, positionUnit: "mm", elementRotationUnit: "degrees", section: cad.section },
    totalElementCount: elements.length,
    selectedElementCount: selectedIds.size,
    selectedIds: [...selectedIds],
    elements: listed.map(summary),
    omittedElementCount: Math.max(0, elements.length - listed.length),
    layers: layers.layers.map((layer) => ({ ...layer })),
    activeLayer: layers.layers.find((layer) => layer.id === layers.activeLayer)?.name ?? null,
    workpiece: cad.workpiece,
    cam: {
      gcodeLines: gcode.trim() === "" ? 0 : gcode.split(/\r?\n/).length,
      gcodePreview: gcode.split(/\r?\n/).slice(0, MAX_GCODE_LINES).join("\n"),
      operation: camStore.operation,
      settings: generator.settings,
      material: camStore.material || generator.settings.material,
      controller: camStore.controller,
      postProcessor: app.settings.settings().postProcessor,
      selectedOperationId: camStore.selectedOperationId ?? null,
      toolpaths: program.toolpaths.map((toolpath) => ({
        id: toolpath.id, name: toolpath.name, toolId: toolpath.toolId, moveCount: toolpath.moves.length,
        duration: estimateTime(toolpath, RAPID_RATE_MM_PER_MIN)
      })),
      verification: verificationState()
    }
  }
}

type Run = <A>(effect: unknown) => Promise<A>
const run = (app: AppState): Run => app.runtime.run as unknown as Run

/**
 * The stored drawing the editor and the assistant share. Uses the open document; otherwise the newest project the
 * user has (or a new "Untitled project") and its newest drawing (or a new one holding the live elements), and
 * remembers the choice so every later call agrees.
 */
export async function ensureDocument(app: AppState, adopt?: (document: { projectId: string; drawingId: string }, apply: () => void) => void): Promise<{ projectId: string; drawingId: string }> {
  const owner = captureEditorOwner()
  const current = useDocumentStore.getState()
  if (current.projectId !== null && current.drawingId !== null) return { projectId: current.projectId, drawingId: current.drawingId }
  const elements = useElementsStore.getState().elements
  let projectId = current.projectId ?? app.recents()[0]?.id
  let createdProject: { id: string; name: string } | undefined
  if (projectId !== undefined) {
    await run(app)(app.client.projects.get({ params: { id: projectId } }))
  }
  if (projectId === undefined) {
    const project = await run(app)<{ id: string; name: string }>(app.client.projects.create({ payload: { name: "Untitled project", description: null, organizationId: null, isPublic: false } }))
    projectId = project.id
    createdProject = project
  }
  const existing = (await run(app)<ReadonlyArray<{ id: string; name: string }>>(app.client.drawings.listForProject({ params: { id: projectId } })))[0]
  const drawing = existing ?? await run(app)<{ id: string; name: string }>(app.client.drawings.createForProject({
    params: { id: projectId }, payload: { name: "Drawing 1", data: { elements, version: "1.0" } }
  }))
  if (!owner.current()) throw new Error("Workspace changed during preparation")
  const document = { projectId, drawingId: drawing.id }
  const apply = () => useDocumentStore.getState().setDocument({ ...document, name: drawing.name })
  if (adopt) adopt(document, apply)
  else apply()
  if (createdProject) app.rememberProject(createdProject.id, createdProject.name)
  return { projectId, drawingId: drawing.id }
}

/** Writes the live elements into the stored drawing, which also makes it the newest one the tools will pick. */
export async function pushLiveDrawing(app: AppState, drawingId: string): Promise<void> {
  const payload = drawingPayload(app)
  const elements = payload["elements"] as ReadonlyArray<Record<string, unknown>>
  const row = await run(app)<{ readonly data?: unknown }>(app.client.drawings.get({ params: { id: drawingId } }))
  const stored = row.data !== null && typeof row.data === "object" ? row.data as Record<string, unknown> : {}
  await run(app)(app.client.drawings.update({
    params: { id: drawingId },
    // Keep server-owned drawing fields (most importantly an AI-set stock) when this page has not loaded them yet.
    payload: { data: { ...stored, ...payload } }
  }))
  rememberPushed(elements, drawingId)
}

/**
 * Fail closed: a failed read/write must never clear or replace the user's document.
 */
export async function prepareWorkspace(app: AppState, adopt?: Parameters<typeof ensureDocument>[1]): Promise<{ projectId: string; drawingId: string }> {
  let owner = captureEditorOwner()
  const document = await ensureDocument(app, (document, apply) => {
    if (adopt) adopt(document, apply)
    else apply()
    owner = captureEditorOwner()
  })
  if (!owner.current()) throw new Error("Workspace changed during preparation")
  await pushLiveDrawing(app, document.drawingId)
  return document
}

export function appProjectId(app: AppState): string | undefined {
  return useDocumentStore.getState().projectId ?? app.recents()[0]?.id
}

/** The context the sidecar puts into the system prompt for this project (`ai.context.<projectId>`). */
export async function persistDrawingContext(app: AppState, projectId?: string): Promise<void> {
  const target = projectId ?? appProjectId(app)
  if (!target) return
  await run(app)(app.client.kv.set({ params: { key: `ai.context.${target}` }, payload: { value: currentDrawingContext(app) } }))
}
