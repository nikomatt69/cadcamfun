/**
 * The toolpaths list (legacy `pages/toolpaths/index.tsx`), laid out in the CAM workspace style.
 *
 * Same workspace chrome as `/cam`: a glass toolbar capsule (`workstation-toolbar`) with the page actions, a
 * left filter rail (`cam-workspace__sidebar`) with search, type, operation and project filters, and a central
 * stage (`cam-workspace__stage`) showing the toolpaths as a grid or a table. Create/edit and the predefined
 * "Standard Library" open as modals; "Use in CAM" hands the program to `/cam` through local storage, the same
 * hand-off the CAM page reads.
 */
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { Book, Code, Cpu, Download, Edit, Grid3x3, List, Plus, Search, Trash2, Wrench, X } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { onCacheInvalidated } from "../../../shared/state/queries.ts"
import { PredefinedToolpathsLibrary, type LibraryPick } from "../components/ToolpathLibraryModal.tsx"
import { ToolpathFormModal, type ToolpathFormValue } from "../components/ToolpathFormModal.tsx"
import { Modal, TYPE_LABEL, OPERATION_LABEL, formatDate, handOffToCam, type ToolpathRow } from "../components/shared.tsx"
import {
  BADGE,
  CARD,
  CardBanner,
  FIELD,
  ICON_BUTTON,
  RAIL_LABEL,
  StageEmpty,
  StageError,
  StageLoading,
  TOOLBAR_BUTTON,
  TOOLBAR_PRIMARY,
  WorkspacePage
} from "../../../shared/components/WorkspacePage.tsx"

type ViewMode = "grid" | "list"

export interface ToolpathFilters {
  readonly search: string
  readonly type: string
  readonly operationType: string
  readonly projectId: string
}

export function ToolpathsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [urlParams, setUrlParams] = useSearchParams()

  const [filters, setFilters] = createSignal<ToolpathFilters>({
    search: "",
    type: "",
    operationType: "",
    projectId: typeof urlParams.projectId === "string" ? urlParams.projectId : ""
  })
  const [view, setView] = createSignal<ViewMode>("grid")
  const [rows, setRows] = createSignal<ReadonlyArray<ToolpathRow>>([])
  const [projects, setProjects] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  const [formOpen, setFormOpen] = createSignal(false)
  const [editing, setEditing] = createSignal<ToolpathRow>()
  const [libraryOpen, setLibraryOpen] = createSignal(false)
  const [deleting, setDeleting] = createSignal<ToolpathRow>()

  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const current = filters()
      const list = await run<ReadonlyArray<ToolpathRow>>(app.client.toolpaths.list({
        query: {
          search: current.search || undefined,
          type: current.type || undefined,
          operationType: current.operationType || undefined,
          projectId: current.projectId || undefined
        }
      }))
      setRows(list)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = (): void => {
    void run<ReadonlyArray<{ id: string; name: string }>>(app.client.projects.list())
      .then((list) => setProjects(list.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]))
  }

  onMount(() => {
    void load()
    loadProjects()
  })
  // A project or toolpath deleted elsewhere (or a sign-in) must not linger in this open page.
  onCacheInvalidated(app.cache, () => { void load(); loadProjects() })

  // Reload when a filter changes; the search box is debounced so typing does not fire a request per key.
  let debounce: ReturnType<typeof setTimeout> | undefined
  createEffect(on(filters, () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void load(), 250)
  }, { defer: true }))
  onCleanup(() => clearTimeout(debounce))

  const update = (patch: Partial<ToolpathFilters>): void => {
    const next: ToolpathFilters = { ...filters(), ...patch }
    setFilters(next)
  }
  const clearFilters = (): void => {
    const current = filters()
    setFilters({ search: "", type: "", operationType: "", projectId: current.projectId })
  }
  const hasFilters = createMemo(() => filters().search !== "" || filters().type !== "" || filters().operationType !== "" || filters().projectId !== "")

  const refresh = (): void => {
    invalidatePrefix(app.cache, "toolpaths")
    invalidatePrefix(app.cache, "projects")
  }

  const openCreate = (): void => { setEditing(undefined); setFormOpen(true) }
  const openEdit = (row: ToolpathRow): void => { setEditing(row); setFormOpen(true) }
  const openDetail = (row: ToolpathRow): void => navigate(`/toolpaths/${row.id}`)

  const submitForm = async (value: ToolpathFormValue): Promise<void> => {
    setBusy(true)
    try {
      const current = editing()
      if (current) {
        await run(app.client.toolpaths.update({ params: { id: current.id }, payload: value }))
        toast.success(t("pages.toolpath.updated.successfully"))
      } else {
        const created = await run<ToolpathRow>(app.client.toolpaths.create({ payload: { ...value, data: {}, gcode: "", isPublic: value.isPublic } }))
        toast.success(t("pages.toolpath.created.successfully"))
        setFormOpen(false)
        refresh()
        navigate(`/toolpaths/${created.id}`)
        return
      }
      setFormOpen(false)
      refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("pages.failed.to.save.toolpath"))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    const row = deleting()
    if (!row) return
    setBusy(true)
    try {
      await run(app.client.toolpaths.remove({ params: { id: row.id } }))
      toast.success(t("pages.toolpath.deleted.successfully"))
      setDeleting(undefined)
      refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("pages.failed.to.delete.toolpath"))
    } finally {
      setBusy(false)
    }
  }

  const useLibraryItem = async (item: LibraryPick): Promise<void> => {
    const projectId = filters().projectId
    if (!projectId) { toast.error(t("pages.please.select.a.project.first")); return }
    setBusy(true)
    try {
      const created = await run<ToolpathRow>(app.client.toolpaths.create({
        payload: { name: item.name, description: item.description, type: item.type, operationType: item.operationType, projectId, data: (item.data ?? {}) as Record<string, unknown>, gcode: item.gcode, isPublic: false }
      }))
      toast.success(t("pages.toolpath.created.from.library.successfully"))
      setLibraryOpen(false)
      refresh()
      navigate(`/toolpaths/${created.id}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("pages.failed.to.create.toolpath.from.library"))
    } finally {
      setBusy(false)
    }
  }

  const projectName = (id: string): string => projects().find((p) => p.id === id)?.name ?? id

  // The project filter is kept in the URL so the project page can link here (`/toolpaths?projectId=`).
  createEffect(on(() => filters().projectId, (projectId) => {
    setUrlParams({ projectId: projectId || undefined }, { replace: true })
  }, { defer: true }))

  return (
    <>
    <WorkspacePage
      title={t("pages.toolpaths.library")}
      actions={<>
        <A href="/cam" class={TOOLBAR_BUTTON}><Cpu size={16} aria-hidden="true" />{t("cam.generator")}</A>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}><Book size={16} aria-hidden="true" />{t("library.standard")}</button>
        <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}><Plus size={16} aria-hidden="true" />{t("pages.new.toolpath")}</button>
      </>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>{t("legacy.search")}</span>
          <div class="relative">
            <Search size={14} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              name="search"
              class={`${FIELD} pl-8`}
              placeholder={t("pages.search.toolpaths")}
              value={filters().search}
              onInput={(event) => update({ search: event.currentTarget.value })}
            />
          </div>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>{t("library.machine.type")}</span>
          <select name="type" class={FIELD} value={filters().type} onChange={(event) => update({ type: event.currentTarget.value })}>
            <option value="">{t("pages.all.types")}</option>
            <For each={["mill", "lathe", "3dprinter"]}>{(value) => <option value={value}>{TYPE_LABEL[value] ?? value}</option>}</For>
          </select>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>{t("cam.operations.current")}</span>
          <select name="operationType" class={FIELD} value={filters().operationType} onChange={(event) => update({ operationType: event.currentTarget.value })}>
            <option value="">{t("pages.all.operations")}</option>
            <For each={Object.keys(OPERATION_LABEL)}>{(value) => <option value={value}>{OPERATION_LABEL[value]}</option>}</For>
          </select>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>{t("cam.save.project")}</span>
          <select name="projectId" class={FIELD} value={filters().projectId} onChange={(event) => update({ projectId: event.currentTarget.value })}>
            <option value="">{t("shell.allProjects")}</option>
            <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
          </select>
        </label>

        <div class="flex items-center justify-between gap-2 pt-1">
          <button type="button" class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-white" onClick={clearFilters} disabled={!hasFilters()}>
            <X size={13} aria-hidden="true" />{t("pages.clear.filters")}
          </button>
          <div class="workspace-view-toggle" role="group" aria-label={t("cam.multi.view")}>
            <button type="button" class="workspace-view-toggle__btn" title={t("pages.grid.view")} aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={15} aria-hidden="true" /></button>
            <button type="button" class="workspace-view-toggle__btn" title={t("pages.list.view")} aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={15} aria-hidden="true" /></button>
          </div>
        </div>
      </>}
    >
            <Show when={!loading()} fallback={<StageLoading label={t("pages.loading.toolpaths")} />}>
              <Show when={error() === undefined} fallback={<StageError message={error() ?? ""} />}>
                <Show
                  when={rows().length > 0}
                  fallback={
                    <StageEmpty
                      icon={<Code size={20} aria-hidden="true" />}
                      title={t("profile.emptyToolpaths")}
                      hint={hasFilters() ? t("pages.no.toolpaths.match.your.search.criteria") : t("pages.create.your.first.toolpath.to.get.started.or.choose.from.our.standard.library")}
                    >
                      <Show when={hasFilters()} fallback={<>
                        <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}>{t("pages.create.toolpath")}</button>
                        <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}>{t("pages.use.standard.library")}</button>
                        <A href="/cam" class={TOOLBAR_BUTTON}>{t("cam.explorer.generateToolpath")}</A>
                      </>}>
                        <button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>{t("manuals.clear")}</button>
                      </Show>
                    </StageEmpty>
                  }
                >
                  <Show
                    when={view() === "grid"}
                    fallback={
                      <div class="workspace-table">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">{t("orgs.name")}</th>
                              <th scope="col">{t("pages.type.operation")}</th>
                              <th scope="col">{t("cam.save.project")}</th>
                              <th scope="col">{t("org.overview.updated")}</th>
                              <th scope="col">ID</th>
                              <th scope="col"><span class="sr-only">{t("vcs.tab.actions")}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={rows()}>{(row) => (
                              <tr onClick={() => openDetail(row)}>
                                <td>
                                  <div class="flex items-center gap-2">
                                    <div class="flex h-7 w-7 items-center justify-center rounded-[5px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><Code size={15} class="text-slate-400" aria-hidden="true" /></div>
                                    <div>
                                      <div class="text-xs font-medium text-slate-900 dark:text-white">{row.name}</div>
                                      <Show when={row.description}><div class="max-w-xs truncate text-[11px] text-slate-500 dark:text-slate-400">{row.description}</div></Show>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span class={`${BADGE} mr-1`}>{TYPE_LABEL[row.type ?? t("pages.mill")] ?? row.type ?? t("pages.mill")}</span>
                                  <span class={BADGE}>{OPERATION_LABEL[row.operationType ?? t("cam.strategy.contour")] ?? row.operationType ?? t("cam.strategy.contour")}</span>
                                </td>
                                <td class="text-slate-500 dark:text-slate-400">{projectName(row.projectId)}</td>
                                <td class="text-slate-500 dark:text-slate-400">{formatDate(row.updatedAt)}</td>
                                <td class="font-mono text-[11px] text-slate-500 dark:text-slate-400">{row.id.substring(0, 8)}...</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <div class="flex justify-end gap-1">
                                    <button type="button" class={ICON_BUTTON} title={t("pages.use.in.cam")} onClick={() => handOffToCam(row, navigate)}><Cpu size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("cam.multi.downloadGcode")} onClick={() => navigate(`/toolpaths/${row.id}?download=true`)}><Download size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("cad.ribbon.edit")} onClick={() => openEdit(row)}><Edit size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("common.delete")} disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={15} aria-hidden="true" /></button>
                                  </div>
                                </td>
                              </tr>
                            )}</For>
                          </tbody>
                        </table>
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <For each={rows()}>{(row) => (
                        <div class={CARD} onClick={() => openDetail(row)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openDetail(row) }}>
                          <CardBanner
                            icon={<Wrench size={18} aria-hidden="true" />}
                            badge={TYPE_LABEL[row.type ?? t("pages.mill")] ?? row.type ?? t("pages.mill")}
                            leftBadge={row.isPublic ? t("save.publicProject") : undefined}
                          />
                          <div class="flex flex-1 flex-col gap-1.5 p-3">
                            <h3 class="text-xs font-semibold text-slate-900 dark:text-white">{row.name}</h3>
                            <Show when={row.description}><p class="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{row.description}</p></Show>
                            <div class="mt-auto space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <div class="flex items-center justify-between gap-2"><span>{t("cam.operations.current")}</span><span class={BADGE}>{OPERATION_LABEL[row.operationType ?? t("cam.strategy.contour")] ?? row.operationType ?? t("cam.strategy.contour")}</span></div>
                              <div class="flex items-center justify-between gap-2"><span>ID</span><code class="font-mono text-[10px] text-slate-400 dark:text-slate-500">{row.id.substring(0, 8)}...</code></div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-700/70">
                            <span class="text-[11px] text-slate-500 dark:text-slate-400">{t("projects.column.updated")} {formatDate(row.updatedAt)}</span>
                            <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" class={ICON_BUTTON} title={t("pages.use.in.cam")} onClick={() => handOffToCam(row, navigate)}><Cpu size={15} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title={t("cad.ribbon.edit")} onClick={() => openDetail(row)}><Edit size={15} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title={t("common.delete")} disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={15} aria-hidden="true" /></button>
                            </div>
                          </div>
                        </div>
                      )}</For>
                    </div>
                  </Show>
                </Show>
              </Show>
            </Show>
    </WorkspacePage>

      <ToolpathFormModal
        open={formOpen()}
        row={editing()}
        projects={projects()}
        defaultProjectId={filters().projectId}
        busy={busy()}
        onClose={() => setFormOpen(false)}
        onSubmit={submitForm}
      />

      <PredefinedToolpathsLibrary
        open={libraryOpen()}
        projectId={filters().projectId}
        onClose={() => setLibraryOpen(false)}
        onSelect={(item) => void useLibraryItem(item)}
      />

      <Modal open={deleting() !== undefined} title={t("cam.deleteToolpath")} onClose={() => setDeleting(undefined)}>
        <p class="text-sm text-gray-700 dark:text-gray-300">{t("pages.are.you.sure.you.want.to.delete.this.toolpath")}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-[5px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class="rounded-[5px] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={busy()} onClick={() => void confirmDelete()}>{t("common.delete")}</button>
        </div>
      </Modal>
    </>
  )
}
