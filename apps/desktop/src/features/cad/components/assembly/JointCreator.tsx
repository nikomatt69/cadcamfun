/**
 * Joints between assembly nodes (legacy `components/cad/assembly/JointCreator.tsx`).
 *
 * A joint connects a parent node to a child node with a type, an origin, an axis and the movement
 * limits the machine is allowed to apply. The kinds, the fields they expose and what a joint means
 * are the legacy ones; the store underneath (`JointSystem`) is unchanged.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { t, type Key } from "../../../../i18n/index.ts"
import { useAssemblyStore } from "../../store/assemblyStore.ts"
import type { AssemblyNode, Joint, JointLimits, JointType } from "../../types/assembly.ts"

export interface JointCreatorProps {
  /** Called after a joint was created, so the page can report or frame it. */
  readonly onJointCreated?: (jointId: string) => void
}

const JOINT_TYPES: ReadonlyArray<JointType> = ["fixed", "revolute", "prismatic", "cylindrical", "spherical", "planar"]

const JOINT_LABEL: Readonly<Record<JointType, Key>> = {
  fixed: "cad.assembly.jointFixed",
  revolute: "cad.assembly.jointRevolute",
  prismatic: "cad.assembly.jointPrismatic",
  cylindrical: "cad.assembly.jointCylindrical",
  spherical: "cad.assembly.jointSpherical",
  planar: "cad.assembly.jointPlanar",
  free: "cad.assembly.jointFree",
}

/** Joint kinds that need a primary axis to describe their movement. */
const NEEDS_AXIS: ReadonlySet<JointType> = new Set<JointType>(["revolute", "prismatic", "cylindrical", "planar"])
const NEEDS_ANGLE: ReadonlySet<JointType> = new Set<JointType>(["revolute", "cylindrical"])
const NEEDS_DISTANCE: ReadonlySet<JointType> = new Set<JointType>(["prismatic", "cylindrical", "planar"])

const AXIS_PRESETS: ReadonlyArray<{ readonly label: string; readonly value: { x: number; y: number; z: number } }> = [
  { label: "X", value: { x: 1, y: 0, z: 0 } },
  { label: "Y", value: { x: 0, y: 1, z: 0 } },
  { label: "Z", value: { x: 0, y: 0, z: 1 } },
]

const NumberField = (props: { label: string; value: number; step?: number; onChange: (value: number) => void }): JSX.Element => (
  <label class="block">
    <span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{props.label}</span>
    <input
      type="number"
      class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      value={props.value}
      step={props.step ?? 0.1}
      onInput={(event) => props.onChange(Number.parseFloat(event.currentTarget.value) || 0)}
    />
  </label>
)

const VectorField = (props: { value: { x: number; y: number; z: number }; onChange: (value: { x: number; y: number; z: number }) => void }): JSX.Element => (
  <div class="grid grid-cols-3 gap-2">
    <NumberField label="X" value={props.value.x} onChange={(x) => props.onChange({ ...props.value, x })} />
    <NumberField label="Y" value={props.value.y} onChange={(y) => props.onChange({ ...props.value, y })} />
    <NumberField label="Z" value={props.value.z} onChange={(z) => props.onChange({ ...props.value, z })} />
  </div>
)

export default function JointCreator(props: JointCreatorProps): JSX.Element {
  const store = useAssemblyStore()
  const [showForm, setShowForm] = createSignal(false)
  const [jointType, setJointType] = createSignal<JointType>("fixed")
  const [parentId, setParentId] = createSignal("")
  const [childId, setChildId] = createSignal("")
  const [origin, setOrigin] = createSignal({ x: 0, y: 0, z: 0 })
  const [primaryAxis, setPrimaryAxis] = createSignal({ x: 0, y: 0, z: 1 })
  const [limits, setLimits] = createSignal<JointLimits>({})

  const nodes = (): Readonly<Record<string, AssemblyNode>> => store.assemblyState.nodes
  const joints = (): Readonly<Record<string, Joint>> => store.assemblyState.joints
  const options = (): ReadonlyArray<AssemblyNode> => Object.values(nodes()).filter((node) => node.type === "component" || node.type === "subassembly")
  const label = (node: AssemblyNode): string => node.name || `${node.type} ${node.id.slice(0, 4)}`

  const reset = (): void => {
    setJointType("fixed")
    setParentId("")
    setChildId("")
    setOrigin({ x: 0, y: 0, z: 0 })
    setPrimaryAxis({ x: 0, y: 0, z: 1 })
    setLimits({})
    setShowForm(false)
  }

  const create = (): void => {
    if (!parentId() || !childId()) return
    const joint = store.addJoint(jointType(), parentId(), childId(), origin(), primaryAxis(), undefined, limits(), `${jointType()} joint`)
    if (joint) props.onJointCreated?.(joint.id)
    reset()
  }

  return (
    <section class="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
      <header class="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 class="text-sm font-medium text-gray-900 dark:text-white">{t("cad.assembly.joints")}</h3>
        <button type="button" class="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600" onClick={() => setShowForm(!showForm())}>
          {showForm() ? t("cad.assembly.cancel") : `+ ${t("cad.assembly.addJoint")}`}
        </button>
      </header>

      <Show when={showForm()}>
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <label class="block">
            <span class="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cad.assembly.jointType")}</span>
            <select class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={jointType()} onChange={(event) => setJointType(event.currentTarget.value as JointType)}>
              <For each={JOINT_TYPES}>{(type) => <option value={type}>{t(JOINT_LABEL[type])}</option>}</For>
            </select>
          </label>

          <label class="block">
            <span class="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cad.assembly.parentNode")}</span>
            <select class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={parentId()} onChange={(event) => setParentId(event.currentTarget.value)}>
              <option value="">{t("cad.assembly.selectParent")}</option>
              <For each={options()}>{(node) => <option value={node.id}>{label(node)}</option>}</For>
            </select>
          </label>

          <label class="block">
            <span class="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cad.assembly.childNode")}</span>
            <select class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50" value={childId()} disabled={!parentId()} onChange={(event) => setChildId(event.currentTarget.value)}>
              <option value="">{t("cad.assembly.selectChild")}</option>
              <For each={options().filter((node) => node.id !== parentId())}>{(node) => <option value={node.id}>{label(node)}</option>}</For>
            </select>
          </label>

          <div>
            <span class="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cad.assembly.jointOrigin")}</span>
            <VectorField value={origin()} onChange={setOrigin} />
          </div>

          <Show when={NEEDS_AXIS.has(jointType())}>
            <div>
              <span class="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cad.assembly.primaryAxis")}</span>
              <VectorField value={primaryAxis()} onChange={setPrimaryAxis} />
              <div class="flex gap-1 mt-1">
                <For each={AXIS_PRESETS}>{(preset) =>
                  <button type="button" class={`px-2 py-0.5 text-xs rounded border ${primaryAxis().x === preset.value.x && primaryAxis().y === preset.value.y && primaryAxis().z === preset.value.z ? "border-blue-500 text-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`} onClick={() => setPrimaryAxis({ ...preset.value })}>
                    {preset.label}
                  </button>
                }</For>
              </div>
            </div>
          </Show>

          <Show when={NEEDS_ANGLE.has(jointType())}>
            <div class="grid grid-cols-2 gap-2">
              <NumberField label={t("cad.assembly.minAngle")} value={limits().minAngle ?? 0} step={1} onChange={(value) => setLimits({ ...limits(), minAngle: value })} />
              <NumberField label={t("cad.assembly.maxAngle")} value={limits().maxAngle ?? 0} step={1} onChange={(value) => setLimits({ ...limits(), maxAngle: value })} />
            </div>
          </Show>

          <Show when={NEEDS_DISTANCE.has(jointType())}>
            <div class="grid grid-cols-2 gap-2">
              <NumberField label={t("cad.assembly.minDistance")} value={limits().minDistance ?? 0} onChange={(value) => setLimits({ ...limits(), minDistance: value })} />
              <NumberField label={t("cad.assembly.maxDistance")} value={limits().maxDistance ?? 0} onChange={(value) => setLimits({ ...limits(), maxDistance: value })} />
            </div>
          </Show>

          <div class="flex justify-end">
            <button type="button" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50" disabled={!parentId() || !childId()} onClick={create}>
              {t("cad.assembly.createJoint")}
            </button>
          </div>
        </div>
      </Show>

      <div class="overflow-y-auto max-h-80">
        <Show when={Object.keys(joints()).length === 0} fallback={
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            <For each={Object.values(joints())}>{(joint) =>
              <li class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex justify-between items-center">
                <div>
                  <div class="text-sm font-medium text-gray-900 dark:text-white capitalize">{joint.type}</div>
                  <div class="text-xs text-gray-600 dark:text-gray-400">
                    {nodes()[joint.parent]?.name ?? joint.parent.slice(0, 4)} → {nodes()[joint.child]?.name ?? joint.child.slice(0, 4)}
                  </div>
                </div>
                <button type="button" class="p-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-red-600" onClick={() => store.removeJoint(joint.id)} title={t("cad.assembly.removeJoint")}>
                  {t("cad.assembly.remove")}
                </button>
              </li>
            }</For>
          </ul>
        }>
          <div class="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 italic">{t("cad.assembly.noJoints")}</div>
        </Show>
      </div>
    </section>
  )
}
