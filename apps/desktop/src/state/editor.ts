/**
 * Editor state that is *not* a document: the active tool, the selection and the
 * undo/redo stack (spec 06-desktop-ui.md §1, §2).
 *
 * The document itself is owned by the viewport (WP7); this store keeps the command
 * history from `state/history.ts` and the tool id, so the palette, the shortcuts and
 * the status bar can all read the same source of truth.
 */
import { createSignal, type Accessor, type Setter } from "solid-js"
import type { Drawing } from "@cadcamfun/core"
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
  "mirror"
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
}

export const createEditorState = (initial: Drawing): EditorState => {
  const [history, setHistory] = createSignal<History>(createHistory(initial))
  const [tool, setTool] = createSignal<EditorTool>("select")
  const [selection, setSelection] = createSignal<ReadonlyArray<string>>([])
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
    }
  }
}
