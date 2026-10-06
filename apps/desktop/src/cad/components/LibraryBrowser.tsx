import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Package, Search } from "lucide-solid"
import { predefinedComponents } from "../lib/predefinedLibraries.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"

export interface LibraryComponent { readonly id: string; readonly name: string; readonly description?: string | undefined; readonly origin: "built-in" | "local" }

interface Props { onSelectComponent?: (component: LibraryComponent) => void }

/** The component catalogue the editor can place: the built-in presets and the components saved from the editor. */
export default function LibraryBrowser(props: Props): JSX.Element {
  const local = useLocalComponentsLibraryStore()
  const [query, setQuery] = createSignal("")
  const items = createMemo<LibraryComponent[]>(() => {
    const needle = query().toLowerCase()
    const all: LibraryComponent[] = [
      ...predefinedComponents.map((component: any) => ({ id: component.name as string, name: component.name as string, description: component.description as string | undefined, origin: "built-in" as const })),
      ...local.components.map((component) => ({ id: component.id, name: component.name, description: component.description, origin: "local" as const }))
    ]
    return all.filter((item) => !needle || item.name.toLowerCase().includes(needle) || (item.description?.toLowerCase().includes(needle) ?? false))
  })

  return (
    <div class="h-full flex flex-col p-6 gap-4">
      <div class="relative">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search components..." value={query()} onInput={(event) => setQuery(event.currentTarget.value)} class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/80 dark:bg-gray-700/80 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div class="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
        <For each={items()}>{(item) =>
          <button type="button" onClick={() => props.onSelectComponent?.(item)} class="text-left p-4 rounded-xl border border-white/40 dark:border-gray-600/40 bg-white/70 dark:bg-gray-800/70 hover:bg-white dark:hover:bg-gray-700 shadow-sm transition-colors">
            <div class="flex items-center gap-2 mb-1"><Package size={16} class="text-blue-500" /><span class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{item.name}</span></div>
            <Show when={item.description}><p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p></Show>
            <span class="mt-2 inline-block text-[10px] uppercase tracking-wide text-gray-400">{item.origin}</span>
          </button>}
        </For>
        <Show when={items().length === 0}><div class="col-span-full text-center text-sm text-gray-500 py-10">No components found</div></Show>
      </div>
    </div>
  )
}
