import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { Edit2, Minus, Move, Plus, X } from "lucide-solid"
import type { Vector3 } from "./Vector3Input.tsx"
import { NumberField } from "./NumberField.tsx"

interface PointListInputProps {
  readonly label: string
  readonly value?: Vector3[] | undefined
  onChange(points: Vector3[]): void
  readonly disabled?: boolean
  readonly minPoints?: number | undefined
  readonly maxPoints?: number | undefined
  readonly exactPoints?: number | undefined
}

const COORD = "w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400"

/** Edits a list of 3D points in a dialog (add, remove, per-point coordinates, min/max/exact validation). */
export function PointListInput(props: PointListInputProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [points, setPoints] = createSignal<Vector3[]>([])
  const [current, setCurrent] = createSignal<number | null>(null)
  const value = () => props.value ?? []
  const min = () => props.minPoints ?? 0

  const openDialog = () => { setPoints([...value()]); setOpen(true) }
  const close = () => { setOpen(false); setCurrent(null) }

  const save = () => {
    if (min() > 0 && points().length < min()) { alert(`Sono richiesti almeno ${min()} punti`); return }
    if (props.exactPoints && points().length !== props.exactPoints) { alert(`Sono richiesti esattamente ${props.exactPoints} punti`); return }
    props.onChange(points())
    close()
  }

  const add = () => {
    if (props.maxPoints && points().length >= props.maxPoints) { alert(`Numero massimo di punti consentito: ${props.maxPoints}`); return }
    const last = points()[points().length - 1]
    const next = last ? { x: last.x + 10, y: last.y, z: last.z } : { x: 0, y: 0, z: 0 }
    setCurrent(points().length)
    setPoints([...points(), next])
  }

  const remove = (index: number) => {
    if (min() > 0 && points().length <= min()) { alert(`Sono richiesti almeno ${min()} punti`); return }
    setPoints(points().filter((_, i) => i !== index))
    const selected = current()
    if (selected === index) setCurrent(null)
    else if (selected !== null && selected > index) setCurrent(selected - 1)
  }

  const update = (index: number, axis: "x" | "y" | "z", value: number) =>
    setPoints(points().map((point, i) => (i === index ? { ...point, [axis]: value } : point)))

  return (
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">
        {props.label} ({value().length || 0} points)
        {min() > 0 && ` (Min: ${min()})`}
        {props.maxPoints ? ` (Max: ${props.maxPoints})` : ""}
        {props.exactPoints ? ` (Richiesti: ${props.exactPoints})` : ""}
      </label>
      <button type="button" onClick={openDialog} disabled={props.disabled ?? false} class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center text-gray-700 dark:text-blue-400">
        <span>Edit Points</span>
        <Edit2 size={16} />
      </button>

      <Presence>
        <Show when={open()}>
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(event: MouseEvent) => { if (event.target === event.currentTarget) close() }}>
            <Motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(event: MouseEvent) => event.stopPropagation()}>
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-blue-400">Edit Points</h3>
                <button type="button" onClick={close} class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300" aria-label="Close"><X size={20} /></button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border dark:border-gray-600 rounded-md p-2">
                  <div class="flex justify-between items-center mb-2">
                    <h4 class="text-sm font-medium dark:text-blue-400">Points List</h4>
                    <button type="button" onClick={add} class="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/50 rounded" title="Add Point"><Plus size={16} /></button>
                  </div>
                  <div class="max-h-64 overflow-y-auto">
                    <For each={points()}>{(point, index) =>
                      <div
                        class={`flex justify-between items-center p-2 my-1 rounded cursor-pointer ${current() === index() ? "bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700" : "hover:bg-gray-50 dark:hover:bg-blue-900/30"}`}
                        onClick={() => setCurrent(index())}
                      >
                        <div class="flex items-center">
                          <Move size={14} class="text-gray-400 dark:text-gray-500 mr-2" />
                          <div class="text-xs dark:text-blue-400">Point {index() + 1}: ({point?.x?.toFixed(1) || 0}, {point?.y?.toFixed(1) || 0}, {point?.z?.toFixed(1) || 0})</div>
                        </div>
                        <button type="button" onClick={(event) => { event.stopPropagation(); remove(index()) }} class="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 rounded" title="Remove Point"><Minus size={14} /></button>
                      </div>}
                    </For>
                    <Show when={points().length === 0}>
                      <div class="text-center text-gray-500 dark:text-gray-400 py-4">No points added. Click the + button to add a point.</div>
                    </Show>
                  </div>
                </div>
                <div class="border dark:border-gray-600 rounded-md p-2">
                  <h4 class="text-sm font-medium mb-2 dark:text-blue-400">Point Editor</h4>
                  <Show when={current()} keyed fallback={<div class="text-center text-gray-500 dark:text-gray-400 py-10">Select a point from the list to modify its coordinates.</div>}>{(index) =>
                    <div class="space-y-3">
                      <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Editing coordinates for point {index + 1}</div>
                      <div class="grid grid-cols-3 gap-2">
                        <For each={["x", "y", "z"] as const}>{(axis) =>
                          <div>
                            <label class="block text-xs text-gray-500 dark:text-blue-400 mb-1">{axis.toUpperCase()}</label>
                            <NumberField label={`Point ${index + 1} ${axis.toUpperCase()}`} value={points()[index]?.[axis] ?? 0} onChange={(value) => update(index, axis, value)} class={COORD} step={0.1} />
                          </div>}
                        </For>
                      </div>
                    </div>}
                  </Show>
                </div>
              </div>
              <div class="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={close} class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Cancel</button>
                <button type="button" onClick={save} class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save Points</button>
              </div>
            </Motion.div>
          </Motion.div>
        </Show>
      </Presence>
    </div>
  )
}
