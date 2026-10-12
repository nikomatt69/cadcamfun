import { For, type JSX } from "solid-js"
import { useCADStore } from "../store/cadStore.ts"

const INPUT = "w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
const PRESET = "px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
const PRESETS = [["center", "Center"], ["bottomLeft", "Bottom Left"], ["topRight", "Top Right"], ["topLeft", "Top Left"]] as const

/** Origin offset (X/Y/Z), presets and reset. */
export default function OriginControls(): JSX.Element {
  const cad = useCADStore()
  return (
    <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Origin Position</h3>
      <div class="grid grid-cols-3 gap-2 mb-3">
        <For each={["x", "y", "z"] as const}>{(axis) =>
          <div>
            <label class="block text-xs text-gray-500 dark:text-gray-400">{axis.toUpperCase()}</label>
            <input type="number" value={cad.originOffset[axis]} onInput={(event) => cad.setOriginOffset({ ...cad.originOffset, [axis]: parseFloat(event.currentTarget.value) || 0 })} class={INPUT} />
          </div>}
        </For>
      </div>
      <div class="mb-2">
        <h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Origin Preset</h4>
        <div class="grid grid-cols-3 gap-1">
          <For each={PRESETS}>{([preset, label]) => <button onClick={() => cad.setOriginPreset(preset)} class={PRESET}>{label}</button>}</For>
        </div>
      </div>
      <button onClick={() => cad.resetOrigin()} class="w-full px-3 py-1 mt-2 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70">Reset Origin (0,0,0)</button>
    </div>
  )
}
