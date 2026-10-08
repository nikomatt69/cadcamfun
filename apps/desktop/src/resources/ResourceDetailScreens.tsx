/**
 * Detail pages of the Resources list (`/library`): materials, tools, machines and components, each opened from
 * its card. Legacy `pages/{materials,tools,machine,components}/[id].tsx`, in the CAM workspace style used by the
 * toolpaths detail: a glass toolbar with back and the page actions, a tab rail, a details panel with an edit form
 * (save / cancel), delete with confirmation, and a side information panel.
 *
 * Each page reads the typed client; the API contract types the shape of materials, tools and components, while
 * machine configurations are free-form (`config` JSON), so their fields are read defensively.
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { ArrowLeft, Cpu, Layers, Package, Save, Settings, Trash2, Wrench, Box, Edit } from "lucide-solid"
import { toast } from "../components/ui/feedback.tsx"
import { useApp } from "../state/context.ts"
import { invalidatePrefix } from "../state/query-cache.ts"
import { Modal } from "../toolpaths/shared.tsx"
import "../components/workstation.css"

type Kind = "materials" | "tools" | "machines" | "components"
type Row = Readonly<Record<string, unknown>>

const TOOLBAR_BUTTON = "inline-flex items-center gap-1.5 rounded-lg border border-white/40 dark:border-gray-600/40 bg-white/60 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-white/80 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-700/80 disabled:opacity-50"
const TOOLBAR_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-[#007ACC] px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all duration-200 hover:bg-blue-700 disabled:opacity-50"
const PANEL = "rounded-xl border border-white/40 bg-white/70 p-5 shadow-md backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/70"
const INPUT = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
const LABEL = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
const TAB_ON = "border-[#007ACC] text-[#007ACC] dark:text-blue-400"
const TAB_OFF = "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"

const CONFIG: Readonly<Record<Kind, { readonly title: string; readonly listPath: string; readonly icon: typeof Package; readonly plural: string }>> = {
  materials: { title: "Material", listPath: "/library", icon: Layers, plural: "materials" },
  tools: { title: "Tool", listPath: "/library", icon: Wrench, plural: "tools" },
  machines: { title: "Machine", listPath: "/library", icon: Cpu, plural: "machines" },
  components: { title: "Component", listPath: "/library", icon: Box, plural: "components" }
}

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value))
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0)
const formatDate = (iso: unknown): string => (typeof iso === "string" && iso !== "" ? new Date(iso).toLocaleDateString() : "")
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {})

/** The payload each kind saves: the form values, numbers coerced, the rest passed through unchanged. */
const payloadOf = (kind: Kind, form: Row): Record<string, unknown> => {
  if (kind === "materials") {
    return { name: str(form["name"]).trim(), description: str(form["description"]) === "" ? null : str(form["description"]), properties: {
      density: num(form["density"]), hardness: num(form["hardness"]), thermalConductivity: num(form["thermalConductivity"]),
      elasticModulus: num(form["elasticModulus"]), poissonRatio: num(form["poissonRatio"]), yieldStrength: num(form["yieldStrength"]),
      ultimateStrength: num(form["ultimateStrength"]), color: str(form["color"]) || "#cccccc"
    } }
  }
  if (kind === "tools") {
    return {
      name: str(form["name"]).trim(), type: str(form["type"]), diameter: num(form["diameter"]), material: str(form["material"]),
      numberOfFlutes: num(form["numberOfFlutes"]) || null, maxRPM: num(form["maxRPM"]) || null, coolantType: str(form["coolantType"]) || null,
      cuttingLength: num(form["cuttingLength"]) || null, totalLength: num(form["totalLength"]) || null, shankDiameter: num(form["shankDiameter"]) || null,
      notes: str(form["notes"]) || null
    }
  }
  if (kind === "components") {
    return { name: str(form["name"]).trim(), description: str(form["description"]) || null, type: str(form["type"]) || null, isPublic: form["isPublic"] === true }
  }
  // Machine configurations are free-form on the server: keep the name, type and the config object as given.
  return { name: str(form["name"]).trim(), type: str(form["type"]) || "mill", description: str(form["description"]) || null, config: asRecord(form["config"]), isPublic: form["isPublic"] === true }
}

/** The editable form derived from a stored row. */
const formOf = (kind: Kind, row: Row): Row => {
  if (kind === "materials") {
    const p = asRecord(row["properties"])
    return { name: row["name"], description: row["description"] ?? "", density: p["density"] ?? 0, hardness: p["hardness"] ?? 0, thermalConductivity: p["thermalConductivity"] ?? 0,
      elasticModulus: p["elasticModulus"] ?? 0, poissonRatio: p["poissonRatio"] ?? 0, yieldStrength: p["yieldStrength"] ?? 0, ultimateStrength: p["ultimateStrength"] ?? 0, color: p["color"] ?? "#cccccc" }
  }
  if (kind === "machines") return { name: row["name"], type: row["type"], description: row["description"] ?? "", config: asRecord(row["config"]), isPublic: row["isPublic"] === true }
  return { ...row, description: row["description"] ?? row["notes"] ?? "" }
}

export interface ResourceDetailProps { readonly kind: Kind }

export function ResourceDetailScreen(props: ResourceDetailProps): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const meta = CONFIG[props.kind]

  const [row, setRow] = createSignal<Row>()
  const [form, setFormSignal] = createSignal<Row>({})
  const setForm = (next: Row): void => { setFormSignal(next) }
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [tab, setTab] = createSignal<"overview" | "details" | "raw">("overview")
  const [deleteOpen, setDeleteOpen] = createSignal(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const response = await run<unknown>(fetchEffect(app, props.kind, params.id))
      // Machine configs answer the legacy envelope `{ success, data }`; the other kinds answer the row itself.
      const record = props.kind === "machines" ? asRecord(asRecord(response)["data"]) : asRecord(response)
      const normalized = record as Row
      setRow(normalized)
      setForm(formOf(props.kind, normalized))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  createEffect(on(() => params.id, () => { void load() }))

  const patch = (key: string, value: unknown): void => setForm({ ...form(), [key]: value })
  const patchConfig = (key: string, value: unknown): void => {
    const config = asRecord(form()["config"])
    setForm({ ...form(), config: { ...config, [key]: value } })
  }

  const save = async (): Promise<void> => {
    const current = row()
    if (!current) return
    setBusy(true)
    try {
      const payload = payloadOf(props.kind, form())
      const id = params.id
      if (props.kind === "materials") await run(app.client.materials.update({ params: { id }, payload }))
      else if (props.kind === "tools") await run(app.client.tools.update({ params: { id }, payload }))
      else if (props.kind === "components") await run(app.client.components.update({ params: { id }, payload }))
      else await run(app.client.machineConfigs.update({ params: { id }, payload }))
      toast.success(`${meta.title} updated successfully`)
      setEditing(false)
      invalidatePrefix(app.cache, meta.plural)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Failed to update ${meta.title.toLowerCase()}`)
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => { setForm(formOf(props.kind, row() ?? {})); setEditing(false) }

  const remove = async (): Promise<void> => {
    setBusy(true)
    try {
      const id = params.id
      if (props.kind === "materials") await run(app.client.materials.remove({ params: { id } }))
      else if (props.kind === "tools") await run(app.client.tools.remove({ params: { id } }))
      else if (props.kind === "components") await run(app.client.components.remove({ params: { id } }))
      else await run(app.client.machineConfigs.remove({ params: { id } }))
      toast.success(`${meta.title} deleted successfully`)
      invalidatePrefix(app.cache, meta.plural)
      navigate(meta.listPath)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Failed to delete ${meta.title.toLowerCase()}`)
      setBusy(false)
    }
  }

  const name = createMemo(() => str(row()?.["name"]) || meta.title)
  const Icon = meta.icon

  return (
    <Motion.div class="cam-workspace h-full w-full flex flex-col overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div class="cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div class="workstation-toolbar w-full flex flex-wrap items-center justify-between gap-2" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
          <div class="flex min-w-0 items-center gap-3">
            <A href={meta.listPath} class="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800/60" aria-label={`Back to ${meta.plural}`}><ArrowLeft size={18} aria-hidden="true" /></A>
            <Icon size={18} class="text-[#007ACC] dark:text-blue-300" aria-hidden="true" />
            <div class="min-w-0">
              <h1 class="truncate text-base font-semibold text-gray-900 dark:text-white">{name()}</h1>
              <p class="text-xs text-gray-500 dark:text-gray-400">{meta.title}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={!editing()} fallback={<>
              <button type="button" class={TOOLBAR_PRIMARY} onClick={() => void save()} disabled={busy()}><Save size={16} aria-hidden="true" />Save</button>
              <button type="button" class={TOOLBAR_BUTTON} onClick={cancel} disabled={busy()}>Cancel</button>
            </>}>
              <button type="button" class={TOOLBAR_PRIMARY} onClick={() => { setEditing(true); setTab("details") }} disabled={busy() || row() === undefined}><Edit size={16} aria-hidden="true" />Edit</button>
              <button type="button" class={TOOLBAR_BUTTON} onClick={() => setDeleteOpen(true)} disabled={busy() || row() === undefined}><Trash2 size={16} aria-hidden="true" />Delete</button>
            </Show>
          </div>
        </Motion.div>

        <div class="flex flex-1 min-h-0 flex-col overflow-y-auto p-4">
          <Show when={!loading()} fallback={<p class="p-8 text-center text-sm text-gray-500 dark:text-gray-400" role="status">Loading {meta.plural}...</p>}>
            <Show when={error() === undefined} fallback={<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300" role="alert">{error()}</div>}>
              <Show when={row()}>{(current) => (
                <>
                  <nav class="mb-4 flex gap-6 border-b border-gray-200 dark:border-gray-700" aria-label={`${meta.title} sections`}>
                    <For each={[{ id: "overview" as const, label: "Overview" }, { id: "details" as const, label: "Details" }, { id: "raw" as const, label: "Raw data" }]}>{(item) => (
                      <button type="button" aria-pressed={tab() === item.id} class={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${tab() === item.id ? TAB_ON : TAB_OFF}`} onClick={() => setTab(item.id)}>{item.label}</button>
                    )}</For>
                  </nav>

                  <Show when={tab() === "overview"}>
                    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                      <div class={`${PANEL} md:col-span-2`}>
                        <h2 class="mb-3 text-xl font-bold text-gray-900 dark:text-white">{name()}</h2>
                        <Show when={str(current()["description"] ?? current()["notes"])} fallback={<p class="italic text-gray-500 dark:text-gray-400">No description provided</p>}>
                          <p class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{str(current()["description"] ?? current()["notes"])}</p>
                        </Show>
                        <div class="mt-5 grid grid-cols-2 gap-4">
                          <For each={summaryFields(props.kind, current())}>{(field) => (
                            <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><h3 class="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">{field.label}</h3><p class="font-medium text-gray-900 dark:text-white">{field.value}</p></div>
                          )}</For>
                        </div>
                      </div>
                      <aside class={PANEL}>
                        <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">Information</h3>
                        <dl class="space-y-3 text-sm">
                          <div class="flex justify-between"><dt class="text-gray-500 dark:text-gray-400">Created</dt><dd class="font-medium text-gray-900 dark:text-white">{formatDate(current()["createdAt"]) || "-"}</dd></div>
                          <div class="flex justify-between"><dt class="text-gray-500 dark:text-gray-400">Last updated</dt><dd class="font-medium text-gray-900 dark:text-white">{formatDate(current()["updatedAt"]) || "-"}</dd></div>
                          <div class="flex justify-between"><dt class="text-gray-500 dark:text-gray-400">ID</dt><dd class="font-mono text-gray-900 dark:text-white">{str(current()["id"]).substring(0, 8)}...</dd></div>
                          <div class="flex justify-between"><dt class="text-gray-500 dark:text-gray-400">Visibility</dt><dd class={`font-medium ${current()["isPublic"] === true ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}>{current()["isPublic"] === true ? "Public" : "Private"}</dd></div>
                        </dl>
                      </aside>
                    </div>
                  </Show>

                  <Show when={tab() === "details"}>
                    <div class={PANEL}>
                      <Show when={editing()} fallback={<DetailsView kind={props.kind} row={current()} />}>
                        <DetailsForm kind={props.kind} form={form()} onPatch={patch} onPatchConfig={patchConfig} />
                      </Show>
                    </div>
                  </Show>

                  <Show when={tab() === "raw"}>
                    <div class={PANEL}>
                      <pre class="max-h-[60vh] overflow-auto rounded-md bg-gray-50 p-4 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(current(), null, 2)}</pre>
                    </div>
                  </Show>
                </>
              )}</Show>
            </Show>
          </Show>
        </div>
      </div>

      <Modal open={deleteOpen()} title={`Delete ${meta.title.toLowerCase()}`} onClose={() => setDeleteOpen(false)}>
        <p class="text-sm text-gray-700 dark:text-gray-300">Are you sure you want to delete this {meta.title.toLowerCase()}? This action cannot be undone.</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button type="button" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50" disabled={busy()} onClick={() => void remove()}>Delete</button>
        </div>
      </Modal>
    </Motion.div>
  )
}

/** The typed read for each kind; machines answer `{ data }` (free-form), the others the row itself. */
const fetchEffect = (app: ReturnType<typeof useApp>, kind: Kind, id: string | undefined) => {
  const key = { params: { id: id ?? "" } }
  if (kind === "materials") return app.client.materials.get(key)
  if (kind === "tools") return app.client.tools.get(key)
  if (kind === "components") return app.client.components.get(key)
  return app.client.machineConfigs.get(key)
}

const summaryFields = (kind: Kind, row: Row): ReadonlyArray<{ readonly label: string; readonly value: string }> => {
  if (kind === "materials") {
    const p = asRecord(row["properties"])
    return [{ label: "Density", value: `${str(p["density"]) || "-"} kg/m³` }, { label: "Hardness", value: str(p["hardness"]) || "-" }, { label: "Yield strength", value: str(p["yieldStrength"]) || "-" }, { label: "Color", value: str(p["color"]) || "-" }]
  }
  if (kind === "tools") {
    return [{ label: "Type", value: str(row["type"]) || "-" }, { label: "Diameter", value: `${str(row["diameter"]) || "-"} mm` }, { label: "Material", value: str(row["material"]) || "-" }, { label: "Flutes", value: str(row["numberOfFlutes"]) || "-" }]
  }
  if (kind === "machines") {
    const c = asRecord(row["config"])
    return [{ label: "Type", value: str(row["type"]) || "-" }, { label: "Controller", value: str(c["controller"]) || "-" }, { label: "Status", value: str(c["status"]) || "-" }, { label: "Max spindle speed", value: str(c["maxSpindleSpeed"]) || "-" }]
  }
  return [{ label: "Type", value: str(row["type"]) || "-" }, { label: "Visibility", value: row["isPublic"] === true ? "Public" : "Private" }]
}

function DetailsView(props: { readonly kind: Kind; readonly row: Row | undefined }): JSX.Element {
  return <dl class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
    <For each={summaryFields(props.kind, props.row ?? {})}>{(field) => (
      <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><dt class="text-gray-500 dark:text-gray-400">{field.label}</dt><dd class="font-medium text-gray-900 dark:text-white">{field.value}</dd></div>
    )}</For>
  </dl>
}

function DetailsForm(props: { readonly kind: Kind; readonly form: Row; readonly onPatch: (key: string, value: unknown) => void; readonly onPatchConfig: (key: string, value: unknown) => void }): JSX.Element {
  const input = (id: string, label: string, key: string, type: "text" | "number" = "text") => (
    <div>
      <label for={id} class={LABEL}>{label}</label>
      <input id={id} name={key} type={type} class={INPUT} value={str(props.form[key])} onInput={(e) => props.onPatch(key, type === "number" ? Number(e.currentTarget.value) : e.currentTarget.value)} />
    </div>
  )
  return <form class="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
    {input("res-name", "Name", "name")}
    <Show when={props.kind === "machines" || props.kind === "components"}>{input("res-type", "Type", "type")}</Show>
    <Show when={props.kind === "tools"}>
      {input("res-type", "Type", "type")}
      {input("res-diameter", "Diameter (mm)", "diameter", "number")}
      {input("res-material", "Material", "material")}
      {input("res-flutes", "Number of flutes", "numberOfFlutes", "number")}
      {input("res-rpm", "Max RPM", "maxRPM", "number")}
      {input("res-coolant", "Coolant type", "coolantType")}
      {input("res-cutting", "Cutting length (mm)", "cuttingLength", "number")}
      {input("res-total", "Total length (mm)", "totalLength", "number")}
      {input("res-shank", "Shank diameter (mm)", "shankDiameter", "number")}
    </Show>
    <Show when={props.kind === "materials"}>
      {input("res-density", "Density", "density", "number")}
      {input("res-hardness", "Hardness", "hardness", "number")}
      {input("res-thermal", "Thermal conductivity", "thermalConductivity", "number")}
      {input("res-elastic", "Elastic modulus", "elasticModulus", "number")}
      {input("res-poisson", "Poisson ratio", "poissonRatio", "number")}
      {input("res-yield", "Yield strength", "yieldStrength", "number")}
      {input("res-ultimate", "Ultimate strength", "ultimateStrength", "number")}
      {input("res-color", "Color", "color")}
    </Show>
    <Show when={props.kind === "machines"}>
      {input("res-controller", "Controller", "controller")}
      <div>
        <label for="res-controller-select" class={LABEL}>Controller type</label>
        <select id="res-controller-select" class={INPUT} value={str(asRecord(props.form["config"])["controller"])} onChange={(e) => props.onPatchConfig("controller", e.currentTarget.value)}>
          <option value="grbl">GRBL</option><option value="fanuc">Fanuc</option><option value="gcode">Generic G-code</option>
        </select>
      </div>
    </Show>
    <Show when={props.kind !== "materials"}>
      <div class="md:col-span-2">
        <label for="res-description" class={LABEL}>{props.kind === "tools" ? "Notes" : "Description"}</label>
        <textarea id="res-description" rows={3} class={INPUT} value={str(props.form["description"] ?? props.form["notes"])} onInput={(e) => props.onPatch(props.kind === "tools" ? "notes" : "description", e.currentTarget.value)} />
      </div>
    </Show>
    <div class="flex items-center gap-2 md:col-span-2">
      <input id="res-public" name="isPublic" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 dark:border-gray-700" checked={props.form["isPublic"] === true} onChange={(e) => props.onPatch("isPublic", e.currentTarget.checked)} />
      <label for="res-public" class="text-sm text-gray-900 dark:text-gray-300">Make public (visible to all users)</label>
    </div>
  </form>
}

export const MaterialDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="materials" />
export const ToolDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="tools" />
export const MachineDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="machines" />
export const ComponentDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="components" />
