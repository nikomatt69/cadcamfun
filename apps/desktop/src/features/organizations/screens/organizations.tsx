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
import { Building, FolderOpen, Plus, Search, User, UserPlus, Users, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import {
  BADGE, CANCEL_BUTTON, DANGER_BUTTON, FIELD, INPUT, LABEL, PANEL, RAIL_LABEL, StageEmpty, StageError, StageLoading,
  SUBMIT_BUTTON, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage, WorkspaceTabs, type WorkspaceTabItem
} from "../../../shared/components/WorkspacePage.tsx"
import { DataTable, KeyValueList } from "../../../shared/components/enterprise.tsx"
import { Modal } from "../../toolpaths/components/shared.tsx"
import { OrganizationCard } from "../components/organization-card.tsx"

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
  role === "ADMIN" ? `${BADGE} workspace-badge--warn` : role === "MANAGER" ? `${BADGE} workspace-badge--accent` : BADGE

type DetailTab = "overview" | "chat" | "members" | "projects" | "settings"
type Role = "ADMIN" | "MANAGER" | "MEMBER"

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

/** `/organizations/:id` — the organization overview, members, projects and settings. */
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

  return (
    <WorkspaceDetail
      title={detail.data()?.name ?? t("org.title")}
      subtitle={detail.data() === undefined ? undefined : `${t("org.detail.memberCount", { count: detail.data()!.members.length })} · ${t("org.detail.projectCount", { count: detail.data()!.projectCount })} · ${t("org.detail.created", { date: formatDate(detail.data()!.createdAt) })}`}
      backHref="/organizations"
      backLabel={t("common.back")}
      actions={
        <Show when={detail.data()}>
          {(org) => <>
            <button type="button" class={TOOLBAR_PRIMARY} onClick={() => navigate(`/projects/create?organizationId=${encodeURIComponent(params.id)}`)}><Plus size={14} aria-hidden="true" />{t("org.detail.newProject")}</button>
            <Show when={org().userRole === "ADMIN" || org().userRole === "MANAGER"}>
              <button type="button" class={TOOLBAR_BUTTON} onClick={() => setShowInviteModal(true)}><UserPlus size={14} aria-hidden="true" />{t("org.detail.inviteMember")}</button>
            </Show>
          </>}
        </Show>
      }
    >
      <Show when={detail.data() !== undefined || !detail.loading()} fallback={<StageLoading label={t("common.loading")} />}>
        <Show when={detail.data()} fallback={
          <StageEmpty icon={<Building size={22} aria-hidden="true" />} title={t("org.notFound.title")} hint={t("org.notFound.body")}>
            <A href="/profile" class={TOOLBAR_BUTTON}>{t("org.notFound.back")}</A>
          </StageEmpty>
        }>
          {(org) => {
            const userRole = () => org().userRole
            const canManageMembers = () => userRole() === "ADMIN" || userRole() === "MANAGER"
            const canManageSettings = () => userRole() === "ADMIN"
            const newProjectHref = () => `/projects/create?organizationId=${encodeURIComponent(params.id)}`
            const tabs = (): ReadonlyArray<WorkspaceTabItem<DetailTab>> => [
              { id: "overview", label: t("org.tab.overview") },
              { id: "chat", label: t("org.tab.chat") },
              { id: "members", label: t("org.tab.members") },
              { id: "projects", label: t("org.tab.projects") },
              ...(canManageSettings() ? [{ id: "settings" as const, label: t("org.tab.settings") }] : [])
            ]
            const selectTab = (id: DetailTab): void => {
              if (id === "chat") { navigate(`/organizations/${encodeURIComponent(params.id)}/chat`); return }
              setActiveTab(id)
            }

            return <>
              <Show when={(org().description ?? "").length > 0}>
                <p class="mb-3 text-xs text-slate-500 dark:text-slate-400">{org().description}</p>
              </Show>

              <WorkspaceTabs class="mb-3" tabs={tabs()} value={activeTab()} onChange={selectTab} label={t("org.tab.overview")} />

              <Show when={activeTab() === "overview"}>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <section class={`${PANEL} !p-3`}>
                    <h2 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">{t("org.overview.about")}</h2>
                    <p class="text-xs leading-5 text-slate-600 dark:text-slate-400">
                      <Show when={(org().description ?? "").length > 0} fallback={t("org.overview.noDescription")}>{org().description}</Show>
                    </p>
                    <h3 class="mb-1.5 mt-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{t("org.overview.details")}</h3>
                    <KeyValueList rows={[
                      { label: t("org.overview.created"), value: formatDate(org().createdAt) },
                      { label: t("org.overview.updated"), value: formatDate(org().updatedAt) },
                      { label: t("org.overview.members"), value: String(org().members.length) },
                      { label: t("org.overview.projects"), value: String(org().projectCount) }
                    ]} />
                  </section>

                  <section class={`${PANEL} !p-3`}>
                    <h2 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">{t("org.overview.activity")}</h2>
                    <div class="workspace-empty !mt-0 !max-w-none !py-6">
                      <div class="workspace-empty__icon"><Users size={20} aria-hidden="true" /></div>
                      <p class="text-xs text-slate-500 dark:text-slate-400">{t("org.overview.noActivity")}</p>
                    </div>
                  </section>
                </div>
              </Show>

              <Show when={activeTab() === "members"}>
                <section class={`${PANEL} !p-3`}>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">{t("org.members.title")}</h2>
                    <Show when={canManageMembers()}>
                      <button type="button" class={TOOLBAR_BUTTON} onClick={() => setShowInviteModal(true)}><UserPlus size={14} aria-hidden="true" />{t("org.members.invite")}</button>
                    </Show>
                  </div>
                  <DataTable>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t("org.members.member")}</th>
                          <th scope="col">{t("org.members.role")}</th>
                          <th scope="col">{t("org.members.joined")}</th>
                          <Show when={canManageMembers()}><th scope="col" class="!text-right">{t("org.members.actions")}</th></Show>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={org().members}>
                          {(member) => <tr>
                            <td>
                              <div class="flex items-center gap-2">
                                <Show
                                  when={member.image !== null && member.image.length > 0}
                                  fallback={<div class="flex h-7 w-7 flex-none items-center justify-center rounded-[4px] border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800"><User size={15} aria-hidden="true" /></div>}
                                >
                                  <img class="h-7 w-7 flex-none rounded-[4px] object-cover" src={member.image ?? ""} alt={member.name ?? t("org.members.avatarAlt")} />
                                </Show>
                                <div class="min-w-0">
                                  <div class="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{member.name ?? t("org.members.unnamed")}</div>
                                  <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">{member.email}</div>
                                </div>
                              </div>
                            </td>
                            <td class="whitespace-nowrap"><span class={roleBadge(member.role)}>{member.role}</span></td>
                            <td class="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">{formatDate(member.joinedAt)}</td>
                            <Show when={canManageMembers()}>
                              <td class="whitespace-nowrap !text-right">
                                {/* Legacy renders these two buttons without handlers; v6 has no member endpoints either. */}
                                <button type="button" class="mr-3 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">{t("org.members.edit")}</button>
                                <button type="button" class="text-[11px] font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">{t("org.members.remove")}</button>
                              </td>
                            </Show>
                          </tr>}
                        </For>
                      </tbody>
                    </table>
                  </DataTable>
                </section>
              </Show>

              <Show when={activeTab() === "projects"}>
                <section class={`${PANEL} !p-3`}>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">{t("org.projects.title")}</h2>
                    <button type="button" class={TOOLBAR_BUTTON} onClick={() => navigate(newProjectHref())}><Plus size={14} aria-hidden="true" />{t("org.detail.newProject")}</button>
                  </div>
                  {/* No organization-projects endpoint: the legacy empty state, always. */}
                  <StageEmpty icon={<FolderOpen size={22} aria-hidden="true" />} title={t("org.projects.empty")} hint={t("org.projects.emptyBody")}>
                    <button type="button" class={TOOLBAR_PRIMARY} onClick={() => navigate(newProjectHref())}>{t("org.projects.create")}</button>
                  </StageEmpty>
                </section>
              </Show>

              <Show when={activeTab() === "settings" && canManageSettings()}>
                <section class={`${PANEL} !p-3`}>
                  <div class="mb-3">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">{t("org.settings.title")}</h2>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("org.settings.body")}</p>
                  </div>
                  {/* Legacy submits this form to nothing (no handler): it is inert here too. */}
                  <form class="space-y-3" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label for="orgName" class={LABEL}>{t("org.settings.name")}</label>
                      <input type="text" name="orgName" id="orgName" class={INPUT} value={org().name} readonly />
                    </div>
                    <div>
                      <label for="description" class={LABEL}>{t("org.settings.description")}</label>
                      <textarea id="description" name="description" rows={3} class={INPUT} value={org().description ?? ""} readonly />
                    </div>
                    <button type="submit" class={SUBMIT_BUTTON}>{t("org.settings.save")}</button>
                  </form>

                  <div class="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <h3 class="text-xs font-semibold text-red-600 dark:text-red-400">{t("org.settings.danger")}</h3>
                    <p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t("org.settings.dangerBody")}</p>
                    {/* Inert: legacy never wired a handler to this button. */}
                    <button type="button" class={`${CANCEL_BUTTON} mt-2 !text-red-600 dark:!text-red-400`}>{t("org.settings.delete")}</button>
                  </div>
                </section>
              </Show>

              <Modal open={showInviteModal()} title={t("org.invite.title")} onClose={() => setShowInviteModal(false)}>
                <p class="text-xs text-slate-500 dark:text-slate-400">{t("org.invite.body")}</p>
                <form onSubmit={submitInvite} class="space-y-3">
                  <div>
                    <label for="email" class={LABEL}>{t("org.invite.email")}</label>
                    <input type="email" name="email" id="email" required placeholder={t("org.invite.emailPlaceholder")} value={inviteEmail()} onInput={(event) => setInviteEmail(event.currentTarget.value)} class={INPUT} />
                  </div>
                  <div>
                    <label for="role" class={LABEL}>{t("org.invite.role")}</label>
                    <select id="role" name="role" value={inviteRole()} onChange={(event) => setInviteRole(event.currentTarget.value as Role)} class={INPUT}>
                      <option value="MEMBER">{t("org.invite.roleMember")}</option>
                      <option value="MANAGER">{t("org.invite.roleManager")}</option>
                      <Show when={userRole() === "ADMIN"}><option value="ADMIN">{t("org.invite.roleAdmin")}</option></Show>
                    </select>
                  </div>
                  <div class="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <button type="button" onClick={() => setShowInviteModal(false)} class={CANCEL_BUTTON}>{t("org.modal.cancel")}</button>
                    <button type="submit" class={SUBMIT_BUTTON}>{t("org.invite.send")}</button>
                  </div>
                </form>
              </Modal>
            </>
          }}
        </Show>
      </Show>
    </WorkspaceDetail>
  )
}
