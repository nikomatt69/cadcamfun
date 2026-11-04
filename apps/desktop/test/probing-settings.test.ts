/** Settings > Machining (spec 73 §4): probing defaults decode field by field, and the tab edits them through NumberField. */
import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { DEFAULT_PROBING, DEFAULT_SETTINGS, decodeProbingDefaults, decodeSettings } from "../src/shared/state/settings.ts"

test("probing defaults: missing record is the default, a bad field falls back alone, valid fields survive", () => {
  expect(decodeSettings({}).probing).toEqual(DEFAULT_PROBING)
  expect(DEFAULT_SETTINGS.probing).toMatchObject({ touchFeed: 100, fastFeed: 1000, clearance: 5, safeHeight: 25, search: 10, overtravel: 2, defaultUpdateMode: "set", defaultWorkOffset: "G54", defaultTolerance: 0.05, deviationScale: 100 })
  const decoded = decodeProbingDefaults({ touchFeed: 50, fastFeed: -1, clearance: "3", defaultUpdateMode: "alarm-outside-tolerance", defaultWorkOffset: "G54.1 P12", deviationScale: Number.NaN })
  expect(decoded).toEqual({ ...DEFAULT_PROBING, touchFeed: 50, defaultUpdateMode: "alarm-outside-tolerance", defaultWorkOffset: "G54.1 P12" })
  expect(decodeProbingDefaults({ defaultUpdateMode: "set-offset", defaultWorkOffset: "G60" })).toEqual(DEFAULT_PROBING)
  for (const code of ["G59", "G505", "G599", "G59.3", "G54.1 P300"]) expect(decodeProbingDefaults({ defaultWorkOffset: code }).defaultWorkOffset).toBe(code)
  for (const code of ["G53", "G54.1 P0", "G54.1 P301", "G600", "g54"]) expect(decodeProbingDefaults({ defaultWorkOffset: code }).defaultWorkOffset).toBe("G54")
})

test("the machining tab has no number inputs, takes a comma decimal and an expression, and resets", async () => {
  installDom("http://localhost/settings")
  const { render } = await import("solid-js/web")
  const { AppProvider, createAppState } = await import("../src/shared/state/context.ts")
  const { fakeRuntime } = await import("../src/shared/state/client.ts")
  const { ProbingSettings } = await import("../src/features/settings/components/probing-settings.tsx")
  const connection = fakeRuntime()
  const state = createAppState({ client: connection.client, runtime: connection.runtime })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => AppProvider({ state, get children() { return ProbingSettings() } }), root)
  try {
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
    const field = (key: string) => root.querySelector(`[data-testid="probing-${key}"]`) as HTMLInputElement
    const type = (input: HTMLInputElement, text: string) => {
      input.value = text
      input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
      input.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event)
    }
    type(field("clearance"), "12,5")
    expect(state.settings.settings().probing.clearance).toBe(12.5)
    type(field("touchFeed"), "100/4")
    expect(state.settings.settings().probing.touchFeed).toBe(25)
    // Out of bounds is refused: the stored value stays.
    type(field("search"), "1000")
    expect(state.settings.settings().probing.search).toBe(DEFAULT_PROBING.search)
    const mode = root.querySelector('select[name="probing.defaultUpdateMode"]') as HTMLSelectElement
    mode.value = "report"
    mode.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event)
    expect(state.settings.settings().probing.defaultUpdateMode).toBe("report")
    const reset = [...root.querySelectorAll("button")].find((b) => b.textContent === "Reset probing defaults") as HTMLButtonElement
    reset.click()
    expect(state.settings.settings().probing).toEqual(DEFAULT_PROBING)
  } finally {
    dispose()
    root.remove()
  }
})
