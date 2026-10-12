import { For, Match, Show, Switch, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Copy, Lock, Trash2 } from "lucide-solid"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { getFieldsForElementType, type PropertyField } from "../lib/propertyFields.ts"
import ParametricPanel from "./ParametricPanel.tsx"
import SaveElementToLibrary from "./SaveElementToLibrary.tsx"
import SurfacingPanel from "./SurfacingPanel.tsx"
import { ColorListInput, ElementListInput, Point3dInput, PointListInput, Vector3Input } from "./property-inputs/index.ts"

const SOLID_TYPES_FOR_SURFACING = new Set(["box", "cube", "cylinder", "sphere", "cone", "torus", "extrude", "revolve"])

type Props = Record<string, any>

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
const READONLY = "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-gray-100 dark:bg-gray-700 dark:text-white"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
const ORIGIN = { x: 0, y: 0, z: 0 }
const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }

/** Edits the selected element: per-type fields, complex inputs, layer lock awareness, duplicate / delete / save to library. */
export default function PropertyPanel(): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const [properties, setProperties] = createSignal<Props>({})
  const [editing, setEditing] = createSignal(false)

  createEffect(() => {
    const selected = elements.selectedElement
    if (selected) { setProperties({ ...selected }); setEditing(false) }
    else setProperties({})
  })

  const layer = createMemo(() => (elements.selectedElement ? layers.layers.find((candidate) => candidate.id === elements.selectedElement!.layerId) : undefined))
  const locked = () => layer()?.locked ?? false
  const disabled = () => !editing() || locked()
  const set = (name: string, value: unknown) => setProperties((previous) => ({ ...previous, [name]: value }))

  const change = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) => {
    const target = event.currentTarget as HTMLInputElement
    if (target.type === "number") set(target.name, target.value === "" ? "" : parseFloat(target.value))
    else if (target.type === "checkbox") set(target.name, target.checked)
    else set(target.name, target.value)
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const selected = elements.selectedElement
    if (selected) { elements.updateElement(selected.id, properties()); setEditing(false) }
  }

  const fields = createMemo(() => getFieldsForElementType(properties().type).filter((field) => !field.showIf || field.showIf(properties())))

  const control = (field: PropertyField): JSX.Element => (
    <Switch fallback={
      <input type={field.type} id={field.name} name={field.name} value={properties()[field.name] !== undefined ? properties()[field.name] : ""} onInput={change} min={field.min} max={field.max} step={field.step} disabled={disabled()} class={INPUT} />
    }>
      <Match when={field.type === "point3d"}><Point3dInput value={properties()[field.name] || ORIGIN} onChange={(value) => set(field.name, value)} disabled={disabled()} step={field.step || 0.1} label={field.label} /></Match>
      <Match when={field.type === "pointList"}><PointListInput value={properties()[field.name] || []} onChange={(value) => set(field.name, value)} disabled={disabled()} minPoints={field.minPoints} maxPoints={field.maxPoints} exactPoints={field.exactPoints} label={field.label} /></Match>
      <Match when={field.type === "vector3"}><Vector3Input label={field.label} value={properties()[field.name] || ORIGIN} onChange={(value) => set(field.name, value)} disabled={disabled()} step={field.step || 1} unit={field.unit || "°"} /></Match>
      <Match when={field.type === "list"}><ElementListInput value={properties()[field.name] || []} onChange={(value) => set(field.name, value)} disabled={disabled()} listType={(field.listType as "element") || "element"} label={field.label} /></Match>
      <Match when={field.type === "colorList"}><ColorListInput value={properties()[field.name] || []} onChange={(value) => set(field.name, value)} disabled={disabled()} label={field.label} /></Match>
      <Match when={field.type === "checkbox"}>
        <div class="flex items-center">
          <input type="checkbox" id={field.name} name={field.name} checked={!!properties()[field.name]} onChange={change} disabled={disabled()} class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
          <span class="ml-2 block text-sm text-gray-900 dark:text-gray-300">{field.label}</span>
        </div>
      </Match>
      <Match when={field.type === "color"}>
        <div class="flex items-center space-x-2">
          <input type="color" id={field.name} name={field.name} value={properties()[field.name] || "#000000"} onInput={change} disabled={disabled()} class="h-8 w-8 p-0 border-0" />
          <input type="text" value={properties()[field.name] || "#000000"} onInput={change} name={field.name} disabled={disabled()} class={`flex-1 ${INPUT}`} />
        </div>
      </Match>
      <Match when={field.type === "select"}>
        <select id={field.name} name={field.name} value={properties()[field.name] || ""} onChange={change} disabled={disabled()} class={INPUT}>
          <For each={field.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
      </Match>
      <Match when={field.type === "text"}>
        <input type="text" id={field.name} name={field.name} value={properties()[field.name] || ""} onInput={change} disabled={disabled()} class={INPUT} />
      </Match>
    </Switch>
  )

  return (
    <Show when={elements.selectedElement} fallback={
      <Motion.div class="workstation-properties dark:text-white" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Properties</h3>
        <p class="text-gray-500 text-sm">No element selected</p>
      </Motion.div>
    }>{(selected) =>
      <Motion.div class="workstation-properties dark:text-white" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Element Properties</h3>
          <div class="flex space-x-2">
            <SaveElementToLibrary />
            <Motion.button hover={{ scale: 1.1 }} press={{ scale: 0.9 }} onClick={() => elements.duplicateElement(selected().id)} class="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none" title="Duplicate Element" disabled={locked()}>
              <Copy size={18} class={locked() ? "text-gray-400" : ""} />
            </Motion.button>
            <Motion.button hover={{ scale: 1.1 }} press={{ scale: 0.9 }} onClick={() => { if (window.confirm("Are you sure you want to delete this element?")) elements.deleteElement(selected().id) }} class="p-1 rounded-full text-red-600 hover:bg-red-100 focus:outline-none" title="Delete Element" disabled={locked()}>
              <Trash2 size={18} class={locked() ? "text-gray-400" : ""} />
            </Motion.button>
          </div>
        </div>

        <Show when={locked()}>
          <div class="bg-yellow-50 text-yellow-800 p-3 rounded-md mb-4 text-sm flex items-center"><Lock size={16} class="mr-2" /><span>This element is on a locked layer and cannot be edited</span></div>
        </Show>

        <form onSubmit={submit}>
          <div class="space-y-4">
            <Motion.div {...rise}><label for="name" class={LABEL}>Name</label><input type="text" id="name" name="name" class={READONLY} value={properties().name || ""} disabled /></Motion.div>
            <Motion.div {...rise}><label for="id" class={LABEL}>ID</label><input type="text" id="id" name="id" class={READONLY} value={properties().id || ""} disabled /></Motion.div>
            <Motion.div {...rise}><label for="type" class={LABEL}>Type</label><input type="text" id="type" name="type" class={READONLY} value={properties().type || ""} disabled /></Motion.div>
            <Motion.div {...rise}>
              <label class={LABEL}>Layer</label>
              <div class="flex items-center">
                <div class="w-4 h-4 rounded-full mr-2" style={{ "background-color": layer()?.color || "#cccccc" }} />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {layer()?.name || "Unknown Layer"}
                  <Show when={layer()?.locked}><span class="ml-2 text-xs text-gray-500">(locked)</span></Show>
                </span>
              </div>
            </Motion.div>

            <For each={fields()}>{(field) =>
              <Motion.div {...rise}>
                <label for={field.name} class={LABEL}>{field.label}</label>
                {control(field)}
              </Motion.div>}
            </For>

            <Motion.div class="mt-6 flex justify-end space-x-3" {...rise}>
              <Show when={editing()} fallback={
                <Motion.button type="button" onClick={() => setEditing(true)} class="px-3 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500" hover={{ scale: 1.05 }} press={{ scale: 0.95 }} disabled={locked()}>Edit Properties</Motion.button>
              }>
                <Motion.button type="button" onClick={() => { setProperties({ ...selected() }); setEditing(false) }} class="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-[#F8FBFF] dark:bg-gray-700 dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" hover={{ scale: 1.05 }} press={{ scale: 0.95 }}>Cancel</Motion.button>
                <Motion.button type="submit" class="px-3 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500" hover={{ scale: 1.05 }} press={{ scale: 0.95 }} disabled={locked()}>Apply</Motion.button>
              </Show>
            </Motion.div>
          </div>
        </form>

        <Show when={selected().type === "parametric" && selected().history}>
          <ParametricPanel element={selected()} locked={locked()} />
        </Show>

        <Show when={SOLID_TYPES_FOR_SURFACING.has(String(selected().type))}>
          <div class="mt-6 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-600">
            <SurfacingPanel />
          </div>
        </Show>
      </Motion.div>}
    </Show>
  )
}
