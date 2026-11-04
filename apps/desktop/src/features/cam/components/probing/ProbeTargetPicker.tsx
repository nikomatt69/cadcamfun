/**
 * Where on the part the cycle probes (spec 73 §4): a list of the features of the drawn elements and the stock, and "pick on model",
 * which arms the 3D view so the next click on a surface fills the cycle with the nearest feature (`probe-targets.ts`).
 */
import { For, Show, type JSX } from "solid-js"
import { MousePointerClick } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { Field } from "../../../../shared/components/panel/ui.tsx"
import type { ProbeCycleKind } from "../../lib/probing/contract.ts"
import type { ProbeTarget } from "../../lib/probing/probe-targets.ts"

export function ProbeTargetPicker(props: {
  readonly targets: ReadonlyArray<ProbeTarget>
  /** The cycle's kind: the features of this kind come first. */
  readonly kind: ProbeCycleKind
  readonly picking: boolean
  onPick(): void
  onTarget(target: ProbeTarget): void
}): JSX.Element {
  const ordered = () => [...props.targets].sort((a, b) => Number(b.kind === props.kind) - Number(a.kind === props.kind))
  return (
    <Field label={t("cam.probing.target")} for="probe-target">
      <div class="probing-target">
        <select id="probe-target" class="panel-input" data-testid="probe-target" value=""
          onChange={(event) => {
            const found = props.targets.find((target) => target.id === event.currentTarget.value)
            if (found !== undefined) props.onTarget(found)
            event.currentTarget.value = ""
          }}>
          <option value="">{props.targets.length === 0 ? t("cam.probing.target.none") : t("cam.probing.target.choose")}</option>
          <For each={ordered()}>{(target) => <option value={target.id}>{target.label}</option>}</For>
        </select>
        <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-pick" aria-pressed={props.picking} onClick={props.onPick}>
          <MousePointerClick size={14} />{t("cam.probing.pick")}
        </button>
      </div>
      <Show when={props.picking}><p class="panel-hint" role="status">{t("cam.probing.pick.hint")}</p></Show>
    </Field>
  )
}
