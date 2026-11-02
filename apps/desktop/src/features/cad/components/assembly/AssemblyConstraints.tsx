import { NumberField, PanelCard } from "../../../../shared/components/panel/ui.tsx"
/**
 * Constraints between assembly nodes (legacy `components/cad/assembly/AssemblyConstraints.tsx`).
 *
 * A constraint pins a relationship between two nodes — coincident, a distance, an angle, an
 * orientation. `distance` and `angle` carry a value; the rest carry none.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Plus } from "lucide-solid"
import { t, type Key } from "../../../../i18n/index.ts"
import { useAssemblyStore } from "../../store/assemblyStore.ts"
import type { AssemblyNode, Constraint, ConstraintType } from "../../types/assembly.ts"

export interface AssemblyConstraintsProps {
  /** Called after a constraint was added. */
  readonly onConstraintAdded?: (constraintId: string) => void
}

const CONSTRAINT_TYPES: ReadonlyArray<ConstraintType> = ["fixed", "point", "distance", "angle", "parallel", "perpendicular", "tangent", "concentric"]

const CONSTRAINT_LABEL: Readonly<Record<ConstraintType, Key>> = {
  fixed: "cad.assembly.constraintFixed",
  point: "cad.assembly.constraintPoint",
  distance: "cad.assembly.constraintDistance",
  angle: "cad.assembly.constraintAngle",
  parallel: "cad.assembly.constraintParallel",
  perpendicular: "cad.assembly.constraintPerpendicular",
  tangent: "cad.assembly.constraintTangent",
  concentric: "cad.assembly.constraintConcentric",
}

export default function AssemblyConstraints(props: AssemblyConstraintsProps): JSX.Element {
  const store = useAssemblyStore()
  const [showForm, setShowForm] = createSignal(false)
  const [constraintType, setConstraintType] = createSignal<ConstraintType>("fixed")
  const [firstEntityId, setFirstEntityId] = createSignal("")
  const [secondEntityId, setSecondEntityId] = createSignal("")
  const [distance, setDistance] = createSignal(0)
  const [angle, setAngle] = createSignal(0)

  const nodes = (): Readonly<Record<string, AssemblyNode>> => store.assemblyState.nodes
  const constraints = (): Readonly<Record<string, Constraint>> => store.assemblyState.constraints
  const entities = (): ReadonlyArray<AssemblyNode> => Object.values(nodes())
  const label = (node: AssemblyNode): string => node.name || `${node.type} ${node.id.slice(0, 4)}`

  const reset = (): void => {
    setConstraintType("fixed")
    setFirstEntityId("")
    setSecondEntityId("")
    setDistance(0)
    setAngle(0)
    setShowForm(false)
  }

  const add = (): void => {
    if (!firstEntityId() || !secondEntityId()) return
    const parameters = constraintType() === "distance" ? { distance: distance() } : constraintType() === "angle" ? { angle: angle() } : {}
    const constraint = store.addConstraint(constraintType(), firstEntityId(), secondEntityId(), parameters)
    if (constraint) props.onConstraintAdded?.(constraint.id)
    reset()
  }

  return (
    <PanelCard title={t("cad.assembly.constraints")} actions={<>
<button type="button" class="panel-btn" onClick={() => setShowForm(!showForm())}>
          <Show when={showForm()} fallback={<><Plus size={12} aria-hidden="true" />{t("cad.assembly.addConstraint")}</>}>{t("cad.assembly.cancel")}</Show>
        </button>
    </>}>


      <Show when={showForm()}>
        <div class="p-3 border-b border-[color:var(--ent-line)] space-y-3">
          <label class="block">
            <span class="block text-xs text-[color:var(--ent-text-muted)] mb-1">{t("cad.assembly.constraintType")}</span>
            <select class="panel-input" value={constraintType()} onChange={(event) => setConstraintType(event.currentTarget.value as ConstraintType)}>
              <For each={CONSTRAINT_TYPES}>{(type) => <option value={type}>{t(CONSTRAINT_LABEL[type])}</option>}</For>
            </select>
          </label>

          <label class="block">
            <span class="block text-xs text-[color:var(--ent-text-muted)] mb-1">{t("cad.assembly.firstEntity")}</span>
            <select class="panel-input" value={firstEntityId()} onChange={(event) => setFirstEntityId(event.currentTarget.value)}>
              <option value="">{t("cad.assembly.selectEntity")}</option>
              <For each={entities()}>{(node) => <option value={node.id}>{label(node)}</option>}</For>
            </select>
          </label>

          <label class="block">
            <span class="block text-xs text-[color:var(--ent-text-muted)] mb-1">{t("cad.assembly.secondEntity")}</span>
            <select class="panel-input" value={secondEntityId()} onChange={(event) => setSecondEntityId(event.currentTarget.value)}>
              <option value="">{t("cad.assembly.selectEntity")}</option>
              <For each={entities()}>{(node) => <option value={node.id}>{label(node)}</option>}</For>
            </select>
          </label>

          <Show when={constraintType() === "distance"}>
            <label class="block">
              <span class="block text-xs text-[color:var(--ent-text-muted)] mb-1">{t("cad.assembly.distance")}</span>
              <NumberField class="panel-input" value={distance()} step="0.1" accept={(value) => value >= 0} onValue={setDistance} />
            </label>
          </Show>

          <Show when={constraintType() === "angle"}>
            <label class="block">
              <span class="block text-xs text-[color:var(--ent-text-muted)] mb-1">{t("cad.assembly.angleDegrees")}</span>
              <NumberField class="panel-input" value={angle()} step="1" accept={(value) => value >= 0 && value <= 360} onValue={setAngle} />
            </label>
          </Show>

          <div class="flex justify-end">
            <button type="button" class="panel-btn panel-btn--primary" disabled={!firstEntityId() || !secondEntityId()} onClick={add}>
              {t("cad.assembly.addConstraint")}
            </button>
          </div>
        </div>
      </Show>

      <div class="overflow-y-auto max-h-80">
        <Show when={Object.keys(constraints()).length === 0} fallback={
          <ul class="divide-y divide-[color:var(--ent-line)]">
            <For each={Object.values(constraints())}>{(constraint) =>
              <li class="gap-3 px-3 py-2 hover:bg-[color:var(--ent-surface-subtle)] flex justify-between items-center">
                <div>
                  <div class="text-xs font-medium text-[color:var(--ent-text)] capitalize">{t(CONSTRAINT_LABEL[constraint.type])}</div>
                  <div class="text-xs text-[color:var(--ent-text-muted)]">
                    {nodes()[constraint.entityA]?.name ?? constraint.entityA.slice(0, 4)} ↔ {nodes()[constraint.entityB]?.name ?? constraint.entityB.slice(0, 4)}
                    <Show when={constraint.parameters["distance"] !== undefined}>{` (${constraint.parameters["distance"]})`}</Show>
                    <Show when={constraint.parameters["angle"] !== undefined}>{` (${constraint.parameters["angle"]}°)`}</Show>
                  </div>
                </div>
                <button type="button" class="panel-icon-btn panel-icon-btn--danger" onClick={() => store.removeConstraint(constraint.id)} title={t("cad.assembly.removeConstraint")}>
                  {t("cad.assembly.remove")}
                </button>
              </li>
            }</For>
          </ul>
        }>
          <div class="py-3 px-3 text-xs text-[color:var(--ent-text-muted)]">{t("cad.assembly.noConstraints")}</div>
        </Show>
      </div>
    </PanelCard>
  )
}
