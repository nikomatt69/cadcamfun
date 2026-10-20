import { For, Match, Show, Switch, createEffect, createMemo, createSignal, untrack, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Copy, Lock, Trash2 } from "lucide-solid"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { getFieldsForElementType, numberRulesFor, type PropertyField } from "../lib/propertyFields.ts"
import ParametricPanel from "./ParametricPanel.tsx"
import ExactModelPanel from "./ExactModelPanel.tsx"

/** Elements that can have an exact (B-rep) model: STEP imports, analytic catalogue solids, parametric parts, Booleans. */
const EXACT_TYPES: ReadonlySet<string> = new Set(["brep", "parametric", "cube", "cylinder", "cone", "sphere", "torus", "hemisphere", "prism", "pyramid", "extrusion", "revolution", "boolean-union", "boolean-subtract", "boolean-intersect"])
import SaveElementToLibrary from "./SaveElementToLibrary.tsx"
import SurfacingPanel from "./SurfacingPanel.tsx"
import { canMakeParametric, makeParametric } from "../lib/makeParametric.ts"
import { ColorListInput, ElementListInput, NumberField, Point3dInput, PointListInput, Vector3Input } from "./property-inputs/index.ts"

const SOLID_TYPES_FOR_SURFACING = new Set(["box", "cube", "cylinder", "sphere", "cone", "torus", "extrude", "revolve"])
/** The fields that draw their own label: the panel must not repeat it above them. */
const SELF_LABELLED = new Set(["vector3", "point3d", "pointList", "list", "colorList"])

type Props = Record<string, any>

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
const READONLY = "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-gray-100 dark:bg-gray-700 dark:text-white"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
const ORIGIN = { x: 0, y: 0, z: 0 }
const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
const same = (a: unknown, b: unknown) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b))

/** Edits the selected element: per-type fields, complex inputs, layer lock awareness, duplicate / delete / save to library. */
export default function PropertyPanel(): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const [properties, setProperties] = createSignal<Props>({})
  // What the fields were filled from: Apply writes only what differs from it, so an outside change to another field survives.
  let base: Props = {}
  const show = (snapshot: Props) => { base = snapshot; setProperties(snapshot) }
  // The fields are read-only until Edit Properties; then typing makes the panel dirty, Apply (or Enter) writes the change and
  // Cancel (or Esc) drops it, both ending the edit.
  const [editing, setEditing] = createSignal(false)
  const [dirty, setDirty] = createSignal(false)
  // Fields whose text is not a valid value right now ("12,", "abc", below the minimum): Apply refuses while any is left.
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [tried, setTried] = createSignal(false)
  // Bumped to remount the fields, so a reset also clears what was half-typed in them.
  const [revision, setRevision] = createSignal(1)

  const reset = (snapshot: Props) => {
    show(snapshot)
    setDirty(false)
    setErrors({})
    setTried(false)
    setEditing(false)
    setRevision((n) => n + 1)
  }

  // A new selection starts clean; an update of the same element (the viewport, the assistant) refreshes the fields
  // unless the person is in the middle of changing them.
  let shown: string | undefined
  createEffect(() => {
    const selected = elements.selectedElement
    const snapshot: Props = selected ? { ...selected } : {}
    untrack(() => {
      if (selected?.id !== shown) { shown = selected?.id; reset(snapshot) }
      else if (!changed()) show(snapshot)
    })
  })

  const layer = createMemo(() => (elements.selectedElement ? layers.layers.find((candidate) => candidate.id === elements.selectedElement!.layerId) : undefined))
  const locked = () => layer()?.locked ?? false
  const disabled = () => !editing() || locked()
  // Text that is not a value yet ("12,", "abc") is a change too: Esc and Cancel must be able to drop it.
  const changed = () => dirty() || Object.keys(errors()).length > 0
  const set = (name: string, value: unknown) => { setProperties((previous) => ({ ...previous, [name]: value })); setDirty(true) }
  const flag = (key: string, error: string | null) => setErrors((previous) => {
    if ((previous[key] ?? null) === error) return previous
    const next = { ...previous }
    if (error === null) delete next[key]
    else next[key] = error
    return next
  })
  const cancel = () => { const selected = elements.selectedElement; reset(selected ? { ...selected } : {}) }

  // Make the element parametric: its measures become named parameters. The original stays unless the person chooses to replace it.
  const [conversion, setConversion] = createSignal("")
  const convert = (replace: boolean) => {
    const current = elements.selectedElement
    if (!current) return
    const result = makeParametric(current as unknown as Record<string, unknown>)
    if (!result.ok) { setConversion(result.error); return }
    const id = elements.addElement(result.twin)
    if (id === "") { setConversion("There is no active layer to put the parametric part on"); return }
    // Same layer as the original, not the active one.
    if (current.layerId !== undefined) elements.updateElement(id, { layerId: current.layerId })
    if (replace) elements.deleteElement(current.id)
    elements.selectElement(id)
    setConversion(result.notes.join("; "))
  }

  const change = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) => {
    const target = event.currentTarget as HTMLInputElement
    if (target.type === "checkbox") set(target.name, target.checked)
    else set(target.name, target.value)
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const selected = elements.selectedElement
    if (!selected || locked()) return
    const invalid = Object.keys(errors())
    if (invalid.length > 0) {
      setTried(true)
      const form = event.currentTarget as HTMLFormElement
      form.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus()
      return
    }
    // Only what changed: a field the person did not touch keeps whatever the element has now.
    const changes: Props = {}
    for (const [key, value] of Object.entries(properties())) if (!same(value, base[key])) changes[key] = value
    if (Object.keys(changes).length > 0) elements.updateElement(selected.id, changes)
    setDirty(false)
    setTried(false)
    setEditing(false)
    const updated = elements.selectedElement
    if (updated) show({ ...updated })
  }

  // Keyed on the type only: a list rebuilt on every keystroke would remount the inputs and take the focus away mid-typing.
  const elementType = createMemo(() => String(properties().type ?? ""))
  const fields = createMemo(() => getFieldsForElementType(elementType()))

  const control = (field: PropertyField): JSX.Element => (
    <Switch fallback={
      <input type={field.type} id={field.name} name={field.name} value={properties()[field.name] !== undefined ? properties()[field.name] : ""} onInput={change} disabled={disabled()} class={INPUT} />
    }>
      <Match when={field.type === "number"}>
        <NumberField id={field.name} name={field.name} label={field.label} value={properties()[field.name]} onChange={(value) => set(field.name, value)} onError={(error) => flag(field.name, error)} {...numberRulesFor(field)} step={field.step} disabled={disabled()} showError={tried()} class={INPUT} />
      </Match>
      <Match when={field.type === "point3d"}><Point3dInput name={field.name} value={properties()[field.name] || ORIGIN} onChange={(value) => set(field.name, value)} onError={(axis, error) => flag(`${field.name}.${axis}`, error)} disabled={disabled()} step={field.step || 0.1} label={field.label} /></Match>
      <Match when={field.type === "pointList"}><PointListInput value={properties()[field.name] || []} onChange={(value) => set(field.name, value)} disabled={disabled()} minPoints={field.minPoints} maxPoints={field.maxPoints} exactPoints={field.exactPoints} label={field.label} /></Match>
      <Match when={field.type === "vector3"}><Vector3Input name={field.name} label={field.label} value={properties()[field.name] || ORIGIN} onChange={(value) => set(field.name, value)} onError={(axis, error) => flag(`${field.name}.${axis}`, error)} disabled={disabled()} step={field.step || 1} unit={field.unit || "°"} /></Match>
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

        <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && editing()) { event.preventDefault(); cancel() } }}>
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

            <Show when={revision()} keyed>{(_revision: number) =>
              <For each={fields()}>{(field) =>
                <Show when={!field.showIf || field.showIf(properties())}>
                  <Motion.div {...rise}>
                    <Show when={!SELF_LABELLED.has(field.type)}><label for={field.name} class={LABEL}>{field.label}</label></Show>
                    {control(field)}
                  </Motion.div>
                </Show>}
              </For>}
            </Show>

            <Show when={tried() && Object.keys(errors()).length > 0}>
              <p class="text-sm text-red-600 dark:text-red-400" role="alert" data-testid="property-errors">Fix the highlighted values before applying.</p>
            </Show>
            <Motion.div class="mt-6 flex items-center justify-end gap-3" {...rise}>
              <Show when={editing()} fallback={
                <Motion.button type="button" onClick={() => setEditing(true)} class="px-3 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" hover={{ scale: 1.05 }} press={{ scale: 0.95 }} disabled={locked()}>Edit Properties</Motion.button>
              }>
              <span class="mr-auto text-xs text-gray-500 dark:text-gray-400">{changed() ? "Enter applies · Esc cancels" : "Type a value: 12,5 · 12.5 · 40/2+3"}</span>
              <Motion.button type="button" onClick={cancel} class="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-[#F8FBFF] dark:bg-gray-700 dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" hover={{ scale: 1.05 }} press={{ scale: 0.95 }}>Cancel</Motion.button>
              <Motion.button type="submit" class="px-3 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" hover={{ scale: 1.05 }} press={{ scale: 0.95 }} disabled={locked()}>Apply</Motion.button>
              </Show>
            </Motion.div>
          </div>
        </form>

        <Show when={selected().type === "parametric" && selected().history}>
          <ParametricPanel element={selected()} locked={locked()} />
        </Show>

        <Show when={EXACT_TYPES.has(String(selected().type))}>
          <ExactModelPanel element={selected()} all={elements.elements as ReadonlyArray<Record<string, unknown>>} />
        </Show>

        <Show when={canMakeParametric(selected())}>
          <div class="mt-6 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-600">
            <p class="text-sm text-gray-600 dark:text-gray-300">Turn this {String(selected().type)} into a parametric part: its measures become named parameters you can edit or drive by a formula.</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="px-3 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={locked()} onClick={() => convert(false)}>Make parametric</button>
              <button type="button" class="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:border-gray-600" disabled={locked()} onClick={() => { if (window.confirm("Replace this element with its parametric twin?")) convert(true) }}>Replace with parametric</button>
            </div>
            <Show when={conversion() !== ""}><p class="text-xs text-gray-500 dark:text-gray-400">{conversion()}</p></Show>
          </div>
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
