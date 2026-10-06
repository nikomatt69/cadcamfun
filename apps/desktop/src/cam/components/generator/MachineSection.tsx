import { Match, Switch, type JSX } from "solid-js"
import { Layers, Package, RotateCw, Settings } from "lucide-solid"
import { Motion } from "solid-motionone"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Section } from "./ui.tsx"

/** "Machine Type": mill, lathe or 3D printer, with what each is good for. */
export function MachineSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Section id="machine" delay={0.2} tone="blue" icon={Settings} title="Machine Type" testId="machine-section">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Machine Type</label>
        <select
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
          value={gen.settings.machineType}
          onChange={(event) => gen.updateSettings("machineType", event.currentTarget.value as typeof gen.settings.machineType)}
        >
          <option value="mill">🏭 CNC Mill</option>
          <option value="lathe">🔄 CNC Lathe</option>
          <option value="3dprinter">🖨️ 3D Printer</option>
        </select>
      </div>

      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
      >
        <div class="flex items-start space-x-3">
          <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
            <Switch>
              <Match when={gen.settings.machineType === "mill"}><Package size={18} class="text-blue-600 dark:text-blue-400" /></Match>
              <Match when={gen.settings.machineType === "lathe"}><RotateCw size={18} class="text-blue-600 dark:text-blue-400" /></Match>
              <Match when={gen.settings.machineType === "3dprinter"}><Layers size={18} class="text-blue-600 dark:text-blue-400" /></Match>
            </Switch>
          </div>
          <div>
            <h4 class="font-semibold text-blue-800 dark:text-blue-200 mb-1">
              <Switch>
                <Match when={gen.settings.machineType === "mill"}>CNC Milling Machine</Match>
                <Match when={gen.settings.machineType === "lathe"}>CNC Lathe Machine</Match>
                <Match when={gen.settings.machineType === "3dprinter"}>3D Printer</Match>
              </Switch>
            </h4>
            <p class="text-sm text-blue-700 dark:text-blue-300">
              <Switch>
                <Match when={gen.settings.machineType === "mill"}>Ideal for machining flat surfaces, contours, pockets, and complex 3D shapes. High precision subtractive manufacturing.</Match>
                <Match when={gen.settings.machineType === "lathe"}>Perfect for cylindrical parts, shafts, and rotational components. Excellent for turned parts and threading operations.</Match>
                <Match when={gen.settings.machineType === "3dprinter"}>Additive manufacturing for prototypes, models, and functional parts. Layer-by-layer material deposition.</Match>
              </Switch>
            </p>
          </div>
        </div>
      </Motion.div>
    </Section>
  )
}
