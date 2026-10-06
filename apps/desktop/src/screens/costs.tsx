/**
 * Costs screen (`/costs`): pick a toolpath, calculate the estimate on the sidecar, show
 * the breakdown and optionally save it.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { EmptyState, ErrorState, LoadingState, ScreenHeader, Toast, formatDate } from "./screen-parts.tsx"

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

  return <section>
    <ScreenHeader title={t("costs.title")} subtitle={t("costs.subtitle")} />
    <div class="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
      <form class="card grid content-start gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void onCalculate() }}>
        <label class="form-label">{t("costs.toolpath")}
          <select class="form-input" value={toolpathId()} onChange={(e) => { setToolpathId(e.currentTarget.value); setResult(undefined) }}>
            <option value={NONE}>{t("costs.toolpathPlaceholder")}</option>
            <For each={toolpaths.data() ?? []}>{(row) => <option value={row.id}>{row.name}</option>}</For>
          </select>
        </label>
        <button class="btn btn-primary" disabled={pending() || !toolpathId()}>{t("costs.calculate")}</button>
        <Show when={toolpaths.error()}><ErrorState label={t("costs.error")} detail={describe(toolpaths.error())} /></Show>
      </form>
      <div class="grid content-start gap-4">
        <Toast message={notice()} />
        <Show when={error()}><ErrorState label={t("costs.error")} detail={error()} /></Show>
        <Show when={result()} fallback={<EmptyState label={t("costs.empty")} />}>{(r) =>
          <article class="card p-4" aria-label={t("costs.result")}>
            <h2 class="font-semibold">{t("costs.result")}</h2>
            <dl class="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <For each={lines(r())}>{([label, value]) => <><dt>{label}</dt><dd class="text-right">{money(value, r().currencyCode)}</dd></>}</For>
              <dt class="font-semibold">{t("costs.total")}</dt><dd class="text-right font-semibold">{money(r().totalCost, r().currencyCode)}</dd>
            </dl>
            <p class="mt-2 text-xs text-gray-600 dark:text-gray-300">
              {t("costs.pathLength")}: {r().details.calculatedValues.totalPathLengthMm.toFixed(1)} · {t("costs.machineMinutes")}: {r().details.calculatedValues.machineTimeMinutes.toFixed(1)}
            </p>
            <button class="btn btn-outline mt-3" disabled={pending()} onClick={() => void onSave()}>{t("costs.save")}</button>
          </article>}</Show>
        <section>
          <h2 class="mb-2 font-semibold">{t("costs.recent")}</h2>
          <Show when={saved.loading() && !saved.data()}><LoadingState label={t("common.loading")} /></Show>
          <Show when={saved.data()?.length === 0}><EmptyState label={t("costs.recentEmpty")} /></Show>
          <ul class="grid gap-2 text-sm">
            <For each={saved.data() ?? []}>{(row) =>
              <li class="card flex justify-between p-3"><span>{row.toolpath.name} · {formatDate(row.createdAt)}</span><span>{money(row.totalCost, row.currencyCode)}</span></li>}</For>
          </ul>
        </section>
      </div>
    </div>
  </section>
}
