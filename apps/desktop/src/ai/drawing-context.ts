import { type Drawing, cam } from "@cadcamfun/core"
import type { AppState } from "../state/context.ts"
import { useCamStore } from "../cam/store/camStore.ts"
import { useGeneratorStore } from "../cam/store/generatorStore.ts"

const { estimateTime } = cam

// Bound geometry in prompts; selected entities take priority over the rest of the drawing.
const MAX_CONTEXT_ENTITIES = 100

/** Default rapid rate (mm/min) used by `estimateTime` for AI context summaries. */
const RAPID_RATE_MM_PER_MIN = 5000

export function buildDrawingContext(drawing: Drawing, selectedIds: ReadonlyArray<string>, activeTool: string) {
  const selected = new Set(selectedIds)
  const selectedEntities = drawing.entities.filter((entity) => selected.has(entity.id))
  const entities = [...selectedEntities, ...drawing.entities.filter((entity) => !selected.has(entity.id))]
    .slice(0, MAX_CONTEXT_ENTITIES)
  return {
    drawingId: drawing.id,
    name: drawing.name,
    units: "mm",
    activeTool,
    totalElementCount: drawing.entities.length,
    selectedElementCount: selectedEntities.length,
    selectedIds: selectedEntities.map((entity) => entity.id),
    entities,
    layers: drawing.layers,
    omittedEntityCount: drawing.entities.length - entities.length
  }
}

export function currentDrawingContext(app: AppState) {
  const camStore = useCamStore.getState()
  const generator = useGeneratorStore.getState()
  const selectedIds = new Set([...app.editor.selection(), ...camStore.selectedEntities])
  const selectedEntities = app.drawing().entities.filter((entity) => selectedIds.has(entity.id))
  const program = camStore.program
  const postprocessor = app.settings.settings().postProcessor
  return {
    ...buildDrawingContext(app.drawing(), [...selectedIds], app.tool()),
    displayUnits: app.settings.settings().units,
    postProcessor: postprocessor,
    solidCount: app.editor.solids().length,
    selectedSolidIndices: app.editor.solidSelection(),
    cam: {
      gcode: camStore.gcode || generator.currentGCode,
      postprocessor,
      operation: camStore.operation,
      settings: generator.settings,
      geometryType: generator.geometryType,
      printer: generator.printer,
      workpiece: camStore.workpiece,
      material: camStore.material || generator.settings.material,
      controller: camStore.controller,
      selectedEntityIds: [...selectedIds],
      selectedEntities,
      toolpaths: program.toolpaths.map((toolpath) => ({
        id: toolpath.id,
        name: toolpath.name,
        toolId: toolpath.toolId,
        moveCount: toolpath.moves.length,
        duration: estimateTime(toolpath, RAPID_RATE_MM_PER_MIN)
      })),
      toolpathCount: program.toolpaths.length
    }
  }
}

export function appProjectId(app: AppState): string | undefined {
  return app.recents()[0]?.id
}

export async function persistDrawingContext(app: AppState): Promise<void> {
  const value = currentDrawingContext(app)
  const projectId = appProjectId(app)
  if (!projectId) throw new Error("Open a project before asking nikcli to use the current drawing context")
  await app.runtime.run(app.client.kv.set({
    params: { key: `ai.context.${projectId}` },
    payload: { value }
  }))
}
