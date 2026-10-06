import { For, Show, createEffect, createSignal, onMount, type JSX } from "solid-js"
import { useApp } from "../../state/context.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"

interface MachineConfig {
  id: string
  name: string
  config: { workVolume?: { x: number; y: number; z: number }; type: string; maxSpindleSpeed?: number; maxFeedRate?: number }
}

const FIELD = "block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300"
const MATERIALS = [["aluminum", "Aluminum"], ["steel", "Steel"], ["wood", "Wood"], ["plastic", "Plastic"], ["brass", "Brass"], ["titanium", "Titanium"], ["copper", "Copper"], ["composite", "Composite"], ["custom", "Other"]] as const

/** Stock size, position and material, and the machine it is for; "Apply" (re)creates the workpiece element. */
export default function WorkpieceSetup(): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const layers = useLayerStore()
  const elements = useElementsStore()
  const [machines, setMachines] = createSignal<MachineConfig[]>([])
  const [machineId, setMachineId] = createSignal("")
  const [workpieceId, setWorkpieceId] = createSignal<string | null>(null)
  const initial = () => ({
    width: cad.workpiece.width, height: cad.workpiece.height, depth: cad.workpiece.depth, radius: cad.workpiece.radius, material: cad.workpiece.material,
    positionX: 0, positionY: 0, positionZ: 0
  })
  const [form, setForm] = createSignal(initial())
  const set = (name: string, value: string) => setForm((previous) => ({ ...previous, [name]: name === "material" ? value : parseFloat(value) }))

  onMount(() => {
    app.runtime.run(app.client.machineConfigs.list({ query: {} })).then(
      (result) => setMachines(Array.isArray(result.data) ? (result.data as MachineConfig[]) : []),
      (cause) => { console.error("Error loading machine configurations:", cause); setMachines([]) }
    )
  })

  createEffect(() => { if (cad.selectedMachine?.id) setMachineId(cad.selectedMachine.id) })

  createEffect(() => {
    const existing = elements.elements.find((element) => element.type === "workpiece")
    if (!existing) return
    setWorkpieceId(existing.id)
    setForm({
      width: existing.width || cad.workpiece.width || 0, height: existing.height || cad.workpiece.height || 0, depth: existing.depth || cad.workpiece.depth || 0,
      radius: existing.radius || cad.workpiece.radius || 0, material: existing.material || cad.workpiece.material || "",
      positionX: existing.x || 0, positionY: existing.y || 0, positionZ: existing.z || 0
    })
  })

  const changeMachine = (id: string) => {
    setMachineId(id)
    const chosen = id ? machines().find((config) => config.id === id) : undefined
    if (!chosen) { cad.setSelectedMachine(null); return }
    cad.setSelectedMachine(chosen)
    const volume = chosen.config?.workVolume
    if (volume) setForm((previous) => ({ ...previous, width: volume.x, height: volume.y, depth: volume.z }))
  }

  const apply = () => {
    const state = form()
    cad.setWorkpiece({ width: state.width, height: state.height, depth: state.depth, radius: state.radius, material: state.material })
    const previous = workpieceId()
    if (previous) elements.deleteElement(previous)
    const id = elements.addElement({
      type: "workpiece", x: state.positionX, y: state.positionY, z: state.positionZ, width: state.width, height: state.height, depth: state.depth,
      material: state.material, color: "#808080", wireframe: true, layerId: layers.layers[0]?.id
    })
    setWorkpieceId(id)
  }

  const number = (name: "width" | "height" | "depth" | "positionX" | "positionY" | "positionZ", label: string, wrap = false) => (
    <div>
      <label class={LABEL}>{label}</label>
      <Show when={wrap} fallback={<input type="number" name={name} value={form()[name]} onInput={(e) => set(name, e.currentTarget.value)} class={`mt-1 ${FIELD}`} />}>
        <div class="mt-1 relative rounded-md shadow-sm">
          <input type="number" name={name} value={form()[name]} onInput={(e) => set(name, e.currentTarget.value)} class={FIELD} />
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none" />
        </div>
      </Show>
    </div>
  )

  return (
    <div class="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-4 space-y-4">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Workpiece Setup</h3>
      <div>
        <label class={LABEL}>Machine Configuration</label>
        <select name="machine" value={machineId()} onChange={(e) => changeMachine(e.currentTarget.value)} class={`mt-1 ${FIELD}`}>
          <option value="">Select a machine</option>
          <For each={machines()}>{(config) => <option value={config.id}>{config.name} ({config.config.type})</option>}</For>
        </select>
      </div>
      <div class="grid grid-cols-3 gap-4">{number("width", "Width", true)}{number("height", "Height", true)}{number("depth", "Depth", true)}</div>
      <div class="grid grid-cols-3 gap-4">{number("positionX", "Position X")}{number("positionY", "Position Y")}{number("positionZ", "Position Z")}</div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class={LABEL}>Material</label>
          <select name="material" value={form().material} onChange={(e) => set("material", e.currentTarget.value)} class={`mt-1 ${FIELD}`}>
            <For each={MATERIALS}>{([value, label]) => <option value={value}>{label}</option>}</For>
          </select>
        </div>
      </div>
      <Show when={cad.selectedMachine}>{(machine) =>
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-md text-sm">
          <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-1">Machine Information</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
            <div>Type: <span class="font-medium">{machine().config.type}</span></div>
            <div>Work Volume: <span class="font-medium">{machine().config.workVolume?.x}×{machine().config.workVolume?.y}×{machine().config.workVolume?.z} mm</span></div>
            <Show when={machine().config.maxSpindleSpeed}><div>Spindle Speed: <span class="font-medium">{machine().config.maxSpindleSpeed} rpm</span></div></Show>
            <Show when={machine().config.maxFeedRate}><div>Feed Rate: <span class="font-medium">{machine().config.maxFeedRate} mm/min</span></div></Show>
          </div>
        </div>}
      </Show>
      <div class="pt-3 flex justify-between">
        <button type="button" onClick={() => setForm(initial())} class="px-4 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500">Reset</button>
        <button type="button" onClick={apply} class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Apply Changes</button>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <p>The workpiece will be created in the default layer &quot;{layers.layers[0]?.name}&quot; and will be available for both CAD and CAM.</p>
      </div>
    </div>
  )
}
