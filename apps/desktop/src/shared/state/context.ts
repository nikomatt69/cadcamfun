/**
 * The app shell context (spec 06-desktop-ui.md §1).
 *
 * One object holds everything the layout and the screens read: the typed client and
 * its runtime, settings, the query cache, the editor's undo/redo, recent projects, the
 * cursor position, the docked AI panel and the command palette. Screens take it from
 * context instead of importing singletons, so a component test can mount a screen with
 * its own fake client and its own settings.
 */
import { createContext, createSignal, useContext, type Accessor, type JSX, type Setter } from "solid-js"
import { emptyDrawing, type Drawing } from "@cadcamfun/core"
import type { AppRuntime, Client } from "./client.ts"
import { createQueryCache, type QueryCache } from "./query-cache.ts"
import { createEditorState, type EditorState, type EditorTool } from "./editor.ts"
import { createSettings, type SettingsStore } from "./settings.ts"
import {
  pushRecent,
  readRecents,
  removeRecent,
  writeRecents,
  type RecentProject
} from "./recents.ts"
import type { ActivityId } from "../../app/layout.ts"

/** Sidecar health as the status bar shows it. */
export type SidecarStatus = "starting" | "ready" | "fake" | "stopped"

export interface AppState {
  readonly client: Client
  readonly runtime: AppRuntime
  readonly cache: QueryCache
  readonly settings: SettingsStore
  readonly editor: EditorState
  readonly recents: Accessor<ReadonlyArray<RecentProject>>
  /** Records an opened project at the front of the recents list. */
  rememberProject(id: string, name: string): void
  forgetProject(id: string): void
  readonly panelOpen: Accessor<boolean>
  setPanelOpen(open: boolean): void
  readonly paletteOpen: Accessor<boolean>
  setPaletteOpen(open: boolean): void
  readonly activity: Accessor<ActivityId>
  setActivity(id: ActivityId): void
  readonly cursor: Accessor<{ readonly x: number; readonly y: number } | undefined>
  setCursor(position: { readonly x: number; readonly y: number } | undefined): void
  readonly sidecar: Accessor<SidecarStatus>
  setSidecar(status: SidecarStatus): void
  readonly drawing: Accessor<Drawing>
  /** Active tool id, mirrored here so the status bar and the palette share it. */
  readonly tool: Accessor<EditorTool>
  setTool: Setter<EditorTool>
  dispose(): void
}

export interface CreateAppStateOptions {
  readonly client: Client
  readonly runtime: AppRuntime
  readonly cache?: QueryCache
  readonly settings?: SettingsStore
  readonly drawing?: Drawing
  readonly sidecar?: SidecarStatus
  /** Drops the recents list; the app keeps it, tests start clean. */
  readonly recents?: ReadonlyArray<RecentProject>
}

export const createAppState = (options: CreateAppStateOptions): AppState => {
  const [recents, setRecents] = createSignal<ReadonlyArray<RecentProject>>(options.recents ?? readRecents())
  const [panelOpen, setPanelOpen] = createSignal(false)
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [activity, setActivity] = createSignal<ActivityId>("projects")
  const [cursor, setCursor] = createSignal<{ readonly x: number; readonly y: number } | undefined>(undefined)
  const [sidecar, setSidecar] = createSignal<SidecarStatus>(options.sidecar ?? "ready")
  const editor = createEditorState(options.drawing ?? emptyDrawing("drawing-1", "Untitled"))
  const settings = options.settings ?? createSettings()

  const setRecentsAndPersist = (next: ReadonlyArray<RecentProject>): void => {
    setRecents(next)
    writeRecents(next)
  }

  return {
    client: options.client,
    runtime: options.runtime,
    cache: options.cache ?? createQueryCache(),
    settings,
    editor,
    drawing: editor.drawing,
    tool: editor.tool,
    setTool: editor.setTool,
    recents,
    rememberProject: (id, name) => setRecentsAndPersist(pushRecent(recents(), { id, name }, new Date().toISOString())),
    forgetProject: (id) => setRecentsAndPersist(removeRecent(recents(), id)),
    panelOpen,
    setPanelOpen,
    paletteOpen,
    setPaletteOpen,
    activity,
    setActivity,
    cursor,
    setCursor,
    sidecar,
    setSidecar,
    dispose: () => options.runtime.dispose()
  }
}

const AppContext = createContext<AppState>()

/** The app state; every screen calls this instead of importing a singleton. */
export const useApp = (): AppState => {
  const state = useContext(AppContext)
  if (state === undefined) throw new Error("useApp must be called inside <AppProvider>")
  return state
}

export interface AppProviderProps {
  readonly state: AppState
  readonly children: JSX.Element
}

export function AppProvider(props: AppProviderProps): JSX.Element {
  return AppContext.Provider({
    value: props.state,
    get children() {
      return props.children
    }
  })
}
