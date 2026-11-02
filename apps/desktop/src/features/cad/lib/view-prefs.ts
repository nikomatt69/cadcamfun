import { DEFAULT_DISPLAY_MODE, isDisplayMode, type DisplayMode } from "./display-mode.ts"

/**
 * The look of the canvas the person chose and expects to find again: the display mode (shaded, hidden line, x-ray...), whether the
 * sketches a feature uses are shown, whether the sheet-metal flat pattern overlay is on. Kept per project in the browser storage of the
 * app (and as "the last used" for a drawing that is not in a project yet), written on every change and restored when the editor starts
 * and when a project is opened. Presentation only: nothing here touches the drawing, so it never marks the document as changed.
 *
 * The storage is never trusted: every access is inside try/catch (a private window, blocked site data, a full quota, a test without a DOM)
 * and a stored value is validated before it is applied, so a damaged or older entry is ignored instead of breaking the canvas.
 */
export interface ViewPrefs {
  readonly displayMode: DisplayMode
  readonly showSketches: boolean
  readonly showFlatPattern: boolean
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = { displayMode: DEFAULT_DISPLAY_MODE, showSketches: false, showFlatPattern: false }

/** The scope of a drawing that belongs to no project, and the "last used" slot every change is also written to. */
export const SESSION_SCOPE = "session"
const PREFIX = "cadcamfun.cad.view.v1:"

export const scopeOf = (projectId: string | null | undefined): string => (typeof projectId === "string" && projectId !== "" ? `project:${projectId}` : SESSION_SCOPE)
export const viewPrefsKey = (scope: string): string => `${PREFIX}${scope}`

const defaultStorage = (): Storage | undefined => {
  try { return globalThis.localStorage } catch { return undefined }
}

/** The stored preferences of a scope: only the fields that are present and valid (none for a missing, damaged or blocked entry). */
export const readViewPrefs = (scope: string, storage: Pick<Storage, "getItem"> | undefined = defaultStorage()): Partial<ViewPrefs> => {
  if (storage === undefined) return {}
  try {
    const raw = storage.getItem(viewPrefsKey(scope))
    if (raw === null) return {}
    const value = JSON.parse(raw) as Record<string, unknown> | null
    if (typeof value !== "object" || value === null) return {}
    return {
      ...(isDisplayMode(value["displayMode"]) ? { displayMode: value["displayMode"] } : {}),
      ...(typeof value["showSketches"] === "boolean" ? { showSketches: value["showSketches"] } : {}),
      ...(typeof value["showFlatPattern"] === "boolean" ? { showFlatPattern: value["showFlatPattern"] } : {})
    }
  } catch {
    return {}
  }
}

/** Stores the preferences of a scope. Returns false when the storage refused; the choice then lasts until the app is closed. */
export const writeViewPrefs = (scope: string, prefs: ViewPrefs, storage: Pick<Storage, "setItem"> | undefined = defaultStorage()): boolean => {
  if (storage === undefined) return false
  try {
    storage.setItem(viewPrefsKey(scope), JSON.stringify({ displayMode: prefs.displayMode, showSketches: prefs.showSketches, showFlatPattern: prefs.showFlatPattern }))
    return true
  } catch {
    return false
  }
}

/** The part of a store the binding needs: reading, merging into and watching its state. */
export interface WatchableStore<T> {
  getState(): T
  setState(partial: Partial<T>): void
  subscribe(listener: (state: T, previous: T) => void): () => void
}

const prefsOf = (state: ViewPrefs): ViewPrefs => ({ displayMode: state.displayMode, showSketches: state.showSketches, showFlatPattern: state.showFlatPattern })
const same = (a: ViewPrefs, b: ViewPrefs): boolean => a.displayMode === b.displayMode && a.showSketches === b.showSketches && a.showFlatPattern === b.showFlatPattern

/**
 * Binds the canvas preferences to the storage. Starts by restoring the last used ones; when the open project changes it restores that
 * project's (a project without any inherits what is on screen, which becomes its own); from then on every change is written to the
 * current project and to the last-used slot. Returns the function that stops it.
 */
export const bindViewPrefs = (cad: WatchableStore<ViewPrefs>, document: WatchableStore<{ readonly projectId: string | null }>, storage: Pick<Storage, "getItem" | "setItem"> | undefined = defaultStorage()): (() => void) => {
  let scope = scopeOf(document.getState().projectId)
  const restore = (from: string): boolean => {
    const stored = readViewPrefs(from, storage)
    if (Object.keys(stored).length === 0) return false
    cad.setState(stored)
    return true
  }
  // The scope of a project that is already open, else the last used.
  if (!restore(scope) && scope !== SESSION_SCOPE) restore(SESSION_SCOPE)
  const stopCad = cad.subscribe((state, previous) => {
    const next = prefsOf(state)
    if (same(next, prefsOf(previous))) return
    writeViewPrefs(scope, next, storage)
    if (scope !== SESSION_SCOPE) writeViewPrefs(SESSION_SCOPE, next, storage)
  })
  const stopDocument = document.subscribe((state, previous) => {
    if (state.projectId === previous.projectId) return
    scope = scopeOf(state.projectId)
    if (!restore(scope)) writeViewPrefs(scope, prefsOf(cad.getState()), storage)
  })
  return () => { stopCad(); stopDocument() }
}
