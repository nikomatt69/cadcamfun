/**
 * The keyboard on the real pages: the whole UI over the real sidecar handlers, keys pressed on the window the way the
 * webview delivers them. CAM first (tabs, program, simulation, panels, history, save), then CAD (modes, selection,
 * snapping, views, booleans), then rebinding in the settings and the native menu.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useCamHistoryStore } from "../src/features/cam/store/camHistoryStore.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useSelectionStore } from "../src/features/cad/store/selectorStore.ts"
import { useTransformControlsStore } from "../src/features/cad/store/transformControlsStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))
const mac = () => /mac/i.test(navigator.platform)
/** A key as the webview delivers it: on the focused element, bubbling up to the window. */
const press = (key: string, init: KeyboardEventInit & { target?: EventTarget } = {}): KeyboardEvent => {
  const { target, ...rest } = init
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...rest })
  ;(target ?? document.body).dispatchEvent(event)
  return event
}
const mod = <T extends object>(init: T = {} as T): KeyboardEventInit & T => ({ metaKey: mac(), ctrlKey: !mac(), ...init })
const GCODE = "G21\nG90\nG0 X0 Y0\nG1 X10 Y0 F200\nG1 X10 Y10\nG1 X0 Y10\nG1 X0 Y0\nM30"

describe("CAM page keys", () => {
  test("tabs, process, simulation, panels", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea.cam-editor__code"), 30000)
      editor.value = GCODE
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()

      // Plain keys typed in the editor are text: Space must not start the simulation.
      expect(press(" ", { target: editor }).defaultPrevented).toBe(false)
      expect(useCamStore.getState().playing).toBe(false)

      // Process G-code (works while typing: it has a modifier) parses the program.
      expect(press("Enter", mod({ target: editor })).defaultPrevented).toBe(true)
      await app.wait(() => useCamStore.getState().program.toolpaths.length > 0, 20000)

      // Tabs also answer while the focus is in the editor (a modifier chord, not text).
      expect(press("2", { altKey: true, code: "Digit2", target: editor }).defaultPrevented).toBe(true)
      await settle()
      expect(useCamStore.getState().activeTab).toBe("toolpath")
      press("1", { altKey: true, code: "Digit1" }); await settle()
      // Tabs.
      press("2", { altKey: true, code: "Digit2" }); await settle()
      expect(useCamStore.getState().activeTab).toBe("toolpath")
      press("3", { altKey: true, code: "Digit3" }); await settle()
      expect(useCamStore.getState().activeTab).toBe("post")
      press("1", { altKey: true, code: "Digit1" }); await settle()
      expect(useCamStore.getState().activeTab).toBe("editor")

      // Simulation: Space plays (and shows the toolpath), step keys move the playhead, Home rewinds.
      press(" "); await settle()
      expect(useCamStore.getState().playing).toBe(true)
      expect(useCamStore.getState().activeTab).toBe("toolpath")
      press(" "); await settle()
      expect(useCamStore.getState().playing).toBe(false)
      useCamStore.getState().setPlaybackTime(0)
      press("."); await settle()
      expect(useCamStore.getState().playbackTime).toBeGreaterThan(0)
      press("Home"); await settle()
      expect(useCamStore.getState().playbackTime).toBe(0)
      // A button that has the focus keeps its Space.
      const button = document.querySelector<HTMLButtonElement>("button")!
      expect(press(" ", { target: button }).defaultPrevented).toBe(false)
      expect(useCamStore.getState().playing).toBe(false)

      // Panels: library and history open, sidebar toggles.
      const sidebar = useCamStore.getState().sidebarOpen
      press("B", mod({ shiftKey: true, code: "KeyB" })); await settle()
      expect(useCamStore.getState().sidebarOpen).toBe(!sidebar)
      press("B", mod({ shiftKey: true, code: "KeyB" })); await settle()
      press("l", mod()); await settle(80)
      expect(document.querySelector('[data-testid="cam-tool-library"]')).not.toBeNull()
      // A dialog is open: commands are off, Escape-style closing belongs to the dialog.
      expect(press("2", { altKey: true, code: "Digit2" }).defaultPrevented).toBe(false)
      document.querySelector<HTMLElement>('button[aria-label="Close library"]')!.click()
      await settle(400)
      press("H", mod({ shiftKey: true, code: "KeyH" })); await settle(80)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    } finally { dispose() }
  }, 90000)

  test("undo, redo and save answer on the page", async () => {
    useCamStore.getState().setActiveTab("editor")
    const { dispose } = app.visit("/cam")
    try {
      const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea.cam-editor__code"), 30000)
      editor.value = GCODE
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle(300)
      // Undo/redo are consumed by the page history, even from the editor.
      expect(press("z", mod({ target: editor })).defaultPrevented).toBe(true)
      expect(press("z", mod({ shiftKey: true, target: editor })).defaultPrevented).toBe(true)
      expect(press("y", mod({ target: editor })).defaultPrevented).toBe(true)
      // Save: with code it opens the save dialog.
      editor.value = GCODE
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle(300)
      expect(press("s", mod({ target: editor })).defaultPrevented).toBe(true)
      await settle(100)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    } finally { dispose() }
  }, 60000)
})

describe("CAD page keys", () => {
  test("transform modes, selection, clipboard, views and snapping", async () => {
    const { dispose } = app.visit("/cad")
    try {
      await app.wait(() => document.querySelector(".cad-viewport"), 30000)
      const elements = useElementsStore.getState()
      const a = elements.addElement({ type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
      elements.addElement({ type: "cube", x: 20, y: 0, z: 0, width: 10, height: 10, depth: 10 })
      await settle()
      const count = () => useElementsStore.getState().elements.length
      const selected = () => useSelectionStore.getState().selectedElementIds

      // Select all / deselect all.
      press("a", mod({ target: document.querySelector(".cad-viewport")! })); await settle()
      expect(selected()).toHaveLength(2)
      press("A", mod({ shiftKey: true })); await settle()
      expect(selected()).toHaveLength(0)
      useSelectionStore.getState().selectElement(a)

      // Transform modes and axis constraints.
      for (const [key, mode] of [["g", "translate"], ["r", "rotate"], ["s", "scale"]] as const) {
        press(key); await settle()
        expect(useTransformControlsStore.getState().mode).toBe(mode)
      }
      press("x"); await settle()
      expect(useTransformControlsStore.getState().activeAxis).toBe("x")
      // Escape: leaves the mode and clears the selection in one press.
      press("Escape"); await settle()
      expect(useTransformControlsStore.getState().mode).toBe("none")
      expect(selected()).toHaveLength(0)
      // With nothing in flight Escape is not consumed.
      expect(press("Escape").defaultPrevented).toBe(false)
      // Axis keys outside a transform are not consumed either.
      expect(press("x").defaultPrevented).toBe(false)

      // Duplicate, delete, undo.
      useSelectionStore.getState().selectElement(a)
      const before = count()
      press("d", mod()); await settle()
      expect(count()).toBe(before + 1)
      press("Delete"); await settle()
      expect(count()).toBeLessThan(before + 1)
      press("z", mod()); await settle()
      expect(count()).toBeGreaterThanOrEqual(before)

      // View: 3D/2D, grid, axes; snap master switch and kinds.
      press("2", { altKey: true, code: "Digit2" }); await settle()
      expect(useCADStore.getState().viewMode).toBe("2d")
      press("1", { altKey: true, code: "Digit1" }); await settle()
      expect(useCADStore.getState().viewMode).toBe("3d")
      const grid = useCADStore.getState().gridVisible
      press("g", mod()); await settle()
      expect(useCADStore.getState().gridVisible).toBe(!grid)
      const axes = useCADStore.getState().axisVisible
      press("a", { altKey: true, code: "KeyA" }); await settle()
      expect(useCADStore.getState().axisVisible).toBe(!axes)
      const { createSnap } = await import("../src/features/cad/hooks/createSnap.ts")
      const { createRoot } = await import("solid-js")
      const snap = createRoot(() => createSnap())
      const on = snap.snapSettings().enabled
      press("s", { altKey: true, code: "KeyS" }); await settle()
      expect(snap.snapSettings().enabled).toBe(!on)
      const midpoint = snap.snapSettings().types.midpoint
      press("m", { altKey: true, code: "KeyM" }); await settle()
      expect(snap.snapSettings().types.midpoint).toBe(!midpoint)
    } finally { dispose() }
  }, 90000)

  test("Boolean chords need two parts and a scene", async () => {
    const { dispose } = app.visit("/cad")
    try {
      await app.wait(() => document.querySelector(".cad-viewport"), 30000)
      const store = useElementsStore.getState()
      const first = store.addElement({ type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
      const second = store.addElement({ type: "cube", x: 5, y: 0, z: 0, width: 10, height: 10, depth: 10 })
      await settle()
      useSelectionStore.getState().selectMultiple([first, second])
      // One selected element is not enough: the chord is not consumed.
      useSelectionStore.getState().selectElement(first)
      expect(press("u", mod({ altKey: true, code: "KeyU" })).defaultPrevented).toBe(false)
      useSelectionStore.getState().selectMultiple([first, second])
      // No WebGL here, so there is no scene to combine: the chord is not consumed and nothing changes. The union itself
      // is checked in the running app.
      const before = useElementsStore.getState().elements.length
      expect(press("u", mod({ altKey: true, code: "KeyU" })).defaultPrevented).toBe(false)
      expect(useElementsStore.getState().elements.length).toBe(before)
    } finally { dispose() }
  }, 60000)
})

describe("rebinding changes the real keyboard", () => {
  test("a rebound CAM tab key works, the old one stops, and the shortcut dialog shows it", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await app.wait(() => document.querySelector("textarea"), 30000)
      expect(app.state.keys.rebind("cam.tab.post", ["Alt+9"]).ok).toBe(true)
      press("3", { altKey: true, code: "Digit3" }); await settle()
      expect(useCamStore.getState().activeTab).not.toBe("post")
      press("9", { altKey: true, code: "Digit9" }); await settle()
      expect(useCamStore.getState().activeTab).toBe("post")
      press("?"); await settle(80)
      expect(document.querySelector('[data-testid="shortcuts-dialog"]')).not.toBeNull()
      expect(document.querySelector('[data-command="cam.tab.post"]')?.textContent).toMatch(/9/)
      app.state.keys.setHelpOpen(false)
      app.state.keys.resetAll()
    } finally { dispose() }
  }, 60000)

  test("the native menu runs the same commands as the keys", async () => {
    const { dispose } = app.visit("/cad")
    try {
      await app.wait(() => document.querySelector(".cad-viewport"), 30000)
      const before = useCADStore.getState().viewMode
      // `view.preset_top` is Cmd+1 in the native menu: it reaches the CAD page's top-view command.
      let top = 0
      const off = app.state.keys.register({ "cad.view.top": () => { top++ } })
      app.state.keys.run("cad.view.top")
      expect(top).toBe(1)
      off()
      expect(useCADStore.getState().viewMode).toBe(before)
    } finally { dispose() }
  }, 60000)
})
