/**
 * One library browser for an entity type (components / materials / tools): source tabs (main, local,
 * standard), search, grid / list views and filters. Port of the legacy `UnifiedLibrary.tsx`.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { Book, ChevronDown, Database, Filter, Grid3x3, HardDrive, List, Package, RefreshCw, Search, Star, Wrench, Zap } from "lucide-solid"
import {
  useUnifiedLibrary,
  type ComponentLibraryItem,
  type LibraryEntityType,
  type LibraryFilter,
  type LibraryItem,
  type LibrarySource,
  type MaterialLibraryItem,
  type ToolLibraryItem
} from "../hooks/useUnifiedLibrary.ts"

const LIBRARY_SOURCES: ReadonlyArray<{ readonly id: LibrarySource; readonly label: string; readonly icon: () => JSX.Element; readonly color: string; readonly bgColor: string }> = [
  { id: "api", label: "Main Library", icon: () => <Database size={16} />, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "local", label: "Local Library", icon: () => <HardDrive size={16} />, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-900/20" },
  { id: "predefined", label: "Standard Library", icon: () => <Book size={16} />, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/20" }
]

export interface UnifiedLibraryProps<T extends LibraryItem> {
  readonly entityType: LibraryEntityType
  readonly onSelectItem?: (item: T) => void
  readonly onSaveItem?: (item: T) => void
  readonly showCloseButton?: boolean
  readonly onClose?: () => void
  readonly initialSource?: LibrarySource
}

const itemVariant = (index: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: index * 0.1 } })

export default function UnifiedLibrary<T extends LibraryItem>(props: UnifiedLibraryProps<T>): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal("")
  const [viewMode, setViewMode] = createSignal<"grid" | "list">("grid")
  const [showFilters, setShowFilters] = createSignal(false)
  const [filters, setFilters] = createSignal<LibraryFilter>({})

  const { items, isLoading, error, activeSource, setActiveSource, refreshLibrary, sourceStats } = useUnifiedLibrary<T>(props.entityType, props.initialSource ?? "api")

  const filteredItems = (): T[] => {
    const query = searchQuery()
    if (!query) return items()
    return items().filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || (item.name && item.name.toLowerCase().includes(query.toLowerCase())))
  }

  const handleFilterChange = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }): void => {
    const { name, value } = event.currentTarget
    setFilters((previous) => ({ ...previous, [name]: value }))
  }

  const itemIcon = (item: T): JSX.Element => {
    if (props.entityType === "components") {
      const itemType = (item as unknown as ComponentLibraryItem).type || ""
      if (itemType === "mechanical") return <Wrench size={20} class="text-blue-500" />
      if (itemType === "electronic") return <Zap size={20} class="text-yellow-500" />
      if (itemType === "fixture") return <Grid3x3 size={20} class="text-purple-500" />
      return <Package size={20} class="text-gray-500" />
    }
    if (props.entityType === "materials") {
      const material = item as unknown as MaterialLibraryItem
      return <Motion.div hover={{ scale: 1.1, rotate: 5 }} class="w-5 h-5 rounded-md border-2 border-white shadow-md" style={{ "background-color": material.color || "#ccc" }} />
    }
    if (props.entityType === "tools") {
      const toolType = (item as unknown as ToolLibraryItem).type || ""
      if (toolType === "endmill") return <Wrench size={20} class="text-blue-500" />
      if (toolType === "drillbit") return <Wrench size={20} class="text-green-500" />
      if (toolType === "facemill") return <Wrench size={20} class="text-orange-500" />
      return <Wrench size={20} class="text-gray-500" />
    }
    return <Package size={20} class="text-gray-500" />
  }

  const title = (): string => props.entityType === "components" ? "Components Library" : props.entityType === "materials" ? "Materials Library" : "Tools Library"

  const CloseGlyph = (cls: string): JSX.Element => (
    <svg class={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M6 18L18 6M6 6l12 12" /></svg>
  )

  const header = (): JSX.Element => (
    <Motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="relative border-b border-gray-200/50 dark:border-gray-700/50 p-6 backdrop-blur-sm">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-pink-50/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20" />
      <div class="relative z-10">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center space-x-3">
            <Motion.div animate={{ rotate: [0, 360], scale: [1, 1.1, 1] }} transition={{ duration: 3, repeat: Infinity }} class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Star size={20} class="text-white" />
            </Motion.div>
            <div>
              <h2 class="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">{title()}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">Browse and manage your {props.entityType}</p>
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span class="px-3 py-1 rounded-full bg-green-100/80 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium">{filteredItems().length} items</span>
            </div>
          </div>
          <Show when={props.showCloseButton && props.onClose}>
            <Motion.button hover={{ scale: 1.05, rotate: 90 }} press={{ scale: 0.95 }} onClick={() => props.onClose?.()} class="p-3 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200">
              {CloseGlyph("h-6 w-6")}
            </Motion.button>
          </Show>
        </div>

        <div class="flex flex-col space-y-4">
          <Motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} class="relative">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Search size={18} class="text-gray-400" /></div>
            <input
              type="text"
              class="block w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
              placeholder={`Search ${props.entityType}...`}
              value={searchQuery()}
              onInput={(event) => setSearchQuery(event.currentTarget.value)}
            />
            <Show when={searchQuery()}>
              <Motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} hover={{ scale: 1.1 }} press={{ scale: 0.9 }} onClick={() => setSearchQuery("")} class="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600" aria-label="Clear search">
                {CloseGlyph("h-5 w-5")}
              </Motion.button>
            </Show>
          </Motion.div>

          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} class="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg">
            <For each={LIBRARY_SOURCES}>
              {(source) => (
                <Motion.button
                  hover={{ y: -2 }}
                  press={{ scale: 0.98 }}
                  class={`flex-1 py-3 px-4 text-sm flex items-center justify-center space-x-2 transition-all duration-200 relative overflow-hidden group ${activeSource() === source.id ? `${source.bgColor} ${source.color} font-semibold` : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                  onClick={() => setActiveSource(source.id)}
                  data-source={source.id}
                >
                  <Show when={activeSource() === source.id}>
                    <div class="absolute inset-0 bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-pink-400/10" />
                  </Show>
                  <div class="relative z-10 flex items-center space-x-2">
                    {source.icon()}
                    <span>{source.label}</span>
                    <Motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} class="text-xs bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm px-2 py-1 rounded-full font-medium shadow-sm">{sourceStats()[source.id] || 0}</Motion.span>
                  </div>
                </Motion.button>
              )}
            </For>
          </Motion.div>

          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} class="flex justify-between items-center">
            <div class="flex items-center space-x-3">
              <div class="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} class={`p-3 transition-all duration-200 ${viewMode() === "grid" ? "bg-blue-500 text-white shadow-lg" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`} onClick={() => setViewMode("grid")} title="Grid View"><Grid3x3 size={18} /></Motion.button>
                <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} class={`p-3 transition-all duration-200 ${viewMode() === "list" ? "bg-blue-500 text-white shadow-lg" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`} onClick={() => setViewMode("list")} title="List View"><List size={18} /></Motion.button>
              </div>
              <Motion.button hover={{ scale: 1.05, rotate: 180 }} press={{ scale: 0.95 }} onClick={() => void refreshLibrary()} disabled={isLoading()} class="p-3 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80" title="Refresh Library">
                <RefreshCw size={18} class={isLoading() ? "animate-spin" : ""} />
              </Motion.button>
            </div>
            <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => setShowFilters(!showFilters())} class="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 backdrop-blur-sm border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80">
              <Filter size={16} />
              <span class="text-sm font-medium">Filters</span>
              <Motion.div animate={{ rotate: showFilters() ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={16} /></Motion.div>
            </Motion.button>
          </Motion.div>
        </div>
      </div>
    </Motion.div>
  )

  const gridView = (): JSX.Element => (
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <For each={filteredItems()}>
        {(item, index) => (
          <Motion.div {...itemVariant(index())} hover={{ y: -8, scale: 1.02 }} class="group relative">
            <div class="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 shadow-lg hover:shadow-2xl transition-all duration-300">
              <div class="absolute inset-0 overflow-hidden">
                <div class="absolute -inset-10 opacity-0 group-hover:opacity-30 transition-opacity duration-500">
                  <div class="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-45deg]" />
                </div>
              </div>
              <div class="relative z-10 p-6">
                <div class="w-full h-32 mb-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">{itemIcon(item)}</div>
                <div class="space-y-3">
                  <h3 class="font-semibold text-gray-900 dark:text-white text-lg truncate">{item.name}</h3>
                  <Show when={item.description}><p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{item.description}</p></Show>
                  <Show when={Array.isArray(item.tags) && item.tags.length > 0}>
                    <div class="flex flex-wrap gap-1">
                      <For each={item.tags!.slice(0, 3)}>{(tag) => <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{tag}</span>}</For>
                      <Show when={item.tags!.length > 3}><span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100/80 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400">+{item.tags!.length - 3}</span></Show>
                    </div>
                  </Show>
                </div>
                <div class="flex justify-between mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                  <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onSelectItem?.(item)} class="flex-1 mr-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-200">Select</Motion.button>
                  <Show when={activeSource() !== "local" && props.onSaveItem}>
                    <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onSaveItem?.(item)} class="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200" title="Save to Local Library"><Star size={18} /></Motion.button>
                  </Show>
                </div>
              </div>
            </div>
          </Motion.div>
        )}
      </For>
    </div>
  )

  const listView = (): JSX.Element => (
    <div class="space-y-3">
      <For each={filteredItems()}>
        {(item, index) => (
          <Motion.div {...itemVariant(index())} hover={{ x: 4 }} class="relative overflow-hidden rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 shadow-sm hover:shadow-md transition-all duration-200">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0 mr-4">{itemIcon(item)}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white truncate">{item.name}</h3>
                    <Show when={item.description}><p class="text-sm text-gray-600 dark:text-gray-400 truncate">{item.description}</p></Show>
                  </div>
                  <div class="flex items-center space-x-2">
                    <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onSelectItem?.(item)} class="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all duration-200">Select</Motion.button>
                    <Show when={activeSource() !== "local" && props.onSaveItem}>
                      <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onSaveItem?.(item)} class="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200" title="Save to Local Library"><Star size={18} /></Motion.button>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Motion.div>
        )}
      </For>
    </div>
  )

  const content = (): JSX.Element => (
    <Show
      when={!isLoading()}
      fallback={
        <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} class="flex flex-col items-center justify-center py-16 space-y-4">
          <Motion.div animate={{ rotate: 360, scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} class="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center"><Star size={24} class="text-white" /></Motion.div>
          <p class="text-gray-500 dark:text-gray-400 text-lg font-medium">Loading {props.entityType}...</p>
          <div class="flex space-x-1">
            <For each={[0, 1, 2]}>{(i) => <Motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} class="w-2 h-2 bg-blue-500 rounded-full" />}</For>
          </div>
        </Motion.div>
      }
    >
      <Show
        when={!error()}
        fallback={
          <Motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} class="flex flex-col items-center justify-center py-16 space-y-4">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div class="text-center">
              <h3 class="text-lg font-medium text-red-600 dark:text-red-400 mb-2">Error loading {props.entityType}</h3>
              <p class="text-gray-500 dark:text-gray-400 mb-4">{error()}</p>
              <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => void refreshLibrary()} class="px-6 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors duration-200 font-medium">Try Again</Motion.button>
            </div>
          </Motion.div>
        }
      >
        <Show
          when={filteredItems().length > 0}
          fallback={
            <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} class="flex flex-col items-center justify-center py-16 space-y-6">
              <Motion.div animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity }} class="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center"><Package size={32} class="text-gray-400" /></Motion.div>
              <div class="text-center space-y-2">
                <h3 class="text-xl font-semibold text-gray-600 dark:text-gray-400">No {props.entityType} found</h3>
                <p class="text-gray-500 dark:text-gray-500">{searchQuery() ? `No ${props.entityType} match your search "${searchQuery()}"` : `No ${props.entityType} available in this library`}</p>
              </div>
              <Show when={searchQuery()}>
                <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => setSearchQuery("")} class="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors duration-200 font-medium">Clear Search</Motion.button>
              </Show>
            </Motion.div>
          }
        >
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} class="p-6">
            <Show when={viewMode() === "grid"} fallback={listView()}>{gridView()}</Show>
          </Motion.div>
        </Show>
      </Show>
    </Show>
  )

  return (
    <div class="flex flex-col h-full relative" data-testid={`unified-library-${props.entityType}`}>
      <div class="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-white/50 to-purple-50/30 dark:from-gray-900/50 dark:via-gray-800/50 dark:to-blue-900/30">
        <div class="absolute top-20 left-20 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl animate-pulse" />
        <div class="absolute bottom-20 right-20 w-80 h-80 bg-purple-400/10 rounded-full blur-3xl animate-pulse" style={{ "animation-delay": "1s" }} />
        <div class="absolute top-1/2 left-1/3 w-48 h-48 bg-pink-400/10 rounded-full blur-3xl animate-pulse" style={{ "animation-delay": "2s" }} />
      </div>

      {header()}

      <Presence>
        <Show when={showFilters()}>
          <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} class="border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category</label>
                  <select name="category" value={filters().category || ""} onChange={handleFilterChange} class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">All Categories</option>
                    <option value="mechanical">Mechanical</option>
                    <option value="electronic">Electronic</option>
                    <option value="fixture">Fixture</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Material</label>
                  <select name="material" value={filters()["material"] || ""} onChange={handleFilterChange} class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">All Materials</option>
                    <option value="aluminum">Aluminum</option>
                    <option value="steel">Steel</option>
                    <option value="plastic">Plastic</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
                  <input type="text" name="tags" value={filters()["tags"] || ""} onInput={handleFilterChange} placeholder="Enter tags..." class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
            </div>
          </Motion.div>
        </Show>
      </Presence>

      <div class="flex-1 overflow-hidden relative z-10">
        <div class="h-full overflow-y-auto">{content()}</div>
      </div>
    </div>
  )
}

