/** View controls share the generator's sections and fields, over the CAD viewport state. */
import { type JSX } from "solid-js"
import { Eye, Magnet } from "lucide-solid"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import SnapSettings from "../../../cad/components/SnapSettings.tsx"
import { t } from "../../../../i18n/index.ts"
import { CheckRow, Field, Segmented } from "../../../../shared/components/panel/ui.tsx"
import { SidebarSection } from "../../../../shared/components/panel/sidebar.tsx"

export default function ViewSettings(): JSX.Element {
  const cad = useCADStore()
  return <div class="sidebar-sections">
    <SidebarSection id="cam-view" title={t("cam.viewSettingsTitle")} icon={Eye} summary={cad.viewMode.toUpperCase()}>
      <Field label={t("cam.view.mode")}>
        <Segmented label={t("cam.view.mode")} value={cad.viewMode} options={[["2d", t("cam.view.2d")], ["3d", t("cam.view.3d")]]} onChange={(mode) => cad.setViewMode(mode)} />
      </Field>
      <CheckRow id="cam-view-grid" checked={cad.gridVisible} onChange={() => cad.toggleGrid()}>{t("cam.view.showGrid")}</CheckRow>
      <CheckRow id="cam-view-axis" checked={cad.axisVisible} onChange={() => cad.toggleAxis()}>{t("cam.view.showAxis")}</CheckRow>
    </SidebarSection>
    <SidebarSection id="cam-snap" title={t("cad.snapSettings")} icon={Magnet}><SnapSettings /></SidebarSection>
  </div>
}
