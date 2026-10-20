import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { Schema } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { SavedCamProgram, snapshotCamProgram, savedProgramData, restoreCamProgram, reconcileSavedProgram } from "../src/features/cam/lib/saved-program.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
const plate = { id: "plate", type: "cube", width: 30, height: 20, depth: 5, layerId: "default" }
let artifact: cam.kernel.CamArtifact
beforeAll(async () => {
  app = await bootLiveApp()
  const result = await app.state.runtime.run(app.client.toolpathGenerator.manufacture({ payload: { schemaVersion: 1, id: "save-fixture", name: "Plate", material: "6061", elements: [plate] } }))
  if (result.status !== "ok") throw new Error("The save fixture did not manufacture")
  artifact = result.value
})
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })

const input = async (name: string, value: string) => {
  const field = await app.wait(() => document.querySelector<HTMLInputElement>(`input[name='${name}']`), 30_000)
  field.value = value; field.dispatchEvent(new window.Event("input", { bubbles: true }))
}
const click = async (selector: string) => {
  const button = await app.wait(() => document.querySelector<HTMLButtonElement>(selector), 30_000)
  button.click()
}
const prepareNative = () => {
  useElementsStore.setState({ elements: [plate], selectedElement: null })
  const store = useCamStore.getState()
  store.setKernelArtifact(artifact); store.setGcode(artifact.nc); store.setProgram(artifact.program)
  store.setKernelRequest({ schemaVersion: 1, id: "save-fixture", name: "Plate", material: "6061", elements: [plate] })
  useGeneratorStore.getState().setResult(artifact.nc, [])
}

test("a shared program refreshes from the phone while clean and preserves local code or settings edits", async () => {
  const project = await app.state.runtime.run(app.client.projects.create({ payload: { name: "Shared CAM" } }))
  const row = await app.state.runtime.run(app.client.toolpaths.create({ payload: { name: "Shared program", projectId: project.id, data: {}, gcode: "G0 X1" } }))
  await restoreCamProgram(app.state, row, () => true)
  await app.state.runtime.run(app.client.toolpaths.update({ params: { id: row.id }, payload: { gcode: "G0 X2" } }))
  await reconcileSavedProgram(app.state, () => true)
  expect(useCamStore.getState().gcode).toBe("G0 X2")
  useCamStore.getState().setGcode("G0 X99")
  await app.state.runtime.run(app.client.toolpaths.update({ params: { id: row.id }, payload: { gcode: "G0 X3" } }))
  await reconcileSavedProgram(app.state, () => true)
  expect(useCamStore.getState().gcode).toBe("G0 X99")
  await restoreCamProgram(app.state, await app.state.runtime.run(app.client.toolpaths.get({ params: { id: row.id } })), () => true)
  useGeneratorStore.setState({ settings: { ...useGeneratorStore.getState().settings, toolDiameter: 17 } })
  await app.state.runtime.run(app.client.toolpaths.update({ params: { id: row.id }, payload: { gcode: "G0 X4" } }))
  await reconcileSavedProgram(app.state, () => true)
  expect(useGeneratorStore.getState().settings.toolDiameter).toBe(17)
  expect(useCamStore.getState().gcode).toBe("G0 X3")
})

test("a composite CAM resource saves and reopens every operation and displays its saved component", async () => {
  useElementsStore.setState({ elements: [plate], selectedElement: null })
  const store = useCamStore.getState()
  const codes = ["G21\nG0 X0 Y0 Z5\nG1 Z-1 F300\nG1 X10 F800", "G21\nG0 X10 Y0 Z5\nG1 Z-2 F200\nG1 Y10 F600"]
  for (const [index, gcode] of codes.entries()) store.upsertOperationResult({ id: `operation-${index}`, name: index ? "Finish contour" : "Rough pocket", gcode, program: cam.generator.analyseGcode(gcode).program, settings: { ...cam.generator.DEFAULT_SETTINGS, toolDiameter: index ? 3 : 6 }, tool: index ? "endmill Ø3" : "endmill Ø6" })
  const snapshot = await snapshotCamProgram(app.state, useCamStore.getState().gcode)
  expect(snapshot.operations).toHaveLength(2)
  const project = await app.state.runtime.run(app.client.projects.create({ payload: { name: "Composite resource" } }))
  const row = await app.state.runtime.run(app.client.toolpaths.create({ payload: { name: "Pocket and contour", projectId: project.id, operationType: "multi-operation", gcode: snapshot.gcode, data: savedProgramData(undefined, snapshot) } }))
  store.reset()
  await restoreCamProgram(app.state, row, () => true)
  expect(useCamStore.getState().operationResults.map((operation) => operation.name)).toEqual(["Rough pocket", "Finish contour"])
  expect(useCamStore.getState().operationResults.map((operation) => operation.gcode)).toEqual(codes)
  expect(useCamStore.getState().program.toolpaths).toHaveLength(snapshot.program.toolpaths.length)
  useElementsStore.setState({ elements: [{ ...plate, width: 999 }], selectedElement: null })
  const view = app.visit(`/toolpaths/${row.id}`)
  try {
    const details = await app.wait(() => document.querySelector("[data-testid='toolpath-program-details']"), 30_000)
    expect(details.querySelector("[data-testid='resource-geometry-preview']")).not.toBeNull()
    const items = details.querySelectorAll("[data-testid='saved-operations'] > li")
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain("Rough pocket")
    expect(items[1]!.textContent).toContain("endmill Ø3")
    expect(details.textContent).not.toContain("no saved component geometry")
    expect(useElementsStore.getState().elements[0]!["width"]).toBe(999)
  } finally { view.dispose() }
  const edited = await snapshotCamProgram(app.state, `${snapshot.gcode}\n; changed`)
  expect(edited.operations).toBeUndefined()
  expect(savedProgramData(row.data, edited)["operations"]).toBeUndefined()
})

test("CAM Save exports exact NC and a portable multi-tool path, then imports the file", async () => {
  prepareNative()
  const view = app.visit("/cam")
  const downloads: Array<{ filename: string; blob: Blob }> = []
  const blobs = new Map<string, Blob>()
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, anchorClick = window.HTMLAnchorElement.prototype.click
  URL.createObjectURL = (blob) => { const id = `blob:cam-save-${blobs.size}`; blobs.set(id, blob as Blob); return id }
  URL.revokeObjectURL = () => undefined
  window.HTMLAnchorElement.prototype.click = function () { downloads.push({ filename: this.download, blob: blobs.get(this.href)! }) }
  try {
    await click("button[title='Save G-Code']")
    await input("fileName", "Plate finish")
    await click("[data-testid='workspace-export-file']")
    expect(downloads[0]!.filename).toBe("Plate finish.nc")
    expect(await downloads[0]!.blob.text()).toBe(artifact.nc)
    await click("button[title='Save G-Code']")
    await input("fileName", "Plate finish")
    const format = document.querySelector<HTMLSelectElement>("select[name='fileFormat']")!
    format.value = "toolpath"; format.dispatchEvent(new window.Event("change", { bubbles: true }))
    await click("[data-testid='workspace-export-file']")
    await app.wait(() => downloads.length === 2)
    const json = await downloads[1]!.blob.text()
    expect(downloads[1]!.filename).toBe("Plate finish.cam.json")
    const snapshot = Schema.decodeUnknownSync(SavedCamProgram)(JSON.parse(json))
    expect(snapshot.gcode).toBe(artifact.nc)
    expect(snapshot.program).toEqual(artifact.program)
    expect(snapshot.kernelArtifact?.identity).toEqual(artifact.identity)
    expect(snapshot.drawing["elements"]).toEqual([plate])
    useCamStore.getState().reset()
    const picker = await app.wait(() => document.querySelector<HTMLInputElement>("input[type='file']"))
    Object.defineProperty(picker, "files", { value: [new window.File([json], "Plate.cam.json", { type: "application/json" })], configurable: true })
    picker.dispatchEvent(new window.Event("change", { bubbles: true }))
    await app.wait(() => useCamStore.getState().gcode === artifact.nc)
    expect(useCamStore.getState().program).toEqual(artifact.program)
    expect(useCamStore.getState().kernelArtifact?.identity.nc).toBe(artifact.identity.nc)
    expect(useCamStore.getState().savedProgram).toBeUndefined()
  } finally { view.dispose(); URL.createObjectURL = create; URL.revokeObjectURL = revoke; window.HTMLAnchorElement.prototype.click = anchorClick }
})

test("CAM Save creates a private project with CAD and CAM, updates with history and reopens the stored original", async () => {
  prepareNative()
  let view = app.visit("/cam")
  try {
    await click("button[title='Save G-Code']")
    await click("[data-testid='workspace-save-as-project']")
    await input("camProgramName", "Native plate")
    await input("projectName", "Machined plate")
    await click("[data-testid='workspace-save-project']")
    const saved = await app.wait(() => useCamStore.getState().savedProgram, 30_000)
    const row = await app.state.runtime.run(app.client.toolpaths.get({ params: { id: saved.id } }))
    expect(row.name).toBe("Native plate")
    expect(row.gcode).toBe(artifact.nc)
    expect(row.drawingId).toBe(useDocumentStore.getState().drawingId)
    expect(row.data).toMatchObject({ format: "cadcamfun-cam", version: 1, kernelArtifact: { identity: artifact.identity }, program: artifact.program })
    const project = await app.sidecar.call(`/api/projects/${saved.projectId}`)
    expect(project.body.isPublic).toBe(false)
    const drawing = await app.sidecar.call(`/api/drawings/${saved.drawingId}`)
    expect(drawing.body.data.elements).toEqual([plate])
    await app.state.runtime.run(app.client.toolpaths.update({ params: { id: saved.id }, payload: { data: { ...(row.data as Record<string, unknown>), customNote: "Keep this metadata", sourceRevision: "original-revision", verification: { original: true } } } }))
    const changed = `${artifact.nc}\n; edited in CAM`
    useCamStore.getState().setGcode(changed)
    await click("button[title='Save G-Code']")
    await click("[data-testid='workspace-save-as-project']")
    expect(document.querySelector<HTMLSelectElement>("select[name='camSaveDestination']")!.value).toBe("update")
    await click("[data-testid='workspace-save-project']")
    await app.wait(() => !document.querySelector("[data-testid='workspace-project-dialog']"))
    const updated = await app.state.runtime.run(app.client.toolpaths.get({ params: { id: saved.id } }))
    expect(updated.gcode).toBe(changed)
    expect(updated.data).toMatchObject({ customNote: "Keep this metadata", gcode: changed })
    expect((updated.data as Record<string, unknown>)["kernelArtifact"]).toBeUndefined()
    expect((updated.data as Record<string, unknown>)["sourceRevision"]).toBeUndefined()
    expect((updated.data as Record<string, unknown>)["verification"]).toBeUndefined()
    const versions = await app.state.runtime.run(app.client.toolpathExtras.listVersions({ params: { id: saved.id } }))
    expect(versions).toHaveLength(1)
    expect(versions[0]!.gcode).toBe(artifact.nc)
    expect(versions[0]!.data).toMatchObject({ kernelArtifact: { identity: artifact.identity }, customNote: "Keep this metadata" })
    await app.state.runtime.run(app.client.toolpathExtras.restoreVersion({ params: { id: saved.id }, payload: { versionId: versions[0]!.id } }))
    view.dispose(); resetStores()
    view = app.visit(`/cam?loadToolpath=${saved.id}`)
    await app.wait(() => useCamStore.getState().savedProgram?.id === saved.id)
    expect(useCamStore.getState().gcode).toBe(artifact.nc)
    expect(useCamStore.getState().program).toEqual(artifact.program)
    expect(useCamStore.getState().kernelArtifact?.identity).toEqual(artifact.identity)
    await click("button[title='Save G-Code']")
    await click("[data-testid='workspace-save-as-project']")
    expect(document.querySelector<HTMLAnchorElement>("a[href='/toolpaths/" + saved.id + "']")?.textContent).toBe("Manage saved toolpath")
  } finally { view.dispose() }
})

test("generator Save uses the same project flow, without overwriting an existing CAD drawing", async () => {
  const project = await app.state.runtime.run(app.client.projects.create({ payload: { name: "Existing machining" } }))
  const drawing = await app.state.runtime.run(app.client.drawings.createForProject({ params: { id: project.id }, payload: { name: "Stored drawing", data: { elements: [{ ...plate, width: 40 }] } } }))
  useDocumentStore.getState().setDocument({ projectId: project.id, drawingId: drawing.id })
  prepareNative()
  const view = app.visit("/cam")
  try {
    const button = await app.wait(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Save as Toolpath")), 30_000)
    button.click()
    await app.wait(() => document.querySelector<HTMLSelectElement>("select[name='camSaveProject']")?.value === project.id)
    await app.wait(() => !document.querySelector<HTMLButtonElement>("[data-testid='workspace-save-project']")?.disabled)
    await click("[data-testid='workspace-save-project']")
    const saved = await app.wait(() => useCamStore.getState().savedProgram, 30_000)
    expect(saved.projectId).toBe(project.id)
    expect(saved.drawingId).toBe(drawing.id)
    const stored = await app.sidecar.call(`/api/drawings/${drawing.id}`)
    expect(stored.body.data.elements[0].width).toBe(40)
    const rows = await app.state.runtime.run(app.client.toolpaths.list({ query: { projectId: project.id } }))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.gcode).toBe(artifact.nc)
    expect(rows[0]!.data).toMatchObject({ program: artifact.program })
    expect(localStorage.getItem("gcodeFromToolpathGenerator")).toBeNull()
  } finally { view.dispose() }
})

test("CAM Undo, Redo and History restore NC, native paths and settings together and discard abandoned redo", async () => {
  const { useCamHistoryStore, flushCamHistory, resetCamHistory } = await import("../src/features/cam/store/camHistoryStore.ts")
  prepareNative(); resetCamHistory()
  const view = app.visit("/cam")
  try {
    const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"), 30_000)
    expect(document.querySelector<HTMLButtonElement>("button[title='Undo']")!.disabled).toBe(true)
    const changed = `${artifact.nc}\n; manual edit`
    editor.value = changed; editor.dispatchEvent(new window.Event("input", { bubbles: true }))
    await app.wait(() => useCamHistoryStore.getState().index > 0)
    await click("button[title='Undo']")
    expect(useCamStore.getState().gcode).toBe(artifact.nc)
    expect(useCamStore.getState().program).toEqual(artifact.program)
    expect(useCamStore.getState().kernelRequest?.id).toBe("save-fixture")
    await click("button[title='Redo']")
    expect(useCamStore.getState().gcode).toBe(changed)
    const feed = useGeneratorStore.getState().settings.feedrate
    useGeneratorStore.getState().patchSettings({ feedrate: feed + 100 }); flushCamHistory()
    expect(useGeneratorStore.getState().settings.feedrate).toBe(feed + 100)
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }))
    expect(useGeneratorStore.getState().settings.feedrate).toBe(feed)
    useCamStore.getState().setGcode(`${artifact.nc}\n; different branch`); flushCamHistory()
    expect(document.querySelector<HTMLButtonElement>("button[title='Redo']")!.disabled).toBe(true)
    const count = useCamHistoryStore.getState().entries.length
    useCamStore.getState().setPlaybackTime(2); flushCamHistory()
    expect(useCamHistoryStore.getState().entries).toHaveLength(count)
    await click("button[title='CAM History']")
    expect(document.querySelector("[data-testid='cam-history-dialog']")?.textContent).toContain("Initial program")
    const first = document.querySelector<HTMLButtonElement>("[data-testid='cam-history-dialog'] ol button")!
    first.click()
    expect(useCamStore.getState().gcode).toBe(artifact.nc)
    expect(useCamStore.getState().program).toEqual(artifact.program)
    expect(useCamStore.getState().playing).toBe(false)
  } finally { view.dispose() }
})

test("CAD and CAM share export/project dialog layout and show their contents", async () => {
  prepareNative()
  let view = app.visit("/cad")
  try {
    await click("button[title='Save Project']")
    const cadExport = await app.wait(() => document.querySelector("[role='dialog'] [data-testid='workspace-export-dialog']"))
    const exportClass = cadExport.parentElement!.parentElement!.className
    await click("[data-testid='workspace-save-as-project']")
    const cadProject = await app.wait(() => document.querySelector("[data-testid='workspace-project-dialog']"))
    const projectClass = cadProject.parentElement!.parentElement!.className
    expect(cadProject.textContent).toContain("CAD drawing")
    for (const name of ["projectName", "description", "organization", "public"]) expect(cadProject.querySelector(`[name='${name}']`)).not.toBeNull()
    view.dispose(); view = app.visit("/cam")
    await click("button[title='Save G-Code']")
    const camExport = await app.wait(() => document.querySelector("[data-testid='workspace-export-dialog']"))
    expect(camExport.parentElement!.parentElement!.className).toBe(exportClass)
    await click("[data-testid='workspace-save-as-project']")
    const camProject = await app.wait(() => document.querySelector("[data-testid='workspace-project-dialog']"))
    expect(camProject.parentElement!.parentElement!.className).toBe(projectClass)
    expect(camProject.textContent).toContain("CAM program")
    expect(camProject.textContent).toContain(artifact.material.name)
    expect(camProject.textContent).toContain(artifact.identity.nc)
    for (const name of ["projectName", "description", "organization", "public"]) expect(camProject.querySelector(`[name='${name}']`)).not.toBeNull()
  } finally { view.dispose() }
})
