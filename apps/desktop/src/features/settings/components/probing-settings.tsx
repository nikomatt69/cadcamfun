import { For, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { DEFAULT_PROBING, PROBE_UPDATE_MODES, PROBING_BOUNDS, type ProbingDefaults } from "../../../shared/state/settings.ts"
import { NumberField } from "../../cad/components/property-inputs/NumberField.tsx"

type NumericKey = keyof typeof PROBING_BOUNDS

/** Stable field list: the order is the order a machinist sets a probe up (feeds, heights, then inspection and display). */
const FIELDS: ReadonlyArray<{ key: NumericKey; unit: "feed" | "mm" | "scale" }> = [
  { key: "touchFeed", unit: "feed" },
  { key: "fastFeed", unit: "feed" },
  { key: "clearance", unit: "mm" },
  { key: "safeHeight", unit: "mm" },
  { key: "search", unit: "mm" },
  { key: "overtravel", unit: "mm" },
  { key: "defaultTolerance", unit: "mm" },
  { key: "deviationScale", unit: "scale" }
]

const WORK_OFFSETS = ["G54", "G55", "G56", "G57", "G58", "G59"] as const

const SELECT = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"

/** Settings > Machining: the defaults a new probe cycle starts from (spec 73 §4). The machine and the cycle override them. */
export function ProbingSettings(): JSX.Element {
  const app = useApp()
  const probing = () => app.settings.settings().probing
  const patch = (next: Partial<ProbingDefaults>) => app.settings.update({ probing: { ...probing(), ...next } })
  return (
    <div class="space-y-6" data-testid="probing-settings">
      <div>
        <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.probing.title")}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.probing.subtitle")}</p>
      </div>
      <div class="grid max-w-xl grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <For each={FIELDS}>{(field) => (
          <label class="block text-sm text-slate-700 dark:text-slate-300">
            <span class="block font-medium">{t(`settings.probing.${field.key}`)}</span>
            <span class="mt-1 flex items-center gap-2">
              <NumberField name={`probing.${field.key}`} label={t(`settings.probing.${field.key}`)} testId={`probing-${field.key}`}
                value={probing()[field.key]} min={PROBING_BOUNDS[field.key][0]} max={PROBING_BOUNDS[field.key][1]} deferred
                onChange={(value) => patch({ [field.key]: value })} />
              <span class="text-xs text-slate-500 dark:text-slate-400">{t(`settings.probing.unit.${field.unit}`)}</span>
            </span>
          </label>
        )}</For>
        <label class="block text-sm text-slate-700 dark:text-slate-300">
          <span class="block font-medium">{t("settings.probing.defaultUpdateMode")}</span>
          <select name="probing.defaultUpdateMode" class={`mt-1 ${SELECT}`} value={probing().defaultUpdateMode}
            onChange={(event) => patch({ defaultUpdateMode: event.currentTarget.value as ProbingDefaults["defaultUpdateMode"] })}>
            <For each={PROBE_UPDATE_MODES}>{(mode) => <option value={mode}>{t(`settings.probing.mode.${mode}`)}</option>}</For>
          </select>
        </label>
        <label class="block text-sm text-slate-700 dark:text-slate-300">
          <span class="block font-medium">{t("settings.probing.defaultWorkOffset")}</span>
          <select name="probing.defaultWorkOffset" class={`mt-1 ${SELECT}`} value={probing().defaultWorkOffset}
            onChange={(event) => patch({ defaultWorkOffset: event.currentTarget.value })}>
            <For each={WORK_OFFSETS}>{(code) => <option value={code}>{code}</option>}</For>
          </select>
        </label>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.probing.hint")}</p>
      <button type="button" class="inline-flex h-7 items-center rounded-[5px] border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        onClick={() => app.settings.update({ probing: DEFAULT_PROBING })}>{t("settings.probing.reset")}</button>
    </div>
  )
}
