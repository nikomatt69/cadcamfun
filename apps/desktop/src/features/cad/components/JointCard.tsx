import { For, Show, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { PanelCard } from "../../../shared/components/panel/ui.tsx"
import { useCADStore } from "../store/cadStore.ts"
import { useAssemblyStore } from "../store/assemblyStore.ts"
import { describeJoint, type JointRow } from "../lib/joint-markers.ts"
import type { JointType } from "../types/assembly.ts"

/** The translated name of a joint type ("Revolute (rotation)"). */
export const jointTypeLabel = (type: JointType): string => {
  switch (type) {
    case "fixed": return t("cad.assembly.jointFixed")
    case "revolute": return t("cad.assembly.jointRevolute")
    case "prismatic": return t("cad.assembly.jointPrismatic")
    case "cylindrical": return t("cad.assembly.jointCylindrical")
    case "spherical": return t("cad.assembly.jointSpherical")
    case "planar": return t("cad.assembly.jointPlanar")
    case "free": return t("cad.assembly.jointFree")
  }
}

const rowLabel = (key: JointRow["key"]): string => t(`cad.joint.${key}`)

/** The picked joint, from the assembly: `undefined` when none is picked or it no longer exists. */
const pickedJoint = () => {
  const id = useCADStore.getState().pickedJoint
  return id === null ? undefined : useAssemblyStore.getState().getJointById(id)
}

/**
 * The properties of the joint the person picked in the canvas, as a card for the property panel: its name, type, the two nodes it
 * joins, origin, axes, limits and current value. Read-only here; the assembly panel edits joints.
 */
export default function JointCard(): JSX.Element {
  const cad = useCADStore()
  const assembly = useAssemblyStore()
  const joint = () => { cad.pickedJoint; assembly.assemblyState; return pickedJoint() }
  const nodeName = (id: string): string => assembly.getNodeById(id)?.name ?? id
  return (
    <Show when={joint()}>{(current) =>
      <PanelCard title={t("cad.joint.title")} testId="joint-card" actions={
        <button type="button" class="panel-btn" onClick={() => cad.setPickedJoint(null)}>{t("cad.joint.clear")}</button>
      }>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <For each={describeJoint(current(), nodeName)}>{(row) =>
            <>
              <dt class="text-gray-500 dark:text-gray-400">{rowLabel(row.key)}</dt>
              <dd class="break-words text-gray-900 dark:text-gray-100" data-testid={`joint-${row.key}`}>{row.key === "type" ? jointTypeLabel(current().type) : row.value}</dd>
            </>}
          </For>
        </dl>
      </PanelCard>}
    </Show>
  )
}
