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
import { Motion } from "solid-motionone"
import { Book, Code, Cpu, Download, Edit, Grid3x3, List, Plus, Search, Trash2, Wrench, X } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { onCacheInvalidated } from "../../../shared/state/queries.ts"
import { PredefinedToolpathsLibrary, type LibraryPick } from "../components/ToolpathLibraryModal.tsx"
import { ToolpathFormModal, type ToolpathFormValue } from "../components/ToolpathFormModal.tsx"
import { Modal, TYPE_LABEL, OPERATION_LABEL, formatDate, handOffToCam, type ToolpathRow } from "../components/shared.tsx"
import "../../../styles/workstation.css"

type ViewMode = "grid" | "list"

const TOOLBAR_BUTTON = "workstation-toolbar-button inline-flex items-center gap-1.5 rounded-lg border border-white/40 dark:border-gray-600/40 bg-white/60 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-white/80 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-700/80"
const TOOLBAR_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-[#007ACC] px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all duration-200 hover:bg-blue-700"
const FIELD = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
const ICON_BUTTON = "rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
const CARD = "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/40 bg-white/70 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-[#007ACC]/60 hover:shadow-xl dark:border-gray-700/50 dark:bg-gray-800/70"

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
    <Motion.div
      class="cam-workspace h-full w-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div class="cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div
          class="workstation-toolbar w-full flex items-center justify-between"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div class="flex rounded-2xl w-max items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30">
            <h1 class="px-2 text-base font-semibold text-gray-900 dark:text-white">Toolpaths Library</h1>
          </div>
          <div class="flex items-center gap-2">
            <A href="/cam" class={TOOLBAR_BUTTON}><Cpu size={16} aria-hidden="true" />Toolpath Generator</A>
            <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}><Book size={16} aria-hidden="true" />Standard Library</button>
            <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}><Plus size={16} aria-hidden="true" />New Toolpath</button>
          </div>
        </Motion.div>

        <div class="cam-workspace__body flex flex-1 overflow-hidden w-full">
          <aside class="cam-workspace__sidebar flex-shrink-0 mr-2 h-full flex flex-col" data-open="true" aria-label="Filters">
            <div class="flex flex-col gap-3 p-3 overflow-y-auto rounded-xl bg-white/30 dark:bg-gray-800/50 backdrop-blur-sm">
              <label class="block">
                <span class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Search</span>
                <div class="relative">
                  <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
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
                <span class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Machine type</span>
                <select name="type" class={FIELD} value={filters().type} onChange={(event) => update({ type: event.currentTarget.value })}>
                  <option value="">All Types</option>
                  <For each={["mill", "lathe", "3dprinter"]}>{(value) => <option value={value}>{TYPE_LABEL[value] ?? value}</option>}</For>
                </select>
              </label>

              <label class="block">
                <span class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Operation</span>
                <select name="operationType" class={FIELD} value={filters().operationType} onChange={(event) => update({ operationType: event.currentTarget.value })}>
                  <option value="">All Operations</option>
                  <For each={Object.keys(OPERATION_LABEL)}>{(value) => <option value={value}>{OPERATION_LABEL[value]}</option>}</For>
                </select>
              </label>

              <label class="block">
                <span class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Project</span>
                <select name="projectId" class={FIELD} value={filters().projectId} onChange={(event) => update({ projectId: event.currentTarget.value })}>
                  <option value="">All Projects</option>
                  <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
                </select>
              </label>

              <div class="flex items-center justify-between pt-1">
                <button type="button" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" onClick={clearFilters} disabled={!hasFilters()}>
                  <X size={14} aria-hidden="true" />Clear Filters
                </button>
                <div class="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600" role="group" aria-label="View">
                  <button type="button" class={`p-1.5 ${view() === "grid" ? "bg-blue-50 text-[#007ACC] dark:bg-blue-900/40 dark:text-blue-300" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-400"}`} title="Grid View" aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={16} aria-hidden="true" /></button>
                  <button type="button" class={`p-1.5 ${view() === "list" ? "bg-blue-50 text-[#007ACC] dark:bg-blue-900/40 dark:text-blue-300" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-400"}`} title="List View" aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={16} aria-hidden="true" /></button>
                </div>
              </div>
            </div>
          </aside>

          <Motion.div class="cam-workspace__stage flex-1 min-w-0 overflow-y-auto bg-white/50 dark:bg-gray-900/40 backdrop-blur-sm p-4" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.6 }}>
            <Show when={!loading()} fallback={<p class="p-8 text-center text-sm text-gray-500 dark:text-gray-400" role="status">Loading toolpaths...</p>}>
              <Show when={error() === undefined} fallback={<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300" role="alert">{error()}</div>}>
                <Show
                  when={rows().length > 0}
                  fallback={
                    <div class="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200/60 bg-white/70 p-10 text-center shadow-xl dark:border-gray-700/50 dark:bg-gray-800/70">
                      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-900"><Code size={24} class="text-gray-400 dark:text-gray-500" aria-hidden="true" /></div>
                      <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">No toolpaths found</h3>
                      <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">{hasFilters() ? "No toolpaths match your search criteria." : "Create your first toolpath to get started or choose from our standard library."}</p>
                      <div class="flex flex-wrap justify-center gap-2">
                        <Show when={hasFilters()} fallback={<>
                          <button type="button" class={TOOLBAR_PRIMARY} onClick={openCreate}>Create Toolpath</button>
                          <button type="button" class={TOOLBAR_BUTTON} onClick={() => setLibraryOpen(true)}>Use Standard Library</button>
                          <A href="/cam" class={TOOLBAR_BUTTON}>Generate Toolpath</A>
                        </>}>
                          <button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>Clear filters</button>
                        </Show>
                      </div>
                    </div>
                  }
                >
                  <Show
                    when={view() === "grid"}
                    fallback={
                      <div class="overflow-hidden rounded-xl border border-gray-200/60 bg-white/70 shadow-lg dark:border-gray-700/50 dark:bg-gray-800/70">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                              <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                              <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Type / Operation</th>
                              <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Project</th>
                              <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Updated</th>
                              <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">ID</th>
                              <th scope="col" class="relative px-4 py-2.5"><span class="sr-only">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            <For each={rows()}>{(row) => (
                              <tr class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50" onClick={() => openDetail(row)}>
                                <td class="whitespace-nowrap px-4 py-3">
                                  <div class="flex items-center gap-3">
                                    <div class="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-900"><Code size={18} class="text-gray-400 dark:text-gray-600" aria-hidden="true" /></div>
                                    <div>
                                      <div class="text-sm font-medium text-gray-900 dark:text-white">{row.name}</div>
                                      <Show when={row.description}><div class="max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">{row.description}</div></Show>
                                    </div>
                                  </div>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3">
                                  <span class="mr-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? "Mill"}</span>
                                  <span class="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-300">{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? "Contour"}</span>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{projectName(row.projectId)}</td>
                                <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(row.updatedAt)}</td>
                                <td class="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-500 dark:text-gray-400">{row.id.substring(0, 8)}...</td>
                                <td class="whitespace-nowrap px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                                  <div class="flex justify-end gap-1">
                                    <button type="button" class={ICON_BUTTON} title="Use in CAM" onClick={() => handOffToCam(row, navigate)}><Cpu size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Download G-code" onClick={() => navigate(`/toolpaths/${row.id}?download=true`)}><Download size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => openEdit(row)}><Edit size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title="Delete" disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" /></button>
                                  </div>
                                </td>
                              </tr>
                            )}</For>
                          </tbody>
                        </table>
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <For each={rows()}>{(row) => (
                        <div class={CARD} onClick={() => openDetail(row)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openDetail(row) }}>
                          <div class="relative flex h-20 items-center justify-center bg-gradient-to-r from-blue-500/20 to-cyan-500/20 dark:from-blue-600/30 dark:to-cyan-600/30">
                            <div class="rounded-xl bg-white/30 p-2.5 backdrop-blur-sm dark:bg-white/10"><Wrench size={28} class="text-[#007ACC] dark:text-blue-300" aria-hidden="true" /></div>
                            <span class="absolute right-2 top-2 rounded-full bg-blue-100/80 px-2 py-0.5 text-xs font-semibold text-blue-800 backdrop-blur-sm dark:bg-blue-900/50 dark:text-blue-300">{TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? "Mill"}</span>
                            <Show when={row.isPublic}><span class="absolute left-2 top-2 rounded-full bg-green-100/80 px-2 py-0.5 text-xs font-semibold text-green-800 backdrop-blur-sm dark:bg-green-900/50 dark:text-green-300">Public</span></Show>
                          </div>
                          <div class="flex flex-1 flex-col gap-2 p-4">
                            <h3 class="text-base font-semibold text-gray-900 group-hover:text-[#007ACC] dark:text-white dark:group-hover:text-blue-300">{row.name}</h3>
                            <Show when={row.description}><p class="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{row.description}</p></Show>
                            <div class="mt-auto space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                              <div class="flex justify-between"><span>Operation:</span><span class="rounded-full bg-purple-100/80 px-2 py-0.5 font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? "Contour"}</span></div>
                              <div class="flex justify-between"><span>ID:</span><code class="font-mono text-[#007ACC] dark:text-blue-400">{row.id.substring(0, 8)}...</code></div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between border-t border-gray-200/50 bg-gray-50/50 px-4 py-2.5 dark:border-gray-600/50 dark:bg-gray-700/30">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Updated {formatDate(row.updatedAt)}</span>
                            <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" class={ICON_BUTTON} title="Use in CAM" onClick={() => handOffToCam(row, navigate)}><Cpu size={16} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => openDetail(row)}><Edit size={16} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title="Delete" disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" /></button>
                            </div>
                          </div>
                        </div>
                      )}</For>
                    </div>
                  </Show>
                </Show>
              </Show>
            </Show>
          </Motion.div>
        </div>
      </div>

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
          <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50" disabled={busy()} onClick={() => void confirmDelete()}>Delete</button>
        </div>
      </Modal>
    </Motion.div>
  )
}
