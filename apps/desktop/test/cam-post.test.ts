import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

const plate = { id: "plate", type: "cube", name: "Plate", x: 0, y: 0, z: 5, width: 40, height: 30, depth: 10, layerId: "default" }

const typeInto = (el: HTMLTextAreaElement, value: string): void => {
  el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
}
const click = async (id: string): Promise<void> => (await app.wait(() => document.querySelector<HTMLButtonElement>(`[data-testid='${id}']`), 30_000)).click()

test("the post editor starts from a built-in, shows the place of a mistake, previews the program and uses the checked definition", async () => {
  useElementsStore.getState().addElements([plate])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    await click("kernel-post-start-fanuc")
    const text = await app.wait(() => document.querySelector<HTMLTextAreaElement>("[data-testid='kernel-post-text']"), 30_000)
    expect(JSON.parse(text.value).name).toBe("Fanuc")
    const definition = JSON.parse(text.value)

    // A placeholder that does not exist is reported with the field it is in; the definition cannot be used.
    typeInto(text, JSON.stringify({ ...definition, toolChange: ["T{toool} M6"] }))
    await click("kernel-post-check")
    const issues = await app.wait(() => document.querySelector("[data-testid='kernel-post-issues']"), 30_000)
    expect(issues.querySelector("li")!.dataset["path"]).toBe("toolChange[0]")
    expect(document.querySelector<HTMLButtonElement>("[data-testid='kernel-post-use']")!.disabled).toBe(true)

    // Fixed, it writes the sample program with its own words, and can be used.
    typeInto(text, JSON.stringify({ ...definition, toolChange: ["T{tool} M6", "G43 H{tool}", "(TOOL {tool} IN)"] }))
    await click("kernel-post-check")
    const sample = await app.wait(() => document.querySelector("[data-testid='kernel-post-sample']"), 30_000)
    expect(sample.textContent).toMatch(/G43 H1\n\(TOOL 1 IN\)/)
    expect(document.querySelector("[data-testid='kernel-post-issues']")).toBeNull()
    expect(useGeneratorStore.getState().kernelSettings.postDefinition).toBeUndefined()
    await click("kernel-post-use")
    expect((useGeneratorStore.getState().kernelSettings.postDefinition as { toolChange: string[] }).toolChange).toHaveLength(3)
    await click("kernel-post-clear")
    expect(useGeneratorStore.getState().kernelSettings.postDefinition).toBeUndefined()

    // Kept in the library, it comes back in the list of stored posts.
    await click("kernel-post-save")
    const stored = await app.wait(() => {
      const select = document.querySelector<HTMLSelectElement>("[data-testid='kernel-post-stored']")
      return select !== null && select.options.length > 1 ? select : null
    }, 30_000)
    expect(stored.options[1]!.textContent).toBe("Fanuc")
  } finally { view.dispose() }
})

test("a post linked to a saved machine comes with the machine: linked once, it is loaded when the machine is chosen and dropped when it is left", async () => {
  const created = await app.sidecar.call("/api/machine-configs", { method: "POST", json: { name: "Shop VMC", type: "mill", config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 9000, maxFeedRate: 8000, controller: "fanuc" } } })
  const machineId = (created.body as { data: { id: string } }).data.id
  useElementsStore.getState().addElements([plate])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const select = await app.wait(() => document.querySelector<HTMLSelectElement>("[data-testid='kernel-machine']"), 30_000)
    await app.wait(() => [...select.options].some((o) => o.textContent === "Shop VMC") ? true : null, 10_000)
    select.value = `config:${machineId}`
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    await app.wait(() => useGeneratorStore.getState().kernelSettings.machineConfig?.id === machineId ? true : null, 10_000)

    // Write a post, keep it, link it to this machine.
    await click("kernel-post-start-fanuc")
    const text = await app.wait(() => document.querySelector<HTMLTextAreaElement>("[data-testid='kernel-post-text']"), 30_000)
    const definition = { ...JSON.parse(text.value), name: "Shop post", toolChange: ["T{tool} M6", "G43 H{tool}", "(TOOL {tool} IN)"] }
    typeInto(text, JSON.stringify(definition))
    await click("kernel-post-check")
    await app.wait(() => document.querySelector("[data-testid='kernel-post-sample']"), 30_000)
    await click("kernel-post-save")
    await app.wait(() => (document.querySelector<HTMLButtonElement>("[data-testid='kernel-post-link']")?.disabled === false ? true : null), 30_000)
    await click("kernel-post-link")
    await app.wait(() => typeof useGeneratorStore.getState().kernelSettings.machineConfig?.config["postDefinitionId"] === "string" ? true : null, 30_000)
    const stored = await app.sidecar.call(`/api/machine-configs/${machineId}`)
    expect(typeof (stored.body as { data: { config: Record<string, unknown> } }).data.config["postDefinitionId"]).toBe("string")

    // Leave the machine and come back: the post is dropped, then brought back with the machine.
    select.value = cam.kernel.DEFAULT_MACHINE.id
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    await app.wait(() => useGeneratorStore.getState().kernelSettings.machineConfig === undefined ? true : null, 10_000)
    useGeneratorStore.getState().patchKernelSettings({ postDefinition: undefined })
    select.value = `config:${machineId}`
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    const brought = await app.wait(() => (useGeneratorStore.getState().kernelSettings.postDefinition as { name?: string } | undefined)?.name === "Shop post" ? true : null, 30_000)
    expect(brought).toBe(true)
  } finally {
    view.dispose()
    useGeneratorStore.getState().patchKernelSettings({ machine: cam.kernel.DEFAULT_MACHINE.id, machineConfig: undefined, postDefinition: undefined })
  }
})
