import { For, Show, createSignal, type JSX } from "solid-js"
import { Droplet, Plus, Trash2 } from "lucide-solid"
import { PropertyEditorModal } from "./PropertyEditorModal.tsx"

interface ColorValue { r: number; g: number; b: number }

interface ColorListInputProps {
  readonly label: string
  readonly value?: ColorValue[] | undefined
  onChange(colors: ColorValue[]): void
  readonly disabled?: boolean
}

const PRESETS = ["#FF0000", "#FF9900", "#FFCC00", "#33CC00", "#0099FF", "#6633CC", "#CC33FF", "#FF3399", "#000000", "#666666", "#999999", "#CCCCCC", "#FFFFFF", "#996633", "#006633", "#003366"]
const TRIGGER = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center gap-2 text-gray-700 dark:text-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1"

const hex = (color: ColorValue): string =>
  `#${[color.r, color.g, color.b].map((channel) => Math.floor(channel * 255).toString(16).padStart(2, "0")).join("")}`

/** Edits a list of normalised (0-1) RGB colours: the list on the left, the picker on the right. */
export function ColorListInput(props: ColorListInputProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [colors, setColors] = createSignal<ColorValue[]>([])
  const [current, setCurrent] = createSignal<number | null>(null)
  const [currentHex, setCurrentHex] = createSignal("#000000")
  const value = () => props.value ?? []

  const openDialog = () => { setColors([...value()]); setCurrentHex("#000000"); setCurrent(null); setOpen(true) }
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

  const save = () => {
    props.onChange(colors())
    close()
  }

  return (
    <div class="mb-2">
      <div class={LABEL}>{props.label} ({value().length || 0} colors)</div>
      <button type="button" onClick={openDialog} disabled={props.disabled ?? false} class={TRIGGER} data-testid="edit-colors">
        <span class="truncate">Edit colors</span>
        <span class="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {value().length}
          <Droplet size={16} />
        </span>
      </button>

      <PropertyEditorModal
        open={open()}
        onClose={close}
        onSave={save}
        title="Edit colors"
        subtitle={`${props.label} · ${colors().length} ${colors().length === 1 ? "color" : "colors"}`}
        saveLabel="Save colors"
        size="lg"
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <section class="flex min-w-0 flex-col rounded-lg border border-gray-200 dark:border-gray-700">
            <header class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Colors</h4>
              <button
                type="button"
                onClick={() => { setCurrent(null); setCurrentHex("#000000") }}
                class="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Plus size={14} /> New color
              </button>
            </header>
            <div class="max-h-[44vh] min-h-[8rem] overflow-y-auto p-2">
              <For each={colors()}>{(color, index) =>
                <div class={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${current() === index() ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/40" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <button type="button" onClick={() => { setCurrent(index()); setCurrentHex(hex(color)) }} class="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span class="h-5 w-5 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" style={{ "background-color": hex(color) }} />
                    <span class="truncate font-mono text-xs text-gray-700 dark:text-gray-200">{hex(color)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index())}
                    class="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                    title={`Remove ${hex(color)}`}
                    aria-label={`Remove ${hex(color)}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>}
              </For>
              <Show when={colors().length === 0}>
                <p class="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No colors yet. Pick one on the right.</p>
              </Show>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Picker</h4>
            <div class="space-y-3">
              <input
                type="color"
                value={currentHex()}
                onInput={(event) => setCurrentHex(event.currentTarget.value)}
                class="h-10 w-full cursor-pointer rounded border border-gray-300 p-1 dark:border-gray-600"
                aria-label="Color"
              />
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  value={currentHex()}
                  onInput={(event) => setCurrentHex(event.currentTarget.value)}
                  class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400"
                  aria-label="Hex color"
                />
                <button
                  type="button"
                  onClick={add}
                  class="shrink-0 rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                >
                  {current() !== null ? "Update" : "Add"}
                </button>
              </div>
              <div>
                <div class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Presets</div>
                <div class="grid grid-cols-8 gap-1">
                  <For each={PRESETS}>{(color) =>
                    <button
                      type="button"
                      onClick={() => setCurrentHex(color)}
                      class="h-6 w-6 rounded-full border border-gray-300 transition-transform hover:scale-110 dark:border-gray-600"
                      style={{ "background-color": color }}
                      title={color}
                      aria-label={`Use ${color}`}
                    />}
                  </For>
                </div>
              </div>
            </div>
          </section>
        </div>
      </PropertyEditorModal>
    </div>
  )
}
