import { Show, type JSX } from "solid-js"
import { Activity } from "lucide-solid"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CheckRow, INPUT, LABEL, NumberField, Section } from "./ui.tsx"

/** "Advanced Settings": tolerance, path optimisation, arc fitting, strategies and tool compensation. */
export function AdvancedSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  return (
    <Section id="advanced" delay={0.45} tone="red" icon={Activity} title="Advanced Settings" testId="advanced-options-panel">
      <div>
        <h4 class="text-sm font-medium text-gray-800 mb-2">Precision Settings</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-sm text-gray-700 mb-1">Tolerance (mm)</label>
            <NumberField min="0.001" step="0.001" value={s().tolerance} onValue={(value) => gen.updateSettings("tolerance", value)} />
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4">
        <h4 class="text-sm font-medium text-gray-800 mb-2">Path Optimization</h4>
        <div class="space-y-3">
          <CheckRow id="use-path-optimization" checked={s().optimizePath || false} onChange={(checked) => gen.updateSettings("optimizePath", checked)}>Enable path optimization</CheckRow>
          <CheckRow id="use-arc-fitting" checked={s().useArcFitting || false} onChange={(checked) => gen.updateSettings("useArcFitting", checked)}>Convert segments to arcs (G2/G3)</CheckRow>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4">
        <h4 class="text-sm font-medium text-gray-800 mb-2">Advanced Cutting Strategies</h4>
        <div class="space-y-3">
          <CheckRow id="use-adaptive-feeds" checked={s().useAdaptiveFeeds || false} onChange={(checked) => gen.updateSettings("useAdaptiveFeeds", checked)}>Enable adaptive feeds in curves</CheckRow>
          <CheckRow id="use-rest-machining" checked={s().useRestMachining || false} onChange={(checked) => gen.updateSettings("useRestMachining", checked)}>Use rest machining (Rest Machining)</CheckRow>
          <Show when={s().finishingPass}>
            <div>
              <label class={LABEL}>Finishing Strategy</label>
              <select class={INPUT} value={s().finishingStrategy || "contour"} onChange={(event) => gen.updateSettings("finishingStrategy", event.currentTarget.value as ToolpathSettings["finishingStrategy"])}>
                <option value="contour">{s().operationType === "3d_surface" ? "Contour (waterline)" : "Contour"}</option>
                <Show when={s().operationType === "3d_surface"}>
                  <option value="parallel">Parallel (raster)</option>
                </Show>
              </select>
            </div>
          </Show>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4">
        <h4 class="text-sm font-medium text-gray-800 mb-2">Tool Compensation</h4>
        <div class="space-y-3">
          <CheckRow id="use-tool-compensation" checked={s().useToolCompensation || false} onChange={(checked) => gen.updateSettings("useToolCompensation", checked)}>Use tool compensation in G-code (G41/G42)</CheckRow>
          <Show when={s().useToolCompensation}>
            <div class="p-2 bg-blue-50 rounded-md">
              <p class="text-xs text-blue-700">
                The tool radius compensation (cutter compensation) will be inserted directly in the G-code. The direction will be determined automatically from the offset and cutting direction settings.
              </p>
            </div>
          </Show>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4">
        <div class="p-3 bg-blue-50 rounded-md">
          <p class="text-sm text-blue-800">
            The advanced settings allow for more precise control of the toolpath, but may require manual adjustment for optimal results. The advanced features depend on the type of numerical control used.
          </p>
        </div>
      </div>
    </Section>
  )
}
