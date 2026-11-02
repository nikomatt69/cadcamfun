import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { flatPatternSource, flatPatternViews, formatMm, layoutFlatPattern, type FlatPatternView } from "../lib/flat-pattern.ts"
import type { History } from "@cadcamfun/core"

const WIDTH = 360
const HEIGHT = 230

const STROKE = { cut: "#ef5350", bend: "#42a5f5", dimension: "#ffd54f", extension: "#8d8d8d" } as const

/** The views of a history, or none when the replay or the development throws (the canvas must never fail on an overlay). */
const safeViews = (history: History): ReadonlyArray<FlatPatternView> => {
  try { return flatPatternViews(history) } catch { return [] }
}

/**
 * The sheet-metal flat pattern of the selected parametric part (else the first one in the drawing) as a 2D drawing laid over the canvas:
 * the unfolded outline in red, the bend lines in blue, and the dimensions of the developed length, the width and every straight run and
 * bend. It is derived from the history of the element, so it follows every parameter edit with the viewport. Shown while the "Flat"
 * toggle of the footer is on (`cad.showFlatPattern`).
 */
export default function FlatPatternOverlay(): JSX.Element {
  const cad = useCADStore()
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const [chosen, setChosen] = createSignal<string | undefined>(undefined)
  const source = createMemo(() => flatPatternSource(elements.elements as ReadonlyArray<{ id: string; type?: unknown; history?: unknown }>, selection.selectedElementIds ?? []))
  const views = createMemo(() => {
    const element = source()
    return cad.showFlatPattern && element !== undefined ? safeViews(element.history as History) : []
  })
  const view = createMemo(() => views().find((candidate) => candidate.featureId === chosen()) ?? views()[0])
  const layout = createMemo(() => { const current = view(); return current === undefined ? undefined : layoutFlatPattern(current, { width: WIDTH, height: HEIGHT }) })

  return (
    <Show when={cad.showFlatPattern && source() !== undefined}>
      <div class="absolute bottom-16 left-3 z-40 rounded-md bg-gray-900/90 text-white shadow-lg" style={{ width: `${WIDTH}px` }} data-testid="flat-pattern" role="group" aria-label={t("cad.flat.title")}>
        <div class="flex items-center gap-2 px-2 py-1 text-[11px]">
          <span class="font-semibold">{t("cad.flat.title")}</span>
          <Show when={views().length > 1}>
            <select class="rounded bg-gray-800 px-1 py-0.5" aria-label={t("cad.flat.sheet")} value={view()?.featureId} onChange={(event) => setChosen(event.currentTarget.value)}>
              <For each={views()}>{(candidate) => <option value={candidate.featureId} selected={candidate.featureId === view()?.featureId}>{candidate.featureId}</option>}</For>
            </select>
          </Show>
          <button type="button" class="ml-auto rounded px-1.5 hover:bg-gray-700" title={t("common.close")} aria-label={t("common.close")} onClick={() => cad.setShowFlatPattern(false)}>×</button>
        </div>
        <Show when={view()} fallback={<p class="px-2 pb-2 text-[11px] text-gray-300" data-testid="flat-pattern-empty">{t("cad.flat.empty")}</p>}>
          {(current) =>
            <>
              <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t("cad.flat.summary", { length: formatMm(current().length), width: formatMm(current().width), bends: current().bends })}>
                <For each={layout()?.lines ?? []}>{(line) =>
                  <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={STROKE[line.kind]}
                    stroke-width={line.kind === "cut" ? 1.6 : 1} stroke-dasharray={line.kind === "bend" ? "6 3" : line.kind === "extension" ? "2 2" : undefined} />}
                </For>
                <For each={layout()?.texts ?? []}>{(text) =>
                  <text x={text.x} y={text.y} fill={text.kind === "bend" ? "#90caf9" : STROKE.dimension} font-size="10" text-anchor={text.anchor}
                    transform={text.rotate ? `rotate(-90 ${text.x} ${text.y})` : undefined}>{text.text}</text>}
                </For>
              </svg>
              <p class="px-2 pb-1.5 text-[11px] text-gray-300" data-testid="flat-pattern-summary">{t("cad.flat.summary", { length: formatMm(current().length), width: formatMm(current().width), bends: current().bends })}</p>
            </>}
        </Show>
      </div>
    </Show>
  )
}
