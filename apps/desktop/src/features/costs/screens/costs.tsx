/**
 * Costs screen (`/costs`): pick a toolpath, calculate the estimate on the sidecar, show
 * the breakdown and optionally save it.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { DollarSign } from "lucide-solid"
import { FIELD, PANEL, RAIL_LABEL, StageEmpty, StageError, StageLoading, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspacePage } from "../../../shared/components/WorkspacePage.tsx"
import { Toast, formatDate } from "../../../shared/components/screen-parts.tsx"

// Passed as an expression on purpose: the compiler would otherwise emit a bare `value` attribute that test DOMs mis-parse.
const NONE = ""
const money = (value: number, currency: string): string => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(value) }
  catch { return `${value.toFixed(2)} ${currency}` }
}
const describe = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && typeof (cause as { message?: unknown }).message === "string") return (cause as { message: string }).message
  return String(cause)
}

export function CostsScreen(): JSX.Element {
  const app = useApp()
  const toolpaths = useRead((c) => c.toolpaths.list({ query: {} }))
  const saved = useRead((c) => c["production-costs"].listEstimates({ query: {} }))
  const [toolpathId, setToolpathId] = createSignal("")
  const [result, setResult] = createSignal<Awaited<ReturnType<typeof calculate>>>()
  const [notice, setNotice] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)

  const calculate = (id: string) => app.runtime.run(app.client["production-costs"].calculateEstimate({ payload: { toolpathId: id } }))
  const run = async (work: () => Promise<void>) => {
    if (pending()) return
    setPending(true); setError(undefined); setNotice(undefined)
    try { await work() } catch (cause) { setError(describe(cause)) } finally { setPending(false) }
  }
  const onCalculate = () => run(async () => { if (toolpathId()) setResult(await calculate(toolpathId())) })
  const onSave = () => run(async () => {
    const r = result(); if (!r) return
    await app.runtime.run(app.client["production-costs"].createEstimate({ payload: {
      toolpathId: r.toolpathId, totalCost: r.totalCost, materialCost: r.materialCost, toolWearCost: r.toolWearCost,
      machineTime: r.machineTime, machineTimeCost: r.machineTimeCost, operatorTime: r.operatorTime,
      operatorTimeCost: r.operatorTimeCost, setupCost: r.setupCost, currencyCode: r.currencyCode, details: r.details
    } }))
    setNotice(t("costs.saved")); await saved.refetch()
  })

  const lines = (r: NonNullable<ReturnType<typeof result>>) => [
    [t("costs.material"), r.materialCost], [t("costs.toolWear"), r.toolWearCost], [t("costs.machineRun"), r.machineTimeCost],
    [t("costs.operator"), r.operatorTimeCost], [t("costs.setup"), r.setupCost]
  ] as const

  return <WorkspacePage
    title={t("costs.title")}
    rail={<form class="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void onCalculate() }}>
      <p class="text-xs text-slate-500 dark:text-slate-400">{t("costs.subtitle")}</p>
      <label class="block"><span class={RAIL_LABEL}>{t("costs.toolpath")}</span>
        <select class={FIELD} value={toolpathId()} onChange={(e) => { setToolpathId(e.currentTarget.value); setResult(undefined) }}>
          <option value={NONE}>{t("costs.toolpathPlaceholder")}</option>
          <For each={toolpaths.data() ?? []}>{(row) => <option value={row.id}>{row.name}</option>}</For>
        </select>
      </label>
      <button type="submit" class={TOOLBAR_PRIMARY} disabled={pending() || !toolpathId()}>{t("costs.calculate")}</button>
      <Show when={toolpaths.error()}><StageError message={`${t("costs.error")}: ${describe(toolpaths.error())}`} /></Show>
    </form>}
  >
    <div class="grid content-start gap-4">
      <Toast message={notice()} />
      <Show when={error()}><StageError message={`${t("costs.error")}: ${error()}`} /></Show>
      <Show when={result()} fallback={<StageEmpty icon={<DollarSign size={24} aria-hidden="true" />} title={t("costs.result")} hint={t("costs.empty")} />}>{(r) =>
        <article class={PANEL} aria-label={t("costs.result")}>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">{t("costs.result")}</h2>
          <dl class="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
            <For each={lines(r())}>{([label, value]) => <><dt>{label}</dt><dd class="text-right">{money(value, r().currencyCode)}</dd></>}</For>
            <dt class="font-semibold">{t("costs.total")}</dt><dd class="text-right font-semibold">{money(r().totalCost, r().currencyCode)}</dd>
          </dl>
          <p class="mt-3 text-xs text-slate-600 dark:text-slate-300">
            {t("costs.pathLength")}: {r().details.calculatedValues.totalPathLengthMm.toFixed(1)} · {t("costs.machineMinutes")}: {r().details.calculatedValues.machineTimeMinutes.toFixed(1)}
          </p>
          <button type="button" class={`${TOOLBAR_BUTTON} mt-3`} disabled={pending()} onClick={() => void onSave()}>{t("costs.save")}</button>
        </article>}</Show>
      <section>
        <h2 class="mb-2 font-semibold text-slate-900 dark:text-white">{t("costs.recent")}</h2>
        <Show when={saved.loading() && !saved.data()}><StageLoading label={t("common.loading")} /></Show>
        <Show when={saved.data()?.length === 0}><p class="text-sm text-slate-500 dark:text-slate-400">{t("costs.recentEmpty")}</p></Show>
        <ul class="grid gap-2 text-sm">
          <For each={saved.data() ?? []}>{(row) =>
            <li class={`${PANEL} flex justify-between !p-3 text-slate-800 dark:text-gray-200`}><span>{row.toolpath.name} · {formatDate(row.createdAt)}</span><span>{money(row.totalCost, row.currencyCode)}</span></li>}</For>
        </ul>
      </section>
    </div>
  </WorkspacePage>
}
