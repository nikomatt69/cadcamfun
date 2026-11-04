/**
 * Lost references on the parametric timeline (spec 41 N7/N8, desktop side): a feature whose persistent reference names a face or an
 * edge that an upstream feature removed is badged on its row, with a link to the feature that removed it; a timeline with no lost
 * reference shows nothing of the kind.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import type { Feature, History } from "@cadcamfun/core"
import { refLossOf, refLossesOf } from "../src/features/cad/lib/ref-loss.ts"
import { installDom } from "./helpers/dom.ts"

const sketch = (id: string): Feature =>
  ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}-r`, kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } }) as unknown as Feature
const BASE = (): History => ({ parameters: { w: 60, h: 40, t: 10 }, features: [sketch("s"), { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" } as Feature] })
const EDGE = "edge:plate|edge(plate.side0.0,plate.top)"
/** A split keeps the part below z = 5: the plate's top face, and with it the edge the fillet names, is gone. */
const broken = (): History => ({
  ...BASE(),
  features: [...BASE().features, { id: "cut", type: "split", plane: "XY", offset: 5, keep: "below" } as Feature, { id: "round", type: "fillet", radius: 3, edges: { refs: [EDGE] } } as Feature]
})

describe("reading a lost reference from the kernel's issue", () => {
  test("the reference and the feature that removed it", () => {
    expect(refLossOf(`reference lost: ${EDGE}: it was removed by 'cut'`)).toEqual({ ref: EDGE, lostBy: "cut" })
    expect(refLossOf("reference lost: face:plate|plate.top: body 'plate' does not exist at this point of the history")).toEqual({ ref: "face:plate|plate.top" })
    expect(refLossOf("fillet radius 3 is larger than the edge allows")).toBeUndefined()
  })

  test("each reference once per feature, other features' issues ignored", () => {
    const issues = [
      { feature: "round", message: `reference lost: ${EDGE}: it was removed by 'cut'` },
      { feature: "round", message: `reference lost: ${EDGE}: it was removed by 'cut'` },
      { feature: "other", message: "reference lost: face:plate|plate.top: gone" }
    ]
    expect(refLossesOf(issues, "round")).toEqual([{ ref: EDGE, lostBy: "cut" }])
  })
})

describe("the timeline", () => {
  type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
  let useElementsStore: Store
  let mountPanel: (history: History) => () => void
  const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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
      return () => { dispose(); host.remove() }
    }
  })
  afterAll(() => useElementsStore.setState({ elements: [], selectedElement: null }))
  afterEach(() => { document.body.innerHTML = "" })

  test("a feature whose reference was removed upstream is badged, and the link focuses the feature that removed it", async () => {
    const dispose = mountPanel(broken())
    try {
      await tick()
      const badge = byId("ref-lost-round")!
      expect(badge).not.toBeNull()
      expect(badge.dataset["ref"]).toBe(EDGE)
      expect(badge.textContent).toContain("Reference lost")
      expect(byId("ref-lost-summary")!.textContent).toContain("1 selections")
      expect(byId("ref-lost-cut")).toBeNull()
      byId("ref-lost-by-round")!.click()
      expect(document.activeElement).toBe(byId("feature-cut"))
    } finally { dispose() }
  })

  test("a timeline whose references all resolve shows no badge", async () => {
    const dispose = mountPanel(BASE())
    try {
      await tick()
      expect(document.querySelector('[data-testid^="ref-lost"]')).toBeNull()
    } finally { dispose() }
  })
})
