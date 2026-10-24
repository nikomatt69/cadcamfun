/**
 * "Workholding" (spec 31 §5.6): how the part is held on the machine the generator is set to — the mill's vise / clamps /
 * plate, the lathe's turret, chuck and grip, the printer's motion and build height. The preview draws it, the set-up checks
 * use it. Editing a field marks the workholding as configured: from then on it is drawn solid and checked, not assumed.
 */
import { Show, type JSX } from "solid-js"
import { Lock } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { NumberField } from "../../../cad/components/property-inputs/NumberField.tsx"
import { t } from "../../../../i18n/index.ts"
import { CheckRow, INPUT, LABEL, Section } from "./ui.tsx"

export function WorkholdingSection(): JSX.Element {
  const gen = useGeneratorStore()
  const set = <K extends keyof ToolpathSettings>(key: K, value: ToolpathSettings[K]): void => gen.patchSettings({ [key]: value, workholdingConfigured: true } as Partial<ToolpathSettings>)
  const number = (id: string, label: string, key: "clampDepth" | "viseJawHeight" | "parallelsHeight" | "gripLength" | "stockBore" | "buildHeight", min: number) => (
    <div>
      <label class={LABEL} for={id}>{label}</label>
      <NumberField id={id} class={INPUT} min={min} step={1} value={gen.settings[key]} onChange={(value) => set(key, value)} />
    </div>
  )
  return (
    <Section id="workholding" icon={Lock} title={t("cam.workholding.title")} testId="workholding-section">
      <div class="space-y-4">
        <Show when={gen.settings.machineType === "mill"}>
          <div>
            <label class={LABEL} for="workholding-kind">{t("cam.workholding.kind")}</label>
            <select id="workholding-kind" class={INPUT} value={gen.settings.workholding} onChange={(event) => set("workholding", event.currentTarget.value as ToolpathSettings["workholding"])}>
              <option value="vise">{t("cam.workholding.vise")}</option>
              <option value="clamps">{t("cam.workholding.clamps")}</option>
              <option value="plate">{t("cam.workholding.plate")}</option>
              <option value="none">{t("cam.workholding.none")}</option>
            </select>
          </div>
          <Show when={gen.settings.workholding === "vise"}>
            <div>
              <label class={LABEL} for="vise-axis">{t("cam.workholding.jawAxis")}</label>
              <select id="vise-axis" class={INPUT} value={gen.settings.viseJawAxis} onChange={(event) => set("viseJawAxis", event.currentTarget.value as "x" | "y")}>
                <option value="x">X</option>
                <option value="y">Y</option>
              </select>
            </div>
            {number("clamp-depth", t("cam.workholding.clampDepth"), "clampDepth", 0)}
            {number("jaw-height", t("cam.workholding.jawHeight"), "viseJawHeight", 1)}
            {number("parallels", t("cam.workholding.parallels"), "parallelsHeight", 0)}
          </Show>
        </Show>
        <Show when={gen.settings.machineType === "lathe"}>
          <div>
            <label class={LABEL} for="lathe-turret">{t("cam.workholding.turret")}</label>
            <select id="lathe-turret" class={INPUT} value={gen.settings.latheTurret} onChange={(event) => set("latheTurret", event.currentTarget.value as "rear" | "front")}>
              <option value="rear">{t("cam.workholding.turretRear")}</option>
              <option value="front">{t("cam.workholding.turretFront")}</option>
            </select>
          </div>
          <div>
            <label class={LABEL} for="chuck-type">{t("cam.workholding.chuck")}</label>
            <select id="chuck-type" class={INPUT} value={gen.settings.chuckType} onChange={(event) => set("chuckType", event.currentTarget.value as ToolpathSettings["chuckType"])}>
              <option value="3-jaw">3-jaw</option>
              <option value="4-jaw">4-jaw</option>
              <option value="collet">Collet</option>
            </select>
          </div>
          {number("grip-length", t("cam.workholding.gripLength"), "gripLength", 1)}
          {number("stock-bore", t("cam.workholding.bore"), "stockBore", 0)}
          <CheckRow id="tailstock" checked={gen.settings.tailstock} onChange={(checked) => set("tailstock", checked)}>{t("cam.workholding.tailstock")}</CheckRow>
        </Show>
        <Show when={gen.settings.machineType === "3dprinter"}>
          <div>
            <label class={LABEL} for="printer-kinematics">{t("cam.workholding.kinematics")}</label>
            <select id="printer-kinematics" class={INPUT} value={gen.settings.printerKinematics} onChange={(event) => set("printerKinematics", event.currentTarget.value as ToolpathSettings["printerKinematics"])}>
              <option value="cartesian">Cartesian (bed moves in Z)</option>
              <option value="corexy">CoreXY (bed moves in Z)</option>
              <option value="bed-slinger">Bed-slinger (bed moves in Y)</option>
              <option value="delta">Delta (nozzle moves)</option>
            </select>
          </div>
          {number("build-height", t("cam.workholding.buildHeight"), "buildHeight", 1)}
        </Show>
        <Show when={gen.settings.machineType !== "3dprinter"}>
          <CheckRow id="workholding-configured" checked={gen.settings.workholdingConfigured} onChange={(checked) => gen.patchSettings({ workholdingConfigured: checked })}>{t("cam.workholding.configured")}</CheckRow>
        </Show>
      </div>
    </Section>
  )
}
