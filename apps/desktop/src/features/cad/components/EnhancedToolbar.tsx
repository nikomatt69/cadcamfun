import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Activity, Blocks, BookOpen, ChevronDown, Copy, Maximize, Menu, MousePointer, Moon, RotateCcw, RotateCw, Save, SquarePlus, Sun, Upload, Wrench, X } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { prefersDark } from "../../../shared/state/settings.ts"
import CADCanvas from "./CADCanvas.tsx"
import ComponentCreationModal from "./ComponentCreationModal.tsx"

export interface EnhancedToolbarProps {
  readonly sidebarOpen: boolean
  setSidebarOpen(open: boolean): void
  handleSaveProject(): void
  setDialogMode(mode: "import" | "export"): void
  setShowImportExportDialog(show: boolean): void
  setShowLibraryView(show: boolean): void
  setShowUnifiedLibrary(show: boolean): void
  /** Opens the custom elements editor (authored parametric parts). */
  setShowCustomElements(show: boolean): void
  setShowFloatingToolbar(show: boolean): void
  readonly showFloatingToolbar: boolean
  readonly selectedLibraryComponent: string | null
  setSelectedLibraryComponent(id: string | null): void
  setIsPlacingComponent(placing: boolean): void
  /** Buttons contributed by enabled plugins (rendered after the built-in ones). */
  readonly pluginButtons?: JSX.Element
}

const GLASS_BUTTON = "px-4 py-2 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-600/40 hover:bg-white/90 dark:hover:bg-gray-700/90 rounded-xl shadow-md flex items-center transition-all duration-200"
const ICON_BUTTON = "p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
const TOGGLE_ON = "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
const TOGGLE_OFF = "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
const hover = { scale: 1.05, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.95 }

/** The editor's top bar: menu, save/import/library, undo/redo, view toggles, CAM link, selection summary, FEA dialog. */
export default function EnhancedToolbar(props: EnhancedToolbarProps): JSX.Element {
  const [showComponentModal, setShowComponentModal] = createSignal(false)
  const elements = useElementsStore()
  const cad = useCADStore()
  const selection = useSelectionStore()
  const [showElementsPopup, setShowElementsPopup] = createSignal(false)
  const app = useApp()
  const [simulationPosition, setSimulationPosition] = createSignal<{ x: number; y: number } | null>(null)
  let popup: HTMLDivElement | undefined

  const isDarkMode = (): boolean => {
    const theme = app.settings.settings().theme
    return theme === "dark" || (theme === "system" && prefersDark())
  }
  const toggleDarkMode = () => {
    app.settings.update({ theme: isDarkMode() ? "light" : "dark" })
  }

  const selectedElements = () => elements.elements.filter((element) => selection.selectedElementIds.includes(element.id))
  const selectedCount = () => selectedElements().length

  onMount(() => {
    const outside = (event: MouseEvent) => { if (popup && !popup.contains(event.target as Node)) setShowElementsPopup(false) }
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setSimulationPosition(null); setShowElementsPopup(false) } }
    document.addEventListener("mousedown", outside)
    document.addEventListener("keydown", key)
    onCleanup(() => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key) })
  })

  const createComponentFromSelected = () => {
    const selected = elements.selectedElement
    if (!selected && !selectedCount()) return
    if (!selection.selectedElementIds.length && selected) selection.selectElement(selected.id)
    setShowComponentModal(true)
  }

  const createComponentFromSelection = () => {
    if (!selectedCount()) return
    setShowElementsPopup(false)
    setShowComponentModal(true)
  }

  /** Positions the FEA dialog next to the cursor, keeping it inside the window (like the tool forms). */
  const openSimulation = (event: MouseEvent) => {
    if (simulationPosition()) { setSimulationPosition(null); return }
    const width = Math.min(1200, window.innerWidth * 0.95)
    const height = Math.min(800, window.innerHeight * 0.9)
    const margin = 20
    let x = event.clientX + 15
    let y = event.clientY + 15
    if (x + width + margin > window.innerWidth) { x = event.clientX - width - 15; if (x < margin) x = window.innerWidth - width - margin }
    if (y + height + margin > window.innerHeight) { y = event.clientY - height - 15; if (y < margin) y = window.innerHeight - height - margin }
    setSimulationPosition({
      x: Math.max(margin, Math.min(Math.max(x, margin), window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(Math.max(y, margin), window.innerHeight - height - margin))
    })
  }

  return (
    <Motion.div
      class="workstation-toolbar flex items-center justify-between w-full text-gray-900 dark:text-white"
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, easing: "ease-out" }}
    >
      <Motion.div
        class="flex w-max rounded-2xl items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30"
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
      >
        <Motion.button
          class="mr-2 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 focus:outline-none transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => props.setSidebarOpen(!props.sidebarOpen)} hover={hover} press={press} aria-label={t("cad.toggleSidebar")}
        >
          <Menu size={20} class="text-gray-600 dark:text-gray-400" />
        </Motion.button>

        <div class="ml-6 flex items-center space-x-3">
          <Motion.button onClick={props.handleSaveProject} class={GLASS_BUTTON} title={t("cad.saveProject")} hover={hover} press={press}>
            <Save size={16} class="text-gray-600 dark:text-gray-400" />
          </Motion.button>
          <Motion.button onClick={() => { props.setDialogMode("import"); props.setShowImportExportDialog(true) }} class={GLASS_BUTTON} title={t("cad.importProject")} hover={hover} press={press}>
            <Upload size={16} class="text-gray-600 dark:text-gray-400" />
          </Motion.button>
          <Motion.button onClick={() => props.setShowUnifiedLibrary(true)} class={GLASS_BUTTON} title={t("cad.unifiedLibrary")} hover={hover} press={press}>
            <BookOpen size={16} class="text-gray-600 dark:text-gray-400" />
          </Motion.button>
          <Motion.button onClick={() => props.setShowCustomElements(true)} class={GLASS_BUTTON} title={t("cad.customElements.open")} hover={hover} press={press}>
            <Blocks size={16} class="text-gray-600 dark:text-gray-400" />
          </Motion.button>

          <Show when={selectedCount() > 0 || elements.selectedElement}>
            <Motion.button
              onClick={createComponentFromSelected}
              class="px-4 py-2 backdrop-blur-sm bg-green-50/90 dark:bg-green-900/90 border border-green-300/60 dark:border-green-700/60 hover:bg-green-100/90 dark:hover:bg-green-800/90 text-green-700 dark:text-green-300 rounded-xl shadow-md flex items-center transition-all duration-200"
              title={t("cad.createComponent.title")} hover={hover} press={press}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            >
              <SquarePlus size={16} class="mr-1.5" />
              <span class="text-sm font-medium">{t("cad.createComponent.title")}</span>
            </Motion.button>
          </Show>

          <div class="h-6 border-l border-white/40 dark:border-gray-600/40 mx-3" />
          <Motion.button title={t("cad.undo")} onClick={() => elements.undo()} class={ICON_BUTTON} hover={hover} press={press}><RotateCcw size={18} /></Motion.button>
          <Motion.button title={t("cad.redo")} onClick={() => elements.redo()} class={ICON_BUTTON} hover={hover} press={press}><RotateCw size={18} /></Motion.button>
          <div class="h-5 border-l border-gray-300 dark:border-gray-700 mx-1" />

          <button onClick={() => cad.toggleDimensions()} class={`p-1.5 border shadow-sm rounded-md flex items-center ${cad.showDimensions ? TOGGLE_ON : TOGGLE_OFF}`} title={cad.showDimensions ? t("cad.hideDimensions") : t("cad.showDimensions")}>
            <Maximize size={16} />
          </button>
          <button onClick={() => props.setShowFloatingToolbar(!props.showFloatingToolbar)} class={`p-1.5 border shadow-sm rounded-md flex items-center ml-1 ${props.showFloatingToolbar ? TOGGLE_ON : TOGGLE_OFF}`} title={props.showFloatingToolbar ? t("cad.hideFloatingToolbar") : t("cad.showFloatingToolbar")}>
            <Wrench size={16} />
          </button>
          <button onClick={toggleDarkMode} class={`p-1.5 border shadow-sm rounded-md flex items-center ${isDarkMode() ? TOGGLE_ON : TOGGLE_OFF}`} aria-label={t("cad.toggleTheme")}>
            <Show when={isDarkMode()} fallback={<Moon size={16} />}><Sun size={16} /></Show>
          </button>

          <button
            onClick={openSimulation}
            class={`p-1.5 border shadow-sm rounded-md flex items-center transition-all duration-200 ${simulationPosition() ? "bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900 hover:border-orange-300 text-gray-700 dark:text-gray-300 hover:text-orange-700"}`}
            title="Open FEA simulation"
          >
            <Activity size={16} />
          </button>
          <A href="/cam" class="p-1.5 flex items-center bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 text-white hover:from-green-600 hover:via-emerald-600 hover:to-green-600 border-0 shadow-md rounded-md" title={t("cad.switchCam")}>
            <Wrench size={16} />
            <span class="ml-1.5 text-sm font-medium">{t("cad.cam")}</span>
          </A>
          <Show when={props.pluginButtons}>
            <div class="h-5 border-l border-gray-300 dark:border-gray-700 mx-1" />
            {props.pluginButtons}
          </Show>
        </div>
      </Motion.div>

      <Motion.div class="flex items-center space-x-3" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
        <Show when={props.selectedLibraryComponent}>
          <Motion.div
            class="px-4 py-2 backdrop-blur-sm bg-blue-50/90 dark:bg-blue-900/90 border border-blue-200/60 dark:border-blue-800/60 rounded-xl flex items-center shadow-md"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
          >
            <span class="text-xs text-blue-700 dark:text-blue-300 mr-2">Component selected:</span>
            <span class="text-sm font-medium">Ready for placement</span>
            <Motion.button
              onClick={() => props.setIsPlacingComponent(true)}
              class="ml-3 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl flex items-center shadow-md transition-all duration-200"
              title="Place component" hover={hover} press={press}
            >
              <MousePointer size={14} class="mr-1" />
              <span class="text-xs font-medium">Place</span>
            </Motion.button>
            <Motion.button onClick={() => props.setSelectedLibraryComponent(null)} class="ml-2 p-1.5 rounded-xl hover:bg-blue-200/80 dark:hover:bg-blue-700/80 text-blue-700 dark:text-blue-300 transition-all duration-200" hover={hover} press={press} aria-label="Clear selected component">
              <X size={14} />
            </Motion.button>
          </Motion.div>
        </Show>

        <div class="relative z-[1000]">
          <Motion.button
            onClick={() => setShowElementsPopup(!showElementsPopup())}
            class="px-4 py-2 border border-white/40 dark:border-gray-600/40 rounded-xl flex items-center backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 hover:bg-white/90 dark:hover:bg-gray-700/90 cursor-pointer shadow-md transition-all duration-200"
            hover={hover} press={press}
          >
            <span class="text-xs text-gray-500 dark:text-gray-400 mr-2">Elements:</span>
            <span class="text-sm font-medium">{elements.elements.length}</span>
            <Show when={selectedCount() > 0}>
              <span class="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">{selectedCount()} selected</span>
            </Show>
            <ChevronDown size={14} class="ml-1 text-gray-500" />
          </Motion.button>

          <Show when={showElementsPopup()}>
            <Motion.div
              ref={popup}
              class="absolute top-full right-0 mt-2 w-80 backdrop-blur-md bg-white/95 dark:bg-gray-800/95 border border-white/40 dark:border-gray-600/40 rounded-2xl shadow-xl z-1000"
              initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3 }}
              style={{ "pointer-events": "auto" }}
            >
              <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Selected Elements ({selectedCount()})</h3>
                <Show when={selectedCount() > 0}>
                  <button onClick={createComponentFromSelection} class="px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded-md flex items-center">
                    <SquarePlus size={14} class="mr-1" />
                    Create Component
                  </button>
                </Show>
              </div>
              <div class="max-h-48 overflow-y-auto p-2">
                <Show when={selectedCount() > 0} fallback={
                  <div class="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">No elements selected</div>
                }>
                  <div class="space-y-1">
                    <For each={selectedElements()}>{(element) =>
                      <div class="flex items-center justify-between p-1.5 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                        <div class="flex items-center">
                          <div class="w-3 h-3 rounded-full mr-2" style={{ "background-color": typeof element.color === "string" ? element.color : "#1e88e5" }} />
                          <span class="font-medium">{element.type}</span>
                          <span class="ml-2 text-gray-500 dark:text-gray-400 font-mono">{element.id.substring(0, 12)}...</span>
                        </div>
                        <button
                          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Copy ID"
                          onClick={() => { void navigator.clipboard?.writeText(element.id); toast.success("Element ID copied to clipboard") }}
                        >
                          <Copy size={12} />
                        </button>
                      </div>}
                    </For>
                  </div>
                </Show>
              </div>
            </Motion.div>
          </Show>
        </div>

        <Show when={elements.selectedElement}>{(selected) =>
          <Motion.div
            class="px-4 py-2 border border-green-200/60 dark:border-green-800/60 rounded-xl flex items-center backdrop-blur-sm bg-green-50/90 dark:bg-green-900/90 shadow-md"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
          >
            <span class="text-xs text-green-600 dark:text-green-300 mr-2">Selected:</span>
            <span class="text-sm font-medium">{selected().id.substring(0, 8)}...</span>
          </Motion.div>}
        </Show>
      </Motion.div>

      <Show when={simulationPosition()}>{(position) =>
        <Portal>
          <div class="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" onClick={() => setSimulationPosition(null)} />
          <div
            class="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            style={{ top: `${position().y}px`, left: `${position().x}px`, width: `${Math.min(1200, window.innerWidth * 0.95)}px`, height: `${Math.min(800, window.innerHeight * 0.9)}px` }}
          >
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center"><Activity size={18} class="text-white" /></div>
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Integrated FEA Simulation</h2>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Real-time structural, thermal, and coupled analysis</p>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <div class="text-xs text-gray-500 dark:text-gray-400 mr-4">
                  <span class="inline-flex items-center"><div class="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />System active</span>
                </div>
                <button onClick={() => setSimulationPosition(null)} class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" aria-label="Close"><X size={20} /></button>
              </div>
            </div>
            <div class="h-[calc(100%-4rem)] overflow-hidden"><CADCanvas width="100%" height="100%" allowDragDrop keyboard={false} /></div>
            <div class="absolute bottom-0 left-0 right-0 bg-gray-50 dark:bg-gray-800/50 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-4 py-2">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center space-x-4 text-gray-600 dark:text-gray-400">
                  <span class="flex items-center"><div class="w-2 h-2 bg-blue-400 rounded-full mr-1" />Simulation canvas active</span>
                  <span>⌨️ Ctrl+Shift+S: Toggle simulation</span>
                  <span>⌨️ F9: Switch mode</span>
                  <span>⌨️ Esc: Close</span>
                </div>
                <div class="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                  <span>Advanced mode</span>
                  <div class="w-1 h-4 bg-gradient-to-t from-orange-400 to-red-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </Portal>}
      </Show>
      <ComponentCreationModal isOpen={showComponentModal()} onClose={() => setShowComponentModal(false)} />
    </Motion.div>
  )
}
