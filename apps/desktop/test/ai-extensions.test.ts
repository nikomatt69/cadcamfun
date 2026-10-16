import { afterAll, beforeAll, expect, test } from "bun:test"
import { isolatedPaths } from "../../../packages/ai/src/nikcli/isolation.ts"
import { saveMod } from "../../../packages/ai/src/nikcli/mods.ts"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)

test("the assistant exposes MCP, plugin and mod management; a store mod toggles and removes from the panel", async () => {
  // A mod in the app-owned store, as the assistant creates them; the panel reads the same index.
  saveMod(isolatedPaths(app.sidecar.dataDir), { id: "run-notes", name: "Run notes", description: "Adds the day to every answer.", source: "export const register = () => {}", origin: "user" })
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

    // The mods section lists the store record as written by the user, and manages it.
    const mods = [...panel.querySelectorAll("section")].find((section) => section.querySelector("h3")?.textContent === "Assistant mods")
    expect(mods).toBeDefined()
    const enableMod = await app.wait(() => mods!.querySelector<HTMLButtonElement>('button[aria-label="Enable Run notes"]'), 10000)
    expect(mods!.textContent).toContain("Written by the user")
    expect(enableMod.getAttribute("aria-pressed")).toBe("false")
    enableMod.click()
    const disableMod = await app.wait(() => mods!.querySelector<HTMLButtonElement>('button[aria-label="Disable Run notes"]'), 10000)
    expect(disableMod.getAttribute("aria-pressed")).toBe("true")
    mods!.querySelector<HTMLButtonElement>('button[aria-label="Remove Run notes"]')?.click()
    await app.wait(() => !mods!.textContent?.includes("Run notes"), 10000)
    expect(panel.textContent).not.toContain("Unable to load or update")
  } finally { dispose() }
}, 60000)
