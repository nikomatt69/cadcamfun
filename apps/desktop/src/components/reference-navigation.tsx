import { A, useLocation } from "@solidjs/router"
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import Home from "lucide-solid/icons/house"
import FileText from "lucide-solid/icons/file-text"
import Grid from "lucide-solid/icons/grid-2x2"
import Tool from "lucide-solid/icons/wrench"
import Package from "lucide-solid/icons/package"
import Users from "lucide-solid/icons/users"
import ShoppingBag from "lucide-solid/icons/shopping-bag"
import Puzzle from "lucide-solid/icons/puzzle"
import Globe from "lucide-solid/icons/globe"
import DollarSign from "lucide-solid/icons/dollar-sign"
import Cpu from "lucide-solid/icons/cpu"
import BarChart from "lucide-solid/icons/chart-no-axes-column"
import BookOpen from "lucide-solid/icons/book-open"
import Settings from "lucide-solid/icons/settings"
import User from "lucide-solid/icons/user"
import Database from "lucide-solid/icons/database"
import Server from "lucide-solid/icons/server"
import PlusSquare from "lucide-solid/icons/square-plus"
import TrendingUp from "lucide-solid/icons/trending-up"
import Activity from "lucide-solid/icons/activity"
import CreditCard from "lucide-solid/icons/credit-card"
import ChevronDown from "lucide-solid/icons/chevron-down"
import ChevronLeft from "lucide-solid/icons/chevron-left"
import ChevronRight from "lucide-solid/icons/chevron-right"
import X from "lucide-solid/icons/x"
import Menu from "lucide-solid/icons/menu"
import Sun from "lucide-solid/icons/sun"
import Moon from "lucide-solid/icons/moon"
import Bell from "lucide-solid/icons/bell"
import { open } from "@tauri-apps/plugin-shell"
import { isTauri } from "../app/sidecar.ts"
import { t, type Key } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { prefersDark } from "../state/settings.ts"

interface NavItem {
  readonly key: Key
  readonly href: string
  readonly icon: typeof Home
  readonly children?: ReadonlyArray<NavItem>
}

const navigation: ReadonlyArray<NavItem> = [
  { key: "shell.dashboard", href: "/", icon: Home },
  { key: "shell.projects", href: "/projects", icon: FileText, children: [
    { key: "shell.allProjects", href: "/projects", icon: FileText },
    { key: "shell.newProject", href: "/projects/create", icon: PlusSquare }
  ] },
  { key: "shell.cad", href: "/cad", icon: Grid },
  { key: "shell.cam", href: "/cam", icon: Tool },
  { key: "shell.resources", href: "/library", icon: Package, children: [
    { key: "shell.toolpaths", href: "/toolpaths", icon: Tool },
    { key: "shell.components", href: "/components", icon: Package },
    { key: "shell.materials", href: "/materials", icon: Database },
    { key: "shell.configurations", href: "/machine", icon: Server },
    { key: "shell.tools", href: "/tools", icon: Tool }
  ] },
  { key: "shell.organization", href: "/organizations", icon: Users },
  { key: "shell.marketplace", href: "/marketplace", icon: ShoppingBag, children: [
    { key: "shell.browseItems", href: "/marketplace", icon: ShoppingBag },
    { key: "shell.sellerDashboard", href: "/marketplace/seller/dashboard", icon: TrendingUp },
    { key: "shell.purchases", href: "/marketplace/purchases", icon: Package }
  ] },
  { key: "shell.plugins", href: "/plugins", icon: Puzzle },
  { key: "shell.website", href: "https://site.cadcamfun.xyz", icon: Globe },
  { key: "shell.pricing", href: "/pricing", icon: DollarSign },
  { key: "shell.ai", href: "/ai", icon: Cpu },
  { key: "shell.analytics", href: "/analytics", icon: BarChart, children: [
    { key: "shell.dashboard", href: "/analytics", icon: BarChart },
    { key: "shell.history", href: "/analytics/history", icon: Activity }
  ] },
  { key: "shell.docs", href: "https://docs.cadcamfun.xyz", icon: BookOpen, children: [
    { key: "shell.userGuide", href: "https://docs.cadcamfun.xyz", icon: FileText },
    { key: "shell.apiPlayground", href: "https://docs.cadcamfun.xyz", icon: Cpu }
  ] },
  { key: "shell.settings", href: "/settings", icon: Settings, children: [
    { key: "shell.profile", href: "/profile", icon: User },
    { key: "shell.preferences", href: "/settings", icon: Settings },
    { key: "shell.subscription", href: "/settings/subscription", icon: CreditCard }
  ] }
]

export function ReferenceLink(props: { readonly href: string; readonly class?: string; readonly children: JSX.Element; readonly onNavigate?: () => void; readonly label?: string; readonly current?: boolean }): JSX.Element {
  const external = () => props.href.startsWith("https://")
  const follow = (event: MouseEvent) => {
    props.onNavigate?.()
    if (external() && isTauri()) {
      event.preventDefault()
      void open(props.href).catch(() => window.open(props.href, "_blank", "noopener,noreferrer"))
    }
  }
  return <Show when={external()} fallback={<A href={props.href} class={props.class} aria-label={props.label} aria-current={props.current ? "page" : undefined} onClick={follow}>{props.children}</A>}>
    <a href={props.href} class={props.class} aria-label={props.label} target="_blank" rel="noopener noreferrer" onClick={follow}>{props.children}</a>
  </Show>
}

export function ReferenceNavbar(props: { readonly sidebarOpen: boolean; readonly onToggleSidebar: () => void }): JSX.Element {
  const app = useApp()
  let header: HTMLElement | undefined
  let profileButton: HTMLButtonElement | undefined
  let notificationButton: HTMLButtonElement | undefined
  const [popover, setPopover] = createSignal<"profile" | "notifications">()
  const dark = () => app.settings.settings().theme === "dark" || (app.settings.settings().theme === "system" && prefersDark())
  const close = () => setPopover(undefined)
  const outside = (event: PointerEvent) => { if (event.target instanceof Node && !header?.contains(event.target)) close() }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !popover()) return
    const trigger = popover() === "profile" ? profileButton : notificationButton
    close()
    trigger?.focus()
  }
  onMount(() => { document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape) })
  onCleanup(() => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape) })
  return <header ref={header} class="reference-navbar">
    <div class="reference-navbar-inner">
      <div class="flex items-center">
        <button type="button" class="reference-icon-button mr-2" aria-label={t("shell.toggleSidebar")} aria-expanded={props.sidebarOpen} aria-controls="reference-sidebar" onClick={props.onToggleSidebar}><Menu size={24} /></button>
        <ReferenceLink href="/" class="reference-logo"><img src="/logo.png" alt={t("shell.brand")} /></ReferenceLink>
      </div>
      <div class="reference-navbar-actions">
        <button type="button" class="reference-icon-button reference-theme-button" aria-label={t("shell.toggleTheme")} onClick={() => app.settings.update({ theme: dark() ? "light" : "dark" })}><Show when={dark()} fallback={<Moon size={24} />}><Sun size={24} /></Show></button>
        <div class="relative">
          <button ref={notificationButton} type="button" class="reference-icon-button" aria-label={t("shell.notifications")} aria-expanded={popover() === "notifications"} aria-controls="reference-notifications" onClick={() => setPopover(popover() === "notifications" ? undefined : "notifications")}><Bell size={24} /></button>
          <Show when={popover() === "notifications"}><section id="reference-notifications" class="reference-popover reference-notifications" aria-label={t("shell.notifications")}><h2>{t("shell.notifications")}</h2><p>{t("shell.notificationsUnavailable")}</p></section></Show>
        </div>
        <ReferenceLink href="/settings" class="reference-icon-button reference-navbar-settings" label={t("shell.settings")}><Settings size={24} /></ReferenceLink>
        <div class="relative">
          <button ref={profileButton} type="button" class="reference-avatar" aria-label={t("shell.openUserMenu")} aria-expanded={popover() === "profile"} aria-controls="reference-profile-menu" onClick={() => setPopover(popover() === "profile" ? undefined : "profile")}><span>{t("shell.userInitial")}</span></button>
          <Show when={popover() === "profile"}><nav id="reference-profile-menu" class="reference-popover" aria-label={t("shell.openUserMenu")}>
            <div class="reference-profile-heading"><p>{t("shell.localUser")}</p><small>{t("shell.localProfile")}</small></div>
            <For each={[
              { href: "/profile", key: "shell.myProfile" as const, icon: User },
              { href: "/settings", key: "shell.settings" as const, icon: Settings },
              { href: "/organizations", key: "shell.organizations" as const, icon: Users },
              { href: "https://site.cadcamfun.xyz", key: "shell.website" as const, icon: Globe },
              { href: "https://docs.cadcamfun.xyz", key: "shell.documentation" as const, icon: BookOpen }
            ]}>{(item) => <ReferenceLink href={item.href} class="reference-profile-link" onNavigate={close}><item.icon size={16} /><span>{t(item.key)}</span></ReferenceLink>}</For>
          </nav></Show>
        </div>
      </div>
    </div>
  </header>
}

export function ReferenceSidebar(props: { readonly open: boolean; readonly mobile: boolean; readonly onOpenChange: (open: boolean) => void }): JSX.Element {
  const location = useLocation()
  const [expanded, setExpanded] = createSignal<Readonly<Record<string, boolean>>>({})
  const matches = (href: string) => href === "/" ? location.pathname === "/" : !href.startsWith("https://") && (location.pathname === href || location.pathname.startsWith(`${href}/`))
  const current = (item: NavItem): boolean => matches(item.href) || (item.children?.some((child) => matches(child.href)) ?? false)
  createEffect(() => {
    const path = location.pathname
    setExpanded((previous) => {
      const next = { ...previous }
      for (const item of navigation) if (item.children && current(item)) next[item.key] = true
      return next
    })
    if (props.mobile) props.onOpenChange(false)
    void path
  })
  const follow = () => { if (props.mobile) props.onOpenChange(false) }
  const toggle = (item: NavItem) => {
    if (!props.open) { props.onOpenChange(true); setExpanded((previous) => ({ ...previous, [item.key]: true })); return }
    setExpanded((previous) => ({ ...previous, [item.key]: !previous[item.key] }))
  }
  return <Show when={!props.mobile || props.open}>
    <Show when={props.mobile}><button type="button" class="reference-sidebar-scrim" aria-label={t("shell.closeSidebar")} onClick={() => props.onOpenChange(false)} /></Show>
    <aside id="reference-sidebar" class="reference-sidebar" classList={{ "is-collapsed": !props.open, "is-mobile": props.mobile }}>
      <div class="reference-sidebar-heading"><img src="/icon.png" alt={t("shell.brand")} /><Show when={props.open}><span>{t("shell.menu")}</span></Show><Show when={props.mobile}><button type="button" class="reference-icon-button ml-auto" aria-label={t("shell.closeSidebar")} onClick={() => props.onOpenChange(false)}><X size={20} /></button></Show></div>
      <Show when={!props.mobile}><button type="button" class="reference-sidebar-toggle" aria-label={t(props.open ? "shell.collapseSidebar" : "shell.expandSidebar")} onClick={() => props.onOpenChange(!props.open)}><Show when={props.open} fallback={<ChevronRight size={14} />}><ChevronLeft size={14} /></Show></button></Show>
      <nav class="reference-sidebar-nav" aria-label={t("shell.navigation")}><For each={navigation}>{(item) => <div class="reference-nav-group">
        <Show when={item.children} fallback={<ReferenceLink href={item.href} class={`reference-nav-item ${current(item) ? "is-current" : ""}`} current={current(item)} label={t(item.key)} onNavigate={follow}><item.icon size={20} /><Show when={props.open}><span>{t(item.key)}</span></Show></ReferenceLink>}>
          <button type="button" class={`reference-nav-item ${current(item) ? "is-current" : ""}`} aria-label={t(item.key)} title={t(item.key)} aria-expanded={props.open && !!expanded()[item.key]} aria-controls={`reference-group-${item.key}`} onClick={() => toggle(item)}><item.icon size={20} /><Show when={props.open}><span>{t(item.key)}</span><ChevronDown size={16} class={expanded()[item.key] ? "rotate-180" : ""} /></Show></button>
          <Show when={props.open && expanded()[item.key]}><div class="reference-nav-children" id={`reference-group-${item.key}`}><For each={item.children}>{(child) => <ReferenceLink href={child.href} class={`reference-nav-item ${location.pathname === child.href ? "is-current" : ""}`} current={location.pathname === child.href} onNavigate={follow}><child.icon size={16} /><span>{t(child.key)}</span></ReferenceLink>}</For></div></Show>
        </Show>
      </div>}</For></nav>
    </aside>
  </Show>
}
