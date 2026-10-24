import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

test("the kernel panel hands out the setup sheet of the program it generated, equal to the stored artifact", async () => {
  useElementsStore.getState().addElements([{ id: "plate", type: "cube", name: "Plate", width: 30, height: 20, depth: 5, x: 0, y: 0, z: 0, layerId: "default" }])
  useElementsStore.setState({ selectedElement: null })
  const downloads: Array<{ blob: Blob; file: string }> = []
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  URL.createObjectURL = (blob: Blob | MediaSource) => { downloads.push({ blob: blob as Blob, file: "" }); return "blob:sheet" }
  URL.revokeObjectURL = () => {}
  const view = app.visit("/cam")
  try {
    const generate = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']"), 30_000)
    generate.click()
    await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 60_000)
    const artifact = useCamStore.getState().kernelArtifact!
    expect(artifact).toBeDefined()
    document.querySelector<HTMLButtonElement>("[data-testid='kernel-setup-sheet']")!.click()
    expect(downloads).toHaveLength(1)
    expect(downloads[0]!.blob.type).toMatch(/^text\/html/)
    const html = await downloads[0]!.blob.text()
    expect(html.startsWith("<!doctype html>")).toBe(true)
    for (const tool of artifact.tools) expect(html).toContain(`T${tool.number}`)
    for (const op of artifact.operations) expect(html).toContain(op.name)
    expect(html).toContain(artifact.identity.nc)
    expect(html).toContain(artifact.release)
  } finally {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    view.dispose()
  }
})
