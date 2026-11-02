import { describe, expect, test } from "bun:test"
import { useCADStore } from "../store/cadStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { bindViewPrefs, DEFAULT_VIEW_PREFS, readViewPrefs, scopeOf, SESSION_SCOPE, viewPrefsKey, writeViewPrefs, type ViewPrefs, type WatchableStore } from "./view-prefs.ts"

/** A store in a few lines, with the same `subscribe(listener)` contract the editor's stores have. */
const store = <T extends object>(initial: T): WatchableStore<T> => {
  let state = initial
  const listeners = new Set<(state: T, previous: T) => void>()
  return {
    getState: () => state,
    setState: (partial) => { const previous = state; state = { ...state, ...partial }; for (const listener of [...listeners]) listener(state, previous) },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  }
}
const memory = (): Storage & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) }, clear: () => data.clear(), key: () => null, length: 0 } as never
}
const prefs = (patch: Partial<ViewPrefs> = {}): ViewPrefs => ({ ...DEFAULT_VIEW_PREFS, ...patch })

describe("the stored look of the canvas", () => {
  test("what is written is what is read, per scope", () => {
    const storage = memory()
    expect(writeViewPrefs("project:a", prefs({ displayMode: "xray", showSketches: true }), storage)).toBe(true)
    expect(readViewPrefs("project:a", storage)).toEqual({ displayMode: "xray", showSketches: true, showFlatPattern: false })
    expect(readViewPrefs("project:b", storage)).toEqual({})
    expect(scopeOf("a")).toBe("project:a")
    expect(scopeOf(null)).toBe(SESSION_SCOPE)
    expect(scopeOf("")).toBe(SESSION_SCOPE)
  })

  test("damaged, unknown and foreign entries are ignored field by field", () => {
    const storage = memory()
    storage.setItem(viewPrefsKey("s"), "not json")
    expect(readViewPrefs("s", storage)).toEqual({})
    storage.setItem(viewPrefsKey("s"), JSON.stringify({ displayMode: "plaid", showSketches: "yes", showFlatPattern: true }))
    expect(readViewPrefs("s", storage)).toEqual({ showFlatPattern: true })
    storage.setItem(viewPrefsKey("s"), "42")
    expect(readViewPrefs("s", storage)).toEqual({})
    storage.setItem(viewPrefsKey("s"), "null")
    expect(readViewPrefs("s", storage)).toEqual({})
  })

  test("a storage that throws, or none at all, never breaks the canvas", () => {
    const hostile = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("quota") } }
    expect(readViewPrefs("s", hostile)).toEqual({})
    expect(writeViewPrefs("s", prefs(), hostile)).toBe(false)
    expect(readViewPrefs("s", null)).toEqual({})
    expect(writeViewPrefs("s", prefs(), null)).toBe(false)
    const cad = store(prefs())
    const document = store({ projectId: null as string | null })
    const stop = bindViewPrefs(cad, document, hostile)
    expect(() => cad.setState({ displayMode: "wireframe" })).not.toThrow()
    expect(cad.getState().displayMode).toBe("wireframe")
    stop()
  })
})

describe("binding the canvas look to the open project", () => {
  test("the last used look is restored at start and every change is written", () => {
    const storage = memory()
    writeViewPrefs(SESSION_SCOPE, prefs({ displayMode: "hidden-line", showSketches: true }), storage)
    const cad = store(prefs())
    const document = store({ projectId: null as string | null })
    const stop = bindViewPrefs(cad, document, storage)
    expect(cad.getState()).toMatchObject({ displayMode: "hidden-line", showSketches: true })
    cad.setState({ displayMode: "ghost" })
    expect(readViewPrefs(SESSION_SCOPE, storage).displayMode).toBe("ghost")
    cad.setState({ showFlatPattern: true })
    expect(readViewPrefs(SESSION_SCOPE, storage)).toEqual({ displayMode: "ghost", showSketches: true, showFlatPattern: true })
    stop()
    cad.setState({ displayMode: "shaded" })
    expect(readViewPrefs(SESSION_SCOPE, storage).displayMode).toBe("ghost")
  })

  test("a change of something else writes nothing", () => {
    const storage = memory()
    const cad = store({ ...prefs(), hovered: 0 })
    const stop = bindViewPrefs(cad, store({ projectId: null as string | null }), storage)
    cad.setState({ hovered: 1 })
    expect(storage.data.size).toBe(0)
    stop()
  })

  test("each project has its own look, and a new project starts from what is on screen", () => {
    const storage = memory()
    const cad = store(prefs())
    const document = store({ projectId: null as string | null })
    const stop = bindViewPrefs(cad, document, storage)
    document.setState({ projectId: "one" })
    cad.setState({ displayMode: "wireframe" })
    document.setState({ projectId: "two" })
    // "two" has nothing stored: it keeps what is on screen and owns it from now on
    expect(cad.getState().displayMode).toBe("wireframe")
    expect(readViewPrefs("project:two", storage).displayMode).toBe("wireframe")
    cad.setState({ displayMode: "xray", showSketches: true })
    document.setState({ projectId: "one" })
    expect(cad.getState()).toMatchObject({ displayMode: "wireframe", showSketches: false })
    document.setState({ projectId: "two" })
    expect(cad.getState()).toMatchObject({ displayMode: "xray", showSketches: true })
    stop()
  })

  test("the editor's own stores follow a project: display mode, sketches and flat pattern", () => {
    const storage = memory()
    const before = { ...useCADStore.getState() }
    const stop = bindViewPrefs(useCADStore, useDocumentStore, storage)
    try {
      useDocumentStore.getState().setDocument({ projectId: "proj-1", drawingId: "d1" })
      useCADStore.getState().setDisplayMode("hidden-line")
      useCADStore.getState().setShowSketches(true)
      useCADStore.getState().setShowFlatPattern(true)
      expect(readViewPrefs("project:proj-1", storage)).toEqual({ displayMode: "hidden-line", showSketches: true, showFlatPattern: true })
      useDocumentStore.getState().setDocument({ projectId: "proj-2", drawingId: "d2" })
      useCADStore.getState().setDisplayMode("shaded")
      useDocumentStore.getState().setDocument({ projectId: "proj-1", drawingId: "d1" })
      expect(useCADStore.getState()).toMatchObject({ displayMode: "hidden-line", showSketches: true, showFlatPattern: true })
    } finally {
      stop()
      useDocumentStore.getState().clear()
      useCADStore.setState({ displayMode: before.displayMode, showSketches: before.showSketches, showFlatPattern: before.showFlatPattern })
    }
  })

  test("opening the app on a project restores that project's look, else the last used", () => {
    const storage = memory()
    writeViewPrefs("project:p", prefs({ displayMode: "xray" }), storage)
    writeViewPrefs(SESSION_SCOPE, prefs({ displayMode: "ghost" }), storage)
    const withProject = store(prefs())
    bindViewPrefs(withProject, store({ projectId: "p" as string | null }), storage)
    expect(withProject.getState().displayMode).toBe("xray")
    const unknownProject = store(prefs())
    bindViewPrefs(unknownProject, store({ projectId: "new" as string | null }), storage)
    expect(unknownProject.getState().displayMode).toBe("ghost")
  })
})
