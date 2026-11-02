import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"
import type { AppState } from "../../../shared/state/context.ts"

test("a failed plugin settings save leaves the fields available for correction", async () => {
  installDom()
  const { Effect } = await import("effect")
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../../../shared/state/context.ts")
  const { PluginSettingsDialog } = await import("./plugin-settings-dialog.tsx")
  const state = {
    client: { plugins: { updateConfig: () => Effect.void } },
    runtime: { run: () => Promise.reject(new Error("Could not save")) }
  } as unknown as AppState
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state, get children() {
    return PluginSettingsDialog({ open: true, onClose: () => {}, pluginId: "fixture", configSchema: { properties: { host: { type: "string", default: "localhost" } } } })
  } }), root)
  try {
    const input = document.querySelector<HTMLInputElement>("#setting-host")!
    expect(input.value).toBe("localhost")
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
    buttons.find((button) => button.textContent?.trim() === "Save Settings")!.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save")
    expect(document.querySelector("#setting-host")).toBe(input)
    input.value = "new-host"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(document.querySelector('[role="alert"]')).toBeNull()
  } finally { dispose() }
}, 120_000)

test("closing a saved settings dialog cancels its delayed close before reopening", async () => {
  installDom()
  const { Effect } = await import("effect")
  const { createSignal } = await import("solid-js")
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../../../shared/state/context.ts")
  const { PluginSettingsDialog } = await import("./plugin-settings-dialog.tsx")
  const state = {
    client: { plugins: { updateConfig: () => Effect.void } },
    runtime: { run: () => Promise.resolve() }
  } as unknown as AppState
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let setOpen!: (value: boolean) => void
  let closes = 0
  const dispose = render(() => {
    const [open, updateOpen] = createSignal(true)
    setOpen = updateOpen
    return AppProvider({ state, get children() {
      return PluginSettingsDialog({ get open() { return open() }, onClose: () => { closes++; updateOpen(false) }, pluginId: "fixture", configSchema: { properties: { host: { type: "string" } } } })
    } })
  }, root)
  try {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
    buttons.find((button) => button.textContent?.trim() === "Save Settings")!.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Settings saved")
    setOpen(false)
    setOpen(true)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(closes).toBe(0)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  } finally { dispose() }
}, 120_000)
