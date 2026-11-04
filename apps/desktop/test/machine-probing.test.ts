/** The machine's probe and tool setter in the library (spec 73 §4): read through the profile, written to the config, issues, DOM. */
import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"
import { probingFormOf, probingIssues, setterOf, writeProbe, writeSetter } from "../src/features/library/lib/machine-probing.ts"
import { machineSections } from "../src/features/library/lib/machine-details.ts"

const SETTER = { kind: "contact", position: { x: 400, y: -200, z: -350 }, triggerZ: -420, maxToolDiameter: 30, feeds: { fast: 500, touch: 20 }, brokenTolerance: 0.2 }

test("legacy radius/feed read as diameter/touch feed; writes keep the legacy keys in step; the profile keeps the new ones", () => {
  const legacy = { probing: { stylusRadius: 1.5, feed: 80 } }
  expect(probingFormOf(legacy).probe).toMatchObject({ stylusDiameter: 3, touchFeed: 80 })
  let config: Record<string, unknown> = writeProbe(legacy, "stylusDiameter", 4)
  config = writeProbe(config, "touchFeed", 60)
  config = writeProbe(config, "fastFeed", 600)
  config = writeProbe(config, "toolNumber", 99)
  config = writeProbe(config, "doubleTouch", true)
  expect(config.probing).toEqual({ stylusRadius: 2, feed: 60, stylusDiameter: 4, feeds: { touch: 60, fast: 600 }, toolNumber: 99, doubleTouch: true })
  // What the detail page saves (the canonical profile) still has every figure.
  const saved = cam.kernel.configOfProfile(cam.kernel.profileOfConfig(config, "mill"))
  expect(saved.probing).toMatchObject({ stylusDiameter: 4, feeds: { touch: 60, fast: 600 }, toolNumber: 99 })
  expect(writeProbe(writeProbe({ probing: { stylusDiameter: 4 } }, "stylusDiameter", undefined), "touchFeed", undefined).probing).toBeUndefined()
})

test("issues: a probe without a stylus, fast below touch, an incomplete setter; a complete setter reads as the kernel's", () => {
  expect(probingIssues(probingFormOf({ probing: { feeds: { touch: 100, fast: 50 } } }))).toEqual(["stylusMissing", "fastBelowTouch"])
  let config: Record<string, unknown> = writeSetter({}, "kind", "laser")
  expect(probingIssues(probingFormOf(config))).toEqual(["setterIncomplete"])
  for (const [field, value] of [["x", 400], ["y", -200], ["z", -350], ["triggerZ", -420], ["maxToolDiameter", 30], ["fastFeed", 500], ["touchFeed", 20], ["brokenTolerance", 0.2]] as const) {
    config = writeSetter(config, field, value)
  }
  const form = probingFormOf(config)
  expect(probingIssues(form)).toEqual([])
  expect(setterOf(form)).toEqual({ ...SETTER, kind: "laser" })
  expect(cam.kernel.profileOfConfig(config, "mill").toolSetter).toEqual({ ...SETTER, kind: "laser" })
  expect(writeSetter(config, null).toolSetter).toBeUndefined()
})

test("machine facts show the stylus diameter, the setter and the rotary calibration", () => {
  const profile = cam.kernel.profileOfConfig({ probing: { stylusRadius: 1, toolNumber: 99 }, toolSetter: SETTER, rotary: { layout: "table-AC", calibration: { at: "2026-11-04", axisError: 0.004 } } }, "mill")
  const probing = machineSections(profile).find((s) => s.title === "Probing")
  expect(probing?.facts.map((f) => f.value)).toEqual(["Ø2 mm", "T99", "Contact · X400 Y-200 Z-350", "2026-11-04", "0.004 °"])
})

test("the library form edits the probe with NumberField (comma decimals) and has no number inputs", async () => {
  installDom("http://localhost/machine/1")
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { MachineProbingFields } = await import("../src/features/library/components/MachineProbingFields.tsx")
  const [form, setForm] = createSignal<Record<string, unknown>>({ type: "mill", config: { probing: { stylusRadius: 1 }, rotary: { layout: "table-AC", calibration: { at: "2026-11-04", pivotMeasured: { x: 0.03, y: -0.02, z: 100.05 } } } } })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MachineProbingFields({ get form() { return form() }, onPatchConfig: (key, value) => { if (key === "__config") setForm({ ...form(), config: value }) } }), root)
  try {
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
    const stylus = root.querySelector('[data-testid="probe-stylusDiameter"]') as HTMLInputElement
    expect(stylus.value).toBe("2")
    stylus.value = "6,35"
    stylus.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
    stylus.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event)
    expect((form().config as Record<string, Record<string, unknown>>).probing).toMatchObject({ stylusDiameter: 6.35, stylusRadius: 3.175 })
    expect(root.querySelector('[data-testid="rotary-calibration"]')?.textContent).toContain("X0.030 Y-0.020 Z100.050")
    const setter = root.querySelector("#res-setter") as HTMLInputElement
    setter.checked = true
    setter.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event)
    expect((form().config as Record<string, unknown>).toolSetter).toEqual({ kind: "contact" })
    expect(root.querySelector('[data-testid="probing-issues"]')?.textContent).toContain("Complete the tool setter")
  } finally {
    dispose()
    root.remove()
  }
})
