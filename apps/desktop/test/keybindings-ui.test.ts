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
    // Creation commands are registered from the ribbon's table of parts.
    const created = command.id.startsWith("cad.create.") &&
      read("features/cad/components/CadRibbon.tsx").includes(`${command.id.slice("cad.create.".length)}: "`) && read("features/cad/components/CadRibbon.tsx").includes("`cad.create.${name}`")
    const literal = created || owners.some((file) => read(file).includes(`"${command.id}"`))
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

test("the elements list keeps its keys to itself: arrows and Enter act inside the panel, never on the window", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: ElementsListPanel } = await import("../src/features/cad/components/ElementsListPanel.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { useSelectionStore } = await import("../src/features/cad/store/selectorStore.ts")
  useElementsStore.setState({ elements: [] })
  const first = useElementsStore.getState().addElement({ type: "cube", x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1, name: "aaa" })
  const second = useElementsStore.getState().addElement({ type: "cube", x: 5, y: 0, z: 0, width: 1, height: 1, depth: 1, name: "bbb" })
  useSelectionStore.getState().clearSelection()
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => ElementsListPanel({}), root)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20))
  const press = (target: EventTarget, key: string) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  try {
    await flush()
    // On the window (focus somewhere else): the list does nothing.
    press(window, "ArrowDown"); press(window, "Enter"); await flush()
    expect(useSelectionStore.getState().selectedElementIds).toEqual([])
    // In the panel: arrows move the highlight, Enter selects the highlighted element.
    const list = root.querySelector('[tabindex="0"]') as HTMLElement
    press(list, "ArrowDown"); press(list, "Enter"); await flush()
    expect(useSelectionStore.getState().selectedElementIds).toHaveLength(1)
    // And Esc is not the list's business any more: it does not clear the selection by itself.
    press(list, "Escape"); await flush()
    expect(useSelectionStore.getState().selectedElementIds).toHaveLength(1)
    void first; void second
  } finally { dispose(); root.remove(); useElementsStore.setState({ elements: [] }); useSelectionStore.getState().clearSelection() }
})

/**
 * The one rule of the keyboard: a screen never listens to the whole window for its commands, it registers a handler for a
 * catalog command (`app.keys.register`). The files below listen on the window or the document for something that is not a
 * command - a dialog or a menu closing itself, a key held down, the shortcut recorder - and each says why.
 */
const WIDGET_LISTENERS: Readonly<Record<string, string>> = {
  "features/cad/hooks/createTransformControls.ts": "Shift and Ctrl held down while dragging (a held modifier, not a command)",
  "features/settings/components/keybindings-settings.tsx": "the shortcut recorder, which must see every key",
  "shared/ui/modal.tsx": "a modal closes on Esc and keeps the Tab focus inside",
  "shared/ui/dropdown-menu.tsx": "an open menu closes on Esc",
  "shared/components/title-bar.tsx": "an open menu closes on Esc",
  "shared/components/reference-navigation.tsx": "an open menu closes on Esc",
  "features/cam/components/CamModals.tsx": "the CAM dialogs close on Esc and keep the Tab focus inside",
  "features/ai/components/ContextDialog.tsx": "the context dialog closes on Esc",
  "features/ai/lib/dismiss.ts": "an assistant popover closes on Esc",
  "features/cad/components/UnifiedLibraryModal.tsx": "the library dialog closes on Esc",
  "features/cad/components/EnhancedToolbar.tsx": "the toolbar's popups close on Esc",
  "features/plugins/screens/plugins.tsx": "a plugin dialog closes on Esc"
}

test("no screen listens to the whole window for its own commands", async () => {
  const { readdirSync, statSync } = await import("node:fs")
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
  const offenders: string[] = []
  const used = new Set<string>()
  for (const file of walk(SRC)) {
    const relative = file.slice(SRC.length + 1)
    if (relative.startsWith("shared/keybindings/")) continue
    if (!/(window|document)\.addEventListener\(\s*["']keydown["']/.test(readFileSync(file, "utf8"))) continue
    if (relative in WIDGET_LISTENERS) used.add(relative)
    else offenders.push(relative)
  }
  expect(offenders, "register a catalog command with app.keys.register instead of listening to keydown").toEqual([])
  // The list stays honest: an entry whose listener is gone is removed.
  expect([...used].sort()).toEqual(Object.keys(WIDGET_LISTENERS).sort())
})

test("Settings > Keyboard exports the keymap as a file and imports it back, and refuses a file that is not one", async () => {
  installDom("http://localhost/settings")
  const { render } = await import("solid-js/web")
  const { AppProvider, createAppState } = await import("../src/shared/state/context.ts")
  const { fakeRuntime } = await import("../src/shared/state/client.ts")
  const { KeybindingsSettings } = await import("../src/features/settings/components/keybindings-settings.tsx")
  const connection = fakeRuntime()
  const state = createAppState({ client: connection.client, runtime: connection.runtime })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => AppProvider({ state, get children() { return KeybindingsSettings() } }), root)
  const flush = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))
  // The download goes through an anchor and a blob URL: capture what would be written.
  const written: Blob[] = []
  const nativeCreate = URL.createObjectURL
  const nativeRevoke = URL.revokeObjectURL
  const proto = window.HTMLAnchorElement.prototype as unknown as { click: () => void }
  const nativeClick = proto.click
  ;(URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = (blob) => { written.push(blob); return "blob:keys" }
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined
  proto.click = function () { /* the download */ }
  const button = (label: string) => [...root.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label) as HTMLButtonElement
  try {
    state.keys.rebind("cad.copy", ["Mod+Shift+C"])
    state.keys.rebind("file.save", [])
    await flush()
    button("Export").click()
    await flush(80)
    expect(written).toHaveLength(1)
    const exported = JSON.parse(await written[0]!.text())
    expect(exported.format).toBe("cadcamfun-keybindings")
    expect(exported.overrides).toEqual({ "cad.copy": ["Mod+Shift+C"], "file.save": [] })

    button("Reset all").click()
    await flush()
    expect(state.keys.keymap().overrides).toEqual({})

    // Import the exported file through the file input.
    const input = root.querySelector('input[type="file"]') as HTMLInputElement
    const choose = async (text: string) => {
      Object.defineProperty(input, "files", { value: [new File([text], "keys.json", { type: "application/json" })], configurable: true })
      input.dispatchEvent(new window.Event("change", { bubbles: true }))
      await flush(80)
    }
    await choose(JSON.stringify(exported))
    expect(state.keys.keymap().entry("cad.copy")!.chords.map((chord) => chord.key)).toEqual(["c"])
    expect(state.keys.keymap().entry("cad.copy")!.chords[0]!.shift).toBe(true)
    expect(state.keys.keymap().entry("file.save")!.chords).toEqual([])

    // A file that is not a keymap changes nothing.
    await choose("{ not a keymap")
    await choose('{"overrides": 7}')
    expect(state.keys.keymap().entry("file.save")!.chords).toEqual([])
    expect(state.keys.keymap().entry("cad.copy")!.customised).toBe(true)
  } finally {
    proto.click = nativeClick; URL.createObjectURL = nativeCreate; URL.revokeObjectURL = nativeRevoke
    dispose(); state.dispose(); root.remove()
  }
})
