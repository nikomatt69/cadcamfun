import { expect, setDefaultTimeout, test } from "bun:test"
import { model, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

// Every step rebuilds the parts exactly and runs Booleans; under a loaded machine 5 s is too short.
setDefaultTimeout(90_000)

/** A 60 x 30 block of height h at the origin with two holes 30 mm apart, drilled from its top. */
const block = (h: number, d: number, depth: number): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: h, id: "block" })
  m.hole({ plane: "XY", offset: h, at: [15, 15], diameter: d, depth, id: "a" })
  m.hole({ plane: "XY", offset: h, at: [45, 15], diameter: d, depth, id: "b" })
  return m.build()
}
/** An aluminium base with two M8 tapped holes and a steel plate with two M8 clearance holes, placed on it inside a component. */
const scene = () => [
  { id: "base", type: "parametric", name: "Base", history: block(20, 6.8, 16), x: 0, y: 0, z: 0, layerId: "default", metadata: { material: "aluminium" } },
  { id: "sub", type: "component", name: "Cover assembly", x: 0, y: 0, z: 20, layerId: "default", elements: [
    { id: "plate", type: "parametric", name: "Plate", history: block(8, 9, 8), x: 0, y: 0, z: 0, layerId: "default", metadata: { material: "S235JR" } }
  ] }
]

test("smart fasteners, interference and BOM on the canvas elements", async () => {
  const { fastenScene, sceneInterference, sceneBom, bomCsv, sceneParts, threadMaterial } = await import("../src/features/cad/lib/component-automation.ts")
  expect(threadMaterial("aluminium")).toBe("aluminium")
  expect(threadMaterial("S235JR")).toBe("steel")
  const elements: Array<Record<string, unknown>> = scene()
  // The plate is found inside its component and placed at z = 20.
  const parts = sceneParts(elements)
  expect(parts.skipped).toEqual([])
  expect(parts.parts.map((p) => p.id)).toEqual(["base", "plate"])

  const first = fastenScene(elements)
  expect(first.unfastened).toEqual([])
  // Aluminium wants 1.5 d = 12 mm of thread, but the 16 mm tapped hole leaves 16 - 2 pitches = 13.5 mm: under the head
  // 8 + 1.6 = 9.6 mm, so M8x20 (10.4 mm engaged) is the longest that fits, M8x25 would bottom out. The plan says so.
  expect(first.plans.map((p) => p.designation)).toEqual(["ISO 4762 M8x20", "ISO 4762 M8x20"])
  expect(first.plans[0]!.warnings).toEqual(["thread engagement 10.4 mm is below the 12 mm a thread in aluminium needs"])
  expect(first.elements.map((e) => e["name"])).toEqual(["ISO 4762 M8x20", "ISO 7089 M8", "ISO 4762 M8x20", "ISO 7089 M8"])
  for (const e of first.elements) {
    expect(e["type"]).toBe("brep")
    expect((e["metadata"] as { fastener: { bodies: string[] } }).fastener.bodies).toEqual(["plate", "base"])
  }
  const fastened = [...elements, ...first.elements.map((e, i) => ({ ...e, id: `f${i}`, layerId: "default" }))]
  // A second run finds the screws in place and inserts nothing.
  const again = fastenScene(fastened)
  expect(again.elements).toEqual([])
  expect(again.existing).toBe(2)

  const clash = sceneInterference(fastened)
  expect(clash.undetermined).toEqual([])
  expect(clash.interferences.filter((i) => i.kind === "clash")).toEqual([])
  expect(clash.interferences.filter((i) => i.kind === "expected").map((i) => [i.a, i.b].sort())).toEqual([["base", "f0"], ["base", "f2"]])

  const bom = sceneBom(fastened)
  expect(bom.rows.map((r) => [r.designation ?? r.name, r.quantity])).toEqual([["Base", 1], ["Plate", 1], ["ISO 4762 M8x20", 2], ["ISO 7089 M8", 2]])
  // Exact plate mass in S235JR (7.85 g/cm³): 60 x 30 x 8 less two 9 mm holes.
  expect(Math.abs(bom.rows[1]!.mass! - ((60 * 30 * 8 - 2 * Math.PI * 4.5 ** 2 * 8) * 7.85) / 1000)).toBeLessThan(1e-6)
  const csv = bomCsv(bom.rows).split("\n")
  expect(csv[0]).toBe("Item,Name,Designation,Material,Quantity,Volume (mm3),Mass each (g),Mass total (g)")
  expect(csv[3]!.startsWith("3,ISO 4762 M8x20,ISO 4762 M8x20,steel,2,")).toBe(true)
})

test("the assembly panel inserts the fasteners in one undo step and reports interference and the BOM", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: AssemblyAutomation } = await import("../src/features/cad/components/assembly/AssemblyAutomation.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const store = useElementsStore.getState()
  const before = [...store.elements]
  useElementsStore.setState({ elements: scene() as never, history: [scene() as never], currentHistoryIndex: 0 })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => AssemblyAutomation(), root)
  const click = (label: string) => [...root.querySelectorAll("button")].find((b) => b.textContent === label)!.click()
  const waitFor = async (testid: string) => {
    for (let i = 0; i < 1500 && root.querySelector(`[data-testid='${testid}']`) === null; i++) await new Promise((r) => setTimeout(r, 10))
    if (root.querySelector(`[data-testid='${testid}']`) === null) console.log("PANEL", root.textContent)
    expect(root.querySelector(`[data-testid='${testid}']`)).not.toBeNull()
    return root.querySelector(`[data-testid='${testid}']`)!
  }
  try {
    click("Insert fasteners")
    const result = await waitFor("fasten-result")
    expect(result.textContent).toContain("Fasteners inserted: 2")
    expect(result.textContent).toContain("ISO 4762 M8x20")
    const now = useElementsStore.getState()
    expect(now.elements.length).toBe(6)
    expect(now.currentHistoryIndex).toBe(1)

    click("Check interference")
    expect((await waitFor("interference-result")).textContent).toContain("No interference")

    click("Bill of materials")
    const bom = await waitFor("bom-result")
    expect(bom.textContent).toContain("ISO 4762 M8x20")
    expect(bom.querySelectorAll("[data-testid='bom-row']").length).toBe(4)

    // One undo removes every inserted fastener.
    useElementsStore.getState().undo()
    expect(useElementsStore.getState().elements.length).toBe(2)
  } finally {
    dispose(); root.remove()
    useElementsStore.setState({ elements: before, selectedElement: null })
  }
})
