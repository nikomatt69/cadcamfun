import { Show, type JSX } from "solid-js"
import WorkspaceNavigation from "../../components/workspace-navigation.tsx"
import { Motion } from "solid-motionone"
import {
  Box, ChevronLeft, ChevronRight, Circle, Layers, List, Wrench
} from "lucide-solid"
import ToolPanel from "./ToolPanel.tsx"
import LayerManager from "./LayerManager.tsx"
import CADElementExplorer from "./CADElementExplorer.tsx"

export type SidebarTab = "tools" | "layers" | "explorer"

interface EnhancedSidebarProps {
  readonly isOpen: boolean
  setIsOpen(isOpen: boolean): void
  readonly activeSidebarTab: SidebarTab
  setActiveSidebarTab(tab: SidebarTab): void
  onSelectComponent?: (component: unknown) => void
}

const tabClass = (active: boolean, shape: string) =>
  `${shape} text-sm font-medium transition-all duration-200 ${active ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"}`
const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

/** The editor's left sidebar: tools / explorer / layers tabs, quick navigation and the collapse toggle. */
export default function EnhancedSidebarCad(props: EnhancedSidebarProps): JSX.Element {

  const TabButton = (tab: { id: SidebarTab; label: string; title: string; icon: (size: number) => JSX.Element }): JSX.Element => (
    <Show when={props.isOpen} fallback={
      <Motion.button
        class={tabClass(props.activeSidebarTab === tab.id, "w-full py-4 flex flex-col items-center justify-center rounded-xl")}
        aria-pressed={props.activeSidebarTab === tab.id} onClick={() => props.setActiveSidebarTab(tab.id)} title={tab.title} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}
      >{tab.icon(20)}</Motion.button>
    }>
      <Motion.button
        class={tabClass(props.activeSidebarTab === tab.id, "flex-1 py-3 px-3 rounded-xl")}
        aria-pressed={props.activeSidebarTab === tab.id} onClick={() => props.setActiveSidebarTab(tab.id)} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}
      ><div class="flex items-center justify-center">{tab.icon(16)}<span class="ml-2">{tab.label}</span></div></Motion.button>
    </Show>
  )

  const collapsedContent = () => (
    <div class="py-4 px-2 rounded-xl flex flex-col overflow-y-auto scrollbar items-center">
      <Show when={props.activeSidebarTab === "tools"}>
        <div class="space-y-4 w-full flex flex-col items-center">
          <div class="flex flex-col items-center">
            <button class="p-2 rounded-md hover:bg-gray-100" title="Line"><div class="transform rotate-45"><Box size={20} /></div></button>
            <button class="p-2 rounded-md hover:bg-gray-100" title="Rectangle"><Box size={20} /></button>
            <button class="p-2 rounded-md hover:bg-gray-100" title="Circle"><Circle size={20} class="text-gray-600" /></button>
            <button class="p-2 rounded-md hover:bg-gray-100" title="Cube"><Box size={20} class="text-gray-600" /></button>
            <button class="p-2 rounded-md hover:bg-gray-100" title="Sphere"><Circle size={20} class="text-gray-600" /></button>
          </div>
        </div>
      </Show>
      <Show when={props.activeSidebarTab === "layers"}>
        <div class="text-center text-xs text-gray-500 mt-4"><Layers size={20} class="mx-auto mb-2" />Open sidebar<br />to manage layers</div>
      </Show>
      <Show when={props.activeSidebarTab === "explorer"}>
        <div class="text-center text-xs text-gray-500 mt-4"><List size={20} class="mx-auto mb-2" />Open sidebar<br />to view elements</div>
      </Show>
    </div>
  )

  return (
    <Motion.div
      class="cad-workspace__sidebar flex-shrink-0 dark:text-white mr-2 h-full flex flex-col"
      data-open={props.isOpen}
    >
      <Motion.div
        class="cad-workspace__tabs w-full flex justify-center"
        {...rise} transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div class={props.isOpen ? "flex justify-center w-full text-center gap-1 p-2" : "flex flex-col w-full gap-1 p-2"}>
          <TabButton id="tools" label="Tools" title="Tools" icon={(size) => <Wrench size={size} />} />
          <TabButton id="explorer" label="Explorer" title="Element Explorer" icon={(size) => <List size={size} />} />
          <TabButton id="layers" label="Layers" title="Layers" icon={(size) => <Layers size={size} />} />
        </div>
      </Motion.div>

      <Motion.div class="min-h-0 flex-1 flex-col rounded-xl overflow-y-auto" {...rise} transition={{ duration: 0.6, delay: 0.4 }}>
        <Show when={props.isOpen} fallback={collapsedContent()}>
          <div class="workstation-panel-content flex flex-col">
            <Show when={props.activeSidebarTab === "tools"}><ToolPanel /></Show>
            <Show when={props.activeSidebarTab === "layers"}><LayerManager /></Show>
            <Show when={props.activeSidebarTab === "explorer"}><CADElementExplorer /></Show>
          </div>
        </Show>
      </Motion.div>

      <WorkspaceNavigation isOpen={props.isOpen} />

      <Motion.div class="border-t border-white/30 dark:border-gray-600/30 p-3 flex justify-center" {...rise} transition={{ duration: 0.6, delay: 0.8 }}>
        <Motion.button
          class="p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-200 backdrop-blur-sm border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => props.setIsOpen(!props.isOpen)} title={props.isOpen ? "Collapse sidebar" : "Expand sidebar"}
          hover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 0.1)", x: 2 }} press={{ scale: 0.98 }}
        >
          <Motion.div animate={{ rotate: props.isOpen ? 0 : 180 }} transition={{ duration: 0.3 }}>
            <Show when={props.isOpen} fallback={<ChevronRight size={20} class="text-gray-600 dark:text-gray-300" />}><ChevronLeft size={20} class="text-gray-600 dark:text-gray-300" /></Show>
          </Motion.div>
        </Motion.button>
      </Motion.div>
    </Motion.div>
  )
}
