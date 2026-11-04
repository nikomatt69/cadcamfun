/**
 * Feature names and timeline groups in the Parametric part panel (spec 58 T7, spec 72 feature tree): rename in place, group
 * consecutive features, fold and ungroup. Mounted over the real elements store: what the tests read back is the stored history.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { historyVolume, plateTemplate, rebuild, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountPanel: (history: History) => { readonly id: string; readonly dispose: () => void }

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const labelled = (label: string): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`No button labelled '${label}'`)
  return found
}
const titled = (row: string, title: string): HTMLButtonElement => {
  const found = byId(`feature-${row}`)?.querySelector<HTMLButtonElement>(`button[title="${title}"]`)
  if (found === null || found === undefined) throw new Error(`No '${title}' button on ${row}`)
  return found
}
const press = async (b: HTMLButtonElement): Promise<void> => { b.click(); await tick(80) }
const stored = (id: string): History => useElementsStore.getState().elements.find((e) => e.id === id)!["history"] as History
const volume = (id: string): number => historyVolume(rebuild(stored(id)))

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: ParametricPanel } = await import("../src/features/cad/components/ParametricPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  mountPanel = (history) => {
    const id = useElementsStore.getState().addElement({ type: "parametric", x: 0, y: 0, z: 0, history })
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => {
      const store = useElementsStore()
      return createComponent(ParametricPanel, { get element() { return store.elements.find((e) => e.id === id)! }, locked: false })
    }, host)
    return { id, dispose: () => { dispose(); host.remove() } }
  }
})
afterAll(() => useElementsStore.setState({ elements: [], selectedElement: null }))


const typed = async (input: HTMLInputElement, value: string, key = "Enter"): Promise<void> => {
  input.value = value
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  await tick(80)
}

describe("names and groups", () => {
  test("a feature is renamed in place and an empty name goes back to its id", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(labelled("Rename plate"))
    await typed(byId("rename-plate") as HTMLInputElement, "Base plate")
    expect(stored(id).features.find((f) => f.id === "plate")?.name).toBe("Base plate")
    expect(byId("feature-plate")?.textContent).toContain("Base plate")
    await press(labelled("Rename plate"))
    await typed(byId("rename-plate") as HTMLInputElement, "  ")
    expect(stored(id).features.find((f) => f.id === "plate")?.name).toBeUndefined()
    dispose()
  }, 60_000)

  test("Escape leaves the name as it was", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(labelled("Rename plate"))
    await typed(byId("rename-plate") as HTMLInputElement, "Nope", "Escape")
    expect(stored(id).features.find((f) => f.id === "plate")?.name).toBeUndefined()
    expect(byId("rename-plate")).toBeNull()
    dispose()
  }, 60_000)

  test("ticked consecutive features become a group that folds and ungroups, and the replay is unchanged", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    const before = volume(id)
    const tickBox = async (feature: string) => { document.querySelector<HTMLInputElement>(`input[aria-label="Select ${feature}"]`)!.click(); await tick(40) }
    await tickBox("sketch1"); await tickBox("plate")
    const groupButton = [...(byId("group-bar")?.querySelectorAll("button") ?? [])][0] as HTMLButtonElement
    expect(groupButton.textContent).toBe("Group 2 selected")
    await press(groupButton)
    expect(stored(id).groups?.map((g) => g.name)).toEqual(["Group 1"])
    expect(stored(id).features.map((f) => f.group)).toEqual(["group1", "group1", undefined])
    expect(byId("group-group1")).not.toBeNull()
    expect(volume(id)).toBe(before)

    await press(labelled("Collapse Group 1"))
    expect(stored(id).groups?.[0]?.collapsed).toBe(true)
    expect(byId("feature-plate")?.className).toContain("hidden")
    expect(byId("feature-hole1")?.className).not.toContain("hidden")

    await press(labelled("Ungroup Group 1"))
    expect(stored(id).groups).toBeUndefined()
    expect(stored(id).features.every((f) => f.group === undefined)).toBe(true)
    dispose()
  }, 60_000)

  test("features that are not consecutive are refused with the reason", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    for (const feature of ["sketch1", "hole1"]) { document.querySelector<HTMLInputElement>(`input[aria-label="Select ${feature}"]`)!.click(); await tick(40) }
    await press([...(byId("group-bar")?.querySelectorAll("button") ?? [])][0] as HTMLButtonElement)
    expect(document.querySelector('[role="alert"]')?.textContent ?? "").toContain("Not grouped")
    expect(stored(id).groups).toBeUndefined()
    dispose()
  }, 60_000)
})
