import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { kernelRequestOf, kernelStockOf, type JobSources } from "../src/features/cam/lib/job.ts"
import { cam } from "@cadcamfun/core"
import { CamKernelResult } from "@cadcamfun/api"
import { Schema } from "effect"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

test("the additive kernel section runs through the real sidecar and fills the existing G-code and toolpath stores", async () => {
  useElementsStore.getState().addElements([{ id: "plate", type: "cube", name: "Plate", width: 30, height: 20, depth: 5, x: 0, y: 0, z: 0, layerId: "default" }])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']"), 30_000)
    expect(button.disabled).toBe(false)
    expect(document.querySelector("[data-testid='material-section']")).not.toBeNull()
    button.click()
    const evidence = await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 30_000)
    expect(evidence.textContent).toContain("nc-replaypassed")
    // The deviation the program can be promised, term by term, from the artifact the sidecar returned.
    const budget = document.querySelector("[data-testid='kernel-tolerance-budget']")
    expect(budget?.textContent).toMatch(/Promised deviation \d+\.\d+ mm/)
    expect(budget?.getAttribute("title")).toContain("nc-rounding")
    // Each cutter the kernel used is drawn to scale: cutting zone, shank and (generic, dashed) holder.
    const silhouettes = document.querySelectorAll("[data-testid='kernel-tools'] [data-testid='tool-silhouette']")
    expect(silhouettes.length).toBeGreaterThan(0)
    expect([...silhouettes[0]!.querySelectorAll("polygon")].map((p) => p.getAttribute("data-part"))).toEqual(["cutting", "shank", "holder"])
    const store = useCamStore.getState()
    expect(store.gcode).toContain("M30")
    expect(store.program.toolpaths.length).toBeGreaterThan(0)
    expect(useGeneratorStore.getState().currentGCode).toBe(store.gcode)
    expect(store.kernelArtifact?.nc).toBe(store.gcode)
    expect(kernelStockOf(store.kernelArtifact!)).toMatchObject({ width: 34, height: 24, depth: 6, x: 0, y: 0, topZ: 0 })
    const originalToolpaths = store.program.toolpaths
    const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"))
    expect(editor.value).toBe(store.gcode)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(useCamStore.getState().program.toolpaths).toEqual(originalToolpaths)
    expect(document.querySelector("[data-testid='kernel-stale']")).toBeNull()
    const { useCADStore } = await import("../src/features/cad/store/cadStore.ts")
    const originalStock = useCADStore.getState().workpiece
    useCADStore.getState().setWorkpiece({ ...originalStock, configured: true, width: 36, height: 24, depth: 6, x: 0, y: 0 })
    await app.wait(() => document.querySelector("[data-testid='kernel-stale']"))
    useCADStore.getState().setWorkpiece(originalStock)
    await app.wait(() => !document.querySelector("[data-testid='kernel-stale']"))
    useGeneratorStore.getState().patchSettings({ workOffset: "G55" })
    await app.wait(() => document.querySelector("[data-testid='kernel-stale']"))
    useGeneratorStore.getState().patchSettings({ workOffset: "G54" })
    await app.wait(() => !document.querySelector("[data-testid='kernel-stale']"))
    store.setGcode(`${store.gcode}\n; edited`)
    await app.wait(() => document.querySelector("[data-testid='kernel-stale']"))
    expect(useGeneratorStore.getState().isGenerating).toBe(false)
  } finally { view.dispose() }
})

test("kernel snapshots retain selected Boolean dependencies and include configured stock without changing CAD", () => {
  const all = [
    { id: "base", type: "cube", width: 30, height: 20, depth: 5 },
    { id: "hole", type: "cylinder", radius: 2, height: 10 },
    { id: "part", type: "boolean-subtract", operands: ["base", "hole"] },
    { id: "other", type: "cube", width: 100, height: 100, depth: 100 }
  ]
  const sources: JobSources = { elements: all, selectedElement: null, selectedIds: ["part"], workpiece: { width: 34, height: 24, depth: 6, configured: true }, workpieceElementId: null, stockAllowance: 1 }
  const before = JSON.stringify(sources)
  const request = kernelRequestOf(sources, { material: "6061", machine: "vmc-standard", tolerance: 0.01 })
  expect(request.elements.map((element) => element["id"])).toEqual(["part", "base", "hole"])
  expect(request.stock).toMatchObject({ width: 34, height: 24, depth: 6, allowance: 1 })
  expect(JSON.stringify(sources)).toBe(before)
  expect(kernelRequestOf(sources, { material: "6061", machine: "vmc-standard", tolerance: 0.01 }).id).toBe(request.id)
  expect(kernelRequestOf(sources, { material: "C45", machine: "vmc-standard", tolerance: 0.01 }).id).not.toBe(request.id)
})

test("an assistant native program is mirrored from its stored original NC and multi-tool artifact", async () => {
  const { buildTools } = await import("../../../packages/ai/src/tools/registry.ts")
  const { mirrorCamResult } = await import("../src/features/ai/lib/cam-sync.ts")
  const { useDocumentStore } = await import("../src/features/cad/store/documentStore.ts")
  const projectId = (await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Native assistant" } })).body.id as string
  const drawingId = (await app.sidecar.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] } } })).body.id as string
  useDocumentStore.getState().setDocument({ projectId, drawingId })
  const handlers = await app.sidecar.toolHandlers()
  const tool = buildTools(handlers, projectId).find((spec) => spec.id === "cam_edit")!
  const output = await tool.execute({ action: "manufacture", material: "6061" }, { projectId, sessionId: "s", signal: new AbortController().signal })
  expect(JSON.parse(output).ok).toBe(true)
  expect(await mirrorCamResult(app.state, "cam_edit.manufacture", { material: "6061" }, output)).toBe(true)
  const store = useCamStore.getState()
  expect(store.kernelArtifact?.nc).toBe(store.gcode)
  expect(store.program).toEqual(store.kernelArtifact!.program)
  expect(cam.kernel.sha256(store.gcode)).toBe(store.kernelArtifact!.identity.nc)
  expect(useGeneratorStore.getState().currentGCode).toBe(store.gcode)
})

test("a source change interrupts pending kernel generation and a late result cannot overwrite the editor", async () => {
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../src/shared/state/context.ts")
  const { default: KernelSection } = await import("../src/features/cam/components/generator/KernelSection.tsx")
  const element = { id: "plate", type: "cube", width: 30, height: 20, depth: 5, layerId: "default" }
  useElementsStore.setState({ elements: [element], selectedElement: null })
  useCamStore.getState().setGcode("Existing program")
  const value = cam.kernel.runJob({ schemaVersion: 1, id: "old", name: "Plate", material: "6061", part: { kind: "elements", elements: [element] } })
  let resume!: (response: Response) => void
  let interrupted = 0
  let notify!: () => void
  const started = new Promise<void>((resolve) => { notify = resolve })
  const pending = new Promise<Response>((resolve) => { resume = resolve })
  const transport: typeof fetch = Object.assign(async (_input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => { interrupted++ }, { once: true })
    notify()
    return pending
  }, { preconnect: () => undefined })
  const { clientLayer, readClient, runtimeForLayer } = await import("../src/app/client.ts")
  const runtime = runtimeForLayer(clientLayer({ baseUrl: "http://kernel.test", token: "test-token" }, transport))
  const client = await readClient(runtime)
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state: { ...app.state, client, runtime }, get children() { return KernelSection({ onGCodeGenerated: () => { throw new Error("A stale result was published") } }) } }), root)
  try {
    root.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']")!.click()
    await started
    useElementsStore.setState({ elements: [{ ...element, width: 32 }] })
    await app.wait(() => interrupted > 0)
    resume(new Response(JSON.stringify(Schema.encodeSync(CamKernelResult)(value)), { headers: { "content-type": "application/json" } }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(useCamStore.getState().gcode).toBe("Existing program")
    expect(useCamStore.getState().kernelArtifact).toBeUndefined()
    expect(root.querySelector("[data-testid='kernel-evidence']")).toBeNull()
    expect(useGeneratorStore.getState().isGenerating).toBe(false)
  } finally { dispose(); runtime.dispose() }
})

test("the kernel plan is editable: remove an operation, override a stepdown, give a cutter a holder, and the run follows the list", async () => {
  const { buildRecipe } = await import("../../../packages/core/src/cad/recipes.ts")
  const recipe = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 8, fastener: "M4", counterbore: false })
  useElementsStore.getState().addElements([{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history } as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  const change = (input: HTMLInputElement, value: string): void => { input.value = value; input.dispatchEvent(new window.Event("change", { bubbles: true })) }
  try {
    const planButton = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-plan-button']:not([disabled])"), 30_000)
    planButton.click()
    const rows = await app.wait(() => { const r = document.querySelectorAll("[data-testid='kernel-plan-operation']"); return r.length > 1 ? r : null }, 30_000)
    const planned = rows.length
    expect(useGeneratorStore.getState().kernelSettings.operations).toHaveLength(planned)
    // Each operation shows its cutter to scale and offers only cutters of a kind it can run with.
    expect(rows[0]!.querySelector("[data-testid='tool-silhouette']")).not.toBeNull()

    change(rows[0]!.querySelector<HTMLInputElement>("[data-testid='kernel-plan-stepdown']")!, "1.5")
    const removes = document.querySelectorAll<HTMLButtonElement>("[data-testid='kernel-plan-remove']")
    removes[removes.length - 1]!.click()
    await app.wait(() => document.querySelectorAll("[data-testid='kernel-plan-operation']").length === planned - 1 ? true : null)
    const edited = useGeneratorStore.getState().kernelSettings.operations!
    expect(edited).toHaveLength(planned - 1)
    expect(edited[0]!.stepdown).toBe(1.5)

    const holderInput = await app.wait(() => document.querySelector<HTMLInputElement>("[data-testid='kernel-cutter'] [data-testid='kernel-cutter-holder']"))
    change(holderInput, "30")
    const withHolder = useGeneratorStore.getState().kernelSettings.tools!.find((c) => c.holder?.diameter === 30)
    expect(withHolder).toBeDefined()

    document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']")!.click()
    await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 60_000)
    const artifact = useCamStore.getState().kernelArtifact!
    expect(artifact.operations.map((o) => o.id)).toEqual(edited.map((o) => o.id))
    expect(artifact.operations[0]!.overridden).toContain("stepdown")
    expect(useCamStore.getState().kernelRequest?.operations).toHaveLength(planned - 1)
    if (artifact.tools.some((c) => c.id === withHolder!.id)) expect(artifact.tools.find((c) => c.id === withHolder!.id)!.holder?.diameter).toBe(30)

    // Back to the automatic plan.
    document.querySelector<HTMLButtonElement>("[data-testid='kernel-plan-reset']")!.click()
    expect(useGeneratorStore.getState().kernelSettings.operations).toBeUndefined()
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ operations: undefined, tools: undefined }) }
})

test("manual side setup controls clear the old plan, preserve the request and restore the chosen side", async () => {
  const { restoreKernelSettings } = await import("../src/features/cam/store/generatorStore.ts")
  useElementsStore.getState().addElements([{ id: "p", type: "cube", width: 20, height: 12, depth: 6, x: 0, y: 0, z: 0, layerId: "default" }])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const select = await app.wait(() => document.querySelector<HTMLSelectElement>("[data-testid='kernel-setup-orientation']"), 30_000)
    useGeneratorStore.getState().patchKernelSettings({ operations: [{ id: "old", strategy: "face", bottom: 3, tool: "flat-6" }] })
    useGeneratorStore.getState().updateSettings("workholdingConfigured", true)
    select.value = "+X"
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(useGeneratorStore.getState().kernelSettings.setupOrientation).toBe("+X")
    expect(useGeneratorStore.getState().kernelSettings.operations).toBeUndefined()
    expect(useGeneratorStore.getState().settings.workholdingConfigured).toBe(false)
    expect(document.querySelector("[data-testid='kernel-manual-setup-hint']")?.textContent).toContain("Separate manual setup")
    document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']")!.click()
    await app.wait(() => useCamStore.getState().kernelArtifact?.setupOrientation === "+X" ? true : null, 60_000)
    const store = useCamStore.getState(), request = store.kernelRequest!
    expect(request.setupOrientation).toBe("+X")
    expect(store.kernelArtifact!.release).toBe("preview")
    expect(document.querySelector("[data-testid='kernel-stale']")).toBeNull()
    expect(store.kernelArtifact!.claims.find((c) => c.id === "part-coverage")?.status).toBe("unresolved")
    restoreKernelSettings(request)
    expect(useGeneratorStore.getState().kernelSettings.setupOrientation).toBe("+X")
    select.value = "-X"
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(document.querySelector("[data-testid='kernel-stale']")).not.toBeNull()
  } finally { view.dispose() }
})
