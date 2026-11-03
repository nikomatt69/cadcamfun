import { Show, type JSX } from "solid-js"
import { ChevronDown, ChevronUp } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CheckRow, INPUT, LABEL, NumberField } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

/** "Lathe Parameters": stock diameter / length, spindle direction and turning type (legacy plain header, not a card). */
export function LatheSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Show when={gen.settings.machineType === "lathe"}>
      <div class="panel-group">
        <div class="flex cursor-pointer items-center justify-between" onClick={() => gen.toggleSection("lathe")}>
          <h3 class="panel-group__title">{t("cam.gen.lathe.params")}</h3>
          <Show when={gen.expanded.lathe} fallback={<ChevronDown size={14} />}><ChevronUp size={14} /></Show>
        </div>
        <Show when={gen.expanded.lathe}>
          <div class="grid gap-2.5">
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.lathe.stockDia")}</label>
              <NumberField min="1" step="0.5" value={gen.settings.stockDiameter} onValue={(value) => gen.updateSettings("stockDiameter", value)} />
            </div>
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.lathe.stockLength")}</label>
              <NumberField min="1" step="1" value={gen.settings.stockLength} onValue={(value) => gen.updateSettings("stockLength", value)} />
            </div>
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.lathe.spindleDir")}</label>
              <select class={INPUT} value={gen.settings.spindleDirection} onChange={(event) => gen.updateSettings("spindleDirection", event.currentTarget.value as "cw" | "ccw")}>
                <option value="cw">{t("cam.gen.lathe.cw")}</option>
                <option value="ccw">{t("cam.gen.lathe.ccw")}</option>
              </select>
            </div>
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.lathe.turningType")}</label>
              <select class={INPUT} value={gen.settings.turningOperation} onChange={(event) => gen.updateSettings("turningOperation", event.currentTarget.value as ToolpathSettings["turningOperation"])}>
                <option value="external">{t("cam.gen.lathe.external")}</option>
                <option value="internal">{t("cam.gen.lathe.internal")}</option>
                <option value="face">{t("cam.strategy.face")}</option>
              </select>
            </div>
            <CheckRow id="toolCompensation" checked={gen.settings.applyToolCompensation} onChange={(checked) => gen.updateSettings("applyToolCompensation", checked)}>{t("cam.gen.lathe.radiusComp")}</CheckRow>
          </div>
        </Show>
      </div>
    </Show>
  )
}
