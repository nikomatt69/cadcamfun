/**
 * The saved custom elements (legacy `store.ts` made these reachable through open/duplicate/delete,
 * and the legacy app never shipped that browser, so this one is authored for the v6 editor).
 *
 * Lists what this machine has saved, with search and a category filter, and the operations the
 * store exposes on them: edit, duplicate, export and delete.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Copy, Download, Pencil, Trash2 } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useCustomElementsStore } from "../../store/customElementsStore.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"

export interface SavedElementsPanelProps {
  /** Opens a saved definition in the editor (`edit` mode). */
  readonly onEdit: (definitionId: string) => void
}

const ROW = "w-full flex items-center justify-between gap-2 p-2 rounded border border-gray-200 dark:border-gray-700"
const ICON = "p-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"

const download = (filename: string, content: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function SavedElementsPanel(props: SavedElementsPanelProps): JSX.Element {
  const store = useCustomElementsStore()
  const [query, setQuery] = createSignal("")
  const [category, setCategory] = createSignal<string>("")

  const categories = createMemo<ReadonlyArray<string>>(() =>
    Array.from(new Set(Object.values(store.definitions).map((definition) => definition.category ?? ""))).sort())

  const visible = (): ReadonlyArray<CustomElementDefinition> => {
    const needle = query().trim()
    const wanted = category()
    const base = needle === "" ? Object.values(store.definitions) : store.searchDefinitions(needle)
    return wanted === "" ? base : base.filter((definition) => (definition.category ?? "") === wanted)
  }

  return (
    <div class="p-4 space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={t("cad.customElements.searchSaved")}
          class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <select class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" value={category()} onChange={(event) => setCategory(event.currentTarget.value)}>
          <option value="">{t("cad.customElements.allCategories")}</option>
          <For each={categories()}>{(name) => <option value={name}>{name === "" ? t("cad.customElements.uncategorized") : name}</option>}</For>
        </select>
        <button type="button" class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1" onClick={() => download("custom-elements.json", store.exportAllDefinitions())}>
          <Download class="w-4 h-4" />
          {t("cad.customElements.exportAll")}
        </button>
      </div>

      <Show when={visible().length === 0} fallback={
        <div class="space-y-2">
          <For each={visible()}>{(definition) =>
            <div class={ROW}>
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{definition.name}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{definition.description || definition.category}</div>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button type="button" class={ICON} title={t("cad.customElements.edit")} onClick={() => props.onEdit(definition.id)}><Pencil class="w-4 h-4" /></button>
                <button type="button" class={ICON} title={t("cad.customElements.duplicate")} onClick={() => store.duplicateDefinition(definition.id, `${definition.name} ${t("cad.customElements.copyOf")}`)}><Copy class="w-4 h-4" /></button>
                <button type="button" class={ICON} title={t("cad.customElements.exportJson")} onClick={() => { const json = store.exportDefinition(definition.id); if (json !== null) download(`${definition.name.replace(/\s+/g, "_")}.json`, json) }}><Download class="w-4 h-4" /></button>
                <button type="button" class={ICON + " hover:text-red-600"} title={t("cad.customElements.delete")} onClick={() => store.deleteDefinition(definition.id)}><Trash2 class="w-4 h-4" /></button>
              </div>
            </div>
          }</For>
        </div>
      }>
        <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
          <div>{t("cad.customElements.noneSaved")}</div>
          <div class="text-xs">{t("cad.customElements.noneSavedHint")}</div>
        </div>
      </Show>
    </div>
  )
}
