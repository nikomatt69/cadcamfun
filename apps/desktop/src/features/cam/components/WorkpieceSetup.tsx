/**
 * Stock and material controls (spec 06-desktop-ui.md §3 sidebar tab "Workpiece").
 *
 * Three numeric inputs (width / height / depth) and a material selector. The
 * numbers flow into the CAM store, so every other panel that reads the
 * workpiece reflects the change automatically.
 */
import { type JSX } from "solid-js"
import { Box } from "lucide-solid"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { Field, NumberField, INPUT } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import type { Workpiece } from "../store/camStore.ts"

export interface WorkpieceSetupProps {
  readonly workpiece: Workpiece
  readonly material: string
  readonly onChangeWorkpiece: (next: Workpiece) => void
  readonly onChangeMaterial: (next: string) => void
}

const MATERIALS: ReadonlyArray<string> = ["aluminum", "steel", "brass", "wood", "plastic", "mdf", "plywood"]

export default function WorkpieceSetup(props: WorkpieceSetupProps): JSX.Element {
  return (
    <SidebarSection id="cam-workpiece" title={t("cam.workpiece")} icon={Box} summary={`${props.workpiece.x} × ${props.workpiece.y} × ${props.workpiece.z}`}>
      <div class="panel-grid panel-grid--3">
        {(["x", "y", "z"] as const).map((axis) => <Field label={t(axis === "x" ? "cam.stockX" : axis === "y" ? "cam.stockY" : "cam.stockZ")} unit="mm" for={`cam-stock-${axis}`}>
          <NumberField id={`cam-stock-${axis}`} value={props.workpiece[axis]} step="0.1" accept={(value) => value >= 0}
            onValue={(value) => props.onChangeWorkpiece({ ...props.workpiece, [axis]: value })} />
        </Field>)}
      </div>
      <Field label={t("cam.material")} for="cam-stock-material">
        <select id="cam-stock-material" class={INPUT} value={props.material} onChange={(event) => props.onChangeMaterial(event.currentTarget.value)}>
          <option value="">{t("cam.selectOption")}</option>
          {MATERIALS.map((material) => <option value={material}>{material}</option>)}
        </select>
      </Field>
      <p class="panel-hint">{t("cam.unitsNotice")}</p>
    </SidebarSection>
  )
}
