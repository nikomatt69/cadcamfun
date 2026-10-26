/**
 * The keybindings on screen: every command of the catalog has a real handler in the code (the old dialog listed keys
 * nothing answered), the shortcuts dialog and the settings tab are built from the user's keymap, and rebinding in the
 * settings changes what the keyboard does.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { installDom } from "./helpers/dom.ts"
import { COMMANDS, SNAP_TYPES } from "../src/shared/keybindings/catalog.ts"

const SRC = join(import.meta.dir, "../src")
const OWNERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  app: ["app/Shell.tsx"],
  file: ["features/cad/screens/CadPage.tsx", "features/cam/screens/CamPage.tsx", "app/Shell.tsx"],
  edit: ["features/cad/components/CADCanvas.tsx", "features/cam/screens/CamPage.tsx", "app/Shell.tsx"],
  view: ["features/cad/components/CADCanvas.tsx", "viewport/view3d/view3d.tsx"],
  cad: ["features/cad/components/CADCanvas.tsx"],
  cam: ["features/cam/screens/CamPage.tsx"]
}

test("every command has a handler registered by the screen that owns it", () => {
  const sources = new Map<string, string>()
  const read = (file: string): string => { if (!sources.has(file)) sources.set(file, readFileSync(join(SRC, file), "utf8")); return sources.get(file)! }
  for (const command of COMMANDS) {
    const owners = OWNERS[command.id.split(".")[0]!] ?? []
    // Face views and snap kinds are registered from their tables, everything else by its literal id.
    const tabled = command.id.startsWith("cad.snap.type.") ? SNAP_TYPES.some(([type]) => `cad.snap.type.${type}` === command.id) && owners.some((file) => read(file).includes("SNAP_TYPES.map"))
      : /^cad\.view\.(front|back|left|right|top|bottom)$/.test(command.id) && owners.some((file) => read(file).includes("CUBE_FACES.map"))
    const literal = owners.some((file) => read(file).includes(`"${command.id}"`))
    expect(literal || tabled, `${command.id} has no handler in ${owners.join(" / ")}`).toBe(true)
  }
})

test("the dialog and the settings tab show the keymap, and rebinding there changes the keyboard", async () => {
  installDom("http://localhost/settings")
  const { render } = await import("solid-js/web")
  const { AppProvider, createAppState } = await import("../src/shared/state/context.ts")
  const { fakeRuntime } = await import("../src/shared/state/client.ts")
  const { ShortcutsDialog } = await import("../src/shared/keybindings/shortcuts-dialog.tsx")
  const { KeybindingsSettings } = await import("../src/features/settings/components/keybindings-settings.tsx")
  const connection = fakeRuntime()
  const state = createAppState({ client: connection.client, runtime: connection.runtime })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => AppProvider({ state, get children() { return [ShortcutsDialog(), KeybindingsSettings()] } }), root)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20))
  try {
    // The settings list every CAD command with its chord, and says which were changed.
    expect(root.querySelector('[data-command="cad.copy"]')?.textContent).toContain("Copy")
    expect(root.querySelector('[data-command="cad.copy"] kbd')).not.toBeNull()
    expect(root.textContent).not.toContain("Customised")

    let copied = 0
    const off = state.keys.register({ "cad.copy": () => { copied++ } })
    state.setActivity("cad")
    const stop = state.keys.attach()
    const press = (init: KeyboardEventInit) => window.dispatchEvent(new window.KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init }))
    const mac = /mac/i.test(navigator.platform)
    const mod = { metaKey: mac, ctrlKey: !mac }
    press({ key: "c", ...mod })
    expect(copied).toBe(1)

    // Type a new chord in the row's editor, as the user would.
    const add = [...root.querySelectorAll('[data-command="cad.copy"] button')].find((button) => button.textContent?.includes("Add shortcut")) as HTMLButtonElement
    add.click()
    await flush()
    const input = root.querySelector('[data-command="cad.copy"] input[type="text"]') as HTMLInputElement
    input.value = "Mod+Shift+C"
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    await flush()
    expect(state.keys.keymap().entry("cad.copy")!.chords.map((chord) => `${chord.shift ? "S" : ""}${chord.key}`)).toEqual(["c", "Sc"])
    expect(root.querySelector('[data-command="cad.copy"]')?.textContent).toContain("Customised")
    press({ key: "C", shiftKey: true, ...mod })
    expect(copied).toBe(2)

    // A chord another command owns is refused with its name, and reassigning takes it.
    state.keys.rebind("cad.copy", ["Mod+C"])
    input.value = ""
    const clash = state.keys.rebind("cad.paste", ["Mod+C"])
    expect(clash.ok).toBe(false)
    expect(state.keys.rebind("cad.paste", ["Mod+C"], { reassign: true }).ok).toBe(true)
    expect(state.keys.keymap().entry("cad.copy")!.chords).toEqual([])

    // The help dialog is built from the same keymap and opens from the command.
    expect(document.querySelector('[data-testid="shortcuts-dialog"]')).toBeNull()
    state.keys.setHelpOpen(true)
    await flush()
    expect(document.querySelector('[data-testid="shortcuts-dialog"]')?.textContent).toContain("Paste")
    state.keys.setHelpOpen(false)
    stop(); off()
  } finally { dispose(); state.dispose() }
})
