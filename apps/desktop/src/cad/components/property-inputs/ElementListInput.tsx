import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { CheckCircle, Edit2, Search, X } from "lucide-solid"
import { useElementsStore } from "../../store/elementsStore.ts"

type ListType = "element" | "edge" | "face" | "opening"

interface ElementListInputProps {
  readonly label: string
  readonly value?: string[] | undefined
  onChange(elementIds: string[]): void
  readonly disabled?: boolean
  readonly listType: ListType
}

const NOUN: Record<ListType, string> = { element: "Elements", edge: "Edges", face: "Faces", opening: "Openings" }
const TITLE: Record<ListType, string> = { element: "Select Elements", edge: "Select Edges", face: "Select Faces", opening: "Configure Openings" }
const colorOf = (color: unknown) => (typeof color === "string" ? color : "#cccccc")

/** Picks elements (or edges / faces / openings) from the drawing for an operation's operand list. */
export function ElementListInput(props: ElementListInputProps): JSX.Element {
  const elements = useElementsStore()
  const [open, setOpen] = createSignal(false)
  const [selected, setSelected] = createSignal<string[]>([])
  const [term, setTerm] = createSignal("")
  const value = () => props.value ?? []

  const filtered = createMemo(() => {
    const needle = term().toLowerCase()
    return elements.elements.filter((element) => !needle || element.id.toLowerCase().includes(needle) || element.type.toLowerCase().includes(needle))
  })

  const toggle = (id: string) => setSelected(selected().includes(id) ? selected().filter((entry) => entry !== id) : [...selected(), id])
  const info = (id: string) => {
    const element = elements.elements.find((candidate) => candidate.id === id)
    return element ? { name: `${element.type} (${id.slice(0, 8)}...)`, color: colorOf(element.color) } : { name: `Unknown (${id.slice(0, 8)}...)`, color: "#cccccc" }
  }
  const close = () => setOpen(false)

  return (
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">{props.label} ({value().length} selected)</label>
      <button type="button" onClick={() => { setSelected([...value()]); setTerm(""); setOpen(true) }} disabled={props.disabled ?? false} class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center text-gray-700 dark:text-blue-400">
        <span>{value().length === 0 ? `Select ${NOUN[props.listType]}` : `${value().length} ${value().length === 1 ? "item" : "items"} selected`}</span>
        <Edit2 size={16} />
      </button>

      <Presence>
        <Show when={open()}>
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(event: MouseEvent) => { if (event.target === event.currentTarget) close() }}>
            <Motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(event: MouseEvent) => event.stopPropagation()}>
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-blue-400">{TITLE[props.listType]}</h3>
                <button type="button" onClick={close} class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300" aria-label="Close"><X size={20} /></button>
              </div>
              <div class="relative mb-4">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} class="text-gray-400 dark:text-gray-500" /></div>
                <input type="text" placeholder="Search..." value={term()} onInput={(event) => setTerm(event.currentTarget.value)} class="pl-10 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400 dark:placeholder-gray-400" />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto mb-4 border dark:border-gray-600 rounded-md p-2">
                <For each={filtered()}>{(item) =>
                  <div
                    class={`p-2 border dark:border-gray-600 rounded flex items-center justify-between cursor-pointer transition-colors ${selected().includes(item.id) ? "bg-blue-50 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700" : "hover:bg-gray-50 dark:hover:bg-blue-900/30"}`}
                    onClick={() => toggle(item.id)}
                  >
                    <div class="flex items-center">
                      <div class="w-3 h-3 rounded-full mr-2" style={{ "background-color": colorOf(item.color) }} />
                      <span class="text-sm truncate max-w-[180px] dark:text-blue-400">{item.type} - {item.id.slice(0, 8)}...</span>
                    </div>
                    <Show when={selected().includes(item.id)}><div class="text-blue-500 dark:text-blue-400"><CheckCircle size={16} /></div></Show>
                  </div>}
                </For>
                <Show when={filtered().length === 0}>
                  <div class="col-span-2 text-center text-gray-500 dark:text-gray-400 py-4">{term() ? `No items found for "${term()}". Try another search.` : "No items available."}</div>
                </Show>
              </div>
              <div class="mt-4 mb-4">
                <h4 class="text-sm font-medium mb-2 dark:text-blue-400">Selected items:</h4>
                <div class="flex flex-wrap gap-2 border dark:border-gray-600 rounded-md p-2 min-h-[60px]">
                  <For each={selected()}>{(id) =>
                    <div class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded-full flex items-center">
                      <div class="w-2 h-2 rounded-full mr-1" style={{ "background-color": info(id).color }} />
                      <span>{info(id).name}</span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); toggle(id) }} class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" aria-label="Remove"><X size={14} /></button>
                    </div>}
                  </For>
                  <Show when={selected().length === 0}><div class="text-gray-500 dark:text-gray-400 text-sm py-2 px-3">No items selected</div></Show>
                </div>
              </div>
              <div class="flex justify-end space-x-2 mt-4">
                <button type="button" onClick={close} class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Cancel</button>
                <button type="button" onClick={() => { props.onChange(selected()); close() }} class="px-3 py-1.5 bg-blue-600 rounded text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save Selection</button>
              </div>
            </Motion.div>
          </Motion.div>
        </Show>
      </Presence>
    </div>
  )
}
