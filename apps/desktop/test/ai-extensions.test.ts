import { afterAll, beforeAll, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)

test("the assistant exposes MCP and plugin management, installs an inert plugin and toggles its live tools", async () => {
  const { dispose } = app.visit("/ai")
  try {
    ;(await app.wait(() => q<HTMLButtonElement>('[data-testid="ai-more-toggle"]'))).click()
    ;(await app.wait(() => q<HTMLButtonElement>('[data-testid="ai-more-extensions"]'))).click()
    const panel = await app.wait(() => q('[data-testid="ai-extensions"]'))
    expect(panel.textContent).toContain("MCP servers")
    expect(panel.querySelector('a[href="/plugins"]')?.textContent).toContain("CAD/CAM")
    const install = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Install plugin")
    expect(install).toBeDefined()
    install?.click()
    const enable = await app.wait(() => q<HTMLButtonElement>('button[aria-label="Enable My CAD tools"]'), 10000)
    expect(enable.getAttribute("aria-pressed")).toBe("false")
    enable.click()
    const disable = await app.wait(() => q<HTMLButtonElement>('button[aria-label="Disable My CAD tools"]'), 10000)
    expect(disable.getAttribute("aria-pressed")).toBe("true")
    disable.click()
    await app.wait(() => q<HTMLButtonElement>('button[aria-label="Enable My CAD tools"]'), 10000)
    q<HTMLButtonElement>('button[aria-label="Remove My CAD tools"]')?.click()
    await app.wait(() => !panel.textContent?.includes("My CAD tools"), 10000)
    expect(panel.textContent).not.toContain("Unable to load or update")
  } finally { dispose() }
}, 60000)
