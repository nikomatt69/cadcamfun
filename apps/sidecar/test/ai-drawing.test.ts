import { afterAll, beforeAll, expect, test } from "bun:test"
import { buildTools } from "@cadcamfun/ai"
import { plateTemplate } from "@cadcamfun/core"
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
  const sheet = JSON.parse(await cad.execute({ action: "drawing", elementId, options: { size: "A4", title: "Plate drawing" } }, context))
  expect(sheet.ok).toBe(true)
  expect(sheet.mutated).toBe(false)
  expect(sheet.elementId).toBe(elementId)
  expect(sheet.size).toEqual({ width: 297, height: 210 })
  expect(sheet.svg).toContain("Plate drawing")
  expect(await inspect()).toEqual(before)
  expect(JSON.parse(await cad.execute({ action: "drawing", elementId: "missing" }, context)).ok).toBe(false)
  expect(JSON.parse(await cad.execute({ action: "drawing", elementId, history: plateTemplate() }, context)).ok).toBe(false)
  expect(JSON.parse(await cad.execute({ action: "drawing", options: { size: "A4" } }, context)).ok).toBe(false)
}, 60000)
