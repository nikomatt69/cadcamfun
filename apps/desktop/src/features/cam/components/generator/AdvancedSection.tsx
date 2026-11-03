import { Show, type JSX } from "solid-js"
import { Activity } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CheckRow, Field, Group, INPUT, LABEL, Note, NumberField, Section } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

/** "Advanced Settings": tolerance, path optimisation, arc fitting, strategies and tool compensation. */
export function AdvancedSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  return (
    <Section id="advanced" icon={Activity} title={t("cad.createComponent.advanced")} testId="advanced-options-panel">
      <Group title={t("cam.gen.adv.precision")}>
        <Field label={t("cam.verify.tolerance")}>
          <NumberField min="0.001" step="0.001" value={s().tolerance} onValue={(value) => gen.updateSettings("tolerance", value)} />
        </Field>
      </Group>

      <Group title={t("cam.gen.adv.pathOpt")}>
        <div class="grid gap-2">
          <CheckRow id="use-path-optimization" checked={s().optimizePath || false} onChange={(checked) => gen.updateSettings("optimizePath", checked)}>{t("cam.gen.adv.enablePathOpt")}</CheckRow>
          <CheckRow id="use-arc-fitting" checked={s().useArcFitting || false} onChange={(checked) => gen.updateSettings("useArcFitting", checked)}>{t("cam.gen.adv.arcs")}</CheckRow>
        </div>
      </Group>

      <Group title={t("cam.gen.adv.strategies")}>
        <div class="grid gap-2">
          <CheckRow id="use-adaptive-feeds" checked={s().useAdaptiveFeeds || false} onChange={(checked) => gen.updateSettings("useAdaptiveFeeds", checked)}>{t("cam.gen.adv.adaptiveFeeds")}</CheckRow>
          {/* Rest machining continues the tool before it on a surface: roughing (what it left) or finishing (pencil, where it did not reach). */}
          <Show when={s().operationType === "3d_surface"}>
            <CheckRow id="use-rest-machining" checked={s().useRestMachining || false} onChange={(checked) => gen.updateSettings("useRestMachining", checked)}>{s().surfaceStrategy === "roughing" ? "Rest machining: cut only what a larger tool left" : "Rest finishing (pencil): only where a larger tool did not reach"}</CheckRow>
            <Show when={s().useRestMachining}>
              <div class="panel-field">
                <label class={LABEL}>{t("cam.gen.adv.prevToolDia")}</label>
                <NumberField min="0.1" step="0.1" value={s().restToolDiameter} onValue={(value) => gen.updateSettings("restToolDiameter", value)} />
              </div>
            </Show>
          </Show>
          <Show when={s().finishingPass}>
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.adv.finishStrategy")}</label>
              <select class={INPUT} value={s().finishingStrategy || "contour"} onChange={(event) => gen.updateSettings("finishingStrategy", event.currentTarget.value as ToolpathSettings["finishingStrategy"])}>
                <option value="contour">{s().operationType === "3d_surface" ? "Contour (waterline)" : t("cam.strategy.contour")}</option>
                <Show when={s().operationType === "3d_surface"}>
                  <option value="parallel">{t("cam.gen.adv.parallelRaster")}</option>
                </Show>
              </select>
            </div>
          </Show>
        </div>
      </Group>

      <Group title={t("cam.gen.adv.toolComp")}>
        <div class="grid gap-2">
          <CheckRow id="use-tool-compensation" checked={s().useToolCompensation || false} onChange={(checked) => gen.updateSettings("useToolCompensation", checked)}>{t("cam.gen.adv.useToolComp")}</CheckRow>
          <Show when={s().useToolCompensation}>
            <Note>{t("cam.gen.adv.toolCompNote")}</Note>
          </Show>
        </div>
      </Group>

      <Note>{t("cam.gen.adv.advancedNote")}</Note>
    </Section>
  )
}
