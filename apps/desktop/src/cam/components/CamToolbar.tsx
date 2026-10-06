/**
 * Top toolbar for the CAM workspace (spec 06-desktop-ui.md §3).
 *
 * Two regions: the left side carries the workspace controls (sidebar toggle, dark
 * mode, undo/redo, library, CAD link, current project); the right side is the
 * status block (toolpaths count, controller, line + duration of the active
 * program). Both regions use the same glass-morphic pill styling as the CAD
 * toolbar so the two editors feel like one product.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { Motion } from "solid-motionone"
import {
  Box,
  ChevronDown,
  FileCode,
  Grid3x3,
  Layers,
  Library,
  Menu,
  Moon,
  Redo2,
  Save,
  Sun,
  Undo2,
  Wrench
} from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"
import { useCamStore } from "../store/camStore.ts"
import { toast } from "../../components/ui/toast.tsx"

export interface CamToolbarProps {
  readonly onImportGCode?: () => void
  readonly onSaveGCode?: () => void
  readonly totalLines: number
  readonly estimatedSeconds: number
}

const GLASS_BUTTON =
  "px-4 py-2 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-600/40 hover:bg-white/90 dark:hover:bg-gray-700/90 rounded-xl shadow-md flex items-center transition-all duration-200"
const ICON_BUTTON =
  "p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
const TOGGLE_ON =
  "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
const TOGGLE_OFF =
  "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
const hover = { scale: 1.05, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.95 }

const TAB_LABELS: Record<"preview" | "editor" | "toolpath" | "post", string> = {
  preview: "Preview",
  editor: "Editor G-Code",
  toolpath: "Toolpath",
  post: "Post-Processor"
}

/** Reads the current dark-mode flag without spinning up another reactive scope. */
const readInitialDark = (): boolean =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")

export default function CamToolbar(props: CamToolbarProps): JSX.Element {
  const navigate = useNavigate()
  const app = useApp()
  const cam = useCamStore()
  const [dark, setDark] = createSignal(readInitialDark())

  const toggleTheme = (): void => {
    const next = !dark()
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      /* storage may be disabled */
    }
  }

  const pickTab = (id: "preview" | "editor" | "toolpath" | "post"): void => cam.setActiveTab(id)
  const pickController = (controller: "gcode" | "grbl" | "fanuc"): void => {
    cam.setController(controller)
    toast.success(`Controller switched to ${controller.toUpperCase()}`)
  }

  const openLibrary = (): void => {
    void app.runtime
      .run(app.client.plugins.list())
      .then(() => navigate("/library"), () => toast.error("Could not load the library"))
  }

  return (
    <Motion.div
      class="backdrop-blur-md bg-white/90 dark:bg-gray-900/90 border-b border-white/30 dark:border-gray-600/30 px-6 py-3 flex items-center justify-between w-full rounded-2xl text-gray-900 dark:text-white shadow-lg"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, easing: "ease-out" }}
    >
      <Motion.div
        class="flex w-max rounded-2xl items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <Motion.button
          class="mr-2 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 focus:outline-none transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => cam.toggleSidebar()}
          hover={hover}
          press={press}
          aria-label={t("cam.sidebar")}
        >
          <Menu size={20} class="text-gray-600 dark:text-gray-400" />
        </Motion.button>

        <div class="ml-6 flex items-center space-x-3">
          <Motion.button
            onClick={() => props.onSaveGCode?.()}
            class={GLASS_BUTTON}
            title="Save G-Code"
            hover={hover}
            press={press}
          >
            <Save size={16} class="text-gray-600 dark:text-gray-400" />
            <span class="ml-1.5 text-sm font-medium">Save</span>
          </Motion.button>
          <Motion.button
            onClick={() => props.onImportGCode?.()}
            class={GLASS_BUTTON}
            title="Import G-Code"
            hover={hover}
            press={press}
          >
            <FileCode size={16} class="text-gray-600 dark:text-gray-400" />
            <span class="ml-1.5 text-sm font-medium">Import</span>
          </Motion.button>
          <Motion.button onClick={openLibrary} class={GLASS_BUTTON} title="Library" hover={hover} press={press}>
            <Library size={16} class="text-gray-600 dark:text-gray-400" />
            <span class="ml-1.5 text-sm font-medium">Library</span>
          </Motion.button>

          <div class="h-6 border-l border-white/40 dark:border-gray-600/40 mx-3" />
          <Motion.button title="Undo" onClick={() => toast("Undo not implemented yet")} class={ICON_BUTTON} hover={hover} press={press}>
            <Undo2 size={18} />
          </Motion.button>
          <Motion.button title="Redo" onClick={() => toast("Redo not implemented yet")} class={ICON_BUTTON} hover={hover} press={press}>
            <Redo2 size={18} />
          </Motion.button>
          <div class="h-5 border-l border-gray-300 dark:border-gray-700 mx-1" />

          <button
            onClick={toggleTheme}
            class={`p-1.5 border shadow-sm rounded-md flex items-center ${dark() ? TOGGLE_ON : TOGGLE_OFF}`}
            aria-label="Toggle dark mode"
          >
            <Show when={dark()} fallback={<Moon class="h-3 w-3 sm:h-4 sm:w-4" />}>
              <Sun class="h-3 w-3 sm:h-4 sm:w-4" />
            </Show>
          </button>

          <A href="/cam">
            <button class="p-1.5 border shadow-sm rounded-md flex items-center bg-blue-50 border-blue-300 text-blue-700" title="CAM">
              <Wrench size={16} />
              <span class="ml-1.5 text-sm font-medium">CAM</span>
            </button>
          </A>
          <A href="/cad">
            <button class="p-1.5 border shadow-sm rounded-md flex items-center bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300" title="Switch to CAD Editor">
              <Box size={16} class="mr-1.5" />
              <span class="text-sm font-medium">CAD</span>
            </button>
          </A>
        </div>
      </Motion.div>

      <Motion.div
        class="flex items-center space-x-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <div class="flex rounded-xl border border-white/40 dark:border-gray-600/40 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 p-1">
          <For each={["preview", "editor", "toolpath", "post"] as const}>
            {(id) => (
              <Motion.button
                class={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  cam.activeTab === id
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60"
                }`}
                onClick={() => pickTab(id)}
                hover={cam.activeTab === id ? undefined : { scale: 1.03 }}
                press={cam.activeTab === id ? undefined : { scale: 0.97 }}
              >
                {TAB_LABELS[id]}
              </Motion.button>
            )}
          </For>
        </div>

        <div class="relative z-[1000]">
          <Motion.button
            class="px-4 py-2 border border-white/40 dark:border-gray-600/40 rounded-xl flex items-center backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 hover:bg-white/90 dark:hover:bg-gray-700/90 cursor-pointer shadow-md transition-all duration-200"
            hover={hover}
            press={press}
          >
            <span class="text-xs text-gray-500 dark:text-gray-400 mr-2">Controller:</span>
            <span class="text-sm font-semibold uppercase">{cam.controller}</span>
            <ChevronDown size={14} class="ml-1 text-gray-500" />
          </Motion.button>
          <div class="absolute right-0 mt-1 hidden group-hover:block">{}</div>
          <Show when={false}>
            <div class="absolute top-full right-0 mt-2 w-44 backdrop-blur-md bg-white/95 dark:bg-gray-800/95 border border-white/40 dark:border-gray-600/40 rounded-2xl shadow-xl z-[1001] p-1">
              <For each={["gcode", "grbl", "fanuc"] as const}>
                {(controller) => (
                  <button
                    onClick={() => pickController(controller)}
                    class={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/60 dark:hover:bg-gray-700/60 ${
                      cam.controller === controller ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {controller.toUpperCase()}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="px-4 py-2 border border-white/40 dark:border-gray-600/40 rounded-xl flex items-center backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 hover:bg-white/90 dark:hover:bg-gray-700/90 shadow-md transition-all duration-200">
          <span class="text-xs text-gray-500 dark:text-gray-400 mr-2">Toolpaths:</span>
          <span class="text-sm font-semibold">{cam.program.toolpaths.length}</span>
          <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">·</span>
          <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
            {props.totalLines} {t("cam.lines", { count: props.totalLines }).replace(`${props.totalLines} `, "")}
          </span>
          <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">·</span>
          <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
            {t("cam.duration", { seconds: props.estimatedSeconds.toFixed(1) }).replace(`${props.estimatedSeconds.toFixed(1)} `, "")} <span class="font-semibold text-gray-700 dark:text-gray-200">{props.estimatedSeconds.toFixed(1)}s</span>
          </span>
        </div>

        <div class="flex items-center space-x-1 px-3 py-1.5 border border-white/40 dark:border-gray-600/40 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm text-xs">
          <Show when={cam.floatingOpen}>
            <Layers size={14} class="text-blue-600 dark:text-blue-400" />
          </Show>
          <Show when={!cam.floatingOpen}>
            <Grid3x3 size={14} class="text-gray-500" />
          </Show>
          <span class="text-gray-500 dark:text-gray-400 ml-1">Viewport</span>
        </div>
      </Motion.div>
    </Motion.div>
  )
}