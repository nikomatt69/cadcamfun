import { For, Show, createSignal, type JSX } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Motion, Presence } from "solid-motionone"
import {
  Activity, BarChart2, BookOpen, BrainCircuit, Box, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Cpu, CreditCard, Database,
  DollarSign, FileText, Globe, Home, Layers, List, Package, Puzzle, Server, Settings, SquarePlus, User, Users, Wrench, LayoutGrid
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

interface NavItem { name: string; href: string; icon: JSX.Element; current?: boolean; children?: NavItem[] }

const tabClass = (active: boolean, shape: string) =>
  `${shape} text-sm font-medium transition-all duration-200 ${active ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"}`
const tabMotion = (active: boolean) => active
  ? { scale: 1.02, backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 1)" }
  : { scale: 1, backgroundColor: "transparent", borderColor: "transparent" }
const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

/** The editor's left sidebar: tools / explorer / layers tabs, quick navigation and the collapse toggle. */
export default function EnhancedSidebarCad(props: EnhancedSidebarProps): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [dropdown, setDropdown] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({ projects: true, resources: false, settings: false })
  const path = () => location.pathname

  const navigation = (): NavItem[] => [
    { name: "Dashboard", href: "/", icon: <Home size={20} />, current: path() === "/" },
    {
      name: "Projects", href: "#", icon: <FileText size={20} />, current: path().startsWith("/projects"),
      children: [
        { name: "All Projects", href: "/projects", icon: <FileText size={16} />, current: path() === "/projects" },
        { name: "New Project", href: "/projects", icon: <SquarePlus size={16} />, current: path() === "/projects" }
      ]
    },
    { name: "CAD Editor", href: "/cad", icon: <LayoutGrid size={20} />, current: path() === "/cad" },
    { name: "CAM Editor", href: "/cam", icon: <Wrench size={20} />, current: path() === "/cam" },
    {
      name: "Resources", href: "#", icon: <Package size={20} />,
      current: ["/components", "/materials", "/machine", "/tools", "/drawing-instruments", "/library"].some((prefix) => path().startsWith(prefix)),
      children: [
        { name: "Toolpaths", href: "/toolpaths", icon: <Wrench size={16} />, current: path().startsWith("/toolpaths") },
        { name: "Components", href: "/components", icon: <Package size={16} />, current: path().startsWith("/components") },
        { name: "Materials", href: "/materials", icon: <Database size={16} />, current: path().startsWith("/materials") },
        { name: "Configurations", href: "/machine", icon: <Server size={16} />, current: path().startsWith("/machine") },
        { name: "Tools", href: "/tools", icon: <Wrench size={16} />, current: path().startsWith("/tools") }
      ]
    },
    { name: "Organization", href: "/organizations", icon: <Users size={20} />, current: path().startsWith("/organizations") },
    { name: "Plugins", href: "/plugins", icon: <Puzzle size={20} />, current: path().startsWith("/plugins") },
    { name: "Pricing", href: "/pricing", icon: <DollarSign size={20} />, current: path().startsWith("/pricing") },
    { name: "Website", href: "https://site.cadcamfun.xyz", icon: <Globe size={20} />, current: false },
    {
      name: "AI", href: "/ai", icon: <Cpu size={20} />, current: path().startsWith("/ai"),
      children: [{ name: "Dashboard", href: "/ai", icon: <BarChart2 size={16} />, current: path() === "/ai" }]
    },
    {
      name: "Analytics", href: "#", icon: <BarChart2 size={20} />, current: path().startsWith("/analytics"),
      children: [
        { name: "Dashboard", href: "/analytics", icon: <BarChart2 size={16} />, current: path() === "/analytics" },
        { name: "Activity History", href: "/analytics/history", icon: <Activity size={16} />, current: path() === "/analytics/history" }
      ]
    },
    {
      name: "Docs", href: "#", icon: <BookOpen size={20} />, current: false,
      children: [
        { name: "UserGuide", href: "https://docs.cadcamfun.xyz", icon: <FileText size={16} />, current: false },
        { name: "Api Playground", href: "/graphql", icon: <BrainCircuit size={16} />, current: path() === "/graphql" }
      ]
    },
    {
      name: "Settings", href: "#", icon: <Settings size={20} />, current: path().startsWith("/settings") || path() === "/profile",
      children: [
        { name: "Profile", href: "/profile", icon: <User size={16} />, current: path() === "/profile" },
        { name: "Preferences", href: "/settings", icon: <Settings size={16} />, current: path() === "/settings" },
        { name: "Subscription", href: "/settings/subscription", icon: <CreditCard size={16} />, current: path() === "/settings/subscription" }
      ]
    }
  ]

  const go = (href: string) => {
    if (/^https?:/.test(href)) window.open(href, "_blank", "noopener")
    else navigate(href)
  }

  const NavEntry = (entry: { item: NavItem }): JSX.Element => {
    const hasChildren = () => (entry.item.children?.length ?? 0) > 0
    const isExpanded = () => hasChildren() && !!expanded()[entry.item.name.toLowerCase()]
    return (
      <div class="rounded-xl">
        <div
          class={`group flex rounded-xl items-center justify-center px-1 py-1 text-sm font-medium rounded-md cursor-pointer transition-colors ${entry.item.current ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"} ${entry.item.current ? "bg-gray-100 dark:bg-blue-900/20" : "hover:bg-gray-100 dark:hover:bg-gray-800/60"}`}
          onClick={() => {
            if (hasChildren()) setExpanded((previous) => ({ ...previous, [entry.item.name.toLowerCase()]: !previous[entry.item.name.toLowerCase()] }))
            else if (entry.item.href !== "#") go(entry.item.href)
          }}
        >
          <div class="flex rounded-xl items-center">
            <span class={`${entry.item.current ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"} mr-3`}>{entry.item.icon}</span>
            <Show when={props.isOpen}><span>{entry.item.name}</span></Show>
          </div>
          <Show when={props.isOpen && hasChildren()}>
            <div class="rounded-xl ml-2"><Show when={isExpanded()} fallback={<ChevronDown size={16} />}><ChevronUp size={16} /></Show></div>
          </Show>
        </div>
        <Show when={props.isOpen && isExpanded()}>
          <div class="ml-3 rounded-xl space-y-1">
            <For each={entry.item.children}>{(child) =>
              <div
                class={`group flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer ${child.current ? "text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-blue-900/20" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"}`}
                onClick={() => go(child.href)}
              >
                <span class="mr-3 text-gray-500 dark:text-gray-400">{child.icon}</span>
                <span>{child.name}</span>
              </div>}
            </For>
          </div>
        </Show>
      </div>
    )
  }

  const TabButton = (tab: { id: SidebarTab; label: string; title: string; icon: (size: number) => JSX.Element }): JSX.Element => (
    <Show when={props.isOpen} fallback={
      <Motion.button
        class={tabClass(props.activeSidebarTab === tab.id, "w-full py-4 flex flex-col items-center justify-center rounded-xl")}
        onClick={() => props.setActiveSidebarTab(tab.id)} title={tab.title} animate={tabMotion(props.activeSidebarTab === tab.id)} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}
      >{tab.icon(20)}</Motion.button>
    }>
      <Motion.button
        class={tabClass(props.activeSidebarTab === tab.id, "flex-1 py-3 px-3 rounded-xl")}
        onClick={() => props.setActiveSidebarTab(tab.id)} animate={tabMotion(props.activeSidebarTab === tab.id)} hover={{ scale: 1.02 }} press={{ scale: 0.98 }}
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
      class="flex-shrink-0 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white border border-white/30 dark:border-gray-600/30 mr-2 rounded-2xl border-r h-full flex flex-col shadow-xl"
      animate={{ width: props.isOpen ? "20rem" : "5rem", opacity: props.isOpen ? 1 : 0.9 }} transition={{ duration: 0.5, easing: "ease-in-out" }}
    >
      <Motion.div
        class="w-full border-b border-white/30 dark:border-gray-600/30 rounded-t-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-gray-700/50 dark:to-gray-800/50 backdrop-blur-sm flex justify-center"
        {...rise} transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div class={props.isOpen ? "flex justify-center w-full text-center gap-1 p-2" : "flex flex-col w-full gap-1 p-2"}>
          <TabButton id="tools" label="Tools" title="Tools" icon={(size) => <Wrench size={size} />} />
          <TabButton id="explorer" label="Explorer" title="Element Explorer" icon={(size) => <List size={size} />} />
          <TabButton id="layers" label="Layers" title="Layers" icon={(size) => <Layers size={size} />} />
        </div>
      </Motion.div>

      <Motion.div class="flex-1 flex-col rounded-xl overflow-y-auto" {...rise} transition={{ duration: 0.6, delay: 0.4 }}>
        <Show when={props.isOpen} fallback={collapsedContent()}>
          <div class="p-1 rounded-xl overflow-y-auto space-y-6 flex flex-col items-center">
            <Show when={props.activeSidebarTab === "tools"}><ToolPanel /></Show>
            <Show when={props.activeSidebarTab === "layers"}><LayerManager /></Show>
            <Show when={props.activeSidebarTab === "explorer"}><CADElementExplorer /></Show>
          </div>
        </Show>
      </Motion.div>

      <Motion.div class="mt-2 p-3 overflow-y-auto rounded-xl border-t border-white/30 dark:border-gray-600/30" {...rise} transition={{ duration: 0.6, delay: 0.6 }}>
        <Motion.button
          onClick={() => setDropdown(!dropdown())}
          class="flex items-center justify-center w-full px-3 py-2 text-sm font-medium text-center rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 focus:outline-none transition-all duration-200 backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
          hover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 0.1)", x: 2 }} press={{ scale: 0.98 }}
        >
          <span class="text-xs text-gray-500">{props.isOpen ? "Quick Navigation" : ""}</span>
          <Motion.svg class={`w-4 h-4 text-gray-500 ${props.isOpen ? "ml-2" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" animate={{ rotate: dropdown() ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </Motion.svg>
        </Motion.button>
        <Presence>
          <Show when={dropdown()}>
            <Motion.div class="space-y-1 scrollbar overflow-y-auto mt-2 flex flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Show when={props.isOpen}><For each={navigation()}>{(item) => <NavEntry item={item} />}</For></Show>
            </Motion.div>
          </Show>
        </Presence>
      </Motion.div>

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
