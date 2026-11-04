import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { INPUT, LABEL } from "../../../shared/components/WorkspacePage.tsx"
import { NumberField } from "../../cad/components/property-inputs/NumberField.tsx"
import {
  PROBE_NUMBER_FIELDS, SETTER_NUMBER_FIELDS, probingFormOf, probingIssues, writeProbe, writeSetter,
  type ProbeNumberField, type SetterNumberField
} from "../lib/machine-probing.ts"

type Row = Readonly<Record<string, unknown>>

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {})
const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value))

const PROBE_UNITS: Readonly<Record<ProbeNumberField, string>> = {
  stylusDiameter: "mm", stylusLength: "mm", toolNumber: "", touchFeed: "mm/min", fastFeed: "mm/min", backoff: "mm", orientSpindle: "°"
}
const SETTER_UNITS: Readonly<Record<SetterNumberField, string>> = {
  x: "mm", y: "mm", z: "mm", triggerZ: "mm", discDiameter: "mm", maxToolDiameter: "mm", fastFeed: "mm/min", touchFeed: "mm/min", brokenTolerance: "mm"
}

/**
 * The machine's spindle probe and tool setter (spec 73 §4), after the profile fields of the machine form. The figures go into the
 * stored configuration as the probing panel and the kernel read them; the rotary calibration is written by a calibration run and only
 * shown here.
 */
export function MachineProbingFields(props: { readonly form: Row; readonly onPatchConfig: (key: string, value: unknown) => void }): JSX.Element {
  const config = () => asRecord(props.form["config"])
  const form = createMemo(() => probingFormOf(config(), str(props.form["type"])))
  const issues = createMemo(() => probingIssues(form()))
  const commit = (next: Record<string, unknown>) => props.onPatchConfig("__config", next)
  const unit = (u: string) => (u === "" ? "" : ` (${u})`)
  return <>
    <div class="md:col-span-2 mt-2" data-testid="machine-probing-fields">
      <p class="text-xs font-medium text-slate-900 dark:text-white">{t("library.probing.title")}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">{t("library.probing.hint")}</p>
    </div>
    <For each={PROBE_NUMBER_FIELDS}>{(field) => (
      <div>
        <label for={`res-probe-${field}`} class={LABEL}>{t(`library.probing.${field}`)}{unit(PROBE_UNITS[field])}</label>
        <NumberField id={`res-probe-${field}`} class={INPUT} optional deferred testId={`probe-${field}`} integer={field === "toolNumber"}
          min={field === "orientSpindle" ? 0 : undefined} max={field === "orientSpindle" ? 360 : undefined}
          value={form().probe[field]} onChange={(value) => commit(writeProbe(config(), field, value))} onClear={() => commit(writeProbe(config(), field, undefined))} />
      </div>
    )}</For>
    <div class="flex items-center gap-2">
      <input id="res-probe-double" type="checkbox" class="h-3.5 w-3.5 accent-blue-600" checked={form().probe.doubleTouch === true}
        onChange={(e) => commit(writeProbe(config(), "doubleTouch", e.currentTarget.checked))} />
      <label for="res-probe-double" class="text-xs text-slate-700 dark:text-slate-300">{t("library.probing.doubleTouch")}</label>
    </div>
    <Show when={form().probe.effectiveRadius !== undefined}>
      <p class="text-xs text-slate-600 dark:text-slate-300 md:col-span-2" data-testid="probe-calibration">
        {t("library.probing.calibrated", { radius: String(form().probe.effectiveRadius), at: form().probe.calibratedAt ?? t("library.probing.dateUnknown") })}
      </p>
    </Show>
    <div class="md:col-span-2 flex items-center gap-2 mt-2">
      <input id="res-setter" type="checkbox" class="h-3.5 w-3.5 accent-blue-600" checked={form().hasSetter}
        onChange={(e) => commit(e.currentTarget.checked ? writeSetter(config(), "kind", "contact") : writeSetter(config(), null))} />
      <label for="res-setter" class="text-xs font-medium text-slate-900 dark:text-white">{t("library.probing.toolSetter")}</label>
    </div>
    <Show when={form().hasSetter}>
      <div>
        <label for="res-setter-kind" class={LABEL}>{t("library.probing.setterKind")}</label>
        <select id="res-setter-kind" class={INPUT} value={form().setter.kind ?? "contact"} onChange={(e) => commit(writeSetter(config(), "kind", e.currentTarget.value))}>
          <option value="contact">{t("library.probing.setter.contact")}</option>
          <option value="laser">{t("library.probing.setter.laser")}</option>
        </select>
      </div>
      <For each={SETTER_NUMBER_FIELDS}>{(field) => (
        <div>
          <label for={`res-setter-${field}`} class={LABEL}>{t(`library.probing.setter.${field}`)}{unit(SETTER_UNITS[field])}</label>
          <NumberField id={`res-setter-${field}`} class={INPUT} optional deferred testId={`setter-${field}`} value={form().setter[field]}
            onChange={(value) => commit(writeSetter(config(), field, value))} onClear={() => commit(writeSetter(config(), field, undefined))} />
        </div>
      )}</For>
    </Show>
    <Show when={form().rotary}>{(rotary) => (
      <div class="md:col-span-2 text-xs text-slate-600 dark:text-slate-300" data-testid="rotary-calibration">
        <p class="font-medium text-slate-900 dark:text-white">{t("library.probing.rotary")}</p>
        <p>{t("library.probing.rotaryAt", { at: rotary().at })}</p>
        <Show when={rotary().pivotMeasured}>{(pivot) => <p>{t("library.probing.rotaryPivot", { x: pivot().x.toFixed(3), y: pivot().y.toFixed(3), z: pivot().z.toFixed(3) })}</p>}</Show>
        <Show when={rotary().axisError !== undefined}><p>{t("library.probing.rotaryError", { error: (rotary().axisError ?? 0).toFixed(4) })}</p></Show>
      </div>
    )}</Show>
    <Show when={issues().length > 0}>
      <ul class="md:col-span-2 text-xs text-amber-700 dark:text-amber-300" role="status" data-testid="probing-issues">
        <For each={issues()}>{(issue) => <li>{t(`library.probing.issue.${issue}`)}</li>}</For>
      </ul>
    </Show>
  </>
}
