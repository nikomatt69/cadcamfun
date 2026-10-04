import { Cause, Effect, Exit } from "effect"
import { createContext, createMemo, createSignal, useContext } from "solid-js"
import { Commands, Doc, History, type CadDocument, type Command, type Element } from "@cadcamfun/core"
import type { Setup } from "@cadcamfun/cam"
import type { GcodeResult, Project } from "@cadcamfun/server"

export type ToolMode = "select" | "pan" | "line" | "rectangle" | "circle" | "polyline" | "point"

const errorText = <E>(exit: Exit.Exit<unknown, E>) =>
  Exit.isFailure(exit)
    ? Cause.squash(exit.cause) instanceof Error
      ? (Cause.squash(exit.cause) as Error).message
      : String(Cause.squash(exit.cause))
    : ""

/**
 * Editor state. The document lives in an immutable undo history from `@cadcamfun/core`;
 * Solid signals only hold references, so every change is a cheap structural update.
 */
export const createEditor = (project: Project) => {
  const [history, setHistory] = createSignal(History.make(project.document))
  const [setup, setSetupSignal] = createSignal<Setup>(project.setup)
  const [selection, setSelection] = createSignal<ReadonlySet<string>>(new Set<string>())
  const [mode, setMode] = createSignal<ToolMode>("select")
  const [grid, setGrid] = createSignal(5)
  const [snap, setSnap] = createSignal(true)
  const [output, setOutput] = createSignal<GcodeResult | undefined>()
  const [notice, setNotice] = createSignal<{ kind: "error" | "info"; text: string } | undefined>()
  const [view3d, setView3d] = createSignal(false)

  const doc = createMemo(() => history().present)
  const selected = createMemo<ReadonlyArray<Element>>(() => doc().elements.filter((e) => selection().has(e.id)))

  const notify = (kind: "error" | "info", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice((n) => (n?.text === text ? undefined : n)), 4000)
  }

  const execute = (command: Command): boolean => {
    const exit = Effect.runSyncExit(History.execute(history(), command))
    if (Exit.isFailure(exit)) {
      notify("error", errorText(exit))
      return false
    }
    setHistory(exit.value)
    setOutput(undefined)
    const ids = new Set<string>(exit.value.present.elements.map((e) => e.id))
    setSelection((s) => new Set([...s].filter((id) => ids.has(id))))
    return true
  }

  const add = (input: Doc.ElementInput) => {
    const element = Doc.instantiate(doc(), input)
    if (execute(Commands.addElements([element]))) setSelection(new Set([element.id]))
  }

  const setSetup = (f: (s: Setup) => Setup) => {
    setSetupSignal(f)
    setOutput(undefined)
  }

  /** Accept a document produced elsewhere (AI agent) as one undoable step. */
  const commitDocument = (next: CadDocument) => {
    setHistory((h) => History.commit(h, next))
    setOutput(undefined)
  }

  return {
    project,
    history,
    doc,
    setup,
    setSetup,
    selection,
    setSelection,
    selected,
    mode,
    setMode,
    grid,
    setGrid,
    snap,
    setSnap,
    output,
    setOutput,
    notice,
    notify,
    view3d,
    setView3d,
    execute,
    add,
    commitDocument,
    undo: () => setHistory(History.undo),
    redo: () => setHistory(History.redo),
    canUndo: () => History.canUndo(history()),
    canRedo: () => History.canRedo(history()),
    removeSelected: () => {
      const ids = [...selection()]
      if (ids.length > 0) execute(Commands.removeElements(ids as never))
    },
  }
}

export type Editor = ReturnType<typeof createEditor>

export const EditorContext = createContext<Editor>()

export const useEditor = (): Editor => {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error("useEditor outside EditorContext")
  return editor
}
