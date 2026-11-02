import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("shortcut recording preserves keyboard navigation and can be cancelled from the text field", async () => {
  installDom("http://localhost/settings")
  const { render } = await import("solid-js/web")
  const { AppProvider, createAppState } = await import("../../../shared/state/context.ts")
  const { fakeRuntime } = await import("../../../shared/state/client.ts")
  const { KeybindingsSettings } = await import("./keybindings-settings.tsx")
  const connection = fakeRuntime()
  const state = createAppState({ client: connection.client, runtime: connection.runtime })
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state, get children() { return KeybindingsSettings() } }), root)
  try {
    const row = root.querySelector('[data-command="cad.copy"]')!
    const add = [...row.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Add shortcut"))!
    add.click()
    const input = row.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(input).not.toBeNull()
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    add.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    input.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(row.querySelector('input[type="text"]')).toBeNull()
    const file = root.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(file.classList.contains("hidden")).toBe(false)
    expect(file.labels?.length).toBe(1)
  } finally { dispose(); state.dispose() }
}, 120_000)
