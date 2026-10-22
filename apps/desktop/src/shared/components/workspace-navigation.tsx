import { For, Show, createSignal, type JSX } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Motion, Presence } from "solid-motionone"
import { t } from "../../i18n/index.ts"
import {
  Activity, BarChart2, ChevronDown, ChevronUp, Cpu, Database,
  FileText, Globe, Home, Package, Puzzle, Server, Settings, SquarePlus, User, Users, Wrench, LayoutGrid, BookOpen
} from "lucide-solid"

interface NavItem { name: string; href: string; icon: JSX.Element; current?: boolean; children?: NavItem[] }


export default function WorkspaceNavigation(props: { readonly isOpen: boolean }): JSX.Element {
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
    { name: t("shell.manuals"), href: "/manuals", icon: <BookOpen size={20} />, current: path() === "/manuals" },
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
    { name: "Website", href: "https://cadcam.fun", icon: <Globe size={20} />, current: false },
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
      name: "Settings", href: "#", icon: <Settings size={20} />, current: path().startsWith("/settings") || path() === "/profile",
      children: [
        { name: "Profile", href: "/profile", icon: <User size={16} />, current: path() === "/profile" },
        { name: "Preferences", href: "/settings", icon: <Settings size={16} />, current: path() === "/settings" }
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
        <button type="button"
          aria-expanded={hasChildren() ? isExpanded() : undefined}
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
        </button>
        <Show when={props.isOpen && isExpanded()}>
          <div class="ml-3 rounded-xl space-y-1">
            <For each={entry.item.children}>{(child) =>
               <button type="button"
                class={`group flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer ${child.current ? "text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-blue-900/20" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"}`}
                onClick={() => go(child.href)}
              >
                <span class="mr-3 text-gray-500 dark:text-gray-400">{child.icon}</span>
                <span>{child.name}</span>
               </button>}
            </For>
          </div>
        </Show>
      </div>
    )
  }


  return (
      <div class="workstation-navigation border-t border-gray-200 dark:border-gray-700">
        <button type="button"
          onClick={() => setDropdown(!dropdown())}
          aria-label="Quick Navigation"
          aria-expanded={dropdown()}
          class="btn btn-outline flex min-h-8 w-full items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium"
        >
          <span>{props.isOpen ? "Quick Navigation" : ""}</span>
          <Motion.svg class={`w-4 h-4 text-gray-500 ${props.isOpen ? "ml-2" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" animate={{ rotate: dropdown() ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </Motion.svg>
        </button>
        <Presence>
          <Show when={dropdown()}>
            <Motion.div class="space-y-1 scrollbar overflow-y-auto mt-2 flex flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Show when={props.isOpen}><For each={navigation()}>{(item) => <NavEntry item={item} />}</For></Show>
            </Motion.div>
          </Show>
        </Presence>
      </div>

  )
}
