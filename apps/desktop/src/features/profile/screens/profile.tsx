/**
 * `/profile` — port of `.reference/src/pages/profile/index.tsx`.
 *
 * The profile header (banner, avatar, role chip, contact grid, bio, social link, action
 * buttons), the four stat tiles, the three tabs and the project / component / toolpath
 * cards with their empty states are the legacy layout.
 *
 * Data comes from the v6 user group — `GET /api/user/profile`, `/projects`, `/components`,
 * `/toolpaths`, `/organizations` — the same endpoints the legacy page fetched. The legacy
 * page could also render *another* user's profile through `/api/users/:id/...`; v6 has no
 * such route (and `/profile/:username` is not one of the 66 fixed routes), so this screen
 * always renders the local profile, which is what `isOwnProfile` did in practice.
 *
 * Deviations: the legacy `profile.github` chip has no v6 field (the profile schema carries
 * website but not github) and project items carry no `thumbnail`, so project cards always
 * show the icon placeholder.
 *
 * Styling is the workstation vocabulary of the list pages (`ToolpathsScreen` and friends):
 * neutral translucent surfaces, one accent (blue), no gradients, no hover scaling.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Box, Calendar, Folder, Globe, Layout, Mail, MapPin, Pencil, Settings, Shield, User, Wrench } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { WorkspacePage } from "../../../shared/components/WorkspacePage.tsx"
import { LoadingState } from "../../../shared/components/screen-parts.tsx"

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

/** Card surface — the neutral translucent panel of the list pages. */
const CARD = "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:border-blue-500/40 dark:border-slate-700/50 dark:bg-slate-900/60"
const STAT_CARD = "flex items-center gap-3 rounded-lg border border-slate-200/60 bg-slate-50/70 p-3.5 dark:border-slate-700/40 dark:bg-slate-800/40"
const PRIMARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700"
const SECONDARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"

const formatMonth = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString("en-US", { year: "numeric", month: "long" })
}

const shortDate = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString()
}

const EmptyState = (props: { readonly icon: JSX.Element; readonly title: string; readonly description: string }): JSX.Element => (
  <div class="col-span-1 rounded-xl border border-slate-200/70 bg-white/80 p-10 text-center shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60 sm:col-span-2 lg:col-span-3">
    <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
      {props.icon}
    </div>
    <h3 class="mb-1 text-base font-medium text-slate-900 dark:text-white">{props.title}</h3>
    <p class="text-sm text-slate-500 dark:text-slate-400">{props.description}</p>
  </div>
)

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

  const notFound = (
    <div class="p-6 text-center">
      <h1 class="text-2xl font-bold text-slate-900 mb-4">{t("profile.notFoundTitle")}</h1>
      <p class="text-slate-600 mb-4">{t("profile.notFoundBody")}</p>
      <A href="/" class="text-blue-600 hover:text-blue-800">{t("profile.returnHome")}</A>
    </div>
  )

  const tabButton = (id: TabId, label: string, Icon: ItemIcon): JSX.Element => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      aria-pressed={activeTab() === id}
      class={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
        activeTab() === id
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
      }`}
    >
      <Icon class="h-4 w-4" />
      <span class="hidden sm:inline">{label}</span>
    </button>
  )

  const itemCard = (item: UserItem, href: string, Icon: ItemIcon, withDescription: boolean): JSX.Element => (
    <A href={href} class={CARD}>
      <div class="flex h-40 items-center justify-center border-b border-slate-200/60 bg-slate-50/70 dark:border-slate-700/40 dark:bg-slate-800/40">
        <Show
          when={typeof item.thumbnail === "string" && item.thumbnail.length > 0}
          fallback={
            <span class="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/60 bg-white text-slate-400 shadow-sm dark:border-slate-700/50 dark:bg-slate-800 dark:text-slate-500">
              <Icon size={26} />
            </span>
          }
        >
          <img src={item.thumbnail ?? ""} alt={item.name} class="h-full w-full object-cover" />
        </Show>
      </div>
      <div class="p-4">
        <h3 class="text-sm font-medium text-slate-900 transition-colors duration-150 ease-out group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
          {item.name}
        </h3>
        <Show when={withDescription}>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description ?? t("profile.noDescription")}</p>
        </Show>
        <p class="mt-2 text-xs text-slate-400 dark:text-slate-500">{t("profile.updated", { date: shortDate(item.updatedAt) })}</p>
      </div>
    </A>
  )

  return (
    <Show when={!isLoading()} fallback={<LoadingState label={t("common.loading")} />}>
      <Show when={profile.data() !== undefined} fallback={notFound}>
        <WorkspacePage title={profile.data()?.name || "Profile"}>
          <div class="max-w-7xl mx-auto">
            {/* Profile Header */}
            <div class="mb-6 overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
              <div class="h-28 border-b border-slate-200/70 bg-slate-100 dark:border-slate-700/50 dark:bg-slate-800/50" />

              <div class="px-6 pb-6">
                <div class="flex flex-col xl:flex-row xl:items-end xl:space-x-8 -mt-14">
                  <div class="relative">
                    <Show
                      when={typeof profile.data()?.image === "string" && (profile.data()?.image?.length ?? 0) > 0}
                      fallback={
                        <div class="relative flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white bg-blue-600 text-white shadow-sm dark:border-slate-900">
                          <User size={44} />
                        </div>
                      }
                    >
                      <img
                        src={profile.data()?.image ?? ""}
                        alt="Profile"
                        class="relative h-28 w-28 rounded-2xl border-4 border-white object-cover shadow-sm dark:border-slate-900"
                      />
                    </Show>
                    {/* Online status indicator */}
                    <div class="absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                  </div>

                  <div class="flex-1 mt-6 xl:mt-0 xl:pb-2">
                    <div class="flex flex-col xl:flex-row xl:justify-between xl:items-end space-y-6 xl:space-y-0 xl:gap-12">
                      <div class="space-y-4">
                        {/* Name and title */}
                        <div class="space-y-2">
                          <h1 class="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                            {profile.data()?.name ?? t("profile.userFallback")}
                          </h1>
                          <div class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 dark:border-slate-700/50 dark:bg-slate-800/50">
                            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span class="text-xs font-medium text-slate-600 dark:text-slate-300">{t("profile.role")}</span>
                          </div>
                        </div>

                        {/* Contact info */}
                        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                          <Show when={typeof profile.data()?.email === "string" && (profile.data()?.email?.length ?? 0) > 0}>
                            <div class="flex items-center gap-3">
                              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <Mail class="h-4 w-4" />
                              </span>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("profile.email")}</p>
                                <p class="truncate text-sm font-medium text-slate-900 dark:text-white">{profile.data()?.email}</p>
                              </div>
                            </div>
                          </Show>
                          <Show when={typeof profile.data()?.location === "string" && (profile.data()?.location?.length ?? 0) > 0}>
                            <div class="flex items-center gap-3">
                              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <MapPin class="h-4 w-4" />
                              </span>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("profile.location")}</p>
                                <p class="text-sm font-medium text-slate-900 dark:text-white">{profile.data()?.location}</p>
                              </div>
                            </div>
                          </Show>
                          <div class="flex items-center gap-3">
                            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <Calendar class="h-4 w-4" />
                            </span>
                            <div class="min-w-0 flex-1">
                              <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("profile.joined")}</p>
                              <p class="text-sm font-medium text-slate-900 dark:text-white">{formatMonth(profile.data()?.createdAt ?? "")}</p>
                            </div>
                          </div>
                        </div>

                        {/* Bio */}
                        <Show when={typeof profile.data()?.bio === "string" && (profile.data()?.bio?.length ?? 0) > 0}>
                          <div class="rounded-lg border border-slate-200/60 bg-slate-50/70 p-4 dark:border-slate-700/40 dark:bg-slate-800/30">
                            <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{profile.data()?.bio}</p>
                          </div>
                        </Show>

                        {/* Social links */}
                        <Show when={typeof profile.data()?.website === "string" && (profile.data()?.website?.length ?? 0) > 0}>
                          <div>
                            <a href={profile.data()?.website ?? ""} target="_blank" rel="noopener noreferrer" class={PRIMARY_BUTTON}>
                              <Globe class="h-4 w-4" />
                              {t("profile.website")}
                            </a>
                          </div>
                        </Show>
                      </div>

                      {/* Action buttons */}
                      <div class="flex flex-col space-y-2.5">
                        {/* Admin Dashboard Button - Only for admin users */}
                        <Show when={isAdmin()}>
                          <a href="/admin" class="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-red-700">
                            <Shield class="h-4 w-4" />
                            {t("profile.adminDashboard")}
                          </a>
                        </Show>

                        {/* Edit Profile Button */}
                        <A href="/profile/settings" class={PRIMARY_BUTTON}>
                          <Settings class="h-4 w-4" />
                          {t("profile.editProfile")}
                        </A>

                        {/* Share Profile Button */}
                        <button type="button" class={SECONDARY_BUTTON}>
                          <Pencil class="h-4 w-4" />
                          {t("profile.shareProfile")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div class="border-t border-slate-200/70 px-6 py-5 dark:border-slate-700/50">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div class={STAT_CARD}>
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <Folder class="h-4 w-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-xl font-semibold leading-6 tabular-nums text-slate-900 dark:text-white">{(projects.data() ?? []).length}</p>
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("shell.projects")}</p>
                    </div>
                  </div>

                  <div class={STAT_CARD}>
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <Box class="h-4 w-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-xl font-semibold leading-6 tabular-nums text-slate-900 dark:text-white">{(components.data() ?? []).length}</p>
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("shell.components")}</p>
                    </div>
                  </div>

                  <div class={STAT_CARD}>
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <Wrench class="h-4 w-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-xl font-semibold leading-6 tabular-nums text-slate-900 dark:text-white">{(toolpaths.data() ?? []).length}</p>
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("shell.toolpaths")}</p>
                    </div>
                  </div>

                  <div class={STAT_CARD}>
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <Layout class="h-4 w-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-xl font-semibold leading-6 tabular-nums text-slate-900 dark:text-white">{(organizations.data() ?? []).length}</p>
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("shell.organizations")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <div class="mb-6 rounded-xl border border-slate-200/70 bg-white/80 p-1 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
              <nav class="flex gap-1">
                {tabButton("projects", t("shell.projects"), Folder)}
                {tabButton("components", t("shell.components"), Box)}
                {tabButton("toolpaths", t("shell.toolpaths"), Wrench)}
              </nav>
            </div>

            {/* Tab Content */}
            <Show keyed when={activeTab()}>
              {(tab) => (
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Show when={tab === "projects"}>
                    <For each={projects.data() ?? []}>
                      {(project) => itemCard(project, `/projects/${project.id}`, Folder, false)}
                    </For>
                    <Show when={(projects.data() ?? []).length === 0}>
                      <EmptyState icon={<Folder size={22} />} title={t("profile.emptyProjects")} description={t("profile.emptyProjectsBody")} />
                    </Show>
                  </Show>

                  <Show when={tab === "components"}>
                    <For each={components.data() ?? []}>
                      {(component) => itemCard(component, `/components/${component.id}`, Box, true)}
                    </For>
                    <Show when={(components.data() ?? []).length === 0}>
                      <EmptyState icon={<Box size={22} />} title={t("profile.emptyComponents")} description={t("profile.emptyComponentsBody")} />
                    </Show>
                  </Show>

                  <Show when={tab === "toolpaths"}>
                    <For each={toolpaths.data() ?? []}>
                      {(toolpath) => itemCard(toolpath, `/toolpaths/${toolpath.id}`, Wrench, false)}
                    </For>
                    <Show when={(toolpaths.data() ?? []).length === 0}>
                      <EmptyState icon={<Wrench size={22} />} title={t("profile.emptyToolpaths")} description={t("profile.emptyToolpathsBody")} />
                    </Show>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </WorkspacePage>
      </Show>
    </Show>
  )
}
