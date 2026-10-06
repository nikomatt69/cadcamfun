import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { Droplet, Minus, Plus, X } from "lucide-solid"

interface ColorValue { r: number; g: number; b: number }

interface ColorListInputProps {
  readonly label: string
  readonly value?: ColorValue[] | undefined
  onChange(colors: ColorValue[]): void
  readonly disabled?: boolean
}

const PRESETS = ["#FF0000", "#FF9900", "#FFCC00", "#33CC00", "#0099FF", "#6633CC", "#CC33FF", "#FF3399", "#000000", "#666666", "#999999", "#CCCCCC", "#FFFFFF", "#996633", "#006633", "#003366"]
const hex = (color: ColorValue) => `#${[color.r, color.g, color.b].map((channel) => Math.floor(channel * 255).toString(16).padStart(2, "0")).join("")}`

/** Edits a list of normalised (0-1) RGB colours with a picker, presets and per-colour update. */
export function ColorListInput(props: ColorListInputProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [colors, setColors] = createSignal<ColorValue[]>([])
  const [current, setCurrent] = createSignal<number | null>(null)
  const [currentHex, setCurrentHex] = createSignal("#000000")
  const value = () => props.value ?? []

  const close = () => { setOpen(false); setCurrent(null) }
  const add = () => {
    const digits = currentHex().replace("#", "")
    const color = { r: parseInt(digits.substring(0, 2), 16) / 255, g: parseInt(digits.substring(2, 4), 16) / 255, b: parseInt(digits.substring(4, 6), 16) / 255 }
    const index = current()
    setColors(index !== null ? colors().map((entry, i) => (i === index ? color : entry)) : [...colors(), color])
  }
  const remove = (index: number) => {
    setColors(colors().filter((_, i) => i !== index))
    const selected = current()
    if (selected === index) { setCurrent(null); setCurrentHex("#000000") }
    else if (selected !== null && selected > index) setCurrent(selected - 1)
  }

  return (
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">{props.label} ({value().length || 0} colors)</label>
      <button type="button" onClick={() => { setColors([...value()]); setCurrentHex("#000000"); setCurrent(null); setOpen(true) }} disabled={props.disabled ?? false} class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center text-gray-700 dark:text-blue-400">
        <span>Edit Colors</span>
        <Droplet size={16} />
      </button>

      <Presence>
        <Show when={open()}>
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(event: MouseEvent) => { if (event.target === event.currentTarget) close() }}>
            <Motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(event: MouseEvent) => event.stopPropagation()}>
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-blue-400">Edit Colors</h3>
                <button type="button" onClick={close} class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300" aria-label="Close"><X size={20} /></button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border dark:border-gray-600 rounded-md p-2">
                  <div class="flex justify-between items-center mb-2">
                    <h4 class="text-sm font-medium dark:text-blue-400">Color List</h4>
                    <button type="button" onClick={() => { setCurrent(null); setCurrentHex("#000000") }} class="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/50 rounded" title="Add Color"><Plus size={16} /></button>
                  </div>
                  <div class="max-h-64 overflow-y-auto">
                    <For each={colors()}>{(color, index) =>
                      <div
                        class={`flex justify-between items-center p-2 my-1 rounded cursor-pointer ${current() === index() ? "bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700" : "hover:bg-gray-50 dark:hover:bg-blue-900/30"}`}
                        onClick={() => { setCurrent(index()); setCurrentHex(hex(color)) }}
                      >
                        <div class="flex items-center">
                          <div class="w-6 h-6 rounded-full mr-2 border border-gray-300 dark:border-gray-600" style={{ "background-color": hex(color) }} />
                          <div class="text-xs dark:text-blue-400">{hex(color)}</div>
                        </div>
                        <button type="button" onClick={(event) => { event.stopPropagation(); remove(index()) }} class="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 rounded" title="Remove Color"><Minus size={14} /></button>
                      </div>}
                    </For>
                    <Show when={colors().length === 0}><div class="text-center text-gray-500 dark:text-gray-400 py-4">No colors added. Use the color picker to add colors.</div></Show>
                  </div>
                </div>
                <div class="border dark:border-gray-600 rounded-md p-2">
                  <h4 class="text-sm font-medium mb-2 dark:text-blue-400">Color Picker</h4>
                  <div class="space-y-3">
                    <input type="color" value={currentHex()} onInput={(event) => setCurrentHex(event.currentTarget.value)} class="w-full h-10 rounded p-1 border dark:border-gray-600 cursor-pointer" />
                    <div class="flex items-center space-x-2">
                      <input type="text" value={currentHex()} onInput={(event) => setCurrentHex(event.currentTarget.value)} class="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400" />
                      <button type="button" onClick={add} class="px-2 py-1 bg-green-600 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-md text-xs hover:bg-green-700">{current() !== null ? "Update" : "Add"}</button>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-blue-400 mb-1">Preset Colors</label>
                      <div class="grid grid-cols-8 gap-1">
                        <For each={PRESETS}>{(color) => <div class="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform" style={{ "background-color": color }} onClick={() => setCurrentHex(color)} />}</For>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={close} class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Cancel</button>
                <button type="button" onClick={() => { props.onChange(colors()); close() }} class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save Colors</button>
              </div>
            </Motion.div>
          </Motion.div>
        </Show>
      </Presence>
    </div>
  )
}
