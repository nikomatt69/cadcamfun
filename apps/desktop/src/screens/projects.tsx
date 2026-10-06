/**
 * Projects screen (spec 06-desktop-ui.md §1: list/create/open/rename/delete, recent).
 *
 * Reads go through `useQuery` (endpoint + params keyed), writes through `useMutation`,
 * and Open records the project in the recents list — which is what the "Recent" panel and
 * the shell's tray menu read.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import FolderOpen from "lucide-solid/icons/folder-open"
import Pencil from "lucide-solid/icons/pencil"
import Plus from "lucide-solid/icons/plus"
import Trash2 from "lucide-solid/icons/trash-2"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { invalidatePrefix } from "../state/query-cache.ts"
import { useMutation, useQuery } from "../app/screen-queries.ts"
import { formatRecent } from "../state/recents.ts"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenHeader,
  Toast,
  formatDate
} from "./screen-parts.tsx"

const ENDPOINT = "projects"

interface ProjectRow {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
  readonly _count: { readonly drawings: number; readonly components: number }
}

export function ProjectsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = createSignal<string | undefined>(undefined)
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [notice, setNotice] = createSignal<string | undefined>(undefined)
  const [deleting, setDeleting] = createSignal<ProjectRow | undefined>(undefined)

  const runtime = { run: app.runtime.run, cache: app.cache }

  const projects = useQuery<ReadonlyArray<ProjectRow>>(
    ENDPOINT,
    undefined,
    (client) => client.projects.list(),
    runtime,
    { cache: app.cache }
  )

  const create = useMutation(
    (client, projectName: string, projectDescription: string) =>
      client.projects.create({
        payload: { name: projectName, description: projectDescription === "" ? null : projectDescription }
      }),
    runtime,
    [ENDPOINT],
    app.cache
  )
  const rename = useMutation(
    (client, id: string, projectName: string) =>
      client.projects.update({ params: { id }, payload: { name: projectName } }),
    runtime,
    [ENDPOINT],
    app.cache
  )
  const remove = useMutation(
    (client, id: string) => client.projects.remove({ params: { id } }),
    runtime,
    [ENDPOINT],
    app.cache
  )

  const rows = (): ReadonlyArray<ProjectRow> => projects.data() ?? []
  const refresh = (): void => {
    invalidatePrefix(app.cache, ENDPOINT)
    projects.refetch()
  }

  const open = (row: ProjectRow): void => {
    app.rememberProject(row.id, row.name)
    app.setActivity("cad")
    navigate(`/projects/${row.id}`)
  }

  const submitCreate = async (event: Event): Promise<void> => {
    event.preventDefault()
    const created = await create.mutate(name().trim(), description())
    refresh()
    setName("")
    setDescription("")
    setNotice(t("projects.created"))
    app.rememberProject(created.id, created.name)
  }

  const submitRename = async (event: Event): Promise<void> => {
    event.preventDefault()
    const id = editing()
    if (id === undefined) return
    await rename.mutate(id, name().trim())
    refresh()
    setEditing(undefined)
    setNotice(t("projects.renamed"))
  }

  const confirmDelete = async (): Promise<void> => {
    const row = deleting()
    if (row === undefined) return
    await remove.mutate(row.id)
    refresh()
    app.forgetProject(row.id)
    setDeleting(undefined)
    setNotice(t("projects.deleted"))
  }

  return (
    <div>
      <ScreenHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={
          <button type="button" class="btn btn-primary" onClick={() => setName("")}>
            <Plus size={16} aria-hidden="true" />
            {t("projects.create")}
          </button>
        }
      />

      <div class="grid gap-6 p-6 lg:grid-cols-[2fr_1fr]">
        <section aria-label={t("projects.title")}>
          <Show when={projects.state()._tag === "loading"}>
            <LoadingState label={t("projects.loading")} />
          </Show>
          <Show when={projects.state()._tag === "error"}>
            <ErrorState label={t("projects.error")} />
          </Show>
          <Show when={projects.state()._tag === "success"}>
            <Show when={rows().length > 0} fallback={<EmptyState label={t("projects.empty")} />}>
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">{t("projects.column.name")}</th>
                    <th scope="col">{t("projects.column.updated")}</th>
                    <th scope="col">{t("projects.column.drawings")}</th>
                    <th scope="col">{t("projects.column.components")}</th>
                    <th scope="col"><span class="sr-only">{t("projects.open")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  <For each={rows()}>
                    {(row) => (
                      <tr>
                        <th scope="row" class="font-medium">{row.name}</th>
                        <td>{formatDate(row.updatedAt)}</td>
                        <td>{row._count.drawings}</td>
                        <td>{row._count.components}</td>
                        <td>
                          <div class="flex justify-end gap-1">
                            <button
                              type="button"
                              class="btn btn-sm btn-outline-primary"
                              aria-label={`${t("projects.open")}: ${row.name}`}
                              onClick={() => open(row)}
                            >
                              <FolderOpen size={14} aria-hidden="true" />
                              {t("projects.open")}
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm btn-outline"
                              aria-label={`${t("projects.rename")}: ${row.name}`}
                              onClick={() => {
                                setEditing(row.id)
                                setName(row.name)
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm btn-danger"
                              aria-label={`${t("projects.delete")}: ${row.name}`}
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </Show>
        </section>

        <aside class="flex flex-col gap-4">
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t("projects.recent")}
            </h2>
            <Show when={app.recents().length > 0} fallback={<EmptyState label={t("projects.recentEmpty")} />}>
              <ul class="flex flex-col gap-1">
                <For each={app.recents()}>
                  {(recent) => (
                    <li class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                      <button
                        type="button"
                        class="truncate text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        onClick={() => {
                          app.rememberProject(recent.id, recent.name)
                          app.setActivity("cad")
                           navigate(`/projects/${recent.id}`)
                        }}
                      >
                        {recent.name}
                      </button>
                      <span class="shrink-0 text-xs text-gray-500">{formatRecent(recent.openedAt)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <Show when={editing() === undefined}>
             <form class="card p-4" onSubmit={(event) => void submitCreate(event).catch(() => undefined)}>
              <h2 class="mb-2 text-sm font-semibold">{t("projects.createTitle")}</h2>
              <label class="form-label" for="project-name">{t("projects.nameLabel")}</label>
              <input
                id="project-name"
                class="form-input mb-3"
                type="text"
                required
                placeholder={t("projects.namePlaceholder")}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              <label class="form-label" for="project-description">{t("projects.descriptionLabel")}</label>
              <textarea
                id="project-description"
                class="form-textarea"
                rows={2}
                placeholder={t("projects.descriptionPlaceholder")}
                value={description()}
                onInput={(event) => setDescription(event.currentTarget.value)}
              />
               <button type="submit" disabled={create.pending() || !name().trim()} class="btn btn-primary mt-3">{t("projects.create")}</button>
            </form>
          </Show>

          <Show when={editing() !== undefined}>
             <form class="card p-4" onSubmit={(event) => void submitRename(event).catch(() => undefined)}>
              <h2 class="mb-2 text-sm font-semibold">{t("projects.renameTitle")}</h2>
              <label class="form-label" for="project-rename">{t("projects.nameLabel")}</label>
              <input
                id="project-rename"
                class="form-input"
                type="text"
                required
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              <div class="mt-3 flex gap-2">
                 <button type="submit" disabled={rename.pending() || !name().trim()} class="btn btn-primary">{t("projects.save")}</button>
                <button type="button" class="btn btn-outline" onClick={() => setEditing(undefined)}>
                  {t("projects.cancel")}
                </button>
              </div>
            </form>
          </Show>

          <Show when={deleting() !== undefined}>
            <div class="card p-4" role="alertdialog" aria-label={t("projects.delete")}>
              <p class="mb-3 text-sm">{t("projects.deleteConfirm", { name: deleting()?.name ?? "" })}</p>
              <div class="flex gap-2">
                 <button type="button" disabled={remove.pending()} class="btn btn-danger" onClick={() => void confirmDelete().catch(() => undefined)}>
                  {t("common.delete")}
                </button>
                <button type="button" class="btn btn-outline" onClick={() => setDeleting(undefined)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </Show>

           <Show when={create.error() || rename.error() || remove.error()}><ErrorState label={String(create.error() || rename.error() || remove.error())} /></Show>
           <Toast message={notice()} />
        </aside>
      </div>
    </div>
  )
}
