import { Show, type JSX } from "solid-js"
import { CircleDot } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CheckRow, Field, INPUT, NumberField, Section } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

/** Turning stock and operation settings read by the quick lathe generator. */
export function LatheSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Show when={gen.settings.machineType === "lathe"}>
      <Section id="lathe" icon={CircleDot} title={t("cam.gen.lathe.params")} testId="lathe-parameters-section">
        <Field label={t("cam.gen.lathe.stockDia")} for="lathe-stock-diameter">
          <NumberField id="lathe-stock-diameter" min="1" step="0.5" value={gen.settings.stockDiameter} onValue={(value) => gen.updateSettings("stockDiameter", value)} />
        </Field>
        <Field label={t("cam.gen.lathe.stockLength")} for="lathe-stock-length">
          <NumberField id="lathe-stock-length" min="1" step="1" value={gen.settings.stockLength} onValue={(value) => gen.updateSettings("stockLength", value)} />
        </Field>
        <Field label={t("cam.gen.lathe.turningType")} for="lathe-turning-type">
          <select id="lathe-turning-type" class={INPUT} value={gen.settings.turningOperation} onChange={(event) => gen.updateSettings("turningOperation", event.currentTarget.value as ToolpathSettings["turningOperation"])}>
            <option value="external">{t("cam.gen.lathe.external")}</option>
            <option value="internal">{t("cam.gen.lathe.internal")}</option>
            <option value="face">{t("cam.strategy.face")}</option>
          </select>
        </Field>
        <CheckRow id="toolCompensation" checked={gen.settings.applyToolCompensation} onChange={(checked) => gen.updateSettings("applyToolCompensation", checked)}>{t("cam.gen.lathe.radiusComp")}</CheckRow>
        <p class="panel-hint" role={gen.settings.applyToolCompensation ? "alert" : undefined}>{t("cam.gen.lathe.compUnsupported")}</p>
      </Section>
    </Show>
  )
}
