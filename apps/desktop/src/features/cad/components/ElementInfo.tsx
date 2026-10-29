import { For, Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Copy, Layers, Move, Pencil, Save, Trash2, X } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore, type Element as CADElement } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { NumberField } from "./property-inputs/NumberField.tsx"
import { t } from "../../../i18n/index.ts"

interface ElementInfoProps { readonly elementId: string; onClose?: () => void }
type Values = Record<string, any>

const ROW = "flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
const FIELD = "px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-right"
const formatNumber = (n: number | undefined) => (n === undefined ? "N/A" : Number(n.toFixed(2)).toString())
// Sizes must stay positive; a line is at least one pixel wide.
const MINIMUM: Readonly<Record<string, number>> = { width: 0.001, height: 0.001, depth: 0.001, radius: 0.001, linewidth: 1 }
const SECTION_BUTTON = "w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"

/** Read/edit panel for one element: general, position, dimensions, appearance, metadata and component children. */
export default function ElementInfo(props: ElementInfoProps): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const [editMode, setEditMode] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({ general: true, position: true, dimensions: true, appearance: true, metadata: false })
  const [edited, setEdited] = createSignal<Values>({})
  // Fields whose typed text is not a valid value yet: Save refuses while any is left.
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [tried, setTried] = createSignal(false)
  const flag = (field: string, error: string | null) => setErrors((previous) => {
    if ((previous[field] ?? null) === error) return previous
    const next = { ...previous }
    if (error === null) delete next[field]
    else next[field] = error
    return next
  })

  const element = () => elements.elements.find((el) => el.id === props.elementId)
  const layer = () => layers.layers.find((l) => l.id === element()?.layerId)
  const toggle = (section: string) => setExpanded({ ...expanded(), [section]: !expanded()[section] })
  const set = (field: string, value: unknown) => setEdited({ ...edited(), [field]: value })

  const startEditing = () => {
    const el = element()!
    const values: Values = {
      name: el.name || "", color: el.color || "#1e88e5", x: el.x || 0, y: el.y || 0, z: el.z || 0, layerId: el.layerId,
      visible: el.visible !== false, locked: el.locked || false
    }
    switch (el.type) {
      case "rectangle": values.width = el.width || 0; values.height = el.height || 0; break
      case "circle": case "sphere": values.radius = el.radius || 0; break
      case "line": Object.assign(values, { x1: el.x1 || 0, y1: el.y1 || 0, z1: el.z1 || 0, x2: el.x2 || 0, y2: el.y2 || 0, z2: el.z2 || 0, linewidth: el.linewidth || 1 }); break
      case "cube": values.width = el.width || 0; values.height = el.height || 0; values.depth = el.depth || 0; break
    }
    setEdited(values); setErrors({}); setTried(false); setEditMode(true)
  }
  const saveChanges = () => {
    if (Object.keys(errors()).length > 0) { setTried(true); return }
    const processed: Values = {}
    for (const [key, value] of Object.entries(edited())) {
      processed[key] = typeof value === "string" && !Number.isNaN(Number(value)) && key !== "name" && key !== "color" && key !== "layerId" ? Number(value) : value
    }
    elements.updateElement(props.elementId, processed)
    setEditMode(false)
  }
  const cancelEditing = () => { setEditMode(false); setEdited({}); setErrors({}) }

  const property = (label: string, value: unknown, unit = "") => (
    <div class={ROW}>
      <span class="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span class="font-medium">{String(value)}<Show when={unit}><span class="text-xs ml-1 text-gray-500">{unit}</span></Show></span>
    </div>
  )
  const editable = (label: string, field: string, type = "text", options?: ReadonlyArray<{ value: string; label: string }>) => (
    <div class={ROW}>
      <label for={field} class="text-sm text-gray-600 dark:text-gray-300">{label}</label>
      <Show when={type === "select" && options} fallback={
        <Show when={type === "number"} fallback={
        <Show when={type === "checkbox"} fallback={
          <input id={field} type={type} value={edited()[field] ?? ""} onInput={(e) => set(field, e.currentTarget.value)}
            class={type === "color" ? "w-10 h-8 p-0 border rounded" : `${FIELD} w-24`} />}>
          <input id={field} type="checkbox" checked={!!edited()[field]} onChange={(e) => set(field, e.currentTarget.checked)} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        </Show>}>
          <div class="w-28"><NumberField id={field} label={label} value={edited()[field]} onChange={(value) => set(field, value)} onError={(error) => flag(field, error)} min={MINIMUM[field]} step={field === "linewidth" ? 1 : 0.1} showError={tried()} class={`${FIELD} w-full`} /></div>
        </Show>}>
        <select id={field} value={edited()[field]} onChange={(e) => set(field, e.currentTarget.value)} class={FIELD}>
          <For each={options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
      </Show>
    </div>
  )
  const section = (key: string, title: string, body: () => JSX.Element) => (
    <div class="border rounded dark:border-gray-700">
      <button class={SECTION_BUTTON} onClick={() => toggle(key)}>
        <span class="font-medium">{title}</span>
        <Show when={expanded()[key]} fallback={<ChevronRight size={16} />}><ChevronDown size={16} /></Show>
      </button>
      <Show when={expanded()[key]}><div class="p-3 overflow-hidden">{body()}</div></Show>
    </div>
  )

  return (
    <Show when={element()}>{(el) => {
      const isDim = () => ["rectangle", "circle", "cube", "sphere", "component"].includes(el().type)
      const sized = () => el().type === "rectangle" || el().type === "cube" || el().type === "component"
      return (
        <div class="bg-white dark:bg-gray-800 dark:text-white rounded-md shadow-md overflow-hidden">
          <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 border-b">
            <h3 class="font-medium truncate flex-1">
              <Show when={editMode()} fallback={el().name || `${el().type}-${el().id.slice(0, 6)}`}>
                <input type="text" value={edited()["name"] || ""} onInput={(e) => set("name", e.currentTarget.value)} class="w-full px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
              </Show>
            </h3>
            <div class="flex space-x-1 ml-2">
              <Show when={editMode()} fallback={<>
                <button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" onClick={startEditing} title={t("cad.info.edit")}><Pencil size={16} /></button>
                <Show when={props.onClose}><button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" onClick={props.onClose} title={t("cad.info.close")}><X size={16} /></button></Show>
              </>}>
                <button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-green-600 dark:text-green-400" onClick={saveChanges} title={t("cad.info.save")}><Save size={16} /></button>
                <button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500" onClick={cancelEditing} title={t("cad.assembly.cancel")}><X size={16} /></button>
              </Show>
            </div>
          </div>

          <div class="p-3">
            <div class="space-y-3">
              {section("general", "General", () => (
                <Show when={editMode()} fallback={<>
                  {property("Name", el().name || `${el().type}-${el().id.slice(0, 6)}`)}{property("Type", el().type)}
                  {property("Layer", layer()?.name || "No Layer")}{property("Visible", el().visible !== false ? t("common.yes") : t("common.no"))}{property("Locked", el().locked ? t("common.yes") : t("common.no"))}
                </>}>
                  {editable("Name", "name")}{editable("Type", "type", "text", [])}
                  {editable("Layer", "layerId", "select", layers.layers.map((l) => ({ value: l.id, label: l.name })))}
                  {editable("Visible", "visible", "checkbox")}{editable("Locked", "locked", "checkbox")}
                </Show>
              ))}

              {section("position", "Position", () => (
                <Show when={editMode()} fallback={<>
                  {property("X", formatNumber(el().x))}{property("Y", formatNumber(el().y))}{property("Z", formatNumber(el().z || 0))}
                  <Show when={el().type === "line"}>
                    {property("X1", formatNumber(el().x1))}{property("Y1", formatNumber(el().y1))}{property("Z1", formatNumber(el().z1 || 0))}
                    {property("X2", formatNumber(el().x2))}{property("Y2", formatNumber(el().y2))}{property("Z2", formatNumber(el().z2 || 0))}
                  </Show>
                </>}>
                  {editable("X", "x", "number")}{editable("Y", "y", "number")}{editable("Z", "z", "number")}
                  <Show when={el().type === "line"}>
                    {editable("X1", "x1", "number")}{editable("Y1", "y1", "number")}{editable("Z1", "z1", "number")}
                    {editable("X2", "x2", "number")}{editable("Y2", "y2", "number")}{editable("Z2", "z2", "number")}
                  </Show>
                </Show>
              ))}

              <Show when={isDim()}>{section("dimensions", "Dimensions", () => (
                <Show when={editMode()} fallback={<>
                  <Show when={sized()}>{property("Width", formatNumber(el().width))}{property("Height", formatNumber(el().height))}</Show>
                  <Show when={el().type === "cube" || el().type === "component"}>{property("Depth", formatNumber(el().depth))}</Show>
                  <Show when={el().type === "circle" || el().type === "sphere"}>{property("Radius", formatNumber(el().radius))}</Show>
                </>}>
                  <Show when={sized()}>{editable("Width", "width", "number")}{editable("Height", "height", "number")}</Show>
                  <Show when={el().type === "cube" || el().type === "component"}>{editable("Depth", "depth", "number")}</Show>
                  <Show when={el().type === "circle" || el().type === "sphere"}>{editable("Radius", "radius", "number")}</Show>
                </Show>
              ))}</Show>

              {section("appearance", "Appearance", () => (
                <Show when={editMode()} fallback={<>
                  <div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-sm text-gray-600 dark:text-gray-300">{t("library.color")}</span>
                    <div class="flex items-center"><div class="w-4 h-4 rounded mr-2" style={{ "background-color": el().color || "#1e88e5" }} /><span class="font-medium">{el().color || "#1e88e5"}</span></div>
                  </div>
                  <Show when={["line", "rectangle", "circle"].includes(el().type)}>{property("Line Width", formatNumber(el().linewidth), "px")}</Show>
                  <Show when={el().type !== "line" && el().type !== "text"}>{property("Wireframe", el().wireframe ? t("common.yes") : t("common.no"))}</Show>
                </>}>
                  {editable("Color", "color", "color")}
                  <Show when={["line", "rectangle", "circle"].includes(el().type)}>{editable("Line Width", "linewidth", "number")}</Show>
                  <Show when={el().type !== "line" && el().type !== "text"}>{editable("Wireframe", "wireframe", "checkbox")}</Show>
                </Show>
              ))}

              <Show when={el().metadata}>{section("metadata", "Metadata", () => (
                <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40">{JSON.stringify(el().metadata, null, 2)}</pre>
              ))}</Show>

              <Show when={el().type === "component" && el().elements && (el().elements as CADElement[]).length > 0}>
                {section("elements", `Elements (${(el().elements as CADElement[] | undefined)?.length ?? 0})`, () => (
                  <div class="max-h-40 overflow-y-auto">
                    <For each={(el().elements ?? []) as CADElement[]}>{(child, index) =>
                      <div class="text-sm py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center">
                        <div class="w-4 h-4 mr-2 text-gray-600 dark:text-gray-300">
                          <Show when={child.type === "rectangle"}><div class="w-4 h-3 border border-current" /></Show>
                          <Show when={child.type === "circle"}><div class="w-4 h-4 rounded-full border border-current" /></Show>
                          <Show when={child.type === "line"}><div class="w-4 h-0.5 bg-current" /></Show>
                          <Show when={child.type === "cube"}><div class="w-4 h-4 bg-current opacity-30" /></Show>
                          <Show when={child.type === "sphere"}><div class="w-4 h-4 rounded-full bg-current opacity-30" /></Show>
                        </div>
                        <span>{child.name || `${child.type}-${index()}`}</span>
                      </div>}</For>
                  </div>
                ))}
              </Show>
            </div>
          </div>

          <Show when={!editMode()}>
            <div class="p-3 border-t">
              <div class="flex flex-wrap gap-2">
                <button class="flex items-center px-2.5 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600" title={t("cad.ribbon.duplicate")}
                  onClick={() => { elements.duplicateElement(el().id); selection.clearSelection() }}><Copy size={12} class="mr-1" />{t("cad.ribbon.duplicate")}</button>
                <button class="flex items-center px-2.5 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600" title={t("cad.move")}
                  onClick={() => {
                    useCADStore.getState().setActiveTool("move")
                    if (!useSelectionStore.getState().selectedElementIds.includes(el().id)) useSelectionStore.getState().selectElement(el().id)
                  }}><Move size={12} class="mr-1" />{t("cad.move")}</button>
                <Show when={el().type === "component"}>
                  <button class="flex items-center px-2.5 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600" title={t("cad.info.ungroup")}
                    onClick={() => selection.ungroupElement(el().id)}><Layers size={12} class="mr-1" />{t("browser.ungroup")}</button>
                </Show>
                <button class="flex items-center px-2.5 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600" title={t("cad.customElements.delete")}
                  onClick={() => { elements.deleteElement(el().id); selection.clearSelection(); props.onClose?.() }}><Trash2 size={12} class="mr-1" />{t("cad.customElements.delete")}</button>
              </div>
            </div>
          </Show>
        </div>
      )
    }}</Show>
  )
}
