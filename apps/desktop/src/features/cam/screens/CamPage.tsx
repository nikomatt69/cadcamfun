/**
 * The `/cam` editor, laid out like the legacy `pages/cam.tsx`.
 *
 * Top toolbar with the four workspace tabs; the left sidebar (explorer / settings / machine); the central panel
 * (preview, G-code editor, toolpath, post-processor); and the right sidebar with the "Generator" and "Cycles" tabs.
 * The generator turns the CAD selection into G-code (sidecar `toolpathGenerator` group); the page keeps that text,
 * mirrors it into the CAM store and asks the sidecar to parse it into the program the 3D views play back, so
 * generated, imported and hand-edited code all share one pipeline.
 */
import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack, type JSX } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { WorkspaceInspector } from "../../../shared/components/panel/inspector.tsx"
import { Box, ShieldCheck, Wrench } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { syncDocumentSettings } from "../../../shared/state/document-settings.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { kernelStockOf, stockOf } from "../lib/job.ts"
import { operationToolsOf, previewSetup, previewToolModel, resolveMachineKind } from "../lib/machine-view.ts"
import CamStatusBar from "../components/CamStatusBar.tsx"
import { colorHex, toolColors } from "../../../viewport/view3d/playback.ts"
import { makeToolpathGenerator } from "../api/generator.ts"
import { combineOperationResults, useCamStore } from "../store/camStore.ts"
import { useGeneratorStore, type LibraryTool } from "../store/generatorStore.ts"
import CamToolbar from "../components/CamToolbar.tsx"
import CamSidebar, { type SidebarTab } from "../components/CamSidebar.tsx"
import ToolpathGenerator from "../components/ToolpathGenerator.tsx"
import VerifyPanel from "../components/VerifyPanel.tsx"
import ToolpathVisualizer from "../components/ToolpathVisualizer.tsx"
import TitleBlockOverlay from "../../cad/components/TitleBlockOverlay.tsx"
import GCodeEditor from "../components/GCodeEditor.tsx"
import MachineCycles from "../components/MachineCycles.tsx"
import PostProcessorTab, { type PostProcessorType } from "../components/PostProcessorTab.tsx"
import { CostsModal, ToolLibraryModal } from "../components/CamModals.tsx"
import CamRibbon from "../components/CamRibbon.tsx"
import { FixedCycleEditor } from "../components/generator/FixedCyclesSection.tsx"
import "../../../styles/workstation.css"
import SaveCamModal from "../components/SaveCamModal.tsx"
import { projectSession } from "../../projects/lib/project-session.ts"
import { restoreCamProgram, SavedCamProgram } from "../lib/saved-program.ts"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { captureEditorOwner } from "../../ai/lib/editor-sync.ts"
import { registerProgramSheet } from "../../ai/lib/viewport-capture.ts"
import { renderProgramSheet, programSheetPaths } from "../lib/program-sheet.ts"
import { useVerifyStore } from "../store/verifyStore.ts"
import { mountCamHistory, useCamHistoryStore } from "../store/camHistoryStore.ts"
import CamHistoryModal from "../components/CamHistoryModal.tsx"

const PARSE_DELAY_MS = 400
/** The rapid rate the CAM store's own estimates use (mm/min). */
const RAPID_RATE_MM_PER_MIN = 5000



/** Maps the seven legacy controller names onto the three the CAM store knows. */
const storeController = (post: PostProcessorType): "gcode" | "grbl" | "fanuc" => (post === "fanuc" ? "fanuc" : post === "grbl" ? "grbl" : "gcode")

export default function CamPage(): JSX.Element {
  const app = useApp()
  const camStore = useCamStore()
  const gen = useGeneratorStore()
  const previewSettings = () => gen.currentGCode !== "" && gen.currentGCode === camStore.gcode ? gen.generatedSettings ?? gen.settings : gen.settings
  const previewLibraryTool = () => gen.currentGCode !== "" && gen.currentGCode === camStore.gcode && gen.generatedSettings !== undefined ? gen.generatedTool : gen.selectedLibraryTool
  const cadStore = useCADStore()
  const elementStore = useElementsStore()
  /** The kernel's cutters by toolpath id when the preview shows its program; the generator's tool otherwise. */
  const previewTools = createMemo(() => camStore.kernelArtifact?.nc === camStore.gcode
    ? new Map(camStore.kernelArtifact.tools.map((c) => [c.id, c as cam.kernel.Cutter]))
    : undefined)
  const previewStock = createMemo(() => camStore.kernelArtifact?.nc === camStore.gcode
    ? kernelStockOf(camStore.kernelArtifact)
    : stockOf({ elements: elementStore.elements, selectedElement: null, selectedIds: [], workpiece: cadStore.workpiece, workpieceElementId: camStore.selectedWorkpieceElementId, stockAllowance: camStore.stockAllowance }))
  // The machine the preview shows (spec 31): the user's pick, else the program's producer, else its words, else the setting.
  const kernelShown = (): boolean => camStore.kernelArtifact !== undefined && camStore.kernelArtifact.nc === camStore.gcode
  const inferredMachine = createMemo(() => cam.inferMachineKind(camStore.gcode))
  const machineChoice = createMemo(() => resolveMachineKind({
    override: camStore.machineOverride,
    produced: kernelShown() ? { kind: "mill", source: "kernel" } : gen.currentGCode !== "" && gen.currentGCode === camStore.gcode ? { kind: previewSettings().machineType, source: "generator" } : undefined,
    inferred: inferredMachine(),
    setting: gen.settings.machineType
  }))
  const toolModel = createMemo(() => previewToolModel(machineChoice().kind, previewSettings(), previewLibraryTool()))
  // The generator's tool against its operation: only for the generator's own program on its own machine.
  const toolIssues = createMemo(() => gen.currentGCode !== "" && gen.currentGCode === camStore.gcode && machineChoice().kind === previewSettings().machineType ? cam.settingsToolIssues(previewSettings(), toolModel()) : [])
  // The assistant's operations shown together: each one's own tool (spec 32 §4.2).
  const operationTools = createMemo(() => camStore.operationResults.length > 0 && combineOperationResults(camStore.operationResults).gcode === camStore.gcode
    ? operationToolsOf(camStore.operationResults)
    : [])
  // An imported program split at its tool changes (T1, T2…): each tool as its header comments describe it.
  const importedTools = createMemo(() => {
    if (kernelShown() || operationTools().length > 0 || gen.currentGCode !== "" && gen.currentGCode === camStore.gcode) return []
    return [...cam.programTools(camStore.program, camStore.motion, camStore.gcode, machineChoice().kind).values()].map((tool) => ({
      ...tool, name: camStore.program.toolpaths.find((path) => path.toolId === tool.toolId)?.name ?? tool.toolId
    }))
  })
  const headerModels = createMemo(() => {
    if (importedTools().length > 0) return new Map(importedTools().map((tool) => [tool.toolId, tool.model]))
    const used = cam.viewer.turnMillAxesOf(camStore.program)
    if (machineChoice().kind === "lathe" && (used.milling || used.cPositioned)) return cam.viewer.turnMillToolModels(camStore.program, camStore.motion, camStore.gcode)
    return undefined
  })
  const operationToolModels = createMemo(() => operationTools().length > 0 ? new Map(operationTools().map((o) => [o.toolId, o.model])) : (headerModels()?.size ?? 0) > 0 ? headerModels() : undefined)
  const previewMachine = createMemo(() => previewSetup(machineChoice().kind, previewSettings(), previewStock(), {
    ...(kernelShown() ? { artifact: camStore.kernelArtifact, machineId: gen.kernelSettings.machine } : {}),
    program: camStore.program, gcode: camStore.gcode, tool: toolModel()
  }))
  const previewDefaultTool = createMemo(() => machineChoice().kind === "mill" ? cam.kernel.settingsCutter(previewSettings()) : undefined)
  /** What the program sheet says about the program: the machine, its toolpaths and their moves. */
  const sheetSummary = createMemo(() => {
    const paths = camStore.program.toolpaths
    const machine = machineChoice().kind
    return {
      machine,
      name: camStore.program.name,
      toolpaths: paths.map((path) => ({ id: path.id, name: path.name, toolId: path.toolId, moves: path.moves.length })),
      moves: paths.reduce((sum, path) => sum + path.moves.length, 0),
      durationSeconds: paths.reduce((sum, path) => sum + cam.estimateTime(path, RAPID_RATE_MM_PER_MIN), 0),
      // The toolpath the sheet draws: the cutting plane of the machine the program is for.
      paths: programSheetPaths(camStore.program, machine)
    }
  })
  const generator = makeToolpathGenerator(app.client)
  const [search, setSearch] = useSearchParams()

  const [gcode, setGcodeSignal] = createSignal<string>(camStore.gcode)
  const [processedGcode, setProcessedGcode] = createSignal("")
  const [selectedPostProcessor, setSelectedPostProcessor] = createSignal<PostProcessorType>("fanuc")
  const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("machine")
  const [showLibrary, setShowLibrary] = createSignal(false)
  const [showCosts, setShowCosts] = createSignal(false)
  const [showHistory, setShowHistory] = createSignal(false)
  const [saveRequest, setSaveRequest] = createSignal<{ readonly code: string; readonly extension: string; readonly projectOnly: boolean }>()
  let ribbonFilePicker: HTMLInputElement | undefined
  let parseVersion = 0
  let manualParse: AbortController | undefined
  let automaticParse: AbortController | undefined
  let parseTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => { parseVersion++; manualParse?.abort() })
  createEffect(on(() => [gcode(), selectedPostProcessor()] as const, () => setProcessedGcode(""), { defer: true }))

  const setGcode = (next: string): void => {
    setGcodeSignal(next)
    camStore.setGcode(next)
  }

  // The assistant (or another panel) can set the program in the store: the editor shows it too.
  createEffect(on(() => camStore.gcode, (next) => { if (next !== gcode()) setGcodeSignal(next) }, { defer: true }))

  // The raw piece follows the CAD (legacy `syncWorkpieceFromCAD` on mount).
  onMount(() => { syncDocumentSettings(app); camStore.syncWorkpieceFromCAD() })

  // The CAM's visual capture: the program sheet is always on offer, so the assistant sees the G-code
  // and the toolpaths even while the editor hides the 3D preview. The preview's own capture (the
  // rendered toolpath) wins while it is on screen.
  onMount(() => {
    const stop = registerProgramSheet("cam", () => ({ canvas: renderProgramSheet(camStore.gcode, sheetSummary()) }))
    onCleanup(stop)
  })
  onMount(() => {
    const stopHistory = mountCamHistory()
    // One history for the whole page, including the G-code editor: it answers Undo/Redo even while that editor has the focus.
    const inEditor = (target: EventTarget | null): boolean => target instanceof Element && target.closest(".cam-editor__code") !== null
    const step = (seconds: number) => (): boolean | void => {
      if (camStore.program.toolpaths.length === 0) return false
      camStore.setPlaybackTime(Math.min(Math.max(camStore.playbackTime + seconds, 0), duration()))
    }
    const off = app.keys.register({
      // A program that already has a stored copy is updated in place (with the drawing it belongs to); a new one, or the
      // Post tab's processed text, goes through the save dialog.
      "file.save": () => {
        const saved = camStore.savedProgram
        if (saved && !saved.postProcessed && camStore.activeTab !== "post") void projectSession(app).saveInteractive()
        else saveGCode()
      },
      "file.export": () => { saveGCode() },
      "file.import": () => { ribbonFilePicker?.click() },
      "edit.undo": { run: () => { useCamHistoryStore.getState().undo() }, inText: inEditor },
      "edit.redo": { run: () => { useCamHistoryStore.getState().redo() }, inText: inEditor },
      "cam.tab.editor": () => { camStore.setActiveTab("editor") },
      "cam.tab.toolpath": () => { camStore.setActiveTab("toolpath") },
      "cam.tab.post": () => { camStore.setActiveTab("post") },
      "cam.process": () => { processGCode() },
      "cam.simulation.toggle": () => { toggleSimulation() },
      "cam.simulation.rewind": () => { camStore.setPlaying(false); camStore.setPlaybackTime(0) },
      "cam.simulation.stepForward": step(1),
      "cam.simulation.stepBack": step(-1),
      "cam.sidebar.toggle": () => { camStore.toggleSidebar() },
      "cam.library.open": () => { setShowLibrary(true) },
      "cam.history.open": () => { setShowHistory(true) }
    })
    onCleanup(() => { stopHistory(); off() })
  })

  // Preview and Toolpath play a program; for any G-code text (imported, edited, generated) the sidecar parses it.
  createEffect(on(gcode, (text) => {
    const version = ++parseVersion
    manualParse?.abort()
    camStore.setPlaying(false)
    camStore.setPlaybackTime(0)
    if (text.trim().length === 0) { camStore.setProgram({ ...camStore.program, toolpaths: [] }); return }
    // The text the store composed from the assistant's operations already has its program (every operation's toolpaths,
    // one colour per tool): parsing the concatenated programs back would collapse them into one.
    if (camStore.operationResults.length > 0 && text === combineOperationResults(camStore.operationResults).gcode) return
    // The kernel returned this exact program with named operations/tool changes; reparsing would discard that structure.
    if (camStore.kernelArtifact?.nc === text) return
    const controller = new AbortController()
    automaticParse = controller
    const owner = captureEditorOwner()
    const timer = setTimeout(() => {
      void app.runtime.run(generator.parse(text), { signal: controller.signal }).then(
        (parsed) => { if (!controller.signal.aborted && version === parseVersion && owner.current() && camStore.gcode === text) camStore.setProgram(parsed.program, parsed.motion) },
        () => { if (!controller.signal.aborted && version === parseVersion && owner.current() && camStore.gcode === text) camStore.setProgram({ ...camStore.program, toolpaths: [] }) }
      )
    }, PARSE_DELAY_MS)
    parseTimer = timer
    onCleanup(() => { clearTimeout(timer); controller.abort() })
  }, { defer: true }))

  // The same start as the preview, so the clock stops where the drawn program ends.
  const duration = createMemo(() => cam.viewer.buildTimeline(camStore.program, camStore.motion, RAPID_RATE_MM_PER_MIN, cam.viewer.programStart(machineChoice().kind, camStore.program)).duration)
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

  const loadFromStorage = (key: string): { readonly id?: string; readonly name?: string; readonly gcode?: string; readonly data?: unknown } | undefined => {
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

  // Read the saved original through the API; the legacy local hand-off remains usable for old unsaved entries.
  createEffect(() => {
    const id = search.loadToolpath
    if (typeof id !== "string") return
    const cached = loadFromStorage("toolpathToLoadInCAM")
    const controller = new AbortController(), owner = captureEditorOwner()
    const previousCode = untrack(() => camStore.gcode)
    const current = () => !controller.signal.aborted && owner.current()
    onCleanup(() => controller.abort())
    void app.runtime.run(app.client.toolpaths.get({ params: { id } }), { signal: controller.signal }).then(async (row) => {
      await restoreCamProgram(app, row, () => current() && camStore.gcode === previousCode)
      if (current()) { toast.success(t("cam.toast.toolpathLoaded", { name: row.name })); clearParam("loadToolpath", "toolpathToLoadInCAM") }
    }, () => {
      if (!current()) return
      if (cached?.id === id && cached.gcode && cached.data === undefined) {
        camStore.clearOperationResults(); camStore.setKernelArtifact(undefined); camStore.setSavedProgram(undefined)
        setGcode(cached.gcode); camStore.setActiveTab("editor")
        toast.success(t("cam.toast.toolpathLoaded", { name: cached.name ?? "" }))
      } else toast.error(t("cam.toast.toolpathNotFound"))
      clearParam("loadToolpath", "toolpathToLoadInCAM")
    }).catch((cause) => { if (current()) { toast.error(cause instanceof Error ? cause.message : String(cause)); clearParam("loadToolpath", "toolpathToLoadInCAM") } })
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
    const owner = captureEditorOwner()
    const previousCode = camStore.gcode
    const current = () => owner.current() && camStore.gcode === previousCode
    void file.text().then(async (text) => {
      if (!current()) return
      if (file.name.toLowerCase().endsWith(".json")) {
        const snapshot = Schema.decodeUnknownSync(SavedCamProgram)(JSON.parse(text))
        await restoreCamProgram(app, { id: "", name: snapshot.program.name, projectId: "", drawingId: null, gcode: snapshot.gcode, data: snapshot }, current)
      } else {
        camStore.clearOperationResults(); camStore.setKernelArtifact(undefined); camStore.setSavedProgram(undefined)
        useVerifyStore.getState().reset()
        setGcode(text)
      }
    }).catch((cause) => toast.error(cause instanceof Error ? cause.message : t("cam.toast.readFailed")))
  }

  const saveGCode = (projectOnly = false): void => {
    const code = camStore.activeTab === "post" && processedGcode() ? processedGcode() : gcode()
    if (!code) return
    const extension = selectedPostProcessor() === "heidenhain" ? ".h" : ".nc"
    setSaveRequest({ code, extension, projectOnly })
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
    const text = gcode(), owner = captureEditorOwner(), version = ++parseVersion
    manualParse?.abort()
    automaticParse?.abort()
    clearTimeout(parseTimer)
    const controller = new AbortController()
    manualParse = controller
    const current = () => !controller.signal.aborted && version === parseVersion && owner.current() && camStore.gcode === text
    void app.runtime.run(generator.parse(text), { signal: controller.signal }).then(
      (parsed) => {
        if (!current()) return
        camStore.setPlaying(false); camStore.setPlaybackTime(0)
        camStore.setProgram(parsed.program as never, parsed.motion)
        for (const warning of parsed.warnings) toast(warning)
        toast.success(t("cam.toast.parsed", { count: parsed.program.toolpaths.length }))
      },
      (cause) => { if (current()) toast.error(cause instanceof Error ? cause.message : String(cause)) }
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


  return (
    <div
      class="cam-workspace h-full w-full flex flex-col overflow-hidden"
    >
      <div
        class="cam-workspace__frame flex flex-col h-full w-full"
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
          onOpenHistory={() => setShowHistory(true)}
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
          accept=".nc,.gcode,.cnc,.txt,.h,.json"
          aria-label="Import G-Code"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) importGCode(file)
            event.currentTarget.value = ""
          }}
        />

        <div
          class="cam-workspace__body flex flex-1 overflow-hidden w-full"
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

          <div
            class="cam-workspace__stage flex-1 min-w-0 relative overflow-hidden rounded-2xl mx-2"
          >
            <Show when={camStore.activeTab === "editor"}>
              <div class="h-full">
                <GCodeEditor value={gcode()} onChange={setGcode} onProcess={processGCode} />
              </div>
            </Show>
            <Show when={camStore.activeTab === "toolpath"}>
              <div class="h-full rounded-xl">
                <ToolpathVisualizer
                  stock={previewStock()} program={camStore.program} workpiece={camStore.workpiece}
                  playing={camStore.playing} playbackTime={camStore.playbackTime} playbackRate={1}
                  playbackDuration={duration()} onPlayingChange={camStore.setPlaying} onPlaybackTimeChange={camStore.setPlaybackTime}
                  dock={<TitleBlockOverlay mode="3d" cam />}
                  {...(previewTools() !== undefined ? { tools: previewTools()! } : {})}
                  {...(previewDefaultTool() !== undefined ? { defaultTool: previewDefaultTool()! } : {})}
                  machine={previewMachine()} defaultToolModel={toolModel()} toolIssues={toolIssues()}
                  operationTools={operationTools().length > 0 ? operationTools() : importedTools()}
                  {...(operationToolModels() !== undefined ? { toolModels: operationToolModels()! } : {})}
                  {...(camStore.motion !== undefined ? { motion: camStore.motion } : {})}
                  machineChoice={machineChoice()} onMachineOverride={camStore.setMachineOverride} gcode={camStore.gcode}
                />
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
          </div>

          <WorkspaceInspector class="cam-workspace__inspector" open={camStore.rightOpen}
            active={camStore.rightTab === "control" ? "generator" : camStore.rightTab}
            onSelect={(tab) => camStore.setRightTab(tab)} onToggle={() => camStore.toggleRight()}
            collapseLabel={t("cam.toggleProperties")}
            tabs={[
              { id: "generator", label: t("cam.generatorPanel"), title: t("cam.generatorPanel"), icon: (size) => <Wrench size={size} /> },
              { id: "cycles", label: t("cam.cycles"), title: t("cam.cycles"), icon: (size) => <Box size={size} /> },
              { id: "verify", label: t("cam.verify"), title: t("cam.verify"), icon: (size) => <ShieldCheck size={size} /> }
            ]}>
              <div class="workstation-generator">
                <Show when={camStore.rightTab === "generator" || camStore.rightTab === "control"}>
                  <ToolpathGenerator onGCodeGenerated={setGcode} onSave={() => saveGCode(true)} />
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
          </WorkspaceInspector>
        </div>

        <div>
          <CamStatusBar />
        </div>
      </div>

      <ToolLibraryModal isOpen={showLibrary()} onClose={() => setShowLibrary(false)} />
      <CostsModal isOpen={showCosts()} onClose={() => setShowCosts(false)} />
      <CamHistoryModal open={showHistory()} onClose={() => setShowHistory(false)} />
      <Show when={saveRequest()}>{(request) => <SaveCamModal code={request().code} extension={request().extension} projectOnly={request().projectOnly} onClose={() => setSaveRequest(undefined)} />}</Show>
    </div>
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
