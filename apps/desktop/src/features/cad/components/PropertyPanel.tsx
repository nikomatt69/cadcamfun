import { For, Match, Show, Switch, createEffect, createMemo, createSignal, untrack, type JSX } from "solid-js"
import { INPUT, LABEL, Note, PanelCard } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { Copy, Trash2 } from "lucide-solid"
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

const READONLY = INPUT
const ORIGIN = { x: 0, y: 0, z: 0 }
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
      <div class="workstation-properties">
        <PanelCard title={t("cad.properties")}><p class="panel-empty">{t("cad.noElementSelected")}</p></PanelCard>
      </div>
    }>{(selected) =>
      <div class="workstation-properties">
        <PanelCard title={t("cad.elementProperties")} testId="property-panel" actions={<>
            <SaveElementToLibrary />
            <button onClick={() => elements.duplicateElement(selected().id)} class="panel-icon-btn" title={t("cad.duplicate")} disabled={locked()}>
              <Copy size={18} class={locked() ? "text-gray-400" : ""} />
            </button>
            <button onClick={() => { if (window.confirm(t("cad.prop.confirmDelete"))) elements.deleteElement(selected().id) }} class="panel-icon-btn panel-icon-btn--danger" title={t("cad.deleteElement")} disabled={locked()}>
              <Trash2 size={18} class={locked() ? "text-gray-400" : ""} />
            </button>        </>}>


        <Show when={locked()}>
          <Note kind="warn">{t("cad.layerLocked")}</Note>
        </Show>

        <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && editing()) { event.preventDefault(); cancel() } }}>
          <div class="space-y-4">
            <div><label for="name" class={LABEL}>{t("cad.field.name")}</label><input type="text" id="name" name="name" class={READONLY} value={properties().name || ""} disabled /></div>
            <div><label for="id" class={LABEL}>ID</label><input type="text" id="id" name="id" class={READONLY} value={properties().id || ""} disabled /></div>
            <div><label for="type" class={LABEL}>{t("cad.machineType")}</label><input type="text" id="type" name="type" class={READONLY} value={properties().type || ""} disabled /></div>
            <div>
              <label class={LABEL}>{t("cad.layer")}</label>
              <div class="flex items-center">
                <div class="w-4 h-4 rounded-full mr-2" style={{ "background-color": layer()?.color || "#cccccc" }} />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {layer()?.name || t("cad.explorer.unknownLayer")}
                  <Show when={layer()?.locked}><span class="ml-2 text-xs text-gray-500">{t("cad.layers.lockedTag")}</span></Show>
                </span>
              </div>
            </div>

            <Show when={revision()} keyed>{(_revision: number) =>
              <For each={fields()}>{(field) =>
                <Show when={!field.showIf || field.showIf(properties())}>
                  <div>
                    <Show when={!SELF_LABELLED.has(field.type)}><label for={field.name} class={LABEL}>{field.label}</label></Show>
                    {control(field)}
                  </div>
                </Show>}
              </For>}
            </Show>

            <Show when={tried() && Object.keys(errors()).length > 0}>
              <p class="text-sm text-red-600 dark:text-red-400" role="alert" data-testid="property-errors">{t("cad.prop.fixValues")}</p>
            </Show>
            <div class="panel-edit-actions">
              <Show when={editing()} fallback={
                <button type="button" onClick={() => setEditing(true)} class="panel-btn panel-btn--primary" disabled={locked()}>{t("cad.editProperties")}</button>
              }>
              <span class="mr-auto text-xs text-gray-500 dark:text-gray-400">{changed() ? "Enter applies · Esc cancels" : "Type a value: 12,5 · 12.5 · 40/2+3"}</span>
              <button type="button" onClick={cancel} class="panel-btn">{t("common.cancel")}</button>
              <button type="submit" class="panel-btn panel-btn--primary" disabled={locked()}>{t("cad.surfacing.run")}</button>
              </Show>
            </div>
          </div>
        </form>
        </PanelCard>

        <Show when={selected().type === "parametric" && selected().history}>
          <ParametricPanel element={selected()} locked={locked()} />
        </Show>

        <Show when={EXACT_TYPES.has(String(selected().type))}>
          <ExactModelPanel element={selected()} all={elements.elements as ReadonlyArray<Record<string, unknown>>} />
        </Show>

        <Show when={canMakeParametric(selected())}>
          <div class="panel-section panel-section__body">
            <p class="text-sm text-gray-600 dark:text-gray-300">Turn this {String(selected().type)} into a parametric part: its measures become named parameters you can edit or drive by a formula.</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="panel-btn panel-btn--primary" disabled={locked()} onClick={() => convert(false)}>{t("cad.prop.makeParametric")}</button>
              <button type="button" class="panel-btn" disabled={locked()} onClick={() => { if (window.confirm(t("cad.prop.confirmReplace"))) convert(true) }}>{t("cad.prop.replaceParametric")}</button>
            </div>
            <Show when={conversion() !== ""}><p class="text-xs text-gray-500 dark:text-gray-400">{conversion()}</p></Show>
          </div>
        </Show>

        <Show when={SOLID_TYPES_FOR_SURFACING.has(String(selected().type))}>
          <div class="mt-2">
            <SurfacingPanel />
          </div>
        </Show>
      </div>}
    </Show>
  )
}
