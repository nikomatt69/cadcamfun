/**
 * The "Library Manager" shown inside the Unified Library dialog: Components / Materials / Tools tabs over one
 * `UnifiedLibrary` each. Port of the legacy `LibraryManager.tsx`; selections are also announced on `document`
 * (`libraryComponentSelected`, `libraryMaterialSelected`, `libraryToolSelected`) like the legacy app did.
 */
import { For, Match, Show, Switch, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Layers, Package, Star, Wrench } from "lucide-solid"
import UnifiedLibrary from "./UnifiedLibrary.tsx"
import type { ComponentLibraryItem, LibrarySource, MaterialLibraryItem, ToolLibraryItem } from "../hooks/useUnifiedLibrary.ts"

type Tab = "components" | "materials" | "tools"
const TABS: ReadonlyArray<Tab> = ["components", "materials", "tools"]

export interface LibraryManagerProps {
  readonly onSelectComponent?: (component: ComponentLibraryItem) => void
  readonly onSelectMaterial?: (material: MaterialLibraryItem) => void
  readonly onSelectTool?: (tool: ToolLibraryItem) => void
  readonly onSaveComponent?: (component: ComponentLibraryItem) => void
  readonly onSaveMaterial?: (material: MaterialLibraryItem) => void
  readonly onSaveTool?: (tool: ToolLibraryItem) => void
  readonly showCloseButton?: boolean
  readonly onClose?: () => void
  readonly defaultTab?: Tab
  readonly defaultSource?: LibrarySource
}

const announce = (name: string, detail: unknown): void => {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }))
}

const tabIcon = (tab: Tab): JSX.Element =>
  tab === "components" ? <Package size={16} class="mr-2" /> : tab === "materials" ? <Layers size={16} class="mr-2" /> : <Wrench size={16} class="mr-2" />

/** The legacy manager had no counts wired up (every badge read 0); kept as is. */
const tabCount = (_tab: Tab): number => 0

const tabGradient = (tab: Tab): string =>
  tab === "components" ? "from-blue-500/20 to-blue-600/20" : tab === "materials" ? "from-purple-500/20 to-purple-600/20" : "from-green-500/20 to-green-600/20"

export default function LibraryManager(props: LibraryManagerProps): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<Tab>(props.defaultTab ?? "components")
  const source = (): LibrarySource => props.defaultSource ?? "api"

  const selectComponent = (component: ComponentLibraryItem): void => { props.onSelectComponent?.(component); announce("libraryComponentSelected", component) }
  const selectMaterial = (material: MaterialLibraryItem): void => { props.onSelectMaterial?.(material); announce("libraryMaterialSelected", material) }
  const selectTool = (tool: ToolLibraryItem): void => { props.onSelectTool?.(tool); announce("libraryToolSelected", tool) }

  return (
    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} class="flex flex-col h-full relative overflow-hidden" data-testid="library-manager">
      <div class="absolute inset-0 pointer-events-none">
        <Motion.div animate={{ x: [0, 100, 0], y: [0, -50, 0], rotate: [0, 180, 360] }} transition={{ duration: 20, repeat: Infinity, easing: "linear" }} class="absolute top-10 left-10 w-32 h-32 rounded-full bg-gradient-to-br from-blue-400/10 to-purple-400/10 blur-xl" />
        <Motion.div animate={{ x: [0, -80, 0], y: [0, 100, 0], rotate: [360, 180, 0] }} transition={{ duration: 25, repeat: Infinity, easing: "linear" }} class="absolute top-1/2 right-20 w-24 h-24 rounded-full bg-gradient-to-br from-purple-400/10 to-pink-400/10 blur-xl" />
        <Motion.div animate={{ x: [0, 60, 0], y: [0, -80, 0], rotate: [0, -180, -360] }} transition={{ duration: 30, repeat: Infinity, easing: "linear" }} class="absolute bottom-20 left-1/3 w-40 h-40 rounded-full bg-gradient-to-br from-green-400/10 to-blue-400/10 blur-xl" />
        <div class="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
        <div class="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-transparent to-purple-50/20" />
        <div class="absolute inset-0 bg-gradient-to-tl from-purple-50/20 via-transparent to-pink-50/20" />
      </div>

      <Motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, easing: "ease-out" }} class="relative z-10 p-6 border-b border-white/20 dark:border-gray-700/30 backdrop-blur-sm">
        <div class="flex justify-between items-center">
          <div class="flex items-center space-x-4">
            <Motion.div
              animate={{ rotate: [0, 360], scale: [1, 1.1, 1], "box-shadow": ["0 0 20px rgba(59, 130, 246, 0.3)", "0 0 30px rgba(147, 51, 234, 0.4)", "0 0 20px rgba(59, 130, 246, 0.3)"] }}
              transition={{ duration: 4, repeat: Infinity, easing: "ease-in-out" }}
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
            >
              <Star size={18} class="text-white" />
            </Motion.div>
            <div>
              <Motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} class="text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-600 to-purple-600 dark:from-white dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent">Library Manager</Motion.h2>
              <Motion.p initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} class="text-sm text-gray-600 dark:text-gray-400 font-medium">Advanced component library system</Motion.p>
            </div>
          </div>

          <Motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} class="hidden md:flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
            <div class="flex items-center space-x-1"><div class="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span>Real-time sync</span></div>
            <div class="w-px h-4 bg-gray-300 dark:bg-gray-600" />
            <div class="flex items-center space-x-1"><div class="w-2 h-2 rounded-full bg-blue-400" /><span>Cloud enabled</span></div>
          </Motion.div>

          <Show when={props.showCloseButton && props.onClose}>
            <Motion.button hover={{ scale: 1.05, rotate: 90, "background-color": "rgba(239, 68, 68, 0.1)" }} press={{ scale: 0.95 }} onClick={() => props.onClose?.()} class="p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-all duration-200 backdrop-blur-sm border border-transparent hover:border-red-200 dark:hover:border-red-800" aria-label="Close library manager">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </Motion.button>
          </Show>
        </div>
      </Motion.div>

      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} class="relative z-10 flex-1 overflow-hidden">
        <div class="h-full flex flex-col">
          <div class="px-6 pt-4 pb-2 border-b border-white/10 dark:border-gray-700/20 backdrop-blur-sm">
            <div role="tablist" class="grid w-full grid-cols-3 gap-1 p-1 bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-white/20 dark:border-gray-700/30">
              <For each={TABS}>
                {(tab) => (
                  <div class="relative">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab() === tab}
                      data-state={activeTab() === tab ? "active" : "inactive"}
                      onClick={() => setActiveTab(tab)}
                      class={`relative w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-300 backdrop-blur-sm hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50 ${activeTab() === tab ? "bg-white dark:bg-gray-700 shadow-lg shadow-black/10 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"}`}
                    >
                      <div class="flex items-center justify-center space-x-2">
                        {tabIcon(tab)}
                        <span class="capitalize">{tab}</span>
                        <Motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200/80 dark:bg-gray-600/80 text-gray-700 dark:text-gray-300">{tabCount(tab)}</Motion.span>
                      </div>
                    </button>
                    <Show when={activeTab() === tab}>
                      <div class={`absolute inset-0 bg-gradient-to-r ${tabGradient(tab)} rounded-lg -z-10`} />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="flex-1 overflow-hidden">
            <Switch>
              <Match when={activeTab() === "components"}>
                <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, easing: "ease-out" }} class="h-full">
                  <div role="tabpanel" class="h-full m-0"><UnifiedLibrary<ComponentLibraryItem> entityType="components" onSelectItem={selectComponent} {...(props.onSaveComponent ? { onSaveItem: props.onSaveComponent } : {})} initialSource={source()} /></div>
                </Motion.div>
              </Match>
              <Match when={activeTab() === "materials"}>
                <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, easing: "ease-out" }} class="h-full">
                  <div role="tabpanel" class="h-full m-0"><UnifiedLibrary<MaterialLibraryItem> entityType="materials" onSelectItem={selectMaterial} {...(props.onSaveMaterial ? { onSaveItem: props.onSaveMaterial } : {})} initialSource={source()} /></div>
                </Motion.div>
              </Match>
              <Match when={activeTab() === "tools"}>
                <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, easing: "ease-out" }} class="h-full">
                  <div role="tabpanel" class="h-full m-0"><UnifiedLibrary<ToolLibraryItem> entityType="tools" onSelectItem={selectTool} {...(props.onSaveTool ? { onSaveItem: props.onSaveTool } : {})} initialSource={source()} /></div>
                </Motion.div>
              </Match>
            </Switch>
          </div>
        </div>
      </Motion.div>
    </Motion.div>
  )
}
