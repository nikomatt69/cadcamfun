/**
 * The Resources lists (materials, tools, machines, components), laid out exactly like the toolpaths list: the CAM
 * workspace chrome (`workstation-toolbar`, a left filter rail, a central stage with a grid or a table), a create
 * modal, a delete confirmation, and every card linking to its detail page (`/materials/:id`, `/tools/:id`,
 * `/machine/:id`, `/components/:id`, see `ResourceDetailScreens.tsx`).
 *
 * One screen serves the four kinds; `RESOURCES` holds what differs (typed client calls, card facts, create form).
 * Navigation between the kinds lives in the sidebar's Resources group, replacing the old tabbed "Unified Library Manager".
 */
import { For, Show, createEffect, createMemo, createSignal, on, onMount, type JSX } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { Box, Cpu, Grid3x3, Layers, List, Plus, Search, Trash2, Wrench, X, Edit } from "lucide-solid"
import { toast } from "../components/ui/feedback.tsx"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { invalidatePrefix } from "../state/query-cache.ts"
import { Modal, formatDate } from "../toolpaths/shared.tsx"
import { CARD as GLASS_CARD, FIELD, ICON_BUTTON, INPUT, LABEL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspacePage } from "../components/WorkspacePage.tsx"

export type ResourceKind = "materials" | "tools" | "machines" | "components"
type Row = Readonly<Record<string, unknown>>
type ViewMode = "grid" | "list"
type Project = { readonly id: string; readonly name: string }

interface Fact { readonly label: string; readonly value: string }

interface ResourceMeta {
  readonly singular: string
  readonly plural: string
  readonly path: string
  readonly icon: typeof Box
  /** The badge on the card (the type), if the kind has one. */
  readonly badge: (row: Row) => string
  readonly facts: (row: Row) => ReadonlyArray<Fact>
}

const TH = "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"

const MACHINE_TYPES: Readonly<Record<string, string>> = { mill: "Mill", lathe: "Lathe", printer: "3D Printer", laser: "Laser" }

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value))
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {})
const dash = (value: unknown): string => str(value) || "-"
const cap = (value: string): string => (value === "" ? "" : value.charAt(0).toUpperCase() + value.slice(1))

const machineRows = (value: unknown, depth = 0): ReadonlyArray<unknown> => {
  if (Array.isArray(value)) return value
  if (depth > 1) return []
  const record = asRecord(value)
  return machineRows(record["data"] ?? record["configs"], depth + 1)
}

const RESOURCES: Readonly<Record<ResourceKind, ResourceMeta>> = {
  materials: {
    singular: "Material", plural: "Materials", path: "/materials", icon: Layers,
    badge: () => "Material",
    facts: (row) => {
      const p = asRecord(row["properties"])
      return [{ label: "Density", value: `${dash(p["density"])} kg/m³` }, { label: "Hardness", value: dash(p["hardness"]) }]
    }
  },
  tools: {
    singular: "Tool", plural: "Tools", path: "/tools", icon: Wrench,
    badge: (row) => cap(str(row["type"])) || "Tool",
    facts: (row) => [{ label: "Diameter", value: `${dash(row["diameter"])} mm` }, { label: "Material", value: cap(dash(row["material"])) }]
  },
  machines: {
    singular: "Configuration", plural: "Configurations", path: "/machine", icon: Cpu,
    badge: (row) => MACHINE_TYPES[str(row["type"])] ?? (cap(str(row["type"])) || "Machine"),
    facts: (row) => {
      const c = asRecord(row["config"])
      return [{ label: "Controller", value: dash(c["controller"]) }, { label: "Max spindle", value: `${dash(c["maxSpindleSpeed"])} rpm` }]
    }
  },
  components: {
    singular: "Component", plural: "Components", path: "/components", icon: Box,
    badge: (row) => cap(str(row["type"])) || "Component",
    facts: (row) => [{ label: "Visibility", value: row["isPublic"] === true ? "Public" : "Private" }]
  }
}

export interface ResourcesScreenProps { readonly kind: ResourceKind }

export function ResourcesScreen(props: ResourcesScreenProps): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [urlParams, setUrlParams] = useSearchParams()
  const meta = RESOURCES[props.kind]
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>

  const [search, setSearch] = createSignal("")
  const [type, setType] = createSignal("")
  const [visibility, setVisibility] = createSignal("")
  const [projectId, setProjectId] = createSignal(typeof urlParams.projectId === "string" ? urlParams.projectId : "")
  const [view, setView] = createSignal<ViewMode>("grid")
  const [rows, setRows] = createSignal<ReadonlyArray<Row>>([])
  const [projects, setProjects] = createSignal<ReadonlyArray<Project>>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [createOpen, setCreateOpen] = createSignal(false)
  const [deleting, setDeleting] = createSignal<Row>()

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setRows(await fetchRows(props.kind))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  /** The typed list call of each kind, normalised to plain rows (machines answer the legacy envelope). */
  const fetchRows = async (kind: ResourceKind): Promise<ReadonlyArray<Row>> => {
    if (kind === "materials") return (await run<ReadonlyArray<Row>>(app.client.materials.list({ query: {} }))).map(asRecord)
    if (kind === "tools") return (await run<ReadonlyArray<Row>>(app.client.tools.list({ query: {} }))).map(asRecord)
    if (kind === "machines") {
      // The envelope is `{ data: { data: rows, pagination } }`; older answers carried `{ data: rows }` or `{ configs }`.
      const list = machineRows(asRecord(await run<unknown>(app.client.machineConfigs.list({ query: {} })))["data"])
      return list.map(asRecord).filter((row) => typeof row["id"] === "string")
    }
    // Components belong to a project: gather them across the projects the user can see.
    const list = await run<ReadonlyArray<Project>>(app.client.projects.list())
    const perProject = await Promise.all(list.map((project) => run<ReadonlyArray<Row>>(app.client.components.listForProject({ params: { id: project.id } })).catch(() => [] as ReadonlyArray<Row>)))
    return perProject.flat().map(asRecord)
  }

  onMount(() => {
    void load()
    void run<ReadonlyArray<Project>>(app.client.projects.list())
      .then((list) => setProjects(list.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]))
  })

  const typeOptions = createMemo(() => {
    if (props.kind === "machines") return Object.keys(MACHINE_TYPES)
    if (props.kind === "materials") return []
    return [...new Set(rows().map((row) => str(row["type"])).filter((value) => value !== ""))].sort()
  })

  const filtered = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return rows()
      .filter((row) => needle === "" || `${str(row["name"])} ${str(row["description"])} ${str(row["type"])} ${str(row["material"])}`.toLowerCase().includes(needle))
      .filter((row) => type() === "" || str(row["type"]) === type())
      .filter((row) => visibility() === "" || (visibility() === "public") === (row["isPublic"] === true))
      .filter((row) => projectId() === "" || str(row["projectId"]) === projectId())
      .sort((a, b) => str(a["name"]).localeCompare(str(b["name"])))
  })

  const hasFilters = createMemo(() => search() !== "" || type() !== "" || visibility() !== "" || projectId() !== "")
  const clearFilters = (): void => { setSearch(""); setType(""); setVisibility(""); setProjectId("") }
  const refresh = (): void => { invalidatePrefix(app.cache, props.kind); void load() }

  // The project filter is kept in the URL so the project page can link here (`/components?projectId=`).
  createEffect(on(projectId, (id) => { if (props.kind === "components") setUrlParams({ projectId: id || undefined }, { replace: true }) }, { defer: true }))

  const detailPath = (row: Row): string => `${meta.path}/${encodeURIComponent(str(row["id"]))}`
  const projectName = (id: string): string => projects().find((p) => p.id === id)?.name ?? id

  const create = async (form: FormData): Promise<void> => {
    setBusy(true)
    try {
      const created = await run<unknown>(createCall(props.kind, form))
      // Machine configs answer `{ data }`; the other kinds answer the row.
      const id = str(asRecord(props.kind === "machines" ? asRecord(created)["data"] : created)["id"])
      toast.success(`${meta.singular} created successfully`)
      setCreateOpen(false)
      refresh()
      if (id !== "") navigate(`${meta.path}/${encodeURIComponent(id)}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Failed to create ${meta.singular.toLowerCase()}`)
    } finally {
      setBusy(false)
    }
  }

  const createCall = (kind: ResourceKind, form: FormData) => {
    const name = str(form.get("name")).trim()
    const description = str(form.get("description")) === "" ? null : str(form.get("description"))
    const isPublic = form.has("isPublic")
    if (kind === "materials") return app.client.materials.create({ payload: { name, description, isPublic, properties: { density: Number(form.get("density")) || 0, color: str(form.get("color")) || "#cccccc" } } })
    if (kind === "tools") return app.client.tools.create({ payload: { name, notes: description, isPublic, type: str(form.get("type")), diameter: Number(form.get("diameter")) || 0, material: str(form.get("material")), numberOfFlutes: Number(form.get("numberOfFlutes")) || null } })
    if (kind === "machines") {
      return app.client.machineConfigs.create({ payload: { name, description, isPublic, type: str(form.get("type")) || "mill", config: { workVolume: { x: 300, y: 180, z: 60 }, maxSpindleSpeed: 18000, maxFeedRate: 2000, controller: str(form.get("controller")) || "grbl" } } })
    }
    return app.client.components.createForProject({ params: { id: str(form.get("projectId")) }, payload: { name, description, isPublic, type: str(form.get("type")) || null, data: {} } })
  }

  const confirmDelete = async (): Promise<void> => {
    const row = deleting()
    if (!row) return
    const id = str(row["id"])
    setBusy(true)
    try {
      if (props.kind === "materials") await run(app.client.materials.remove({ params: { id } }))
      else if (props.kind === "tools") await run(app.client.tools.remove({ params: { id } }))
      else if (props.kind === "components") await run(app.client.components.remove({ params: { id } }))
      else await run(app.client.machineConfigs.remove({ params: { id } }))
      toast.success(`${meta.singular} deleted successfully`)
      setDeleting(undefined)
      refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Failed to delete ${meta.singular.toLowerCase()}`)
    } finally {
      setBusy(false)
    }
  }

  const Icon = meta.icon
  const lower = meta.plural.toLowerCase()

  return (
    <WorkspacePage
      title={`${meta.plural} Library`}
      actions={<>
            <button type="button" class={TOOLBAR_PRIMARY} onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true" />New {meta.singular}</button>
      </>}
      rail={<>
              <label class="block">
                <span class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Search</span>
                <div class="relative">
                  <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" name="search" class={`${FIELD} pl-8`} placeholder={`Search ${lower}...`} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
                </div>
              </label>

              <Show when={typeOptions().length > 0}>
                <label class="block">
                  <span class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Type</span>
                  <select name="type" class={FIELD} value={type()} onChange={(event) => setType(event.currentTarget.value)}>
                    <option value="">All Types</option>
                    <For each={typeOptions()}>{(value) => <option value={value}>{MACHINE_TYPES[value] ?? cap(value)}</option>}</For>
                  </select>
                </label>
              </Show>

              <label class="block">
                <span class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Visibility</span>
                <select name="visibility" class={FIELD} value={visibility()} onChange={(event) => setVisibility(event.currentTarget.value)}>
                  <option value="">All</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>

              <Show when={props.kind === "components"}>
                <label class="block">
                  <span class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Project</span>
                  <select name="projectId" class={FIELD} value={projectId()} onChange={(event) => setProjectId(event.currentTarget.value)}>
                    <option value="">All Projects</option>
                    <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
                  </select>
                </label>
              </Show>

              <div class="flex items-center justify-between pt-1">
                <button type="button" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-gray-200" onClick={clearFilters} disabled={!hasFilters()}>
                  <X size={14} aria-hidden="true" />Clear Filters
                </button>
                <div class="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700" role="group" aria-label="View">
                  <button type="button" class={`p-1.5 ${view() === "grid" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400"}`} title="Grid View" aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={16} aria-hidden="true" /></button>
                  <button type="button" class={`p-1.5 ${view() === "list" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400"}`} title="List View" aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={16} aria-hidden="true" /></button>
                </div>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400" role="status">{filtered().length} of {rows().length} {lower}</p>
      </>}
      overlays={<>
      <Modal open={createOpen()} title={`Create New ${meta.singular}`} onClose={() => setCreateOpen(false)}>
        <form class="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(new FormData(event.currentTarget)) }}>
          <div>
            <label for="resource-name" class={LABEL}>{meta.singular} Name</label>
            <input id="resource-name" name="name" type="text" class={INPUT} required />
          </div>
          <div>
            <label for="resource-description" class={LABEL}>Description (optional)</label>
            <textarea id="resource-description" name="description" rows={2} class={INPUT} />
          </div>
          <Show when={props.kind === "materials"}>
            <div class="grid grid-cols-2 gap-3">
              <div><label for="resource-density" class={LABEL}>Density (kg/m³)</label><input id="resource-density" name="density" type="number" step="any" min="0" class={INPUT} value="2700" /></div>
              <div><label for="resource-color" class={LABEL}>Color</label><input id="resource-color" name="color" type="color" class={`${INPUT} h-[38px] p-1`} value="#cccccc" /></div>
            </div>
          </Show>
          <Show when={props.kind === "tools"}>
            <div class="grid grid-cols-2 gap-3">
              <div><label for="resource-tool-type" class={LABEL}>Type</label><input id="resource-tool-type" name="type" type="text" class={INPUT} required value="endmill" /></div>
              <div><label for="resource-tool-material" class={LABEL}>Material</label><input id="resource-tool-material" name="material" type="text" class={INPUT} required value="carbide" /></div>
              <div><label for="resource-diameter" class={LABEL}>Diameter (mm)</label><input id="resource-diameter" name="diameter" type="number" step="any" min="0.01" class={INPUT} required value="6" /></div>
              <div><label for="resource-flutes" class={LABEL}>Flutes</label><input id="resource-flutes" name="numberOfFlutes" type="number" min="1" class={INPUT} value="3" /></div>
            </div>
          </Show>
          <Show when={props.kind === "machines"}>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="resource-machine-type" class={LABEL}>Machine Type</label>
                <select id="resource-machine-type" name="type" class={INPUT}><For each={Object.keys(MACHINE_TYPES)}>{(value) => <option value={value}>{MACHINE_TYPES[value]}</option>}</For></select>
              </div>
              <div><label for="resource-controller" class={LABEL}>Controller</label><input id="resource-controller" name="controller" type="text" class={INPUT} value="grbl" /></div>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Work volume and limits start with defaults; adjust them on the machine page.</p>
          </Show>
          <Show when={props.kind === "components"}>
            <div>
              <label for="resource-project" class={LABEL}>Project</label>
              <select id="resource-project" name="projectId" class={INPUT} required>
                <option value="">Select a project</option>
                <For each={projects()}>{(project) => <option value={project.id} selected={project.id === projectId()}>{project.name}</option>}</For>
              </select>
            </div>
            <div><label for="resource-component-type" class={LABEL}>Type (optional)</label><input id="resource-component-type" name="type" type="text" class={INPUT} placeholder="mechanical" /></div>
          </Show>
          <div class="flex items-center">
            <input id="resource-public" name="isPublic" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700" />
            <label for="resource-public" class="ml-2 block text-sm text-slate-900 dark:text-slate-300">Make {meta.singular.toLowerCase()} public (visible to all users)</label>
          </div>
          <div class="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-gray-800" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={busy()}>{busy() ? "Saving..." : "Create"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting() !== undefined} title={`Delete ${meta.singular.toLowerCase()}`} onClose={() => setDeleting(undefined)}>
        <p class="text-sm text-slate-700 dark:text-slate-300">Are you sure you want to delete this {meta.singular.toLowerCase()}? This action cannot be undone.</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-gray-700" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button>
          <button type="button" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50" disabled={busy()} onClick={() => void confirmDelete()}>Delete</button>
        </div>
      </Modal>
      </>}
    >
            <Show when={!loading()} fallback={<p class="p-8 text-center text-sm text-slate-500 dark:text-slate-400" role="status">Loading {lower}...</p>}>
              <Show when={error() === undefined} fallback={<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300" role="alert">{error()}</div>}>
                <Show
                  when={filtered().length > 0}
                  fallback={
                    <div class="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200/60 bg-white/70 p-10 text-center shadow-xl dark:border-slate-700/50 dark:bg-slate-900/70">
                      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-900"><Icon size={24} class="text-slate-400 dark:text-slate-500" aria-hidden="true" /></div>
                      <h3 class="mb-2 text-lg font-medium text-slate-900 dark:text-white">No {lower} found</h3>
                      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">{hasFilters() ? `No ${lower} match your search criteria.` : `Create your first ${meta.singular.toLowerCase()} to get started.`}</p>
                      <div class="flex flex-wrap justify-center gap-2">
                        <Show when={hasFilters()} fallback={<button type="button" class={TOOLBAR_PRIMARY} onClick={() => setCreateOpen(true)}>Create {meta.singular}</button>}>
                          <button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>Clear filters</button>
                        </Show>
                      </div>
                    </div>
                  }
                >
                  <Show
                    when={view() === "grid"}
                    fallback={
                      <div class="overflow-hidden rounded-xl border border-slate-200/60 bg-white/70 shadow-lg dark:border-slate-700/50 dark:bg-slate-900/70">
                        <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                          <thead class="bg-slate-50 dark:bg-slate-900">
                            <tr>
                              <th scope="col" class={TH}>Name</th>
                              <th scope="col" class={TH}>Type</th>
                              <th scope="col" class={TH}>Details</th>
                              <th scope="col" class={TH}>Updated</th>
                              <th scope="col" class={TH}>ID</th>
                              <th scope="col" class="relative px-4 py-2.5"><span class="sr-only">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                            <For each={filtered()}>{(row) => (
                              <tr class="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50" onClick={() => navigate(detailPath(row))}>
                                <td class="whitespace-nowrap px-4 py-3">
                                  <div class="flex items-center gap-3">
                                    <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-900"><Icon size={18} class="text-slate-400 dark:text-slate-600" aria-hidden="true" /></div>
                                    <div>
                                      <div class="text-sm font-medium text-slate-900 dark:text-white">{str(row["name"])}</div>
                                      <Show when={str(row["description"] ?? row["notes"])}><div class="max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">{str(row["description"] ?? row["notes"])}</div></Show>
                                    </div>
                                  </div>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3"><span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{meta.badge(row)}</span></td>
                                <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{meta.facts(row).map((fact) => `${fact.label}: ${fact.value}`).join(" · ")}<Show when={props.kind === "components" && str(row["projectId"]) !== ""}>{` · ${projectName(str(row["projectId"]))}`}</Show></td>
                                <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDate(str(row["updatedAt"]))}</td>
                                <td class="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-500 dark:text-slate-400">{str(row["id"]).substring(0, 8)}...</td>
                                <td class="whitespace-nowrap px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                                  <div class="flex justify-end gap-1">
                                    <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => navigate(detailPath(row))}><Edit size={16} aria-hidden="true" /></button>
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
                      <For each={filtered()}>{(row) => (
                        <div class={`${GLASS_CARD} cursor-pointer`} onClick={() => navigate(detailPath(row))} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") navigate(detailPath(row)) }}>
                          <div class="relative flex h-20 items-center justify-center bg-gradient-to-r from-blue-500/20 to-cyan-500/20 dark:from-blue-600/30 dark:to-cyan-600/30">
                            <div class="rounded-xl bg-white/30 p-2.5 backdrop-blur-sm dark:bg-white/10"><Icon size={28} class="text-blue-600 dark:text-blue-300" aria-hidden="true" /></div>
                            <span class="absolute right-2 top-2 rounded-full bg-blue-100/80 px-2 py-0.5 text-xs font-semibold text-blue-800 backdrop-blur-sm dark:bg-blue-900/50 dark:text-blue-300">{meta.badge(row)}</span>
                            <Show when={row["isPublic"] === true}><span class="absolute left-2 top-2 rounded-full bg-green-100/80 px-2 py-0.5 text-xs font-semibold text-green-800 backdrop-blur-sm dark:bg-green-900/50 dark:text-green-300">Public</span></Show>
                          </div>
                          <div class="flex flex-1 flex-col gap-2 p-4">
                            <h3 class="text-base font-semibold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">{str(row["name"])}</h3>
                            <Show when={str(row["description"] ?? row["notes"])}><p class="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{str(row["description"] ?? row["notes"])}</p></Show>
                            <div class="mt-auto space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <For each={meta.facts(row)}>{(fact) => (
                                <div class="flex justify-between"><span>{fact.label}:</span><span class="rounded-full bg-purple-100/80 px-2 py-0.5 font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{fact.value}</span></div>
                              )}</For>
                              <Show when={props.kind === "components" && str(row["projectId"]) !== ""}>
                                <div class="flex justify-between"><span>Project:</span><span class="truncate font-medium text-slate-700 dark:text-slate-300">{projectName(str(row["projectId"]))}</span></div>
                              </Show>
                              <div class="flex justify-between"><span>ID:</span><code class="font-mono text-blue-600 dark:text-blue-400">{str(row["id"]).substring(0, 8)}...</code></div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between border-t border-slate-200/50 bg-slate-50/50 px-4 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/30">
                            <span class="text-xs text-slate-500 dark:text-slate-400">Updated {formatDate(str(row["updatedAt"]))}</span>
                            <div class="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" class={ICON_BUTTON} title="Edit" onClick={() => navigate(detailPath(row))}><Edit size={16} aria-hidden="true" /></button>
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
    </WorkspacePage>
  )
}

export const MaterialsScreen = (): JSX.Element => <ResourcesScreen kind="materials" />
export const ToolsScreen = (): JSX.Element => <ResourcesScreen kind="tools" />
export const MachinesScreen = (): JSX.Element => <ResourcesScreen kind="machines" />
export const ComponentsScreen = (): JSX.Element => <ResourcesScreen kind="components" />
