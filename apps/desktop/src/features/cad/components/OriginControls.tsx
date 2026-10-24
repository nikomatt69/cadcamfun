import { For, type JSX } from "solid-js"
import { Crosshair } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { Field, Grid, NumberField } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"

const PRESETS = [["center", "Center"], ["bottomLeft", "Bottom Left"], ["topRight", "Top Right"], ["topLeft", "Top Left"]] as const

/** Origin offset (X/Y/Z), presets and reset. */
export default function OriginControls(): JSX.Element {
  const cad = useCADStore()
  return <SidebarSection id="workspace-origin" title={t("cad.originPosition")} icon={Crosshair}>
    <Grid cols={3}>
      <For each={["x", "y", "z"] as const}>{(axis) => <Field label={axis.toUpperCase()} unit="mm" for={`workspace-origin-${axis}`}>
        <NumberField id={`workspace-origin-${axis}`} value={cad.originOffset[axis]} accept={() => true}
          onValue={(value) => cad.setOriginOffset({ ...cad.originOffset, [axis]: value })} />
      </Field>}</For>
    </Grid>
    <div class="panel-grid panel-grid--2">
      <For each={PRESETS}>{([preset, label]) => <button type="button" onClick={() => cad.setOriginPreset(preset)} class="panel-btn">{label}</button>}</For>
    </div>
    <button type="button" onClick={() => cad.resetOrigin()} class="panel-btn panel-btn--block">{t("cad.resetOrigin")}</button>
  </SidebarSection>
}
