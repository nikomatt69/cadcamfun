/**
 * The timeline of the Parametric part panel (spec 58 T7): suppress and release, the rollback bar, per-feature states, and a refused
 * reorder that says why. Mounted over the real elements store: what the tests read back is the stored history.
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

/** The starting plate is 60 x 40 x 8 with a 10 mm through hole. */
const PLATE = 60 * 40 * 8

describe("the timeline", () => {
  test("suppressing the hole leaves it out, marks the row, and releasing restores the identical history", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    expect(volume(id)).toBeLessThan(PLATE - 500)
    expect(byId("state-hole1")).toBeNull()
    await press(labelled("Suppress hole1"))
    expect(stored(id).features.find((f) => f.id === "hole1")?.suppressed).toBe(true)
    expect(byId("state-hole1")?.textContent).toBe("suppressed")
    expect(volume(id)).toBeCloseTo(PLATE, 0)
    await press(labelled("Release hole1"))
    expect(JSON.stringify(stored(id))).toBe(JSON.stringify(plateTemplate()))
    dispose()
  }, 60_000)

  test("suppressing the sketch shows what needs it as suppressed by it", async () => {
    const { dispose } = mountPanel(plateTemplate())
    await tick()
    await press(labelled("Suppress sketch1"))
    expect(byId("state-plate")?.textContent).toBe("suppressed by sketch1")
    dispose()
  }, 60_000)

  test("rolling back shows the bar under the marker, builds only the prefix, and rolls to the end again", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(labelled("Roll back to plate"))
    expect(stored(id).rollback).toBe("plate")
    expect(byId("rollback-bar")).not.toBeNull()
    expect(byId("feature-plate")?.nextElementSibling?.getAttribute("data-testid")).toBe("rollback-bar")
    expect(byId("state-hole1")?.textContent).toBe("rolled back")
    expect(volume(id)).toBeCloseTo(PLATE, 0)
    const toEnd = [...(byId("rollback-bar")?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Roll to end")!
    await press(toEnd)
    expect(stored(id).rollback).toBeUndefined()
    expect(byId("rollback-bar")).toBeNull()
    dispose()
  }, 60_000)

  test("a move across a dependency is refused with the feature in the way named, and the history is unchanged", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(titled("hole1", "Earlier"))
    expect(stored(id).features.map((f) => f.id)).toEqual(["sketch1", "plate", "hole1"])
    const alert = document.querySelector('[role="alert"]')?.textContent ?? ""
    expect(alert).toContain("Not moved")
    expect(alert).toContain("'plate'")
    dispose()
  }, 60_000)
})
