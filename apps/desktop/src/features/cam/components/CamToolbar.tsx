/**
 * Top toolbar of the CAM workspace (legacy `pages/cam.tsx`).
 *
 * Left capsule: sidebar toggle, save / import G-code, simulation play-stop, CAD editor link, library, production
 * costs, AI copilot and dark-mode toggles. Right side: the four workspace tabs and the chat-panel toggle. The
 * toolbar owns no data: the page passes state and callbacks, the tab lives in the CAM store.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
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
const OUTLINE = "btn btn-sm btn-outline flex items-center"
const TOGGLE_ON = "bg-[color:var(--ent-accent-soft)] border-[color:var(--ent-accent)] text-[color:var(--ent-accent)]"
const TOGGLE_OFF = "bg-[color:var(--ent-surface)] border-[color:var(--ent-line-strong)] hover:bg-[color:var(--ent-surface-subtle)] text-[color:var(--ent-text)]"

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
    <div
      class="workstation-toolbar w-full flex items-center justify-between"
    >
      <div
        class="flex w-max items-center"
      >
        <button
          type="button"
          class="mr-2 rounded-[5px] border border-[color:var(--ent-line)] p-2 transition-colors duration-150 hover:bg-[color:var(--ent-surface-subtle)] focus-visible:outline-none"
          onClick={() => cam.toggleSidebar()}
          aria-label={t("cam.toggleSidebar")}
        >
          <Menu size={16} class="text-[color:var(--ent-text-muted)]" />
        </button>

        <div class="flex items-center gap-1">
          <button onClick={() => props.onSave()} class={`${OUTLINE} cursor-pointer`} title={t("cam.saveGcode")} aria-label={t("cam.saveGcode")} disabled={!props.canSave}>
            <Save size={16} class="mr-1" />
          </button>
          <label class="btn btn-sm btn-outline flex items-center cursor-pointer" title={t("cam.import")} aria-label={t("cam.import")}>
            <Upload size={16} class="mr-1" />
            <input
              type="file"
              class="hidden"
              accept=".nc,.gcode,.ngc,.tap,.cnc,.txt,.h,.mpf,.json"
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
            class={`btn btn-sm ${props.isSimulating ? "btn-danger" : "btn-outline"} flex items-center`}
            title={t(props.isSimulating ? "cam.simStop" : "cam.simStart")}
          >
            <Show when={props.isSimulating} fallback={<Play size={16} />}><Pause size={16} /></Show>
            <span class="ml-1">{t(props.isSimulating ? "cam.stop" : "cam.play")}</span>
          </button>
          <A
            href="/cad"
            class="btn btn-sm btn-outline flex items-center"
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
            class={`p-1.5 border rounded-[5px] flex items-center mr-2 ${props.aiEnhanced ? TOGGLE_ON : TOGGLE_OFF}`}
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
            class={`p-1.5 border rounded-[5px] flex items-center ${dark() ? TOGGLE_ON : TOGGLE_OFF}`}
            aria-label={t("cam.toggleTheme")}
            aria-pressed={dark()}
          >
            <Show when={dark()} fallback={<Moon size={16} />}>
              <Sun size={16} />
            </Show>
          </button>
        </div>
      </div>

      <div
        class="workstation-workspace-tabs flex space-x-3"
      >
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              onClick={() => cam.setActiveTab(tab.id)}
              aria-pressed={cam.activeTab === tab.id}
              class={`flex items-center px-4 py-2 rounded-[5px] text-sm font-medium transition-colors duration-150 ${
                cam.activeTab === tab.id
                  ? "bg-[color:var(--ent-accent)] text-white"
                  : "bg-[color:var(--ent-surface)] text-[color:var(--ent-text)] hover:bg-[color:var(--ent-surface-subtle)] border border-[color:var(--ent-line)]"
              }`}
            >
              {tab.icon(16)}
              {t(tab.label)}
            </button>
          )}
        </For>
        <button
          type="button"
          onClick={() => props.onToggleChat()}
          class={`flex items-center rounded-[5px] border px-3 py-2 text-sm font-medium transition-colors duration-150 ${props.showChat ? TOGGLE_ON : TOGGLE_OFF}`}
          aria-label={t(props.showChat ? "cam.chatClose" : "cam.chatOpen")}
        >
          <Show when={props.showChat} fallback={<PanelRight size={16} />}><PanelRightClose size={16} /></Show>
        </button>
      </div>
    </div>
  )
}
