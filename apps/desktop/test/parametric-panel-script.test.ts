/**
 * The Script section of the Parametric part panel, mounted for real over the elements store: a model script is run, replaces the
 * history after a confirmation, and an error in it is shown instead of thrown.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { historyVolume, plateTemplate, rebuild, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountPanel: (history: History) => { readonly id: string; readonly dispose: () => void }
let realConfirm: typeof window.confirm
let confirms: string[] = []
let answer = true

const SLOW = 90_000
const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const q = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector)
const byId = (id: string): HTMLElement | null => q(`[data-testid="${id}"]`)
const text = (id: string): string => byId(id)?.textContent ?? ""
const input = (label: string): HTMLInputElement | HTMLSelectElement => {
  const found = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`No control labelled '${label}'`)
  return found
}
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (found === undefined) throw new Error(`No button '${label}'`)
  return found
}
/** Waits until the condition holds (Solid flushes synchronously, but the DFM check runs on a timer). */
const until = async (condition: () => boolean, ms = 30_000): Promise<void> => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error("Timed out waiting for the panel")
    await tick(20)
  }
}
const change = async (label: string, value: string): Promise<void> => {
  const control = input(label)
  control.value = value
  control.dispatchEvent(new Event("change", { bubbles: true }))
  await tick()
}
const typeInto = async (label: string, value: string): Promise<void> => {
  const control = input(label)
  control.value = value
  control.dispatchEvent(new Event("input", { bubbles: true }))
  await tick()
}
const click = async (label: string): Promise<void> => { button(label).click(); await tick(60) }

const stored = (id: string): History => useElementsStore.getState().elements.find((e) => e.id === id)!["history"] as History
const volume = (id: string): number => historyVolume(rebuild(stored(id)))
const summary = (): string => text("parametric-summary")

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
      // Read through the reactive view, as PropertyPanel does, so an edit re-renders the panel.
      const store = useElementsStore()
      return createComponent(ParametricPanel, { get element() { return store.elements.find((e) => e.id === id)! }, locked: false })
    }, host)
    return { id, dispose: () => { dispose(); host.remove() } }
  }
  realConfirm = window.confirm
  window.confirm = (message?: string) => { confirms.push(String(message)); return answer }
})
afterAll(() => { window.confirm = realConfirm })

let mounted: ReturnType<typeof mountPanel> | undefined
beforeEach(() => { confirms = []; answer = true })
const open = async (history: History): Promise<string> => {
  mounted?.dispose()
  mounted = mountPanel(history)
  await tick(50)
  return mounted.id
}
const close = (): void => { mounted?.dispose(); mounted = undefined; useElementsStore.setState({ elements: [], selectedElement: null }) }

describe("the Script section", () => {
  test("the starter script runs: the part is replaced by what the script builds, after a confirmation", async () => {
    const id = await open(plateTemplate())
    expect(byId("script-section")).not.toBeNull()
    await click("Run script")
    expect(confirms).toHaveLength(1)
    const h = stored(id)
    expect(h.features.map((f) => f.type)).toEqual(["sketch", "extrude", "hole", "pattern", "sketch", "rib", "fillet"])
    expect(rebuild(h).issues.filter((i) => i.severity === "error")).toEqual([])
    expect(text("script-result")).toMatch(/7 features, 1 body\(ies\), 0 error/)
    expect(summary()).toMatch(/^1 solid, /)
    close()
  }, SLOW)

  test("declining the confirmation leaves the history alone", async () => {
    const id = await open(plateTemplate())
    const before = volume(id)
    answer = false
    await click("Run script")
    expect(volume(id)).toBe(before)
    expect(byId("script-result")).toBeNull()
    close()
  }, SLOW)

  test("a script of the person's own runs, and an error in it is shown, not thrown", async () => {
    const id = await open(plateTemplate())
    await typeInto("Model script", 'm.param("w", 30)\nm.extrude(m.sketch("XY").rectangle([0, 0], "w", 10), { depth: 5 })')
    await click("Run script")
    expect(volume(id)).toBeCloseTo(1500, 3)
    await typeInto("Model script", 'throw new Error("no part today")')
    await click("Run script")
    expect(text("parametric-panel")).toContain("no part today")
    expect(volume(id)).toBeCloseTo(1500, 3)
    close()
  }, SLOW)

  test("Starter restores the example", async () => {
    await open(plateTemplate())
    await typeInto("Model script", "m.param('x', 1)")
    await click("Starter")
    expect((input("Model script") as unknown as HTMLTextAreaElement).value).toContain("m.rib(")
    close()
  }, SLOW)
})
