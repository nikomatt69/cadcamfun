/**
 * A STEP file brought into the Parametric part panel as the base of its history (spec 72 step 2.2): the report is shown, the body is
 * stored in the history's JSON form, rebuilds exactly, and a body a feature names is not removed silently.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { brep, rebuild, rebuildExact, type History } from "@cadcamfun/core"
import { explodeWithGaps } from "../../../packages/core/src/cad/brep/exploded-fixture.ts"
import { importStepIntoHistory } from "../src/features/cad/lib/importStep.ts"
import { installDom } from "./helpers/dom.ts"

setDefaultTimeout(60_000)
type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountPanel: (history: History) => { readonly id: string; readonly dispose: () => void }

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const stored = (id: string): History => useElementsStore.getState().elements.find((e) => e.id === id)!["history"] as History
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** A 10 x 20 x 30 box written face by face with 30 micrometre gaps (healed on import). */
const STEP = brep.writeStepBreps([{ name: "bracket", brep: explodeWithGaps(brep.makeBox(10, 20, 30), 3e-5) }])
const EMPTY: History = { parameters: {}, features: [] }

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

describe("importing a STEP file into the part panel", () => {
  test("the logic adds the healed body in its stored form and says what it did; a file that is not STEP changes nothing", () => {
    const outcome = importStepIntoHistory(STEP, EMPTY)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.lines[0]).toContain("bracket: healed, 6 faces")
    expect(outcome.history.bases).toHaveLength(1)
    expect((outcome.history.bases![0]!.brep as unknown as { version: number }).version).toBe(1)
    expect(importStepIntoHistory("not a step file", EMPTY).ok).toBe(false)
    expect(importStepIntoHistory("not a step file", EMPTY).lines[0]).toContain("could not be read")
  })

  test("the file chooser stores the body, the row appears, and the stored history rebuilds to the exact volume", async () => {
    const { id, dispose } = mountPanel(EMPTY)
    await tick()
    const input = byId("import-step") as HTMLInputElement
    const file = new File([STEP], "bracket.step", { type: "application/step" })
    Object.defineProperty(input, "files", { value: [file], configurable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await tick(400)
    const history = stored(id)
    expect(history.bases).toHaveLength(1)
    expect(byId(`base-${history.bases![0]!.id}`)).not.toBeNull()
    expect(byId("import-report")?.textContent).toContain("bracket")
    const volume = rebuildExact(history, rebuild(history)).bodies[0]!.brep!
    expect(rel(brep.massProperties(volume).volume, 6000)).toBeLessThan(1e-9)
    dispose()
  })

  test("removing the body works while no feature names it and is refused with the feature when one does", async () => {
    const imported = importStepIntoHistory(STEP, EMPTY)
    if (!imported.ok) throw new Error("import failed")
    const baseId = imported.history.bases![0]!.id
    const used: History = { ...imported.history, features: [{ id: "m1", type: "move", targets: [baseId], translate: [1, 0, 0] }] }
    const refused = mountPanel(used)
    await tick()
    document.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${baseId}"]`)!.click()
    await tick(80)
    expect(stored(refused.id).bases).toHaveLength(1)
    expect(document.body.textContent).toContain("m1")
    refused.dispose()
    const free = mountPanel(imported.history)
    await tick()
    document.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${baseId}"]`)!.click()
    await tick(80)
    expect(stored(free.id).bases).toBeUndefined()
    free.dispose()
  })
})
