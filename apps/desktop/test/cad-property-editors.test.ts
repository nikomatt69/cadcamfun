/**
 * The property editors (points, faces/elements, colors) open a centred modal over the whole
 * window: the property panel is a narrow column, so an editor that opens inside it is squeezed,
 * clipped by the panel's scroll box and covered by the panel content behind it.
 *
 * The editors are mounted for real over the elements store, inside a host that behaves like the
 * inspector column (a transform, which is what makes `position: fixed` break, and a scroll box).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountProperties: () => () => void
let app: ReturnType<typeof import("../src/shared/state/context.ts")["createAppState"]>

setDefaultTimeout(60_000)

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The dialog the editors open: it must sit on the body, not inside the panel column. */
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]')
const inPanel = (): boolean => (dialog()?.closest(".workstation-properties") ?? null) !== null
const click = async (selector: string): Promise<void> => {
  const control = document.querySelector<HTMLElement>(selector)
  if (control === null) throw new Error(`No '${selector}'`)
  control.click()
  await tick()
}
const byText = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text)
  if (found === undefined) throw new Error(`No button '${text}'`)
  return found
}
const element = (id: string) => useElementsStore.getState().elements.find((e) => e.id === id) as Record<string, any>
const select = (props: Record<string, unknown>): string => {
  const id = useElementsStore.getState().addElement(props)
  useElementsStore.getState().selectElement(id)
  return id
}

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: PropertyPanel } = await import("../src/features/cad/components/PropertyPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const client = createFakeApi()
  app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  mountProperties = () => {
    const host = document.createElement("div")
    // Like the inspector column: a transform (it breaks `position: fixed`) and a scroll box.
    host.className = "workstation-properties"
    host.style.transform = "translateY(0px)"
    host.style.overflow = "auto"
    document.body.append(host)
    const dispose = render(() => AppProvider({ state: app, get children() { return createComponent(PropertyPanel, {}) } }), host)
    return () => { dispose(); host.remove() }
  }
})
afterAll(() => app.dispose())
beforeEach(() => useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] }))

describe("the property editors open a centred modal", () => {
  test("the points editor is a dialog on the body, not a sliver inside the property column", async () => {
    select({ type: "path3d", x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      expect(dialog()).toBeNull()
      await click('[data-testid="edit-points"]')
      const open = dialog()
      expect(open).not.toBeNull()
      expect(open!.getAttribute("aria-label")).toBe("Edit points")
      // Portalled to the body: the panel column cannot clip or cover it.
      expect(inPanel()).toBe(false)
      expect(document.body.contains(open)).toBe(true)
      // The field label is written once, not twice.
      const labels = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0 && (d.textContent ?? "").startsWith("Path Points ("))
      expect(labels.length).toBe(1)
    } finally { dispose() }
  })

  test("the faces editor is a dialog on the body, and it lists the faces of the element", async () => {
    select({
      type: "mesh", name: "Plate", x: 0, y: 0, z: 0,
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }],
      faces: [[0, 1, 2], [0, 2, 1]]
    })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      await click('[data-testid="edit-elements"]')
      expect(dialog()!.getAttribute("aria-label")).toBe("Select faces")
      expect(inPanel()).toBe(false)
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="element-row"]')]
      expect(rows.length).toBe(2)
      expect(rows[0]!.textContent).toContain("Face 1")
      expect(rows[0]!.textContent).toContain("vertices 0 · 1 · 2")
    } finally { dispose() }
  })

  test("the colors editor is a dialog on the body", async () => {
    select({ type: "point-cloud", x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }], colors: [{ r: 1, g: 0, b: 0 }] })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      await click('[data-testid="edit-colors"]')
      expect(dialog()!.getAttribute("aria-label")).toBe("Edit colors")
      expect(inPanel()).toBe(false)
    } finally { dispose() }
  })
})

describe("the property editors still edit", () => {
  test("a point is added, moved and saved; the field keeps what was there", async () => {
    const id = select({ type: "path3d", x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      await click('[data-testid="edit-points"]')
      // The list shows the points the field holds.
      expect(document.querySelectorAll('[data-testid="point-row"]').length).toBe(2)
      // A point is added and picked, so its coordinates can be typed.
      byText("Add point").click()
      await tick()
      expect(document.querySelectorAll('[data-testid="point-row"]').length).toBe(3)
      const coordinate = [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[aria-label^="Point 3"]')]
      expect(coordinate.length).toBe(3)
      coordinate[0]!.value = "12,5"
      coordinate[0]!.dispatchEvent(new window.Event("input", { bubbles: true }))
      await tick()
      byText("Save points").click()
      await tick()
      expect(dialog()).toBeNull()
      // The field holds the new point; the element is written when Apply is pressed.
      const points = element(id)["points"] as ReadonlyArray<{ x: number }>
      expect(points.length).toBe(2)
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
      await tick(80)
      const written = element(id)["points"] as ReadonlyArray<{ x: number }>
      expect(written.length).toBe(3)
      expect(written[2]!.x).toBe(12.5)
    } finally { dispose() }
  })

  test("the points editor refuses a list that breaks the field's minimum, and says why", async () => {
    select({ type: "path3d", x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      await click('[data-testid="edit-points"]')
      const remove = document.querySelector<HTMLButtonElement>('[data-testid="point-row"] button[aria-label="Remove point 1"]')
      remove!.click()
      await tick()
      expect(byText("Save points").disabled).toBe(true)
      expect(document.querySelector('[role="alert"]')!.textContent).toContain("At least 2 points")
    } finally { dispose() }
  })

  test("a face can be put out of the selection and the field keeps the ones that stayed", async () => {
    const id = select({
      type: "mesh", name: "Plate", x: 0, y: 0, z: 0,
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }],
      faces: [[0, 1, 2], [0, 2, 1]]
    })
    const dispose = mountProperties()
    try {
      await tick()
      byText("Edit Properties").click()
      await tick()
      await click('[data-testid="edit-elements"]')
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="element-row"]')]
      rows[0]!.click()
      await tick()
      byText("Save selection").click()
      await tick()
      expect(dialog()).toBeNull()
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
      await tick(80)
      const faces = element(id)["faces"] as ReadonlyArray<ReadonlyArray<number>>
      expect(faces.length).toBe(1)
      expect([...faces[0]!]).toEqual([0, 2, 1])
    } finally { dispose() }
  })
})
