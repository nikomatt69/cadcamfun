/**
 * Left sidebar for the CAM workspace (legacy `EnanchedSidebarCam`).
 *
 * Three tabs, as in the reference:
 *  - **explorer** — the CAD elements: select what the generator machines, link the raw piece.
 *  - **settings** — view mode, grid / axis and snap settings.
 *  - **machine** — origin, workpiece (stock + material) and the saved toolpaths.
 *
 * The Generator itself lives in the right-hand panel, not here. The sidebar is collapsible; collapsed it shows
 * only icon buttons. The bottom row has the collapse toggle, matching the CAD editor.
 */
import { For, Show, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Box, ChevronLeft, ChevronRight, Eye, EyeOff, Grid, List, Settings, Wrench } from "lucide-solid"
import { useCADStore } from "../../cad/store/cadStore.ts"
import OriginControls from "../../cad/components/OriginControls.tsx"
import { useCamStore } from "../store/camStore.ts"
import { t } from "../../i18n/index.ts"
import WorkpieceSetup from "./WorkpieceSetup.tsx"
import CamElementExplorer from "./explorer/CamElementExplorer.tsx"
import ViewSettings from "./explorer/ViewSettings.tsx"
import OperationsList from "./OperationsList.tsx"

export type SidebarTab = "explorer" | "settings" | "machine"

/** Labels/titles are i18n keys resolved through `t()` at render. */
const TABS: ReadonlyArray<{ readonly id: SidebarTab; readonly label: "cam.explorer" | "cam.settings" | "cam.machine"; readonly title: "cam.explorerTitle" | "cam.viewSettingsTitle" | "cam.machineTitle"; readonly icon: (size: number) => JSX.Element }> = [
  { id: "explorer", label: "cam.explorer", title: "cam.explorerTitle", icon: (size) => <List size={size} /> },
  { id: "settings", label: "cam.settings", title: "cam.viewSettingsTitle", icon: (size) => <Settings size={size} /> },
  { id: "machine", label: "cam.machine", title: "cam.machineTitle", icon: (size) => <Wrench size={size} /> }
]

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }
const hover = { scale: 1.02, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.98 }

const tabClass = (active: boolean, shape: string): string =>
  `${shape} text-sm font-medium transition-all duration-200 ${active ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"}`

export interface CamSidebarProps {
  readonly activeTab: SidebarTab
  readonly onSelectTab: (tab: SidebarTab) => void
  readonly isOpen: boolean
  readonly setIsOpen: (open: boolean) => void
  /** Toolpaths list, shown under the machine tab. */
  readonly toolpaths: ReadonlyArray<{ readonly id: string; readonly name: string; readonly toolId: string; readonly moves: number }>
  /** Selected toolpath id, shown under the machine tab. */
  readonly selectedId: string | undefined
  readonly onSelectToolpath: (id: string | undefined) => void
  readonly onDeleteToolpath: (id: string) => void
  /** Receives program text generated from the explorer / multi-toolpath panel, so the page's editor shows it. */
  readonly onGCodeGenerated?: (gcode: string) => void
}

export default function CamSidebar(props: CamSidebarProps): JSX.Element {
  const cam = useCamStore()
  const cad = useCADStore()

  return (
    <Motion.div
      class="cam-workspace__sidebar flex-shrink-0 dark:text-white mr-2 h-full flex flex-col"
      animate={{ width: props.isOpen ? "17rem" : "3.5rem", opacity: props.isOpen ? 1 : 0.9 }}
      transition={{ duration: 0.35, easing: "ease-in-out" }}
    >
      <Motion.div
        class="cam-workspace__tabs w-full flex justify-center"
        {...rise}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div class={props.isOpen ? "flex justify-center w-full text-center gap-1 p-2" : "flex flex-col w-full gap-1 p-2"}>
          <For each={TABS}>
            {(tab) => (
              <Show
                when={props.isOpen}
                fallback={
                  <Motion.button
                    class={tabClass(props.activeTab === tab.id, "w-full py-4 flex flex-col items-center justify-center rounded-xl")}
                    onClick={() => props.onSelectTab(tab.id)}
                    title={t(tab.title)}
                    aria-label={t(tab.title)}
                    aria-pressed={props.activeTab === tab.id}
                    animate={props.activeTab === tab.id ? hover : {}}
                    hover={hover}
                    press={press}
                  >
                    {tab.icon(20)}
                  </Motion.button>
                }
              >
                <Motion.button
                  class={tabClass(props.activeTab === tab.id, "flex-1 py-3 px-3 rounded-xl")}
                  onClick={() => props.onSelectTab(tab.id)}
                  aria-pressed={props.activeTab === tab.id}
                  animate={props.activeTab === tab.id ? hover : {}}
                  hover={hover}
                  press={press}
                >
                  <div class="flex items-center justify-center">
                    {tab.icon(16)}
                    <span class="ml-2">{t(tab.label)}</span>
                  </div>
                </Motion.button>
              </Show>
            )}
          </For>
        </div>
      </Motion.div>

      <Motion.div class="flex-1 flex-col rounded-xl overflow-y-auto" {...rise} transition={{ duration: 0.6, delay: 0.4 }}>
        <Show
          when={props.isOpen}
          fallback={
            <div class="py-4 px-2 flex flex-col items-center rounded-xl bg-white/30 dark:bg-gray-800/50 backdrop-blur-sm">
              <Show when={props.activeTab === "explorer"}>
                <div class="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
                  <List size={20} class="mx-auto mb-2" />
                  {t("cam.openSidebarHint")}
                </div>
              </Show>
              <Show when={props.activeTab === "settings"}>
                <div class="space-y-4 p-1">
                  <button
                    class="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 shadow-md border border-white/30 dark:border-gray-600/30"
                    title={t("cam.toggleGrid")}
                    aria-label={t("cam.toggleGrid")}
                    aria-pressed={cad.gridVisible}
                    onClick={() => cad.toggleGrid()}
                  >
                    <Grid size={20} class={cad.gridVisible ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
                  </button>
                  <button
                    class="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 shadow-md border border-white/30 dark:border-gray-600/30"
                    title={t("cam.toggleAxis")}
                    aria-label={t("cam.toggleAxis")}
                    aria-pressed={cad.axisVisible}
                    onClick={() => cad.toggleAxis()}
                  >
                    <Show when={cad.axisVisible} fallback={<EyeOff size={20} class="text-gray-600 dark:text-gray-400" />}><Eye size={20} class="text-blue-600 dark:text-blue-400" /></Show>
                  </button>
                  <button
                    class="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 shadow-md border border-white/30 dark:border-gray-600/30"
                    title={t("cam.toggleViewMode")}
                    aria-label={t("cam.toggleViewMode")}
                    aria-pressed={cad.viewMode === "3d"}
                    onClick={() => cad.setViewMode(cad.viewMode === "2d" ? "3d" : "2d")}
                  >
                    <Box size={20} class={cad.viewMode === "3d" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
                  </button>
                </div>
              </Show>
            </div>
          }
        >
          <div class="p-1 rounded-xl overflow-y-auto space-y-6 flex flex-col items-center">
            <Show when={props.activeTab === "explorer"}>
              <Motion.div class="w-full" {...rise} transition={{ duration: 0.4, delay: 0.2 }}>
                <CamElementExplorer {...(props.onGCodeGenerated ? { onGCodeGenerated: props.onGCodeGenerated } : {})} />
              </Motion.div>
            </Show>
            <Show when={props.activeTab === "machine"}>
              <Motion.div class="w-full space-y-6" {...rise} transition={{ duration: 0.4, delay: 0.2 }}>
                <OriginControls />
                <WorkpieceSetup
                  workpiece={cam.workpiece}
                  material={cam.material}
                  onChangeWorkpiece={(next) => cam.setWorkpiece(next)}
                  onChangeMaterial={(next) => cam.setMaterial(next)}
                />
                <OperationsList
                  toolpaths={props.toolpaths}
                  selectedId={props.selectedId}
                  onSelect={props.onSelectToolpath}
                  onDelete={props.onDeleteToolpath}
                />
              </Motion.div>
            </Show>
            <Show when={props.activeTab === "settings"}>
              <Motion.div class="w-full" {...rise} transition={{ duration: 0.4, delay: 0.2 }}>
                <ViewSettings />
              </Motion.div>
            </Show>
          </div>
        </Show>
      </Motion.div>

      <Motion.div
        class="border-t border-white/30 dark:border-gray-600/30 p-3 flex justify-center"
        {...rise}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <Motion.button
          class="p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-200 backdrop-blur-sm border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => props.setIsOpen(!props.isOpen)}
          title={t(props.isOpen ? "cam.collapse" : "cam.expand")}
          aria-label={t(props.isOpen ? "cam.collapse" : "cam.expand")}
          hover={hover}
          press={press}
        >
          <Motion.div animate={{ rotate: props.isOpen ? 0 : 180 }} transition={{ duration: 0.3 }}>
            <Show
              when={props.isOpen}
              fallback={<ChevronRight size={20} class="text-gray-600 dark:text-gray-300" />}
            >
              <ChevronLeft size={20} class="text-gray-600 dark:text-gray-300" />
            </Show>
          </Motion.div>
        </Motion.button>
      </Motion.div>
    </Motion.div>
  )
}
