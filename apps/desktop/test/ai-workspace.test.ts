/**
 * The assistant, the CAD editor and the CAM page as one document (real sidecar handlers, real stores):
 * what is on screen is what the tools see, what the tools do shows on screen, and the context says so.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { mirrorCamResult, operationIdOf } from "../src/ai/cam-sync.ts"
import { currentDrawingContext, ensureDocument, prepareWorkspace, verificationState } from "../src/ai/drawing-context.ts"
import { FIT_VIEW_EVENT, applyOps, diffAgainstStored, entitiesToElements, forgetPushed, mirrorToolResult, reconcileFromStored } from "../src/ai/editor-sync.ts"
import { buildSuggestions } from "../src/ai/suggestions.ts"
import { useDocumentStore } from "../src/cad/store/documentStore.ts"
import { useElementsStore } from "../src/cad/store/elementsStore.ts"
import { useLayerStore } from "../src/cad/store/layerStore.ts"
import { useSelectionStore } from "../src/cad/store/selectorStore.ts"
import { useCamStore } from "../src/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/cam/store/generatorStore.ts"
import { useVerifyStore } from "../src/cam/store/verifyStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let handlers: Awaited<ReturnType<typeof app.sidecar.toolHandlers>>
beforeAll(async () => { app = await bootLiveApp(); handlers = await app.sidecar.toolHandlers() })
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useDocumentStore.getState().clear(); forgetPushed() })

const json = (value: unknown) => JSON.stringify(value)

describe("one document for the editor and the tools", () => {
  test("with no project at all the workspace creates one, holding what is on screen", async () => {
    expect((await app.sidecar.call("/api/projects")).body).toHaveLength(0)
    useElementsStore.getState().addElement({ type: "cube", name: "Block", x: 0, y: 0, z: 0, width: 20, height: 20, depth: 20 })
    const doc = await prepareWorkspace(app.state)
    expect(useDocumentStore.getState()).toMatchObject({ projectId: doc.projectId, drawingId: doc.drawingId })
    const projects = (await app.sidecar.call("/api/projects")).body as Array<{ name: string }>
    expect(projects.map((p) => p.name)).toEqual(["Untitled project"])
    const stored = (await app.sidecar.call(`/api/projects/${doc.projectId}/drawings`)).body[0].data.elements as Array<{ name: string }>
    expect(stored.map((e) => e.name)).toEqual(["Block"])
    // The second message reuses it.
    expect((await ensureDocument(app.state)).drawingId).toBe(doc.drawingId)
    expect((await app.sidecar.call("/api/projects")).body).toHaveLength(1)
  })

  test("the tools see the elements the user drew by hand, and their result shows on screen", async () => {
    useElementsStore.getState().addElements([
      { type: "circle", name: "Hole", x: 5, y: 5, z: 0, radius: 3 },
      { type: "cube", name: "Plate", x: 0, y: 0, z: 0, width: 50, height: 50, depth: 10 }
    ])
    const doc = await prepareWorkspace(app.state)
    const described = await handlers.describeDrawing(doc.projectId) as { total: number; counts: Record<string, number> }
    expect(described.total).toBe(2)
    expect(described.counts).toEqual({ circle: 1, cube: 1 })

    const added = await handlers.addElements(doc.projectId, [{ type: "sphere", x: 0, y: 0, z: 0, radius: 4, name: "Ball", color: "#ff0000" }]) as { ids: string[] }
    mirrorToolResult("cad_add_elements", true, json({ ...(added as object) }))
    const elements = useElementsStore.getState().elements
    expect(elements).toHaveLength(3)
    expect(elements.some((e) => e.id === added.ids[0] && e.name === "Ball")).toBe(true)

    // A second message pushes the screen again and the tools still agree.
    await prepareWorkspace(app.state)
    expect((await handlers.describeDrawing(doc.projectId) as { total: number }).total).toBe(3)
  })

  test("a remembered document that no longer exists is replaced, not an obstacle", async () => {
    useDocumentStore.getState().setDocument({ projectId: "gone", drawingId: "gone-too", name: "Deleted" })
    useElementsStore.getState().addElement({ type: "cube", name: "Block", x: 0, y: 0, z: 0, width: 5, height: 5, depth: 5 })
    const doc = await prepareWorkspace(app.state)
    expect(doc.drawingId).not.toBe("gone-too")
    expect(useDocumentStore.getState().drawingId).toBe(doc.drawingId)
    const stored = (await app.sidecar.call(`/api/projects/${doc.projectId}/drawings`)).body[0].data.elements as Array<{ name: string }>
    expect(stored.map((e) => e.name)).toEqual(["Block"])
  })

  test("a tool result adopts its drawing when the editor had none", () => {
    mirrorToolResult("cad_add_entities", true, json({ ok: true, projectId: "p-1", drawingId: "d-1", elements: [{ id: "x1", type: "circle", layerId: "default", x: 0, y: 0, radius: 2 }] }))
    expect(useDocumentStore.getState()).toMatchObject({ projectId: "p-1", drawingId: "d-1" })
  })

  test("the context is the live workspace: elements, selection, layers, program and verification", async () => {
    const [id] = useElementsStore.getState().addElements([{ type: "cylinder", name: "Shaft", x: 1, y: 2, z: 3, radius: 5, height: 40 }])
    useSelectionStore.getState().selectMultiple([id!])
    useCamStore.getState().setGcode("G21\nG0 X0 Y0 Z5\nG1 Z-1 F100\nM30")
    const context = currentDrawingContext(app.state)
    expect(context).toMatchObject({ totalElementCount: 1, selectedElementCount: 1, selectedIds: [id], units: "mm" })
    expect(context.elements[0]).toMatchObject({ id, type: "cylinder", name: "Shaft", radius: 5, height: 40 })
    expect(context.layers.length).toBe(useLayerStore.getState().layers.length)
    expect(context.cam).toMatchObject({ gcodeLines: 4, verification: { state: "not-run", errors: 0 } })
    expect(JSON.stringify(context).length).toBeLessThan(20_000)
  })

  test("suggestions follow the verification state", () => {
    const base = { entityCount: 2, selectedCount: 0, activeTool: "select" as const, layers: 1 }
    expect(buildSuggestions({ ...base, hasGcode: true, verification: "not-run" })[0]!.id).toBe("s.verify")
    expect(buildSuggestions({ ...base, hasGcode: true, verification: "errors" })[0]!.id).toBe("s.fix-verification")
    expect(buildSuggestions({ ...base, hasGcode: true, verification: "ok" }).some((s) => s.id.startsWith("s.verify") || s.id === "s.fix-verification")).toBe(false)
    expect(buildSuggestions({ ...base, hasGcode: false }).some((s) => s.id === "s.verify")).toBe(false)
  })
})

describe("what the assistant does on an operation shows in the CAM page", () => {
  const operation = async () => {
    useElementsStore.getState().addElements([{ type: "rectangle", name: "Outline", x: 0, y: 0, z: 0, width: 30, height: 20 }])
    const doc = await prepareWorkspace(app.state)
    const created = await handlers.createOperation(doc.projectId, { type: "contour", params: { toolDiameter: 6, depth: 3, stepdown: 1 } }) as { operationId: string }
    return { doc, id: created.operationId, created }
  }

  test("the operation id comes from the right place and failures are ignored", () => {
    expect(operationIdOf("cam_create_operation", {}, json({ ok: true, operationId: "o1" }))).toBe("o1")
    expect(operationIdOf("cam_generate_gcode", { operationId: "o2" }, json({ stats: {} }))).toBe("o2")
    expect(operationIdOf("cam_verify_toolpath", { operationId: "o3" }, json({ ok: false, error: "x" }))).toBeUndefined()
    expect(operationIdOf("cam_generate_gcode", {}, "not json")).toBeUndefined()
  })

  test("create / generate / verify fill the settings, the editor, the preview and the Verify tab", async () => {
    const { doc, id, created } = await operation()
    expect(await mirrorCamResult(app.state, "cam_create_operation", {}, json(created))).toBe(true)
    expect(useGeneratorStore.getState().settings).toMatchObject({ toolDiameter: 6, depth: 3, stepdown: 1 })

    const generated = await handlers.generateGcode(doc.projectId, id)
    expect(await mirrorCamResult(app.state, "cam_generate_gcode", { operationId: id }, json({ stats: generated.stats }))).toBe(true)
    expect(useCamStore.getState().gcode).toBe(generated.gcode)
    expect(useCamStore.getState().program.toolpaths.length).toBeGreaterThan(0)
    expect(verificationState().state).toBe("not-run")

    const verified = await handlers.verifyOperation(doc.projectId, id, {}) as { ok: boolean }
    expect(await mirrorCamResult(app.state, "cam_verify_toolpath", { operationId: id }, json(verified))).toBe(true)
    expect(useVerifyStore.getState().report).not.toBeNull()
    expect(useVerifyStore.getState().report!.ok).toBe(verified.ok)
    expect(useVerifyStore.getState().report!.preview.heights.length).toBeGreaterThan(0)
    expect(useCamStore.getState().rightTab).toBe("verify")
    expect(["ok", "errors"]).toContain(verificationState().state)
    expect(cam.verify.VerifyResponseSchema).toBeDefined()
  })

  test("an update changes the settings in the panel and an editor edit afterwards marks the report stale", async () => {
    const { doc, id } = await operation()
    await handlers.generateGcode(doc.projectId, id)
    await handlers.verifyOperation(doc.projectId, id, {})
    await mirrorCamResult(app.state, "cam_verify_toolpath", { operationId: id }, json({ ok: true }))
    expect(verificationState().state).not.toBe("not-run")
    await handlers.updateOperation(doc.projectId, id, { depth: 5 })
    await mirrorCamResult(app.state, "cam_update_operation", { operationId: id }, json({ ok: true, operationId: id }))
    expect(useGeneratorStore.getState().settings.depth).toBe(5)
    useCamStore.getState().setGcode(`${useCamStore.getState().gcode}\n; edited`)
    expect(verificationState().state).toBe("stale")
  })

  test("other tools and unknown operations change nothing", async () => {
    const before = useCamStore.getState().gcode
    expect(await mirrorCamResult(app.state, "cad_add_elements", {}, json({ ok: true }))).toBe(false)
    expect(await mirrorCamResult(app.state, "cam_generate_gcode", { operationId: "ghost" }, json({}))).toBe(false)
    expect(useCamStore.getState().gcode).toBe(before)
  })
})

describe("the editor follows the stored drawing, whatever shape the tools wrote", () => {
  const el = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "cube", layerId: "l", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10, ...extra })
  const snap = (...elements: Array<Record<string, unknown>>) => new Map(elements.map((e) => [String(e["id"]), JSON.stringify(e)]))

  test("the assistant's additions, edits and deletions apply; the user's own changes are kept", () => {
    const before = [el("a"), el("b"), el("c"), el("d")]
    const live = [el("a"), el("b", { x: 99 }), el("c"), /* user deleted d */ el("u")]
    const stored = [el("a", { radius: 1 }), el("b", { x: 7 }), /* assistant removed c */ el("n")]
    const ops = diffAgainstStored(live, stored, snap(...before), true)
    expect(ops).toEqual([
      { kind: "add", elements: [el("n")] },
      { kind: "update", elements: [el("a", { radius: 1 })] },
      { kind: "delete", ids: ["c"] }
    ])
  })

  test("adding elements asks the CAD page to frame them; edits and deletions do not", () => {
    let fits = 0
    const onFit = () => { fits++ }
    window.addEventListener(FIT_VIEW_EVENT, onFit)
    try {
      applyOps([{ kind: "add", elements: [el("f1", { layerId: "default" })] }])
      expect(fits).toBe(1)
      applyOps([{ kind: "update", elements: [el("f1", { x: 5, layerId: "default" })] }])
      applyOps([{ kind: "delete", ids: ["f1"] }])
      expect(fits).toBe(1)
    } finally { window.removeEventListener(FIT_VIEW_EVENT, onFit) }
  })

  test("without an elements list nothing is ever deleted", () => {
    expect(diffAgainstStored([el("a")], [], snap(el("a")), false)).toEqual([])
  })

  test("older entities become editor elements, polylines become segments, layers by name", () => {
    const converted = entitiesToElements([
      { _tag: "Circle", id: "c1", layerId: "L0", center: { x: 1, y: 2 }, radius: 15 },
      { _tag: "Rectangle", id: "r1", layerId: "L0", corner1: { x: 0, y: 0 }, corner2: { x: 30, y: 20 } },
      { _tag: "Polyline", id: "p1", layerId: "L1", closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
      { _tag: "Text", id: "t1" },
      { _tag: "Line", layerId: "L0" }
    ], (id) => ({ L0: "Car", L1: "Wheels" }[id]))
    expect(converted.map((e) => [e["id"], e["type"], e["layerId"]])).toEqual([["c1", "circle", "Car"], ["r1", "rectangle", "Car"], ["p1", "line", "Wheels"], ["p1:1", "line", "Wheels"], ["p1:2", "line", "Wheels"]])
    expect(converted[1]).toMatchObject({ x: 15, y: 10, width: 30, height: 20 })
  })

  test("end to end: the assistant adds, edits and deletes through the sidecar and the canvas store follows", async () => {
    useElementsStore.getState().addElements([{ type: "cube", name: "Mine", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }])
    const doc = await prepareWorkspace(app.state)
    const added = await handlers.addElements(doc.projectId, [{ type: "sphere", x: 0, y: 0, z: 0, radius: 4, name: "Ball", layer: "Car" }]) as { ids: string[] }
    // Not through mirrorToolResult: only the stored drawing carries the change.
    expect(await reconcileFromStored(app.state)).toEqual({ added: 1, updated: 0, removed: 0 })
    expect(useElementsStore.getState().elements.map((e) => e.name)).toEqual(["Mine", "Ball"])
    expect(useLayerStore.getState().layers.some((l) => l.name === "Car")).toBe(true)

    await handlers.modifyEntities(doc.projectId, [{ id: added.ids[0]!, changes: { radius: 9 } }])
    expect(await reconcileFromStored(app.state)).toMatchObject({ updated: 1 })
    expect(useElementsStore.getState().elements.find((e) => e.id === added.ids[0])).toMatchObject({ radius: 9 })

    await handlers.deleteEntities(doc.projectId, [added.ids[0]!])
    expect(await reconcileFromStored(app.state)).toMatchObject({ removed: 1 })
    expect(useElementsStore.getState().elements.map((e) => e.name)).toEqual(["Mine"])
    // Nothing left to do.
    expect(await reconcileFromStored(app.state)).toEqual({ added: 0, updated: 0, removed: 0 })
  })

  test("a drawing the older sidecar wrote (entities, no elements) still reaches the canvas and deletes nothing", async () => {
    useElementsStore.getState().addElements([{ type: "cube", name: "Mine", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }])
    const doc = await prepareWorkspace(app.state)
    await app.sidecar.call(`/api/drawings/${doc.drawingId}`, { method: "PUT", json: { data: { name: "Old", entities: [
      { _tag: "Circle", id: "old-c", layerId: "x", center: { x: 3, y: 4 }, radius: 15 },
      { _tag: "Rectangle", id: "old-r", layerId: "x", corner1: { x: 0, y: 0 }, corner2: { x: 30, y: 20 } }
    ], layers: [{ id: "x", name: "Car" }], version: 3 } } })
    expect(await reconcileFromStored(app.state)).toEqual({ added: 2, updated: 0, removed: 0 })
    const names = useElementsStore.getState().elements.map((e) => e.type)
    expect(names).toEqual(expect.arrayContaining(["cube", "circle", "rectangle"]))
    expect(useElementsStore.getState().elements.some((e) => e.name === "Mine")).toBe(true)
  })
})
