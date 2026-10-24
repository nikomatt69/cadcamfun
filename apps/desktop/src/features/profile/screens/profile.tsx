/**
 * `/profile` — the local account's profile: identity and contact card, counters,
 * and the tabs that list its projects, components and toolpaths.
 *
 * Data comes from the v6 user group — `GET /api/user/profile`, `/projects`,
 * `/components`, `/toolpaths`, `/organizations` — the same endpoints the legacy
 * page fetched. The legacy page could also render *another* user's profile
 * through `/api/users/:id/...`; v6 has no such route, so this screen always
 * renders the local profile, which is what `isOwnProfile` did in practice.
 *
 * The layout follows the workstation vocabulary of the rest of the app: flat
 * bordered surfaces, 5 px radii, 12 px type and one blue accent.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Box, Calendar, Folder, Globe, Layout, Mail, MapPin, Pencil, Settings, Shield, User, Wrench } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import {
  BADGE, CARD, PANEL, StageEmpty, StageLoading, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspacePage, WorkspaceTabs,
  type WorkspaceTabItem
} from "../../../shared/components/WorkspacePage.tsx"

type TabId = "projects" | "components" | "toolpaths"

interface UserItem {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly thumbnail?: string | null
}

type ItemIcon = (props: { readonly size?: number; readonly class?: string }) => JSX.Element

const formatMonth = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString("en-US", { year: "numeric", month: "long" })
}

const shortDate = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString()
}

export function ProfileScreen(): JSX.Element {
  const profile = useRead((client) => client.user.profile())
  const projects = useRead((client) => client.user.projects())
  const components = useRead((client) => client.user.components())
  const toolpaths = useRead((client) => client.user.toolpaths())
  const organizations = useRead((client) => client.user.organizations())
  const [activeTab, setActiveTab] = createSignal<TabId>("projects")

  // Admin emails — verbatim from the legacy page.
  const ADMIN_EMAILS = ["nicola.mattioli.95@gmail.com", "nicom.19@icloud.com"]

  const isLoading = (): boolean =>
    profile.loading() || projects.loading() || components.loading() || toolpaths.loading() || organizations.loading()

  const isAdmin = (): boolean => {
    const email = profile.data()?.email
    return email !== null && email !== undefined && ADMIN_EMAILS.includes(email)
  }

  const tabs = (): ReadonlyArray<WorkspaceTabItem<TabId>> => [
    { id: "projects", label: t("shell.projects"), icon: <Folder size={14} aria-hidden="true" /> },
    { id: "components", label: t("shell.components"), icon: <Box size={14} aria-hidden="true" /> },
    { id: "toolpaths", label: t("shell.toolpaths"), icon: <Wrench size={14} aria-hidden="true" /> }
  ]

  const itemCard = (item: UserItem, href: string, Icon: ItemIcon, withDescription: boolean): JSX.Element => (
    <A href={href} class={`${CARD} cursor-pointer`}>
      <div class="flex h-20 items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-700/70 dark:bg-slate-800/40">
        <Show
          when={typeof item.thumbnail === "string" && item.thumbnail.length > 0}
          fallback={<span class="flex h-10 w-10 items-center justify-center rounded-[5px] border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"><Icon size={20} /></span>}
        >
          <img src={item.thumbnail ?? ""} alt={item.name} class="h-full w-full object-cover" />
        </Show>
      </div>
      <div class="p-3">
        <h3 class="truncate text-xs font-semibold text-slate-900 dark:text-white">{item.name}</h3>
        <Show when={withDescription}>
          <p class="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{item.description ?? t("profile.noDescription")}</p>
        </Show>
        <p class="mt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">{t("profile.updated", { date: shortDate(item.updatedAt) })}</p>
      </div>
    </A>
  )

  const stat = (icon: JSX.Element, value: number, label: string): JSX.Element => (
    <div class="flex items-center gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40">
      <span class="flex h-7 w-7 flex-none items-center justify-center rounded-[4px] border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{icon}</span>
      <div class="min-w-0">
        <p class="text-[15px] font-semibold leading-5 tabular-nums text-slate-900 dark:text-white">{value}</p>
        <p class="truncate text-[10.5px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  )

  return (
    <WorkspacePage
      title={profile.data()?.name || t("profile.userFallback")}
      actions={
        <>
          <Show when={isAdmin()}>
            <A href="/admin" class={TOOLBAR_BUTTON}><Shield size={14} aria-hidden="true" />{t("profile.adminDashboard")}</A>
          </Show>
          <A href="/profile/settings" class={TOOLBAR_PRIMARY}><Settings size={14} aria-hidden="true" />{t("profile.editProfile")}</A>
        </>
      }
    >
      <Show when={!isLoading()} fallback={<StageLoading label={t("common.loading")} />}>
        <Show when={profile.data()} fallback={
          <StageEmpty icon={<User size={22} aria-hidden="true" />} title={t("profile.notFoundTitle")} hint={t("profile.notFoundBody")}>
            <A href="/" class={TOOLBAR_BUTTON}>{t("profile.returnHome")}</A>
          </StageEmpty>
        }>
          {(me) => <>
            <section class={`${PANEL} mb-3 !p-3`}>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div class="relative flex-none">
                  <Show
                    when={typeof me().image === "string" && (me().image?.length ?? 0) > 0}
                    fallback={<div class="flex h-14 w-14 items-center justify-center rounded-[5px] border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"><User size={26} aria-hidden="true" /></div>}
                  >
                    <img src={me().image ?? ""} alt={me().name ?? t("profile.userFallback")} class="h-14 w-14 rounded-[5px] border border-slate-200 object-cover dark:border-slate-700" />
                  </Show>
                  <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" title={t("profile.role")} />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{me().name ?? t("profile.userFallback")}</h2>
                    <span class={`${BADGE} workspace-badge--accent`}>{t("profile.role")}</span>
                  </div>

                  <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <Show when={typeof me().email === "string" && (me().email?.length ?? 0) > 0}>
                      <div class="flex min-w-0 items-center gap-2">
                        <Mail size={14} class="flex-none text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        <div class="min-w-0">
                          <p class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{t("profile.email")}</p>
                          <p class="truncate text-[11.5px] text-slate-700 dark:text-slate-200">{me().email}</p>
                        </div>
                      </div>
                    </Show>
                    <Show when={typeof me().location === "string" && (me().location?.length ?? 0) > 0}>
                      <div class="flex min-w-0 items-center gap-2">
                        <MapPin size={14} class="flex-none text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        <div class="min-w-0">
                          <p class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{t("profile.location")}</p>
                          <p class="truncate text-[11.5px] text-slate-700 dark:text-slate-200">{me().location}</p>
                        </div>
                      </div>
                    </Show>
                    <div class="flex min-w-0 items-center gap-2">
                      <Calendar size={14} class="flex-none text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <div class="min-w-0">
                        <p class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{t("profile.joined")}</p>
                        <p class="truncate text-[11.5px] text-slate-700 dark:text-slate-200">{formatMonth(me().createdAt ?? "")}</p>
                      </div>
                    </div>
                  </div>

                  <Show when={typeof me().bio === "string" && (me().bio?.length ?? 0) > 0}>
                    <p class="mt-2 border-t border-slate-200 pt-2 text-[11.5px] leading-5 text-slate-600 dark:border-slate-700/70 dark:text-slate-300">{me().bio}</p>
                  </Show>
                </div>

                <div class="flex flex-none flex-wrap items-center gap-1.5 sm:flex-col sm:items-stretch">
                  <Show when={typeof me().website === "string" && (me().website?.length ?? 0) > 0}>
                    <a href={me().website ?? ""} target="_blank" rel="noopener noreferrer" class={TOOLBAR_BUTTON}><Globe size={14} aria-hidden="true" />{t("profile.website")}</a>
                  </Show>
                  <button type="button" class={TOOLBAR_BUTTON}><Pencil size={14} aria-hidden="true" />{t("profile.shareProfile")}</button>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-700/70 lg:grid-cols-4">
                {stat(<Folder size={14} aria-hidden="true" />, (projects.data() ?? []).length, t("shell.projects"))}
                {stat(<Box size={14} aria-hidden="true" />, (components.data() ?? []).length, t("shell.components"))}
                {stat(<Wrench size={14} aria-hidden="true" />, (toolpaths.data() ?? []).length, t("shell.toolpaths"))}
                {stat(<Layout size={14} aria-hidden="true" />, (organizations.data() ?? []).length, t("shell.organizations"))}
              </div>
            </section>

            <WorkspaceTabs class="mb-3" tabs={tabs()} value={activeTab()} onChange={setActiveTab} label={t("profile.role")} />

            <Show when={activeTab() === "projects"}>
              <Show when={(projects.data() ?? []).length > 0} fallback={<StageEmpty icon={<Folder size={22} aria-hidden="true" />} title={t("profile.emptyProjects")} hint={t("profile.emptyProjectsBody")} />}>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={projects.data() ?? []}>{(project) => itemCard(project, `/projects/${project.id}`, Folder, false)}</For>
                </div>
              </Show>
            </Show>

            <Show when={activeTab() === "components"}>
              <Show when={(components.data() ?? []).length > 0} fallback={<StageEmpty icon={<Box size={22} aria-hidden="true" />} title={t("profile.emptyComponents")} hint={t("profile.emptyComponentsBody")} />}>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={components.data() ?? []}>{(component) => itemCard(component, `/components/${component.id}`, Box, true)}</For>
                </div>
              </Show>
            </Show>

            <Show when={activeTab() === "toolpaths"}>
              <Show when={(toolpaths.data() ?? []).length > 0} fallback={<StageEmpty icon={<Wrench size={22} aria-hidden="true" />} title={t("profile.emptyToolpaths")} hint={t("profile.emptyToolpathsBody")} />}>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={toolpaths.data() ?? []}>{(toolpath) => itemCard(toolpath, `/toolpaths/${toolpath.id}`, Wrench, false)}</For>
                </div>
              </Show>
            </Show>
          </>}
        </Show>
      </Show>
    </WorkspacePage>
  )
}
