import { Box } from "lucide-solid"
import { A } from "@solidjs/router"
import { For, Show, createEffect, createMemo, createSignal, on, onMount, type JSX } from "solid-js"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { INPUT as FIELD, LABEL } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useCADStore, type MachineConfig } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { pickMachine } from "../../cam/lib/machine-pick.ts"
import { MACHINES_PATH, machineControllerOf, machineEnvelopeOf, machineFeedOf, machineSpindleOf, machineTypeLabel, machinesFromResponse } from "../../cam/lib/machines.ts"

const MATERIALS = [["aluminum", "Aluminum"], ["steel", "Steel"], ["wood", "Wood"], ["plastic", "Plastic"], ["brass", "Brass"], ["titanium", "Titanium"], ["copper", "Copper"], ["composite", "Composite"], ["custom", "Other"]] as const

/** Stock size, position and material, and the machine it is for; "Apply" (re)creates the workpiece element. */
export default function WorkpieceSetup(): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const layers = useLayerStore()
  const elements = useElementsStore()
  /** The built-in catalogue, then the Resources library: the same two lists the CAM sidebar's machine tab shows. */
  const [builtins, setBuiltins] = createSignal<ReadonlyArray<MachineConfig>>([])
  const [saved, setSaved] = createSignal<ReadonlyArray<MachineConfig>>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [workpieceId, setWorkpieceId] = createSignal<string | null>(null)
  const initial = () => ({
    width: cad.workpiece.width, height: cad.workpiece.height, depth: cad.workpiece.depth, radius: cad.workpiece.radius, material: cad.workpiece.material,
    positionX: 0, positionY: 0, positionZ: 0
  })
  const [form, setForm] = createSignal(initial())
  const set = (name: string, value: string) => setForm((previous) => ({ ...previous, [name]: name === "material" ? value : parseFloat(value) }))

  /**
   * Both answers are read through the shared normaliser: the list endpoint nests its rows
   * (`{ success, data: { data, pagination } }`), so `data` is not itself the array.
   */
  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const [catalogue, library] = await Promise.all([
        app.runtime.run(app.client.machineConfigs.defaults({})),
        app.runtime.run(app.client.machineConfigs.list({ query: {} }))
      ])
      setBuiltins(machinesFromResponse(catalogue))
      setSaved(machinesFromResponse(library))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBuiltins([])
      setSaved([])
    } finally {
      setLoading(false)
    }
  }

  onMount(() => { void load() })

  const machines = createMemo(() => [...builtins(), ...saved()])
  const machineId = () => cad.selectedMachine?.id ?? ""

  /** A machine restored with a drawing can outlive its library row: it is still listed, so the pick never looks empty. */
  const orphan = createMemo(() => {
    const pick = cad.selectedMachine
    if (pick === null || loading() || machines().some((machine) => machine.id === pick.id)) return undefined
    return pick
  })

  let machineSelect: HTMLSelectElement | undefined
  // The options render after the first pass and the lists arrive late: put the pick back once its option exists.
  createEffect(on([machines, loading, machineId], () => {
    if (machineSelect === undefined || loading()) return
    machineSelect.value = machineId()
  }))

  createEffect(() => {
    const existing = elements.elements.find((element) => element.type === "workpiece")
    if (!existing) return
    setWorkpieceId(existing.id)
    setForm({
      width: existing.width || cad.workpiece.width || 0, height: existing.height || cad.workpiece.height || 0, depth: existing.depth || cad.workpiece.depth || 0,
      radius: existing.radius || cad.workpiece.radius || 0, material: existing.material || cad.workpiece.material || "",
      positionX: existing.x || 0, positionY: existing.y || 0, positionZ: existing.z || 0
    })
  })

  const changeMachine = (id: string) => {
    if (id === "") { pickMachine(undefined); return }
    const chosen = machines().find((machine) => machine.id === id) ?? (cad.selectedMachine?.id === id ? cad.selectedMachine : undefined)
    if (chosen === undefined) return
    pickMachine(chosen)
    const volume = machineEnvelopeOf(chosen)
    if (volume !== undefined) setForm((previous) => ({ ...previous, width: volume.x, height: volume.y, depth: volume.z }))
  }

  const apply = () => {
    const state = form()
    cad.setWorkpiece({ width: state.width, height: state.height, depth: state.depth, radius: state.radius, material: state.material })
    const previous = workpieceId()
    if (previous) elements.deleteElement(previous)
    const id = elements.addElement({
      type: "workpiece", x: state.positionX, y: state.positionY, z: state.positionZ, width: state.width, height: state.height, depth: state.depth,
      material: state.material, color: "#808080", wireframe: true, layerId: layers.layers[0]?.id
    })
    setWorkpieceId(id)
  }

  const number = (name: "width" | "height" | "depth" | "positionX" | "positionY" | "positionZ", label: string, wrap = false) => (
    <div>
      <label class={LABEL}>{label}</label>
      <Show when={wrap} fallback={<input type="number" name={name} value={form()[name]} onInput={(e) => set(name, e.currentTarget.value)} class={`mt-1 ${FIELD}`} />}>
        <div class="mt-1 relative rounded-md shadow-sm">
          <input type="number" name={name} value={form()[name]} onInput={(e) => set(name, e.currentTarget.value)} class={FIELD} />
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none" />
        </div>
      </Show>
    </div>
  )

  const option = (machine: MachineConfig) => <option value={machine.id}>{machine.name} ({machineTypeLabel(machine)})</option>

  return (
    <SidebarSection id="cad-workpiece" title={t("cad.workpieceSetup")} icon={Box}>
      <div>
        <label class={LABEL} for="cad-workpiece-machine">{t("cad.machineConfiguration")}</label>
        <select ref={machineSelect} id="cad-workpiece-machine" name="machine" data-testid="cad-workpiece-machine" value={machineId()}
          onChange={(e) => changeMachine(e.currentTarget.value)} class={`mt-1 ${FIELD}`} disabled={loading()}>
          <option value="">{loading() ? t("cad.machineLoading") : t("cad.machineSelect")}</option>
          <Show when={builtins().length > 0}>
            <optgroup label={t("cad.machineBuiltin")}><For each={builtins()}>{(machine) => option(machine)}</For></optgroup>
          </Show>
          <Show when={saved().length > 0}>
            <optgroup label={t("cad.machineSaved")}><For each={saved()}>{(machine) => option(machine)}</For></optgroup>
          </Show>
          <Show when={orphan()}>{(machine) => <option value={machine().id}>{machine().name} ({machineTypeLabel(machine())}) — {t("cad.machineNotInLibrary")}</option>}</Show>
        </select>
        <Show when={error()}>{(message) => (
          <div class="mt-1 flex items-center gap-2 text-xs text-red-600 dark:text-red-400" role="alert">
            <span title={message()}>{t("cad.machineError")}</span>
            <button type="button" class="text-blue-600 hover:underline dark:text-blue-400" onClick={() => void load()}>{t("cad.machineRetry")}</button>
          </div>
        )}</Show>
        <Show when={!loading() && error() === undefined && machines().length === 0}>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("cad.machineEmpty")} <A href={MACHINES_PATH} class="text-blue-600 hover:underline dark:text-blue-400">{t("cad.machineCreate")}</A>
          </p>
        </Show>
      </div>
      <div class="panel-grid panel-grid--3">{number("width", "Width", true)}{number("height", "Height", true)}{number("depth", "Depth", true)}</div>
      <div class="panel-grid panel-grid--3">{number("positionX", "Position X")}{number("positionY", "Position Y")}{number("positionZ", "Position Z")}</div>
      <div class="panel-grid panel-grid--2">
        <div>
          <label class={LABEL}>{t("cad.viewMaterial")}</label>
          <select name="material" value={form().material} onChange={(e) => set("material", e.currentTarget.value)} class={`mt-1 ${FIELD}`}>
            <For each={MATERIALS}>{([value, label]) => <option value={value}>{label}</option>}</For>
          </select>
        </div>
      </div>
      <Show when={cad.selectedMachine}>{(machine) => (
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-md text-sm">
          <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-1">{t("cad.machineInformation")}</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
            <div>{t("cad.machineType")}: <span class="font-medium">{machineTypeLabel(machine())}</span></div>
            <Show when={machineEnvelopeOf(machine())}>{(volume) =>
              <div>{t("cad.machineWorkVolume")}: <span class="font-medium">{volume().x}×{volume().y}×{volume().z} {t("cad.millimeters")}</span></div>}</Show>
            <Show when={machineSpindleOf(machine())}>{(rpm) =>
              <div>{t("cad.machineSpindle")}: <span class="font-medium">{rpm()} rpm</span></div>}</Show>
            <Show when={machineFeedOf(machine())}>{(feed) =>
              <div>{t("cad.machineFeed")}: <span class="font-medium">{feed()} mm/min</span></div>}</Show>
            <Show when={machineControllerOf(machine())}>{(controller) =>
              <div>{t("cad.machineController")}: <span class="font-medium">{controller()}</span></div>}</Show>
          </div>
        </div>)}
      </Show>
      <div class="pt-3 flex justify-between">
        <button type="button" onClick={() => setForm(initial())} class="panel-btn">{t("cad.reset")}</button>
        <button type="button" onClick={apply} class="panel-btn panel-btn--primary">{t("cad.canvas.applyChanges")}</button>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <p>The workpiece will be created in the default layer &quot;{layers.layers[0]?.name}&quot; and will be available for both CAD and CAM.</p>
      </div>
    </SidebarSection>
  )
}
