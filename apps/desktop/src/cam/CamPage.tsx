/**
 * The `/cam` editor (spec 06-desktop-ui.md §3).
 *
 * Composes the toolbar, the left sidebar (workpiece / generator / operations),
 * the central panel (the four tabs: preview, editor, toolpath, post) and the
 * right-hand preview/properties panel. Side effects (API calls, persistence)
 * run in `useApp().runtime`; the page never calls `fetch` directly.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Schema } from "effect"
import { ChevronLeft, ChevronRight } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { Toaster, toast } from "../components/ui/toast.tsx"
import { useApp } from "../state/context.ts"
import { useCamStore } from "./store/camStore.ts"
import CamToolbar from "./components/CamToolbar.tsx"
import CamSidebar, { type SidebarTab } from "./components/CamSidebar.tsx"
import GeneratorPanel from "./components/GeneratorPanel.tsx"
import ToolpathVisualizer from "./components/ToolpathVisualizer.tsx"
import GCodeEditor from "./components/GCodeEditor.tsx"
import PostProcessorPanel from "./components/PostProcessorPanel.tsx"
import { buildPlayback } from "../viewport/view3d/playback.ts"
import { t } from "../i18n/index.ts"

const rise = { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } }

/** A single toolpath summary shown in the sidebar list. */
interface OperationRow {
  readonly id: string
  readonly name: string
  readonly toolId: string
  readonly moves: number
}

export default function CamPage(): JSX.Element {
  const app = useApp()
  const camStore = useCamStore()
  const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("workpiece")
  const [gcode, setGcode] = createSignal<string>("")
  const [error, setError] = createSignal<string | undefined>(undefined)

  const duration = createMemo(() => buildPlayback(camStore.program).duration)
  const lines = createMemo(() =>
    gcode().split(/\r?\n/).filter((line) => line.trim().length > 0).length
  )

  const operationsAsRows = createMemo<ReadonlyArray<OperationRow>>(() =>
    camStore.program.toolpaths.map((tp) => ({
      id: tp.id,
      name: tp.name,
      toolId: tp.toolId,
      moves: tp.moves.length
    }))
  )

  const generate = (): void => {
    if (camStore.program.toolpaths.length === 0) {
      setError(t("cam.noGeometry"))
      toast.error(t("cam.noGeometry"))
      return
    }
    const post = cam.posts[camStore.controller === "gcode" ? "generic" : camStore.controller]
    if (post === undefined) {
      setError(t("cam.postUnavailable"))
      toast.error(t("cam.postUnavailable"))
      return
    }
    const code = post.emit(camStore.program)
    setGcode(code)
    setError(undefined)
    camStore.setActiveTab("post")
    toast.success(t("cam.saved"))
  }

  const downloadGCode = (): void => {
    const code = gcode()
    if (code.length === 0) {
      toast.error("Nothing to download yet")
      return
    }
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "toolpath.nc"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success("G-code downloaded")
  }

  const importGCode = (file: File | undefined): void => {
    if (!file) return
    void file.text().then((text) => {
      setGcode(text)
      camStore.setActiveTab("editor")
      toast(t("cam.importHint"))
    })
  }

  const processGCode = (): void => {
    try {
      const post = cam.posts[camStore.controller === "gcode" ? "generic" : camStore.controller]
      if (post === undefined) {
        setError(t("cam.postUnavailable"))
        toast.error(t("cam.postUnavailable"))
        return
      }
      const emitted = post.emit(camStore.program)
      setGcode(emitted)
      setError(undefined)
      toast.success(t("cam.process"))
    } catch (cause) {
      setError(String(cause))
      toast.error(String(cause))
    }
  }

  const selectToolpath = (id: string | undefined): void => {
    camStore.setSelectedOperationId(id)
    const found = camStore.program.toolpaths.find((tp) => tp.id === id)
    if (found === undefined) return
    const post = cam.posts[camStore.controller === "gcode" ? "generic" : camStore.controller]
    setGcode(post?.emit({ ...camStore.program, toolpaths: [found] }) ?? "")
    camStore.setActiveTab("toolpath")
  }

  const deleteToolpath = (id: string): void => {
    const nextProgram: cam.Program = {
      ...camStore.program,
      toolpaths: camStore.program.toolpaths.filter((tp) => tp.id !== id)
    }
    camStore.setProgram(nextProgram)
    if (camStore.selectedOperationId === id) camStore.setSelectedOperationId(undefined)
  }

  const projectName = (): string => {
    const recent = app.recents()[0]
    return recent?.name ?? "Untitled project"
  }

  return (
    <Motion.div
      class="h-screen w-screen flex bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Motion.div
        class="flex flex-col backdrop-blur-md bg-white/80 dark:bg-gray-900/80 h-full w-full border border-white/20 dark:border-gray-700/30 shadow-xl"
        {...rise}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <CamToolbar
          totalLines={lines()}
          estimatedSeconds={duration()}
          onImportGCode={() => {
            const input = document.createElement("input")
            input.type = "file"
            input.accept = ".nc,.gcode,.cnc,.txt"
            input.onchange = () => importGCode(input.files?.[0] ?? undefined)
            input.click()
          }}
          onSaveGCode={downloadGCode}
        />

        <Motion.div
          class="flex flex-1 p-2 backdrop-blur-sm bg-gradient-to-br from-white/50 to-blue-50/30 dark:from-gray-800/50 dark:to-gray-900/30 border-b border-white/30 dark:border-gray-600/30 overflow-hidden w-full rounded-lg shadow-lg"
          {...rise}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <CamSidebar
            activeTab={sidebarTab()}
            onSelectTab={setSidebarTab}
            isOpen={camStore.sidebarOpen}
            setIsOpen={camStore.toggleSidebar}
            toolpaths={operationsAsRows()}
            selectedId={camStore.selectedOperationId}
            onSelectToolpath={selectToolpath}
            onDeleteToolpath={deleteToolpath}
          />

          <Motion.div
            class="flex-1 flex rounded-2xl bg-gradient-to-br from-white/90 to-blue-50/50 dark:from-gray-800/90 dark:to-gray-900/50 relative shadow-xl border border-white/30 mr-2 dark:border-gray-600/30 backdrop-blur-md overflow-hidden"
            {...rise}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <div class="flex-1 flex flex-col min-w-0">
              <Show when={error()}>
                <div class="alert alert-danger" role="alert">
                  <span>{error()}</span>
                  <button class="btn btn-outline ml-auto" onClick={() => setError(undefined)}>Dismiss</button>
                </div>
              </Show>

              <Show when={camStore.activeTab === "preview"}>
                <ToolpathVisualizer
                  program={camStore.program}
                  workpiece={camStore.workpiece}
                  playing={camStore.playing}
                  playbackTime={camStore.playbackTime}
                  playbackRate={1}
                  onPlaybackTimeChange={camStore.setPlaybackTime}
                />
              </Show>
              <Show when={camStore.activeTab === "editor"}>
                <GCodeEditor value={gcode()} onChange={setGcode} onProcess={processGCode} />
              </Show>
              <Show when={camStore.activeTab === "toolpath"}>
                <ToolpathVisualizer
                  program={camStore.program}
                  workpiece={camStore.workpiece}
                  playing={camStore.playing}
                  playbackTime={camStore.playbackTime}
                  playbackRate={1}
                  onPlaybackTimeChange={camStore.setPlaybackTime}
                />
              </Show>
              <Show when={camStore.activeTab === "post"}>
                <PostProcessorPanel
                  controller={camStore.controller}
                  program={camStore.program}
                  onChangeController={camStore.setController}
                  onSave={(next) => setGcode(next)}
                />
              </Show>
            </div>

            <Motion.div
              class="absolute bottom-4 right-4 z-40 flex items-center gap-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              <button
                class="btn btn-outline"
                disabled={camStore.program.toolpaths.length === 0}
                onClick={() => {
                  camStore.setPlaying(!camStore.playing)
                  camStore.setActiveTab("toolpath")
                }}
              >
                {camStore.playing ? "Pause" : "Play simulation"}
              </button>
              <A class="btn btn-outline" href={`/cad${app.recents()[0]?.id ? `?projectId=${encodeURIComponent(app.recents()[0]!.id)}` : ""}`}>
                Edit in CAD
              </A>
            </Motion.div>
          </Motion.div>

          <Motion.div
            class={`${camStore.rightOpen ? "w-80" : "w-0"} flex-shrink-0 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white border border-white/30 dark:border-gray-600/30 rounded-2xl shadow-xl transition-all duration-300 ease-in-out overflow-y-auto`}
            animate={{ x: camStore.rightOpen ? 0 : 300, opacity: camStore.rightOpen ? 1 : 0.7 }}
            transition={{ duration: 0.5 }}
          >
            <Motion.div
              class="w-full border-b border-white/30 dark:border-gray-600/30 p-2 rounded-t-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-gray-700/50 dark:to-gray-800/50 backdrop-blur-sm"
              {...rise}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 text-center">Generator</h3>
            </Motion.div>

            <Motion.div class="p-2 space-y-6 flex flex-col items-center" {...rise} transition={{ duration: 0.6, delay: 1 }}>
              <GeneratorPanel onGenerate={generate} />

              <div class="w-full">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Project</h4>
                <div class="rounded-xl border border-white/30 dark:border-gray-600/30 bg-white/60 dark:bg-gray-800/60 p-3">
                  <div class="text-sm font-medium">{projectName()}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Material: <span class="font-semibold">{camStore.material || "not set"}</span>
                  </div>
                </div>
              </div>
            </Motion.div>
          </Motion.div>

          <Motion.button
            class="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white p-3 rounded-l-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/95 dark:hover:bg-gray-700/95 transition-all duration-200"
            onClick={() => camStore.toggleRight()}
            hover={{ scale: 1.05, x: -2 }}
            press={{ scale: 0.95 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.2 }}
            aria-label="Toggle generator sidebar"
          >
            <Show
              when={camStore.rightOpen}
              fallback={<ChevronLeft size={20} class="text-gray-600 dark:text-gray-300" />}
            >
              <ChevronRight size={20} class="text-gray-600 dark:text-gray-300" />
            </Show>
          </Motion.button>
        </Motion.div>

        <Motion.div
          class="flex items-center justify-between px-4 py-2 text-xs text-gray-600 dark:text-gray-400 backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-t border-white/30 dark:border-gray-600/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          <span role="status">{camStore.program.toolpaths.length === 0
              ? "no program loaded"
              : `${camStore.program.toolpaths.length} toolpath(s)`}
          </span>
          <span>{t("cam.duration", { seconds: duration().toFixed(1) })}</span>
        </Motion.div>
      </Motion.div>

      <Toaster />
    </Motion.div>
  )
}