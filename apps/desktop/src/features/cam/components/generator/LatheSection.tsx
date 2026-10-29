import { Show, type JSX } from "solid-js"
import { ChevronDown, ChevronUp } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { INPUT, LABEL, NumberField } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

/** "Lathe Parameters": stock diameter / length, spindle direction and turning type (legacy plain header, not a card). */
export function LatheSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Show when={gen.settings.machineType === "lathe"}>
      <div class="mb-6">
        <div class="flex items-center justify-between cursor-pointer" onClick={() => gen.toggleSection("lathe")}>
          <h3 class="text-lg font-medium text-gray-900">{t("cam.gen.lathe.params")}</h3>
          <Show when={gen.expanded.lathe} fallback={<ChevronDown size={18} />}><ChevronUp size={18} /></Show>
        </div>
        <Show when={gen.expanded.lathe}>
          <div class="mt-3 space-y-4">
            <div>
              <label class={LABEL}>{t("cam.gen.lathe.stockDia")}</label>
              <NumberField min="1" step="0.5" value={gen.settings.stockDiameter} onValue={(value) => gen.updateSettings("stockDiameter", value)} />
            </div>
            <div>
              <label class={LABEL}>{t("cam.gen.lathe.stockLength")}</label>
              <NumberField min="1" step="1" value={gen.settings.stockLength} onValue={(value) => gen.updateSettings("stockLength", value)} />
            </div>
            <div>
              <label class={LABEL}>{t("cam.gen.lathe.spindleDir")}</label>
              <select class={INPUT} value={gen.settings.spindleDirection} onChange={(event) => gen.updateSettings("spindleDirection", event.currentTarget.value as "cw" | "ccw")}>
                <option value="cw">{t("cam.gen.lathe.cw")}</option>
                <option value="ccw">{t("cam.gen.lathe.ccw")}</option>
              </select>
            </div>
            <div>
              <label class={LABEL}>{t("cam.gen.lathe.turningType")}</label>
              <select class={INPUT} value={gen.settings.turningOperation} onChange={(event) => gen.updateSettings("turningOperation", event.currentTarget.value as ToolpathSettings["turningOperation"])}>
                <option value="external">{t("cam.gen.lathe.external")}</option>
                <option value="internal">{t("cam.gen.lathe.internal")}</option>
                <option value="face">{t("cam.strategy.face")}</option>
              </select>
            </div>
            <div class="flex items-center">
              <input type="checkbox" id="toolCompensation" class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" checked={gen.settings.applyToolCompensation} onChange={(event) => gen.updateSettings("applyToolCompensation", event.currentTarget.checked)} />
              <label for="toolCompensation" class="ml-2 block text-sm text-gray-700">{t("cam.gen.lathe.radiusComp")}</label>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
