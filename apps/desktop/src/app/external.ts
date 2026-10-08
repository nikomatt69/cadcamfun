import { open } from "@tauri-apps/plugin-shell"
import { isTauri } from "./sidecar.ts"

/** Opens `url` in the system browser inside Tauri (a webview `window.open` goes nowhere), in a new tab otherwise. */
export const openExternal = (url: string): void => {
  const fallback = (): void => { window.open(url, "_blank", "noopener,noreferrer") }
  if (isTauri()) void open(url).catch(fallback)
  else fallback()
}
