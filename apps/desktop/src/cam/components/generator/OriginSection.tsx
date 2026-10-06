import { Show, type JSX } from "solid-js"
import { Target } from "lucide-solid"
import { Motion } from "solid-motionone"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { NumberField, Section } from "./ui.tsx"

const FIELD = "w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
const BLUE = "#3B82F6"

/** "Origin Coordinates": where the machine zero sits relative to the stock, with the legacy schematic. */
export function OriginSection(): JSX.Element {
  const gen = useGeneratorStore()
  const origin = () => gen.settings.originType
  const axis = (name: "originX" | "originY" | "originZ", label: string): JSX.Element => (
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <NumberField step="0.1" class={FIELD} value={gen.settings[name]} accept={() => true} onValue={(value) => gen.updateSettings(name, value)} />
    </div>
  )
  return (
    <Section id="origin" delay={0.15} tone="orange" icon={Target} title="Origin Coordinates" testId="origin-section">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Origin Type</label>
        <select class={FIELD} value={origin()} onChange={(event) => gen.updateSettings("originType", event.currentTarget.value as typeof gen.settings.originType)}>
          <option value="workpiece-center">Workpiece Center</option>
          <option value="workpiece-corner">Workpiece Corner (bottom left)</option>
          <option value="workpiece-corner2">Workpiece Corner (top left)</option>
          <option value="machine-zero">Machine Zero</option>
          <option value="custom">Custom Coordinates</option>
        </select>
      </div>

      <Show when={origin() === "custom"}>
        <div class="grid grid-cols-3 gap-4">
          {axis("originX", "X (mm)")}
          {axis("originY", "Y (mm)")}
          {axis("originZ", "Z (mm)")}
        </div>
      </Show>

      <div class="border border-gray-200 rounded-md p-3 bg-gray-50">
        <h4 class="text-sm font-medium text-gray-700 mb-2">Visual Reference</h4>
        <div class="w-full h-32 relative bg-white border border-gray-300 rounded">
          <div class="absolute inset-0 flex items-center justify-center">
            <svg width="100%" height="100%" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
              <rect x="50" y="20" width="100" height="60" fill="none" stroke="#9CA3AF" stroke-width="1" />
              <Show when={origin() === "workpiece-center"}>
                <circle cx="100" cy="50" r="4" fill={BLUE} />
                <line x1="100" y1="10" x2="100" y2="90" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <line x1="20" y1="50" x2="180" y2="50" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <text x="110" y="40" font-size="12" fill={BLUE}>Origin</text>
              </Show>
              <Show when={origin() === "workpiece-corner"}>
                <circle cx="50" cy="80" r="4" fill={BLUE} />
                <line x1="50" y1="10" x2="50" y2="90" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <line x1="20" y1="80" x2="180" y2="80" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <text x="35" y="95" font-size="12" fill={BLUE}>Origin</text>
              </Show>
              <Show when={origin() === "workpiece-corner2"}>
                <circle cx="50" cy="20" r="4" fill={BLUE} />
                <line x1="50" y1="10" x2="50" y2="90" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <line x1="20" y1="20" x2="180" y2="20" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <text x="35" y="15" font-size="12" fill={BLUE}>Origin</text>
              </Show>
              <Show when={origin() === "machine-zero"}>
                <circle cx="20" cy="10" r="4" fill={BLUE} />
                <line x1="20" y1="10" x2="20" y2="90" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <line x1="20" y1="10" x2="180" y2="10" stroke={BLUE} stroke-width="1" stroke-dasharray="4,2" />
                <text x="10" y="25" font-size="12" fill={BLUE}>Zero</text>
              </Show>
              <Show when={origin() === "custom"}>
                <circle cx={gen.settings.originX / 2 + 100} cy={50 - gen.settings.originY / 2} r="4" fill={BLUE} />
                <text x={gen.settings.originX / 2 + 105} y={45 - gen.settings.originY / 2} font-size="12" fill={BLUE}>Custom</text>
              </Show>
              <text x="180" y="50" font-size="10" fill="#374151">X+</text>
              <text x="100" y="10" font-size="10" fill="#374151">Y+</text>
            </svg>
          </div>
        </div>
      </div>

      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        class="p-4 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
      >
        <div class="flex items-start space-x-3">
          <div class="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
            <Target size={18} class="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h4 class="font-semibold text-orange-800 dark:text-orange-200 mb-1">Origin Reference</h4>
            <p class="text-sm text-orange-700 dark:text-orange-300">
              <Show when={origin() === "workpiece-center"}>The toolpath will be generated using the center of the workpiece as origin (X0, Y0, Z0).</Show>
              <Show when={origin() === "workpiece-corner"}>The toolpath will be generated considering the bottom left corner of the workpiece as origin (X0, Y0), with Z0 on the top surface.</Show>
              <Show when={origin() === "machine-zero"}>The toolpath will be generated using machine coordinates without offset.</Show>
              <Show when={origin() === "custom"}>Set custom coordinates for the toolpath origin.</Show>
            </p>
          </div>
        </div>
      </Motion.div>
    </Section>
  )
}
