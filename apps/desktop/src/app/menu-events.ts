/**
 * The shell's menus reach the webview as one `menu` event carrying a stable item id (`src-tauri/src/menu.rs`, `tray.rs`): the native
 * menu bar of macOS, the tray's recent projects and the in-window menus of Windows and Linux all end in the same `onMenu` of the
 * app shell. This file is the listening half, and the ids that are not plain actions.
 */
import { inDesktopShell, type Invoke } from "./updates.ts"

const RECENT_PREFIX = "tray.recent."

/** The project a tray "recent" item opens, or nothing for any other id. */
export const projectOfRecentId = (id: string): string | undefined => id.startsWith(RECENT_PREFIX) && id.length > RECENT_PREFIX.length ? id.slice(RECENT_PREFIX.length) : undefined

/** Subscribes to the shell's `menu` events; the returned function unsubscribes. Outside the desktop shell there is nothing to hear. */
export const listenToMenu = async (handler: (id: string) => void): Promise<() => void> => {
  if (!inDesktopShell()) return () => {}
  const { listen } = await import("@tauri-apps/api/event")
  return await listen<unknown>("menu", (message) => { if (typeof message.payload === "string") handler(message.payload) })
}

/** Reveals the folder the shell writes its logs to. */
export const openLogsFolder = async (invoke?: Invoke): Promise<void> => {
  const call = invoke ?? (await import("@tauri-apps/api/core")).invoke as Invoke
  await call("open_path", { path: await call("get_logs_dir") })
}
