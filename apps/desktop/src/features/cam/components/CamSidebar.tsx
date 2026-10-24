/**
 * Left sidebar for the CAM workspace (legacy `EnanchedSidebarCam`).
 *
 * Three tabs, as in the reference:
 *  - **explorer** — the CAD elements: select what the generator machines, link the raw piece.
 *  - **settings** — view mode, grid / axis and snap settings.
 *  - **machine** — the machine of the job (from the Resources library), origin, workpiece (stock + material) and the saved toolpaths.
 *
 * The Generator itself lives in the right-hand panel, not here. The sidebar is collapsible; collapsed it shows
 * only icon buttons. The bottom row has the collapse toggle, matching the CAD editor.
 */
import { Show, type JSX } from "solid-js"
import { SidebarTabs, SidebarCollapse } from "../../../shared/components/panel/sidebar.tsx"
import { Box, Eye, EyeOff, Grid, List, Settings, Wrench } from "lucide-solid"
import { useCADStore } from "../../cad/store/cadStore.ts"
import OriginControls from "../../cad/components/OriginControls.tsx"
import { useCamStore } from "../store/camStore.ts"
import { t } from "../../../i18n/index.ts"
import WorkpieceSetup from "./WorkpieceSetup.tsx"
import MachineSelect from "./MachineSelect.tsx"
import CamElementExplorer from "./explorer/CamElementExplorer.tsx"
import ViewSettings from "./explorer/ViewSettings.tsx"
import OperationsList from "./OperationsList.tsx"
import WorkspaceNavigation from "../../../shared/components/workspace-navigation.tsx"

export type SidebarTab = "explorer" | "settings" | "machine"

/** Labels/titles are i18n keys resolved through `t()` at render. */
const TABS: ReadonlyArray<{ readonly id: SidebarTab; readonly label: "cam.explorer" | "cam.settings" | "cam.machine"; readonly title: "cam.explorerTitle" | "cam.viewSettingsTitle" | "cam.machineTitle"; readonly icon: (size: number) => JSX.Element }> = [
  { id: "explorer", label: "cam.explorer", title: "cam.explorerTitle", icon: (size) => <List size={size} /> },
  { id: "settings", label: "cam.settings", title: "cam.viewSettingsTitle", icon: (size) => <Settings size={size} /> },
  { id: "machine", label: "cam.machine", title: "cam.machineTitle", icon: (size) => <Wrench size={size} /> }
]

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
    <div
      class="cam-workspace__sidebar panel workspace-sidebar flex-shrink-0 h-full flex flex-col"
      data-open={props.isOpen}
    >
      <SidebarTabs class="cam-workspace__tabs" open={props.isOpen} active={props.activeTab} onSelect={(tab) => { props.onSelectTab(tab); if (!props.isOpen) props.setIsOpen(true) }}
        tabs={TABS.map((tab) => ({ ...tab, label: t(tab.label), title: t(tab.title) }))} />

      <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        <Show
          when={props.isOpen}
          fallback={
            <div class="sidebar-rail">
              <Show when={props.activeTab === "explorer"}>
                <button type="button" class="panel-icon-btn" title={t("cam.openSidebarHint")} aria-label={t("cam.openSidebarHint")} onClick={() => props.setIsOpen(true)}><List size={16} /></button>
              </Show>
              <Show when={props.activeTab === "settings"}>
                <div class="space-y-4 p-1">
                  <button
                    class="panel-icon-btn"
                    title={t("cam.toggleGrid")}
                    aria-label={t("cam.toggleGrid")}
                    aria-pressed={cad.gridVisible}
                    onClick={() => cad.toggleGrid()}
                  >
                    <Grid size={20} class={cad.gridVisible ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
                  </button>
                  <button
                    class="panel-icon-btn"
                    title={t("cam.toggleAxis")}
                    aria-label={t("cam.toggleAxis")}
                    aria-pressed={cad.axisVisible}
                    onClick={() => cad.toggleAxis()}
                  >
                    <Show when={cad.axisVisible} fallback={<EyeOff size={20} class="text-gray-600 dark:text-gray-400" />}><Eye size={20} class="text-blue-600 dark:text-blue-400" /></Show>
                  </button>
                  <button
                    class="panel-icon-btn"
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
          <div class="workstation-panel-content flex flex-col">
            <Show when={props.activeTab === "explorer"}>
              <div class="w-full">
                <CamElementExplorer {...(props.onGCodeGenerated ? { onGCodeGenerated: props.onGCodeGenerated } : {})} />
              </div>
            </Show>
            <Show when={props.activeTab === "machine"}>
              <div class="sidebar-sections">
                <MachineSelect />
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
              </div>
            </Show>
            <Show when={props.activeTab === "settings"}>
              <div class="w-full">
                <ViewSettings />
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <WorkspaceNavigation isOpen={props.isOpen} />

      <SidebarCollapse open={props.isOpen} label={t(props.isOpen ? "cam.collapse" : "cam.expand")} onToggle={() => props.setIsOpen(!props.isOpen)} />
    </div>
  )
}
