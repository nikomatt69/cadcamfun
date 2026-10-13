/**
 * The `/cam` editor, laid out like the legacy `pages/cam.tsx`.
 *
 * Top toolbar with the four workspace tabs; the left sidebar (explorer / settings / machine); the central panel
 * (preview, G-code editor, toolpath, post-processor); and the right sidebar with the "Generator" and "Cycles" tabs.
 * The generator turns the CAD selection into G-code (sidecar `toolpathGenerator` group); the page keeps that text,
 * mirrors it into the CAM store and asks the sidecar to parse it into the program the 3D views play back, so
 * generated, imported and hand-edited code all share one pipeline.
 */
import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Box, ChevronLeft, ChevronRight, ShieldCheck, Wrench } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { syncDocumentSettings } from "../../../shared/state/document-settings.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { kernelStockOf, stockOf } from "../lib/job.ts"
import CamStatusBar from "../components/CamStatusBar.tsx"
import { buildPlayback, colorHex, toolColors } from "../../../viewport/view3d/playback.ts"
import { makeToolpathGenerator } from "../api/generator.ts"
import { combineOperationResults, useCamStore } from "../store/camStore.ts"
import { useGeneratorStore, type LibraryTool } from "../store/generatorStore.ts"
import CamToolbar from "../components/CamToolbar.tsx"
import CamSidebar, { type SidebarTab } from "../components/CamSidebar.tsx"
import ToolpathGenerator from "../components/ToolpathGenerator.tsx"
import VerifyPanel from "../components/VerifyPanel.tsx"
import ToolpathVisualizer from "../components/ToolpathVisualizer.tsx"
import GCodeEditor from "../components/GCodeEditor.tsx"
import MachineCycles from "../components/MachineCycles.tsx"
import PostProcessorTab, { type PostProcessorType } from "../components/PostProcessorTab.tsx"
import { CostsModal, ToolLibraryModal } from "../components/CamModals.tsx"
import CamRibbon from "../components/CamRibbon.tsx"
import { FixedCycleEditor } from "../components/generator/FixedCyclesSection.tsx"
import "../../../styles/workstation.css"

const rise = { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } }
const PARSE_DELAY_MS = 400

const RIGHT_TAB_ON = "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
const RIGHT_TAB_OFF = "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"

/** Maps the seven legacy controller names onto the three the CAM store knows. */
const storeController = (post: PostProcessorType): "gcode" | "grbl" | "fanuc" => (post === "fanuc" ? "fanuc" : "gcode")

export default function CamPage(): JSX.Element {
  const app = useApp()
  const camStore = useCamStore()
  const gen = useGeneratorStore()
  const cadStore = useCADStore()
  const elementStore = useElementsStore()
  const previewStock = createMemo(() => camStore.kernelArtifact?.nc === camStore.gcode
    ? kernelStockOf(camStore.kernelArtifact)
    : stockOf({ elements: elementStore.elements, selectedElement: null, selectedIds: [], workpiece: cadStore.workpiece, workpieceElementId: camStore.selectedWorkpieceElementId, stockAllowance: camStore.stockAllowance }))
  const generator = makeToolpathGenerator(app.client)
  const [search, setSearch] = useSearchParams()

  const [gcode, setGcodeSignal] = createSignal<string>(camStore.gcode)
  const [processedGcode, setProcessedGcode] = createSignal("")
  const [selectedPostProcessor, setSelectedPostProcessor] = createSignal<PostProcessorType>("fanuc")
  const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("machine")
  const [showLibrary, setShowLibrary] = createSignal(false)
  const [showCosts, setShowCosts] = createSignal(false)
  let ribbonFilePicker: HTMLInputElement | undefined

  const setGcode = (next: string): void => {
    setGcodeSignal(next)
    camStore.setGcode(next)
  }

  // The assistant (or another panel) can set the program in the store: the editor shows it too.
  createEffect(on(() => camStore.gcode, (next) => { if (next !== gcode()) setGcodeSignal(next) }, { defer: true }))

  // The raw piece follows the CAD (legacy `syncWorkpieceFromCAD` on mount).
  onMount(() => { syncDocumentSettings(app); camStore.syncWorkpieceFromCAD() })

  // Preview and Toolpath play a program; for any G-code text (imported, edited, generated) the sidecar parses it.
  createEffect(on(gcode, (text) => {
    if (text.trim().length === 0) return
    // The text the store composed from the assistant's operations already has its program (every operation's toolpaths,
    // one colour per tool): parsing the concatenated programs back would collapse them into one.
    if (camStore.operationResults.length > 0 && text === combineOperationResults(camStore.operationResults).gcode) return
    // The kernel returned this exact program with named operations/tool changes; reparsing would discard that structure.
    if (camStore.kernelArtifact?.nc === text) return
    const timer = setTimeout(() => {
      void app.runtime.run(generator.parse(text)).then(
        (parsed) => camStore.setProgram(parsed.program as never),
        () => undefined
      )
    }, PARSE_DELAY_MS)
    onCleanup(() => clearTimeout(timer))
  }, { defer: true }))

  const duration = createMemo(() => buildPlayback(camStore.program).duration)
  // Leaving the page stops the simulation clock.
  onCleanup(() => camStore.setPlaying(false))

  // The simulation stops by itself at the end of the program.
  createEffect(() => {
    if (camStore.playing && duration() > 0 && camStore.playbackTime >= duration()) camStore.setPlaying(false)
  })

  const rows = createMemo(() => {
    const colors = toolColors(camStore.program)
    return camStore.program.toolpaths.map((tp) => {
      const color = colors.get(tp.toolId)
      return { id: tp.id, name: tp.name, toolId: tp.toolId, moves: tp.moves.length, ...(color !== undefined ? { color: colorHex(color) } : {}) }
    })
  })

  const loadFromStorage = (key: string): { readonly id?: string; readonly name?: string; readonly gcode?: string } | undefined => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : undefined
    } catch { return undefined }
  }
  const clearParam = (name: "loadToolpath" | "loadTool", storageKey: string): void => {
    try { localStorage.removeItem(storageKey) } catch { /* storage blocked */ }
    // `replace`: the consumed hand-off must not become a history entry the Back button returns to.
    setSearch({ [name]: undefined }, { replace: true, state: {} })
  }

  // `?loadToolpath=<id>`: the toolpaths page leaves the program in localStorage (legacy hand-off).
  createEffect(() => {
    const id = search.loadToolpath
    if (typeof id !== "string") return
    const data = loadFromStorage("toolpathToLoadInCAM")
    if (!data) { toast.error(t("cam.toast.toolpathNotFound")); clearParam("loadToolpath", "toolpathToLoadInCAM"); return }
    if (!data.id || data.id !== id) { toast.error(t("cam.toast.toolpathInvalid")); return }
    if (data.gcode) {
      setGcode(data.gcode)
      camStore.setActiveTab("editor")
      setTimeout(() => toast.success(t("cam.toast.switchToToolpath")), 1500)
    }
    toast.success(t("cam.toast.toolpathLoaded", { name: data.name ?? "" }))
    clearParam("loadToolpath", "toolpathToLoadInCAM")
  })

  // `?loadTool=<id>`: the tools page leaves the tool in localStorage; it becomes the generator's tool.
  createEffect(() => {
    const id = search.loadTool
    if (typeof id !== "string") return
    const data = loadFromStorage("toolToLoadInCAM")
    if (!data) { toast.error(t("cam.toast.toolNotFound")); clearParam("loadTool", "toolToLoadInCAM"); return }
    if (!data.id || data.id !== id) { toast.error(t("cam.toast.toolInvalid")); return }
    gen.selectLibraryTool(data as LibraryTool)
    camStore.setRightTab("generator")
    toast.success(t("cam.toast.toolLoaded", { name: data.name ?? "" }))
    clearParam("loadTool", "toolToLoadInCAM")
  })

  const importGCode = (file: File): void => {
    void file.text().then(
      (text) => setGcode(text),
      () => toast.error(t("cam.toast.readFailed"))
    )
  }

  const saveGCode = (): void => {
    const code = camStore.activeTab === "post" && processedGcode() ? processedGcode() : gcode()
    if (!code) return
    const extension = selectedPostProcessor() === "heidenhain" ? ".h" : ".nc"
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `toolpath-${new Date().toISOString().slice(0, 10)}${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const toggleSimulation = (): void => {
    const next = !camStore.playing
    if (next && camStore.program.toolpaths.length === 0) {
      toast.error(t("cam.toast.nothingToSimulate"))
      return
    }
    camStore.setPlaying(next)
    if (next && (camStore.activeTab === "editor" || camStore.activeTab === "post")) camStore.setActiveTab("toolpath")
  }

  // "Process G-Code": re-parse the edited text so the views and the statistics match it.
  const processGCode = (): void => {
    void app.runtime.run(generator.parse(gcode())).then(
      (parsed) => {
        camStore.setProgram(parsed.program as never)
        for (const warning of parsed.warnings) toast(warning)
        toast.success(t("cam.toast.parsed", { count: parsed.program.toolpaths.length }))
      },
      (cause) => toast.error(cause instanceof Error ? cause.message : String(cause))
    )
  }

  // Cycles are appended while editing, otherwise they replace the program (legacy `handleCycleCodeGenerated`).
  const onCycleCode = (code: string): void => {
    setGcode(camStore.activeTab === "editor" && gcode() ? `${gcode()}\n\n${code}` : code)
    camStore.setActiveTab("editor")
  }

  const selectToolpath = (id: string | undefined): void => {
    camStore.setSelectedOperationId(id)
    if (id !== undefined) camStore.setActiveTab("toolpath")
  }
  const deleteToolpath = (id: string): void => {
    camStore.setProgram({ ...camStore.program, toolpaths: camStore.program.toolpaths.filter((tp) => tp.id !== id) })
    if (camStore.selectedOperationId === id) camStore.setSelectedOperationId(undefined)
  }

  // The AI copilot is the docked assistant panel: the toggle opens/closes it and gates the generator's AI suggestions.
  const toggleAi = (): void => {
    const next = !app.panelOpen()
    app.setPanelOpen(next)
    gen.updateSettings("useAI", next)
  }

  const cycleController = (): "fanuc" | "heidenhain" => (selectedPostProcessor() === "heidenhain" ? "heidenhain" : "fanuc")

  const rightTabButton = (id: "generator" | "cycles" | "verify", label: string, icon: (size: number) => JSX.Element): JSX.Element => (
    <Show
      when={camStore.rightOpen}
      fallback={
        <button class={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${camStore.rightTab === id ? RIGHT_TAB_ON : RIGHT_TAB_OFF}`} aria-pressed={camStore.rightTab === id} onClick={() => camStore.setRightTab(id)} title={label}>
          {icon(20)}
        </button>
      }
    >
      <button class={`flex-1 py-4 px-3 text-sm font-medium glass-hover-light rounded-xl transition-all duration-200 ${camStore.rightTab === id ? RIGHT_TAB_ON : RIGHT_TAB_OFF}`} aria-pressed={camStore.rightTab === id} onClick={() => camStore.setRightTab(id)}>
        <div class="flex items-center justify-center">
          <span class="mr-2">{icon(16)}</span>
          {label}
        </div>
      </button>
    </Show>
  )

  return (
    <Motion.div
      class="cam-workspace h-full w-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Motion.div
        class="cam-workspace__frame flex flex-col h-full w-full"
        {...rise}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <CamToolbar
          canSave={(camStore.activeTab === "post" ? processedGcode() : gcode()).length > 0}
          isSimulating={camStore.playing}
          aiEnhanced={app.panelOpen()}
          showChat={app.panelOpen()}
          onSave={saveGCode}
          onImport={importGCode}
          onToggleSimulation={toggleSimulation}
          onOpenLibrary={() => setShowLibrary(true)}
          onOpenCosts={() => setShowCosts(true)}
          onToggleAi={toggleAi}
          onToggleChat={() => app.setPanelOpen(!app.panelOpen())}
        />

        <CamRibbon
          onSave={saveGCode}
          onImport={() => ribbonFilePicker?.click()}
          onOpenLibrary={() => setShowLibrary(true)}
          onOpenCosts={() => setShowCosts(true)}
          onSelectActiveTab={(next) => camStore.setActiveTab(next)}
          onSelectRightTab={(next) => camStore.setRightTab(next)}
          onSelectSidebarTab={(next) => {
            setSidebarTab(next)
            if (!camStore.sidebarOpen) camStore.toggleSidebar()
          }}
          onSelectPostProcessor={(next) => {
            setSelectedPostProcessor(next === "heidenhain" ? "heidenhain" : next === "gcode" ? "generic" : "fanuc")
          }}
          postProcessor={selectedPostProcessor() === "heidenhain" ? "heidenhain" : selectedPostProcessor() === "fanuc" ? "fanuc" : "gcode"}
        />

        <input
          ref={ribbonFilePicker}
          type="file"
          class="hidden"
          accept=".nc,.gcode,.cnc,.txt"
          aria-label="Import G-Code"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) importGCode(file)
            event.currentTarget.value = ""
          }}
        />

        <Motion.div
          class="cam-workspace__body flex flex-1 overflow-hidden w-full"
          {...rise}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <CamSidebar
            activeTab={sidebarTab()}
            onSelectTab={setSidebarTab}
            isOpen={camStore.sidebarOpen}
            setIsOpen={camStore.toggleSidebar}
            toolpaths={rows()}
            selectedId={camStore.selectedOperationId}
            onSelectToolpath={selectToolpath}
            onDeleteToolpath={deleteToolpath}
            onGCodeGenerated={setGcode}
          />

          <Motion.div
            class="cam-workspace__stage flex-1 min-w-0 relative overflow-hidden rounded-2xl mx-2"
            {...rise}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <Show when={camStore.activeTab === "preview"}>
              <div class="h-full">
                <ToolpathVisualizer stock={previewStock()} program={camStore.program} workpiece={camStore.workpiece} playing={camStore.playing} playbackTime={camStore.playbackTime} playbackRate={1} onPlaybackTimeChange={camStore.setPlaybackTime} />
              </div>
            </Show>
            <Show when={camStore.activeTab === "editor"}>
              <div class="h-full">
                <GCodeEditor value={gcode()} onChange={setGcode} onProcess={processGCode} />
              </div>
            </Show>
            <Show when={camStore.activeTab === "toolpath"}>
              <div class="h-full rounded-xl">
                <ToolpathVisualizer stock={previewStock()} program={camStore.program} workpiece={camStore.workpiece} playing={camStore.playing} playbackTime={camStore.playbackTime} playbackRate={1} onPlaybackTimeChange={camStore.setPlaybackTime} />
              </div>
            </Show>
            <Show when={camStore.activeTab === "post"}>
              <PostProcessorTab
                gcode={gcode()}
                program={camStore.program}
                controller={selectedPostProcessor()}
                onControllerChange={(next) => { setSelectedPostProcessor(next); camStore.setController(storeController(next)) }}
                onProcessedGcode={setProcessedGcode}
              />
            </Show>
          </Motion.div>

          <Motion.div
            class="cam-workspace__inspector flex-shrink-0 dark:text-white h-full flex flex-col"
            data-open={camStore.rightOpen}
          >
            <div class="cam-workspace__tabs w-full flex justify-center">
              <div class={camStore.rightOpen ? "flex justify-center w-full text-center" : "flex flex-col w-full"}>
                {rightTabButton("generator", t("cam.generatorPanel"), (size) => <Wrench size={size} />)}
                {rightTabButton("cycles", t("cam.cycles"), (size) => <Box size={size} />)}
                {rightTabButton("verify", t("cam.verify"), (size) => <ShieldCheck size={size} />)}
              </div>
            </div>

            <Show when={camStore.rightOpen}>
              <div class="workstation-generator min-h-0 flex-1 overflow-y-auto">
                <Show when={camStore.rightTab === "generator" || camStore.rightTab === "control"}>
                  <ToolpathGenerator onGCodeGenerated={setGcode} />
                </Show>
                <Show when={camStore.rightTab === "verify"}>
                  <VerifyPanel />
                </Show>
                <Show when={camStore.rightTab === "cycles"}>
                  <MachineCycles controllerType={cycleController()} onCycleCodeGenerated={onCycleCode} />
                  <Show when={gcode().trim().length > 0}>
                    <CycleLines gcode={gcode()} />
                  </Show>
                </Show>
              </div>
            </Show>
          </Motion.div>

          <Motion.button
            class="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 glass-interactive backdrop-blur-md bg-white/90 dark:bg-gray-800/90 p-3 rounded-l-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/95 dark:hover:bg-gray-700/95 transition-all duration-200"
            onClick={() => camStore.toggleRight()}
            hover={{ scale: 1.05, x: -2 }}
            press={{ scale: 0.95 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.4 }}
            aria-label={t("cam.toggleProperties")}
          >
            <Motion.div animate={{ rotate: camStore.rightOpen ? 0 : 180 }} transition={{ duration: 0.3 }}>
              <Show when={camStore.rightOpen} fallback={<ChevronLeft size={20} class="text-gray-600 dark:text-gray-300" />}>
                <ChevronRight size={20} class="text-gray-600 dark:text-gray-300" />
              </Show>
            </Motion.div>
          </Motion.button>
        </Motion.div>

        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.6 }}>
          <CamStatusBar />
        </Motion.div>
      </Motion.div>

      <ToolLibraryModal isOpen={showLibrary()} onClose={() => setShowLibrary(false)} />
      <CostsModal isOpen={showCosts()} onClose={() => setShowCosts(false)} />
    </Motion.div>
  )
}

/** The fixed-cycle lines of the current program, each editable in place (legacy `FixedCyclesUIRenderer`). */
function CycleLines(props: { readonly gcode: string }): JSX.Element {
  const lines = createMemo(() => props.gcode.split(/\r?\n/).filter((line) => /^\s*G(7[4-9]|8[1-9])\b/i.test(line)))
  return (
    <Show when={lines().length > 0}>
      <div class="p-3 space-y-2" data-testid="cycle-lines">
        {lines().map((line) => <FixedCycleEditor line={line.trim()} />)}
      </div>
    </Show>
  )
}
