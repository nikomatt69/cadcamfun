import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { applyGlass, removeGlass, type GlassHost } from "../src/app/glass.ts"
import { DEFAULT_SETTINGS, decodeSettings } from "../src/shared/state/settings.ts"
import { bootLiveApp } from "./helpers/live-app.ts"

const host = (patch: Partial<GlassHost> = {}) => {
  const calls: Array<Record<string, unknown>> = []
  const root = { dataset: {} as DOMStringMap }
  const value: GlassHost = {
    isTauri: true, platform: () => "macos", isGlassSupported: async () => true,
    setEffect: async (options) => { calls.push(options) }, root, ...patch
  }
  return { host: value, calls, root }
}

describe("Liquid Glass for the Tauri window", () => {
  test("macOS 26 gets the real material and the page switches to glass surfaces", async () => {
    const { host: h, calls, root } = host()
    expect(await applyGlass(h)).toBe("liquid")
    expect(root.dataset["glass"]).toBe("liquid")
    expect(calls).toEqual([{ enabled: true, cornerRadius: 10 }])
  })

  test("an older macOS keeps the vibrancy the plugin falls back to", async () => {
    const { host: h, root } = host({ isGlassSupported: async () => false })
    expect(await applyGlass(h)).toBe("vibrancy")
    expect(root.dataset["glass"]).toBe("vibrancy")
  })

  test("Windows, Linux, the browser and a disabled setting leave the page opaque and ask for nothing", async () => {
    for (const patch of [{ platform: () => "windows" }, { platform: async () => "linux" }, { isTauri: false }]) {
      const { host: h, calls, root } = host(patch)
      expect(await applyGlass(h)).toBeUndefined()
      expect(root.dataset["glass"]).toBeUndefined()
      expect(calls).toEqual([])
    }
    const off = host()
    expect(await applyGlass(off.host, false)).toBeUndefined()
    expect(off.calls).toEqual([])
  })

  test("a failing plugin never breaks the app: the page just stays opaque", async () => {
    const { host: h, root } = host({ setEffect: async () => { throw new Error("no glass here") } })
    expect(await applyGlass(h)).toBeUndefined()
    expect(root.dataset["glass"]).toBeUndefined()
  })

  test("the material can be turned off again", async () => {
    const { host: h, calls, root } = host()
    await applyGlass(h)
    await removeGlass(h)
    expect(root.dataset["glass"]).toBeUndefined()
    expect(calls.at(-1)).toEqual({ enabled: false })
  })

  test("the stylesheet only applies under data-glass, and falls back to opaque with reduced transparency", () => {
    const css = readFileSync(join(import.meta.dir, "../src/styles/glass.css"), "utf8")
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]!.trim()).filter((s) => s !== "" && !s.startsWith("@media"))
    expect(rules.length).toBeGreaterThan(8)
    for (const selector of rules) for (const part of selector.split(",")) expect(part.trim()).toContain(":root[data-glass]")
    expect(css).toContain("prefers-reduced-transparency")
  })

  test("the Tauri shell registers the plugin, allows it, and the window is transparent", () => {
    const tauri = join(import.meta.dir, "../src-tauri")
    const conf = JSON.parse(readFileSync(join(tauri, "tauri.conf.json"), "utf8"))
    expect(conf.app.macOSPrivateApi).toBe(true)
    expect(conf.app.windows[0].transparent).toBe(true)
    const caps = JSON.parse(readFileSync(join(tauri, "capabilities/main.json"), "utf8")).permissions
    for (const permission of ["os:default", "window-state:default", "log:default"]) expect(caps).toContain(permission)
    // The glass permission lives in its own capability, so a build without the plugin can leave it out.
    expect(JSON.parse(readFileSync(join(tauri, "capabilities/glass.json"), "utf8")).permissions).toEqual(["liquid-glass:default"])
    expect(conf.app.security.capabilities).toEqual(["main", "glass"])
    const store = JSON.parse(readFileSync(join(tauri, "tauri.appstore.conf.json"), "utf8"))
    expect(store.app.macOSPrivateApi).toBe(false)
    expect(store.app.windows[0].transparent).toBe(false)
    expect(store.app.security.capabilities).toEqual(["main"])
    const lib = readFileSync(join(tauri, "src/lib.rs"), "utf8")
    for (const plugin of ["tauri_plugin_liquid_glass::init()", "tauri_plugin_os::init()", "tauri_plugin_window_state::Builder"]) expect(lib).toContain(plugin)
  })
})

describe("the Liquid Glass setting", () => {
  test("is on by default, survives decoding, and a non-boolean falls back to the default", () => {
    expect(DEFAULT_SETTINGS.glass).toBe(true)
    expect(decodeSettings({ glass: false }).glass).toBe(false)
    expect(decodeSettings({ glass: "no" }).glass).toBe(true)
    expect(decodeSettings({}).glass).toBe(true)
  })

  test("the settings screen has a switch that changes it", async () => {
    const app = await bootLiveApp()
    try {
      const { root, dispose } = app.visit("/settings")
      try {
        const tab = await app.wait(() => [...root.querySelectorAll<HTMLElement>("button, [role=tab]")].find((b) => b.textContent?.trim() === "Language"), 60000)
        tab.click()
        const box = await app.wait(() => root.querySelector<HTMLInputElement>('[data-testid="glass-setting"] input'), 60000)
        expect(box.checked).toBe(true)
        box.checked = false
        box.dispatchEvent(new Event("change", { bubbles: true }))
        await app.wait(() => root.querySelector<HTMLInputElement>('[data-testid="glass-setting"] input')?.checked === false, 10000)
      } finally { dispose() }
    } finally { await app.dispose() }
  }, 120000)
})

describe("the professional surface language", () => {
  const read = (name: string) => readFileSync(join(import.meta.dir, "../src/styles", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

  test("adds no gradients and no overshooting easing, and is loaded after the other styles and before the glass layer", () => {
    for (const name of ["professional.css", "glass.css"]) {
      const css = read(name)
      expect(css).not.toMatch(/(linear|radial|conic)-gradient\(/)
      for (const m of css.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
        const [, y1, , y2] = m[1]!.split(",").map(Number)
        expect(y1!).toBeLessThanOrEqual(1)
        expect(y2!).toBeLessThanOrEqual(1)
      }
    }
    const main = readFileSync(join(import.meta.dir, "../src/main.tsx"), "utf8")
    const order = ["./styles/misc.css", "./styles/professional.css", "./styles/glass.css"].map((f) => main.indexOf(f))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test("switches off the decorative layers of the earlier styles", () => {
    const css = read("professional.css")
    for (const needle of [".dashboard-hero-glow", ".ui-glow", ".ui-card::before", ".dark .reference-shell", "transition-property: transform"]) expect(css).toContain(needle)
    // Press feedback is kept on purpose (see the comment in professional.css).
    expect(css).not.toContain(":active { transform: none; }")
    // It tones effects down; it never touches layout or type.
    expect(css).not.toMatch(/\b(font-family|font-size|height|width|padding|margin|gap|display\s*:\s*(flex|grid))\b/)
  })
})
