/**
 * The user's keymap on the native menu bar.
 *
 * On macOS the menu bar takes its accelerators before the webview sees a key, so a rebound command would keep answering to
 * its old menu chord and the menu would show a key that no longer does what it says. The shell therefore sends the keymap
 * to the menu (`set_menu_accelerators`) every time it changes: each menu item that is a catalog command shows, and takes,
 * the first chord of that command that the menu can express.
 */
import type { Keymap } from "../shared/keybindings/keymap.ts"
import { NATIVE_MENU } from "../shared/keybindings/catalog.ts"
import type { Chord } from "../shared/keybindings/chord.ts"

const NAMED: Readonly<Record<string, string>> = {
  escape: "Esc", enter: "Enter", space: "Space", tab: "Tab", backspace: "Backspace", delete: "Delete", insert: "Insert",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right", "+": "Plus"
}

/**
 * A chord as Tauri's accelerator text (`CmdOrCtrl+Shift+Z`), or `undefined` when the menu cannot or should not take it:
 * a chord with no command modifier is a plain key and would be taken away from every text field, and a few symbols have
 * no accelerator name.
 */
export const toAccelerator = (chord: Chord): string | undefined => {
  if (!(chord.mod || chord.ctrl || chord.meta || chord.alt)) return undefined
  const named = NAMED[chord.key]
  const key = named ?? (/^[a-z0-9]$/.test(chord.key) ? chord.key.toUpperCase() : /^f\d+$/.test(chord.key) ? chord.key.toUpperCase() : [",", ".", "-", "=", "/", ";", "'", "[", "]", "\\", "`"].includes(chord.key) ? chord.key : undefined)
  if (key === undefined) return undefined
  const parts: string[] = []
  if (chord.mod) parts.push("CmdOrCtrl")
  if (chord.ctrl) parts.push("Ctrl")
  if (chord.meta) parts.push("Super")
  if (chord.alt) parts.push("Alt")
  if (chord.shift) parts.push("Shift")
  return [...parts, key].join("+")
}

/**
 * The accelerator of every menu item that runs a catalog command: the first chord the menu can take, or `null` when the
 * command has none (the item then shows no key). Items that belong to the shell (new, open, the panels) keep Rust's own.
 */
export const menuAccelerators = (keymap: Keymap): Readonly<Record<string, string | null>> => {
  const result: Record<string, string | null> = {}
  for (const item of NATIVE_MENU) {
    if (item.command === undefined) continue
    const chords = keymap.entry(item.command)?.chords ?? []
    result[item.id] = chords.map(toAccelerator).find((accelerator) => accelerator !== undefined) ?? null
  }
  return result
}

/** Sends the keymap to the native menu; a webview outside Tauri has no menu bar and does nothing. */
export const syncNativeMenu = async (keymap: Keymap): Promise<void> => {
  const { isTauri } = await import("./sidecar.ts")
  if (!isTauri()) return
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("set_menu_accelerators", { accelerators: menuAccelerators(keymap) })
}
