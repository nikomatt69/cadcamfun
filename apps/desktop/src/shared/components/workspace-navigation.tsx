import { For, Show, createSignal, type JSX } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Motion, Presence } from "solid-motionone"
import { t } from "../../i18n/index.ts"
import {
  Activity, BarChart2, ChevronDown, ChevronUp, Cpu, Database,
  FileText, Globe, Home, Package, Puzzle, Server, Settings, SquarePlus, User, Users, Wrench, LayoutGrid, BookOpen
} from "lucide-solid"

interface NavItem {
  readonly id: string
  readonly name: string
  readonly href: string
  readonly icon: JSX.Element
  readonly current?: boolean
  readonly children?: readonly NavItem[]
}


export default function WorkspaceNavigation(props: { readonly isOpen: boolean }): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [dropdown, setDropdown] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({ projects: true, resources: false, settings: false })
  const path = () => location.pathname
  const navigation = (): NavItem[] => [
    { id: "dashboard", name: t("shell.dashboard"), href: "/", icon: <Home size={20} />, current: path() === "/" },
    {
      id: "projects", name: t("shell.projects"), href: "#", icon: <FileText size={20} />, current: path().startsWith("/projects"),
      children: [
        { id: "all-projects", name: t("shell.allProjects"), href: "/projects", icon: <FileText size={16} />, current: path() === "/projects" },
        { id: "new-project", name: t("shell.newProject"), href: "/projects", icon: <SquarePlus size={16} />, current: path() === "/projects" }
      ]
    },
    { id: "cad", name: t("shell.cad"), href: "/cad", icon: <LayoutGrid size={20} />, current: path() === "/cad" },
    { id: "cam", name: t("shell.cam"), href: "/cam", icon: <Wrench size={20} />, current: path() === "/cam" },
    { id: "manuals", name: t("shell.manuals"), href: "/manuals", icon: <BookOpen size={20} />, current: path() === "/manuals" },
    {
      id: "resources", name: t("shell.resources"), href: "#", icon: <Package size={20} />,
      current: ["/components", "/materials", "/machine", "/tools", "/drawing-instruments", "/library"].some((prefix) => path().startsWith(prefix)),
      children: [
        { id: "toolpaths", name: t("shell.toolpaths"), href: "/toolpaths", icon: <Wrench size={16} />, current: path().startsWith("/toolpaths") },
        { id: "components", name: t("shell.components"), href: "/components", icon: <Package size={16} />, current: path().startsWith("/components") },
        { id: "materials", name: t("shell.materials"), href: "/materials", icon: <Database size={16} />, current: path().startsWith("/materials") },
        { id: "configurations", name: t("shell.configurations"), href: "/machine", icon: <Server size={16} />, current: path().startsWith("/machine") },
        { id: "tools", name: t("shell.tools"), href: "/tools", icon: <Wrench size={16} />, current: path().startsWith("/tools") }
      ]
    },
    { id: "organization", name: t("shell.organization"), href: "/organizations", icon: <Users size={20} />, current: path().startsWith("/organizations") },
    { id: "plugins", name: t("shell.plugins"), href: "/plugins", icon: <Puzzle size={20} />, current: path().startsWith("/plugins") },
    { id: "website", name: t("shell.website"), href: "https://cadcam.fun", icon: <Globe size={20} />, current: false },
    {
      id: "ai", name: t("shell.ai"), href: "/ai", icon: <Cpu size={20} />, current: path().startsWith("/ai"),
      children: [{ id: "ai-dashboard", name: t("shell.dashboard"), href: "/ai", icon: <BarChart2 size={16} />, current: path() === "/ai" }]
    },
    {
      id: "analytics", name: t("shell.analytics"), href: "#", icon: <BarChart2 size={20} />, current: path().startsWith("/analytics"),
      children: [
        { id: "analytics-dashboard", name: t("shell.dashboard"), href: "/analytics", icon: <BarChart2 size={16} />, current: path() === "/analytics" },
        { id: "history", name: t("shell.history"), href: "/analytics/history", icon: <Activity size={16} />, current: path() === "/analytics/history" }
      ]
    },
    {
      id: "settings", name: t("shell.settings"), href: "#", icon: <Settings size={20} />, current: path().startsWith("/settings") || path() === "/profile",
      children: [
        { id: "profile", name: t("shell.profile"), href: "/profile", icon: <User size={16} />, current: path() === "/profile" },
        { id: "preferences", name: t("shell.preferences"), href: "/settings", icon: <Settings size={16} />, current: path() === "/settings" }
      ]
    }
  ]

  const go = (href: string) => {
    if (/^https?:/.test(href)) window.open(href, "_blank", "noopener")
    else navigate(href)
  }

  const NavEntry = (entry: { item: NavItem }): JSX.Element => {
    const hasChildren = () => (entry.item.children?.length ?? 0) > 0
    const isExpanded = () => hasChildren() && !!expanded()[entry.item.id]
    return (
      <div class="rounded-xl">
        <button type="button"
          aria-expanded={hasChildren() ? isExpanded() : undefined}
          class={`group flex rounded-xl items-center justify-center px-1 py-1 text-sm font-medium rounded-md cursor-pointer transition-colors ${entry.item.current ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"} ${entry.item.current ? "bg-gray-100 dark:bg-blue-900/20" : "hover:bg-gray-100 dark:hover:bg-gray-800/60"}`}
          onClick={() => {
            if (hasChildren()) setExpanded((previous) => ({ ...previous, [entry.item.id]: !previous[entry.item.id] }))
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
          aria-label={t("cad.quickNavigation")}
          aria-expanded={dropdown()}
          class="btn btn-outline flex min-h-8 w-full items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium"
        >
          <span>{props.isOpen ? t("cad.quickNavigation") : ""}</span>
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
