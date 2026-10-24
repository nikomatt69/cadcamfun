/**
 * Top toolbar of the CAM workspace (legacy `pages/cam.tsx`).
 *
 * Left capsule: sidebar toggle, save / import G-code, simulation play-stop, CAD editor link, library, production
 * costs, AI copilot and dark-mode toggles. Right side: the four workspace tabs and the chat-panel toggle. The
 * toolbar owns no data: the page passes state and callbacks, the tab lives in the CAM store.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import {
  Brain, Code, DollarSign, Folder, Grid3x3, History, Menu, Moon, Pause, PanelRight, PanelRightClose, Play, RotateCcw, RotateCw, Save, Settings, Sun, Upload, Wrench, Zap
} from "lucide-solid"
import { useCamStore, type ActiveTab } from "../store/camStore.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { prefersDark } from "../../../shared/state/settings.ts"
import { useCamHistoryStore } from "../store/camHistoryStore.ts"

export interface CamToolbarProps {
  /** Whether there is G-code to save (the save button is disabled otherwise). */
  readonly canSave: boolean
  readonly isSimulating: boolean
  readonly aiEnhanced: boolean
  readonly showChat: boolean
  readonly onSave: () => void
  readonly onImport: (file: File) => void
  readonly onToggleSimulation: () => void
  readonly onOpenLibrary: () => void
  readonly onOpenCosts: () => void
  readonly onToggleAi: () => void
  readonly onToggleChat: () => void
  readonly onOpenHistory?: () => void
}

/** Legacy `btn btn-sm btn-outline` buttons (classes defined in `styles/globals.css`). */
const OUTLINE = "btn btn-sm btn-outline dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center"
const TOGGLE_ON = "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
const TOGGLE_OFF = "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"

/** Labels are i18n keys so the tab strip follows the locale (resolved through `t()` at render). */
const TABS: ReadonlyArray<{ readonly id: ActiveTab; readonly label: "cam.editor" | "cam.toolpath" | "cam.postTab"; readonly icon: (size: number) => JSX.Element }> = [
  { id: "editor", label: "cam.editor", icon: (size) => <Code size={size} class="mr-1" /> },
  { id: "toolpath", label: "cam.toolpath", icon: (size) => <Wrench size={size} class="mr-1" /> },
  { id: "post", label: "cam.postTab", icon: (size) => <Settings size={size} class="mr-1" /> }
]

export default function CamToolbar(props: CamToolbarProps): JSX.Element {
  const cam = useCamStore()
  const history = useCamHistoryStore()
  const app = useApp()
  const dark = (): boolean => {
    const theme = app.settings.settings().theme
    return theme === "dark" || (theme === "system" && prefersDark())
  }

  const toggleDarkMode = (): void => {
    app.settings.update({ theme: dark() ? "light" : "dark" })
  }

  return (
    <Motion.div
      class="workstation-toolbar w-full flex items-center justify-between"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
    >
      <Motion.div
        class="flex rounded-2xl w-max items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <Motion.button
          class="mr-2 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 focus:outline-none transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => cam.toggleSidebar()}
          hover={{ scale: 1.05 }}
          press={{ scale: 0.95 }}
          aria-label={t("cam.toggleSidebar")}
        >
          <Menu size={20} class="text-gray-600 dark:text-gray-400" />
        </Motion.button>

        <div class="ml-6 flex items-center space-x-2">
          <button onClick={() => props.onSave()} class={`${OUTLINE} cursor-pointer`} title={t("cam.saveGcode")} aria-label={t("cam.saveGcode")} disabled={!props.canSave}>
            <Save size={16} class="mr-1" />
          </button>
          <label class="btn btn-sm btn-outline flex items-center cursor-pointer" title={t("cam.import")} aria-label={t("cam.import")}>
            <Upload size={16} class="mr-1 dark:text-gray-300" />
            <input
              type="file"
              class="hidden"
              accept=".nc,.gcode,.cnc,.txt,.h,.json"
              aria-label={t("cam.import")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) props.onImport(file)
                event.currentTarget.value = ""
              }}
            />
          </label>
          <button type="button" title={t("cad.undo")} aria-label={t("cad.undo")} class={OUTLINE} disabled={history.index <= 0} onClick={() => history.undo()}><RotateCcw size={16} /></button>
          <button type="button" title={t("cad.redo")} aria-label={t("cad.redo")} class={OUTLINE} disabled={history.index >= history.entries.length - 1} onClick={() => history.redo()}><RotateCw size={16} /></button>
          <button type="button" title={t("cam.history.title")} aria-label={t("cam.history.title")} class={OUTLINE} onClick={() => props.onOpenHistory?.()}><History size={16} /></button>
          <button
            onClick={() => props.onToggleSimulation()}
            class={`btn btn-sm ${props.isSimulating ? "btn-danger dark:bg-red-600 dark:hover:bg-red-700" : "btn-success dark:bg-green-600 dark:hover:bg-green-700"} flex items-center`}
            title={t(props.isSimulating ? "cam.simStop" : "cam.simStart")}
          >
            <Show when={props.isSimulating} fallback={<Play size={16} />}><Pause size={16} /></Show>
            <span class="ml-1">{t(props.isSimulating ? "cam.stop" : "cam.play")}</span>
          </button>
          <A
            href="/cad"
            class="btn btn-sm flex items-center bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 border-0 shadow-md"
            title={t("cam.switchCad")}
          >
            <Grid3x3 size={16} class="mr-1" />
            <span>{t("cam.cadEditor")}</span>
          </A>
          <button onClick={() => props.onOpenLibrary()} class={OUTLINE} title={t("cam.libraryTitle")}>
            <Folder size={16} class="mr-1" />
            {t("activity.library")}
          </button>
          <button onClick={() => props.onOpenCosts()} class={OUTLINE} title={t("costs.title")}>
            <DollarSign size={16} class="mr-1" />
            {t("costs.title")}
          </button>
          <button
            onClick={() => props.onToggleAi()}
            class={`p-1.5 border shadow-sm rounded-md flex items-center mr-2 ${props.aiEnhanced ? TOGGLE_ON : TOGGLE_OFF}`}
            aria-label={t("cam.toggleAi")}
            aria-pressed={props.aiEnhanced}
            title={t(props.aiEnhanced ? "cam.aiDisable" : "cam.aiEnable")}
          >
            <Show when={props.aiEnhanced} fallback={<Zap size={16} />}>
              <Brain size={16} />
            </Show>
          </button>
          <button
            onClick={toggleDarkMode}
            class={`p-1.5 border shadow-sm rounded-md flex items-center ${dark() ? TOGGLE_ON : TOGGLE_OFF}`}
            aria-label={t("cam.toggleTheme")}
            aria-pressed={dark()}
          >
            <Show when={dark()} fallback={<Moon size={16} />}>
              <Sun size={16} />
            </Show>
          </button>
        </div>
      </Motion.div>

      <Motion.div
        class="workstation-workspace-tabs flex space-x-3"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <For each={TABS}>
          {(tab) => (
            <Motion.button
              onClick={() => cam.setActiveTab(tab.id)}
              aria-pressed={cam.activeTab === tab.id}
              class={`flex items-center px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm transition-all duration-200 ${
                cam.activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 border border-white/40 dark:border-gray-600/40"
              }`}
              hover={{ scale: 1.02 }}
              press={{ scale: 0.98 }}
            >
              {tab.icon(16)}
              {t(tab.label)}
            </Motion.button>
          )}
        </For>
        <Motion.button
          onClick={() => props.onToggleChat()}
          class="flex items-center px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white rounded-xl shadow-lg transition-all duration-200"
          aria-label={t(props.showChat ? "cam.chatClose" : "cam.chatOpen")}
          hover={{ scale: 1.05 }}
          press={{ scale: 0.95 }}
        >
          <Show when={props.showChat} fallback={<PanelRight size={16} />}><PanelRightClose size={16} /></Show>
        </Motion.button>
      </Motion.div>
    </Motion.div>
  )
}
