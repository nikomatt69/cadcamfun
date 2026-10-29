/**
 * Detail pages of the Resources lists (`/materials`, `/tools`, `/machine`, `/components`): materials, tools, machines and components, each opened from
 * its card. Legacy `pages/{materials,tools,machine,components}/[id].tsx`, in the CAM workspace style used by the
 * toolpaths detail: a glass toolbar with back and the page actions, a tab rail, a details panel with an edit form
 * (save / cancel), delete with confirmation, and a side information panel.
 *
 * Each page reads the typed client; the API contract types the shape of materials, tools and components, while
 * machine configurations are free-form (`config` JSON), so their fields are read defensively.
 */
import { copyText } from "../../../shared/lib/clipboard.ts"
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { Copy, CopyPlus, Cpu, Layers, Package, Save, Trash2, Wrench, Box, Edit } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { Modal } from "../../toolpaths/components/shared.tsx"
import {
  CANCEL_BUTTON, DANGER_BUTTON, INPUT, LABEL, PANEL, StageError, StageLoading, SUBMIT_BUTTON, TOOLBAR_BUTTON,
  TOOLBAR_PRIMARY, WorkspaceDetail, WorkspaceTabs, type WorkspaceTabItem
} from "../../../shared/components/WorkspacePage.tsx"
import { ResourceGeometryPreview, resourceElements } from "../components/ResourceGeometryPreview.tsx"
import { ToolPreview3D, toolResourceOf } from "../components/ToolPreview3D.tsx"
import { MaterialPreview3D, densityKgM3 } from "../components/MaterialPreview3D.tsx"
import { MachinePreview3D } from "../components/MachinePreview3D.tsx"
import { machineEnvelope, machineSections } from "../lib/machine-details.ts"
import { PropertyBar, StatGrid } from "../components/ResourceStats.tsx"
import { hexColor } from "../lib/preview-scene.ts"
import { NumberField } from "../../cad/components/property-inputs/NumberField.tsx"
import { cam } from "@cadcamfun/core"
import { componentEntries } from "../../cad/lib/component-assembly.ts"
import { t } from "../../../i18n/index.ts"

type Kind = "materials" | "tools" | "machines" | "components"
type Row = Readonly<Record<string, unknown>>

type DetailTab = "overview" | "details" | "raw" | "preview" | "structure"

const CONFIG: Readonly<Record<Kind, { readonly title: string; readonly listPath: string; readonly icon: typeof Package; readonly plural: string }>> = {
  materials: { get title() { return t("library.field.material") }, listPath: "/materials", icon: Layers, get plural() { return t("cam.ribbon.materials") } },
  tools: { get title() { return t("cam.toolLabel") }, listPath: "/tools", icon: Wrench, get plural() { return t("ai.context.category.tools") } },
  machines: { get title() { return t("cam.machine") }, listPath: "/machine", icon: Cpu, get plural() { return t("library.tab.machines") } },
  components: { get title() { return t("cad.assembly.kindComponent") }, listPath: "/components", icon: Box, get plural() { return t("library.tab.components") } }
}

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value))
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0)
const formatDate = (iso: unknown): string => (typeof iso === "string" && iso !== "" ? new Date(iso).toLocaleDateString() : "")
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {})

/** The payload each kind saves: the form values, numbers coerced, the rest passed through unchanged. */
const payloadOf = (kind: Kind, form: Row): Record<string, unknown> => {
  if (kind === "materials") {
    return { name: str(form["name"]).trim(), description: str(form["description"]) === "" ? null : str(form["description"]), properties: {
      // Properties the form does not edit (machinability, stability, ...) are kept as stored.
      ...asRecord(form["extraProperties"]),
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
      // Shape fields of the 3D model: empty stays null (drawn from the type); a corner / nose radius of 0 is kept.
      cornerRadius: toolResourceOf(form).cornerRadius ?? null, tipAngle: toolResourceOf(form).tipAngle || null, threadPitch: toolResourceOf(form).threadPitch || null,
      holderDiameter: toolResourceOf(form).holderDiameter || null, holderLength: toolResourceOf(form).holderLength || null, stickout: toolResourceOf(form).stickout || null,
      notes: str(form["notes"]) || null
    }
  }
  if (kind === "components") {
    return { name: str(form["name"]).trim(), description: str(form["description"]) || null, type: str(form["type"]) || null, isPublic: form["isPublic"] === true }
  }
  // A machine configuration is the machine profile: it is saved in the canonical shape, so what the form shows is what
  // the kernel reads, whichever shape the row was written in.
  if (kind === "machines") {
    const profile = cam.kernel.profileOfConfig(asRecord(form["config"]), str(form["type"]))
    return { name: str(form["name"]).trim(), type: str(form["type"]) || t("pages.mill"), description: str(form["description"]) || null, config: cam.kernel.configOfProfile(profile), isPublic: form["isPublic"] === true }
  }
  return { name: str(form["name"]).trim(), type: str(form["type"]) || t("pages.mill"), description: str(form["description"]) || null, config: asRecord(form["config"]), isPublic: form["isPublic"] === true }
}

/** The editable form derived from a stored row. */
const formOf = (kind: Kind, row: Row): Row => {
  if (kind === "materials") {
    const p = asRecord(row["properties"])
    return { name: row["name"], description: row["description"] ?? "", density: p["density"] ?? 0, hardness: p["hardness"] ?? 0, thermalConductivity: p["thermalConductivity"] ?? 0,
      elasticModulus: p["elasticModulus"] ?? 0, poissonRatio: p["poissonRatio"] ?? 0, yieldStrength: p["yieldStrength"] ?? 0, ultimateStrength: p["ultimateStrength"] ?? 0, color: p["color"] ?? "#cccccc", extraProperties: p }
  }
  if (kind === "machines") return { name: row["name"], type: row["type"], description: row["description"] ?? "", config: asRecord(row["config"]), isPublic: row["isPublic"] === true }
  return { ...row, description: row["description"] ?? row["notes"] ?? "" }
}

export interface ResourceDetailProps { readonly kind: Kind }

export function ResourceDetailScreen(props: ResourceDetailProps): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [urlParams] = useSearchParams()
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const meta = CONFIG[props.kind]

  const [row, setRow] = createSignal<Row>()
  const [form, setFormSignal] = createSignal<Row>({})
  const setForm = (next: Row): void => { setFormSignal(next) }
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [tab, setTab] = createSignal<"overview" | "details" | "raw" | "preview" | "structure">(props.kind === "components" && (urlParams.preview === "true" || urlParams.tab === "preview") ? "preview" : props.kind === "components" && urlParams.tab === "structure" ? "structure" : "overview")
  const [deleteOpen, setDeleteOpen] = createSignal(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      let record: Record<string, unknown>
      try {
        const response = await run<unknown>(fetchEffect(app, props.kind, params.id))
        // Machine configs answer the legacy envelope `{ success, data }`; the other kinds answer the row itself.
        record = props.kind === "machines" ? asRecord(asRecord(response)["data"]) : asRecord(response)
      } catch (cause) {
        // A built-in machine is not a stored row: it is read from the catalogue and cannot be edited or deleted, only duplicated.
        const builtin = props.kind === "machines" ? await builtinMachine(app, params.id) : undefined
        if (builtin === undefined) throw cause
        record = builtin
      }
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
    // `__config` replaces the whole configuration: the machine's fields are written as one canonical record.
    if (key === "__config") { setForm({ ...form(), config: asRecord(value) }); return }
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

  const builtin = (): boolean => row()?.["builtin"] === true

  /** A copy in the person's own configurations: the way to adapt a built-in preset, or to branch an existing machine. */
  const duplicate = async (): Promise<void> => {
    const current = row()
    if (!current) return
    setBusy(true)
    try {
      const profile = cam.kernel.profileOfConfig(asRecord(current["config"]), str(current["type"]))
      // The library's own keys (the spindle ceiling and the feed) are filled from the profile's figures; a work volume is only
      // written when the machine states one (a preset gives its travel or table instead, and the copy is edited to add it).
      const stored: Record<string, unknown> = { ...cam.kernel.configOfProfile(profile) }
      const volume = machineEnvelope(profile).volume
      if (stored["workVolume"] === undefined && volume !== undefined) stored["workVolume"] = volume
      if (profile.spindle !== undefined) stored["maxSpindleSpeed"] = profile.spindle.maxRpm
      if (profile.feed !== undefined) stored["maxFeedRate"] = profile.feed.max
      const created = await run<unknown>(app.client.machineConfigs.create({ payload: {
        name: `${str(current["name"])} (copy)`, type: str(current["type"]) || t("pages.mill"), description: str(current["description"]) || null, config: stored, isPublic: false
      } }))
      const id = str(asRecord(asRecord(created)["data"])["id"])
      toast.success("Machine duplicated")
      invalidatePrefix(app.cache, meta.plural)
      if (id !== "") navigate(`${meta.listPath}/${encodeURIComponent(id)}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to duplicate the machine")
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

  const tabs = (): ReadonlyArray<WorkspaceTabItem<DetailTab>> => [
    { id: "overview", get label() { return t("dash.tab.overview") } },
    { id: "details", get label() { return t("shell.details") } },
    { id: "raw", label: "Raw data" },
    ...(props.kind === "components" ? [
      { id: "preview" as const, label: t("cam.resource.previewTab") },
      { id: "structure" as const, label: t("cam.resource.structure") }
    ] : [])
  ]

  return (
    <WorkspaceDetail
      testId={`${props.kind}-detail`}
      title={name()}
      subtitle={meta.title}
      backHref={meta.listPath}
      backLabel={`Back to ${meta.plural}`}
      actions={
        <Show when={!editing()} fallback={<>
          <button type="button" class={TOOLBAR_PRIMARY} onClick={() => void save()} disabled={busy() || str(form()["name"]).trim() === ""}><Save size={14} aria-hidden="true" />{t("common.save")}</button>
          <button type="button" class={TOOLBAR_BUTTON} onClick={cancel} disabled={busy()}>{t("common.cancel")}</button>
        </>}>
          <Show when={props.kind === "machines"}>
            <button type="button" class={builtin() ? TOOLBAR_PRIMARY : TOOLBAR_BUTTON} onClick={() => void duplicate()} disabled={busy() || row() === undefined}><CopyPlus size={14} aria-hidden="true" />{t("browser.duplicate")}</button>
          </Show>
          <Show when={!builtin()}>
            <button type="button" class={TOOLBAR_PRIMARY} onClick={() => { setEditing(true); setTab("details") }} disabled={busy() || row() === undefined}><Edit size={14} aria-hidden="true" />{t("cad.ribbon.edit")}</button>
            <button type="button" class={`${TOOLBAR_BUTTON} !text-red-600 dark:!text-red-400`} onClick={() => setDeleteOpen(true)} disabled={busy() || row() === undefined}><Trash2 size={14} aria-hidden="true" />{t("common.delete")}</button>
          </Show>
        </Show>
      }
      overlays={
        <Modal open={deleteOpen()} title={`Delete ${meta.title.toLowerCase()}`} onClose={() => setDeleteOpen(false)}>
          <p class="text-xs text-slate-600 dark:text-slate-300">Are you sure you want to delete this {meta.title.toLowerCase()}? This action cannot be undone.</p>
          <div class="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <button type="button" class={CANCEL_BUTTON} onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</button>
            <button type="button" class={DANGER_BUTTON} disabled={busy()} onClick={() => void remove()}>{t("common.delete")}</button>
          </div>
        </Modal>
      }
    >
      <Show when={!loading()} fallback={<StageLoading label={`Loading ${meta.plural}...`} />}>
        <Show when={error() === undefined} fallback={<StageError message={error() ?? ""} onRetry={() => void load()} />}>
          <Show when={row()}>{(current) => <>
            <WorkspaceTabs class="mb-3" tabs={tabs()} value={tab()} onChange={setTab} label={`${meta.title} sections`} />

            <Show when={tab() === "overview"}>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div class={`${PANEL} md:col-span-2 !p-3`}>
                  <div class="mb-3 flex items-start gap-2">
                    <span class="flex h-8 w-8 flex-none items-center justify-center rounded-[5px] border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"><Icon size={16} aria-hidden="true" /></span>
                    <div class="min-w-0">
                      <h2 class="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{name()}</h2>
                      <p class="text-[11px] text-slate-500 dark:text-slate-400">{meta.title}</p>
                    </div>
                  </div>
                  <Show when={str(current()["description"] ?? current()["notes"])} fallback={<p class="text-xs italic text-slate-500 dark:text-slate-400">{t("pages.no.description.provided")}</p>}>
                    <p class="whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{str(current()["description"] ?? current()["notes"])}</p>
                  </Show>
                  <Show when={props.kind === "components"}><div class="mt-3"><ResourceGeometryPreview elements={resourceElements(current()["data"] ?? current())} /></div></Show>
                  <Show when={props.kind === "tools"}><div class="mt-3"><ToolPreview3D tool={current()} /></div></Show>
                  <Show when={props.kind === "materials"}><div class="mt-3"><MaterialPreview3D properties={asRecord(current()["properties"])} /></div></Show>
                  <Show when={props.kind === "machines"}><div class="mt-3"><MachinePreview3D profile={cam.kernel.profileOfConfig(asRecord(current()["config"]), str(current()["type"]))} /></div></Show>
                  <div class="mt-3"><StatGrid items={summaryFields(props.kind, current())} /></div>
                  <Show when={props.kind === "materials"}><div class="mt-3"><MaterialBars properties={asRecord(current()["properties"])} /></div></Show>
                </div>
                <aside class={`${PANEL} !p-3`}>
                  <h3 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">Information</h3>
                  <dl class="panel-kv">
                    <dt>{t("org.overview.created")}</dt><dd>{formatDate(current()["createdAt"]) || "-"}</dd>
                    <dt>Last updated</dt><dd>{formatDate(current()["updatedAt"]) || "-"}</dd>
                    <dt>ID</dt><dd class="font-mono">{str(current()["id"]).substring(0, 8)}…</dd>
                    <dt>{t("pages.visibility")}</dt><dd class={current()["isPublic"] === true ? "text-green-700 dark:text-green-400" : ""}>{current()["builtin"] === true ? "Built-in preset" : current()["isPublic"] === true ? t("save.publicProject") : t("pages.private")}</dd>
                  </dl>
                </aside>
              </div>
            </Show>

            <Show when={props.kind === "components" && tab() === "preview"}>
              <div class={`${PANEL} !p-3`}><ResourceGeometryPreview elements={resourceElements(current()["data"] ?? current())} /></div>
            </Show>
            <Show when={props.kind === "components" && tab() === "structure"}>
              <div class={`${PANEL} !p-3`} data-testid="component-resource-structure">
                <h3 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">{t("cam.resource.structure")}</h3>
                <p class="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{t("cam.resource.elementCount", { count: componentEntries(resourceElements(current()["data"])).length })}</p>
                <ol class="space-y-1 text-xs text-slate-700 dark:text-slate-300"><For each={componentEntries(resourceElements(current()["data"]))}>{({ element, depth }) =>
                  <li style={{ "padding-left": `${depth * 16}px` }}>{String(element["name"] ?? element.type)} <span class="text-[10.5px] text-slate-500 dark:text-slate-400">· {element.type}</span></li>
                }</For></ol>
              </div>
            </Show>

            <Show when={tab() === "details"}>
              <div class={`${PANEL} !p-3`}>
                <Show when={editing()} fallback={<DetailsView kind={props.kind} row={current()} />}>
                  <Show when={props.kind === "tools" || props.kind === "materials"} fallback={<DetailsForm kind={props.kind} form={form()} onPatch={patch} onPatchConfig={patchConfig} />}>
                    {/* The 3D model redraws as it is edited: what is saved is what the CAM preview will draw. */}
                    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      <div class="lg:col-span-2"><DetailsForm kind={props.kind} form={form()} onPatch={patch} onPatchConfig={patchConfig} /></div>
                      <div class="lg:sticky lg:top-0 lg:self-start">
                        <Show when={props.kind === "tools"} fallback={<MaterialPreview3D properties={{ ...asRecord(form()["extraProperties"]), density: form()["density"], color: form()["color"] }} />}>
                          <ToolPreview3D tool={form()} />
                        </Show>
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </Show>

            <Show when={tab() === "raw"}>
              <div class={`${PANEL} !p-3`}>
                <div class="mb-2 flex justify-end">
                  <button type="button" class={TOOLBAR_BUTTON} onClick={() => { void copyText(JSON.stringify(current(), null, 2)).then(() => toast.success(t("shell.clipboard.copied")), () => toast.error(t("shell.clipboard.failed"))) }}><Copy size={14} aria-hidden="true" />Copy JSON</button>
                </div>
                <pre class="max-h-[60vh] overflow-auto rounded-[5px] border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{JSON.stringify(current(), null, 2)}</pre>
              </div>
            </Show>
          </>}</Show>
        </Show>
      </Show>
    </WorkspaceDetail>
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

/** A built-in machine of the catalogue, as a row, or nothing when the id is not one of them. */
const builtinMachine = async (app: ReturnType<typeof useApp>, id: string | undefined): Promise<Record<string, unknown> | undefined> => {
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const answer = asRecord(await run<unknown>(app.client.machineConfigs.defaults({})))["data"]
  const found = (Array.isArray(answer) ? answer : []).map(asRecord).find((row) => row["id"] === id)
  return found === undefined ? undefined : { ...found, builtin: true }
}

const summaryFields = (kind: Kind, row: Row): ReadonlyArray<{ readonly label: string; readonly value: string }> => {
  if (kind === "materials") {
    const p = asRecord(row["properties"])
    const density = densityKgM3(num(p["density"]))
    return [{ get label() { return t("library.material.density") }, value: density > 0 ? `${density} kg/m³` : "-" }, { label: "Hardness", value: str(p["hardness"]) || "-" }, { label: "Yield strength", value: num(p["yieldStrength"]) > 0 ? `${str(p["yieldStrength"])} MPa` : "-" }, { get label() { return t("library.color") }, value: hexColor(p["color"]) }]
  }
  if (kind === "tools") {
    return [{ get label() { return t("library.field.type") }, value: str(row["type"]) || "-" }, { get label() { return t("library.tool.diameter") }, value: `${str(row["diameter"]) || "-"} mm` }, { get label() { return t("library.field.material") }, value: str(row["material"]) || "-" }, { get label() { return t("library.field.flutes") }, value: str(row["numberOfFlutes"]) || "-" },
      { label: "3D model", value: cam.describeTool(cam.toolModelOf(toolResourceOf(row), cam.toolMachineOf(str(row["type"])))) }]
  }
  if (kind === "machines") {
    // Read through the profile, so a configuration in any shape (the form's, the assistant's, the catalogue's) shows its figures.
    const c = asRecord(row["config"]), profile = cam.kernel.profileOfConfig(c, str(row["type"]))
    return [{ get label() { return t("library.field.type") }, value: str(row["type"]) || "-" }, { get label() { return t("library.field.controller") }, value: profile.controller ?? (str(c["controller"]) || "-") }, { get label() { return t("subscription.status") }, value: str(c["status"]) || "-" },
      { label: "Max spindle speed", value: profile.spindle === undefined ? "-" : `${profile.spindle.maxRpm} rpm` }]
  }
  const elements = resourceElements(row["data"] ?? row)
  const kinds = [...new Set(componentEntries(elements).map(({ element }) => element.type))]
  return [{ get label() { return t("library.field.type") }, value: str(row["type"]) || "-" }, { get label() { return t("pages.visibility") }, value: row["isPublic"] === true ? t("save.publicProject") : t("pages.private") },
    { get label() { return t("cad.status.elements") }, value: String(componentEntries(elements).length) }, { get label() { return t("cam.generator.preview.geometry") }, value: kinds.length > 0 ? kinds.join(", ") : "-" }]
}

/** The full list of the Details tab: every figure the resource carries, with its unit. */
const detailFields = (kind: Kind, row: Row): ReadonlyArray<{ readonly label: string; readonly value: string }> => {
  const withUnit = (value: unknown, unit: string): string => (num(value) > 0 ? `${str(value)} ${unit}` : "-")
  if (kind === "materials") {
    const p = asRecord(row["properties"])
    return [...summaryFields(kind, row).filter((field) => field.label !== "Yield strength"), { label: "Yield strength", value: withUnit(p["yieldStrength"], "MPa") },
      { label: "Ultimate strength", value: withUnit(p["ultimateStrength"], "MPa") }, { label: "Elastic modulus", value: withUnit(p["elasticModulus"], "GPa") },
      { label: "Poisson ratio", value: num(p["poissonRatio"]) > 0 ? str(p["poissonRatio"]) : "-" }, { label: "Thermal conductivity", value: withUnit(p["thermalConductivity"], "W/(m·K)") }]
  }
  if (kind === "tools") {
    return [...summaryFields(kind, row), { get label() { return t("library.field.maxRpm") }, value: str(row["maxRPM"]) || "-" }, { label: "Coolant", value: str(row["coolantType"]) || "-" },
      { get label() { return t("pages.cutting.length") }, value: withUnit(row["cuttingLength"], "mm") }, { label: "Total length", value: withUnit(row["totalLength"], "mm") }, { label: "Shank diameter", value: withUnit(row["shankDiameter"], "mm") }]
  }
  return summaryFields(kind, row)
}

function DetailsView(props: { readonly kind: Kind; readonly row: Row | undefined }): JSX.Element {
  // A machine lists every figure of its profile, grouped like a data sheet; the other kinds list their own fields.
  const sections = (): ReturnType<typeof machineSections> => props.kind === "machines" ? machineSections(cam.kernel.profileOfConfig(asRecord((props.row ?? {})["config"]), str((props.row ?? {})["type"]))) : []
  return <div class="space-y-3">
    <Show when={props.kind === "machines"} fallback={<StatGrid items={detailFields(props.kind, props.row ?? {})} />}>
      <div class="space-y-4" data-testid="machine-sections">
        <Show when={(props.row ?? {})["builtin"] === true}><p class="text-xs text-slate-500 dark:text-slate-400">A built-in preset: the figures the kernel plans against when no configuration is chosen. Duplicate it to adapt it.</p></Show>
        <For each={sections()}>{(section) => <div>
          <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{section.title}</h4>
          <StatGrid items={section.facts} />
        </div>}</For>
        <Show when={sections().length === 0}><p class="text-xs italic text-slate-500 dark:text-slate-400">This configuration does not state any figures yet. Edit it to add them.</p></Show>
      </div>
    </Show>
    <Show when={props.kind === "materials"}><MaterialBars properties={asRecord((props.row ?? {})["properties"])} /></Show>
  </div>
}

/** Strength / stiffness / conductivity against the strongest common stock, so two materials compare at a glance. */
function MaterialBars(props: { readonly properties: Row }): JSX.Element {
  const value = (key: string): number => num(props.properties[key])
  return <div class="grid grid-cols-1 gap-2.5 rounded-[5px] border border-slate-200 p-3 dark:border-slate-700/70 md:grid-cols-2">
    <PropertyBar label={t("library.material.density")} value={densityKgM3(value("density"))} max={9000} unit="kg/m³" />
    <PropertyBar label="Yield strength" value={value("yieldStrength")} max={1800} unit="MPa" />
    <PropertyBar label="Ultimate strength" value={value("ultimateStrength")} max={2000} unit="MPa" />
    <PropertyBar label="Elastic modulus" value={value("elasticModulus")} max={400} unit="GPa" />
    <PropertyBar label="Thermal conductivity" value={value("thermalConductivity")} max={400} unit="W/(m·K)" />
  </div>
}

function DetailsForm(props: { readonly kind: Kind; readonly form: Row; readonly onPatch: (key: string, value: unknown) => void; readonly onPatchConfig: (key: string, value: unknown) => void }): JSX.Element {
  const input = (id: string, label: string, key: string, type: "text" | "number" = "text") => (
    <div>
      <label for={id} class={LABEL}>{label}</label>
      <input id={id} name={key} type={type} class={INPUT} value={str(props.form[key])} onInput={(e) => props.onPatch(key, type === "number" ? Number(e.currentTarget.value) : e.currentTarget.value)} />
    </div>
  )
  const numeric = (id: string, label: string, key: string, min = 0, max?: number) => (
    <div>
      <label for={id} class={LABEL}>{label}</label>
      <NumberField id={id} name={key} class={INPUT} min={min} max={max} value={props.form[key] ?? ""} onChange={(value) => props.onPatch(key, value)} />
    </div>
  )
  return <form class="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
    {input("res-name", "Name", "name")}
    <Show when={props.kind === "machines" || props.kind === "components"}>{input("res-type", "Type", "type")}</Show>
    <Show when={props.kind === "tools"}>
      <div>
        <label for="res-type" class={LABEL}>{t("library.type")}</label>
        <select id="res-type" name="type" class={INPUT} value={str(props.form["type"])} onChange={(e) => props.onPatch("type", e.currentTarget.value)}>
          <Show when={str(props.form["type"]) !== "" && cam.toolMachineOf(str(props.form["type"])) === undefined}><option value={str(props.form["type"])}>{str(props.form["type"])} (drawn as an end mill)</option></Show>
          <For each={[["mill", "Milling"], ["lathe", "Turning"], ["3dprinter", "3D printing nozzle"]] as const}>{([machine, label]) => (
            <optgroup label={label}><For each={cam.TOOL_TYPES[machine]}>{(type) => <option value={type}>{type}</option>}</For></optgroup>
          )}</For>
        </select>
      </div>
      {input("res-diameter", "Diameter (mm)", "diameter", "number")}
      {input("res-material", "Material", "material")}
      {input("res-flutes", "Number of flutes", "numberOfFlutes", "number")}
      {input("res-rpm", "Max RPM", "maxRPM", "number")}
      {input("res-coolant", "Coolant type", "coolantType")}
      {input("res-cutting", "Cutting length (mm)", "cuttingLength", "number")}
      {input("res-total", "Total length (mm)", "totalLength", "number")}
      {input("res-shank", "Shank diameter (mm)", "shankDiameter", "number")}
      <ToolShapeFields form={props.form} onPatch={props.onPatch} />
    </Show>
    <Show when={props.kind === "materials"}>
      {numeric("res-density", "Density (kg/m³)", "density")}
      {numeric("res-hardness", "Hardness (HB / HV / HRC value)", "hardness")}
      {numeric("res-thermal", "Thermal conductivity (W/(m·K))", "thermalConductivity")}
      {numeric("res-elastic", "Elastic modulus (GPa)", "elasticModulus")}
      {numeric("res-poisson", "Poisson ratio (0 – 0.5)", "poissonRatio", 0, 0.5)}
      {numeric("res-yield", "Yield strength (MPa)", "yieldStrength")}
      {numeric("res-ultimate", "Ultimate strength (MPa)", "ultimateStrength")}
      <div>
        <label for="res-color" class={LABEL}>{t("library.color")}</label>
        <div class="flex items-center gap-2">
          <input id="res-color-picker" type="color" aria-label="Pick the colour" class="h-[34px] w-10 cursor-pointer rounded-[5px] border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800" value={hexColor(props.form["color"]).length === 7 ? hexColor(props.form["color"]) : "#cccccc"} onInput={(e) => props.onPatch("color", e.currentTarget.value)} />
          <input id="res-color" name="color" type="text" class={INPUT} value={str(props.form["color"])} onInput={(e) => props.onPatch("color", e.currentTarget.value)} />
        </div>
      </div>
    </Show>
    <Show when={props.kind === "machines"}>
      <MachineProfileFields form={props.form} onPatchConfig={props.onPatchConfig} />
    </Show>
    <Show when={props.kind !== "materials"}>
      <div class="md:col-span-2">
        <label for="res-description" class={LABEL}>{props.kind === "tools" ? "Notes" : t("save.description")}</label>
        <textarea id="res-description" rows={3} class={INPUT} value={str(props.form["description"] ?? props.form["notes"])} onInput={(e) => props.onPatch(props.kind === "tools" ? "notes" : t("save.description"), e.currentTarget.value)} />
      </div>
    </Show>
    <div class="flex items-center gap-2 md:col-span-2">
      <input id="res-public" name="isPublic" type="checkbox" class="h-3.5 w-3.5 border-slate-300 accent-blue-600 dark:border-slate-600" checked={props.form["isPublic"] === true} onChange={(e) => props.onPatch("isPublic", e.currentTarget.checked)} />
      <label for="res-public" class="text-xs text-slate-700 dark:text-slate-300">Make public (visible to all users)</label>
    </div>
  </form>
}

/**
 * The machine's own figures, in the canonical machine profile: the kernel reads them, so what the form writes is what the
 * program is planned against. The fields are read through the profile, so a configuration written in an older shape shows
 * its figures here and is rewritten in the canonical one when it is saved.
 */
function MachineProfileFields(props: { readonly form: Row; readonly onPatchConfig: (key: string, value: unknown) => void }): JSX.Element {
  const profile = createMemo(() => cam.kernel.profileOfConfig(asRecord(props.form["config"]), str(props.form["type"])))
  /**
   * Writes a field of the profile. The configuration is the profile, so the whole config is replaced with the canonical
   * shape: a configuration written in an older shape keeps its figures and is rewritten in the canonical one.
   */
  const patch = (apply: (profile: Record<string, unknown>) => void): void => {
    const draft: Record<string, unknown> = { ...asRecord(props.form["config"]) }
    apply(draft)
    props.onPatchConfig("__config", draft)
  }
  const number = (id: string, label: string, value: number | undefined, unit: string, apply: (value: number) => void): JSX.Element => (
    <div>
      <label for={id} class={LABEL}>{label}{unit ? ` (${unit})` : ""}</label>
      <input id={id} class={INPUT} type="number" value={value === undefined ? "" : String(value)} onInput={(e) => {
        const parsed = Number(e.currentTarget.value)
        if (Number.isFinite(parsed) && e.currentTarget.value.trim() !== "") apply(parsed)
      }} />
    </div>
  )
  const profileNumber = (id: string, label: string, group: "spindle" | "feed" | "table" | "accuracy", key: string, unit: string): JSX.Element => {
    const current = profile()
    const groupValue = (current[group] ?? {}) as Record<string, unknown>
    return number(id, label, typeof groupValue[key] === "number" ? groupValue[key] : undefined, unit, (value) =>
      patch((draft) => {
        const section = { ...((draft[group] ?? {}) as Record<string, unknown>) }
        section[key] = value
        draft[group] = section
      }))
  }
  return <>
    <div>
      <label for="res-controller" class={LABEL}>{t("library.field.controller")}</label>
      <input id="res-controller" class={INPUT} value={profile().controller ?? ""} onInput={(e) =>
        patch((draft) => {
          const value = e.currentTarget.value.trim()
          if (value === "") delete draft["controller"]
          else draft["controller"] = value
        })} />
    </div>
    <div>
      <label for="res-post" class={LABEL}>Post (NC dialect)</label>
      <select id="res-post" class={INPUT} value={profile().post ?? ""} onChange={(e) =>
        patch((draft) => {
          const value = e.currentTarget.value
          if (value === "") delete draft["post"]
          else draft["post"] = value
        })}>
        <option value="">From the controller</option>
        <For each={cam.kernel.POST_IDS}>{(id) => <option value={id}>{id}</option>}</For>
      </select>
    </div>
    {profileNumber("res-max-rpm", "Max spindle speed", "spindle", "maxRpm", "rpm")}
    {profileNumber("res-min-rpm", "Min spindle speed", "spindle", "minRpm", "rpm")}
    {profileNumber("res-spindle-power", "Spindle power", "spindle", "powerKw", "kW")}
    {profileNumber("res-spindle-torque", "Spindle torque", "spindle", "torqueNm", "N·m")}
    {profileNumber("res-max-feed", "Max feed", "feed", "max", "mm/min")}
    {profileNumber("res-rapid-feed", "Rapid feed", "feed", "rapid", "mm/min")}
    {profileNumber("res-table-length", "Table length", "table", "length", "mm")}
    {profileNumber("res-table-width", "Table width", "table", "width", "mm")}
    {profileNumber("res-table-gap", "Table gap under the stock", "table", "gap", "mm")}
    {profileNumber("res-positioning", "Positioning accuracy", "accuracy", "positioningMm", "mm")}
    <div>
      <label for="res-rigidity" class={LABEL}>Rigidity</label>
      <select id="res-rigidity" class={INPUT} value={profile().rigidity ?? ""} onChange={(e) =>
        patch((draft) => {
          const value = e.currentTarget.value
          if (value === "") delete draft["rigidity"]
          else draft["rigidity"] = value
        })}>
        <option value="">Not stated</option>
        <For each={["hobby", "light", "standard", "heavy"] as const}>{(value) => <option value={value}>{value}</option>}</For>
      </select>
    </div>
    <div class="md:col-span-2">
      <p class={LABEL}>Work volume (mm) — the space the part takes</p>
      <div class="grid grid-cols-3 gap-2">
        {(["x", "y", "z"] as const).map((axis) => (
          <div>
            <label for={`res-work-${axis}`} class={LABEL}>{axis.toUpperCase()}</label>
            <input id={`res-work-${axis}`} class={INPUT} type="number" value={profile().workVolume?.[axis] ?? ""} onInput={(e) => {
              const parsed = Number(e.currentTarget.value)
              patch((draft) => {
                const volume = { ...((draft["workVolume"] ?? {}) as Record<string, unknown>) }
                if (Number.isFinite(parsed) && e.currentTarget.value.trim() !== "") volume[axis] = parsed
                else delete volume[axis]
                if (Object.keys(volume).length === 0) delete draft["workVolume"]
                else draft["workVolume"] = volume
              })
            }} />
          </div>
        ))}
      </div>
    </div>
  </>
}

/** The shape fields the tool's type uses (corner / nose radius, angle, pitch, holder, stickout): they shape its 3D model. */
function ToolShapeFields(props: { readonly form: Row; readonly onPatch: (key: string, value: unknown) => void }): JSX.Element {
  const model = createMemo(() => cam.toolModelOf(toolResourceOf(props.form), cam.toolMachineOf(str(props.form["type"]))))
  const field = (id: string, label: string, key: string, min = 0) => (
    <div>
      <label for={id} class={LABEL}>{label}</label>
      <NumberField id={id} class={INPUT} min={min} value={props.form[key] ?? ""} onChange={(value) => props.onPatch(key, value)} />
    </div>
  )
  const m = () => model()
  return <>
    <Show when={(m().family === "mill" && (m() as cam.MillModel).cornerRadius !== undefined) || (m().family === "lathe" && (m() as cam.LatheModel).insert !== "grooving" && (m() as cam.LatheModel).insert !== "parting" && (m() as cam.LatheModel).insert !== "threading" && (m() as cam.LatheModel).insert !== "knurling")}>
      {field("res-corner", m().family === "lathe" ? "Nose radius (mm)" : "Corner radius (mm)", "cornerRadius")}
    </Show>
    <Show when={m().family === "mill" && (m() as cam.MillModel).angle !== undefined}>
      {field("res-angle", (m() as cam.MillModel).shape === "tapered" ? "Taper angle per side (°)" : "Included angle (°)", "tipAngle", 1)}
    </Show>
    <Show when={m().family === "mill" && (m() as cam.MillModel).shape === "threadmill"}>{field("res-pitch", "Thread pitch (mm)", "threadPitch", 0.1)}</Show>
    <Show when={m().family === "mill" || m().family === "probe"}>
      {field("res-stickout", "Stickout from the holder (mm)", "stickout", 1)}
      {field("res-holder-d", "Holder diameter (mm)", "holderDiameter", 1)}
      {field("res-holder-l", "Holder length (mm)", "holderLength", 1)}
    </Show>
  </>
}

export const MaterialDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="materials" />
export const ToolDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="tools" />
export const MachineDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="machines" />
export const ComponentDetailScreen = (): JSX.Element => <ResourceDetailScreen kind="components" />
