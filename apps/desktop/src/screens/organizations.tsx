/**
 * Organizations screens — `/organizations`, `/organizations/create`, `/organizations/:id`.
 *
 * Ports of `.reference/src/pages/organizations/{index,create,[id]}.tsx`: the gradient
 * page with the create modal, the plain create form, and the tabbed detail page
 * (Overview / Chat / Members / Projects / Settings) with the invite modal.
 *
 * Three legacy calls have no v6 counterpart, so they keep their legacy *outcome*
 * instead of inventing data:
 *  - `GET …/organizations/:id/members` — the detail reply already carries `members`;
 *  - `GET …/organizations/:id/projects` — the Projects tab always renders the legacy
 *    empty state ("No projects");
 *  - `POST …/organizations/:id/invite` and the Danger-Zone delete button — no request
 *    is made, exactly like the legacy buttons that never registered a handler.
 *
 * `organizations.get` answers `OrganizationDetails`: flat members (`name`, `email`,
 * `image`, `role`, `joinedAt`) plus `projectCount` and the caller's `userRole`, which is
 * what the legacy page used to derive from the members list.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Effect } from "effect"
import { Motion, Presence } from "solid-motionone"
import { ArrowLeft, Building, Mail, Plus, Search, User, UserPlus, Users, X } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { ErrorState, LoadingState } from "./screen-parts.tsx"
import {
  CANCEL_BUTTON, FIELD, INPUT, LABEL, PANEL, RAIL_LABEL, StageEmpty, StageError, StageLoading, SUBMIT_BUTTON, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage
} from "../components/WorkspacePage.tsx"
import { Modal } from "../toolpaths/shared.tsx"
import { OrganizationCard } from "../components/organizations/organization-card.tsx"

/** framer's page easing, verbatim from the legacy `pageVariants`. */
const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1]
/** The spring (stiffness 300 / 400, damping 25 / 10) approximated with a tween. */
const CARD_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const HOVER_SHADOW = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"

/** Legacy shows `error.message || "An error occurred while creating the organization"`. */
const messageOr = (cause: unknown, fallback: string): string => {
  if (typeof cause === "object" && cause !== null) {
    const message = (cause as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) return message
  }
  return fallback
}

const formatDate = (dateString: string): string => {
  const parsed = Date.parse(dateString)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString()
}

const roleBadge = (role: "ADMIN" | "MANAGER" | "MEMBER"): string =>
  role === "ADMIN" ? "bg-red-100 text-red-800" : role === "MANAGER" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-800"

type DetailTab = "overview" | "chat" | "members" | "projects" | "settings"
type Role = "ADMIN" | "MANAGER" | "MEMBER"

const TAB_BASE = "whitespace-nowrap rounded-md px-3 py-2 font-medium text-sm"
const TAB_ACTIVE = "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
const TAB_IDLE = "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"

const LEGACY_CARD = "ui-card ui-card-default"
const LEGACY_INPUT =
  "block w-full rounded-md border border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"

/** `/organizations` — the list page with its create modal. */
export function OrganizationsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const orgs = useRead((c) => c.organizations.list())
  const [showModal, setShowModal] = createSignal(false)
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault()
    if (isSubmitting()) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      const created = await app.runtime.run(app.client.organizations.create({
        payload: { name: name().trim(), description: description() }
      }))
      setShowModal(false)
      setName("")
      setDescription("")
      navigate(`/organizations/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setError(messageOr(cause, t("org.modal.createFailed")))
    } finally {
      setIsSubmitting(false)
    }
  }

  const [search, setSearch] = createSignal("")
  const filtered = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return (orgs.data() ?? []).filter((org) => needle === "" || `${org.name} ${org.description ?? ""}`.toLowerCase().includes(needle))
  })
  const openCreate = (): void => { setError(undefined); setShowModal(true) }

  return (
    <WorkspacePage
      title={t("org.title")}
      actions={<button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}><Plus size={16} aria-hidden="true" />{t("org.new")}</button>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>Search</span>
          <div class="relative">
            <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" name="search" class={`${FIELD} pl-8`} placeholder="Search organizations..." value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
          </div>
        </label>
        <button type="button" class="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-gray-200" onClick={() => setSearch("")} disabled={search() === ""}><X size={14} aria-hidden="true" />Clear Filters</button>
        <p class="text-xs text-slate-500 dark:text-slate-400" role="status">{filtered().length} of {orgs.data()?.length ?? 0} organizations</p>
      </>}
      overlays={
        <Modal open={showModal()} title={t("org.modal.title")} onClose={() => { if (!isSubmitting()) setShowModal(false) }}>
          <p class="text-sm text-slate-500 dark:text-slate-400">{t("org.modal.body")}</p>
          {/* The legacy modal shows the list hook's `error`; a failed create lands here too. */}
          <Show when={error() ?? orgs.error()}><StageError message={String(error() ?? orgs.error())} /></Show>
          <form onSubmit={(event) => void submit(event)} class="space-y-4">
            <div>
              <label for="name" class={LABEL}>{t("org.modal.nameLabel")}</label>
              <input type="text" id="name" name="name" required value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder={t("org.modal.namePlaceholder")} class={INPUT} />
            </div>
            <div>
              <label for="description" class={LABEL}>{t("org.modal.descriptionLabel")}</label>
              <textarea id="description" name="description" rows={3} value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder={t("org.modal.descriptionPlaceholder")} class={INPUT} />
            </div>
            <div class="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button type="button" disabled={isSubmitting()} onClick={() => setShowModal(false)} class={CANCEL_BUTTON}>{t("org.modal.cancel")}</button>
              <button type="submit" disabled={isSubmitting()} class={SUBMIT_BUTTON}>{isSubmitting() ? t("org.modal.creating") : t("org.modal.submit")}</button>
            </div>
          </form>
        </Modal>
      }
    >
      <Show when={orgs.data() !== undefined || !orgs.loading()} fallback={<StageLoading label={t("common.loading")} />}>
        <Show when={orgs.error() === undefined} fallback={<StageError message={String(orgs.error())} onRetry={() => void orgs.refetch()} />}>
          <Show
            when={filtered().length > 0}
            fallback={
              <StageEmpty icon={<Building size={24} aria-hidden="true" />} title={search() !== "" ? "No organizations found" : t("org.empty.title")} hint={search() !== "" ? "No organizations match your search criteria." : t("org.empty.body")}>
                <Show when={search() !== ""} fallback={<button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}>{t("org.empty.cta")}</button>}>
                  <button type="button" class={TOOLBAR_BUTTON} onClick={() => setSearch("")}>Clear filters</button>
                </Show>
              </StageEmpty>
            }
          >
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <For each={filtered()}>{(org) => <OrganizationCard org={org} memberCount={org.userCount} projectCount={org.projectCount} />}</For>
            </div>
          </Show>
        </Show>
      </Show>
    </WorkspacePage>
  )
}

/** `/organizations/create` — the standalone create form. */
export function CreateOrganizationScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [isSubmitting, setIsSubmitting] = createSignal(false)

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault()
    if (isSubmitting()) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      const created = await app.runtime.run(app.client.organizations.create({
        payload: { name: name().trim(), description: description() }
      }))
      navigate(`/organizations/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setError(messageOr(cause, t("org.create.failed")))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <WorkspaceDetail title={t("org.modal.title")} subtitle={t("org.create.details")} backHref="/organizations" backLabel={t("common.back")}>
      <div class="mx-auto w-full max-w-3xl">
        <div class={PANEL}>
          <div class="mb-6 flex items-center gap-4">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"><Users class="h-6 w-6 text-blue-600 dark:text-blue-400" /></div>
            <div>
              <h2 class="text-lg font-medium text-slate-900 dark:text-white">{t("org.create.details")}</h2>
              <p class="text-sm text-slate-500 dark:text-slate-400">{t("org.create.lead")}</p>
            </div>
          </div>
          <Show when={error()}><div class="mb-4"><StageError message={error() ?? ""} /></div></Show>
          <form onSubmit={(event) => void submit(event)} class="space-y-5">
            <div>
              <label for="name" class={LABEL}>{t("org.modal.nameLabel")}</label>
              <input type="text" id="name" name="name" required value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder={t("org.modal.namePlaceholder")} class={INPUT} />
            </div>
            <div>
              <label for="description" class={LABEL}>{t("org.modal.descriptionLabel")}</label>
              <textarea id="description" name="description" rows={3} value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder={t("org.modal.descriptionPlaceholder")} class={INPUT} />
            </div>
            <div class="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button type="button" onClick={() => navigate(-1)} class={CANCEL_BUTTON}>{t("common.cancel")}</button>
              <button type="submit" disabled={isSubmitting()} class={SUBMIT_BUTTON}>{isSubmitting() ? t("org.modal.creating") : t("org.modal.submit")}</button>
            </div>
          </form>
        </div>
      </div>
    </WorkspaceDetail>
  )
}

/** `/organizations/:id` — header card, five tabs and the invite modal. */
export function OrganizationDetailScreen(): JSX.Element {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detail = useRead((c) => c.organizations.get({ params: { id: params.id } }))
  const [activeTab, setActiveTab] = createSignal<DetailTab>("overview")
  const [showInviteModal, setShowInviteModal] = createSignal(false)
  const [inviteEmail, setInviteEmail] = createSignal("")
  const [inviteRole, setInviteRole] = createSignal<Role>("MEMBER")

  /** Legacy `handleInviteMember`; no invite endpoint exists, so nothing is sent. */
  const submitInvite = (event: Event): void => {
    event.preventDefault()
  }

  const notFound = (
    <div class="p-6 text-center">
      <h1 class="mb-4 text-2xl font-bold text-slate-900 dark:text-white">{t("org.notFound.title")}</h1>
      <p class="mb-6 text-slate-600 dark:text-slate-400">{t("org.notFound.body")}</p>
      <button
        type="button"
        onClick={() => navigate("/profile")}
        class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {t("org.notFound.back")}
      </button>
    </div>
  )

  return (
    <Show
      when={detail.data() !== undefined || !detail.loading()}
      fallback={<LoadingState label={t("common.loading")} />}
    >
      <Show when={detail.data()} fallback={notFound}>
        {(org) => {
          const userRole = () => org().userRole
          const canManageMembers = () => userRole() === "ADMIN" || userRole() === "MANAGER"
          const canManageSettings = () => userRole() === "ADMIN"
          const newProjectHref = () => `/projects/create?organizationId=${encodeURIComponent(params.id)}`

          return (
            <WorkspaceDetail
              title={org().name}
              subtitle={`${t("org.detail.memberCount", { count: org().members.length })} · ${t("org.detail.projectCount", { count: org().projectCount })} · ${t("org.detail.created", { date: formatDate(org().createdAt) })}`}
              backHref="/organizations"
              backLabel={t("common.back")}
              actions={<>
                <button type="button" class={TOOLBAR_PRIMARY} onClick={() => navigate(newProjectHref())}><Plus size={16} aria-hidden="true" />{t("org.detail.newProject")}</button>
                <Show when={canManageMembers()}>
                  <button type="button" class={TOOLBAR_BUTTON} onClick={() => setShowInviteModal(true)}><UserPlus size={16} aria-hidden="true" />{t("org.detail.inviteMember")}</button>
                </Show>
              </>}
            >
              <Show when={(org().description ?? "").length > 0}>
                <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">{org().description}</p>
              </Show>

              {/* Tabs */}
              <div class="mb-6 border-b border-slate-200/60 dark:border-slate-700/50">
                <nav class="-mb-px flex space-x-4">
                  <button
                    type="button"
                    class={`${TAB_BASE} ${activeTab() === "overview" ? TAB_ACTIVE : TAB_IDLE}`}
                    onClick={() => setActiveTab("overview")}
                  >
                    {t("org.tab.overview")}
                  </button>
                  <button
                    type="button"
                    class={`${TAB_BASE} ${activeTab() === "chat" ? TAB_ACTIVE : TAB_IDLE}`}
                    onClick={() => navigate(`/organizations/${encodeURIComponent(params.id)}/chat`)}
                  >
                    {t("org.tab.chat")}
                  </button>
                  <button
                    type="button"
                    class={`${TAB_BASE} ${activeTab() === "members" ? TAB_ACTIVE : TAB_IDLE}`}
                    onClick={() => setActiveTab("members")}
                  >
                    {t("org.tab.members")}
                  </button>
                  <button
                    type="button"
                    class={`${TAB_BASE} ${activeTab() === "projects" ? TAB_ACTIVE : TAB_IDLE}`}
                    onClick={() => setActiveTab("projects")}
                  >
                    {t("org.tab.projects")}
                  </button>
                  <Show when={canManageSettings()}>
                    <button
                      type="button"
                      class={`${TAB_BASE} ${activeTab() === "settings" ? TAB_ACTIVE : TAB_IDLE}`}
                      onClick={() => setActiveTab("settings")}
                    >
                      {t("org.tab.settings")}
                    </button>
                  </Show>
                </nav>
              </div>

              {/* Tab content */}
              <div class={LEGACY_CARD}>
                <Show when={activeTab() === "overview"}>
                  <div class="p-6">
                    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h2 class="mb-4 text-lg font-medium text-slate-900 dark:text-blue-400">{t("org.overview.about")}</h2>
                        <p class="text-slate-600 dark:text-slate-400">
                          <Show
                            when={(org().description ?? "").length > 0}
                            fallback={t("org.overview.noDescription")}
                          >
                            {org().description}
                          </Show>
                        </p>

                        <h3 class="mb-2 mt-6 text-md font-medium text-slate-900 dark:text-blue-400">{t("org.overview.details")}</h3>
                        <div class="rounded-md bg-slate-50/70 p-4 backdrop-blur-sm dark:bg-slate-800/50">
                          <div class="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span class="block text-slate-500 dark:text-slate-400">{t("org.overview.created")}</span>
                              <span class="dark:text-slate-300">{formatDate(org().createdAt)}</span>
                            </div>
                            <div>
                              <span class="block text-slate-500 dark:text-slate-400">{t("org.overview.updated")}</span>
                              <span class="dark:text-slate-300">{formatDate(org().updatedAt)}</span>
                            </div>
                            <div>
                              <span class="block text-slate-500 dark:text-slate-400">{t("org.overview.members")}</span>
                              <span class="dark:text-slate-300">{org().members.length}</span>
                            </div>
                            <div>
                              <span class="block text-slate-500 dark:text-slate-400">{t("org.overview.projects")}</span>
                              <span class="dark:text-slate-300">{org().projectCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h2 class="mb-4 text-lg font-medium text-slate-900 dark:text-blue-400">{t("org.overview.activity")}</h2>
                        <div class="divide-y rounded-md border border-slate-200/60 dark:divide-slate-700/50 dark:border-slate-700/50">
                          <div class="p-4 text-center text-slate-500 dark:text-slate-400">
                            {t("org.overview.noActivity")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={activeTab() === "members"}>
                  <div>
                    <div class="flex items-center justify-between border-slate-200/60 p-6 dark:border-slate-700/50">
                      <h2 class="text-lg font-medium text-slate-900 dark:text-blue-400">{t("org.members.title")}</h2>
                      <Show when={canManageMembers()}>
                        <button
                          type="button"
                          onClick={() => setShowInviteModal(true)}
                          class="flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <UserPlus size={16} class="mr-1" />
                          {t("org.members.invite")}
                        </button>
                      </Show>
                    </div>
                    <div class="p-6">
                      <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-slate-200/70 dark:divide-slate-700/50">
                          <thead class="bg-slate-50/70 dark:bg-slate-800/40">
                            <tr>
                              <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t("org.members.member")}
                              </th>
                              <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t("org.members.role")}
                              </th>
                              <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t("org.members.joined")}
                              </th>
                              <Show when={canManageMembers()}>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  {t("org.members.actions")}
                                </th>
                              </Show>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-200/70 bg-white/60 dark:divide-slate-700/50 dark:bg-slate-900/30">
                            <For each={org().members}>
                              {(member) => (
                                <tr>
                                  <td class="whitespace-nowrap px-6 py-4">
                                    <div class="flex items-center">
                                      <div class="h-10 w-10 flex-shrink-0">
                                        <Show
                                          when={member.image !== null && member.image.length > 0}
                                          fallback={
                                            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600">
                                              <User class="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                            </div>
                                          }
                                        >
                                          <img
                                            class="h-10 w-10 rounded-full"
                                            src={member.image ?? ""}
                                            alt={member.name ?? t("org.members.avatarAlt")}
                                          />
                                        </Show>
                                      </div>
                                      <div class="ml-4">
                                        <div class="text-sm font-medium text-slate-900 dark:text-blue-400">
                                          {member.name ?? t("org.members.unnamed")}
                                        </div>
                                        <div class="text-sm text-slate-500 dark:text-slate-400">{member.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td class="whitespace-nowrap px-6 py-4">
                                    <span class={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 dark:text-slate-900 ${roleBadge(member.role)}`}>
                                      {member.role}
                                    </span>
                                  </td>
                                  <td class="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                    {formatDate(member.joinedAt)}
                                  </td>
                                  <Show when={canManageMembers()}>
                                    <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                      {/* Legacy renders these two buttons without handlers; v6 has no member endpoints either. */}
                                      <button type="button" class="mr-3 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                                        {t("org.members.edit")}
                                      </button>
                                      <button type="button" class="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">
                                        {t("org.members.remove")}
                                      </button>
                                    </td>
                                  </Show>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={activeTab() === "projects"}>
                  <div>
                    <div class="flex items-center justify-between border-b border-slate-200/60 p-6 dark:border-slate-700/50">
                      <h2 class="text-lg font-medium text-slate-900 dark:text-blue-400">{t("org.projects.title")}</h2>
                      <button
                        type="button"
                        onClick={() => navigate(newProjectHref())}
                        class="flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <Plus size={16} class="mr-1" />
                        {t("org.detail.newProject")}
                      </button>
                    </div>
                    <div class="p-6">
                      {/* No organization-projects endpoint: the legacy empty state, always. */}
                      <div class="py-12 text-center">
                        <svg
                          class="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M9 12h6m-6 4h6m-6-8h6M9 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-4m-7 9.5V4.7c0-1 .573-1.902 1.465-2.332A2.066 2.066 0 0111.535 2c.365 0 .72.13 1 .366.28.236.47.56.535.92L14 8"
                          />
                        </svg>
                        <h3 class="mt-2 text-sm font-medium text-slate-900 dark:text-blue-400">{t("org.projects.empty")}</h3>
                        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("org.projects.emptyBody")}</p>
                        <div class="mt-6">
                          <button
                            type="button"
                            onClick={() => navigate(newProjectHref())}
                            class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          >
                            {t("org.projects.create")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={activeTab() === "settings" && canManageSettings()}>
                  <div>
                    <div class="border-b border-slate-200 p-6 dark:border-slate-700">
                      <h2 class="text-lg font-medium text-slate-900 dark:text-blue-400">{t("org.settings.title")}</h2>
                      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("org.settings.body")}</p>
                    </div>
                    <div class="p-6">
                      {/* Legacy submits this form to nothing (no handler): it is inert here too. */}
                      <form class="space-y-6" onSubmit={(event) => event.preventDefault()}>
                        <div>
                          <label for="orgName" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t("org.settings.name")}
                          </label>
                          <input type="text" name="orgName" id="orgName" class={`mt-1 ${LEGACY_INPUT}`} value={org().name} readonly />
                        </div>

                        <div>
                          <label for="description" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t("org.settings.description")}
                          </label>
                          <textarea
                            id="description"
                            name="description"
                            rows={3}
                            class={`mt-1 ${LEGACY_INPUT}`}
                            value={org().description ?? ""}
                            readonly
                          />
                        </div>

                        <div>
                          <button
                            type="submit"
                            class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          >
                            {t("org.settings.save")}
                          </button>
                        </div>
                      </form>

                      <div class="mt-10 border-t border-slate-200 pt-10 dark:border-slate-700">
                        <h3 class="text-lg font-medium text-red-700 dark:text-red-500">{t("org.settings.danger")}</h3>
                        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("org.settings.dangerBody")}</p>
                        <div class="mt-3">
                          {/* Inert: legacy never wired a handler to this button. */}
                          <button
                            type="button"
                            class="inline-flex justify-center rounded-md border border-red-300 bg-white/60 px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-600 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-800/30"
                          >
                            {t("org.settings.delete")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Show>
              </div>

              {/* Invite Member Modal */}
              <Presence>
                <Show when={showInviteModal()}>
                  <div class="fixed inset-0 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="invite-member-title">
                    <div class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
                      <div
                        class="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity"
                        aria-hidden="true"
                        onClick={() => setShowInviteModal(false)}
                      />

                      <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">
                        &#8203;
                      </span>

                      <Motion.div
                        class="inline-block w-full max-w-lg overflow-hidden rounded-lg bg-white/60 text-left shadow-xl align-bottom sm:my-8 sm:align-middle dark:bg-slate-900"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2, easing: EASE } }}
                        transition={{ duration: 0.3, easing: CARD_EASE }}
                      >
                        <form onSubmit={submitInvite}>
                          <div class="bg-white/60 px-4 pb-4 pt-5 sm:p-6 sm:pb-4 dark:bg-slate-900">
                            <div class="sm:flex sm:items-start">
                              <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10 dark:bg-slate-800">
                                <Mail class="h-6 w-6 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div class="mt-3 w-full text-center sm:ml-4 sm:mt-0 sm:text-left">
                                <h3 id="invite-member-title" class="text-lg font-medium leading-6 text-slate-900 dark:text-blue-400">
                                  {t("org.invite.title")}
                                </h3>
                                <div class="mt-2">
                                  <p class="text-sm text-slate-500 dark:text-slate-400">{t("org.invite.body")}</p>
                                </div>

                                <div class="mt-4">
                                  <label for="email" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t("org.invite.email")}
                                  </label>
                                  <input
                                    type="email"
                                    name="email"
                                    id="email"
                                    required
                                    placeholder={t("org.invite.emailPlaceholder")}
                                    value={inviteEmail()}
                                    onInput={(event) => setInviteEmail(event.currentTarget.value)}
                                    class={`mt-1 ${LEGACY_INPUT}`}
                                  />
                                </div>

                                <div class="mt-4">
                                  <label for="role" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t("org.invite.role")}
                                  </label>
                                  <select
                                    id="role"
                                    name="role"
                                    value={inviteRole()}
                                    onChange={(event) => setInviteRole(event.currentTarget.value as Role)}
                                    class={`mt-1 block w-full appearance-none rounded-md py-2 pl-3 pr-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm dark:bg-slate-800 dark:text-white ${LEGACY_INPUT}`}
                                  >
                                    <option value="MEMBER">{t("org.invite.roleMember")}</option>
                                    <option value="MANAGER">{t("org.invite.roleManager")}</option>
                                    <Show when={userRole() === "ADMIN"}>
                                      <option value="ADMIN">{t("org.invite.roleAdmin")}</option>
                                    </Show>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse dark:bg-slate-900">
                            <button
                              type="submit"
                              class="w-full inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                            >
                              {t("org.invite.send")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowInviteModal(false)}
                              class="mt-3 inline-flex w-full justify-center rounded-md border border-slate-300 bg-white/60 px-4 py-2 text-base font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:ml-3 sm:mt-0 sm:w-auto sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-gray-600"
                            >
                              {t("org.modal.cancel")}
                            </button>
                          </div>
                        </form>
                      </Motion.div>
                    </div>
                  </div>
                </Show>
              </Presence>
            </WorkspaceDetail>
          )
        }}
      </Show>
    </Show>
  )
}
