import { afterAll, beforeAll, expect, test } from "bun:test"
import { buildTools } from "@cadcamfun/ai"
import { drawing, plateTemplate } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

test("cad.drawing reads the accessible active part without changing the document", async () => {
  const handlers = await app.toolHandlers()
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Drawing export" } })).body.id
  const context = { sessionId: "drawing-test", projectId: project, signal: new AbortController().signal }
  const tools = buildTools(handlers, project)
  const edit = tools.find((t) => t.id === "cad_edit")!
  const cad = tools.find((t) => t.id === "cad")!
  const created = JSON.parse(await edit.execute({ action: "parametric_create", name: "Plate", history: plateTemplate() }, context))
  const elementId = created.ids[0]
  const inspect = () => cad.execute({ action: "parametric_inspect", elementId }, context)
  const before = await inspect()
  // Two faces of one answer: the whole sheet is the value (Code Mode, the stored part, the desktop); the model reads a
  // bounded text that keeps the identity and says what it left out of the long SVG.
  const answer = await cad.executeWithFiles!({ action: "drawing", elementId, options: { size: "A4", title: "Plate drawing" } }, context)
  const sheet = answer.value as { ok: boolean; mutated: boolean; elementId: string; size: unknown; svg: string }
  expect(sheet.ok).toBe(true)
  expect(sheet.mutated).toBe(false)
  expect(sheet.elementId).toBe(elementId)
  expect(sheet.size).toEqual({ width: 297, height: 210 })
  expect(sheet.svg).toContain("Plate drawing")
  expect(answer.output.length).toBeLessThanOrEqual(24_000)
  if (answer.bounded) {
    const text = JSON.parse(answer.output) as { ok: boolean; elementId: string; _preview: { complete: boolean; omitted: Array<{ path: string }> } }
    expect(text).toMatchObject({ ok: true, elementId, _preview: { complete: false } })
    expect(text._preview.omitted.some((omission) => omission.path === "svg")).toBe(true)
  }
  expect(await inspect()).toEqual(before)
  expect(JSON.parse(await cad.execute({ action: "drawing", elementId: "missing" }, context)).ok).toBe(false)
  expect(JSON.parse(await cad.execute({ action: "drawing", elementId, history: plateTemplate() }, context)).ok).toBe(false)
  expect(JSON.parse(await cad.execute({ action: "drawing", options: { size: "A4" } }, context)).ok).toBe(false)
}, 60000)

test("the assistant reads and sets the drawing's title block, and the sheet it draws carries the stored one", async () => {
  const handlers = await app.toolHandlers()
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Title block" } })).body.id
  const context = { sessionId: "title-block-test", projectId: project, signal: new AbortController().signal }
  const tools = buildTools(handlers, project)
  const edit = tools.find((t) => t.id === "cad_edit")!
  const cad = tools.find((t) => t.id === "cad")!
  const created = JSON.parse(await edit.execute({ action: "parametric_create", name: "Plate", history: plateTemplate() }, context))
  const elementId = created.ids[0]

  // A drawing that was never described has a complete block anyway: the defaults the screens and the sheet use.
  const first = JSON.parse(await cad.execute({ action: "title_block" }, context))
  expect(first).toMatchObject({ ok: true, titleBlock: { revision: "A", status: "draft", standard: "ISO 2768-1 m", scale: "auto", projection: "first", units: "mm" } })
  expect(Object.keys(first.titleBlock).sort()).toEqual(drawing.TITLE_BLOCK_FIELDS.map((f) => f.key).sort())

  const set = JSON.parse(await edit.execute({ action: "title_block_set", titleBlock: { title: "Mounting plate", number: "MP-114", revision: "B", status: "released", checkedBy: "L. Verdi", scale: "1:2" } }, context))
  expect(set).toMatchObject({ ok: true, titleBlock: { title: "Mounting plate", number: "MP-114", revision: "B", status: "released", checkedBy: "L. Verdi", scale: "1:2", units: "mm" } })
  // What was set is stored with the drawing, whole, and a later partial write keeps the rest.
  const stored = (await app.call(`/api/drawings/${set.drawingId}`)).body.data.titleBlock
  expect(stored).toMatchObject({ title: "Mounting plate", number: "MP-114", status: "released" })
  expect(Object.keys(stored)).toHaveLength(drawing.TITLE_BLOCK_FIELDS.length)
  const again = JSON.parse(await edit.execute({ action: "title_block_set", titleBlock: { revision: "C" } }, context))
  expect(again.titleBlock).toMatchObject({ title: "Mounting plate", number: "MP-114", revision: "C" })

  // A damaged field is refused with the reason and writes nothing.
  const refused = JSON.parse(await edit.execute({ action: "title_block_set", titleBlock: { date: "tomorrow" } }, context))
  expect(refused.ok).toBe(false)
  expect((await app.call(`/api/drawings/${set.drawingId}`)).body.data.titleBlock.revision).toBe("C")
  expect(JSON.parse(await edit.execute({ action: "title_block_set", titleBlock: {} }, context)).ok).toBe(false)

  // The sheet is drawn with the stored block; an option of the call still wins over it.
  const answer = await cad.executeWithFiles!({ action: "drawing", elementId, options: { size: "A4" } }, context)
  const sheet = answer.value as { ok: boolean; svg: string; scale: number }
  expect(sheet.ok).toBe(true)
  expect(sheet.svg).toContain("Mounting plate")
  expect(sheet.svg).toContain("MP-114")
  expect(sheet.svg).toContain("Rev. C")
  expect(sheet.scale).toBe(0.5)
  const overridden = (await cad.executeWithFiles!({ action: "drawing", elementId, options: { size: "A4", title: "Other title" } }, context)).value as { svg: string }
  expect(overridden.svg).toContain("Other title")
}, 90000)
