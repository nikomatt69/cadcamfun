/**
 * The title block of a drawing, over the real sidecar handlers: a drawing that has none shows a complete one and stores it with its next
 * save, the form dialog edits it from the CAD and the CAM workspace, the server refuses a damaged one, and what is stored is what every
 * screen and the drawing sheet read.
 */
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createRoot } from "solid-js"
import { drawing } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { applyStoredDrawing } from "../src/features/cad/lib/open-drawing.ts"
import { currentTitleBlock } from "../src/features/cad/lib/document-setup.ts"
import { drawingPayload } from "../src/features/cad/lib/projectSnapshot.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { reconcileFromStored } from "../src/features/ai/lib/editor-sync.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectSession: typeof import("../src/features/projects/lib/project-session.ts").projectSession
beforeAll(async () => { app = await bootLiveApp(); projectSession = (await import("../src/features/projects/lib/project-session.ts")).projectSession })
afterAll(async () => { await app.dispose() })
let stopSession: (() => void) | undefined
afterEach(() => { stopSession?.(); stopSession = undefined; resetStores() })

const run = <A,>(effect: unknown) => app.state.runtime.run(effect as never) as Promise<A>
const open = async (data: Record<string, unknown> = { elements: [], version: "1.0" }) => {
  const project = await run<{ id: string }>(app.client.projects.create({ payload: { name: "Titles" } }))
  const row = await run<{ id: string }>(app.client.drawings.createForProject({ params: { id: project.id }, payload: { name: "Bracket", data } }))
  applyStoredDrawing(app.state, await run(app.client.drawings.get({ params: { id: row.id } })))
  await projectSession(app.state).document.baseline()
  return row.id
}
const stored = async (id: string) => (await run<{ data: { titleBlock?: Record<string, unknown> } }>(app.client.drawings.get({ params: { id } }))).data.titleBlock

test("a drawing without a title block shows a complete one, and a save stores it with the change that asks for one", async () => {
  const id = await open()
  const block = currentTitleBlock()
  expect(block).toMatchObject({ title: "Bracket", revision: "A", status: "draft", standard: "ISO 2768-1 m", scale: "auto", projection: "first", units: "mm" })
  expect(Object.keys(block).sort()).toEqual(drawing.TITLE_BLOCK_FIELDS.map((f) => f.key).sort())
  expect(drawingPayload(app.state).titleBlock).toEqual(block)
  expect(await stored(id)).toBeUndefined()
  createRoot((dispose) => { stopSession = () => { stop(); dispose() }; const stop = projectSession(app.state).start() })
  useDocumentStore.getState().setTitleBlock({ ...useDocumentStore.getState().titleBlock, number: "BRK-777" })
  await projectSession(app.state).document.saveNow("manual")
  expect(await stored(id)).toEqual({ ...block, number: "BRK-777" })
})

test("a stored title block comes back as it was, and a damaged field falls back without losing the rest", async () => {
  await open({ elements: [], version: "1.0", titleBlock: { title: "Gearbox cover", number: "GB-114", revision: "C", status: "released", mass: 1.25 } })
  expect(currentTitleBlock()).toMatchObject({ title: "Gearbox cover", number: "GB-114", revision: "C", status: "released", mass: 1.25, units: "mm" })
  useDocumentStore.getState().setTitleBlock(drawing.validTitleBlockFields({ title: "Cover", status: "shipped", date: "tomorrow" }))
  expect(useDocumentStore.getState().titleBlock).toEqual({ title: "Cover" })
})

test("the form dialog opens from the CAD view, edits the block, validates it and saves it with the drawing", async () => {
  const id = await open()
  const view = app.visit("/cad")
  try {
    const overlay = await app.wait(() => document.querySelector("[data-testid='title-block-overlay']"), 30_000)
    expect(overlay.getAttribute("data-mode")).toBe("3d")
    expect(overlay.textContent).toContain("Bracket")
    expect(overlay.textContent).toContain("ISO 2768-1 m")
    document.querySelector<HTMLButtonElement>("[data-testid='title-block-edit']")!.click()
    const form = await app.wait(() => document.querySelector("[data-testid='title-block-form']"))
    expect(form.textContent).toContain("Drawing number")
    expect(form.textContent).not.toContain("Program number")
    const type = (field: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(`#title-block-${field}`)!
      input.value = value
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }
    const save = document.querySelector<HTMLButtonElement>("[data-testid='title-block-save']")!
    type("revision", "123456789")
    await app.wait(() => save.disabled)
    expect(form.textContent).toContain("Not valid")
    type("revision", "B")
    await app.wait(() => !save.disabled)
    type("title", "Bracket, rear")
    type("number", "BRK-002")
    type("approvedBy", "M. Bianchi")
    save.click()
    await app.wait(() => document.querySelector("[data-testid='title-block-form']") === null, 10_000)
    expect(await stored(id)).toMatchObject({ title: "Bracket, rear", number: "BRK-002", revision: "B", approvedBy: "M. Bianchi", status: "draft" })
    expect(document.querySelector("[data-testid='title-block-overlay']")!.textContent).toContain("BRK-002")
  } finally { view.dispose() }
})

test("the CAM workspace shows the same block with its manufacturing fields", async () => {
  await open({ elements: [], version: "1.0", titleBlock: { title: "Bracket", number: "BRK-001", program: "O1001", machine: "VMC 3-axis", setup: "Op 10" } })
  useCamStore.getState().setActiveTab("toolpath")
  const view = app.visit("/cam")
  try {
    const overlay = await app.wait(() => document.querySelector("[data-testid='title-block-overlay']"), 30_000)
    expect(overlay.textContent).toContain("BRK-001")
    expect(overlay.textContent).toContain("O1001")
    expect(overlay.textContent).toContain("VMC 3-axis")
    expect(overlay.textContent).toContain("Op 10")
  } finally { view.dispose() }
})

test("the server refuses a damaged block and keeps the stored one", async () => {
  const id = await open({ elements: [], version: "1.0", titleBlock: { title: "Kept" } })
  const attempt = await run<unknown>(app.client.drawings.update({ params: { id }, payload: { data: { titleBlock: { date: "yesterday" } }, mergeData: true } })).then(() => "saved", (error: { message?: string }) => String(error.message ?? error))
  expect(attempt).toContain("Invalid title block")
  expect((await stored(id))?.["title"]).toBe("Kept")
})

test("the drawing sheet written from the stored block carries it", async () => {
  await open({ elements: [], version: "1.0", titleBlock: { title: "Bracket", number: "BRK-001", owner: "ACME Machining", checkedBy: "L. Verdi", scale: "2:1" } })
  const options = drawing.sheetOptionsOfTitleBlock(currentTitleBlock())
  expect(options).toMatchObject({ title: "Bracket", drawingNumber: "BRK-001", scale: 2, projection: "first" })
  expect(options.titleBlock?.owner).toBe("ACME Machining")
})

const storeElsewhere = (id: string, titleBlock: Record<string, unknown>) =>
  run(app.client.drawings.update({ params: { id }, payload: { data: { titleBlock }, mergeData: true } }))

test("a title block stored elsewhere (the assistant) comes into the open editor, and a change made here is kept", async () => {
  const id = await open({ elements: [], version: "1.0", titleBlock: { title: "Bracket", number: "BRK-001" } })
  await storeElsewhere(id, { title: "Bracket", number: "BRK-001", revision: "B", status: "released" })
  await reconcileFromStored(app.state)
  expect(currentTitleBlock()).toMatchObject({ number: "BRK-001", revision: "B", status: "released" })

  // The user edits the block here; the assistant stores another one meanwhile: the editor's edit stays, the next save sends it.
  useDocumentStore.getState().setTitleBlock({ ...useDocumentStore.getState().titleBlock, title: "Mine" })
  await storeElsewhere(id, { title: "Theirs", number: "BRK-001", revision: "C" })
  await reconcileFromStored(app.state)
  expect(currentTitleBlock()).toMatchObject({ title: "Mine", revision: "B" })
})
