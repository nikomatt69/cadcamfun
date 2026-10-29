import { transformLibraryItemToCADElement } from "../lib/libraryTransform.ts"
import { Effect } from "effect"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { WorkspaceInspector } from "../../../shared/components/panel/inspector.tsx"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { CheckRow, Field, Segmented } from "../../../shared/components/panel/ui.tsx"
import { Eye, Magnet, Network, Puzzle, Settings, Wrench } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import StatusBar from "../components/StatusBar.tsx"
import FloatingToolbar from "../components/FloatingToolbar.tsx"
import EnhancedToolbar from "../components/EnhancedToolbar.tsx"
import DrawingPanel from "../components/DrawingPanel.tsx"
import CadRibbon from "../components/CadRibbon.tsx"
import SurfacingPanel, { type SurfacingOp } from "../components/SurfacingPanel.tsx"
import { t } from "../../../i18n/index.ts"
import EnhancedSidebarCad, { type SidebarTab } from "../components/EnanchedSidebarCad.tsx"
import CADCanvas, { type CADCanvasApi } from "../components/CADCanvas.tsx"
import TitleBlockOverlay from "../components/TitleBlockOverlay.tsx"
import DimensionsOverlay from "../components/DimensionsOverlay.tsx"
import PropertyPanel from "../components/PropertyPanel.tsx"
import ImportExportDialog from "../components/ImportExportDialog.tsx"
import OriginControls from "../components/OriginControls.tsx"
import WorkpieceSetup from "../components/WorkpieceSetup.tsx"
import SnapSettings from "../components/SnapSettings.tsx"
import UnifiedLibraryModal from "../components/UnifiedLibraryModal.tsx"
import LibraryBrowser, { type LibraryComponent } from "../components/LibraryBrowser.tsx"
import CustomElementsEditor from "../components/custom-elements/CustomElementsEditor.tsx"
import AssemblyPanel from "../components/assembly/AssemblyPanel.tsx"
import { CADAssistantButton } from "../components/CADAssistantButton.tsx"
import { CADAssistantBridge } from "../../ai/index.ts"
import { captureEditorOwner, FIT_VIEW_EVENT } from "../../ai/lib/editor-sync.ts"
import { syncDocumentSettings } from "../../../shared/state/document-settings.ts"
import { applyStoredDrawing } from "../lib/open-drawing.ts"
import { readDraft } from "../lib/draft.ts"
import { restoreLayers } from "../lib/document-setup.ts"
import { projectSession } from "../../projects/lib/project-session.ts"
import DrawingVersionsDialog from "../components/DrawingVersionsDialog.tsx"
import "../../../styles/workstation.css"

type RightPanel = "proprieties" | "settings" | "constraints" | "modeling" | "assembly" | "drawing"

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
  const [showVersions, setShowVersions] = createSignal(false)
  const [dialogMode, setDialogMode] = createSignal<"import" | "export">("export")
  const [showFloating, setShowFloating] = createSignal(true)
  const [libraryItem, setLibraryItem] = createSignal<LibraryComponent | null>(null)
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
    const current = ++generation
    const owner = captureEditorOwner()
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    const active = () => !controller.signal.aborted && current === generation && owner.current()
    if (id === undefined && projectId === undefined) return
    void (async () => {
      // A named drawing wins; otherwise the project's newest one, so reopening a project is never an empty canvas.
      let target = id
      if (target === undefined && projectId !== undefined) {
        const rows = await app.runtime.run(app.client.drawings.listForProject({ params: { id: projectId } }), { signal: controller.signal }) as ReadonlyArray<{ id: string }>
        target = rows[0]?.id
      }
      if (target === undefined || !active()) return
      if (loadedFor === target) return
      await app.runtime.run(app.client.drawings.get({ params: { id: target } }), { signal: controller.signal }).then((row) => {
        if (!active()) return
        loadedFor = target
        applyStoredDrawing(app, row)
        setDrawingId(row.id)
        setDrawingName(row.name)
        toast.success(t("cad.page.drawingOpened", { name: row.name }))
      }, () => { if (active()) toast.error(t("cad.page.drawingOpenFailed")) })
    })().catch(() => { if (active()) toast.error(t("cad.page.drawingOpenFailed")) })
  })

  /**
   * Saves the open drawing and the CAM program linked to it in place (the same path autosave takes); a drawing that was never
   * stored goes through the export / save-as dialog.
   */
  const save = (): void => {
    void projectSession(app).saveInteractive().then((outcome) => { if (outcome?.document === "no-destination") openExport() })
  }
  // A drawing that was never saved and has no project: offer back what the last session left in the recovery draft.
  onMount(() => {
    if (requestedDrawing() !== undefined || requestedProject() !== undefined) return
    if (useDocumentStore.getState().drawingId !== null || useElementsStore.getState().elements.length > 0) return
    const draft = readDraft()
    if (draft === undefined) return
    restoreLayers(draft.layers)
    useElementsStore.setState({ elements: draft.elements as never, selectedElement: null })
    toast.info(t("save.draftRestored", { time: new Date(draft.savedAt).toLocaleString() }))
  })
  // The assistant added something: frame it once the canvas has drawn it.
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onFit = () => { clearTimeout(timer); timer = setTimeout(() => canvas()?.fitToView(), 150) }
    window.addEventListener(FIT_VIEW_EVENT, onFit)
    onCleanup(() => { clearTimeout(timer); window.removeEventListener(FIT_VIEW_EVENT, onFit) })
  })
  // Save, export and import are the commands of the page; the chords come from the keymap.
  onMount(() => {
    const off = app.keys.register({
      "file.save": () => { save() },
      "file.export": () => { openExport() },
      "file.import": () => { setDialogMode("import"); setShowImportExport(true) }
    })
    onCleanup(off)
  })

  // The legacy page set its document title through `MetaTags`.
  onMount(() => {
    const previous = document.title
    document.title = t("cad.page.title")
    onCleanup(() => { document.title = previous })
  })

  // `?loadComponent=<id>`: a component handed over from the component pages through local storage.
  createEffect(() => {
    const componentId = search.loadComponent
    if (!componentId || typeof componentId !== "string") return
    try {
      const stored = localStorage.getItem("componentToLoadInCAD")
      if (!stored) { toast.error(t("cad.page.componentMissing")); return }
      const data = JSON.parse(stored)
      if (!data || !data.id || data.id !== componentId) { toast.error(t("cad.page.componentInvalid")); return }
      elements.addElement(transformLibraryItemToCADElement(data, { x: 0, y: 0, z: 0 }))
      toast.success(t("cad.page.componentLoaded", { name: data.name }))
      localStorage.removeItem("componentToLoadInCAD")
      localStorage.removeItem("componentToLoadInCAD_timestamp")
      setSearch({ loadComponent: undefined, loadTimestamp: undefined }, { replace: true })
    } catch (cause) {
      console.error("Error loading component from localStorage:", cause)
      toast.error(t("cad.page.componentLoadFailed"))
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

  createEffect(() => { if (libraryComponent() === null) setLibraryItem(null) })

  const openExport = () => { setDialogMode("export"); setShowImportExport(true) }

  const pickComponent = (component: LibraryComponent) => {
    setLibraryItem(component)
    setLibraryComponent(component.id)
    toast.success(t("cad.page.componentSelected", { name: component.name }))
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
    <div
      class="cad-workspace h-full w-full flex flex-col overflow-hidden"
    >
      <div class="cad-workspace__frame flex flex-col h-full w-full">
        <EnhancedToolbar
          sidebarOpen={sidebarOpen()} setSidebarOpen={setSidebarOpen} handleSaveProject={save} onShowVersions={() => setShowVersions(true)}
          setDialogMode={setDialogMode} setShowImportExportDialog={setShowImportExport} setShowLibraryView={() => navigate("/library")}
          setShowUnifiedLibrary={setShowLibrary} setShowCustomElements={setShowCustomElements} setShowFloatingToolbar={setShowFloating} showFloatingToolbar={showFloating()}
          selectedLibraryComponent={libraryComponent()} setSelectedLibraryComponent={setLibraryComponent} setIsPlacingComponent={() => undefined}
        />

        <CadRibbon onDrawing={() => { setRightPanel("drawing"); setRightOpen(true) }} ready={canvas() !== undefined} operation={rightPanel() === "modeling" ? surfaceOperation() : undefined}
          onSurface={operation => { setSurfaceOperation(operation); setRightPanel("modeling"); setRightOpen(true) }}
          onBoolean={operation => canvas()?.boolean(operation)} />

        <div class="cad-workspace__body flex flex-1 overflow-hidden w-full">
          <EnhancedSidebarCad isOpen={sidebarOpen()} setIsOpen={setSidebarOpen} activeSidebarTab={sidebarTab()} setActiveSidebarTab={setSidebarTab} />

          <div class="cad-workspace__stage flex-1 min-w-0 flex relative overflow-hidden rounded-2xl mr-2">
            <CADCanvas
              width="100%" height="100%" previewComponent={libraryComponent()} previewLibraryItem={libraryItem()}
              onComponentPlaced={() => { toast.success(t("cad.page.componentPlaced")); setLibraryComponent(null) }}
              onReady={setCanvas} onSave={save}
              footerActions={<CADAssistantButton isVisible={showAssistant()} toggleVisibility={toggleAssistant} />}
              footerDock={<TitleBlockOverlay mode={cad.viewMode} />}
            />
            <Show when={cad.showDimensions && canvas()}>{(api) => <DimensionsOverlay scene={api().scene} camera={api().camera} />}</Show>
            <Show when={showFloating()}>
              <FloatingToolbar initialPosition={{ x: 100, y: 100 }} onClose={() => setShowFloating(false)} library={() => <LibraryBrowser onSelectComponent={pickComponent} />} ai={() => <button class="cad-ribbon-action" onClick={() => app.setPanelOpen(true)}>{t("ai.title")}</button>} />
            </Show>

            <Show when={showAssistant()}>
              <CADAssistantBridge isVisible initialContextData={assistantContext()} />
            </Show>
          </div>

          <WorkspaceInspector class="cad-workspace__inspector" open={rightOpen()}
            active={rightPanel() === "modeling" || rightPanel() === "drawing" ? "proprieties" : rightPanel() as "proprieties" | "settings" | "constraints" | "assembly"}
            onSelect={setRightPanel} onToggle={() => setRightOpen(!rightOpen())} collapseLabel={t("cad.toggleProperties")}
            tabs={[
              { id: "proprieties", label: rightPanel() === "modeling" ? t("cad.ribbon.surface") : t("cad.properties"), title: t("cad.properties"), icon: (size) => <Wrench size={size} /> },
              { id: "settings", label: t("cad.settings"), title: t("cad.settings"), icon: (size) => <Settings size={size} /> },
              { id: "constraints", label: t("cad.plugins"), title: t("cad.plugins"), icon: (size) => <Puzzle size={size} /> },
              { id: "assembly", label: t("cad.assembly.title"), title: t("cad.assembly.title"), icon: (size) => <Network size={size} /> }
            ]}>
            <div class="workstation-panel-content inspector-panels">
              <Show when={rightPanel() === "drawing"}><DrawingPanel /></Show>
              <Show when={rightPanel() === "proprieties"}><PropertyPanel /></Show>
              <Show when={rightPanel() === "modeling"}><SurfacingPanel operation={surfaceOperation()} onOperationChange={setSurfaceOperation} /></Show>

              <Show when={rightPanel() === "settings"}>
                <SidebarSection id="cad-view" title={t("cad.viewSettings")} icon={Eye} summary={cad.viewMode.toUpperCase()}>
                  <Field label={t("cad.viewMode")}>
                    <Segmented label={t("cad.viewMode")} value={cad.viewMode} options={[["2d", t("cad.view2d")], ["3d", t("cad.view3d")]]} onChange={(mode) => cad.setViewMode(mode)} />
                  </Field>
                  <CheckRow id="cad-view-grid" checked={cad.gridVisible} onChange={() => cad.toggleGrid()}>{t("cad.showGrid")}</CheckRow>
                  <CheckRow id="cad-view-axis" checked={cad.axisVisible} onChange={() => cad.toggleAxis()}>{t("cad.showAxis")}</CheckRow>
                </SidebarSection>
                <OriginControls />
                <WorkpieceSetup />
                <SidebarSection id="cad-snap" title={t("cad.snapSettings")} icon={Magnet}><SnapSettings /></SidebarSection>
              </Show>

              <Show when={rightPanel() === "constraints"}>
                <SidebarSection id="cad-plugins" title={t("cad.plugins")} icon={Puzzle}>
                  <div class="flex-shrink-0 flex space-x-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <For each={sidebarPlugins()}>{(plugin) =>
                      <button class={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${pluginId() === plugin.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`} onClick={() => setPluginId(plugin.id)}>{plugin.title}</button>}
                    </For>
                  </div>
                  <div class="flex-1 p-4 overflow-auto">
                    <Show when={sidebarPlugins().find((plugin) => plugin.id === pluginId())}>{(plugin) => <p class="text-sm text-gray-600 dark:text-gray-300">{plugin().description}</p>}</Show>
                    <Show when={sidebarPlugins().length === 0}>
                      <div class="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">{t("cad.noSidebarPlugins")}</div>
                    </Show>
                  </div>
                </SidebarSection>
              </Show>

              <Show when={rightPanel() === "assembly"}><AssemblyPanel /></Show>
            </div>
          </WorkspaceInspector>
        </div>

        <div><StatusBar /></div>
      </div>

      <DrawingVersionsDialog open={showVersions()} onClose={() => setShowVersions(false)} />
      <ImportExportDialog isOpen={showImportExport()} mode={dialogMode()} onClose={() => setShowImportExport(false)} canvas={canvas()} />
      <UnifiedLibraryModal isOpen={showLibrary()} onClose={() => setShowLibrary(false)}><LibraryBrowser onSelectComponent={pickComponent} /></UnifiedLibraryModal>
      <CustomElementsEditor isOpen={showCustomElements()} onClose={() => setShowCustomElements(false)} />
    </div>
  )
}
