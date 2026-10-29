import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Check, Edit2, Search, X } from "lucide-solid"
import { useElementsStore } from "../../store/elementsStore.ts"
import { PropertyEditorModal } from "./PropertyEditorModal.tsx"
import { t } from "../../../../i18n/index.ts"

type ListType = "element" | "edge" | "face" | "opening"

interface ElementListInputProps {
  readonly label: string
  readonly value?: ReadonlyArray<unknown> | undefined
  onChange(values: unknown[]): void
  readonly disabled?: boolean
  readonly listType: ListType
}

const NOUN: Record<ListType, string> = { element: "elements", edge: "edges", face: "faces", opening: "openings" }
const TITLE: Record<ListType, string> = { element: "Select elements", edge: "Select edges", face: "Select faces", opening: "Configure openings" }
const TRIGGER = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center gap-2 text-gray-700 dark:text-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1"
/** How many rows the list draws at once: a mesh can hold thousands of faces. */
const LIMIT = 400

const colorOf = (color: unknown): string => (typeof color === "string" ? color : "#cccccc")

/** One pickable thing: the key that identifies it in the list, and the value that goes back into the field. */
interface Candidate {
  readonly key: string
  readonly label: string
  readonly detail: string
  readonly color: string
  readonly entry: unknown
}

/**
 * Picks elements (or edges / faces / openings) from the drawing for an operation's operand list.
 * The picker opens as a centred modal over the whole window, so a long list of faces is
 * readable instead of squeezed into the property column.
 */
export function ElementListInput(props: ElementListInputProps): JSX.Element {
  const elements = useElementsStore()
  const [open, setOpen] = createSignal(false)
  const [selected, setSelected] = createSignal<string[]>([])
  const [term, setTerm] = createSignal("")
  const value = () => props.value ?? []

  /** What the person can pick: the drawing's elements, or the faces of the selected element. */
  const candidates = createMemo<ReadonlyArray<Candidate>>(() => {
    if (props.listType === "face") {
      // The field holds the triangles of the selected mesh: the list is those triangles.
      // Without a selected element, the field's own faces are the list.
      const element = elements.selectedElement as Record<string, unknown> | null
      const faces = Array.isArray(element?.faces)
        ? (element!.faces as ReadonlyArray<unknown>)
        : (value() as ReadonlyArray<unknown>)
      return faces.map((face, index) => ({
        key: `face:${index}`,
        label: `Face ${index + 1}`,
        detail: Array.isArray(face) ? `vertices ${face.join(" · ")}` : "triangle",
        color: colorOf(element?.color),
        entry: face
      }))
    }
    return elements.elements.map((element) => ({
      key: element.id,
      label: typeof element.name === "string" && element.name !== "" ? element.name : element.type,
      detail: `${element.type} · ${element.id.slice(0, 8)}`,
      color: colorOf(element.color),
      entry: element.id
    }))
  })

  /** What the field holds right now, matched against the candidates. */
  const selectionFor = (): string[] => {
    const list = candidates()
    if (props.listType === "face") {
      // The field holds a subset of the same triangles: match them by their vertices, not by
      // position, and index the faces once: a mesh can hold thousands of them.
      const byEntry = new Map<string, string[]>()
      for (const candidate of list) {
        const key = JSON.stringify(candidate.entry)
        const bucket = byEntry.get(key)
        if (bucket === undefined) byEntry.set(key, [candidate.key])
        else bucket.push(candidate.key)
      }
      const keys: string[] = []
      for (const entry of value()) {
        const bucket = byEntry.get(JSON.stringify(entry))
        const key = bucket?.shift()
        if (key !== undefined) keys.push(key)
      }
      return keys
    }
    return value().map((entry) => String(entry)).filter((key) => list.some((candidate) => candidate.key === key))
  }

  const filtered = createMemo(() => {
    const needle = term().trim().toLowerCase()
    const list = candidates()
    if (needle === "") return list
    return list.filter((candidate) => candidate.label.toLowerCase().includes(needle) || candidate.detail.toLowerCase().includes(needle))
  })

  const shown = createMemo(() => filtered().slice(0, LIMIT))
  const hidden = createMemo(() => filtered().length - shown().length)
  const isSelected = (key: string): boolean => selected().includes(key)
  /** The candidates by key: a list of thousands of faces is looked up, not scanned. */
  const byKey = createMemo(() => new Map(candidates().map((candidate) => [candidate.key, candidate])))

  const toggle = (key: string) =>
    setSelected(isSelected(key) ? selected().filter((entry) => entry !== key) : [...selected(), key])

  const openDialog = () => { setSelected(selectionFor()); setTerm(""); setOpen(true) }
  const close = () => setOpen(false)

  const save = () => {
    const chosen = selected()
      .map((key) => byKey().get(key))
      .filter((candidate): candidate is Candidate => candidate !== undefined)
    props.onChange(chosen.map((candidate) => candidate.entry))
    close()
  }

  const rowClass = (active: boolean): string =>
    `flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${active ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/40" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`

  return (
    <div class="mb-2">
      <div class={LABEL}>
        {props.label} ({value().length} selected)
      </div>
      <button type="button" onClick={openDialog} disabled={props.disabled ?? false} class={TRIGGER} data-testid="edit-elements">
        <span class="truncate">{value().length === 0 ? `Select ${NOUN[props.listType]}` : `${value().length} ${NOUN[props.listType]} selected`}</span>
        <Edit2 size={16} />
      </button>

      <PropertyEditorModal
        open={open()}
        onClose={close}
        onSave={save}
        title={TITLE[props.listType]}
        subtitle={`${props.label} · ${selected().length} of ${candidates().length} ${NOUN[props.listType]} selected`}
        saveLabel="Save selection"
        size="xl"
      >
        <div class="relative">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><Search size={16} class="text-gray-400 dark:text-gray-500" /></div>
          <input
            type="text"
            placeholder={t("cad.input.searchNameId")}
            value={term()}
            onInput={(event) => setTerm(event.currentTarget.value)}
            class="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-blue-400"
          />
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="flex min-w-0 flex-col rounded-lg border border-gray-200 dark:border-gray-700">
            <header class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("plugins.available")}</h4>
              <span class="text-xs text-gray-500 dark:text-gray-400">{filtered().length} shown</span>
            </header>
            <div class="max-h-[44vh] min-h-[8rem] overflow-y-auto p-2">
              <For each={shown()}>{(candidate) =>
                <button type="button" onClick={() => toggle(candidate.key)} class={rowClass(isSelected(candidate.key))} data-testid="element-row">
                  <span class={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected(candidate.key) ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 dark:border-gray-500"}`}>
                    <Show when={isSelected(candidate.key)}><Check size={12} /></Show>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-gray-800 dark:text-gray-200">{candidate.label}</span>
                    <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{candidate.detail}</span>
                  </span>
                  <span class="h-3 w-3 shrink-0 rounded-full" style={{ "background-color": candidate.color }} />
                </button>}
              </For>
              <Show when={filtered().length === 0}>
                <p class="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  {term() ? `Nothing matches "${term()}".` : "Nothing to pick here."}
                </p>
              </Show>
              <Show when={hidden() > 0}>
                <p class="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">…and {hidden()} more. Narrow the search to reach them.</p>
              </Show>
            </div>
          </section>

          <section class="flex min-w-0 flex-col rounded-lg border border-gray-200 dark:border-gray-700">
            <header class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("cad.status.selected")}</h4>
              <Show when={selected().length > 0}>
                <button type="button" onClick={() => setSelected([])} class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">{t("cad.input.clearAll")}</button>
              </Show>
            </header>
            <div class="max-h-[44vh] min-h-[8rem] overflow-y-auto p-2">
              <For each={selected().slice(0, LIMIT)}>{(key) => {
                const candidate = () => byKey().get(key)
                return (
                  <div class={rowClass(false)}>
                    <span class="h-3 w-3 shrink-0 rounded-full" style={{ "background-color": candidate()?.color ?? "#cccccc" }} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-gray-800 dark:text-gray-200">{candidate()?.label ?? key}</span>
                      <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{candidate()?.detail ?? ""}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      class="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                      title={`Remove ${candidate()?.label ?? key}`}
                      aria-label={`Remove ${candidate()?.label ?? key}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              }}</For>
              <Show when={selected().length === 0}>
                <p class="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("cad.input.nothingSelected")}</p>
              </Show>
              <Show when={selected().length > LIMIT}>
                <p class="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">Showing the first {LIMIT} of {selected().length}. Clear some to see the rest.</p>
              </Show>
            </div>
          </section>
        </div>
      </PropertyEditorModal>
    </div>
  )
}
