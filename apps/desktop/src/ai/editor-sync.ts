/**
 * Mirrors what the assistant's CAD tools did into the editor the user has open.
 *
 * The tools run in the sidecar and save into the stored drawing; the canvas draws the editor's own elements
 * store. Each CAD tool answers with the elements it created, changed or removed, so this turns that answer
 * into the same change in the live store, with the same ids (later "modify" and "delete" calls then find the
 * element on both sides). Anything that is not a CAD tool result, or did not succeed, changes nothing.
 */
import { useElementsStore } from "../cad/store/elementsStore.ts"
import { classify } from "../cad/lib/browser.ts"
import { useCADStore } from "../cad/store/cadStore.ts"
import { useDocumentStore } from "../cad/store/documentStore.ts"
import { useLayerStore } from "../cad/store/layerStore.ts"

export type SyncOp =
  | { readonly kind: "add"; readonly elements: ReadonlyArray<Record<string, unknown>> }
  | { readonly kind: "update"; readonly elements: ReadonlyArray<Record<string, unknown>> }
  | { readonly kind: "delete"; readonly ids: ReadonlyArray<string> }

const isElement = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string" && typeof (value as { type?: unknown }).type === "string"

/** The changes a CAD tool result describes; `output` is the tool's JSON text. */
export const opsFor = (tool: string, output: string): ReadonlyArray<SyncOp> => {
  let result: { ok?: unknown; elements?: unknown; ids?: unknown }
  try { result = JSON.parse(output) } catch { return [] }
  if (result === null || typeof result !== "object" || result.ok !== true) return []
  const elements = Array.isArray(result.elements) ? result.elements.filter(isElement) : []
  if (tool.endsWith("cad_add_entities") || tool.endsWith("cad_add_elements") || tool.endsWith("cad_import_drawing")) return elements.length > 0 ? [{ kind: "add", elements }] : []
  if (tool.endsWith("cad_modify_entities")) return elements.length > 0 ? [{ kind: "update", elements }] : []
  if (tool.endsWith("cad_delete_entities")) {
    const ids = Array.isArray(result.ids) ? result.ids.filter((id): id is string => typeof id === "string") : []
    return ids.length > 0 ? [{ kind: "delete", ids }] : []
  }
  return []
}

/**
 * The layer an element belongs on: an existing id, an existing layer's name (any case), the active layer for the
 * server's placeholder "default", otherwise a new layer with that name (the assistant asked for it).
 */
const layerFor = (requested: unknown): string => {
  const layers = useLayerStore.getState()
  const wanted = typeof requested === "string" ? requested.trim() : ""
  if (wanted === "" || wanted === "default") return layers.activeLayer
  const byId = layers.layers.find((layer) => layer.id === wanted)
  if (byId) return byId.id
  const byName = layers.layers.find((layer) => layer.name.toLowerCase() === wanted.toLowerCase())
  if (byName) return byName.id
  layers.addLayer({ name: wanted, visible: true, locked: false, color: "#1e88e5" })
  const created = useLayerStore.getState().layers.find((layer) => layer.name === wanted)
  return created?.id ?? layers.activeLayer
}

/** Event the CAD page listens to: frame the whole drawing after the assistant added something. */
export const FIT_VIEW_EVENT = "cadcam:fit-view"
const requestFitView = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent(FIT_VIEW_EVENT))
}

/** Applies the changes to the elements store; returns how many elements were added, updated and removed. */
export const applyOps = (ops: ReadonlyArray<SyncOp>): { readonly added: number; readonly updated: number; readonly removed: number } => {
  const result = applyOpsNow(ops)
  if (result.added > 0) {
    // Solids are drawn flat in the 2D view: show what was built in 3D.
    const solid = ops.some((op) => op.kind === "add" && op.elements.some((element) => classify(String(element["type"])) !== "sketches"))
    if (solid && useCADStore.getState().viewMode === "2d") useCADStore.getState().setViewMode("3d")
    requestFitView()
  }
  return result
}

const applyOpsNow = (ops: ReadonlyArray<SyncOp>): { readonly added: number; readonly updated: number; readonly removed: number } => {
  const store = useElementsStore.getState()
  let added = 0, updated = 0, removed = 0
  for (const op of ops) {
    if (op.kind === "add") {
      const known = new Set(useElementsStore.getState().elements.map((element) => element.id))
      const fresh = op.elements.filter((element) => !known.has(String(element["id"])))
        .map((element) => ({ ...element, layerId: layerFor(element["layer"] ?? element["layerId"]) }))
      if (fresh.length > 0) { store.addElements(fresh); added += fresh.length }
    } else if (op.kind === "update") {
      for (const element of op.elements) {
        const { id, ...patch } = element
        if (!useElementsStore.getState().elements.some((candidate) => candidate.id === id)) continue
        store.updateElement(String(id), { ...patch, layerId: layerFor(patch["layerId"]) })
        updated++
      }
    } else {
      for (const id of op.ids) {
        if (!useElementsStore.getState().elements.some((candidate) => candidate.id === id)) continue
        store.deleteElement(id)
        removed++
      }
    }
  }
  return { added, updated, removed }
}

/** One call for the chat store: apply a finished tool call to the open editor. */
export const mirrorToolResult = (tool: string, ok: boolean, output: string): ReturnType<typeof applyOps> | undefined => {
  if (!ok) return undefined
  rememberDocument(output)
  return applyOps(opsFor(tool, output))
}

/** A CAD tool says which stored drawing it changed; the editor adopts it when it has none yet, so both agree. */
export const rememberDocument = (output: string): void => {
  try {
    const result = JSON.parse(output) as { projectId?: unknown; drawingId?: unknown }
    const document = useDocumentStore.getState()
    if (document.drawingId === null && typeof result.projectId === "string" && typeof result.drawingId === "string") {
      document.setDocument({ projectId: result.projectId, drawingId: result.drawingId })
    }
  } catch { /* not JSON: nothing to remember */ }
}

// ---------------------------------------------------------------------------------------------------------------
// Reconciling with the stored drawing: the source of truth whatever shape a tool answered in.

/** What the stored drawing held when the editor last wrote it (id -> JSON), to tell the assistant's changes from the user's. */
const pushed = new Map<string, string>()

/** Remembers the elements just written to the stored drawing. */
export const rememberPushed = (elements: ReadonlyArray<Record<string, unknown>>): void => {
  pushed.clear()
  for (const element of elements) pushed.set(String(element["id"]), JSON.stringify(element))
}
export const forgetPushed = (): void => pushed.clear()

interface Point { readonly x?: number; readonly y?: number; readonly z?: number }
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
const pt = (value: unknown): Required<Point> => {
  const p = (value ?? {}) as Point
  return { x: num(p.x), y: num(p.y), z: num(p.z) }
}

/**
 * Elements for the entities of the older drawing model (`_tag` Line, Circle, Arc, Polyline, Rectangle), so a
 * drawing the assistant wrote that way still reaches the canvas. `layerName` maps an entity's layer id to its name.
 */
export const entitiesToElements = (entities: ReadonlyArray<unknown>, layerName: (id: string) => string | undefined): ReadonlyArray<Record<string, unknown>> =>
  entities.flatMap((raw): Record<string, unknown>[] => {
    const e = raw as Record<string, unknown> & { _tag?: string; id?: unknown; layerId?: unknown }
    if (typeof e.id !== "string") return []
    const layer = typeof e.layerId === "string" ? layerName(e.layerId) ?? e.layerId : "default"
    const base = { id: e.id, layerId: layer, color: "#1e88e5" }
    switch (e._tag) {
      case "Line": { const a = pt(e["start"]), b = pt(e["end"]); return [{ ...base, type: "line", x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z, linewidth: 2 }] }
      case "Circle": { const c = pt(e["center"]); return [{ ...base, type: "circle", x: c.x, y: c.y, z: c.z, radius: num(e["radius"], 1), linewidth: 1 }] }
      case "Arc": { const c = pt(e["center"]); return [{ ...base, type: "arc", x: c.x, y: c.y, z: c.z, radius: num(e["radius"], 1), startAngle: num(e["startAngle"]), endAngle: num(e["endAngle"], Math.PI) }] }
      case "Rectangle": {
        const a = pt(e["corner1"]), b = pt(e["corner2"])
        return [{ ...base, type: "rectangle", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: a.z, width: Math.abs(b.x - a.x) || 1, height: Math.abs(b.y - a.y) || 1, linewidth: 1 }]
      }
      case "Polyline": {
        const points = (Array.isArray(e["points"]) ? e["points"] : []).map(pt)
        const pairs = points.slice(1).map((p, i) => [points[i]!, p] as const)
        if (e["closed"] === true && points.length > 2) pairs.push([points[points.length - 1]!, points[0]!])
        return pairs.map(([a, b], i) => ({ ...base, id: i === 0 ? e.id as string : `${e.id}:${i}`, type: "line", x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z, linewidth: 2 }))
      }
      default: return []
    }
  })

/** The changes the stored drawing has over the editor, relative to what the editor last wrote. Pure. */
export const diffAgainstStored = (
  live: ReadonlyArray<Record<string, unknown>>,
  stored: ReadonlyArray<Record<string, unknown>>,
  snapshot: ReadonlyMap<string, string>,
  storedIsAuthoritative: boolean
): ReadonlyArray<SyncOp> => {
  const liveById = new Map(live.map((element) => [String(element["id"]), element]))
  const storedIds = new Set(stored.map((element) => String(element["id"])))
  const add = stored.filter((element) => !liveById.has(String(element["id"])) && !snapshot.has(String(element["id"])))
  const update = stored.filter((element) => {
    const id = String(element["id"])
    const current = liveById.get(id)
    const before = snapshot.get(id)
    // Changed by the assistant (differs from what we wrote) and not touched by the user since.
    return current !== undefined && before !== undefined && before !== JSON.stringify(element) && JSON.stringify(current) === before
  })
  const remove = storedIsAuthoritative
    ? [...snapshot.keys()].filter((id) => !storedIds.has(id) && liveById.has(id) && JSON.stringify(liveById.get(id)) === snapshot.get(id))
    : []
  return [
    ...(add.length > 0 ? [{ kind: "add", elements: add } as const] : []),
    ...(update.length > 0 ? [{ kind: "update", elements: update } as const] : []),
    ...(remove.length > 0 ? [{ kind: "delete", ids: remove } as const] : [])
  ]
}

/**
 * Reads the stored drawing the editor shares with the assistant and applies what the assistant changed. Works for both
 * stored shapes (`elements`, or the older `entities`); deletions only follow an `elements` list, so an older sidecar
 * that dropped them can never empty the editor.
 */
export async function reconcileFromStored(app: { readonly client: unknown; readonly runtime: { readonly run: (effect: never) => Promise<unknown> } }): Promise<{ readonly added: number; readonly updated: number; readonly removed: number }> {
  const none = { added: 0, updated: 0, removed: 0 }
  const { drawingId } = useDocumentStore.getState()
  if (drawingId === null) return none
  const client = app.client as { drawings: { get: (input: { params: { id: string } }) => unknown } }
  const row = await app.runtime.run(client.drawings.get({ params: { id: drawingId } }) as never) as { data: unknown }
  const data = row.data !== null && typeof row.data === "object" ? (row.data as { elements?: unknown; entities?: unknown; layers?: unknown }) : {}
  const layers = Array.isArray(data.layers) ? (data.layers as Array<{ id?: string; name?: string }>) : []
  const name = (id: string): string | undefined => layers.find((layer) => layer.id === id)?.name
  const fromElements = Array.isArray(data.elements) ? (data.elements.filter(isElement) as Record<string, unknown>[]) : []
  const fromEntities = Array.isArray(data.entities) ? entitiesToElements(data.entities, name) : []
  const stored = [...fromElements, ...fromEntities]
  const live = useElementsStore.getState().elements as unknown as ReadonlyArray<Record<string, unknown>>
  const ops = diffAgainstStored(live, stored, pushed, Array.isArray(data.elements))
  const result = applyOps(ops)
  for (const element of stored) pushed.set(String(element["id"]), JSON.stringify(useElementsStore.getState().elements.find((candidate) => candidate.id === element["id"]) ?? element))
  for (const op of ops) if (op.kind === "delete") for (const id of op.ids) pushed.delete(id)
  return result
}
