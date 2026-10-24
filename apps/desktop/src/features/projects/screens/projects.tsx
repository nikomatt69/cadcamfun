/**
 * Projects screen (spec 06-desktop-ui.md §1: list/create/open/rename/delete, recent), in the CAM workspace style
 * of the toolpaths list: a glass toolbar, a filter rail (search and the recents list) and a grid of project cards.
 *
 * Reads go through `useQuery` (endpoint + params keyed), writes through `useMutation`,
 * and Open records the project in the recents list — which is what the "Recent" panel and
 * the shell's tray menu read.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Edit, FolderKanban, FolderOpen, Plus, Search, Trash2, X } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import {
  CANCEL_BUTTON, CARD, CardBanner, DANGER_BUTTON, FIELD, ICON_BUTTON, INPUT, LABEL, RAIL_LABEL, StageEmpty, StageError,
  StageLoading, SUBMIT_BUTTON, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspacePage
} from "../../../shared/components/WorkspacePage.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { useMutation, useQuery } from "../../../app/screen-queries.ts"
import { formatRecent } from "../../../shared/state/recents.ts"
import { Modal, formatDate } from "../../toolpaths/components/shared.tsx"

const ENDPOINT = "projects"

/** The reason a request failed, short enough for the error box. */
const describeError = (error: unknown): string | undefined => {
  if (error === undefined || error === null) return undefined
  const message = typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string" ? (error as { message: string }).message : String(error)
  return message.length > 200 ? `${message.slice(0, 200)}…` : message
}

interface ProjectRow {
  readonly id: string
  readonly name: string
  readonly description?: string | null
  readonly updatedAt: string
  readonly _count: { readonly drawings: number; readonly components: number }
}

export function ProjectsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = createSignal(false)
  const [editing, setEditing] = createSignal<ProjectRow | undefined>(undefined)
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [search, setSearch] = createSignal("")
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
  const filtered = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return rows().filter((row) => needle === "" || `${row.name} ${row.description ?? ""}`.toLowerCase().includes(needle))
  })
  const busy = (): boolean => create.pending() || rename.pending() || remove.pending()
  const mutationError = (): string | undefined => {
    const cause = create.error() || rename.error() || remove.error()
    return cause ? describeError(cause) : undefined
  }
  const refresh = (): void => {
    invalidatePrefix(app.cache, ENDPOINT)
    projects.refetch()
  }

  const open = (row: { readonly id: string; readonly name: string }): void => {
    app.rememberProject(row.id, row.name)
    app.setActivity("cad")
    navigate(`/projects/${row.id}`)
  }

  const openCreate = (): void => { setName(""); setDescription(""); setCreateOpen(true) }
  const openRename = (row: ProjectRow): void => { setName(row.name); setEditing(row) }

  const submitCreate = async (event: Event): Promise<void> => {
    event.preventDefault()
    const created = await create.mutate(name().trim(), description())
    refresh()
    setCreateOpen(false)
    toast.success(t("projects.created"))
    app.rememberProject(created.id, created.name)
  }

  const submitRename = async (event: Event): Promise<void> => {
    event.preventDefault()
    const row = editing()
    if (row === undefined) return
    await rename.mutate(row.id, name().trim())
    refresh()
    setEditing(undefined)
    toast.success(t("projects.renamed"))
  }

  const confirmDelete = async (): Promise<void> => {
    const row = deleting()
    if (row === undefined) return
    await remove.mutate(row.id)
    // Deleting a project cascades to its drawings, components, toolpaths and resources: every cached list is stale.
    app.cache.invalidate()
    refresh()
    app.forgetProject(row.id)
    setDeleting(undefined)
    toast.success(t("projects.deleted"))
  }

  const swallow = (): undefined => undefined

  return (
    <WorkspacePage
      title={t("projects.title")}
      overlays={<>
      <Modal open={createOpen()} title={t("projects.createTitle")} onClose={() => setCreateOpen(false)}>
        <form class="space-y-4" onSubmit={(event) => void submitCreate(event).catch(swallow)}>
          <div>
            <label class={LABEL} for="project-name">{t("projects.nameLabel")}</label>
            <input id="project-name" class={INPUT} type="text" required placeholder={t("projects.namePlaceholder")} value={name()} onInput={(event) => setName(event.currentTarget.value)} />
          </div>
          <div>
            <label class={LABEL} for="project-description">{t("projects.descriptionLabel")}</label>
            <textarea id="project-description" class={INPUT} rows={3} placeholder={t("projects.descriptionPlaceholder")} value={description()} onInput={(event) => setDescription(event.currentTarget.value)} />
          </div>
          <div class="flex justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-700/50">
            <button type="button" class={CANCEL_BUTTON} onClick={() => setCreateOpen(false)}>{t("projects.cancel")}</button>
            <button type="submit" class={SUBMIT_BUTTON} disabled={create.pending() || !name().trim()}>{t("projects.create")}</button>
          </div>
        </form>
      </Modal>

      <Modal open={editing() !== undefined} title={t("projects.renameTitle")} onClose={() => setEditing(undefined)}>
        <form class="space-y-4" onSubmit={(event) => void submitRename(event).catch(swallow)}>
          <div>
            <label class={LABEL} for="project-rename">{t("projects.nameLabel")}</label>
            <input id="project-rename" class={INPUT} type="text" required value={name()} onInput={(event) => setName(event.currentTarget.value)} />
          </div>
          <div class="flex justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-700/50">
            <button type="button" class={CANCEL_BUTTON} onClick={() => setEditing(undefined)}>{t("projects.cancel")}</button>
            <button type="submit" class={SUBMIT_BUTTON} disabled={rename.pending() || !name().trim()}>{t("projects.save")}</button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting() !== undefined} title={t("projects.delete")} onClose={() => setDeleting(undefined)}>
        <p class="text-sm text-slate-700 dark:text-slate-300">{t("projects.deleteConfirm", { name: deleting()?.name ?? "" })}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class={CANCEL_BUTTON} onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class={DANGER_BUTTON} disabled={remove.pending()} onClick={() => void confirmDelete().catch(swallow)}>{t("common.delete")}</button>
        </div>
      </Modal>
      </>}
      actions={<button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}><Plus size={16} aria-hidden="true" />{t("projects.create")}</button>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>Search</span>
          <div class="relative">
            <Search size={15} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" name="search" class={`${FIELD} pl-8`} placeholder="Search projects..." value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
          </div>
        </label>
        <button type="button" class="inline-flex h-7 items-center gap-1 self-start rounded-[4px] px-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-45 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={() => setSearch("")} disabled={search() === ""}>
          <X size={13} aria-hidden="true" />Clear filters
        </button>
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{t("projects.recent")}</h2>
          <Show when={app.recents().length > 0} fallback={<p class="text-xs text-slate-500 dark:text-slate-400">{t("projects.recentEmpty")}</p>}>
            <ul class="flex flex-col gap-0.5">
              <For each={app.recents()}>{(recent) => (
                <li class="flex min-h-7 items-center justify-between gap-2 rounded-[4px] px-1.5 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">
                  <button type="button" class="truncate text-left text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-200" onClick={() => open(recent)}>{recent.name}</button>
                  <span class="shrink-0 text-[10.5px] tabular-nums text-slate-500">{formatRecent(recent.openedAt)}</span>
                </li>
              )}</For>
            </ul>
          </Show>
        </section>
        <p class="mt-auto border-t border-slate-200 pt-2.5 text-[11px] tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400" role="status">{filtered().length} of {rows().length} projects</p>
      </>}
    >
      <Show when={mutationError()}>{(message) => <div class="mb-4"><StageError message={message()} /></div>}</Show>
      <Show when={projects.state()._tag === "loading"}><StageLoading label={t("projects.loading")} /></Show>
      <Show when={projects.state()._tag === "error"}><StageError message={`${t("projects.error")}${describeError(projects.error()) ? `: ${describeError(projects.error())}` : ""}`} onRetry={refresh} /></Show>
      <Show when={projects.state()._tag === "success"}>
        <Show
          when={filtered().length > 0}
          fallback={
            <StageEmpty icon={<FolderKanban size={24} aria-hidden="true" />} title="No projects found" hint={search() !== "" ? "No projects match your search criteria." : t("projects.empty")}>
              <Show when={search() !== ""} fallback={<button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}>{t("projects.create")}</button>}>
                <button type="button" class={TOOLBAR_BUTTON} onClick={() => setSearch("")}>Clear filters</button>
              </Show>
            </StageEmpty>
          }
        >
          <div class="grid grid-cols-1 content-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={filtered()}>{(row) => (
              <div class={`${CARD} cursor-pointer`} role="link" tabIndex={0} onClick={() => open(row)} onKeyDown={(event) => { if (event.key === "Enter") open(row) }}>
                <CardBanner icon={<FolderKanban size={26} aria-hidden="true" />} badge="Project" />
                <div class="flex flex-1 flex-col gap-2.5 p-4">
                  <h3 class="text-base font-semibold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">{row.name}</h3>
                  <Show when={row.description}><p class="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{row.description}</p></Show>
                  <div class="mt-auto space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div class="flex items-center justify-between gap-2"><span>{t("projects.column.drawings")}</span><span class="min-w-[22px] rounded-full bg-blue-100/80 px-1.5 py-0.5 text-center font-medium tabular-nums text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{row._count.drawings}</span></div>
                    <div class="flex items-center justify-between gap-2"><span>{t("projects.column.components")}</span><span class="min-w-[22px] rounded-full bg-blue-100/80 px-1.5 py-0.5 text-center font-medium tabular-nums text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{row._count.components}</span></div>
                    <div class="flex items-center justify-between gap-2"><span>ID</span><code class="truncate font-mono text-[11px] text-blue-600 dark:text-blue-400">{row.id.substring(0, 8)}…</code></div>
                  </div>
                </div>
                <div class="flex items-center justify-between border-t border-slate-200/60 bg-white/60 px-4 py-2.5 backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/40">
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">{t("projects.updated", { date: formatDate(row.updatedAt) })}</span>
                  <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                    <button type="button" class={ICON_BUTTON} title={t("projects.open")} aria-label={`${t("projects.open")}: ${row.name}`} onClick={() => open(row)}><FolderOpen size={16} aria-hidden="true" /></button>
                    <button type="button" class={ICON_BUTTON} title={t("projects.rename")} aria-label={`${t("projects.rename")}: ${row.name}`} onClick={() => openRename(row)}><Edit size={16} aria-hidden="true" /></button>
                    <button type="button" class={ICON_BUTTON} title={t("projects.delete")} aria-label={`${t("projects.delete")}: ${row.name}`} disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            )}</For>
          </div>
        </Show>
      </Show>

    </WorkspacePage>
  )
}
