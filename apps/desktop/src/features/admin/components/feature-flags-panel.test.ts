import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("admin controls announce and show the real per-user override", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { AdminFeatureFlagsPanel } = await import("./feature-flags-panel.tsx")
  const { featureFlagService } = await import("./feature-flags.ts")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AdminFeatureFlagsPanel(), root)
  const user = "test-admin-flags-ui"
  try {
    const input = root.querySelector<HTMLInputElement>('input[name="userId"]')!
    input.value = `  ${user}  `
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const enable = root.querySelector<HTMLButtonElement>('button[aria-label="Enable: ai assistant"]')!
    const disable = root.querySelector<HTMLButtonElement>('button[aria-label="Disable: ai assistant"]')!
    expect(enable.getAttribute("aria-pressed")).toBe("false")
    expect(disable.getAttribute("aria-pressed")).toBe("false")
    enable.click()
    expect(featureFlagService.listOverrides(user)[0]?.enabled).toBe(true)
    expect(enable.getAttribute("aria-pressed")).toBe("true")
    expect(disable.getAttribute("aria-pressed")).toBe("false")
    disable.click()
    expect(featureFlagService.listOverrides(user)[0]?.enabled).toBe(false)
    expect(enable.getAttribute("aria-pressed")).toBe("false")
    expect(disable.getAttribute("aria-pressed")).toBe("true")
    input.value = "another-user"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(enable.getAttribute("aria-pressed")).toBe("false")
    expect(disable.getAttribute("aria-pressed")).toBe("false")
  } finally {
    featureFlagService.removeAdminOverride(user, "ai_assistant")
    dispose()
  }
}, 120_000)
