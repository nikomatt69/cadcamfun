/**
 * Editor state that is *not* a document: the active tool, the selection and the
 * undo/redo stack (spec 06-desktop-ui.md §1, §2).
 *
 * The document itself is owned by the viewport (WP7); this store keeps the command
 * history from `state/history.ts` and the tool id, so the palette, the shortcuts and
 * the status bar can all read the same source of truth.
 */
import { createSignal, type Accessor, type Setter } from "solid-js"
import type { Drawing, Solid } from "@cadcamfun/core"
import { createHistory, type History } from "./history.ts"
import type { Command } from "./commands.ts"

/** Tool ids, mirroring the viewport tool registry (`viewport/editor2d/tools`). */
export const EDITOR_TOOLS = [
  "select",
  "line",
  "rectangle",
  "circle",
  "ellipse",
  "polyline",
  "arc",
  "text",
  "dimension",
  "move",
  "rotate",
  "scale",
  "mirror",
  "offset",
  "trim",
  "fillet",
  "chamfer"
] as const
export type EditorTool = (typeof EDITOR_TOOLS)[number]

export interface EditorState {
  /** The document as the editor sees it (the history's `present`). */
  readonly drawing: Accessor<Drawing>
  readonly tool: Accessor<EditorTool>
  readonly setTool: Setter<EditorTool>
  readonly history: Accessor<History>
  readonly canUndo: Accessor<boolean>
  readonly canRedo: Accessor<boolean>
  readonly undoLabels: Accessor<ReadonlyArray<string>>
  /** Runs a command through the bounded history; the source document is untouched. */
  apply(command: Command): Drawing
  undo(): Drawing
  redo(): Drawing
  /** Loads a different document (opening a drawing) and forgets the old history. */
  load(drawing: Drawing): void
  /** Entities the current selection touches; the viewport renders this. */
  readonly selection: Accessor<ReadonlyArray<string>>
  setSelection(ids: ReadonlyArray<string>): void
  /** 3D solids in the scene; managed in parallel to the 2D drawing history. */
  readonly solids: Accessor<ReadonlyArray<Solid>>
  /** Solid ids selected in the 3D viewport. */
  readonly solidSelection: Accessor<ReadonlyArray<number>>
  setSolidSelection(indices: ReadonlyArray<number>): void
  /** Adds a new solid; the caller decides whether to commit the source profile too. */
  addSolid(solid: Solid): number
  /** Removes a solid by its index in `solids()`. */
  removeSolid(index: number): void
  /** Replaces the whole solids list (paste, import). */
  setSolids(solids: ReadonlyArray<Solid>): void
  /** Clears selection. */
  clearSolidSelection(): void
}

export const createEditorState = (initial: Drawing): EditorState => {
  const [history, setHistory] = createSignal<History>(createHistory(initial))
  const [tool, setTool] = createSignal<EditorTool>("select")
  const [selection, setSelection] = createSignal<ReadonlyArray<string>>([])
  const [solids, setSolids] = createSignal<ReadonlyArray<Solid>>([])
  const [solidSelection, setSolidSelection] = createSignal<ReadonlyArray<number>>([])
  const commit = (next: History): Drawing => {
    setHistory(next)
    return next.state.present
  }
  return {
    drawing: () => history().state.present,
    history,
    tool,
    setTool,
    canUndo: () => history().canUndo,
    canRedo: () => history().canRedo,
    undoLabels: () => history().state.done,
    selection,
    setSelection: (ids) => setSelection([...ids]),
    apply: (command) => commit(history().apply(command)),
    undo: () => commit(history().undo()),
    redo: () => commit(history().redo()),
    load: (drawing) => {
      setHistory(createHistory(drawing))
      setSelection([])
    },
    solids,
    solidSelection,
    setSolidSelection: (indices) => setSolidSelection([...indices]),
    addSolid: (solid) => {
      const next = [...solids(), solid]
      setSolids(next)
      return next.length - 1
    },
    removeSolid: (index) => {
      setSolids(solids().filter((_, i) => i !== index))
      setSolidSelection(solidSelection().filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)))
    },
    setSolids,
    clearSolidSelection: () => setSolidSelection([])
  }
}
