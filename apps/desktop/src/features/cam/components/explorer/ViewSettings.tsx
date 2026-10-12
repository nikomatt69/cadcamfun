/**
 * The "settings" tab of the CAM sidebar: view mode, grid / axis toggles and the snap settings, as in the legacy
 * `EnanchedSidebarCam`. They drive the same `cadStore` flags the CAD viewport reads.
 */
import { type JSX } from "solid-js"
import { Eye, EyeOff, Grid } from "lucide-solid"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import SnapSettings from "../../../cad/components/SnapSettings.tsx"
import { t } from "../../../../i18n/index.ts"

const MODE = (active: boolean): string =>
  `px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active ? "bg-blue-600 text-white shadow-lg border border-blue-500/50" : "bg-white/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/40 dark:border-gray-600/40"}`

function Toggle(props: { readonly label: string; readonly on: boolean; readonly onToggle: () => void; readonly icon: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={props.onToggle}
      class="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/40 dark:border-gray-600/40 transition-all duration-200"
    >
      <span class="flex items-center text-gray-700 dark:text-gray-300"><span class="mr-3">{props.icon}</span>{props.label}</span>
      <span class={`h-5 w-9 rounded-full relative transition-colors duration-200 ${props.on ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-500"}`}>
        <span class="absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform duration-200" style={{ transform: props.on ? "translateX(16px)" : "translateX(0)" }} />
      </span>
    </button>
  )
}

export default function ViewSettings(): JSX.Element {
  const cad = useCADStore()
  return (
    <div class="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 shadow-xl rounded-2xl p-6 max-h-[calc(100vh-100px)] overflow-y-auto text-center w-full border border-white/30 dark:border-gray-600/30">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">{t("cam.viewSettingsTitle")}</h3>
      <div class="space-y-6">
        <div>
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">{t("cam.view.mode")}</label>
          <div class="flex space-x-3 justify-center">
            <button class={MODE(cad.viewMode === "2d")} aria-pressed={cad.viewMode === "2d"} onClick={() => cad.setViewMode("2d")}>{t("cam.view.2d")}</button>
            <button class={MODE(cad.viewMode === "3d")} aria-pressed={cad.viewMode === "3d"} onClick={() => cad.setViewMode("3d")}>{t("cam.view.3d")}</button>
          </div>
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">{t("cam.view.options")}</label>
          <div class="space-y-3">
            <Toggle label={t("cam.view.showGrid")} on={cad.gridVisible} onToggle={() => cad.toggleGrid()} icon={<Grid size={16} />} />
            <Toggle label={t("cam.view.showAxis")} on={cad.axisVisible} onToggle={() => cad.toggleAxis()} icon={cad.axisVisible ? <Eye size={16} /> : <EyeOff size={16} />} />
          </div>
        </div>
        <SnapSettings />
      </div>
    </div>
  )
}
