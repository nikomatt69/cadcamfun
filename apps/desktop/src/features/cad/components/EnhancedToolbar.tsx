import { copyText } from "../../../shared/lib/clipboard.ts"
import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Activity, Blocks, BookOpen, ChevronDown, Copy, Maximize, Menu, MousePointer, Moon, History, RotateCcw, RotateCw, Ruler, Save, SquarePlus, Sun, Upload, Wrench, X } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { prefersDark } from "../../../shared/state/settings.ts"
import SimulationPanel from "./SimulationPanel.tsx"
import ComponentCreationModal from "./ComponentCreationModal.tsx"
import { PmiPanel } from "../../pmi/index.ts"

export interface EnhancedToolbarProps {
  readonly sidebarOpen: boolean
  setSidebarOpen(open: boolean): void
  handleSaveProject(): void
  /** Opens the drawing's restore points. */
  onShowVersions?(): void
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

const GLASS_BUTTON = "px-4 py-2 bg-[color:var(--ent-surface-subtle)] border border-[color:var(--ent-line)] hover:bg-[color:var(--ent-surface-inset)] rounded-xl flex items-center transition-colors duration-150 motion-reduce:transition-none"
const ICON_BUTTON = "p-3 rounded-xl hover:bg-[color:var(--ent-surface-inset)] text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)] transition-colors duration-150 motion-reduce:transition-none border border-[color:var(--ent-line)]"
const TOGGLE_ON = "bg-[color:var(--ent-accent-soft)] border-[color:var(--ent-accent)] text-[color:var(--ent-accent)]"
const TOGGLE_OFF = "bg-[color:var(--ent-surface)] border-[color:var(--ent-line-strong)] hover:bg-[color:var(--ent-surface-subtle)] text-[color:var(--ent-text)]"

/** The editor's top bar: menu, save/import/library, undo/redo, view toggles, CAM link, selection summary, FEA and PMI dialogs. */
export default function EnhancedToolbar(props: EnhancedToolbarProps): JSX.Element {
  const [showComponentModal, setShowComponentModal] = createSignal(false)
  const elements = useElementsStore()
  const cad = useCADStore()
  const selection = useSelectionStore()
  const [showElementsPopup, setShowElementsPopup] = createSignal(false)
  const app = useApp()
  const [simulationPosition, setSimulationPosition] = createSignal<{ x: number; y: number } | null>(null)
  const [pmiPosition, setPmiPosition] = createSignal<{ x: number; y: number } | null>(null)
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
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setSimulationPosition(null); setPmiPosition(null); setShowElementsPopup(false) } }
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

  /** Positions a toolbar dialog next to the cursor, keeping it inside the window (like the tool forms). */
  const dialogPosition = (event: MouseEvent, width: number, height: number): { x: number; y: number } => {
    const margin = 20
    let x = event.clientX + 15
    let y = event.clientY + 15
    if (x + width + margin > window.innerWidth) { x = event.clientX - width - 15; if (x < margin) x = window.innerWidth - width - margin }
    if (y + height + margin > window.innerHeight) { y = event.clientY - height - 15; if (y < margin) y = window.innerHeight - height - margin }
    return {
      x: Math.max(margin, Math.min(Math.max(x, margin), window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(Math.max(y, margin), window.innerHeight - height - margin))
    }
  }

  /** Opens the FEA dialog (or closes it); the PMI dialog closes with it, one toolbar dialog at a time. */
  const openSimulation = (event: MouseEvent) => {
    if (simulationPosition()) { setSimulationPosition(null); return }
    setPmiPosition(null)
    setSimulationPosition(dialogPosition(event, Math.min(1200, window.innerWidth * 0.95), Math.min(800, window.innerHeight * 0.9)))
  }

  /** Opens the PMI dialog like the FEA one; the FEA dialog closes with it, one toolbar dialog at a time. */
  const openPmi = (event: MouseEvent) => {
    if (pmiPosition()) { setPmiPosition(null); return }
    setSimulationPosition(null)
    setPmiPosition(dialogPosition(event, Math.min(640, window.innerWidth * 0.95), Math.min(800, window.innerHeight * 0.9)))
  }

  return (
    <Motion.div
      class="workstation-toolbar flex items-center justify-between w-full text-[color:var(--ent-text)]"
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, easing: "ease-out" }}
    >
      <Motion.div
        class="flex w-max rounded-2xl items-center bg-[color:var(--ent-surface)] p-2 border border-[color:var(--ent-line)]"
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      >
        <Motion.button
          class="mr-2 p-3 rounded-xl hover:bg-[color:var(--ent-surface-inset)] focus:outline-none transition-colors duration-150 motion-reduce:transition-none border border-[color:var(--ent-line)]"
          onClick={() => props.setSidebarOpen(!props.sidebarOpen)} aria-label={t("cad.toggleSidebar")}
        >
          <Menu size={16} class="text-[color:var(--ent-text-muted)]" />
        </Motion.button>

        <div class="ml-6 flex items-center space-x-3">
          <Motion.button onClick={props.handleSaveProject} class={GLASS_BUTTON} title={t("cad.saveProject")}>
            <Save size={16} class="text-[color:var(--ent-text-muted)]" />
          </Motion.button>
          <Show when={props.onShowVersions}>
            <Motion.button onClick={() => props.onShowVersions?.()} class={GLASS_BUTTON} title={t("save.versions.title")} data-testid="open-versions">
              <History size={16} class="text-[color:var(--ent-text-muted)]" />
            </Motion.button>
          </Show>
          <Motion.button onClick={() => { props.setDialogMode("import"); props.setShowImportExportDialog(true) }} class={GLASS_BUTTON} title={t("cad.importProject")}>
            <Upload size={16} class="text-[color:var(--ent-text-muted)]" />
          </Motion.button>
          <Motion.button onClick={() => props.setShowUnifiedLibrary(true)} class={GLASS_BUTTON} title={t("cad.unifiedLibrary")}>
            <BookOpen size={16} class="text-[color:var(--ent-text-muted)]" />
          </Motion.button>
          <Motion.button onClick={() => props.setShowCustomElements(true)} class={GLASS_BUTTON} title={t("cad.customElements.open")}>
            <Blocks size={16} class="text-[color:var(--ent-text-muted)]" />
          </Motion.button>

          <Show when={selectedCount() > 0 || elements.selectedElement}>
            <Motion.button
              onClick={createComponentFromSelected}
              class="px-4 py-2 bg-[color:var(--ent-accent-soft)] border border-[color:var(--ent-accent)] text-[color:var(--ent-accent)] rounded-xl flex items-center transition-colors duration-150 motion-reduce:transition-none"
              title={t("cad.createComponent.title")}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            >
              <SquarePlus size={16} class="mr-1.5" />
              <span class="text-sm font-medium">{t("cad.createComponent.title")}</span>
            </Motion.button>
          </Show>

          <div class="h-6 border-l border-[color:var(--ent-line)] mx-3" />
          <Motion.button title={t("cad.undo")} onClick={() => elements.undo()} class={ICON_BUTTON}><RotateCcw size={16} /></Motion.button>
          <Motion.button title={t("cad.redo")} onClick={() => elements.redo()} class={ICON_BUTTON}><RotateCw size={16} /></Motion.button>
          <div class="h-5 border-l border-[color:var(--ent-line-strong)] mx-1" />

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
            class={`p-1.5 border shadow-sm rounded-md flex items-center transition-colors duration-150 motion-reduce:transition-none ${simulationPosition() ? TOGGLE_ON : TOGGLE_OFF}`}
            title={t("cad.tb.openFea")}
          >
            <Activity size={16} />
          </button>
          <button
            onClick={openPmi}
            class={`p-1.5 border shadow-sm rounded-md flex items-center ${pmiPosition() ? TOGGLE_ON : TOGGLE_OFF}`}
            title={t("cad.pmi.title")}
            data-testid="cad-pmi-toolbar-button"
            aria-expanded={pmiPosition() !== null}
          >
            <Ruler size={16} />
          </button>
          <A href="/cam" class="p-1.5 flex items-center bg-[color:var(--ent-action)] text-[color:var(--ent-action-text)] hover:bg-[color:var(--ent-action-hover)] border-0 rounded-md" title={t("cad.switchCam")}>
            <Wrench size={16} />
            <span class="ml-1.5 text-sm font-medium">{t("cad.cam")}</span>
          </A>
          <Show when={props.pluginButtons}>
            <div class="h-5 border-l border-[color:var(--ent-line-strong)] mx-1" />
            {props.pluginButtons}
          </Show>
        </div>
      </Motion.div>

      <Motion.div class="flex items-center space-x-3" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Show when={props.selectedLibraryComponent}>
          <Motion.div
            class="px-4 py-2 bg-[color:var(--ent-accent-soft)] border border-[color:var(--ent-accent)] rounded-xl flex items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          >
            <span class="text-xs text-[color:var(--ent-accent)] mr-2">{t("cad.tb.componentSelected")}</span>
            <span class="text-sm font-medium">{t("cad.tb.readyPlace")}</span>
            <Motion.button
              onClick={() => props.setIsPlacingComponent(true)}
              class="ml-3 px-3 py-1.5 bg-[color:var(--ent-action)] hover:bg-[color:var(--ent-action-hover)] text-[color:var(--ent-action-text)] rounded-xl flex items-center transition-colors duration-150 motion-reduce:transition-none"
              title={t("cad.tb.placeComponent")}
            >
              <MousePointer size={14} class="mr-1" />
              <span class="text-xs font-medium">{t("cad.tb.place")}</span>
            </Motion.button>
            <Motion.button onClick={() => props.setSelectedLibraryComponent(null)} class="ml-2 p-1.5 rounded-xl hover:bg-[color:var(--ent-surface-inset)] text-[color:var(--ent-accent)] transition-colors duration-150 motion-reduce:transition-none" aria-label={t("cad.tb.clearComponent")}>
              <X size={14} />
            </Motion.button>
          </Motion.div>
        </Show>

        <div class="relative z-[1000]">
          <Motion.button
            onClick={() => setShowElementsPopup(!showElementsPopup())}
            class="px-4 py-2 border border-[color:var(--ent-line)] rounded-xl flex items-center bg-[color:var(--ent-surface-subtle)] hover:bg-[color:var(--ent-surface-inset)] cursor-pointer transition-colors duration-150 motion-reduce:transition-none"
           
          >
            <span class="text-xs text-[color:var(--ent-text-muted)] mr-2">{t("cad.tb.elementsColon")}</span>
            <span class="text-sm font-medium tabular-nums">{elements.elements.length}</span>
            <Show when={selectedCount() > 0}>
              <span class="ml-2 px-2 py-0.5 bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)] text-xs tabular-nums rounded-full">{selectedCount()} selected</span>
            </Show>
            <ChevronDown size={14} class="ml-2 text-[color:var(--ent-text-muted)]" />
          </Motion.button>

          <Show when={showElementsPopup()}>
            <Motion.div
              ref={popup}
              class="absolute top-full right-0 mt-2 w-80 bg-[color:var(--ent-surface)] border border-[color:var(--ent-line)] rounded-2xl shadow-xl z-1000"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              style={{ "pointer-events": "auto" }}
            >
              <div class="p-3 border-b border-[color:var(--ent-line)] flex justify-between items-center gap-3">
                <h3 class="text-sm font-semibold text-[color:var(--ent-text)]">Selected Elements ({selectedCount()})</h3>
                <Show when={selectedCount() > 0}>
                  <button onClick={createComponentFromSelection} class="px-2 py-1 bg-[color:var(--ent-action)] hover:bg-[color:var(--ent-action-hover)] text-[color:var(--ent-action-text)] text-xs rounded-md flex items-center">
                    <SquarePlus size={14} class="mr-1" />
                    {t("cad.createComponent.title")}
                  </button>
                </Show>
              </div>
              <div class="max-h-48 overflow-y-auto p-2">
                <Show when={selectedCount() > 0} fallback={
                  <div class="text-center py-4 text-[color:var(--ent-text-muted)] text-xs">{t("cad.tb.noneSelected")}</div>
                }>
                  <div class="space-y-1">
                    <For each={selectedElements()}>{(element) =>
                      <div class="flex items-center justify-between gap-3 p-2 bg-[color:var(--ent-surface-subtle)] rounded text-xs">
                        <div class="flex items-center">
                          <div class="w-3 h-3 rounded-full mr-2" style={{ "background-color": typeof element.color === "string" ? element.color : "#1e88e5" }} />
                          <span class="font-medium">{element.type}</span>
                          <span class="ml-2 text-[color:var(--ent-text-muted)] font-mono">{element.id.substring(0, 12)}...</span>
                        </div>
                        <button
                          class="text-[color:var(--ent-text-faint)] hover:text-[color:var(--ent-text)]" title={t("cad.tb.copyId")}
                          onClick={() => { void copyText(element.id).then(() => toast.success(t("shell.clipboard.copied")), () => toast.error(t("shell.clipboard.failed"))) }}
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
            class="px-4 py-2 border border-[color:var(--ent-line)] rounded-xl flex items-center bg-[color:var(--ent-surface-subtle)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          >
            <span class="text-xs text-[color:var(--ent-text-muted)] mr-2">{t("cad.tb.selectedColon")}</span>
            <span class="text-sm font-medium">{selected().id.substring(0, 8)}...</span>
          </Motion.div>}
        </Show>
      </Motion.div>

      <Show when={simulationPosition()}>{(position) =>
        <Portal>
          <div class="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" onClick={() => setSimulationPosition(null)} />
          <div
            class="panel fixed z-[9999] bg-[color:var(--panel-bg)] rounded-2xl shadow-2xl border border-[color:var(--panel-border)] overflow-hidden"
            style={{ top: `${position().y}px`, left: `${position().x}px`, width: `${Math.min(1200, window.innerWidth * 0.95)}px`, height: `${Math.min(800, window.innerHeight * 0.9)}px` }}
          >
            <div class="flex items-center justify-between p-4 border-b border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)]">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-[color:var(--panel-accent)] rounded-lg flex items-center justify-center"><Activity size={16} class="text-white" /></div>
                <div>
                  <h2 class="text-lg font-semibold text-[color:var(--panel-text)]">{t("cad.tb.feaTitle")}</h2>
                  <p class="text-sm text-[color:var(--panel-text-muted)]">{t("cad.tb.feaSubtitle")}</p>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <div class="text-xs text-[color:var(--panel-text-muted)] mr-4">
                  <span class="inline-flex items-center"><div class="w-2 h-2 bg-[color:var(--panel-ok)] rounded-full mr-1" />{t("cad.tb.systemActive")}</span>
                </div>
                <button onClick={() => setSimulationPosition(null)} class="p-2 rounded-lg hover:bg-[color:var(--panel-bg-subtle)] text-[color:var(--panel-text-muted)] hover:text-[color:var(--panel-text)] transition-colors" aria-label={t("cad.drawing.close")}><X size={16} /></button>
              </div>
            </div>
            <div class="h-[calc(100%-4rem)] overflow-hidden"><SimulationPanel /></div>
            <div class="absolute bottom-0 left-0 right-0 bg-[color:var(--panel-bg-subtle)] border-t border-[color:var(--panel-border)] px-4 py-2">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center space-x-4 text-[color:var(--panel-text-muted)]">
                  <span class="flex items-center"><div class="w-2 h-2 bg-[color:var(--panel-accent)] rounded-full mr-1" />{t("cad.tb.simActive")}</span>
                  <span>Ctrl+Shift+S: Toggle simulation{/* i18n-ok */}</span>
                  <span>F9: Switch mode{/* i18n-ok */}</span>
                  <span>Esc: Close{/* i18n-ok */}</span>
                </div>
                <div class="flex items-center space-x-2 text-[color:var(--panel-text-muted)]">
                  <span>{t("cad.tb.advancedMode")}</span>
                </div>
              </div>
            </div>
          </div>
        </Portal>}
      </Show>

      <Show when={pmiPosition()}>{(position) =>
        <Portal>
          <div class="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" onClick={() => setPmiPosition(null)} />
          <div
            class="panel fixed z-[9999] bg-[color:var(--panel-bg)] rounded-2xl shadow-2xl border border-[color:var(--panel-border)] overflow-hidden"
            style={{ top: `${position().y}px`, left: `${position().x}px`, width: `${Math.min(640, window.innerWidth * 0.95)}px`, height: `${Math.min(800, window.innerHeight * 0.9)}px`, "background": "var(--panel-bg)", "color": "var(--panel-text)" }}
            data-testid="cad-pmi-dialog"
            role="dialog"
            aria-label={t("cad.pmi.title")}
          >
            <div class="flex items-center justify-between p-4" style={{ "border-bottom": "1px solid var(--panel-border)", "background": "var(--panel-bg-subtle)" }}>
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center" style={{ "background": "var(--panel-accent)" }}><Ruler size={16} class="text-white" /></div>
                <div>
                  <h2 class="text-lg font-semibold" style={{ "color": "var(--panel-text)" }}>{t("cad.pmi.title")}</h2>
                  <p class="text-sm" style={{ "color": "var(--panel-text-muted)" }}>{t("cad.pmi.description")}</p>
                </div>
              </div>
              <button onClick={() => setPmiPosition(null)} class="p-2 rounded-lg transition-colors" style={{ "color": "var(--panel-text-muted)" }} aria-label={t("cad.drawing.close")}><X size={16} /></button>
            </div>
            <div class="h-[calc(100%-4rem)] overflow-y-auto p-4"><PmiPanel embedded /></div>
          </div>
        </Portal>}
      </Show>
      <ComponentCreationModal isOpen={showComponentModal()} onClose={() => setShowComponentModal(false)} />
    </Motion.div>
  )
}
