import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { Effect } from "effect"
import { cam } from "@cadcamfun/core"
import { captureEditorOwner, mirrorToolResult, reconcileFromStored, rememberPushed } from "../src/features/ai/lib/editor-sync.ts"
import { mirrorCamResult } from "../src/features/ai/lib/cam-sync.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { useVerifyStore } from "../src/features/cam/store/verifyStore.ts"
import type { AppState } from "../src/shared/state/context.ts"
import { resetStores } from "./helpers/reset-stores.ts"

const open = (projectId = "project-a", drawingId = "drawing-a") => useDocumentStore.getState().setDocument({ projectId, drawingId })
const awayAndBack = () => { open("project-b", "drawing-b"); open() }
const none = { added: 0, updated: 0, removed: 0 }
const element = { id: "shared-id", type: "cube", layerId: "default", x: 1, width: 10, height: 10, depth: 10 }
const output = JSON.stringify({ ok: true, elements: [element] })

const deferred = <T>() => {
  let resolve: (value: T) => void = () => { throw new Error("Deferred not initialized") }
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const drawingApp = (response: Promise<unknown>) => ({
  client: { drawings: { get: () => undefined } },
  runtime: { run: () => response }
})

const camState = () => ({
  cad: useCADStore.getState(),
  cam: useCamStore.getState(),
  generator: useGeneratorStore.getState(),
  verify: useVerifyStore.getState()
})

beforeEach(() => { resetStores(); useGeneratorStore.getState().reset(); open() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })

test("owner tracks identity navigation, not document renaming, including away and back", () => {
  const owner = captureEditorOwner()
  useDocumentStore.setState({ name: "Renamed" })
  open()
  expect(owner.current()).toBe(true)
  awayAndBack()
  expect(owner.current()).toBe(false)
  expect(captureEditorOwner().generation).toBeGreaterThan(owner.generation)
})

test("CAD results reject stale owners and explicit project or drawing mismatches", () => {
  const owner = captureEditorOwner()
  const layers = useLayerStore.getState().layers
  for (const identity of [{ projectId: "project-b" }, { drawingId: "drawing-b" }]) {
    expect(mirrorToolResult("cad_add_elements", true, JSON.stringify({ ok: true, ...identity, elements: [{ ...element, layer: "Must not exist" }] }))).toBeUndefined()
  }
  awayAndBack()
  expect(mirrorToolResult("cad_add_elements", true, output, owner)).toBeUndefined()
  expect(useElementsStore.getState().elements).toEqual([])
  expect(useLayerStore.getState().layers).toEqual(layers)
})

test("CAD output parsing cannot mutate a document navigated away and back", () => {
  const parse = JSON.parse
  const spy = spyOn(JSON, "parse").mockImplementation((text: string) => {
    const value: unknown = parse(text)
    awayAndBack()
    return value
  })
  try {
    expect(mirrorToolResult("cad_add_elements", true, output)).toBeUndefined()
    expect(useElementsStore.getState().elements).toEqual([])
  } finally { spy.mockRestore() }
})

test("a matching CAD result still adopts a drawing for a project with no drawing", () => {
  useDocumentStore.setState({ drawingId: null })
  expect(mirrorToolResult("cad_add_elements", true, JSON.stringify({ ok: true, projectId: "project-a", drawingId: "created", elements: [element] }))).toEqual({ ...none, added: 1 })
  expect(useDocumentStore.getState().drawingId).toBe("created")
})

for (const navigate of [() => open("project-b", "drawing-b"), awayAndBack, () => open("project-b", "drawing-a")]) {
  test(`stored drawing ignores a deferred HTTP response after ${navigate.toString()}`, async () => {
    const response = deferred<unknown>()
    const pending = reconcileFromStored(drawingApp(response.promise))
    navigate()
    response.resolve({ data: { elements: [element] } })
    expect(await pending).toEqual(none)
    expect(useElementsStore.getState().elements).toEqual([])
  })
}

test("stored entity parsing checks ownership again before mutations", async () => {
  const entity = { id: "old", _tag: "Circle", get center() { awayAndBack(); return { x: 0, y: 0 } }, radius: 2 }
  expect(await reconcileFromStored(drawingApp(Promise.resolve({ data: { entities: [entity] } })))).toEqual(none)
  expect(useElementsStore.getState().elements).toEqual([])
})

test("pushed snapshots cannot delete or update identical element ids in another drawing", async () => {
  useElementsStore.getState().addElements([element])
  const live = useElementsStore.getState().elements.map((value) => ({ ...value }))
  rememberPushed(live)
  open("project-a", "drawing-b")
  expect(await reconcileFromStored(drawingApp(Promise.resolve({ data: { elements: [] } })))).toEqual(none)
  expect(await reconcileFromStored(drawingApp(Promise.resolve({ data: { elements: [{ ...live[0], x: 99 }] } })))).toEqual(none)
  expect(useElementsStore.getState().elements[0]?.x).toBe(1)
  open()
  rememberPushed(live, "drawing-a")
  expect(await reconcileFromStored(drawingApp(Promise.resolve({ data: { elements: [] } })))).toEqual({ ...none, removed: 1 })
})

const operation = { gcode: "G0 X10", data: { request: { settings: cam.generator.decodeSettings({ toolDiameter: 8 }) }, verification: { report: {} } } }
const parsed = { program: cam.makeProgram("parsed", [], {}) }
const camApp = (run: () => Promise<unknown>) => ({
  client: { toolpaths: { get: () => Effect.succeed(operation) }, toolpathGenerator: { parse: () => Effect.succeed(parsed) } },
  runtime: { run }
}) as unknown as AppState

test("CAM deferred operation HTTP response after away/back changes no stores", async () => {
  const response = deferred<unknown>()
  const before = camState()
  const pending = mirrorCamResult(camApp(() => response.promise), "cam_update_operation", { operationId: "operation-a" }, "{}")
  awayAndBack()
  response.resolve(operation)
  expect(await pending).toBe(false)
  expect(camState()).toEqual(before)
})

for (const navigate of [() => open("project-b", "drawing-b"), awayAndBack]) {
  test(`CAM defers every row mutation until parsing finishes and rejects ${navigate.toString()}`, async () => {
    const response = deferred<unknown>()
    const started = deferred<void>()
    let calls = 0
    const app = camApp(() => {
      if (++calls === 1) return Promise.resolve(operation)
      started.resolve()
      return response.promise
    })
    const before = camState()
    const pending = mirrorCamResult(app, "cam_verify_toolpath", { operationId: "operation-a" }, "{}")
    await started.promise
    expect(camState()).toEqual(before)
    navigate()
    response.resolve(parsed)
    expect(await pending).toBe(false)
    expect(camState()).toEqual(before)
  })
}

test("CAM generation applies parsed program and settings when the owner remains current", async () => {
  let calls = 0
  expect(await mirrorCamResult(camApp(() => Promise.resolve(++calls === 1 ? operation : parsed)), "cam_generate_gcode", { operationId: "operation-a" }, "{}")).toBe(true)
  expect(useCamStore.getState()).toMatchObject({ selectedOperationId: "operation-a", gcode: operation.gcode, program: parsed.program })
  expect(useGeneratorStore.getState().settings.toolDiameter).toBe(8)
})

test("CAM stock results with a stale explicit owner never mutate stores", async () => {
  const owner = captureEditorOwner()
  awayAndBack()
  const before = camState()
  expect(await mirrorCamResult(camApp(() => Promise.resolve(operation)), "cam_stock", {}, JSON.stringify({ ok: true, action: "set", stock: {} }), owner)).toBe(false)
  expect(camState()).toEqual(before)
})
