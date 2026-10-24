/**
 * How the open project reaches the stored project: the drawing and the CAM program, saved by the same engine whether the
 * user pressed Save, the interval elapsed or the window went away (spec 03 §2). Runs over the real sidecar handlers.
 */
import { afterAll, afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { createRoot } from "solid-js"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import type { ProjectSession } from "../src/features/projects/lib/project-session.ts"
import { applyStoredDrawing } from "../src/features/cad/lib/open-drawing.ts"
import { readDraft } from "../src/features/cad/lib/draft.ts"
import { describeSave } from "../src/features/projects/lib/save-status.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { restoreCamProgram, ProgramConflict } from "../src/features/cam/lib/saved-program.ts"
import { DEFAULT_SETTINGS, decodeSettings } from "../src/shared/state/settings.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
// The session pulls in the toast UI, which needs the DOM `bootLiveApp` installs: load it afterwards.
let projectSession: typeof import("../src/features/projects/lib/project-session.ts").projectSession
let session: ProjectSession
let stop: (() => void) | undefined
let dispose: (() => void) | undefined
beforeAll(async () => { app = await bootLiveApp(); projectSession = (await import("../src/features/projects/lib/project-session.ts")).projectSession })
afterAll(async () => { await app.dispose() })
afterEach(() => { stop?.(); dispose?.(); stop = undefined; dispose = undefined; resetStores() })
/** Starts the session once per test, whichever fixture runs first. */
const begin = () => {
  session = projectSession(app.state)
  if (stop === undefined) createRoot((rootDispose) => { dispose = rootDispose; stop = session.start() })
}

const run = <A,>(effect: unknown) => app.state.runtime.run(effect as never) as Promise<A>
const box = (id: string, x = 0) => ({ id, type: "cube", layerId: useLayerStore.getState().activeLayer, x, y: 0, z: 0, width: 10, height: 10, depth: 10 })

/** A stored drawing opened in the editor, with the session running over it. */
const openProject = async (data: Record<string, unknown> = { elements: [box("a")], version: "1.0" }) => {
  const project = await run<{ id: string }>(app.client.projects.create({ payload: { name: "Session" } }))
  const drawing = await run<{ id: string }>(app.client.drawings.createForProject({ params: { id: project.id }, payload: { name: "Main", data } }))
  const row = await run<Parameters<typeof applyStoredDrawing>[1]>(app.client.drawings.get({ params: { id: drawing.id } }))
  begin()
  applyStoredDrawing(app.state, row)
  await session.document.baseline()
  return { projectId: project.id, drawingId: drawing.id }
}
const stored = async (drawingId: string) => (await run<{ data: Record<string, any>; updatedAt: string }>(app.client.drawings.get({ params: { id: drawingId } })))

describe("the drawing", () => {
  test("an opened drawing is clean; moving a part makes it dirty and a save stores it", async () => {
    const { drawingId } = await openProject()
    await session.document.touch.call(session.document); await new Promise((r) => setTimeout(r, 450))
    expect(session.document.state()).toBe("clean")
    useElementsStore.setState({ elements: [box("a", 25)] })
    await new Promise((r) => setTimeout(r, 450))
    expect(session.document.state()).toBe("dirty")
    expect(session.hasUnsavedWork()).toBe(true)
    await session.document.saveNow("auto")
    expect(session.document.state()).toBe("clean")
    expect((await stored(drawingId)).data["elements"][0].x).toBe(25)
    expect(session.hasUnsavedWork()).toBe(false)
  })

  test("selecting a part is not an unsaved change", async () => {
    await openProject()
    useElementsStore.setState({ selectedElement: useElementsStore.getState().elements[0]! })
    await new Promise((r) => setTimeout(r, 450))
    expect(session.document.state()).toBe("clean")
  })

  test("a save keeps what the editor does not own, and stores the layers and the machining setup", async () => {
    const stock = { min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 50, z: 0 } }
    const { drawingId } = await openProject({ elements: [box("a")], stock, version: "1.0" })
    useCADStore.getState().setWorkpiece({ ...useCADStore.getState().workpiece, width: 77, height: 33, depth: 11, material: "steel" })
    useCADStore.getState().setOriginOffset({ x: 5, y: 6, z: 7 })
    await session.document.saveNow("manual")
    const data = (await stored(drawingId)).data
    expect(data["stock"]).toEqual(stock)
    expect(data["setup"].workpiece).toMatchObject({ width: 77, height: 33, depth: 11, material: "steel" })
    expect(data["setup"].originOffset).toEqual({ x: 5, y: 6, z: 7 })
    expect(data["layers"].length).toBeGreaterThan(0)
    // Reopening restores the setup the drawing was saved with.
    useCADStore.getState().setWorkpiece({ ...useCADStore.getState().workpiece, width: 1, height: 1, depth: 1 })
    applyStoredDrawing(app.state, await run(app.client.drawings.get({ params: { id: drawingId } })))
    expect(useCADStore.getState().workpiece).toMatchObject({ width: 77, height: 33, depth: 11, material: "steel" })
    expect(useCADStore.getState().originOffset).toEqual({ x: 5, y: 6, z: 7 })
  })

  test("something the assistant stored in between is merged, not overwritten, and the save still lands", async () => {
    const { drawingId } = await openProject()
    // The assistant (or the phone) saves a part while the user has the drawing open.
    const current = await stored(drawingId)
    await run(app.client.drawings.update({ params: { id: drawingId }, payload: { data: { ...current.data, elements: [...current.data["elements"], box("from-assistant", 50)] } } }))
    useElementsStore.setState({ elements: [...useElementsStore.getState().elements, box("mine", 80)] })
    await session.document.saveNow("auto")
    const ids = (await stored(drawingId)).data["elements"].map((element: { id: string }) => element.id).sort()
    expect(ids).toEqual(["a", "from-assistant", "mine"])
    expect(useElementsStore.getState().elements.map((element) => element.id).sort()).toEqual(["a", "from-assistant", "mine"])
  })

  test("saveAll reports what it did and a failure keeps the drawing dirty", async () => {
    const { drawingId } = await openProject()
    expect(await session.saveAll("manual")).toMatchObject({ document: "clean" })
    useElementsStore.setState({ elements: [box("a", 3)] })
    const drawings = app.client.drawings as { update: unknown }
    const original = drawings.update
    drawings.update = () => { throw new Error("disk full") }
    try {
      await expect(session.saveAll("manual")).rejects.toThrow("disk full")
      expect(session.document.state()).toBe("error")
      expect(describeSave(session.summary())?.tone).toBe("red")
    } finally { drawings.update = original }
    expect(await session.saveAll("manual")).toMatchObject({ document: "saved" })
    expect((await stored(drawingId)).data["elements"][0].x).toBe(3)
  })

  test("restore points: a save keeps the drawing it replaced and a restore puts it back", async () => {
    const { drawingId } = await openProject({ elements: [box("a"), box("b", 20)], version: "1.0" })
    useElementsStore.setState({ elements: [box("a")] })
    await session.document.saveNow("manual")
    const versions = await run<ReadonlyArray<{ id: string; version: number; elements: number }>>(app.client.drawings.versions({ params: { id: drawingId } }))
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ elements: 2 })
    await run(app.client.drawings.restoreVersion({ params: { id: drawingId, versionId: versions[0]!.id } }))
    applyStoredDrawing(app.state, await run(app.client.drawings.get({ params: { id: drawingId } })))
    expect(useElementsStore.getState().elements.map((element) => element.id)).toEqual(["a", "b"])
    await session.document.baseline()
    expect(session.document.state()).toBe("clean")
  })
})

describe("work that is not in a project yet", () => {
  test("it is dirty and cannot be autosaved; it is kept as a recovery draft; saveAll asks for a destination", async () => {
    begin()
    expect(session.summary().active).toBe(false)
    useElementsStore.setState({ elements: [box("scratch")] })
    await new Promise((r) => setTimeout(r, 1_500))
    expect(session.summary()).toMatchObject({ active: true, scratch: true, state: "dirty" })
    expect(describeSave(session.summary())?.saveable).toBe(false)
    expect(readDraft()?.elements.map((element) => element.id)).toEqual(["scratch"])
    expect(await session.saveAll("manual")).toMatchObject({ document: "no-destination" })
    // Deleting everything clears the draft: an empty editor is not worth recovering.
    useElementsStore.setState({ elements: [] })
    await new Promise((r) => setTimeout(r, 1_500))
    expect(readDraft()).toBeUndefined()
  })

  test("saving it into a project ends the scratch state", async () => {
    begin()
    useElementsStore.setState({ elements: [box("scratch")] })
    await new Promise((r) => setTimeout(r, 450))
    const project = await run<{ id: string }>(app.client.projects.create({ payload: { name: "From scratch" } }))
    const drawing = await run<{ id: string }>(app.client.drawings.createForProject({ params: { id: project.id }, payload: { name: "Main", data: { elements: [box("scratch")] } } }))
    useDocumentStore.getState().setDocument({ projectId: project.id, drawingId: drawing.id, name: "Main" })
    await new Promise((r) => setTimeout(r, 50))
    expect(session.summary().scratch).toBe(false)
    expect(readDraft()).toBeUndefined()
  })
})

describe("the CAM program", () => {
  const program = async (gcode: string) => {
    const project = await run<{ id: string }>(app.client.projects.create({ payload: { name: "CAM session" } }))
    const row = await run<Parameters<typeof restoreCamProgram>[1]>(app.client.toolpaths.create({ payload: { name: "Part 1", projectId: project.id, data: {}, gcode } }))
    begin()
    await restoreCamProgram(app.state, row, () => true)
    await new Promise((r) => setTimeout(r, 50))
    return row
  }

  test("an unsaved program has nothing to autosave; a saved one is updated in place and keeps a version", async () => {
    useCamStore.getState().setGcode("G0 X1")
    begin()
    expect(session.program.state()).toBe("clean")
    expect(session.summary().active).toBe(false)
    stop?.(); dispose?.(); stop = undefined; dispose = undefined; resetStores()

    const row = await program("G0 X1")
    expect(session.program.state()).toBe("clean")
    useCamStore.getState().setGcode("G0 X1\nG1 X5 F300")
    await new Promise((r) => setTimeout(r, 450))
    expect(session.program.state()).toBe("dirty")
    await session.program.saveNow("auto")
    expect(session.program.state()).toBe("clean")
    const after = await run<{ gcode: string }>(app.client.toolpaths.get({ params: { id: row.id } }))
    expect(after.gcode).toBe("G0 X1\nG1 X5 F300")
    const versions = await run<ReadonlyArray<{ gcode?: string | null }>>(app.client.toolpathExtras.listVersions({ params: { id: row.id } }))
    expect(versions.some((version) => version.gcode === "G0 X1")).toBe(true)
  })

  test("a program changed elsewhere is not overwritten by autosave; a manual save does, keeping the other version", async () => {
    const row = await program("G0 X1")
    useCamStore.getState().setGcode("G0 X1\nG1 X9 F300")
    await run(app.client.toolpaths.update({ params: { id: row.id }, payload: { gcode: "G0 X77" } }))
    const failure = await session.program.saveNow("auto").catch((cause) => cause)
    expect(failure).toBeInstanceOf(ProgramConflict)
    expect((failure as ProgramConflict).retryable).toBe(false)
    expect(session.program.state()).toBe("error")
    expect((await run<{ gcode: string }>(app.client.toolpaths.get({ params: { id: row.id } }))).gcode).toBe("G0 X77")
    await session.program.saveNow("manual")
    expect((await run<{ gcode: string }>(app.client.toolpaths.get({ params: { id: row.id } }))).gcode).toBe("G0 X1\nG1 X9 F300")
    const versions = await run<ReadonlyArray<{ gcode?: string | null }>>(app.client.toolpathExtras.listVersions({ params: { id: row.id } }))
    expect(versions.some((version) => version.gcode === "G0 X77")).toBe(true)
  })

  test("saveAll saves the drawing and the program together", async () => {
    const row = await program("G0 X1")
    const { drawingId } = await openProject()
    useCamStore.getState().setGcode("G0 X1\nG1 X2 F100")
    useElementsStore.setState({ elements: [box("a", 40)] })
    const outcome = await session.saveAll("manual")
    expect(outcome).toMatchObject({ document: "saved", program: "saved" })
    expect((await stored(drawingId)).data["elements"][0].x).toBe(40)
    expect((await run<{ gcode: string }>(app.client.toolpaths.get({ params: { id: row.id } }))).gcode).toBe("G0 X1\nG1 X2 F100")
  })
})

describe("settings", () => {
  test("autosave is on every two minutes by default; a stored value outside the offered intervals falls back", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ autosave: true, autosaveMinutes: 2 })
    expect(decodeSettings({ autosave: false, autosaveMinutes: 10 })).toMatchObject({ autosave: false, autosaveMinutes: 10 })
    expect(decodeSettings({ autosaveMinutes: 3 })).toMatchObject({ autosaveMinutes: 2 })
    expect(decodeSettings({ autosave: "yes" })).toMatchObject({ autosave: true })
  })
})
