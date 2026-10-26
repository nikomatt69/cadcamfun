/**
 * The command catalog: every keyboard command the app has, with its scope and default chords.
 *
 * One table for the shell, the CAD page and the CAM page, so the shortcuts dialog, the command palette, the settings
 * screen and the dispatcher cannot disagree. A command is *what* happens (`edit.undo`); the page that is open decides
 * *how* by registering a handler for the id (`controller.ts`). The same id means the same thing on both pages
 * (`file.save` saves the drawing in CAD and the program in CAM), which is what keeps the two keymaps coherent.
 *
 * Ids are `domain.action`; the label of `id` is the i18n key `keys.cmd.<id>`.
 */

/** Where a command is live. `global` works on every screen; `cad` and `cam` only while that page is the active activity. */
export type Scope = "global" | "cad" | "cam"

export const SCOPES: ReadonlyArray<Scope> = ["global", "cad", "cam"]

export type CommandGroup =
  | "navigation" | "file" | "edit" | "selection" | "view" | "snap" | "transform" | "boolean" | "simulation" | "panels" | "help"

export const GROUPS: ReadonlyArray<CommandGroup> = [
  "navigation", "file", "edit", "selection", "view", "snap", "transform", "boolean", "simulation", "panels", "help"
]

export interface CommandDef {
  readonly id: string
  readonly scope: Scope
  readonly group: CommandGroup
  /** Canonical chords bound out of the box; the user's overrides replace the whole list. */
  readonly defaults: ReadonlyArray<string>
  /**
   * Fires while the user types in a field. Only meaningful for chords with a command modifier, and only for commands
   * that are not text editing (Mod+C/V/X/Z/A stay with the field).
   */
  readonly inText?: boolean
  /** Fires while a dialog is open (the palette and the help dialog toggle themselves). */
  readonly overDialog?: boolean
  /** Fires on auto-repeat while the key is held (zoom, stepping). */
  readonly repeat?: boolean
}

const def = (
  id: string, scope: Scope, group: CommandGroup, defaults: ReadonlyArray<string>,
  flags: Pick<CommandDef, "inText" | "overDialog" | "repeat"> = {}
): CommandDef => ({ id, scope, group, defaults, ...flags })

/** The snap kinds of the Snap Settings panel (`SnapType`), each with an optional default chord. */
export const SNAP_TYPES: ReadonlyArray<readonly [string, string | undefined]> = [
  ["grid", "Alt+G"], ["endpoint", "Alt+E"], ["midpoint", "Alt+M"], ["intersection", "Alt+I"], ["center", "Alt+C"],
  ["quadrant", "Alt+Q"], ["nearest", "Alt+N"], ["tangent", "Alt+T"], ["perpendicular", "Alt+P"],
  ["parallel", undefined], ["equidistant", undefined], ["horizontal", undefined], ["vertical", undefined]
]

export const COMMANDS: ReadonlyArray<CommandDef> = [
  // ------------------------------------------------------------------------------------------- shell
  def("app.palette", "global", "navigation", ["Mod+K"], { inText: true, overDialog: true }),
  def("app.go.projects", "global", "navigation", ["Mod+Shift+P"], { inText: true }),
  def("app.go.cad", "global", "navigation", ["Mod+Alt+1"], { inText: true }),
  def("app.go.cam", "global", "navigation", ["Mod+Alt+2"], { inText: true }),
  def("app.go.library", "global", "navigation", ["Mod+Alt+3"], { inText: true }),
  def("app.go.settings", "global", "navigation", ["Mod+,"], { inText: true }),
  def("app.toggleAi", "global", "panels", ["Mod+J"], { inText: true }),
  def("app.shortcuts", "global", "help", ["?", "F1"], { overDialog: true }),

  // ------------------------------------------------------------------------------------------- shared by both pages
  def("file.save", "global", "file", ["Mod+S"], { inText: true }),
  def("file.import", "global", "file", ["Mod+Shift+O"], { inText: true }),
  def("file.export", "global", "file", ["Mod+Shift+E"], { inText: true }),
  def("edit.undo", "global", "edit", ["Mod+Z"]),
  def("edit.redo", "global", "edit", ["Mod+Shift+Z", "Mod+Y"]),
  def("edit.cancel", "global", "edit", ["Escape"]),
  def("view.zoomIn", "global", "view", ["=", "+"], { repeat: true }),
  def("view.zoomOut", "global", "view", ["-"], { repeat: true }),
  def("view.zoomFit", "global", "view", ["F", "Mod+0"]),

  // ------------------------------------------------------------------------------------------- CAD page
  def("cad.delete", "cad", "selection", ["Delete", "Backspace"]),
  def("cad.copy", "cad", "selection", ["Mod+C"]),
  def("cad.paste", "cad", "selection", ["Mod+V"]),
  def("cad.duplicate", "cad", "selection", ["Mod+D"]),
  def("cad.selectAll", "cad", "selection", ["Mod+A"]),
  def("cad.deselectAll", "cad", "selection", ["Mod+Shift+A"]),
  def("cad.transform.translate", "cad", "transform", ["G"]),
  def("cad.transform.rotate", "cad", "transform", ["R"]),
  def("cad.transform.scale", "cad", "transform", ["S"]),
  def("cad.transform.axisX", "cad", "transform", ["X"]),
  def("cad.transform.axisY", "cad", "transform", ["Y"]),
  def("cad.transform.axisZ", "cad", "transform", ["Z"]),
  def("cad.transform.commit", "cad", "transform", ["Enter"]),
  def("cad.view.mode3d", "cad", "view", ["Alt+1"]),
  def("cad.view.mode2d", "cad", "view", ["Alt+2"]),
  def("cad.view.front", "cad", "view", ["Alt+Shift+F"]),
  def("cad.view.back", "cad", "view", ["Alt+Shift+K"]),
  def("cad.view.left", "cad", "view", ["Alt+Shift+L"]),
  def("cad.view.right", "cad", "view", ["Alt+Shift+R"]),
  def("cad.view.top", "cad", "view", ["Alt+Shift+T"]),
  def("cad.view.bottom", "cad", "view", ["Alt+Shift+B"]),
  def("cad.view.iso", "cad", "view", ["Alt+Shift+I"]),
  def("cad.view.projection", "cad", "view", ["Alt+Shift+O"]),
  def("cad.view.fourViews", "cad", "view", ["Alt+Shift+4"]),
  def("cad.view.grid", "cad", "view", ["Mod+G"]),
  def("cad.view.axes", "cad", "view", ["Alt+A"]),
  def("cad.view.fullscreen", "cad", "view", ["F11", "Alt+F"]),
  def("cad.snap.toggle", "cad", "snap", ["Alt+S"]),
  ...SNAP_TYPES.map(([type, chord]) => def(`cad.snap.type.${type}`, "cad", "snap", chord === undefined ? [] : [chord])),
  def("cad.boolean.union", "cad", "boolean", ["Mod+Alt+U"]),
  def("cad.boolean.subtract", "cad", "boolean", ["Mod+Alt+D"]),
  def("cad.boolean.intersect", "cad", "boolean", ["Mod+Alt+I"]),

  // ------------------------------------------------------------------------------------------- CAM page
  def("cam.tab.editor", "cam", "view", ["Alt+1"], { inText: true }),
  def("cam.tab.toolpath", "cam", "view", ["Alt+2"], { inText: true }),
  def("cam.tab.post", "cam", "view", ["Alt+3"], { inText: true }),
  def("cam.process", "cam", "file", ["Mod+Enter"], { inText: true }),
  def("cam.simulation.toggle", "cam", "simulation", ["Space"]),
  def("cam.simulation.rewind", "cam", "simulation", ["Home"]),
  def("cam.simulation.stepForward", "cam", "simulation", ["."], { repeat: true }),
  def("cam.simulation.stepBack", "cam", "simulation", [","], { repeat: true }),
  def("cam.sidebar.toggle", "cam", "panels", ["Mod+Shift+B"], { inText: true }),
  def("cam.library.open", "cam", "panels", ["Mod+L"], { inText: true }),
  def("cam.history.open", "cam", "panels", ["Mod+Shift+H"], { inText: true })
]

const BY_ID: ReadonlyMap<string, CommandDef> = new Map(COMMANDS.map((command) => [command.id, command]))

export const commandById = (id: string): CommandDef | undefined => BY_ID.get(id)

/** The i18n key of a command's label. */
export const labelKeyOf = (id: string): string => `keys.cmd.${id}`

/** The i18n key of a group's heading. */
export const groupKeyOf = (group: CommandGroup): string => `keys.group.${group}`

/** Whether two scopes can be live at the same time (so a chord on both would be ambiguous). */
export const scopesOverlap = (a: Scope, b: Scope): boolean => a === b || a === "global" || b === "global"

/** Scopes live while `activity` is the active screen. */
export const liveScopes = (activity: string): ReadonlyArray<Scope> =>
  activity === "cad" ? ["global", "cad"] : activity === "cam" ? ["global", "cam"] : ["global"]

/**
 * The items of the native menu bar (`src-tauri/src/menu.rs`) and the command each one runs. On macOS the menu bar takes
 * its accelerators before the webview sees the key, so a chord listed here never reaches the dispatcher: the shell
 * routes the menu click to the command instead, and no default of the catalog may reuse a chord for another command.
 * `command` is undefined for the items that belong to the shell itself (new, open, the panels).
 */
export const NATIVE_MENU: ReadonlyArray<{ readonly id: string; readonly chord: string | undefined; readonly command: string | undefined }> = [
  { id: "file.new", chord: "Mod+N", command: undefined },
  { id: "file.open", chord: "Mod+O", command: undefined },
  { id: "file.save", chord: "Mod+S", command: "file.save" },
  { id: "file.export_gcode", chord: "Mod+Shift+E", command: "file.export" },
  { id: "edit.undo", chord: undefined, command: "edit.undo" },
  { id: "edit.redo", chord: undefined, command: "edit.redo" },
  { id: "view.zoom_in", chord: "Mod+=", command: "view.zoomIn" },
  { id: "view.zoom_out", chord: "Mod+-", command: "view.zoomOut" },
  { id: "view.zoom_fit", chord: "Mod+0", command: "view.zoomFit" },
  { id: "view.preset_top", chord: "Mod+1", command: "cad.view.top" },
  { id: "view.preset_front", chord: "Mod+2", command: "cad.view.front" },
  { id: "view.preset_right", chord: "Mod+3", command: "cad.view.right" },
  { id: "view.preset_iso", chord: "Mod+4", command: "cad.view.iso" },
  { id: "view.toggle_left_panel", chord: "Mod+B", command: undefined },
  { id: "view.toggle_right_panel", chord: "Mod+Alt+B", command: undefined },
  { id: "view.toggle_console", chord: "Mod+J", command: "app.toggleAi" }
]

/** The command a native menu id runs, or `undefined` when the shell handles that item itself. */
export const menuCommand = (menuId: string): string | undefined => NATIVE_MENU.find((item) => item.id === menuId)?.command
