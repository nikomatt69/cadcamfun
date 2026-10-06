import { Show, type JSX } from "solid-js"
import { SlidersHorizontal } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { INPUT, LABEL, NumberField, Section } from "./ui.tsx"

const BLUE = "#4B83F0"

/** "Cutting Parameters": pass depth, feeds, stepover, tool offset and direction (with their sketches) and live statistics. */
export function CuttingSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  const chipLoad = () => (s().feedrate / (s().rpm * s().flutes)).toFixed(3)
  const feedback = () => cam.generator.getCuttingFeedback(s())
  const recommendedPlunge = () => cam.generator.calculateRecommendedPlungeRate(s().feedrate)
  const stats = () => cam.generator.calculateCuttingStatistics(s())
  const effectiveStepover = () => (s().stepover / 100) * s().toolDiameter
  return (
    <Section id="cutting" delay={0.4} tone="orange" icon={SlidersHorizontal} title="Cutting Parameters" testId="cutting-section">
      <div>
        <label class={LABEL}>Pass Depth (mm)</label>
        <NumberField min="0.1" step="0.1" value={s().stepdown} onValue={(value) => gen.updateSettings("stepdown", value)} />
        <div class="flex justify-between text-xs text-gray-500 mt-1"><span>Min: 0.1mm</span><span>Max recommended: 3mm</span></div>
      </div>

      <div>
        <label class={LABEL}>Feedrate (mm/min)</label>
        <NumberField min="1" int value={s().feedrate} onValue={(value) => gen.updateSettings("feedrate", value)} />
        <div class="flex flex-col text-xs mt-1">
          <span class="text-gray-500">Chip Load per flute: {chipLoad()} mm</span>
          <Show when={feedback()}>
            <span class={`${feedback().startsWith("✓") ? "text-green-600" : "text-yellow-600"} font-medium`}>{feedback()}</span>
          </Show>
        </div>
      </div>

      <div>
        <label class={LABEL}>Entry Speed (mm/min)</label>
        <NumberField min="1" int value={s().plungerate} onValue={(value) => gen.updateSettings("plungerate", value)} />
        <div class="text-xs text-gray-500 mt-1">
          Recommended: {recommendedPlunge()} mm/min ({Math.round((recommendedPlunge() / s().feedrate) * 100)}% of feedrate)
        </div>
      </div>

      <div>
        <label class={LABEL}>Stepover (% of diameter)</label>
        <NumberField min="10" max="90" int accept={(value) => value >= 10 && value <= 90} value={s().stepover} onValue={(value) => gen.updateSettings("stepover", value)} />
        <div class="text-xs text-gray-500 mt-1">Effective width: {effectiveStepover().toFixed(2)} mm</div>
      </div>

      <div>
        <label class={LABEL}>Tool Offset</label>
        <select class={INPUT} value={s().offset} onChange={(event) => gen.updateSettings("offset", event.currentTarget.value as ToolpathSettings["offset"])}>
          <option value="outside">Outside</option>
          <option value="inside">Inside</option>
          <option value="center">Center</option>
        </select>
        <div class="mt-2 flex justify-center">
          <div class="w-48 h-32 relative">
            <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
              <Show when={s().offset === "center"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <circle cx="120" cy="40" r="4" fill={BLUE} />
                <line x1="120" y1="20" x2="120" y2="140" stroke={BLUE} stroke-width="1" stroke-dasharray="4,4" />
                <line x1="50" y1="80" x2="190" y2="80" stroke={BLUE} stroke-width="1" stroke-dasharray="4,4" />
              </Show>
              <Show when={s().offset === "outside"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <rect x="60" y="30" width="120" height="100" stroke={BLUE} stroke-width="2" fill="none" />
                <circle cx="60" cy="30" r="4" fill={BLUE} />
                <path d="M 60,30 L 70,40" stroke={BLUE} stroke-width="1" />
              </Show>
              <Show when={s().offset === "inside"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <rect x="80" y="50" width="80" height="60" stroke={BLUE} stroke-width="2" fill="none" />
                <circle cx="80" cy="50" r="4" fill={BLUE} />
                <path d="M 80,50 L 70,40" stroke={BLUE} stroke-width="1" />
              </Show>
            </svg>
          </div>
        </div>
      </div>

      <div>
        <label class={LABEL}>Cutting Direction</label>
        <select class={INPUT} value={s().direction} onChange={(event) => gen.updateSettings("direction", event.currentTarget.value as ToolpathSettings["direction"])}>
          <option value="climb">Concordant (Climb)</option>
          <option value="conventional">Discordant (Conventional)</option>
        </select>
        <div class="mt-2 flex justify-center">
          <div class="w-48 h-32 relative">
            <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
              <text x="120" y="30" text-anchor="middle" font-size="16" fill={BLUE}>{s().direction === "climb" ? "Concordant" : "Discordant"}</text>
              <circle cx="80" cy="80" r="40" fill="none" stroke="#aaa" stroke-width="1" />
              <circle cx="80" cy="80" r={s().direction === "climb" ? "14" : "8"} fill={BLUE} />
              <Show when={s().direction === "climb"}>
                <path d="M 80,80 Q 100,95 120,80" stroke={BLUE} stroke-width="2" fill="none" stroke-dasharray="4,3" />
                <path d="M 115,77 L 120,80 L 115,83" fill="none" stroke={BLUE} stroke-width="2" />
              </Show>
              <circle cx="160" cy="80" r="40" fill="none" stroke="#aaa" stroke-width="1" />
              <circle cx="160" cy="80" r={s().direction === "conventional" ? "14" : "8"} fill={BLUE} />
              <Show when={s().direction === "conventional"}>
                <path d="M 160,80 Q 140,65 120,80" stroke={BLUE} stroke-width="2" fill="none" stroke-dasharray="4,3" />
                <path d="M 125,77 L 120,80 L 125,83" fill="none" stroke={BLUE} stroke-width="2" />
              </Show>
            </svg>
          </div>
        </div>
      </div>

      <div class="flex items-center">
        <input type="checkbox" id="finishingPass" class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" checked={s().finishingPass} onChange={(event) => gen.updateSettings("finishingPass", event.currentTarget.checked)} />
        <label for="finishingPass" class="ml-2 block text-sm text-gray-700">Add Finishing Pass</label>
      </div>

      <Show when={s().finishingPass}>
        <div>
          <label class={LABEL}>Finishing Allowance (mm)</label>
          <NumberField min="0.05" max="1" step="0.05" value={s().finishingAllowance} onValue={(value) => gen.updateSettings("finishingAllowance", value)} />
        </div>
      </Show>

      <div class="mt-4 p-4 border border-gray-300 bg-gray-50 rounded-md">
        <h4 class="text-xs font-medium text-gray-800 mb-2">Cutting Statistics</h4>
        <div class="grid  gap-x-4 gap-y-2 text-sm">
          <div class="flex justify-between"><span class="text-gray-600">Cutting Speed:</span><span class="font-medium">{stats().cuttingSpeed.toFixed(1)} m/min</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Chip Load per flute:</span><span class="font-medium">{chipLoad()} mm</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Material Removal Rate:</span><span class="font-medium">{stats().materialRemovalRate.toFixed(2)} cm³/min</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Effective Stepover:</span><span class="font-medium">{effectiveStepover().toFixed(2)} mm</span></div>
        </div>
      </div>
    </Section>
  )
}
