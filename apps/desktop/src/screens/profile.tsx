/**
 * `/profile` — port of `.reference/src/pages/profile/index.tsx`.
 *
 * The gradient page, the glass profile header (banner, avatar, role chip, contact grid,
 * bio, social link, action buttons), the four stat tiles, the three animated tabs and the
 * project / component / toolpath cards with their empty states are the legacy markup.
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
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Box, Calendar, Folder, Globe, Layout, Mail, MapPin, Pencil, Settings, Shield, User, Wrench } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useRead } from "../app/queries.ts"
import { LoadingState } from "./screen-parts.tsx"

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

const CARD = "bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-xl transition-all border border-gray-200/50 dark:border-gray-700/50 overflow-hidden cursor-pointer group"
const STAT_CARD = "bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all group"

const formatMonth = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString("en-US", { year: "numeric", month: "long" })
}

const shortDate = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString()
}

const EmptyState = (props: { readonly icon: JSX.Element; readonly title: string; readonly description: string }): JSX.Element => (
  <Motion.div
    class="col-span-1 sm:col-span-2 lg:col-span-3 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-12 text-center"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3 }}
  >
    <div class="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500 hover:scale-110 transition-transform">
      {props.icon}
    </div>
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">{props.title}</h3>
    <p class="text-gray-600 dark:text-gray-400">{props.description}</p>
  </Motion.div>
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
      <h1 class="text-2xl font-bold text-gray-900 mb-4">{t("profile.notFoundTitle")}</h1>
      <p class="text-gray-600 mb-4">{t("profile.notFoundBody")}</p>
      <A href="/" class="text-blue-600 hover:text-blue-800">{t("profile.returnHome")}</A>
    </div>
  )

  const tabButton = (id: TabId, label: string, Icon: ItemIcon): JSX.Element => (
    <Motion.button
      type="button"
      onClick={() => setActiveTab(id)}
      class={`flex-1 px-6 py-4 text-sm font-semibold rounded-2xl transition-all relative flex items-center justify-center space-x-2 ${
        activeTab() === id
          ? "text-white shadow-xl"
          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50/50 dark:hover:bg-gray-700/30"
      }`}
      hover={{ scale: 1.02, y: -1 }}
      press={{ scale: 0.98 }}
    >
      <Show when={activeTab() === id}>
        <span class="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl shadow-lg" />
      </Show>
      <span class="relative flex items-center space-x-2">
        <Icon class="h-4 w-4" />
        <span class="hidden sm:inline">{label}</span>
      </span>
    </Motion.button>
  )

  const itemCard = (
    item: UserItem,
    href: string,
    thumbGradient: string,
    Icon: ItemIcon,
    iconClass: string,
    hoverClass: string,
    metaClass: string,
    withDescription: boolean
  ): JSX.Element => (
    <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} hover={{ y: -8, scale: 1.02 }}>
      <A href={href} class="block">
        <div class={CARD}>
          <div class={`h-48 ${thumbGradient} flex items-center justify-center`}>
            <Show
              when={typeof item.thumbnail === "string" && item.thumbnail.length > 0}
              fallback={
                <div class="p-6 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm hover:scale-110 transition-transform">
                  <Icon size={48} class={iconClass} />
                </div>
              }
            >
              <img src={item.thumbnail ?? ""} alt={item.name} class="h-full w-full object-cover" />
            </Show>
          </div>
          <div class="p-6">
            <h3 class={`text-lg font-semibold text-gray-900 dark:text-white ${hoverClass} transition-colors`}>{item.name}</h3>
            <Show when={withDescription}>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.description ?? t("profile.noDescription")}</p>
            </Show>
            <p class={metaClass}>{t("profile.updated", { date: shortDate(item.updatedAt) })}</p>
          </div>
        </div>
      </A>
    </Motion.div>
  )

  return (
    <Show when={!isLoading()} fallback={<LoadingState label={t("common.loading")} />}>
      <Show when={profile.data() !== undefined} fallback={notFound}>
        <Motion.div
          class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div class="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Profile Header */}
            <Motion.div
              class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white/20 dark:border-gray-700/20 mb-8 overflow-hidden relative"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4 }}
              hover={{ y: -8, scale: 1.02 }}
            >
              {/* Enhanced Background Pattern */}
              <div class="relative h-40 bg-gradient-to-br from-blue-500/30 via-purple-500/25 via-pink-500/20 to-indigo-500/30 dark:from-blue-600/40 dark:via-purple-600/35 dark:via-pink-600/25 dark:to-indigo-600/40">
                <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10 dark:from-blue-600/20 dark:to-purple-600/20" />
                <div class="absolute top-0 left-0 w-full h-full">
                  <div class="absolute top-8 left-8 w-20 h-20 bg-white/10 dark:bg-white/5 rounded-full blur-xl" />
                  <div class="absolute top-12 right-12 w-16 h-16 bg-purple-400/20 dark:bg-purple-400/10 rounded-full blur-lg" />
                  <div class="absolute bottom-8 left-20 w-12 h-12 bg-blue-400/20 dark:bg-blue-400/10 rounded-full blur-md" />
                </div>
                {/* Geometric pattern overlay */}
                <div class="absolute inset-0 opacity-10 dark:opacity-5">
                  <svg class="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" stroke-width="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#grid)" />
                  </svg>
                </div>
              </div>

              <div class="relative px-8 pb-8">
                {/* Enhanced Profile Avatar */}
                <div class="flex flex-col xl:flex-row xl:items-end xl:space-x-8 -mt-20">
                  <Motion.div class="relative group" hover={{ scale: 1.05 }} transition={{ duration: 0.3 }}>
                    <div class="absolute -inset-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition-opacity" />
                    <Show
                      when={typeof profile.data()?.image === "string" && (profile.data()?.image?.length ?? 0) > 0}
                      fallback={
                        <div class="relative h-40 w-40 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center border-6 border-white dark:border-gray-800 shadow-2xl">
                          <User size={64} class="text-white" />
                        </div>
                      }
                    >
                      <img
                        src={profile.data()?.image ?? ""}
                        alt="Profile"
                        class="relative h-40 w-40 rounded-3xl object-cover border-6 border-white dark:border-gray-800 shadow-2xl"
                      />
                    </Show>
                    {/* Online status indicator */}
                    <div class="absolute bottom-2 right-2 w-6 h-6 bg-green-500 border-3 border-white dark:border-gray-800 rounded-full shadow-lg" />
                  </Motion.div>

                  <div class="flex-1 mt-6 xl:mt-0 xl:pb-6">
                    <div class="flex flex-col xl:flex-row xl:justify-between xl:items-end space-y-6 xl:space-y-0 xl:gap-12">
                      <div class="space-y-4">
                        {/* Enhanced Name and Title */}
                        <div class="space-y-2">
                          <Motion.h1
                            class="text-3xl xl:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                          >
                            {profile.data()?.name ?? t("profile.userFallback")}
                          </Motion.h1>
                          <Motion.div
                            class="inline-flex items-center px-3 py-1 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full border border-blue-200/50 dark:border-blue-700/50"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25, duration: 0.5 }}
                          >
                            <div class="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mr-2" />
                            <span class="text-sm font-medium text-blue-700 dark:text-blue-300">{t("profile.role")}</span>
                          </Motion.div>
                        </div>

                        {/* Enhanced Contact Info */}
                        <Motion.div
                          class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                        >
                          <Show when={typeof profile.data()?.email === "string" && (profile.data()?.email?.length ?? 0) > 0}>
                            <div class="flex items-center group">
                              <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                                <Mail class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("profile.email")}</p>
                                <p class="text-gray-900 dark:text-white font-medium truncate">{profile.data()?.email}</p>
                              </div>
                            </div>
                          </Show>
                          <Show when={typeof profile.data()?.location === "string" && (profile.data()?.location?.length ?? 0) > 0}>
                            <div class="flex items-center group">
                              <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                                <MapPin class="h-4 w-4 text-green-600 dark:text-green-400" />
                              </div>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("profile.location")}</p>
                                <p class="text-gray-900 dark:text-white font-medium">{profile.data()?.location}</p>
                              </div>
                            </div>
                          </Show>
                          <div class="flex items-center group">
                            <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg mr-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                              <Calendar class="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div class="min-w-0 flex-1">
                              <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("profile.joined")}</p>
                              <p class="text-gray-900 dark:text-white font-medium">{formatMonth(profile.data()?.createdAt ?? "")}</p>
                            </div>
                          </div>
                        </Motion.div>

                        {/* Enhanced Bio */}
                        <Show when={typeof profile.data()?.bio === "string" && (profile.data()?.bio?.length ?? 0) > 0}>
                          <Motion.div
                            class="bg-gray-50/50 dark:bg-gray-700/20 rounded-2xl p-4 border border-gray-200/50 dark:border-gray-600/30"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                          >
                            <p class="text-gray-700 dark:text-gray-300 leading-relaxed">{profile.data()?.bio}</p>
                          </Motion.div>
                        </Show>

                        {/* Enhanced Social Links */}
                        <Motion.div
                          class="flex flex-wrap gap-3"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                        >
                          <Show when={typeof profile.data()?.website === "string" && (profile.data()?.website?.length ?? 0) > 0}>
                            <a href={profile.data()?.website ?? ""} target="_blank" rel="noopener noreferrer">
                              <Motion.div
                                class="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
                                hover={{ scale: 1.05, y: -2 }}
                                press={{ scale: 0.95 }}
                              >
                                <Globe class="w-4 h-4 mr-2" />
                                {t("profile.website")}
                              </Motion.div>
                            </a>
                          </Show>
                        </Motion.div>
                      </div>

                      {/* Enhanced Action Buttons */}
                      <Motion.div
                        class="flex flex-col space-y-3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                      >
                        {/* Admin Dashboard Button - Only for admin users */}
                        <Show when={isAdmin()}>
                          <a href="/admin">
                            <Motion.button
                              type="button"
                              class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-600 via-pink-600 to-purple-600 text-white rounded-2xl hover:from-red-700 hover:via-pink-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all font-medium"
                              hover={{ scale: 1.05, y: -2 }}
                              press={{ scale: 0.95 }}
                            >
                              <Shield class="mr-2 h-5 w-5" />
                              {t("profile.adminDashboard")}
                            </Motion.button>
                          </a>
                        </Show>

                        {/* Edit Profile Button */}
                        <A href="/profile/settings" class="inline-block">
                          <Motion.button
                            type="button"
                            class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white rounded-2xl hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all font-medium"
                            hover={{ scale: 1.05, y: -2 }}
                            press={{ scale: 0.95 }}
                          >
                            <Settings class="mr-2 h-5 w-5" />
                            {t("profile.editProfile")}
                          </Motion.button>
                        </A>

                        {/* Share Profile Button */}
                        <Motion.button
                          type="button"
                          class="inline-flex items-center px-6 py-2.5 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 rounded-xl hover:bg-white dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-md hover:shadow-lg transition-all text-sm font-medium"
                          hover={{ scale: 1.02, y: -1 }}
                          press={{ scale: 0.98 }}
                        >
                          <Pencil class="mr-2 h-4 w-4" />
                          {t("profile.shareProfile")}
                        </Motion.button>
                      </Motion.div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Stats Section */}
              <div class="bg-gradient-to-r from-gray-50/80 via-white/50 to-gray-50/80 dark:from-gray-700/40 dark:via-gray-800/30 dark:to-gray-700/40 border-t border-gray-200/30 dark:border-gray-600/30 backdrop-blur-sm">
                <div class="px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <Motion.div class={STAT_CARD} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} hover={{ scale: 1.02, y: -2 }}>
                    <div class="flex items-center space-x-3">
                      <div class="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg group-hover:shadow-blue-500/25 transition-shadow">
                        <Folder class="h-5 w-5 text-white" />
                      </div>
                      <div class="flex-1">
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{(projects.data() ?? []).length}</p>
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{t("shell.projects")}</p>
                      </div>
                    </div>
                  </Motion.div>

                  <Motion.div class={STAT_CARD} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.3 }} hover={{ scale: 1.02, y: -2 }}>
                    <div class="flex items-center space-x-3">
                      <div class="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg group-hover:shadow-purple-500/25 transition-shadow">
                        <Box class="h-5 w-5 text-white" />
                      </div>
                      <div class="flex-1">
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{(components.data() ?? []).length}</p>
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{t("shell.components")}</p>
                      </div>
                    </div>
                  </Motion.div>

                  <Motion.div class={STAT_CARD} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.3 }} hover={{ scale: 1.02, y: -2 }}>
                    <div class="flex items-center space-x-3">
                      <div class="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg group-hover:shadow-green-500/25 transition-shadow">
                        <Wrench class="h-5 w-5 text-white" />
                      </div>
                      <div class="flex-1">
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{(toolpaths.data() ?? []).length}</p>
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{t("shell.toolpaths")}</p>
                      </div>
                    </div>
                  </Motion.div>

                  <Motion.div class={STAT_CARD} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.3 }} hover={{ scale: 1.02, y: -2 }}>
                    <div class="flex items-center space-x-3">
                      <div class="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg group-hover:shadow-orange-500/25 transition-shadow">
                        <Layout class="h-5 w-5 text-white" />
                      </div>
                      <div class="flex-1">
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{(organizations.data() ?? []).length}</p>
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{t("shell.organizations")}</p>
                      </div>
                    </div>
                  </Motion.div>
                </div>
              </div>
            </Motion.div>

            {/* Enhanced Tabs Section */}
            <Motion.div class="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-gray-700/20 p-2 shadow-lg">
                <nav class="flex space-x-2">
                  {tabButton("projects", t("shell.projects"), Folder)}
                  {tabButton("components", t("shell.components"), Box)}
                  {tabButton("toolpaths", t("shell.toolpaths"), Wrench)}
                </nav>
              </div>
            </Motion.div>

            {/* Tab Content */}
            <Show keyed when={activeTab()}>
              {(tab) => (
                <Motion.div
                  class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25 }}
                >
                  <Show when={tab === "projects"}>
                    <For each={projects.data() ?? []}>
                      {(project) =>
                        itemCard(
                          project,
                          `/projects/${project.id}`,
                          "bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30",
                          Folder,
                          "text-blue-600 dark:text-blue-400",
                          "group-hover:text-blue-600 dark:group-hover:text-blue-400",
                          "text-sm text-gray-500 dark:text-gray-400 mt-2",
                          false
                        )
                      }
                    </For>
                    <Show when={(projects.data() ?? []).length === 0}>
                      <EmptyState icon={<Folder size={48} />} title={t("profile.emptyProjects")} description={t("profile.emptyProjectsBody")} />
                    </Show>
                  </Show>

                  <Show when={tab === "components"}>
                    <For each={components.data() ?? []}>
                      {(component) =>
                        itemCard(
                          component,
                          `/components/${component.id}`,
                          "bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-600/30 dark:to-pink-600/30",
                          Box,
                          "text-purple-600 dark:text-purple-400",
                          "group-hover:text-purple-600 dark:group-hover:text-purple-400",
                          "text-xs text-gray-400 dark:text-gray-500 mt-2",
                          true
                        )
                      }
                    </For>
                    <Show when={(components.data() ?? []).length === 0}>
                      <EmptyState icon={<Box size={48} />} title={t("profile.emptyComponents")} description={t("profile.emptyComponentsBody")} />
                    </Show>
                  </Show>

                  <Show when={tab === "toolpaths"}>
                    <For each={toolpaths.data() ?? []}>
                      {(toolpath) =>
                        itemCard(
                          toolpath,
                          `/toolpaths/${toolpath.id}`,
                          "bg-gradient-to-br from-green-500/20 to-blue-500/20 dark:from-green-600/30 dark:to-blue-600/30",
                          Wrench,
                          "text-green-600 dark:text-green-400",
                          "group-hover:text-green-600 dark:group-hover:text-green-400",
                          "text-sm text-gray-500 dark:text-gray-400 mt-2",
                          false
                        )
                      }
                    </For>
                    <Show when={(toolpaths.data() ?? []).length === 0}>
                      <EmptyState icon={<Wrench size={48} />} title={t("profile.emptyToolpaths")} description={t("profile.emptyToolpathsBody")} />
                    </Show>
                  </Show>
                </Motion.div>
              )}
            </Show>
          </div>
        </Motion.div>
      </Show>
    </Show>
  )
}
