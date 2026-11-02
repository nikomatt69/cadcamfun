/**
 * The parametric panel's parameters, dimensions, sketch constraints, configurations and deletion: mounted over the real elements
 * store, what the tests read back is the stored history. Dimension fields are plain text (comma decimals, formulas), a refused entry
 * changes nothing and says why, and every edit goes through the store so the editor's undo covers it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountPanel: (history: History) => { readonly id: string; readonly dispose: () => void }

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const field = (label: string): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (found === null) throw new Error(`No input labelled '${label}'`)
  return found
}
const button = (label: string): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`No button labelled '${label}'`)
  return found
}
const change = async (label: string, value: string): Promise<void> => {
  const control = field(label)
  control.value = value
  control.dispatchEvent(new Event("change", { bubbles: true }))
  await tick()
}
const press = async (b: HTMLButtonElement): Promise<void> => { b.click(); await tick(80) }
const stored = (id: string): History => useElementsStore.getState().elements.find((e) => e.id === id)!["history"] as History
const alerts = (): string => [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent).join(" | ")
const confirms: string[] = []
const answer = { value: true }

beforeAll(async () => {
  installDom("http://localhost/cad")
  const w = window as unknown as { confirm: (text: string) => boolean; prompt: (text: string, value?: string) => string | null }
  w.confirm = (text) => { confirms.push(text); return answer.value }
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
afterEach(() => { document.body.innerHTML = "" })

describe("dimension fields", () => {
  test("a decimal comma is read, a formula stays a formula with its value shown, and a bad entry changes nothing", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await change("plate depth", "7,5")
    expect(stored(id).features.find((f) => f.id === "plate")).toMatchObject({ depth: 7.5 })
    await change("plate depth", "thick / 2 + 1")
    expect(stored(id).features.find((f) => f.id === "plate")).toMatchObject({ depth: "thick / 2 + 1" })
    expect(byId("feature-plate")?.textContent).toContain("= 5")
    const before = JSON.stringify(stored(id))
    await change("plate depth", "thick /")
    expect(JSON.stringify(stored(id))).toBe(before)
    expect(alerts()).toContain("Unexpected end")
    await change("plate depth", "nothing + 1")
    expect(alerts()).toContain("Unknown name 'nothing'")
    expect(JSON.stringify(stored(id))).toBe(before)
    // A number with no names is stored as the number it comes to, units included.
    await change("plate depth", "0,5in")
    expect(stored(id).features.find((f) => f.id === "plate")).toMatchObject({ depth: 12.7 })
    dispose()
  }, 60_000)

  test("an angle field in degrees reads 45° as 45, not as radians", async () => {
    const h: History = { ...plateTemplate(), features: plateTemplate().features.map((f) => (f.id === "plate" && f.type === "extrude" ? { ...f, taper: 0 } : f)) }
    const { id, dispose } = mountPanel(h)
    await tick()
    await change("plate draft angle (deg)", "5°")
    expect(stored(id).features.find((f) => f.id === "plate")).toMatchObject({ taper: 5 })
    dispose()
  }, 60_000)
})

describe("parameters", () => {
  test("adding with a decimal comma, a formula, a loop refused with the loop written out, a comment and a kind", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    field("New parameter name").value = "gap"
    field("New parameter name").dispatchEvent(new Event("input", { bubbles: true }))
    await change("New parameter value", "2,5")
    expect(stored(id).parameters["gap"]).toBe(2.5)
    field("New parameter name").value = "half"
    field("New parameter name").dispatchEvent(new Event("input", { bubbles: true }))
    await change("New parameter value", "width / 2")
    expect(stored(id).parameters["half"]).toBe("width / 2")
    expect(byId("parameter-half")?.textContent).toContain("= 30")
    // width = half * 2 would close width -> half -> width
    const before = JSON.stringify(stored(id))
    await change("Parameter width", "half * 2")
    expect(alerts()).toContain("circular definition: width -> half -> width")
    expect(JSON.stringify(stored(id))).toBe(before)
    await change("Comment width", "overall X")
    expect(stored(id).notes?.["width"]?.comment).toBe("overall X")
    dispose()
  }, 60_000)

  test("a unit mix-up in a formula is a warning under the parameter", async () => {
    const h: History = { ...plateTemplate(), parameters: { ...plateTemplate().parameters, tilt: "30deg", odd: "width + tilt" }, notes: { width: { kind: "length" } } }
    const { dispose } = mountPanel(h)
    await tick()
    expect(byId("parameter-warning-odd")?.textContent).toContain("mixes")
    dispose()
  }, 60_000)

  test("a parameter that is used cannot be removed; its tooltip says by what", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(button("Remove parameter width"))
    expect(alerts()).toContain("still used by")
    expect(stored(id).parameters["width"]).toBe(60)
    dispose()
  }, 60_000)
})

describe("sketch constraints", () => {
  test("the sketch shows fully constrained; a contradicting constraint is refused naming the clash; a reference dimension frees a degree", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    expect(byId("sketch-status-sketch1")?.textContent).toBe("fully constrained")
    expect(byId("sketch-dof-sketch1")).toBeNull()
    const open = byId("constraints-sketch1")!.querySelector("button")!
    await press(open)
    expect(byId("constraint-list-sketch1")?.querySelectorAll("li").length).toBe(7)
    // Length of l1 is `width`; a second, different length contradicts it.
    const typeSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Constraint type"]')!
    typeSelect.value = "length"
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }))
    await tick()
    const lineSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Entity line"]')!
    lineSelect.value = "l1"
    lineSelect.dispatchEvent(new Event("change", { bubbles: true }))
    await tick()
    await change("value", "99")
    const before = JSON.stringify(stored(id))
    await press([...byId("add-constraint-sketch1")!.querySelectorAll("button")].find((b) => b.textContent === "Add constraint")!)
    expect(alerts()).toContain("cannot all hold")
    expect(JSON.stringify(stored(id))).toBe(before)
    // The depth dimension (constraint 6) turned into a reference: one degree of freedom is left, and it measures 40.
    await press(button("Make a reference dimension (measures, does not constrain) length#6"))
    expect(byId("sketch-status-sketch1")?.textContent).toBe("under-constrained")
    expect(byId("sketch-dof-sketch1")?.textContent).toBe("1 degrees of freedom left")
    expect(byId("constraint-sketch1-6")?.textContent).toContain("measures 40")
    // Removing a constraint is one click.
    await press(button("Remove constraint length#6"))
    expect(stored(id).features[0]).toMatchObject({ type: "sketch" })
    expect((stored(id).features[0] as unknown as { sketch: { constraints: unknown[] } }).sketch.constraints).toHaveLength(6)
    dispose()
  }, 90_000)
})

describe("configurations", () => {
  test("add a variant, show another, edit a value in the design table, build and compare", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(byId("configurations-section")!.querySelector("button")!)
    field("Configuration name").value = "Wide"
    field("Configuration name").dispatchEvent(new Event("input", { bubbles: true }))
    await press([...byId("configurations-section")!.querySelectorAll("button")].find((b) => b.textContent === "Add configuration")!)
    expect(stored(id).configurations?.map((c) => c.name)).toEqual(["Default", "Wide"])
    expect(byId("configuration-wide")?.textContent).toContain("shown")
    await change("Wide width", "100")
    expect(stored(id).parameters["width"]).toBe(100) // Wide is shown, so its value is live
    expect(stored(id).configurations?.find((c) => c.id === "wide")?.values["width"]).toBe(100)
    await press(button("Show Default"))
    expect(stored(id).parameters["width"]).toBe(60)
    expect(stored(id).configuration).toBe("default")
    await press([...byId("configurations-section")!.querySelectorAll("button")].find((b) => b.textContent === "Build and compare")!)
    const rows = byId("configuration-measures")?.textContent ?? ""
    expect(rows).toContain("Default:")
    expect(rows).toContain("Wide:")
    dispose()
  }, 90_000)
})

describe("deleting and adding features", () => {
  test("the confirmation lists what goes with the feature, 'delete only' leaves the dependents to fail visibly", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    confirms.length = 0
    answer.value = false
    await press(button("Delete plate"))
    expect(confirms[0]).toContain("hole1")
    expect(stored(id).features.map((f) => f.id)).toEqual(["sketch1", "plate", "hole1"])
    answer.value = true
    await press(button("Delete only this one (what depends on it will fail) plate"))
    expect(stored(id).features.map((f) => f.id)).toEqual(["sketch1", "hole1"])
    expect(byId("issues-hole1")).not.toBeNull()
    await press(button("Delete hole1"))
    expect(stored(id).features.map((f) => f.id)).toEqual(["sketch1"])
    dispose()
  }, 90_000)

  test("a feature added while rolled back goes after the marker and the marker moves onto it", async () => {
    const { id, dispose } = mountPanel(plateTemplate())
    await tick()
    await press(button("Roll back to plate"))
    const add = [...byId("add-feature")!.querySelectorAll("button")].find((b) => b.textContent === "Coil")
    expect(add).toBeDefined()
    await press(add!)
    const h = stored(id)
    expect(h.features.map((f) => f.id)).toEqual(["sketch1", "plate", "coil1", "hole1"])
    expect(h.rollback).toBe("coil1")
    dispose()
  }, 90_000)
})
