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
        toast.success("Toolpath updated successfully")
      } else {
        const created = await run<ToolpathRow>(app.client.toolpaths.create({ payload: { ...value, data: {}, gcode: "", isPublic: value.isPublic } }))
        toast.success("Toolpath created successfully")
        setFormOpen(false)
        refresh()
        navigate(`/toolpaths/${created.id}`)
        return
      }
      setFormOpen(false)
      refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to save toolpath")
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
      toast.success("Toolpath deleted successfully")
      setDeleting(undefined)
      refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to delete toolpath")
    } finally {
      setBusy(false)
    }
  }

  const useLibraryItem = async (item: LibraryPick): Promise<void> => {
    const projectId = filters().projectId
    if (!projectId) { toast.error("Please select a project first"); return }
    setBusy(true)
    try {
      const created = await run<ToolpathRow>(app.client.toolpaths.create({
        payload: { name: item.name, description: item.description, type: item.type, operationType: item.operationType, projectId, data: (item.data ?? {}) as Record<string, unknown>, gcode: item.gcode, isPublic: false }
      }))
      toast.success("Toolpath created from library successfully")
      setLibraryOpen(false)
      refresh()
      navigate(`/toolpaths/${created.id}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to create toolpath from library")
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
      title="Toolpaths Library"
      actions={<>
        <A href="/cam" class={TOOLBAR_BUTTON}><Cpu size={16} aria-hidden="true" />Toolpath Generator</A>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}><Book size={16} aria-hidden="true" />Standard Library</button>
        <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}><Plus size={16} aria-hidden="true" />New Toolpath</button>
      </>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>Search</span>
          <div class="relative">
            <Search size={14} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              name="search"
              class={`${FIELD} pl-8`}
              placeholder="Search toolpaths..."
              value={filters().search}
              onInput={(event) => update({ search: event.currentTarget.value })}
            />
          </div>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>Machine type</span>
          <select name="type" class={FIELD} value={filters().type} onChange={(event) => update({ type: event.currentTarget.value })}>
            <option value="">All Types</option>
            <For each={["mill", "lathe", "3dprinter"]}>{(value) => <option value={value}>{TYPE_LABEL[value] ?? value}</option>}</For>
          </select>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>Operation</span>
          <select name="operationType" class={FIELD} value={filters().operationType} onChange={(event) => update({ operationType: event.currentTarget.value })}>
            <option value="">All Operations</option>
            <For each={Object.keys(OPERATION_LABEL)}>{(value) => <option value={value}>{OPERATION_LABEL[value]}</option>}</For>
          </select>
        </label>

        <label class="block">
          <span class={RAIL_LABEL}>Project</span>
          <select name="projectId" class={FIELD} value={filters().projectId} onChange={(event) => update({ projectId: event.currentTarget.value })}>
            <option value="">All Projects</option>
            <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
          </select>
        </label>

        <div class="flex items-center justify-between gap-2 pt-1">
          <button type="button" class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-white" onClick={clearFilters} disabled={!hasFilters()}>
            <X size={13} aria-hidden="true" />Clear Filters
          </button>
          <div class="workspace-view-toggle" role="group" aria-label="View">
            <button type="button" class="workspace-view-toggle__btn" title="Grid View" aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={15} aria-hidden="true" /></button>
            <button type="button" class="workspace-view-toggle__btn" title="List View" aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={15} aria-hidden="true" /></button>
          </div>
        </div>
      </>}
    >
            <Show when={!loading()} fallback={<StageLoading label="Loading toolpaths..." />}>
              <Show when={error() === undefined} fallback={<StageError message={error() ?? ""} />}>
                <Show
                  when={rows().length > 0}
                  fallback={
                    <StageEmpty
                      icon={<Code size={20} aria-hidden="true" />}
                      title="No toolpaths found"
                      hint={hasFilters() ? "No toolpaths match your search criteria." : "Create your first toolpath to get started or choose from our standard library."}
                    >
                      <Show when={hasFilters()} fallback={<>
                        <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}>Create Toolpath</button>
                        <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}>Use Standard Library</button>
                        <A href="/cam" class={TOOLBAR_BUTTON}>Generate Toolpath</A>
                      </>}>
                        <button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>Clear filters</button>
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
                              <th scope="col">Name</th>
                              <th scope="col">Type / Operation</th>
                              <th scope="col">Project</th>
                              <th scope="col">Updated</th>
                              <th scope="col">ID</th>
                              <th scope="col"><span class="sr-only">Actions</span></th>
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
                                  <span class={`${BADGE} mr-1`}>{TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? "Mill"}</span>
                                  <span class={BADGE}>{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? "Contour"}</span>
                                </td>
                                <td class="text-slate-500 dark:text-slate-400">{projectName(row.projectId)}</td>
                                <td class="text-slate-500 dark:text-slate-400">{formatDate(row.updatedAt)}</td>
                                <td class="font-mono text-[11px] text-slate-500 dark:text-slate-400">{row.id.substring(0, 8)}...</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <div class="flex justify-end gap-1">
                                    <button type="button" class={ICON_BUTTON} title="Use in CAM" onClick={() => handOffToCam(row, navigate)}><Cpu size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Download G-code" onClick={() => navigate(`/toolpaths/${row.id}?download=true`)}><Download size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => openEdit(row)}><Edit size={15} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Delete" disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={15} aria-hidden="true" /></button>
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
                            badge={TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? "Mill"}
                            leftBadge={row.isPublic ? "Public" : undefined}
                          />
                          <div class="flex flex-1 flex-col gap-1.5 p-3">
                            <h3 class="text-xs font-semibold text-slate-900 dark:text-white">{row.name}</h3>
                            <Show when={row.description}><p class="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{row.description}</p></Show>
                            <div class="mt-auto space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <div class="flex items-center justify-between gap-2"><span>Operation</span><span class={BADGE}>{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? "Contour"}</span></div>
                              <div class="flex items-center justify-between gap-2"><span>ID</span><code class="font-mono text-[10px] text-slate-400 dark:text-slate-500">{row.id.substring(0, 8)}...</code></div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-700/70">
                            <span class="text-[11px] text-slate-500 dark:text-slate-400">Updated {formatDate(row.updatedAt)}</span>
                            <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" class={ICON_BUTTON} title="Use in CAM" onClick={() => handOffToCam(row, navigate)}><Cpu size={15} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => openDetail(row)}><Edit size={15} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title="Delete" disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={15} aria-hidden="true" /></button>
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

      <Modal open={deleting() !== undefined} title="Delete toolpath" onClose={() => setDeleting(undefined)}>
        <p class="text-sm text-gray-700 dark:text-gray-300">Are you sure you want to delete this toolpath?</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-[5px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class="rounded-[5px] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={busy()} onClick={() => void confirmDelete()}>Delete</button>
        </div>
      </Modal>
    </>
  )
}
