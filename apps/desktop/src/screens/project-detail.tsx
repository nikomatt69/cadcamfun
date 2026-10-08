/**
 * Project details (legacy `pages/projects/[id].tsx`): the project's header with Edit / Delete, and tabs for its
 * drawings, components and toolpaths as cards, each opening in its editor. It is a dashboard of the project, not an
 * editor: a drawing opens in the CAD page (`/cad?drawingId=`), a component on its page, a toolpath in the CAM page.
 */
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Check, Clock, Copy, Download, Edit, File, Grid, History, Plus, Trash2, Users, Wrench, X } from "lucide-solid"
import { Field, Select, TextInput, Textarea } from "../components/ui/field.tsx"
import { useApp } from "../state/context.ts"
import { invalidatePrefix } from "../state/query-cache.ts"

interface Project { readonly id: string; readonly name: string; readonly description: string | null; readonly updatedAt: string; readonly ownerId: string; readonly organizationId: string | null }
interface Card { readonly id: string; readonly name: string; readonly description?: string | null; readonly thumbnail?: string | null; readonly updatedAt?: string; readonly gcode?: string | null; readonly operationType?: string | null }
type Tab = "drawings" | "components" | "toolpaths"
type ModalKind = "edit" | "delete" | "drawing" | "component" | "toolpath" | undefined

const BUTTON = "px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center text-sm font-medium transition-colors"
const PRIMARY = "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20 transition-colors"
const CARD = "bg-white dark:bg-gray-900 shadow-md rounded-xl overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
const ICON_BTN = "p-1.5 text-gray-500 dark:text-gray-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400"
const TABS: ReadonlyArray<{ readonly id: Tab; readonly label: string }> = [
  { id: "drawings", label: "Drawings" }, { id: "components", label: "Components" }, { id: "toolpaths", label: "Toolpaths" }
]

/** The app's modal markup (as in "Save as Project"): a scrim, a card with a title and a close button, Escape closes. */
function Modal(props: { readonly open: boolean; readonly onClose: () => void; readonly title: string; readonly size?: "sm" | "md"; readonly children: JSX.Element }): JSX.Element {
  createEffect(() => {
    if (!props.open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") props.onClose() }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 bg-gray-600/50 dark:bg-black/60 flex items-center justify-center z-50" onClick={() => props.onClose()}>
        <div
          role="dialog" aria-modal="true" aria-label={props.title}
          class={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${props.size === "sm" ? "max-w-sm" : "max-w-md"} w-full border border-gray-200 dark:border-gray-700`}
          onClick={(event) => event.stopPropagation()}
        >
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{props.title}</h3>
            <button type="button" class="text-gray-400 hover:text-gray-500 transition-colors" aria-label="Close" onClick={() => props.onClose()}><X size={20} /></button>
          </div>
          <div class="px-6 py-4 space-y-3">{props.children}</div>
        </div>
      </div>
    </Show>
  )
}

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
  const remove = (): Promise<void> => attempt(async () => {
    await run(app.client.projects.remove({ params: { id: params.id } }))
    invalidatePrefix(app.cache, "projects"); app.forgetProject(params.id); navigate("/projects")
  })
  const createDrawing = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.drawings.createForProject({ params: { id: params.id }, payload: { name: form().name.trim(), description: form().description || null, data: { elements: [], version: "1.0" } } }))
    setDrawings((previous) => [row, ...previous]); setModal(undefined); navigate(`/cad?drawingId=${row.id}`)
  }) }
  const createComponent = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.components.createForProject({ params: { id: params.id }, payload: { name: form().name.trim(), description: form().description || null, type: "custom" } }))
    setComponents((previous) => [row, ...previous]); setModal(undefined); navigate(`/components/${row.id}`)
  }) }
  const createToolpath = (event: Event): Promise<void> => { event.preventDefault(); return attempt(async () => {
    const row = await run<Card>(app.client.toolpaths.create({ payload: { name: form().name.trim(), description: form().description || null, type: form().type, operationType: form().operationType, projectId: params.id, data: {}, gcode: "", isPublic: false } }))
    setToolpaths((previous) => [row, ...previous]); setModal(undefined); openToolpath(row)
  }) }

  const openToolpath = (row: Card): void => {
    // The CAM page picks the program up from local storage (the same hand-off the toolpaths page uses).
    try { localStorage.setItem("toolpathToLoadInCAM", JSON.stringify({ id: row.id, name: row.name, gcode: row.gcode ?? "" })) } catch { /* storage blocked: CAM opens empty */ }
    navigate(`/cam?loadToolpath=${row.id}`)
  }
  const duplicateDrawing = (row: Card): Promise<void> => attempt(async () => {
    const full = await run<{ data: unknown }>(app.client.drawings.get({ params: { id: row.id } }))
    const copy = await run<Card>(app.client.drawings.createForProject({ params: { id: params.id }, payload: { name: `${row.name} (copy)`, description: row.description ?? null, data: full.data } }))
    setDrawings((previous) => [copy, ...previous]); flash("Drawing duplicated")
  })
  const deleteDrawing = (row: Card): Promise<void> => attempt(async () => {
    if (!window.confirm(`Delete drawing "${row.name}"?`)) return
    await run(app.client.drawings.remove({ params: { id: row.id } }))
    setDrawings((previous) => previous.filter((item) => item.id !== row.id)); flash("Drawing deleted")
  })
  const downloadDrawing = (row: Card): Promise<void> => attempt(async () => {
    const full = await run<{ data: unknown }>(app.client.drawings.get({ params: { id: row.id } }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(full.data, null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${row.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })

  const stop = (action: () => void) => (event: MouseEvent): void => { event.stopPropagation(); action() }
  /** Version history of one item: the commits that touched its file in the project's repository. */
  const historyButton = (directory: "drawings" | "components" | "toolpaths", row: Card): JSX.Element => (
    <button type="button" class={ICON_BTN} title="History" aria-label={`History of ${row.name}`} onClick={stop(() => navigate(`/projects/${params.id}/history?path=${directory}/${row.id}.json`))}><History size={16} /></button>
  )

  const empty = (icon: JSX.Element, tone: string, title: string, text: string, label: string, kind: ModalKind): JSX.Element => (
    <Motion.div class="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-8 text-center border border-gray-100 dark:border-gray-800" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <div class={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 ${tone}`}>{icon}</div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-3">{title}</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">{text}</p>
      <button type="button" class={`${PRIMARY} mx-auto`} onClick={() => open(kind)}><Plus size={18} class="mr-1.5" />{label}</button>
    </Motion.div>
  )

  const cards = (rows: ReadonlyArray<Card>, thumb: JSX.Element, onOpen: (row: Card) => void, actions?: (row: Card) => JSX.Element, showDate?: boolean): JSX.Element => (
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
      <For each={rows}>
        {(row) => (
          <div class={CARD} onClick={() => onOpen(row)} data-testid={`project-card-${row.id}`}>
            <div class="h-44 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
              <Show when={row.thumbnail} fallback={thumb}>{(src) => <img src={src()} alt={row.name} class="h-full w-full object-contain" />}</Show>
            </div>
            <div class="p-5">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{row.name}</h3>
              <Show when={row.description}><p class="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{row.description}</p></Show>
              <Show when={showDate && row.updatedAt}><div class="mt-2 text-xs text-gray-500">Updated: {formatDate(row.updatedAt)}</div></Show>
            </div>
            <Show when={actions}><div class="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-1">{actions!(row)}</div></Show>
          </div>
        )}
      </For>
    </div>
  )

  const submit = (label: string, pending: string): JSX.Element => (
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" class={BUTTON} onClick={() => setModal(undefined)}>Cancel</button>
      <button type="submit" class={PRIMARY} disabled={busy() || form().name.trim() === ""}>{busy() ? pending : label}</button>
    </div>
  )
  const nameFields = (): JSX.Element => (
    <>
      <Field label="Name" required>{(ids) => <TextInput id={ids.id} value={form().name} onInput={field("name")} />}</Field>
      <Field label="Description">{(ids) => <Textarea id={ids.id} rows={3} value={form().description} onInput={field("description")} />}</Field>
    </>
  )

  return (
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" data-testid="project-detail">
      <div class="p-4 md:p-6 max-w-7xl mx-auto">
        <Show when={message()}>
          <div class="fixed top-4 right-4 z-50 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-lg max-w-sm flex items-center" role="status">
            <Check size={20} class="mr-2 flex-shrink-0" /><p>{message()}</p>
          </div>
        </Show>

        <Show when={!loading()} fallback={
          <div class="flex flex-col items-center justify-center min-h-[60vh]" role="status">
            <div class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p class="text-lg text-gray-600 mt-4">Loading project details...</p>
          </div>
        }>
          <Show when={project()} fallback={
            <div class="flex flex-col items-center justify-center p-6 text-center min-h-[60vh]">
              <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6"><File size={36} class="text-gray-400" /></div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Project Not Found</h1>
              <p class="text-gray-600 dark:text-gray-300 mb-8 max-w-md">The project you are looking for doesn't exist or you don't have access to it.</p>
              <button type="button" class={PRIMARY} onClick={() => navigate("/projects")}>Back to Projects</button>
            </div>
          }>
            {(current) => (
              <>
                <div class="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-5 md:p-6 mb-8 border border-gray-100 dark:border-gray-800">
                  <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                      <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{current().name}</h1>
                      <Show when={current().description}><p class="text-gray-600 dark:text-gray-300 mt-2">{current().description}</p></Show>
                      <div class="mt-4 flex flex-wrap items-center text-sm text-gray-500 dark:text-gray-400 gap-4">
                        <div class="flex items-center"><Clock size={16} class="mr-1.5" /><span>Updated: {formatDate(current().updatedAt)}</span></div>
                        <div class="flex items-center"><Users size={16} class="mr-1.5" /><span>{current().organizationId ? "Organization" : "Personal"}</span></div>
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class={BUTTON} onClick={() => navigate(`/projects/${params.id}/history`)}>Version control</button>
                      <button type="button" class={BUTTON} onClick={() => open("edit")}><Edit size={16} class="mr-1.5" />Edit</button>
                      <button type="button" class={`${BUTTON} !text-red-600 dark:!text-red-400`} onClick={() => open("delete")}><Trash2 size={16} class="mr-1.5" />Delete</button>
                    </div>
                  </div>
                </div>

                <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
                  <nav class="-mb-px flex space-x-8" role="tablist">
                    <For each={TABS}>
                      {(item) => (
                        <button
                          type="button" role="tab" aria-selected={tab() === item.id}
                          class={`px-4 py-2 font-medium text-sm focus:outline-none relative border-b-2 transition-colors ${tab() === item.id ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400" : "text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300"}`}
                          onClick={() => setTab(item.id)}
                        >{item.label}</button>
                      )}
                    </For>
                  </nav>
                </div>

                <Show when={tab() === "drawings"}>
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 class="text-lg font-medium text-gray-900 dark:text-white">Project Drawings</h2>
                    <button type="button" class={PRIMARY} onClick={() => open("drawing")}><Plus size={16} class="mr-1.5" />New Drawing</button>
                  </div>
                  <Show when={drawings().length > 0} fallback={empty(<File size={32} class="text-blue-500" />, "bg-blue-50 dark:bg-blue-900/20", "No drawings yet", "Create your first drawing to start designing in the CAD editor.", "Create Drawing", "drawing")}>
                    {cards(drawings(), <div class="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-full"><Grid size={40} class="text-blue-500" /></div>, (row) => navigate(`/cad?drawingId=${row.id}`), (row) => (
                      <>
                        {historyButton("drawings", row)}
                        <button type="button" class={ICON_BTN} title="Duplicate" aria-label={`Duplicate ${row.name}`} onClick={stop(() => void duplicateDrawing(row))}><Copy size={16} /></button>
                        <button type="button" class={ICON_BTN} title="Download" aria-label={`Download ${row.name}`} onClick={stop(() => void downloadDrawing(row))}><Download size={16} /></button>
                        <button type="button" class={`${ICON_BTN} hover:!text-red-600`} title="Delete" aria-label={`Delete ${row.name}`} onClick={stop(() => void deleteDrawing(row))}><Trash2 size={16} /></button>
                      </>
                    ), true)}
                  </Show>
                </Show>

                <Show when={tab() === "components"}>
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 class="text-lg font-medium text-gray-900 dark:text-white">Project Components</h2>
                    <button type="button" class={PRIMARY} onClick={() => open("component")}><Plus size={16} class="mr-1.5" />New Component</button>
                  </div>
                  <Show when={components().length > 0} fallback={empty(<File size={32} class="text-purple-500" />, "bg-purple-50 dark:bg-purple-900/20", "No components yet", "Create reusable components to use across your CAD drawings.", "Create Component", "component")}>
                    {cards(components(), <div class="p-6 bg-purple-50 dark:bg-purple-900/20 rounded-full"><File size={36} class="text-purple-500" /></div>, (row) => navigate(`/components/${row.id}`), (row) => historyButton("components", row))}
                  </Show>
                </Show>

                <Show when={tab() === "toolpaths"}>
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 class="text-lg font-medium text-gray-900 dark:text-white">Project Toolpaths</h2>
                    <button type="button" class={PRIMARY} onClick={() => open("toolpath")}><Plus size={16} class="mr-1.5" />New Toolpath</button>
                  </div>
                  <Show when={toolpaths().length > 0} fallback={empty(<Wrench size={32} class="text-green-500" />, "bg-green-50 dark:bg-green-900/20", "No toolpaths yet", "Create toolpaths to generate G-code for your machine.", "Create Toolpath", "toolpath")}>
                    {cards(toolpaths(), <div class="p-6 bg-green-50 dark:bg-green-900/20 rounded-full"><Wrench size={36} class="text-green-500" /></div>, openToolpath, (row) => historyButton("toolpaths", row), true)}
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
        <p class="text-gray-600 dark:text-gray-300">Delete <strong>{project()?.name}</strong> with all its drawings, components and toolpaths? This cannot be undone.</p>
        <Show when={problem()}><p class="ui-field-error" role="alert">{problem()}</p></Show>
        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class={BUTTON} onClick={() => setModal(undefined)}>Cancel</button>
          <button type="button" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg" disabled={busy()} onClick={() => void remove()}>{busy() ? "Deleting..." : "Delete Project"}</button>
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
    </div>
  )
}
