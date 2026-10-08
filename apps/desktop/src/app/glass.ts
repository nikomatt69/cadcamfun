/**
 * Liquid Glass for the Tauri window.
 *
 * On macOS 26+ the shell asks `tauri-plugin-liquid-glass` for a real `NSGlassEffectView` behind the (transparent) webview; on
 * older macOS the plugin falls back to vibrancy. Either way the page then has to let the material show through, which the
 * `data-glass` attribute on `<html>` switches on (`styles/glass.css`). Outside Tauri, on other systems, or with the setting
 * turned off the attribute is absent and the app looks as it always did.
 */
export type GlassMode = "liquid" | "vibrancy"

export interface GlassHost {
  /** True inside the Tauri webview. */
  readonly isTauri: boolean
  /** The operating system, as `@tauri-apps/plugin-os` names it. */
  readonly platform: () => Promise<string> | string
  /** Whether the system has the real Liquid Glass material (macOS 26+). */
  readonly isGlassSupported: () => Promise<boolean>
  readonly setEffect: (options: { enabled?: boolean; cornerRadius?: number; tintColor?: string }) => Promise<void>
  readonly root: { dataset: DOMStringMap }
}

const attribute = "glass"

/** The mode that was applied, or `undefined` when the page stays opaque. Never throws: the UI works without the material. */
export const applyGlass = async (host: GlassHost, enabled = true): Promise<GlassMode | undefined> => {
  const clear = () => { delete host.root.dataset[attribute] }
  if (!enabled || !host.isTauri) { clear(); return undefined }
  try {
    if ((await host.platform()) !== "macos") { clear(); return undefined }
    const real = await host.isGlassSupported()
    await host.setEffect({ enabled: true, cornerRadius: 10 })
    const mode: GlassMode = real ? "liquid" : "vibrancy"
    host.root.dataset[attribute] = mode
    return mode
  } catch {
    clear()
    return undefined
  }
}

/** Turns the material off again (the window keeps its transparency, the page goes back to opaque surfaces). */
export const removeGlass = async (host: GlassHost): Promise<void> => {
  delete host.root.dataset[attribute]
  try { await host.setEffect({ enabled: false }) } catch { /* nothing to undo */ }
}

/** The real host: the Tauri plugins and `document.documentElement`. */
export const tauriGlassHost = async (): Promise<GlassHost> => {
  const [{ platform }, glass] = await Promise.all([import("@tauri-apps/plugin-os"), import("tauri-plugin-liquid-glass-api")])
  return {
    isTauri: true,
    platform: () => platform(),
    isGlassSupported: () => glass.isGlassSupported(),
    setEffect: (options) => glass.setLiquidGlassEffect(options),
    root: document.documentElement
  }
}
