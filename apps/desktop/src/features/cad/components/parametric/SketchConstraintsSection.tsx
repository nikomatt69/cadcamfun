import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import {
  DIMENSION_TYPES, addSketchConstraint, removeSketchConstraint, resolveParameters, setConstraintDriven, sketchReport,
  type ConstraintState, type DimConstraint, type Feature, type History, type RebuildResult
} from "@cadcamfun/core"
import { ChevronDown, ChevronRight, Parentheses, Ruler, X } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { DimensionField } from "../property-inputs/DimensionField.tsx"
import type { SectionProps } from "./ParametersSection.tsx"

const SMALL = "panel-btn"
const SELECT = "panel-input"

const STATE_TONE: Readonly<Record<ConstraintState, string>> = {
  ok: "text-[color:var(--ent-text-muted)]", redundant: "text-[color:var(--ent-warn)]", conflict: "text-[color:var(--ent-bad)]", driven: "text-[color:var(--ent-accent)]"
}
const STATUS_KEY = {
  "fully-constrained": "cad.parametric.status.fully", "under-constrained": "cad.parametric.status.under", "over-constrained": "cad.parametric.status.over",
  conflicting: "cad.parametric.status.conflicting", failed: "cad.parametric.status.failed", unsolved: "cad.parametric.status.unsolved"
} as const
const STATUS_TONE: Readonly<Record<string, string>> = {
  "fully-constrained": "text-[color:var(--ent-ok)]", "under-constrained": "text-[color:var(--ent-warn)]", "over-constrained": "text-[color:var(--ent-warn)]", conflicting: "text-[color:var(--ent-bad)]", failed: "text-[color:var(--ent-bad)]", unsolved: "text-[color:var(--ent-bad)]"
}

/** What each constraint kind refers to (entity kinds) and whether it carries a dimension: the "add constraint" form is built from this. */
type Slot = "point" | "line" | "circle" | "a" | "b"
interface Form { readonly slots: ReadonlyArray<readonly [Slot, ReadonlyArray<"point" | "line" | "circle" | "arc" | "ellipse">]>; readonly value?: boolean }
const POINT = ["point"] as const, LINE = ["line"] as const, ROUND = ["circle", "arc"] as const
const FORMS: Readonly<Record<string, Form>> = {
  horizontal: { slots: [["line", LINE]] }, vertical: { slots: [["line", LINE]] },
  coincident: { slots: [["a", POINT], ["b", POINT]] }, fixed: { slots: [["point", POINT]] },
  parallel: { slots: [["a", LINE], ["b", LINE]] }, perpendicular: { slots: [["a", LINE], ["b", LINE]] },
  equalLength: { slots: [["a", LINE], ["b", LINE]] }, collinear: { slots: [["a", LINE], ["b", LINE]] },
  equalRadius: { slots: [["a", ROUND], ["b", ROUND]] }, concentric: { slots: [["a", ["point", "circle", "arc"]], ["b", ["point", "circle", "arc"]]] },
  tangentLineCircle: { slots: [["line", LINE], ["circle", ROUND]] }, pointOnLine: { slots: [["point", POINT], ["line", LINE]] },
  pointOnCircle: { slots: [["point", POINT], ["circle", ROUND]] }, midpoint: { slots: [["point", POINT], ["line", LINE]] },
  distance: { slots: [["a", POINT], ["b", POINT]], value: true }, length: { slots: [["line", LINE]], value: true },
  radius: { slots: [["circle", ROUND]], value: true }, diameter: { slots: [["circle", ROUND]], value: true },
  angle: { slots: [["a", LINE], ["b", LINE]], value: true }
}

/**
 * The constraints of one sketch feature: whether it is fully constrained, how many degrees of freedom are left and which points can
 * still move; each constraint with its state (holds, redundant, conflicting, reference), its dimension (edited in the feature's fields below), a switch
 * between driving and reference dimension, and a form to add one. A constraint that contradicts the others is refused, naming the
 * ones it clashes with. Everything is core's `history-sketch.ts`.
 */
export function SketchConstraintsSection(props: SectionProps & { readonly feature: Feature & { readonly type: "sketch" }; readonly replay?: RebuildResult | undefined; readonly open: boolean; toggle(): void; fail(message: string): void }): JSX.Element {
  const report = createMemo(() => sketchReport(props.history, props.feature.id, props.replay))
  const context = createMemo(() => { const r = resolveParameters(props.history.parameters); return { values: r.values, failed: r.errors } })
  const [type, setType] = createSignal("horizontal")
  const [picks, setPicks] = createSignal<Readonly<Record<string, string>>>({})
  const [value, setValue] = createSignal<number | string | undefined>(undefined)
  const [nonce, setNonce] = createSignal(0)
  const form = () => FORMS[type()]!
  const entitiesOf = (kinds: ReadonlyArray<string>) => props.feature.sketch.entities.filter((e) => kinds.includes(e.kind))

  const run = (make: () => { readonly history: History; readonly refusal?: string }) => {
    const result = make()
    if (result.refusal !== undefined) { props.fail(result.refusal); return }
    props.edit(() => result.history)
  }
  const add = () => {
    const spec = form()
    const constraint: Record<string, unknown> = { type: type() }
    for (const [slot] of spec.slots) {
      const pick = picks()[slot]
      if (pick === undefined || pick === "") { props.fail(t("cad.parametric.sketch.pickAll")); return }
      constraint[slot] = pick
    }
    if (spec.value === true) {
      if (value() === undefined) { props.fail(t("cad.parametric.sketch.needsValue")); return }
      constraint["value"] = value()
    }
    run(() => addSketchConstraint(props.history, props.feature.id, constraint as unknown as DimConstraint))
    setPicks({}); setValue(undefined); setNonce((n) => n + 1)
  }
  const degrees = (c: { readonly type: string }) => c.type === "angle"

  return (
    <div class="mb-1" data-testid={`constraints-${props.feature.id}`}>
      <Show when={report()}>{(r) =>
        <>
          <button type="button" class="flex w-full items-center gap-2 text-left text-xs" aria-expanded={props.open} onClick={props.toggle}>
            <Show when={props.open} fallback={<ChevronRight size={12} aria-hidden="true" />}><ChevronDown size={12} aria-hidden="true" /></Show>
            <span class="font-medium">{t("cad.parametric.sketch.constraints")} ({r().rows.length + r().generated})</span>
            <span class={STATUS_TONE[r().status]} data-testid={`sketch-status-${props.feature.id}`}>{t(STATUS_KEY[r().status])}</span>
            <Show when={r().dof > 0}><span class="text-[color:var(--ent-text-muted)]" data-testid={`sketch-dof-${props.feature.id}`}>{t("cad.parametric.sketch.dof", { count: r().dof })}</span></Show>
          </button>
          <Show when={r().status === "conflicting" || r().status === "failed" || r().status === "unsolved"}>
            <p class="text-xs text-[color:var(--ent-bad)]" role="alert" data-testid={`sketch-problem-${props.feature.id}`}>{r().message}</p>
          </Show>
          <Show when={r().conflictSet.length > 0}><p class="text-xs text-[color:var(--ent-bad)]">{t("cad.parametric.sketch.conflictSet", { list: r().conflictSet.join(", ") })}</p></Show>
          <Show when={props.open}>
            <ul class="mt-1 space-y-1" data-testid={`constraint-list-${props.feature.id}`}>
              <For each={r().rows}>{(row) => {
                const c = props.feature.sketch.constraints[row.index]!
                const dim = "value" in c
                return (
                  <li class="grid grid-cols-[1fr_auto] items-start gap-2 text-xs" data-testid={`constraint-${props.feature.id}-${row.index}`}>
                    <div class="min-w-0">
                      <span class="font-mono">{row.name}</span>
                      <span class="ml-1 text-[color:var(--ent-text-muted)]">{row.refs.join(" ")}</span>
                      <span class={`ml-1 ${STATE_TONE[row.state]}`}>{t(`cad.parametric.state.${row.state}`)}</span>
                      <Show when={dim}>
                        <span class="ml-1 font-mono">{String((c as { value: number | string }).value)}</span>
                        <Show when={row.measured !== undefined}><span class="ml-1 text-[color:var(--ent-text-muted)]">{t("cad.parametric.sketch.measured", { value: Number((degrees(c) ? (row.measured! * 180) / Math.PI : row.measured!).toPrecision(8)) })}{degrees(c) ? "°" : ""}</span></Show>
                      </Show>
                    </div>
                    <div class="flex gap-1">
                      <Show when={DIMENSION_TYPES.has(c.type)}>
                        <button type="button" class={SMALL} disabled={props.locked} aria-label={`${row.state === "driven" ? t("cad.parametric.sketch.makeDriving") : t("cad.parametric.sketch.makeReference")} ${row.name}`}
                          title={row.state === "driven" ? t("cad.parametric.sketch.makeDriving") : t("cad.parametric.sketch.makeReference")}
                          onClick={() => run(() => setConstraintDriven(props.history, props.feature.id, row.index, row.state !== "driven"))}><Show when={row.state === "driven"} fallback={<Parentheses size={12} aria-hidden="true" />}><Ruler size={12} aria-hidden="true" /></Show></button>
                      </Show>
                      <button type="button" class={SMALL} disabled={props.locked} aria-label={`${t("cad.parametric.sketch.removeConstraint")} ${row.name}`} title={t("cad.parametric.sketch.removeConstraint")}
                        onClick={() => run(() => removeSketchConstraint(props.history, props.feature.id, row.index))}><X size={12} aria-hidden="true" /></button>
                    </div>
                  </li>
                )
              }}</For>
            </ul>
            <Show when={r().generated > 0}><p class="text-xs text-[color:var(--ent-text-muted)]">{t("cad.parametric.sketch.generated", { count: r().generated })}</p></Show>
            <Show when={Object.keys(r().freedom).length > 0}><p class="text-xs text-[color:var(--ent-text-muted)]" data-testid={`sketch-free-${props.feature.id}`}>{t("cad.parametric.sketch.free", { list: Object.entries(r().freedom).map(([id, n]) => `${id} (${n})`).join(", ") })}</p></Show>
            <div class="mt-2 flex flex-wrap items-start gap-2" data-testid={`add-constraint-${props.feature.id}`}>
              <select class={SELECT} disabled={props.locked} aria-label={t("cad.parametric.sketch.constraintType")} value={type()} onChange={(event) => { setType(event.currentTarget.value); setPicks({}); setValue(undefined); setNonce((n) => n + 1) }}>
                <For each={Object.keys(FORMS)}>{(name) => <option value={name}>{name}</option>}</For>
              </select>
              <For each={form().slots}>{([slot, kinds]) =>
                <select class={SELECT} disabled={props.locked} aria-label={`${t("cad.parametric.sketch.entity")} ${slot}`} value={picks()[slot] ?? ""} onChange={(event) => setPicks({ ...picks(), [slot]: event.currentTarget.value })}>
                  <option value="">{kinds.join(" / ")}</option>
                  <For each={entitiesOf(kinds)}>{(e) => <option value={e.id}>{e.id}</option>}</For>
                </select>}
              </For>
              <Show when={form().value}>
                <For each={[nonce()]}>{() =>
                  <div class="w-24"><DimensionField value={value()} context={{ ...context(), degrees: false }} disabled={props.locked} label={t("cad.parametric.sketch.value")} onCommit={setValue} /></div>}
                </For>
              </Show>
              <button type="button" class={SMALL} disabled={props.locked} onClick={add}>{t("cad.parametric.sketch.addConstraint")}</button>
            </div>
          </Show>
        </>}
      </Show>
    </div>
  )
}
