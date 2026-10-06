import { Show, type JSX } from "solid-js"
import { ChevronDown, ChevronUp } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { INPUT, LABEL, NumberField } from "./ui.tsx"

/** "Lathe Parameters": stock diameter / length, spindle direction and turning type (legacy plain header, not a card). */
export function LatheSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Show when={gen.settings.machineType === "lathe"}>
      <div class="mb-6">
        <div class="flex items-center justify-between cursor-pointer" onClick={() => gen.toggleSection("lathe")}>
          <h3 class="text-lg font-medium text-gray-900">Lathe Parameters</h3>
          <Show when={gen.expanded.lathe} fallback={<ChevronDown size={18} />}><ChevronUp size={18} /></Show>
        </div>
        <Show when={gen.expanded.lathe}>
          <div class="mt-3 space-y-4">
            <div>
              <label class={LABEL}>Stock Diameter (mm)</label>
              <NumberField min="1" step="0.5" value={gen.settings.stockDiameter} onValue={(value) => gen.updateSettings("stockDiameter", value)} />
            </div>
            <div>
              <label class={LABEL}>Stock Length (mm)</label>
              <NumberField min="1" step="1" value={gen.settings.stockLength} onValue={(value) => gen.updateSettings("stockLength", value)} />
            </div>
            <div>
              <label class={LABEL}>Spindle Direction</label>
              <select class={INPUT} value={gen.settings.spindleDirection} onChange={(event) => gen.updateSettings("spindleDirection", event.currentTarget.value as "cw" | "ccw")}>
                <option value="cw">Clockwise (CW)</option>
                <option value="ccw">Counterclockwise (CCW)</option>
              </select>
            </div>
            <div>
              <label class={LABEL}>Turning Type</label>
              <select class={INPUT} value={gen.settings.turningOperation} onChange={(event) => gen.updateSettings("turningOperation", event.currentTarget.value as ToolpathSettings["turningOperation"])}>
                <option value="external">External</option>
                <option value="internal">Internal</option>
                <option value="face">Face</option>
              </select>
            </div>
            <div class="flex items-center">
              <input type="checkbox" id="toolCompensation" class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" checked={gen.settings.applyToolCompensation} onChange={(event) => gen.updateSettings("applyToolCompensation", event.currentTarget.checked)} />
              <label for="toolCompensation" class="ml-2 block text-sm text-gray-700">Apply tool radius compensation</label>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
