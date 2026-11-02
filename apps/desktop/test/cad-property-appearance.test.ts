/**
 * The appearance part of the property panel, mounted for real: the opacity of a solid typed as a number field (decimal comma, range 0.05 to 1,
 * the canvas honours it) and the card of the joint picked in the canvas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

type ElementsStore = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: ElementsStore
let useCADStore: typeof import("../src/features/cad/store/cadStore.ts")["useCADStore"]
let useAssemblyStore: typeof import("../src/features/cad/store/assemblyStore.ts")["useAssemblyStore"]
let mountProperties: () => () => void
let app: ReturnType<typeof import("../src/shared/state/context.ts")["createAppState"]>

setDefaultTimeout(60_000)

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const field = (id: string): HTMLInputElement => {
  const found = document.getElementById(id) as HTMLInputElement | null
  if (found === null) throw new Error(`No field '${id}'`)
  return found
}
const type = async (id: string, text: string): Promise<void> => {
  const input = field(id)
  input.focus()
  input.value = text
  input.dispatchEvent(new window.Event("input", { bubbles: true }))
  await tick()
}
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (found === undefined) throw new Error(`No button '${label}'`)
  return found
}
const apply = async (): Promise<void> => {
  document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
  await tick(60)
}
const element = (id: string) => useElementsStore.getState().elements.find((e) => e.id === id) as Record<string, any>

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: PropertyPanel } = await import("../src/features/cad/components/PropertyPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  ;({ useCADStore } = await import("../src/features/cad/store/cadStore.ts"))
  ;({ useAssemblyStore } = await import("../src/features/cad/store/assemblyStore.ts"))
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const client = createFakeApi()
  app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  mountProperties = () => {
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => AppProvider({ state: app, get children() { return createComponent(PropertyPanel, {}) } }), host)
    return () => { dispose(); host.remove() }
  }
})
afterAll(() => app.dispose())
beforeEach(() => { useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] }); useCADStore.setState({ pickedJoint: null }) })

const select = (props: Record<string, unknown>): string => {
  const id = useElementsStore.getState().addElement(props)
  useElementsStore.getState().selectElement(id)
  return id
}

describe("the opacity field", () => {
  test("a solid has one: a decimal comma is applied exactly, and the element carries it", async () => {
    const id = select({ type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 20, segments: 32 })
    const dispose = mountProperties()
    try {
      await tick()
      expect(document.querySelector("[data-testid='opacity-field']")).not.toBeNull()
      // opaque unless the element says otherwise, and read-only until Edit Properties
      expect(field("opacity").value).toBe("1")
      expect(field("opacity").disabled).toBe(true)
      button("Edit Properties").click()
      await tick()
      await type("opacity", "0,35")
      await apply()
      expect(element(id)["opacity"]).toBe(0.35)
      expect(element(id)["radius"]).toBe(10)
    } finally { dispose() }
  })

  test("outside 0.05 to 1 or half typed is refused, never written", async () => {
    const id = select({ type: "cube", x: 0, y: 0, z: 0, width: 5, height: 5, depth: 5 })
    const dispose = mountProperties()
    try {
      await tick()
      button("Edit Properties").click()
      await tick()
      await type("opacity", "1,5")
      await apply()
      expect(element(id)["opacity"]).toBeUndefined()
      expect(document.querySelector("[data-testid='property-errors']")).not.toBeNull()
      await type("opacity", "0,")
      await apply()
      expect(element(id)["opacity"]).toBeUndefined()
    } finally { dispose() }
  })

  test("a curve has none, and a type with its own opacity field keeps a single one", async () => {
    select({ type: "line", x1: 0, y1: 0, z1: 0, x2: 10, y2: 0, z2: 0 })
    let dispose = mountProperties()
    try {
      await tick()
      expect(document.querySelector("[data-testid='opacity-field']")).toBeNull()
    } finally { dispose() }
    useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] })
    select({ type: "drawing-highlighter", points: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 0 }], highlighterSize: 4 })
    dispose = mountProperties()
    try {
      await tick()
      expect(document.querySelector("[data-testid='opacity-field']")).toBeNull()
      expect(document.querySelectorAll("#opacity").length).toBe(1)
    } finally { dispose() }
  })
})

describe("the card of a picked joint", () => {
  test("a joint picked in the canvas shows its name, type, nodes and axis, with or without a selected element", async () => {
    const assembly = useAssemblyStore.getState()
    const parent = assembly.addComponent("Base", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const child = assembly.addComponent("Arm", { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const joint = assembly.addJoint("revolute", parent, child, { x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, undefined, { minAngle: -45, maxAngle: 90 }, "Shoulder")
    expect(joint).not.toBeNull()
    const dispose = mountProperties()
    try {
      await tick()
      expect(document.querySelector("[data-testid='joint-card']")).toBeNull()
      useCADStore.getState().setPickedJoint(joint!.id)
      await tick()
      const card = document.querySelector("[data-testid='joint-card']")
      expect(card).not.toBeNull()
      expect(document.querySelector("[data-testid='joint-name']")?.textContent).toBe("Shoulder")
      expect(document.querySelector("[data-testid='joint-type']")?.textContent).toContain("Revolute")
      expect(document.querySelector("[data-testid='joint-parent']")?.textContent).toBe("Base")
      expect(document.querySelector("[data-testid='joint-child']")?.textContent).toBe("Arm")
      expect(document.querySelector("[data-testid='joint-origin']")?.textContent).toBe("5, 0, 0")
      expect(document.querySelector("[data-testid='joint-limits']")?.textContent).toBe("-45 … 90 °")
      // the card is also there beside an element's properties
      select({ type: "cube", x: 0, y: 0, z: 0, width: 5, height: 5, depth: 5 })
      await tick()
      expect(document.querySelector("[data-testid='joint-card']")).not.toBeNull()
      expect(document.querySelector("[data-testid='property-panel']")).not.toBeNull()
      button("Deselect").click()
      await tick()
      expect(useCADStore.getState().pickedJoint).toBeNull()
      expect(document.querySelector("[data-testid='joint-card']")).toBeNull()
    } finally { dispose(); assembly.removeJoint(joint!.id) }
  })
})
