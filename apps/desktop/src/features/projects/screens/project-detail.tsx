import { saveFile } from "../../../shared/lib/save-file.ts"
/**
 * Project details (legacy `pages/projects/[id].tsx`): the project's header with Edit / Delete, and tabs for its
 * drawings, components and toolpaths as cards, each opening in its editor. It is a dashboard of the project, not an
 * editor: a drawing opens in the CAD page (`/cad?drawingId=`), a component on its page, a toolpath in the CAM page.
 */
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Check, Clock, Copy, Download, Edit, File, Grid, History, Plus, Trash2, Users, Wrench, X } from "lucide-solid"
import { Field, Select, TextInput, Textarea } from "../../../shared/ui/field.tsx"
import { Modal } from "../../../shared/ui/modal.tsx"
import {
  CANCEL_BUTTON,
  CARD,
  DANGER_BUTTON,
  ICON_BUTTON,
  PANEL,
  StageEmpty,
  StageLoading,
  SUBMIT_BUTTON,
  TOOLBAR_BUTTON,
  TOOLBAR_PRIMARY,
  WorkspaceDetail,
  WorkspaceTabs
} from "../../../shared/components/WorkspacePage.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { onCacheInvalidated } from "../../../shared/state/queries.ts"

interface Project { readonly id: string; readonly name: string; readonly description: string | null; readonly updatedAt: string; readonly ownerId: string; readonly organizationId: string | null }
interface Card { readonly id: string; readonly name: string; readonly description?: string | null; readonly thumbnail?: string | null; readonly updatedAt?: string; readonly gcode?: string | null; readonly operationType?: string | null }
type Tab = "drawings" | "components" | "toolpaths"
type ModalKind = "edit" | "delete" | "drawing" | "component" | "toolpath" | undefined

const TABS: ReadonlyArray<{ readonly id: Tab; readonly label: string }> = [
  { id: "drawings", label: "Drawings" }, { id: "components", label: "Components" }, { id: "toolpaths", label: "Toolpaths" }
]

const formatDate = (iso: string | undefined): string => (iso === undefined ? "" : new Date(iso).toLocaleDateString())

export function ProjectDetailScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const router = useNavigate()
  // An explicit `state` keeps the history API happy in every webview (and in the test DOM).
  const navigate = (path: string): void => { router(path, { state: {} }) }
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>

  const [project, setProject] = createSignal<Project | undefined>()
  const [drawings, setDrawings] = createSignal<ReadonlyArray<Card>>([])
  const [components, setComponents] = createSignal<ReadonlyArray<Card>>([])
  const [toolpaths, setToolpaths] = createSignal<ReadonlyArray<Card>>([])
  const [loading, setLoading] = createSignal(true)
  const [tab, setTab] = createSignal<Tab>("drawings")
  const [modal, setModal] = createSignal<ModalKind>(undefined)
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal<string | undefined>()
  const [problem, setProblem] = createSignal<string | undefined>()
  const [form, setForm] = createSignal({ name: "", description: "", type: "mill", operationType: "contour" })

  const flash = (text: string): void => { setMessage(text); setTimeout(() => setMessage(undefined), 3000) }
  const field = (key: "name" | "description" | "type" | "operationType") => (event: { currentTarget: { value: string } }): void => {
    setForm((previous) => ({ ...previous, [key]: event.currentTarget.value }))
  }

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const row = await run<Project>(app.client.projects.get({ params: { id: params.id } }))
      setProject(row)
      app.rememberProject(row.id, row.name)
      const [d, c, t] = await Promise.all([
        run<ReadonlyArray<Card>>(app.client.drawings.listForProject({ params: { id: params.id } })).catch(() => []),
        run<ReadonlyArray<Card>>(app.client.components.listForProject({ params: { id: params.id } })).catch(() => []),
        run<ReadonlyArray<Card>>(app.client.toolpaths.list({ query: { projectId: params.id } })).catch(() => [])
      ])
      setDrawings(d); setComponents(c); setToolpaths(t)
    } catch {
      setProject(undefined)
    } finally { setLoading(false) }
  }
  onMount(() => { void load() })
  onCacheInvalidated(app.cache, () => { void load() })

  const open = (kind: ModalKind): void => {
    setProblem(undefined)
    const current = project()
    setForm(kind === "edit" && current ? { name: current.name, description: current.description ?? "", type: "mill", operationType: "contour" } : { name: "", description: "", type: "mill", operationType: "contour" })
    setModal(kind)
  }
  const attempt = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true); setProblem(undefined)
    try { await work() } catch (cause) { setProblem(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }

  const update = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Project>(app.client.projects.update({ params: { id: params.id }, payload: { name: form().name.trim(), description: form().description } }))
    setProject((previous) => ({ ...(previous as Project), ...row })); setModal(undefined); flash("Project updated successfully")
    invalidatePrefix(app.cache, "projects")
  }) }
  /** Counts on the project cards and the library / toolpath lists change with the project's contents. */
  const touchContents = (): void => { for (const prefix of ["projects", "drawings", "components", "toolpaths"]) invalidatePrefix(app.cache, prefix) }
  const remove = (): Promise<void> => attempt(async () => {
    await run(app.client.projects.remove({ params: { id: params.id } }))
    app.cache.invalidate(); app.forgetProject(params.id); navigate("/projects")
  })
  const createDrawing = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.drawings.createForProject({ params: { id: params.id }, payload: { name: form().name.trim(), description: form().description || null, data: { elements: [], version: "1.0" } } }))
    touchContents(); setDrawings((previous) => [row, ...previous]); setModal(undefined); navigate(`/cad?drawingId=${row.id}`)
  }) }
  const createComponent = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.components.createForProject({ params: { id: params.id }, payload: { name: form().name.trim(), description: form().description || null, type: "custom" } }))
    touchContents(); setComponents((previous) => [row, ...previous]); setModal(undefined); navigate(`/components/${row.id}`)
  }) }
  const createToolpath = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.toolpaths.create({ payload: { name: form().name.trim(), description: form().description || null, type: form().type, operationType: form().operationType, projectId: params.id, data: {}, gcode: "", isPublic: false } }))
    touchContents(); setToolpaths((previous) => [row, ...previous]); setModal(undefined); openToolpath(row)
  }) }

  const openToolpath = (row: Card): void => {
    // The CAM page picks the program up from local storage (the same hand-off the toolpaths page uses).
    try { localStorage.setItem("toolpathToLoadInCAM", JSON.stringify({ id: row.id, name: row.name, gcode: row.gcode ?? "" })) } catch { /* storage blocked: CAM opens empty */ }
    navigate(`/cam?loadToolpath=${row.id}`)
  }
  const duplicateDrawing = (row: Card): Promise<void> => attempt(async () => {
    const full = await run<{ data: unknown }>(app.client.drawings.get({ params: { id: row.id } }))
    const copy = await run<Card>(app.client.drawings.createForProject({ params: { id: params.id }, payload: { name: `${row.name} (copy)`, description: row.description ?? null, data: full.data } }))
    touchContents(); setDrawings((previous) => [copy, ...previous]); flash("Drawing duplicated")
  })
  const deleteDrawing = (row: Card): Promise<void> => attempt(async () => {
    if (!window.confirm(`Delete drawing "${row.name}"?`)) return
    await run(app.client.drawings.remove({ params: { id: row.id } }))
    touchContents(); setDrawings((previous) => previous.filter((item) => item.id !== row.id)); flash("Drawing deleted")
  })
  const downloadDrawing = (row: Card): Promise<void> => attempt(async () => {
    const full = await run<{ data: unknown }>(app.client.drawings.get({ params: { id: row.id } }))
    await saveFile({ name: `${row.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`, data: JSON.stringify(full.data, null, 2), mime: "application/json" })
  })

  const stop = (action: () => void) => (event: MouseEvent): void => { event.stopPropagation(); action() }
  /** Version history of one item: the commits that touched its file in the project's repository. */
  const historyButton = (directory: "drawings" | "components" | "toolpaths", row: Card): JSX.Element => (
    <button type="button" class={ICON_BUTTON} title="History" aria-label={`History of ${row.name}`} onClick={stop(() => navigate(`/projects/${params.id}/history?path=${directory}/${row.id}.json`))}><History size={16} /></button>
  )

  const empty = (icon: JSX.Element, title: string, text: string, label: string, kind: ModalKind): JSX.Element => (
    <StageEmpty icon={icon} title={title} hint={text}>
      <button type="button" class={TOOLBAR_PRIMARY} onClick={() => open(kind)}><Plus size={14} aria-hidden="true" />{label}</button>
    </StageEmpty>
  )

  const cards = (rows: ReadonlyArray<Card>, thumb: JSX.Element, onOpen: (row: Card) => void, actions?: (row: Card) => JSX.Element, showDate?: boolean): JSX.Element => (
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <For each={rows}>
        {(row) => (
          <div class={CARD} onClick={() => onOpen(row)} data-testid={`project-card-${row.id}`}>
            <div class="flex h-24 items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-700/70 dark:bg-slate-800/40">
              <Show when={row.thumbnail} fallback={thumb}>{(src) => <img src={src()} alt={row.name} class="h-full w-full object-contain" />}</Show>
            </div>
            <div class="p-3">
              <h3 class="text-xs font-semibold text-slate-900 dark:text-white">{row.name}</h3>
              <Show when={row.description}><p class="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{row.description}</p></Show>
              <Show when={showDate && row.updatedAt}><div class="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Updated {formatDate(row.updatedAt)}</div></Show>
            </div>
            <Show when={actions}><div class="flex justify-end gap-1 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-800/30">{actions!(row)}</div></Show>
          </div>
        )}
      </For>
    </div>
  )

  const submit = (label: string, pending: string): JSX.Element => (
    <div class="mt-3 flex justify-end gap-2">
      <button type="button" class={CANCEL_BUTTON} onClick={() => setModal(undefined)}>Cancel</button>
      <button type="submit" class={SUBMIT_BUTTON} disabled={busy() || form().name.trim() === ""}>{busy() ? pending : label}</button>
    </div>
  )
  const nameFields = (): JSX.Element => (
    <>
      <Field label="Name" required>{(ids) => <TextInput id={ids.id} value={form().name} onInput={field("name")} />}</Field>
      <Field label="Description">{(ids) => <Textarea id={ids.id} rows={3} value={form().description} onInput={field("description")} />}</Field>
    </>
  )

  return (
    <WorkspaceDetail
      testId="project-detail"
      title={project()?.name ?? "Project"}
      subtitle="Project"
      backHref="/projects"
      backLabel="Back to Projects"
      actions={<Show when={project()}>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => navigate(`/projects/${params.id}/history`)}>Version control</button>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => open("edit")}><Edit size={16} aria-hidden="true" />Edit</button>
        <button type="button" class={`${TOOLBAR_BUTTON} !text-red-600 dark:!text-red-400`} onClick={() => open("delete")}><Trash2 size={16} aria-hidden="true" />Delete</button>
      </Show>}
    >
      <div class="mx-auto w-full max-w-7xl">
        <Show when={message()}>
          <div class="workspace-badge workspace-badge--ok fixed right-4 top-4 z-50 !px-3 !py-1.5" role="status">
            <Check size={14} aria-hidden="true" /><span>{message()}</span>
          </div>
        </Show>

        <Show when={!loading()} fallback={<StageLoading label="Loading project details..." />}>
          <Show when={project()} fallback={
            <StageEmpty icon={<File size={22} />} title="Project not found" hint="The project you are looking for doesn't exist or you don't have access to it.">
              <button type="button" class={TOOLBAR_BUTTON} onClick={() => navigate("/projects")}>Back to Projects</button>
            </StageEmpty>
          }>
            {(current) => (
              <>
                <div class={`${PANEL} mb-3`}>
                  <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <h2 class="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{current().name}</h2>
                      <Show when={current().description}><p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{current().description}</p></Show>
                      <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <div class="flex items-center gap-1"><Clock size={13} aria-hidden="true" /><span>Updated: {formatDate(current().updatedAt)}</span></div>
                        <div class="flex items-center gap-1"><Users size={13} aria-hidden="true" /><span>{current().organizationId ? "Organization" : "Personal"}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <WorkspaceTabs class="mb-3" tabs={TABS} value={tab()} onChange={setTab} label="Project sections" />

                <Show when={tab() === "drawings"}>
                  <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">Project Drawings</h2>
                    <button type="button" class={TOOLBAR_PRIMARY} onClick={() => open("drawing")}><Plus size={14} aria-hidden="true" />New Drawing</button>
                  </div>
                  <Show when={drawings().length > 0} fallback={empty(<File size={22} />, "No drawings yet", "Create your first drawing to start designing in the CAD editor.", "Create Drawing", "drawing")}>
                    {cards(drawings(), <div class="flex h-16 w-16 items-center justify-center border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40"><Grid size={28} /></div>, (row) => navigate(`/cad?drawingId=${row.id}`), (row) => (
                      <>
                        {historyButton("drawings", row)}
                        <button type="button" class={ICON_BUTTON} title="Duplicate" aria-label={`Duplicate ${row.name}`} onClick={stop(() => void duplicateDrawing(row))}><Copy size={16} /></button>
                        <button type="button" class={ICON_BUTTON} title="Download" aria-label={`Download ${row.name}`} onClick={stop(() => void downloadDrawing(row))}><Download size={16} /></button>
                        <button type="button" class={`${ICON_BUTTON} hover:!text-red-600`} title="Delete" aria-label={`Delete ${row.name}`} onClick={stop(() => void deleteDrawing(row))}><Trash2 size={16} /></button>
                      </>
                    ), true)}
                  </Show>
                </Show>

                <Show when={tab() === "components"}>
                  <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">Project Components</h2>
                    <button type="button" class={TOOLBAR_PRIMARY} onClick={() => open("component")}><Plus size={14} aria-hidden="true" />New Component</button>
                  </div>
                  <Show when={components().length > 0} fallback={empty(<File size={22} />, "No components yet", "Create reusable components to use across your CAD drawings.", "Create Component", "component")}>
                    {cards(components(), <div class="flex h-16 w-16 items-center justify-center border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40"><File size={28} /></div>, (row) => navigate(`/components/${row.id}`), (row) => historyButton("components", row))}
                  </Show>
                </Show>

                <Show when={tab() === "toolpaths"}>
                  <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">Project Toolpaths</h2>
                    <button type="button" class={TOOLBAR_PRIMARY} onClick={() => open("toolpath")}><Plus size={14} aria-hidden="true" />New Toolpath</button>
                  </div>
                  <Show when={toolpaths().length > 0} fallback={empty(<Wrench size={22} />, "No toolpaths yet", "Create toolpaths to generate G-code for your machine.", "Create Toolpath", "toolpath")}>
                    {cards(toolpaths(), <div class="flex h-16 w-16 items-center justify-center border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40"><Wrench size={28} /></div>, openToolpath, (row) => historyButton("toolpaths", row), true)}
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>

      <Modal open={modal() === "edit"} onClose={() => setModal(undefined)} title="Edit Project">
        <form onSubmit={(event) => void update(event)}>{nameFields()}<Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>{submit("Save Changes", "Saving...")}</form>
      </Modal>
      <Modal open={modal() === "delete"} onClose={() => setModal(undefined)} title="Delete Project" size="sm">
        <p class="text-slate-600 dark:text-slate-300">Delete <strong>{project()?.name}</strong> with all its drawings, components and toolpaths? This cannot be undone.</p>
        <Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>
        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class={CANCEL_BUTTON} onClick={() => setModal(undefined)}>Cancel</button>
          <button type="button" class={DANGER_BUTTON} disabled={busy()} onClick={() => void remove()}>{busy() ? "Deleting..." : "Delete Project"}</button>
        </div>
      </Modal>
      <Modal open={modal() === "drawing"} onClose={() => setModal(undefined)} title="New Drawing">
        <form onSubmit={(event) => void createDrawing(event)}>{nameFields()}<Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>{submit("Create Drawing", "Creating...")}</form>
      </Modal>
      <Modal open={modal() === "component"} onClose={() => setModal(undefined)} title="New Component">
        <form onSubmit={(event) => void createComponent(event)}>{nameFields()}<Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>{submit("Create Component", "Creating...")}</form>
      </Modal>
      <Modal open={modal() === "toolpath"} onClose={() => setModal(undefined)} title="New Toolpath">
        <form onSubmit={(event) => void createToolpath(event)}>
          {nameFields()}
          <Field label="Machine type">{(ids) => <Select id={ids.id} value={form().type} onChange={field("type")}><option value="mill">Mill</option><option value="lathe">Lathe</option><option value="3dprinter">3D printer</option></Select>}</Field>
          <Field label="Operation">{(ids) => <Select id={ids.id} value={form().operationType} onChange={field("operationType")}><option value="contour">Contour</option><option value="pocket">Pocket</option><option value="drill">Drill</option><option value="engrave">Engrave</option></Select>}</Field>
          <Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>
          {submit("Create Toolpath", "Creating...")}
        </form>
      </Modal>
    </WorkspaceDetail>
  )
}
