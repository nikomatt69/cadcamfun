/**
 * "Standard Library" modal (legacy `PredefinedToolpathsLibrary`): browses the predefined toolpaths, filtered by
 * machine type, operation and a search term, and hands the chosen one back to the list, which creates a copy.
 */
import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"
import { Download, Search } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { Modal, OPERATION_LABEL, TYPE_LABEL } from "./shared.tsx"
import { t } from "../../../i18n/index.ts"

export interface LibraryPick {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly type: string
  readonly operationType: string
  readonly data: unknown
  readonly gcode: string
}

export interface PredefinedToolpathsLibraryProps {
  readonly open: boolean
  readonly projectId: string
  readonly onClose: () => void
  readonly onSelect: (item: LibraryPick) => void
}

const FIELD = "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"

export function PredefinedToolpathsLibrary(props: PredefinedToolpathsLibraryProps): JSX.Element {
  const app = useApp()
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const [items, setItems] = createSignal<ReadonlyArray<LibraryPick>>([])
  const [loading, setLoading] = createSignal(false)
  const [search, setSearch] = createSignal("")
  const [type, setType] = createSignal("")
  const [operation, setOperation] = createSignal("")

  // Fetch whenever the dialog opens or a filter changes; the legacy list is the same endpoint with query params.
  createEffect(on([() => props.open, search, type, operation], ([open]) => {
    if (!open) return
    setLoading(true)
    void run<ReadonlyArray<LibraryPick>>(app.client.toolpathExtras.library({
      query: {
        projectId: props.projectId || "none",
        type: type() || undefined,
        operationType: operation() || undefined,
        search: search() || undefined
      }
    }))
      .then((list) => setItems(list))
      .catch(() => { setItems([]); toast.error(t("pages.failed.to.load.toolpath.library")) })
      .finally(() => setLoading(false))
  }))

  return (
    <Modal open={props.open} title={t("library.standard")} onClose={props.onClose} wide>
      <div class="flex flex-wrap gap-2">
        <div class="relative min-w-[12rem] flex-1">
          <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" class={`${FIELD} w-full pl-8`} placeholder={t("pages.search.toolpaths")} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
        </div>
        <select class={FIELD} aria-label={t("library.machine.type")} value={type()} onChange={(e) => setType(e.currentTarget.value)}>
          <option value="">{t("pages.all.types")}</option>
          <For each={Object.keys(TYPE_LABEL)}>{(value) => <option value={value}>{TYPE_LABEL[value]}</option>}</For>
        </select>
        <select class={FIELD} aria-label={t("cam.operations.current")} value={operation()} onChange={(e) => setOperation(e.currentTarget.value)}>
          <option value="">{t("pages.all.operations")}</option>
          <For each={Object.keys(OPERATION_LABEL)}>{(value) => <option value={value}>{OPERATION_LABEL[value]}</option>}</For>
        </select>
      </div>

      <Show when={!loading()} fallback={<p class="py-6 text-center text-sm text-gray-500 dark:text-gray-400" role="status">{t("pages.loading.library")}</p>}>
        <Show when={items().length > 0} fallback={<p class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("pages.no.toolpaths.match.your.filters")}</p>}>
          <ul class="max-h-[60vh] divide-y divide-gray-200 overflow-y-auto dark:divide-gray-700">
            <For each={items()}>{(item) => (
              <li class="flex items-start justify-between gap-3 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-white">{item.name}</div>
                  <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.description}</div>
                  <div class="mt-1 flex gap-1 text-xs">
                    <span class="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{TYPE_LABEL[item.type] ?? item.type}</span>
                    <span class="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-300">{OPERATION_LABEL[item.operationType] ?? item.operationType}</span>
                  </div>
                </div>
                <button type="button" class="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50" disabled={props.projectId === ""} onClick={() => props.onSelect(item)}>
                  <Download size={14} aria-hidden="true" />{t("ai.suggestions.apply")}
                </button>
              </li>
            )}</For>
          </ul>
        </Show>
      </Show>
      <Show when={props.projectId === ""}>
        <p class="text-xs text-amber-700 dark:text-amber-400">{t("pages.select.a.project.in.the.filters.first.a.library.toolpath.is.created.inside.it")}</p>
      </Show>
    </Modal>
  )
}
