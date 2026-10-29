import { A, useLocation, useNavigate } from "@solidjs/router"
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import Home from "lucide-solid/icons/house"
import BookOpen from "lucide-solid/icons/book-open"
import FileText from "lucide-solid/icons/file-text"
import Grid from "lucide-solid/icons/grid-2x2"
import Tool from "lucide-solid/icons/wrench"
import Package from "lucide-solid/icons/package"
import Users from "lucide-solid/icons/users"
import Puzzle from "lucide-solid/icons/puzzle"
import Globe from "lucide-solid/icons/globe"
import Cpu from "lucide-solid/icons/cpu"
import BarChart from "lucide-solid/icons/chart-no-axes-column"
import Settings from "lucide-solid/icons/settings"
import User from "lucide-solid/icons/user"
import Database from "lucide-solid/icons/database"
import Server from "lucide-solid/icons/server"
import PlusSquare from "lucide-solid/icons/square-plus"
import Activity from "lucide-solid/icons/activity"
import ChevronDown from "lucide-solid/icons/chevron-down"
import ChevronLeft from "lucide-solid/icons/chevron-left"
import ChevronRight from "lucide-solid/icons/chevron-right"
import X from "lucide-solid/icons/x"
import Menu from "lucide-solid/icons/menu"
import Sun from "lucide-solid/icons/sun"
import Moon from "lucide-solid/icons/moon"
import LogIn from "lucide-solid/icons/log-in"
import LogOut from "lucide-solid/icons/log-out"
import Bell from "lucide-solid/icons/bell"
import Search from "lucide-solid/icons/search"
import ArrowUpRight from "lucide-solid/icons/arrow-up-right"
import { openExternal } from "../../app/external.ts"
import { isTauri } from "../../app/sidecar.ts"
import { t, type Key } from "../../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { prefersDark } from "../state/settings.ts"
import { endSession, getSessionToken, sessionVersion } from "../state/session.ts"

interface NavItem {
  readonly key: Key
  readonly href: string
  readonly icon: typeof Home
  readonly group: NavGroup
  readonly children?: ReadonlyArray<NavItem>
  /**
   * The CAD and CAM editors replace the whole shell with their own chrome, so
   * they are not pages of the console like the rest of the navigation. They
   * get their own group and a marked exit, because a reader should be able to
   * tell that following the link leaves this navigation behind.
   */
  readonly leavesConsole?: boolean
}

type NavGroup = "workspace" | "editors" | "tools" | "system"

const navigation: ReadonlyArray<NavItem> = [
  { key: "shell.dashboard", href: "/", icon: Home, group: "workspace" },
  { key: "shell.projects", href: "/projects", icon: FileText, group: "workspace", children: [
    { key: "shell.allProjects", href: "/projects", icon: FileText, group: "workspace" },
    { key: "shell.newProject", href: "/projects/create", icon: PlusSquare, group: "workspace" }
  ] },
  { key: "shell.manuals", href: "/manuals", icon: BookOpen, group: "workspace" },
  { key: "shell.resources", href: "/library", icon: Package, group: "workspace", children: [
    { key: "shell.toolpaths", href: "/toolpaths", icon: Tool, group: "workspace" },
    { key: "shell.components", href: "/components", icon: Package, group: "workspace" },
    { key: "shell.materials", href: "/materials", icon: Database, group: "workspace" },
    { key: "shell.configurations", href: "/machine", icon: Server, group: "workspace" },
    { key: "shell.tools", href: "/tools", icon: Tool, group: "workspace" }
  ] },
  { key: "shell.cad", href: "/cad", icon: Grid, group: "editors", leavesConsole: true },
  { key: "shell.cam", href: "/cam", icon: Tool, group: "editors", leavesConsole: true },
  { key: "shell.organization", href: "/organizations", icon: Users, group: "tools" },
  { key: "shell.plugins", href: "/plugins", icon: Puzzle, group: "tools" },
  { key: "shell.ai", href: "/ai", icon: Cpu, group: "tools" },
  { key: "shell.analytics", href: "/analytics", icon: BarChart, group: "tools", children: [
    { key: "shell.dashboard", href: "/analytics", icon: BarChart, group: "tools" },
    { key: "shell.history", href: "/analytics/history", icon: Activity, group: "tools" }
  ] },
  { key: "shell.website", href: "https://cadcam.fun", icon: Globe, group: "system" },
  { key: "shell.settings", href: "/settings", icon: Settings, group: "system", children: [
    { key: "shell.profile", href: "/profile", icon: User, group: "system" },
    { key: "shell.preferences", href: "/settings", icon: Settings, group: "system" }
  ] }
]

const navGroupLabel = (group: NavGroup): Key =>
  group === "workspace"
    ? "shell.group.workspace"
    : group === "editors"
      ? "shell.group.editors"
      : group === "tools"
        ? "shell.group.tools"
        : "shell.group.system"

const navigationGroups: ReadonlyArray<{ readonly id: NavGroup; readonly items: ReadonlyArray<NavItem> }> =
  (["workspace", "editors", "tools", "system"] as const).map((id) => ({ id, items: navigation.filter((item) => item.group === id) }))

export function ReferenceLink(props: { readonly href: string; readonly class?: string; readonly children: JSX.Element; readonly onNavigate?: () => void; readonly label?: string; readonly current?: boolean }): JSX.Element {
  const external = () => props.href.startsWith("https://")
  const follow = (event: MouseEvent) => {
    props.onNavigate?.()
    if (external() && isTauri()) {
      event.preventDefault()
      openExternal(props.href)
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
  const navigate = useNavigate()
  const [popover, setPopover] = createSignal<"profile" | "notifications">()
  const [account, setAccount] = createSignal<{ readonly name: string | null; readonly email: string | null }>()
  // Re-read the acting account whenever a sign-in or sign-out changes the session.
  createEffect(() => {
    sessionVersion()
    app.runtime.run(app.client.auth.getSession()).then((reply) => setAccount(reply.session.user), () => setAccount(undefined))
  })
  const signedIn = () => { sessionVersion(); return getSessionToken() !== undefined }
  const displayName = () => (signedIn() ? account()?.name || account()?.email : undefined) || t("shell.localUser")
  const initial = () => (signedIn() ? displayName().trim().charAt(0).toUpperCase() : "") || t("shell.userInitial")
  const signOut = async () => {
    close()
    await app.runtime.run(app.client.auth.signout()).catch(() => undefined)
    endSession(app.cache)
    navigate("/")
  }
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
  const shortcut = (): string => (typeof navigator !== "undefined" && navigator.userAgent.includes("Mac") ? "⌘K" : "Ctrl K")
  return <header ref={header} class="reference-navbar">
    <div class="reference-navbar-inner">
      <div class="reference-navbar-left">
        <button type="button" class="reference-icon-button reference-navbar-menu" title={t("shell.toggleSidebar")} aria-label={t("shell.toggleSidebar")} aria-expanded={props.sidebarOpen} aria-controls="reference-sidebar" onClick={props.onToggleSidebar}><Menu size={18} /></button>
      </div>
      <div class="reference-navbar-center">
        <button type="button" class="reference-navbar-search" title={t("palette.title")} aria-label={t("palette.title")} onClick={() => { close(); app.setPaletteOpen(true) }}>
          <Search size={14} aria-hidden="true" />
          <span class="reference-navbar-search__label">{t("shell.search")}</span>
          <kbd class="reference-navbar-kbd">{shortcut()}</kbd>
        </button>
      </div>
      <div class="reference-navbar-actions">
        <span class="reference-navbar-sep reference-navbar-sep--actions" aria-hidden="true" />
        <button type="button" class="reference-icon-button reference-theme-button" title={t("shell.toggleTheme")} aria-label={t("shell.toggleTheme")} onClick={() => app.settings.update({ theme: dark() ? "light" : "dark" })}><Show when={dark()} fallback={<Moon size={16} />}><Sun size={16} /></Show></button>
        <div class="relative">
          <button ref={notificationButton} type="button" class="reference-icon-button reference-navbar-bell" title={t("shell.notifications")} aria-label={t("shell.notifications")} aria-expanded={popover() === "notifications"} aria-controls="reference-notifications" onClick={() => { const next = popover() === "notifications" ? undefined : "notifications"; setPopover(next); if (next) void app.notifications.refresh() }}><Bell size={16} /><Show when={app.notifications.unreadCount() > 0}><span class="reference-navbar-unread" aria-label={t("shell.notifications.unread", { count: app.notifications.unreadCount() })}>{app.notifications.unreadCount()}</span></Show></button>
          <Show when={popover() === "notifications"}><section id="reference-notifications" class="reference-popover reference-notifications" aria-label={t("shell.notifications")}><div class="reference-notifications__head"><h2>{t("shell.notifications")}</h2><Show when={app.notifications.unreadCount() > 0}><button type="button" class="reference-notifications__action" onClick={() => void app.notifications.markAllRead()}>{t("shell.notifications.markAll")}</button></Show></div><Show when={app.notifications.rows().length > 0} fallback={<p>{t("shell.notifications.empty")}</p>}><ul class="reference-notifications__list"><For each={app.notifications.rows().slice(0, 20)}>{(row) => <li><button type="button" class="reference-notifications__item" onClick={() => { close(); if (!row.isRead) void app.notifications.markRead(row); if (row.linkUrl) navigate(row.linkUrl) }}><strong>{row.isRead ? row.title : `• ${row.title}`}</strong><span>{row.content}</span><small>{new Date(row.createdAt).toLocaleString()}</small></button></li>}</For></ul></Show></section></Show>
        </div>
        <div class="relative">
          <button ref={profileButton} type="button" class="reference-avatar" title={displayName()} aria-label={t("shell.openUserMenu")} aria-expanded={popover() === "profile"} aria-controls="reference-profile-menu" onClick={() => setPopover(popover() === "profile" ? undefined : "profile")}><span>{initial()}</span></button>
          <Show when={popover() === "profile"}><nav id="reference-profile-menu" class="reference-popover" aria-label={t("shell.openUserMenu")}>
            <div class="reference-profile-heading"><p>{displayName()}</p><small>{signedIn() ? account()?.email : t("shell.localProfile")}</small></div>
            <For each={[
              { href: "/profile", key: "shell.myProfile" as const, icon: User },
              { href: "/settings", key: "shell.settings" as const, icon: Settings },
              { href: "/organizations", key: "shell.organizations" as const, icon: Users },
              { href: "https://cadcam.fun", key: "shell.website" as const, icon: Globe }
            ]}>{(item) => <ReferenceLink href={item.href} class="reference-profile-link" onNavigate={close}><item.icon size={16} /><span>{t(item.key)}</span></ReferenceLink>}</For>
            <Show when={signedIn()} fallback={<ReferenceLink href="/auth/signin" class="reference-profile-link" onNavigate={close}><LogIn size={16} /><span>{t("shell.signIn")}</span></ReferenceLink>}>
              <button type="button" class="reference-profile-link w-[calc(100%-1rem)] text-left" data-testid="sign-out" onClick={() => void signOut()}><LogOut size={16} /><span>{t("shell.signOut")}</span></button>
            </Show>
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
    <aside id="reference-sidebar" class="reference-sidebar panel" classList={{ "is-collapsed": !props.open, "is-mobile": props.mobile }}>
      <div class="reference-sidebar-heading">
        <ReferenceLink href="/" class="reference-sidebar-brand" label={t("shell.brand")} onNavigate={follow}>
          <img src="/icon.png" alt="" />
          <Show when={props.open}><span class="reference-sidebar-brand-text"><strong>{t("shell.brand")}</strong><small>{t("shell.workstation")}</small></span></Show>
        </ReferenceLink>
        <Show when={props.mobile}><button type="button" class="reference-icon-button ml-auto" aria-label={t("shell.closeSidebar")} onClick={() => props.onOpenChange(false)}><X size={18} /></button></Show>
      </div>
      <nav class="reference-sidebar-nav" aria-label={t("shell.navigation")}><For each={navigationGroups}>{(group) => <section class="reference-nav-section" aria-labelledby={`reference-nav-${group.id}`}>
        <Show when={props.open}><h2 id={`reference-nav-${group.id}`} class="reference-nav-section-title">{t(navGroupLabel(group.id))}</h2></Show>
        <For each={group.items}>{(item) => <div class="reference-nav-group">
          <Show when={item.children} fallback={<ReferenceLink href={item.href} class={`reference-nav-item${current(item) ? " is-current" : ""}${item.leavesConsole === true ? " reference-nav-item--exit" : ""}`} current={current(item)} label={t(item.key)} onNavigate={follow}><item.icon size={18} /><Show when={props.open}><span>{t(item.key)}</span></Show><Show when={props.open && item.leavesConsole === true}><ArrowUpRight size={13} aria-hidden="true" class="reference-nav-item__exit" /></Show></ReferenceLink>}>
            <button type="button" class={`reference-nav-item${current(item) ? " is-current" : ""}`} aria-label={t(item.key)} title={t(item.key)} aria-expanded={props.open && !!expanded()[item.key]} aria-controls={`reference-group-${item.key}`} onClick={() => toggle(item)}><item.icon size={18} /><Show when={props.open}><span>{t(item.key)}</span><ChevronDown size={15} class={expanded()[item.key] ? "rotate-180" : ""} /></Show></button>
            <Show when={props.open && expanded()[item.key]}><div class="reference-nav-children" id={`reference-group-${item.key}`}><For each={item.children}>{(child) => <ReferenceLink href={child.href} class={`reference-nav-item${location.pathname === child.href ? " is-current" : ""}`} current={location.pathname === child.href} onNavigate={follow}><child.icon size={15} /><span>{t(child.key)}</span></ReferenceLink>}</For></div></Show>
          </Show>
        </div>}</For>
      </section>}</For></nav>
      <Show when={!props.mobile}><div class="reference-sidebar-foot">
        <button type="button" class="reference-sidebar-collapse" title={t(props.open ? "shell.collapseSidebar" : "shell.expandSidebar")} aria-label={t(props.open ? "shell.collapseSidebar" : "shell.expandSidebar")} onClick={() => props.onOpenChange(!props.open)}>
          <Show when={props.open} fallback={<ChevronRight size={16} />}><ChevronLeft size={16} /><span>{t("shell.collapseSidebar")}</span></Show>
        </button>
      </div></Show>
    </aside>
  </Show>
}
