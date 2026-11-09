import { expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

test("the ribbon's Measure toggles the inspector in 3D and clears its picks", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Ribbon } = await import("../src/features/cad/components/CadRibbon.tsx")
  const { useCADStore } = await import("../src/features/cad/store/cadStore.ts")
  useCADStore.setState({ measureActive: false, measureTargets: [], viewMode: "2d" })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => Ribbon({ ready: true, onSurface: () => {}, onBoolean: () => {} }), root)
  try {
    const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Measure")!
    expect(button.getAttribute("aria-pressed")).toBe("false")
    button.click()
    expect(useCADStore.getState().measureActive).toBe(true)
    expect(useCADStore.getState().viewMode).toBe("3d")
    useCADStore.getState().setMeasureTargets([{ elementId: "a", kind: "body", index: 0 }, { elementId: "b", kind: "body", index: 0 }, { elementId: "c", kind: "body", index: 0 }])
    expect(useCADStore.getState().measureTargets.length).toBe(2)
    button.click()
    expect(useCADStore.getState().measureActive).toBe(false)
    expect(useCADStore.getState().measureTargets).toEqual([])
  } finally { dispose(); root.remove(); useCADStore.setState({ measureActive: false, measureTargets: [], viewMode: "3d" }) }
}, 60000)

test("the Measure panel shows the exact distance, angle and parallel gap of two faces in the display unit", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: MeasurePanel } = await import("../src/features/cad/components/MeasurePanel.tsx")
  const { runMeasure } = await import("../src/features/cad/lib/measure.ts")
  const make = (id: string, x: number) => ({ id, type: "brep", name: id.toUpperCase(), x, y: 0, z: 0, brep: brep.makeBox(10, 10, 10) })
  const a = make("a", 0), b = make("b", 25.4)
  const side = (body: brep.Brep, sign: number) => body.faces.findIndex((f) => f.surface.kind === "plane" && Math.abs((f.reversed ? -1 : 1) * f.surface.frame.z.x - sign) < 1e-9)
  const outcome = runMeasure([{ elementId: "a", kind: "face", index: side(a.brep, 1) }, { elementId: "b", kind: "face", index: side(b.brep, -1) }], [a, b])
  const root = document.createElement("div")
  document.body.append(root)
  let cleared = 0
  const dispose = render(() => MeasurePanel({ outcome, units: "inch", decimals: 4, nameOf: (id) => id.toUpperCase(), onClear: () => { cleared++ }, onClose: () => {} }), root)
  try {
    const value = (name: string) => root.querySelector(`[data-testid="measure-${name}"]`)?.textContent
    // 15.4 mm between the faces: 0.6063 inch.
    expect(value("distance")).toBe("0.6063 inch")
    expect(value("angle")).toBe("180.0000°")
    expect(value("gap")).toBe("0.6063 inch")
    expect(root.textContent).toContain("Face")
    expect(root.textContent).toContain("· A")
    root.querySelector<HTMLButtonElement>('[data-testid="measure-clear"]')!.click()
    expect(cleared).toBe(1)
  } finally { dispose(); root.remove() }
}, 60000)

test("a refused measurement shows the kernel's reason", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: MeasurePanel } = await import("../src/features/cad/components/MeasurePanel.tsx")
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MeasurePanel({ outcome: { ok: false, targets: [{ elementId: "s", kind: "body", index: 0 }], reason: "no exact solid" }, units: "mm", nameOf: (id) => id, onClear: () => {}, onClose: () => {} }), root)
  try {
    expect(root.querySelector('[data-testid="measure-error"]')?.textContent).toContain("no exact solid")
  } finally { dispose(); root.remove() }
}, 60000)
