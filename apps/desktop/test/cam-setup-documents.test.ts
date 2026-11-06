/**
 * The multi-toolpath panel's setup over the real sidecar (RM-02 deliverable 5, desktop side): the panel saves its toolpaths as a
 * project setup, lists and loads it back, plans its tool table and tool changes, and a save that lost the race to another writer is
 * refused (409) and resolved by the user instead of overwriting silently.
 */
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useMultiToolpathStore } from "../src/features/cam/store/multiToolpathStore.ts"
import { useSetupStore } from "../src/features/cam/store/setupStore.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useSetupStore.getState().reset(); useMultiToolpathStore.getState().clearAllToolpaths() })

const base = cam.generator.DEFAULT_SETTINGS
const drawing = [
  { id: "plate", type: "rectangle", x: 0, y: 0, z: 0, width: 40, height: 30, layerId: "default" },
  { id: "hole", type: "circle", x: 10, y: 10, z: 0, radius: 4, layerId: "default" }
]

const mount = async () => {
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../src/shared/state/context.ts")
  const { default: SetupPanel } = await import("../src/features/cam/components/explorer/SetupPanel.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state: app.state, get children() { return SetupPanel() } }), root)
  return { root, dispose }
}
const button = (testId: string) => app.wait(() => {
  const found = document.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`)
  return found !== null && !found.disabled ? found : null
}, 30_000)
const panelToolpaths = () => {
  const store = useMultiToolpathStore.getState()
  store.addToolpath("plate", "rectangle", "Plate", { ...base, toolDiameter: 6 })
  store.addToolpath("hole", "circle", "Hole", { ...base, toolDiameter: 3 })
}

test("without a project the panel says where setups are kept and offers no save", async () => {
  panelToolpaths()
  const { dispose } = await mount()
  try {
    await app.wait(() => document.querySelector("[data-testid='cam-setup-no-project']"))
    expect(document.querySelector<HTMLButtonElement>("[data-testid='cam-setup-save']")!.disabled).toBe(true)
    expect(document.querySelector("[data-testid='cam-setup-documents']")).toBeNull()
  } finally { dispose() }
})

test("save, plan, load back and a refused stale save resolved by the user", async () => {
  const project = await app.state.runtime.run(app.client.projects.create({ payload: { name: "Setups" } }))
  useElementsStore.setState({ elements: drawing, selectedElement: null })
  useDocumentStore.getState().setDocument({ projectId: project.id, drawingId: "d1" })
  panelToolpaths()
  const { dispose } = await mount()
  try {
    // The plan shows one pocket per tool and the change between them, before anything is saved.
    ;(await button("cam-setup-plan")).click()
    const rows = await app.wait(() => { const found = document.querySelectorAll<HTMLElement>("[data-testid='cam-setup-tool-row']"); return found.length > 0 ? found : null }, 30_000)
    expect([...rows].map((row) => row.dataset["pocket"])).toEqual(["1", "2"])
    expect(document.querySelector("[data-testid='cam-setup-tool-changes']")!.textContent).toContain("1")

    const name = document.querySelector<HTMLInputElement>("input[name='camSetupName']")!
    name.value = "Bracket"; name.dispatchEvent(new window.Event("input", { bubbles: true }))
    ;(await button("cam-setup-save")).click()
    const listed = await app.wait(() => document.querySelector<HTMLElement>("[data-testid='cam-setup-document']"), 30_000)
    const saved = useSetupStore.getState().saved!
    expect(saved).toMatchObject({ projectId: project.id, name: "Bracket" })
    expect(listed.dataset["id"]).toBe(saved.id)
    const stored = await app.state.runtime.run(app.client.camSetup.get({ params: { id: project.id, setupId: saved.id } }))
    expect(stored.setup.operations.map((op) => op.elementIds[0])).toEqual(["plate", "hole"])

    // Someone else saves it (another window, the assistant): this panel's revision is now stale.
    await app.state.runtime.run(app.client.camSetup.update({ params: { id: project.id, setupId: saved.id }, payload: { name: "Theirs", baseUpdatedAt: stored.updatedAt } }))
    useMultiToolpathStore.getState().moveToolpathDown(useMultiToolpathStore.getState().toolpaths[0]!.id)
    ;(await button("cam-setup-save")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-conflict']"), 30_000)
    const untouched = await app.state.runtime.run(app.client.camSetup.get({ params: { id: project.id, setupId: saved.id } }))
    expect(untouched.name).toBe("Theirs")
    expect(untouched.setup.operations.map((op) => op.elementIds[0])).toEqual(["plate", "hole"])

    // Keep mine: written over the revision the user has now seen.
    ;(await button("cam-setup-keep-mine")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-conflict']") === null && useSetupStore.getState().saved?.updatedAt !== untouched.updatedAt, 30_000)
    const mine = await app.state.runtime.run(app.client.camSetup.get({ params: { id: project.id, setupId: saved.id } }))
    expect(mine.name).toBe("Bracket")
    expect(mine.setup.operations.map((op) => op.elementIds[0])).toEqual(["hole", "plate"])

    // Load it back onto an emptied panel: the operations become the toolpaths again, to be regenerated.
    useMultiToolpathStore.getState().clearAllToolpaths()
    ;(await button("cam-setup-load")).click()
    await app.wait(() => useMultiToolpathStore.getState().toolpaths.length === 2, 30_000)
    expect(useMultiToolpathStore.getState().toolpaths.map((tp) => [tp.elementId, tp.gcode, tp.toolpathSettings.toolDiameter])).toEqual([["hole", "", 3], ["plate", "", 6]])
    expect(useSetupStore.getState().choices.name).toBe("Bracket")

    ;(await button("cam-setup-delete")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-document']") === null, 30_000)
    expect(useSetupStore.getState().saved).toBeUndefined()
  } finally { dispose() }
})

const change = (el: Element, type = "change") => el.dispatchEvent(new window.Event(type, { bubbles: true }))
const typeInto = (name: string, value: string) => {
  const field = document.querySelector<HTMLInputElement>(`input[name='${name}']`)!
  field.value = value; change(field, "input"); change(field)
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 30))

test("clamps, the machine travel, a template of two steps and the part probe are edited on the panel, stored by the sidecar and planned expanded", async () => {
  const project = await app.state.runtime.run(app.client.projects.create({ payload: { name: "Workholding" } }))
  useElementsStore.setState({ elements: drawing, selectedElement: null })
  useDocumentStore.getState().setDocument({ projectId: project.id, drawingId: "d2" })
  panelToolpaths()
  const { useSelectionStore } = await import("../src/features/cad/store/selectorStore.ts")
  const { dispose } = await mount()
  try {
    // A clamp: a new box beside the first part, edited; a box that is not a box is said so on its own row.
    ;(await button("cam-setup-fixture-add")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-fixture']"))
    typeInto("camFixturemaxx-fx-1", "-90")
    await tick()
    expect(useSetupStore.getState().choices.fixtures[0]).toMatchObject({ id: "fx-1", min: { x: -80 }, max: { x: -90 } })
    expect(document.querySelector("[data-testid='cam-setup-fixture-issue']")?.textContent).toMatch(/max must be larger than min/)
    typeInto("camFixturemaxx-fx-1", "-60")
    await tick()
    expect(document.querySelector("[data-testid='cam-setup-fixture-issue']")).toBeNull()

    // The machine travel is switched on with a default box and edited.
    const travel = document.querySelector<HTMLInputElement>("input[name='camSetupEnvelope']")!
    travel.checked = true; change(travel)
    await app.wait(() => document.querySelector("[data-testid='cam-setup-envelope']"))
    typeInto("camEnvelopemaxz", "150")
    await tick()
    expect(useSetupStore.getState().choices.envelope).toMatchObject({ min: { x: -500 }, max: { z: 150 } })

    // A template of two steps (rough, then finish), applied to the two selected elements: four expanded operations, listed in the plan.
    ;(await button("cam-setup-template-add")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-template']"))
    ;(await button("cam-setup-template-step-add")).click()
    await app.wait(() => document.querySelectorAll("[data-testid='cam-setup-template-step']").length === 2)
    typeInto("camTemplatetoolDiameter-tpl-1-step-2", "2")
    await tick()
    const template = useSetupStore.getState().choices.templates[0]!
    expect(template.steps.map((step) => step.tool.diameter)).toEqual([base.toolDiameter, 2])
    ;(await button("cam-setup-template-depends")).click()
    await tick()
    expect(useSetupStore.getState().choices.templates[0]!.steps[1]!.dependsOn).toEqual(["step-1"])
    useSelectionStore.getState().selectMultiple(["plate", "hole"])
    await tick()
    ;(await button("cam-setup-template-apply")).click()
    await app.wait(() => document.querySelector("[data-testid='cam-setup-template-use']"))
    expect(useSetupStore.getState().choices.uses[0]).toMatchObject({ templateId: "tpl-1", elementIds: ["plate", "hole"], perElement: true, order: "perStep" })
    await app.wait(() => document.querySelectorAll("[data-testid='cam-setup-expanded-operation']").length === 4)

    // The part probe: one z-surface cycle by default, a bore added.
    const probe = document.querySelector<HTMLInputElement>("input[name='camSetupProbePart']")!
    probe.checked = true; change(probe)
    await app.wait(() => document.querySelector("[data-testid='cam-setup-probe-cycle']"))
    ;(await button("cam-setup-probe-cycle-add")).click()
    await app.wait(() => document.querySelectorAll("[data-testid='cam-setup-probe-cycle']").length === 2)
    expect(useSetupStore.getState().choices.partProbe!.cycles.map((cycle) => cycle.kind)).toEqual(["z-surface", "bore"])
    expect(useSetupStore.getState().choices.probePart).toBe(true)

    // The sidecar stores all of it, and the plan reads the expanded operations (the tools of the template steps are in the tool table).
    typeInto("camSetupName", "Vise")
    ;(await button("cam-setup-save")).click()
    await app.wait(() => useSetupStore.getState().saved !== undefined, 30_000)
    const stored = await app.state.runtime.run(app.client.camSetup.get({ params: { id: project.id, setupId: useSetupStore.getState().saved!.id } }))
    expect(stored.setup.fixtures).toHaveLength(1)
    expect(stored.setup.envelope?.max.z).toBe(150)
    expect(stored.setup.templates).toHaveLength(1)
    expect(stored.setup.uses?.[0]?.elementIds).toEqual(["plate", "hole"])
    expect(stored.setup.partProbe?.cycles).toHaveLength(2)
    ;(await button("cam-setup-plan")).click()
    const rows = await app.wait(() => { const found = document.querySelectorAll<HTMLElement>("[data-testid='cam-setup-tool-row']"); return found.length > 0 ? found : null }, 30_000)
    expect(rows.length).toBeGreaterThanOrEqual(3)

    // Loaded back onto an emptied panel, the choices are as they were saved.
    useMultiToolpathStore.getState().clearAllToolpaths()
    useSetupStore.getState().setChoices({ fixtures: [], envelope: undefined, templates: [], uses: [], partProbe: undefined, probePart: false })
    ;(await button("cam-setup-load")).click()
    await app.wait(() => useSetupStore.getState().choices.templates.length === 1, 30_000)
    expect(useSetupStore.getState().choices).toMatchObject({ fixtures: [{ id: "fx-1" }], probePart: true })
    expect(useSetupStore.getState().choices.envelope?.max.z).toBe(150)
  } finally { dispose() }
})
