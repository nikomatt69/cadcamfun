/** The program section (spec 73 §4): the 2D viewer of the text, the listing, native only where the machine has it, the claim said plainly. */
import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("the program shows in GCodeViewer and the listing; native is offered by macro style and its claim is stated", async () => {
  installDom("http://localhost/cam")
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { ProbeProgramPreview } = await import("../src/features/cam/components/probing/ProbeProgramPreview.tsx")
  const [style, setStyle] = createSignal<string | undefined>("inline")
  const toggled: boolean[] = []
  const program = { operationId: "a", dialect: "fanuc", nc: "G0 X0 Y0\nG31 X10 F100\nG65 P9814\n", lines: 3, notes: [], warnings: [], fingerprint: "f", native: "G65 P9814" }
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => ProbeProgramPreview({
    program, stale: false, dialect: "fanuc", dialects: [{ id: "fanuc", label: "Fanuc" }], busy: undefined, showIn3d: true, contactLines: new Set([2]),
    misplacement: { x: 0, y: 0, z: 0, c: 0 }, onMisplacement: () => {}, get nativeStyle() { return style() }, native: false, onNative: (v) => { toggled.push(v) },
    disabled: false, onDialect: () => {}, onGenerate: () => {}, onSimulate: () => {}, onShow3d: () => {}, onInsert: () => {}
  }), root)
  try {
    expect(root.querySelector("canvas")).not.toBeNull()
    expect(root.querySelector('[data-contact="true"]')?.textContent).toContain("G31")
    const box = root.querySelector('[data-testid="probe-native"]') as HTMLInputElement
    expect(box.disabled).toBe(true)
    setStyle("renishaw")
    expect(box.disabled).toBe(false)
    box.click()
    expect(toggled).toEqual([true])
    expect(root.querySelector('[data-testid="probe-program-native"]')?.textContent).toContain("unresolved")
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
  } finally {
    dispose()
    root.remove()
  }
})
