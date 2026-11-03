/**
 * The toolpaths list (legacy `pages/toolpaths/index.tsx`), laid out in the CAM workspace style.
 *
 * Same workspace chrome as `/cam`: a compact toolbar with the page actions, a
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
import { cam } from "@cadcamfun/core"
import { programStatusText } from "../../cam/lib/model-change.ts"
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
  let loadSequence = 0
  let mounted = true

  /** Programs the kernel made whose drawing no longer matches their model (spec 59 A2): computed here from the stored request and the drawing, 24 drawings at most. */
  const [stale, setStale] = createSignal<ReadonlyMap<string, string>>(new Map())
  const loadModelStatus = async (list: ReadonlyArray<ToolpathRow>, sequence: number): Promise<void> => {
    const native = list.filter((row) => row.drawingId != null && row.data !== null && typeof row.data === "object" && (row.data as Record<string, unknown>)["kernelRequest"] !== undefined)
    const ids = [...new Set(native.map((row) => row.drawingId!))].slice(0, 24)
    const found = new Map<string, ReadonlyArray<Record<string, unknown>>>()
    await Promise.all(ids.map(async (id) => {
      try {
        const drawing = await run<{ readonly data?: unknown }>(app.client.drawings.get({ params: { id } }))
        const elements = (drawing.data as { elements?: unknown } | null)?.elements
        if (Array.isArray(elements)) found.set(id, elements.filter((e): e is Record<string, unknown> => e !== null && typeof e === "object"))
      } catch { /* a drawing that cannot be opened gives no badge */ }
    }))
    if (!mounted || sequence !== loadSequence) return
    const next = new Map<string, string>()
    for (const row of native) {
      const elements = found.get(row.drawingId!)
      if (elements === undefined) continue
      const status = cam.kernel.programStatus({ request: (row.data as Record<string, unknown>)["kernelRequest"] }, { elements })
      if (status.status === "stale") next.set(row.id, programStatusText(status).text)
    }
    setStale(next)
  }

  const load = async (): Promise<void> => {
    const sequence = ++loadSequence
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
      if (mounted && sequence === loadSequence) { setRows(list); void loadModelStatus(list, sequence) }
    } catch (cause) {
      if (mounted && sequence === loadSequence) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted && sequence === loadSequence) setLoading(false)
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
  onCleanup(() => { mounted = false; loadSequence += 1; clearTimeout(debounce) })

  const update = (patch: Partial<ToolpathFilters>): void => {
    const next: ToolpathFilters = { ...filters(), ...patch }
    setFilters(next)
  }
  const clearFilters = (): void => {
    setFilters({ search: "", type: "", operationType: "", projectId: "" })
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
            <Search size={14} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ent-text-faint)]" />
            <input
              type="search"
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
          <button type="button" class="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ent-text-muted)] transition-colors hover:text-[color:var(--ent-text)] disabled:opacity-40" onClick={clearFilters} disabled={!hasFilters()}>
            <X size={14} aria-hidden="true" />{t("pages.clear.filters")}
          </button>
          <div class="workspace-view-toggle" role="group" aria-label={t("cam.multi.view")}>
            <button type="button" class="workspace-view-toggle__btn" title={t("pages.grid.view")} aria-label={t("pages.grid.view")} aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={16} aria-hidden="true" /></button>
            <button type="button" class="workspace-view-toggle__btn" title={t("pages.list.view")} aria-label={t("pages.list.view")} aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </>}
    >
            <Show when={!loading()} fallback={<StageLoading label={t("pages.loading.toolpaths")} />}>
              <Show when={error() === undefined} fallback={<StageError message={error() ?? ""} onRetry={() => void load()} />}>
                <Show
                  when={rows().length > 0}
                  fallback={
                    <StageEmpty
                      icon={<Code size={20} aria-hidden="true" />}
                      preview={hasFilters() ? undefined : "cam"}
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
                              <th scope="col"><span class="sr-only">{t("vcs.tab.actions")}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={rows()}>{(row) => (
                              <tr onClick={() => openDetail(row)}>
                                <td>
                                  <div class="flex items-center gap-2">
                                    <div class="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)]"><Code size={16} class="text-[color:var(--ent-text-faint)]" aria-hidden="true" /></div>
                                    <div>
                                      <A href={`/toolpaths/${encodeURIComponent(row.id)}`} class="text-xs font-medium text-[color:var(--ent-text)] hover:text-[color:var(--ent-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ent-accent)]" onClick={(event) => event.stopPropagation()}>{row.name}</A>
                                      <Show when={row.description}><div class="max-w-xs truncate text-[11px] text-[color:var(--ent-text-muted)]">{row.description}</div></Show>
                                      <Show when={stale().get(row.id)}>{(reason) => <span class={BADGE} title={reason()} data-testid="toolpath-stale-badge">{t("cam.kernel.model.badge")}</span>}</Show>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span class={`${BADGE} mr-1`}>{TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? t("pages.mill")}</span>
                                  <span class={BADGE}>{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? t("cam.strategy.contour")}</span>
                                </td>
                                <td class="text-[color:var(--ent-text-muted)]">{projectName(row.projectId)}</td>
                                <td class="text-[color:var(--ent-text-muted)]">{formatDate(row.updatedAt)}</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <div class="flex justify-end gap-1">
                                    <button type="button" class={ICON_BUTTON} title={t("pages.use.in.cam")} aria-label={`${t("pages.use.in.cam")}: ${row.name}`} onClick={() => handOffToCam(row, navigate)}><Cpu size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("cam.multi.downloadGcode")} aria-label={`${t("cam.multi.downloadGcode")}: ${row.name}`} onClick={() => navigate(`/toolpaths/${encodeURIComponent(row.id)}?download=true`)}><Download size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("cad.ribbon.edit")} aria-label={`${t("cad.ribbon.edit")}: ${row.name}`} onClick={() => openEdit(row)}><Edit size={16} aria-hidden="true" /></button>
                                    <button type="button" class={ICON_BUTTON} title={t("common.delete")} aria-label={`${t("common.delete")}: ${row.name}`} disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" /></button>
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
                        <div class={CARD}>
                          <A href={`/toolpaths/${encodeURIComponent(row.id)}`} class="flex flex-1 flex-col text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--ent-accent)]">
                          <CardBanner
                            icon={<Wrench size={16} aria-hidden="true" />}
                            badge={TYPE_LABEL[row.type ?? "mill"] ?? row.type ?? t("pages.mill")}
                            leftBadge={row.isPublic ? t("save.publicProject") : undefined}
                          />
                          <div class="flex flex-1 flex-col gap-1.5 p-3">
                            <h3 class="text-xs font-semibold text-[color:var(--ent-text)]">{row.name}</h3>
                            <Show when={stale().get(row.id)}>{(reason) => <span class={BADGE} title={reason()} data-testid="toolpath-stale-badge">{t("cam.kernel.model.badge")}</span>}</Show>
                            <Show when={row.description}><p class="line-clamp-2 text-[11px] text-[color:var(--ent-text-muted)]">{row.description}</p></Show>
                            <div class="mt-auto space-y-1 text-[11px] text-[color:var(--ent-text-muted)]">
                              <div class="flex items-center justify-between gap-2"><span>{t("cam.operations.current")}</span><span class={BADGE}>{OPERATION_LABEL[row.operationType ?? "contour"] ?? row.operationType ?? t("cam.strategy.contour")}</span></div>
                              <div class="flex items-center justify-between gap-2"><span>{t("cam.save.project")}</span><span class="max-w-[60%] truncate text-right">{projectName(row.projectId)}</span></div>
                            </div>
                          </div>
                          </A>
                          <div class="flex items-center justify-between border-t border-[color:var(--ent-line)] px-3 py-2">
                            <span class="text-[11px] text-[color:var(--ent-text-muted)]">{t("projects.column.updated")} {formatDate(row.updatedAt)}</span>
                            <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" class={ICON_BUTTON} title={t("pages.use.in.cam")} aria-label={`${t("pages.use.in.cam")}: ${row.name}`} onClick={() => handOffToCam(row, navigate)}><Cpu size={16} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title={t("cad.ribbon.edit")} aria-label={`${t("cad.ribbon.edit")}: ${row.name}`} onClick={() => openEdit(row)}><Edit size={16} aria-hidden="true" /></button>
                              <button type="button" class={ICON_BUTTON} title={t("common.delete")} aria-label={`${t("common.delete")}: ${row.name}`} disabled={busy()} onClick={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" /></button>
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
        <p class="text-sm text-[color:var(--ent-text)]">{t("pages.are.you.sure.you.want.to.delete.this.toolpath")}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-[5px] border border-[color:var(--ent-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--ent-text-muted)] hover:bg-[color:var(--ent-surface-subtle)]" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class="rounded-[5px] border border-[color:var(--ent-bad)] bg-[color:var(--ent-bad-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ent-bad)] hover:bg-[color:var(--ent-surface-inset)] disabled:opacity-50" disabled={busy()} onClick={() => void confirmDelete()}>{t("common.delete")}</button>
        </div>
      </Modal>
    </>
  )
}
