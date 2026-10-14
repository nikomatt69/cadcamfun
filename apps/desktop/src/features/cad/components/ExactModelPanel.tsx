import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"
import { analyzeExact, elementStep, type ExactAnalysis } from "../lib/exactModel.ts"

interface Props {
  readonly element: Record<string, unknown>
  readonly all: ReadonlyArray<Record<string, unknown>>
}

const fmt = (x: number, d = 3) => x.toLocaleString(undefined, { maximumFractionDigits: d })

/**
 * The exact (B-rep) model of the selected element: topology, surfaces, exact volume, area and centre of mass, through-holes,
 * validity, and its own STEP file. STEP imports are analysed at once; other solids on request, since a Boolean element
 * recomputes its operands exactly.
 */
export default function ExactModelPanel(props: Props): JSX.Element {
  const [analysis, setAnalysis] = createSignal<ExactAnalysis | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)
  const run = () => {
    setBusy(true)
    // Let the busy state paint before the kernel works.
    setTimeout(() => {
      setAnalysis(analyzeExact(props.element, props.all))
      setBusy(false)
    }, 0)
  }
  createEffect(on(() => props.element, (el) => {
    setAnalysis(undefined)
    if (el["type"] === "brep") run()
  }))
  const exportStep = () => {
    const out = elementStep(props.element, props.all)
    if (!("step" in out)) { alert(`No exact model: ${out.reason}`); return }
    const url = URL.createObjectURL(new Blob([out.step], { type: "application/step" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${String(props.element["name"] ?? props.element["type"] ?? "part")}.step`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  return (
    <div class="mt-6 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-600" data-testid="exact-model-panel">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">Exact model (B-rep)</h4>
        <div class="flex gap-2">
          <button type="button" class="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:border-gray-600 disabled:opacity-50" disabled={busy()} onClick={run}>{busy() ? "Analysing…" : "Analyse"}</button>
          <button type="button" class="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:border-gray-600" onClick={exportStep}>STEP</button>
        </div>
      </div>
      <Show when={analysis()}>
        {(a) => (
          <Show when={a().ok ? a() : undefined} fallback={<p class="text-xs text-amber-700 dark:text-amber-300" data-testid="exact-reason">Mesh only: {(a() as { reason: string }).reason}</p>}>
            {(ok) => {
              const v = ok() as Extract<ExactAnalysis, { ok: true }>
              return (
                <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300" data-testid="exact-stats">
                  <dt>Volume</dt><dd>{fmt(v.volume)} mm³</dd>
                  <dt>Surface area</dt><dd>{fmt(v.area)} mm²</dd>
                  <dt>Centre of mass</dt><dd>{fmt(v.centroid.x)}, {fmt(v.centroid.y)}, {fmt(v.centroid.z)}</dd>
                  <dt>Faces / edges / vertices</dt><dd>{v.faces} / {v.edges} / {v.vertices}</dd>
                  <dt>Through-holes</dt><dd>{v.holes ?? "–"}</dd>
                  <dt>Holes (recognised)</dt><dd data-testid="exact-drilled">{v.drilled.length === 0 ? "–" : v.drilled.map((h) => `Ø${fmt(h.diameter)}${h.form === "simple" ? "" : ` ${h.form}`} × ${fmt(h.depth)}`).join(", ")}</dd>
                  <dt>CAM</dt>
                  <dd data-testid="exact-machining">{v.machining.prismatic ? `By features: ${v.machining.holes} holes, ${v.machining.pockets} pockets, ${v.machining.outlines} outlines` : `3D surface job: ${v.machining.reason}`}</dd>
                  <dt>Surfaces</dt><dd><For each={Object.entries(v.surfaces)}>{([k, n]) => <span class="mr-1">{k} {n}</span>}</For></dd>
                  <dt>Valid solid</dt><dd class={v.valid ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{v.valid ? "yes" : `no: ${v.issues.join("; ")}`}</dd>
                </dl>
              )
            }}
          </Show>
        )}
      </Show>
    </div>
  )
}
