import { Show, type JSX } from "solid-js"
import { ChevronDown, ChevronUp } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { INPUT, LABEL, NumberField } from "./ui.tsx"

/** "3D Printer Parameters": nozzle, filament, layer, extrusion width, speed and temperatures. */
export function PrinterParamsSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  return (
    <Show when={s().machineType === "3dprinter"}>
      <div class="mb-6">
        <div class="flex items-center justify-between cursor-pointer" onClick={() => gen.toggleSection("printer")}>
          <h3 class="text-lg font-medium text-gray-900">3D Printer Parameters</h3>
          <Show when={gen.expanded.printer} fallback={<ChevronDown size={18} />}><ChevronUp size={18} /></Show>
        </div>
        <Show when={gen.expanded.printer}>
          <div class="mt-3 space-y-4">
            <div>
              <label class={LABEL}>Nozzle Diameter (mm)</label>
              <NumberField min="0.1" step="0.1" value={s().nozzleDiameter} onValue={(value) => gen.updateSettings("nozzleDiameter", value)} />
            </div>
            <div>
              <label class={LABEL}>Filament Diameter (mm)</label>
              <select class={INPUT} value={String(s().filamentDiameter)} onChange={(event) => gen.updateSettings("filamentDiameter", parseFloat(event.currentTarget.value))}>
                <option value="1.75">1.75 mm</option>
                <option value="2.85">2.85 mm</option>
                <option value="3">3.0 mm</option>
              </select>
            </div>
            <div>
              <label class={LABEL}>Layer Height (mm)</label>
              <NumberField min="0.05" max="0.35" step="0.05" value={s().layerHeight} onValue={(value) => gen.updateSettings("layerHeight", value)} />
            </div>
            <div>
              <label class={LABEL}>Extrusion Width (mm)</label>
              <NumberField min="0.2" step="0.1" value={s().extrusionWidth} onValue={(value) => gen.updateSettings("extrusionWidth", value)} />
            </div>
            <div>
              <label class={LABEL}>Print Speed (mm/s)</label>
              <NumberField min="10" max="150" value={s().printSpeed} onValue={(value) => gen.updateSettings("printSpeed", value)} />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class={LABEL}>Print Temperature (°C)</label>
                <NumberField min="150" max="300" accept={() => true} value={s().printTemperature} onValue={(value) => gen.updateSettings("printTemperature", value)} />
              </div>
              <div>
                <label class={LABEL}>Plate Temperature (°C)</label>
                <NumberField min="0" max="120" accept={() => true} value={s().bedTemperature} onValue={(value) => gen.updateSettings("bedTemperature", value)} />
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
