import { Effect } from "effect"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { ChevronLeft, ChevronRight, Eye, EyeOff, LayoutGrid, Network, Puzzle, Settings, Wrench } from "lucide-solid"
import { toast } from "../components/ui/toast.tsx"
import { useApp } from "../state/context.ts"
import { useCADStore } from "./store/cadStore.ts"
import { useDocumentStore } from "./store/documentStore.ts"
import { useElementsStore } from "./store/elementsStore.ts"
import { useLayerStore } from "./store/layerStore.ts"
import { useSelectionStore } from "./store/selectorStore.ts"
import StatusBar from "./components/StatusBar.tsx"
import FloatingToolbar from "./components/FloatingToolbar.tsx"
import EnhancedToolbar from "./components/EnhancedToolbar.tsx"
import CadRibbon from "./components/CadRibbon.tsx"
import SurfacingPanel, { type SurfacingOp } from "./components/SurfacingPanel.tsx"
import { t } from "../i18n/index.ts"
import EnhancedSidebarCad, { type SidebarTab } from "./components/EnanchedSidebarCad.tsx"
import CADCanvas, { type CADCanvasApi } from "./components/CADCanvas.tsx"
import DimensionsOverlay from "./components/DimensionsOverlay.tsx"
import PropertyPanel from "./components/PropertyPanel.tsx"
import ImportExportDialog from "./components/ImportExportDialog.tsx"
import OriginControls from "./components/OriginControls.tsx"
import WorkpieceSetup from "./components/WorkpieceSetup.tsx"
import SnapSettings from "./components/SnapSettings.tsx"
import UnifiedLibraryModal from "./components/UnifiedLibraryModal.tsx"
import LibraryBrowser, { type LibraryComponent } from "./components/LibraryBrowser.tsx"
import CustomElementsEditor from "./components/custom-elements/CustomElementsEditor.tsx"
import AssemblyPanel from "./components/assembly/AssemblyPanel.tsx"
import { CADAssistantButton } from "./components/CADAssistantButton.tsx"
import { CADAssistantBridge } from "../ai/CADAssistantBridge.tsx"
import { FIT_VIEW_EVENT } from "../ai/editor-sync.ts"
import { restoreDocumentSettings, syncDocumentSettings } from "../state/document-settings.ts"
import { syncProjectContents } from "./lib/projectSnapshot.ts"
import "../components/workstation.css"

const rise = { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } }
type RightPanel = "proprieties" | "settings" | "constraints" | "modeling" | "assembly"

const tabClass = (active: boolean) =>
  `flex-1 py-3 px-3 text-sm font-medium rounded-lg transition-all duration-200 ${active ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"}`
const toggleTrack = (on: boolean) => `h-4 w-8 rounded-full ${on ? "bg-blue-600" : "bg-gray-300"} relative transition-colors duration-200 ease-in-out`
const toggleThumb = (on: boolean) => `absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow transform ${on ? "translate-x-4" : ""} transition-transform duration-200 ease-in-out`

/** The `/cad` editor: toolbar, sidebar, canvas with floating tools, right-hand properties/settings/plugins, status bar. */
export default function CadPage(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const [search, setSearch] = useSearchParams()
  const cad = useCADStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [rightOpen, setRightOpen] = createSignal(true)
  const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("explorer")
  const [surfaceOperation, setSurfaceOperation] = createSignal<SurfacingOp>("chamferBox")
  const [rightPanel, setRightPanel] = createSignal<RightPanel>("proprieties")
  const [showImportExport, setShowImportExport] = createSignal(false)
  const [dialogMode, setDialogMode] = createSignal<"import" | "export">("export")
  const [showFloating, setShowFloating] = createSignal(true)
  const [libraryComponent, setLibraryComponent] = createSignal<string | null>(null)
  const [showLibrary, setShowLibrary] = createSignal(false)
  const [showCustomElements, setShowCustomElements] = createSignal(false)
  // The assistant is the shell's docked AI panel (spec 06 §1): the CAD button is one more
  // entry point for it, so the panel state lives in the app and the two stay in sync.
  const showAssistant = () => app.panelOpen()
  const toggleAssistant = () => app.setPanelOpen(!app.panelOpen())
  const [canvas, setCanvas] = createSignal<CADCanvasApi>()
  const [pluginId, setPluginId] = createSignal<string | null>(null)
  const [sidebarPlugins, setSidebarPlugins] = createSignal<ReadonlyArray<{ id: string; title: string; description: string }>>([])

  onMount(() => syncDocumentSettings(app))

  // A stored drawing: `/cad?drawingId=<id>` (from the project page) or `/drawings/<id>`. It replaces what is on the canvas.
  const [drawingId, setDrawingId] = createSignal<string | null>(null)
  const [drawingName, setDrawingName] = createSignal<string | null>(null)
  const requestedDrawing = (): string | undefined =>
    location.pathname.startsWith("/drawings/") ? params.id : typeof search.drawingId === "string" ? search.drawingId : undefined
  /** `/cad?projectId=<id>` (the CAM page and the dashboard link here) names no drawing: the project's newest one opens. */
  const requestedProject = (): string | undefined => typeof search.projectId === "string" && search.projectId !== "" ? search.projectId : undefined
  let loadedFor: string | undefined
  let generation = 0
  createEffect(() => {
    const id = requestedDrawing()
    const projectId = requestedProject()
    if (id === undefined && projectId === undefined) return
    const current = ++generation
    void (async () => {
      // A named drawing wins; otherwise the project's newest one, so reopening a project is never an empty canvas.
      let target = id
      if (target === undefined && projectId !== undefined) {
        const rows = await app.runtime.run(app.client.drawings.listForProject({ params: { id: projectId } })) as ReadonlyArray<{ id: string }>
        target = rows[0]?.id
      }
      if (target === undefined || current !== generation) return
      if (loadedFor === target) return
      loadedFor = target
      await app.runtime.run(app.client.drawings.get({ params: { id: target } })).then((row) => {
        const stored = row.data as { elements?: unknown; settings?: unknown } | null
        restoreDocumentSettings(app, stored?.settings)
        const fallbackLayer = layers.activeLayer
        const known = new Set(layers.layers.map((layer) => layer.id))
        const loaded = (Array.isArray(stored?.elements) ? stored.elements : []).map((element: Record<string, unknown>) =>
          known.has(String(element["layerId"])) ? element : { ...element, layerId: fallbackLayer })
        useElementsStore.setState({ elements: loaded as never, selectedElement: null })
        selection.clearSelection()
        setDrawingId(row.id)
        setDrawingName(row.name)
        useDocumentStore.getState().setDocument({ projectId: row.project.id, drawingId: row.id, name: row.name })
        app.rememberProject(row.project.id, row.project.name)
        toast.success(`Drawing "${row.name}" opened`)
      }, () => toast.error("The drawing could not be opened"))
    })().catch(() => { if (current === generation) toast.error("The drawing could not be opened") })
  })

  /** Saves the open stored drawing in place; a drawing that was never stored goes through the export / save-as dialog. */
  const save = (): void => {
    const id = drawingId()
    if (id === null) { openExport(); return }
    const projectId = useDocumentStore.getState().projectId
    if (projectId === null) { openExport(); return }
    void syncProjectContents(app, projectId, id, app.runtime.run as <A>(effect: unknown) => Promise<A>).then(
      (contents) => toast.success(contents.componentIds.length > 0
        ? `Saved "${drawingName() ?? "drawing"}" · ${contents.componentIds.length} new component(s) added to the project`
        : `Saved "${drawingName() ?? "drawing"}"`),
      () => toast.error("The drawing could not be saved")
    )
  }
  // The assistant added something: frame it once the canvas has drawn it.
  onMount(() => {
    const onFit = () => { setTimeout(() => canvas()?.fitToView(), 150) }
    window.addEventListener(FIT_VIEW_EVENT, onFit)
    onCleanup(() => window.removeEventListener(FIT_VIEW_EVENT, onFit))
  })
  onMount(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save() } }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  // The legacy page set its document title through `MetaTags`.
  onMount(() => {
    const previous = document.title
    document.title = "CAD Editor"
    onCleanup(() => { document.title = previous })
  })

  // `?loadComponent=<id>`: a component handed over from the component pages through local storage.
  createEffect(() => {
    const componentId = search.loadComponent
    if (!componentId || typeof componentId !== "string") return
    try {
      const stored = localStorage.getItem("componentToLoadInCAD")
      if (!stored) { toast.error("Component data not found"); return }
      const data = JSON.parse(stored)
      if (!data || !data.id || data.id !== componentId) { toast.error("Invalid component data"); return }
      elements.addElement({ id: `component-${Date.now()}`, type: "component", x: 0, y: 0, z: 0, name: data.name || "Unnamed Component", componentId: data.id, data: data.data, layerId: layers.layers[0]?.id ?? "default" })
      toast.success(`Component '${data.name}' loaded successfully`)
      localStorage.removeItem("componentToLoadInCAD")
      localStorage.removeItem("componentToLoadInCAD_timestamp")
      setSearch({ loadComponent: undefined, loadTimestamp: undefined }, { replace: true })
    } catch (cause) {
      console.error("Error loading component from localStorage:", cause)
      toast.error("Failed to load component data. See console for details.")
    }
  })

  // The registry belongs to the plugin panel; a closed panel performs no plugin HTTP work.
  createEffect(() => {
    if (rightPanel() !== "constraints") return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    app.runtime.run(app.client.plugins.list().pipe(Effect.timeout("15 seconds")), { signal: controller.signal }).then((installed) => {
      if (controller.signal.aborted) return
      const list = installed.filter((plugin) => plugin.enabled && plugin.manifest.contributes?.sidebar).map((plugin) => ({
        id: plugin.id, title: plugin.manifest.contributes?.sidebar?.title || plugin.manifest.name, description: plugin.manifest.description
      }))
      setSidebarPlugins(list)
      if (list.length > 0 && !list.some((plugin) => plugin.id === pluginId())) setPluginId(list[0]!.id)
      else if (list.length === 0) setPluginId(null)
    }, () => { if (!controller.signal.aborted) setSidebarPlugins([]) })
  })

  createEffect(() => { if (!showLibrary() && !sidebarOpen()) setLibraryComponent(null) })

  const openExport = () => { setDialogMode("export"); setShowImportExport(true) }

  const pickComponent = (component: LibraryComponent) => {
    setLibraryComponent(component.id)
    toast.success(`Component '${component.name}' selected. Place it on the canvas.`)
    setShowLibrary(false)
    setSidebarTab("tools")
  }

  const assistantContext = createMemo(() => {
    const total = elements.elements.length
    const ids = selection.selectedElementIds
    if (!showAssistant()) return { totalElementCount: total, selectedElementCount: ids.length, selectedElements: [], activeLayer: null }
    const details = ids.map((id) => elements.elements.find((element) => element.id === id)).filter((element) => element !== undefined).map((element) => ({
      id: element.id, type: element.type, name: element.name || "Unnamed", x: element.x, y: element.y, z: element.z,
      rotation: element.rotation || { x: 0, y: 0, z: 0 }, scale: element.scale || { x: 1, y: 1, z: 1 },
      color: element.color || "#000000", linewidth: element.linewidth || 1, description: element.description || "",
      material: element.material || "default", additionalProps: element.additionalProps || {}, operands: element.operands || [], wireframe: element.wireframe || false
    }))
    const layer = layers.layers.find((candidate) => candidate.id === layers.activeLayer)
    return { totalElementCount: total, selectedElementCount: ids.length, selectedElements: details, activeLayer: layer ? { id: layer.id, name: layer.name } : null }
  })

  return (
    <Motion.div
      class="cad-workspace h-full w-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
    >
      <Motion.div class="cad-workspace__frame flex flex-col h-full w-full" {...rise} transition={{ duration: 0.8, delay: 0.2 }}>
        <EnhancedToolbar
          sidebarOpen={sidebarOpen()} setSidebarOpen={setSidebarOpen} handleSaveProject={save}
          setDialogMode={setDialogMode} setShowImportExportDialog={setShowImportExport} setShowLibraryView={() => navigate("/library")}
          setShowUnifiedLibrary={setShowLibrary} setShowCustomElements={setShowCustomElements} setShowFloatingToolbar={setShowFloating} showFloatingToolbar={showFloating()}
          selectedLibraryComponent={libraryComponent()} setSelectedLibraryComponent={setLibraryComponent} setIsPlacingComponent={() => undefined}
        />

        <CadRibbon ready={canvas() !== undefined} operation={rightPanel() === "modeling" ? surfaceOperation() : undefined}
          onSurface={operation => { setSurfaceOperation(operation); setRightPanel("modeling"); setRightOpen(true) }}
          onBoolean={operation => canvas()?.boolean(operation)} />

        <Motion.div class="cad-workspace__body flex flex-1 overflow-hidden w-full" {...rise} transition={{ duration: 0.6, delay: 0.4 }}>
          <EnhancedSidebarCad isOpen={sidebarOpen()} setIsOpen={setSidebarOpen} activeSidebarTab={sidebarTab()} setActiveSidebarTab={setSidebarTab} />

          <Motion.div class="cad-workspace__stage flex-1 min-w-0 flex relative overflow-hidden rounded-2xl mr-2" {...rise} transition={{ duration: 0.8, delay: 0.6 }}>
            <CADCanvas
              width="100%" height="100%" previewComponent={libraryComponent()}
              onComponentPlaced={() => { toast.success("Component placed successfully!"); setLibraryComponent(null) }}
              onReady={setCanvas} onSave={openExport}
            />
            <Show when={cad.showDimensions && canvas()}>{(api) => <DimensionsOverlay scene={api().scene} camera={api().camera} />}</Show>
            <Show when={showFloating()}>
              <FloatingToolbar initialPosition={{ x: 100, y: 100 }} onClose={() => setShowFloating(false)} library={() => <LibraryBrowser onSelectComponent={pickComponent} />} ai={() => <button class="cad-ribbon-action" onClick={() => app.setPanelOpen(true)}>{t("ai.title")}</button>} />
            </Show>
            <Motion.div class="absolute bottom-4 rounded-lg right-16 z-40" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1 }}>
              <CADAssistantButton isVisible={showAssistant()} toggleVisibility={toggleAssistant} class="shadow-lg" />
            </Motion.div>
            <Show when={showAssistant()}>
              <CADAssistantBridge isVisible initialContextData={assistantContext()} />
            </Show>
          </Motion.div>

          <Motion.div
            class="cad-workspace__inspector flex-shrink-0 dark:text-white overflow-y-auto"
            data-open={rightOpen()}
          >
            <Motion.div class="cad-workspace__tabs w-full p-2 flex justify-center" {...rise} transition={{ duration: 0.6, delay: 0.8 }}>
              <div class="flex justify-center w-full text-center">
                <Motion.button aria-pressed={rightPanel() === "proprieties" || rightPanel() === "modeling"} onClick={() => setRightPanel("proprieties")} class={tabClass(rightPanel() === "proprieties" || rightPanel() === "modeling")} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}>
                  <div class="flex items-center justify-center"><Wrench size={16} class="mr-2" />{rightPanel() === "modeling" ? t("cad.ribbon.surface") : "Properties"}</div>
                </Motion.button>
                <Motion.button aria-pressed={rightPanel() === "settings"} onClick={() => setRightPanel("settings")} class={tabClass(rightPanel() === "settings")} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}>
                  <div class="flex items-center justify-center"><Settings size={16} class="mr-2" />Settings</div>
                </Motion.button>
                <Motion.button aria-pressed={rightPanel() === "constraints"} onClick={() => setRightPanel("constraints")} class={tabClass(rightPanel() === "constraints")} hover={{ scale: 1.02 }} press={{ scale: 0.98 }} aria-label="Plugins">
                  <div class="flex items-center justify-center"><Puzzle size={16} class="mr-2" /></div>
                </Motion.button>
                <Motion.button aria-pressed={rightPanel() === "assembly"} onClick={() => setRightPanel("assembly")} class={tabClass(rightPanel() === "assembly")} hover={{ scale: 1.02 }} press={{ scale: 0.98 }} title={t("cad.assembly.title")}>
                  <div class="flex items-center justify-center"><Network size={16} class="mr-2" />{t("cad.assembly.title")}</div>
                </Motion.button>
              </div>
            </Motion.div>

            <Motion.div class="workstation-panel-content flex flex-col" {...rise} transition={{ duration: 0.6, delay: 1 }}>
              <Show when={rightPanel() === "proprieties"}><PropertyPanel /></Show>
              <Show when={rightPanel() === "modeling"}><SurfacingPanel operation={surfaceOperation()} onOperationChange={setSurfaceOperation} /></Show>

              <Show when={rightPanel() === "settings"}>
                <Motion.div class="backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white shadow-xl border border-white/30 dark:border-gray-600/30 rounded-2xl p-6 max-h-[calc(100vh-100px)] overflow-y-auto text-center w-full" {...rise} transition={{ duration: 0.5 }}>
                  <h3 class="text-lg font-medium text-gray-900 mb-4">View Settings</h3>
                  <div class="space-y-4">
                    <div>
                      <label class="text-sm font-medium text-gray-700 mb-1 block">View Mode</label>
                      <div class="flex space-x-2 justify-center">
                        <For each={["2d", "3d"] as const}>{(mode) =>
                          <button onClick={() => cad.setViewMode(mode)} class={`px-3 py-2 rounded-md text-sm ${cad.viewMode === mode ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{mode.toUpperCase()} View</button>}
                        </For>
                      </div>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-gray-700 mb-1 block">Display Options</label>
                      <div class="space-y-2">
                        <button onClick={() => cad.toggleGrid()} class="w-full flex items-center dark:text-blue-400 justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200">
                          <span class="flex items-center"><LayoutGrid size={16} class="mr-2" />Show Grid</span>
                          <span class={toggleTrack(cad.gridVisible)}><span class={toggleThumb(cad.gridVisible)} /></span>
                        </button>
                        <button onClick={() => cad.toggleAxis()} class="w-full flex items-center dark:text-blue-400 justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200">
                          <span class="flex items-center"><Show when={cad.axisVisible} fallback={<EyeOff size={16} class="mr-2" />}><Eye size={16} class="mr-2" /></Show>Show Axis</span>
                          <span class={toggleTrack(cad.axisVisible)}><span class={toggleThumb(cad.axisVisible)} /></span>
                        </button>
                      </div>
                    </div>
                    <OriginControls />
                    <WorkpieceSetup />
                    <SnapSettings />
                  </div>
                </Motion.div>
              </Show>

              <Show when={rightPanel() === "constraints"}>
                <div class="flex-1 flex flex-col overflow-hidden w-full">
                  <div class="flex-shrink-0 flex space-x-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <For each={sidebarPlugins()}>{(plugin) =>
                      <button class={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${pluginId() === plugin.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`} onClick={() => setPluginId(plugin.id)}>{plugin.title}</button>}
                    </For>
                  </div>
                  <div class="flex-1 p-4 overflow-auto">
                    <Show when={sidebarPlugins().find((plugin) => plugin.id === pluginId())}>{(plugin) => <p class="text-sm text-gray-600 dark:text-gray-300">{plugin().description}</p>}</Show>
                    <Show when={sidebarPlugins().length === 0}>
                      <div class="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">No plugins with sidebar UI are enabled</div>
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={rightPanel() === "assembly"}><AssemblyPanel /></Show>
            </Motion.div>
          </Motion.div>

          <Motion.button
            class="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white p-3 rounded-l-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/95 dark:hover:bg-gray-700/95 transition-all duration-200"
            onClick={() => setRightOpen(!rightOpen())} hover={{ scale: 1.05, x: -2 }} press={{ scale: 0.95 }}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 1.2 }} aria-label="Toggle properties sidebar"
          >
            <Motion.div animate={{ rotate: rightOpen() ? 0 : 180 }} transition={{ duration: 0.3 }}>
              <Show when={rightOpen()} fallback={<ChevronLeft size={20} class="text-gray-600 dark:text-gray-300" />}><ChevronRight size={20} class="text-gray-600 dark:text-gray-300" /></Show>
            </Motion.div>
          </Motion.button>
        </Motion.div>

        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.4 }}><StatusBar /></Motion.div>
      </Motion.div>

      <ImportExportDialog isOpen={showImportExport()} mode={dialogMode()} onClose={() => setShowImportExport(false)} canvas={canvas()} />
      <UnifiedLibraryModal isOpen={showLibrary()} onClose={() => setShowLibrary(false)}><LibraryBrowser onSelectComponent={pickComponent} /></UnifiedLibraryModal>
      <CustomElementsEditor isOpen={showCustomElements()} onClose={() => setShowCustomElements(false)} />
    </Motion.div>
  )
}
