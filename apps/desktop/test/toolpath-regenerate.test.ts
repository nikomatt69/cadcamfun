import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

setDefaultTimeout(180_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

const plate = { id: "plate", type: "cube", name: "Plate", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8, layerId: "default" }

test("the detail screen of a stored native program says the model changed, previews the regeneration with its diff, and accepting keeps the old program as a version", async () => {
  const project = (await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Regenerate screen" } })).body.id as string
  const drawing = (await app.sidecar.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id as string
  const handlers = await app.sidecar.toolHandlers()
  const saved = await handlers.manufactureOperation!(project, { material: "6061" }) as { ok: boolean; operationId: string }
  expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true })
  const before = (await app.sidecar.call(`/api/toolpaths/${saved.operationId}`)).body

  // Same model: the screen says it still matches, and the preview is the same program byte for byte.
  const view = app.visit(`/toolpaths/${saved.operationId}`)
  try {
    const current = await app.wait(() => document.querySelector("[data-testid='toolpath-model-status'][data-tone='ok']"), 60_000)
    expect(current.textContent).toContain("still matches")
    ;(await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='toolpath-regenerate-preview']"), 30_000)).click()
    const same = await app.wait(() => document.querySelector("[data-testid='toolpath-regenerate-result'][data-state='preview']"), 90_000)
    expect(same.textContent).toContain("byte for byte")
    expect(document.querySelector("[data-testid='toolpath-regenerate-accept']")).not.toBeNull()
  } finally { view.dispose() }

  // The model changes: the screen names the change, the preview shows what changes, accepting replaces the program.
  await app.sidecar.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...plate, width: 55 }] } } })
  const changed = app.visit(`/toolpaths/${saved.operationId}`)
  try {
    const warn = await app.wait(() => document.querySelector("[data-testid='toolpath-model-status'][data-tone='warn']"), 60_000)
    expect(warn.textContent).toContain("shape or placement of 1 element")
    ;(await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='toolpath-regenerate-preview']"), 30_000)).click()
    const preview = await app.wait(() => document.querySelector("[data-testid='toolpath-regenerate-result'][data-state='preview']"), 90_000)
    expect(preview.textContent).toMatch(/operations added, \d+ removed, \d+ changed; cycle time [+-]\d+\.\d s; release/)
    expect((await app.sidecar.call(`/api/toolpaths/${saved.operationId}`)).body.gcode).toBe(before.gcode)
    ;(await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='toolpath-regenerate-accept']"), 30_000)).click()
    // The screen reads the replaced program again; the model then matches the drawing.
    await app.wait(() => document.querySelector("[data-testid='toolpath-model-status'][data-tone='ok']"), 90_000)
    const after = (await app.sidecar.call(`/api/toolpaths/${saved.operationId}`)).body
    expect(after.gcode).not.toBe(before.gcode)
    const versions = (await app.sidecar.call(`/api/toolpaths/${saved.operationId}/versions`)).body as ReadonlyArray<{ gcode: string | null }>
    expect(versions.some((v) => v.gcode === before.gcode)).toBe(true)
  } finally { changed.dispose() }
})
