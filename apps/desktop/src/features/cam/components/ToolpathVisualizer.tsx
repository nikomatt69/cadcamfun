/**
 * The 3D viewport that plays back a `cam.Program` (spec 06-desktop-ui.md §3 tab
 * "Preview").
 *
 * It re-uses the shared `View3D` component (the same one the CAD editor uses)
 * so the visual language is identical: same camera, same lighting, same
 * gizmos. The shell hosts only the controls that are CAM-specific (playback
 * timeline, simulator overlay).
 */
import { Show, createMemo, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { RotateCcw, Settings, X } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { View3D, toolpathOverlayModel, type RenderMode, type ToolpathPointKind, type ViewPreset } from "../../../viewport/view3d/index.ts"
import { t } from "../../../i18n/index.ts"
import type { Workpiece } from "../store/camStore.ts"

export interface ToolpathVisualizerProps {
  readonly program: cam.Program
  readonly workpiece: Workpiece
  readonly stock?: cam.generator.Stock
  readonly playing: boolean
  readonly playbackTime: number
  readonly playbackRate: number
  readonly onPlaybackTimeChange: (seconds: number) => void
}

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

/** Half the longest stock side, used to size the default camera distance. */
const defaultDistance = (workpiece: Workpiece): number => {
  const longest = Math.max(workpiece.x, workpiece.y, workpiece.z)
  return Math.max(150, longest * 2.2)
}

export default function ToolpathVisualizer(props: ToolpathVisualizerProps): JSX.Element {
  const [preset, setPreset] = createSignal<ViewPreset>("perspective")
  const [mode, setMode] = createSignal<RenderMode>("shaded-edges")
  const [gridVisible, setGridVisible] = createSignal(true)
  const [axesVisible, setAxesVisible] = createSignal(true)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [showStats, setShowStats] = createSignal(true)
  const [showPoints, setShowPoints] = createSignal(false)
  const [showPointLabels, setShowPointLabels] = createSignal(false)
  const [pointFilter, setPointFilter] = createSignal<"all" | ToolpathPointKind>("all")
  const [pointSize, setPointSize] = createSignal(0.7)
  const [showArcCenters, setShowArcCenters] = createSignal(false)
  const [showArcRadii, setShowArcRadii] = createSignal(false)
  const [stockVisible, setStockVisible] = createSignal(true)
  const [stockOpacity, setStockOpacity] = createSignal(0.6)
  const [arcTolerance, setArcTolerance] = createSignal(0.1)
  const overlay = createMemo(() => toolpathOverlayModel(props.program))

  const stock = createMemo(() => ({
    origin: props.stock ? { x: props.stock.x - props.stock.width / 2, y: props.stock.y - props.stock.height / 2, z: props.stock.topZ - props.stock.depth } : { x: -props.workpiece.x / 2, y: -props.workpiece.y / 2, z: 0 },
    size: props.stock ? { x: props.stock.width, y: props.stock.height, z: props.stock.depth } : { x: props.workpiece.x, y: props.workpiece.y, z: props.workpiece.z }
  }))

  const hasProgram = (): boolean => props.program.toolpaths.length > 0

  const resetView = (): void => {
    setPreset("perspective")
    setMode("shaded-edges")
    setGridVisible(true)
    setAxesVisible(true)
    setShowPoints(false)
    setShowPointLabels(false)
    setPointFilter("all")
    setShowArcCenters(false)
    setShowArcRadii(false)
    setStockVisible(true)
    setStockOpacity(0.6)
    setArcTolerance(0.1)
    props.onPlaybackTimeChange(0)
  }

  const toggle = (label: string, checked: () => boolean, change: (value: boolean) => void): JSX.Element => (
    <label class="flex items-center justify-between gap-4 text-xs text-slate-200">
      <span>{label}</span>
      <input type="checkbox" class="h-4 w-4 accent-blue-500" checked={checked()} onChange={(event) => change(event.currentTarget.checked)} />
    </label>
  )

  return (
    <Motion.div class="h-full w-full flex flex-col" {...rise} transition={{ duration: 0.5 }}>
      <div class="flex-1 relative overflow-hidden rounded-2xl border border-white/30 dark:border-gray-600/30 bg-gradient-to-br from-slate-900 to-slate-700 shadow-xl">
        <Show
          when={hasProgram()}
          fallback={
            <div class="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm">
              <p class="font-medium">{t("cam.preview.noToolpath")}</p>
              <p class="mt-1 text-xs text-white/50">{props.program.toolpaths.length === 0 ? t("cam.preview.hint") : t("cam.preview.pick")}</p>
            </div>
          }
        >
          <View3D
            visionMode="cam"
            program={props.program}
            preset={preset()}
            renderMode={mode()}
            gridVisible={gridVisible()}
            axesVisible={axesVisible()}
            playing={props.playing}
            playbackTime={props.playbackTime}
            playbackRate={props.playbackRate}
            onPlaybackTimeChange={props.onPlaybackTimeChange}
            stock={stock()}
            toolpathDisplay={{ showPoints: showPoints(), showPointLabels: showPointLabels(), pointFilter: pointFilter(), pointSize: pointSize(), showArcCenters: showArcCenters(), showArcRadii: showArcRadii(), stockVisible: stockVisible(), stockOpacity: stockOpacity(), arcTolerance: arcTolerance() }}
            showControls
            onPresetChange={setPreset}
            onRenderModeChange={setMode}
          />
        </Show>
        <div class="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          <div class="pointer-events-auto flex gap-2">
            <button
              onClick={resetView}
              class="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5"
              title={t("cam.resetView")}
              aria-label={t("cam.resetView")}
            >
              <RotateCcw size={14} /> {t("cam.reset")}
            </button>
            <button
              onClick={() => setGridVisible(!gridVisible())}
              aria-pressed={gridVisible()}
              class={`px-3 py-1.5 rounded-lg text-xs backdrop-blur ${gridVisible() ? "bg-blue-600 text-white" : "bg-black/40 hover:bg-black/60 text-white"}`}
            >
              {t("cam.grid")}
            </button>
            <button
              onClick={() => setAxesVisible(!axesVisible())}
              aria-pressed={axesVisible()}
              class={`px-3 py-1.5 rounded-lg text-xs backdrop-blur ${axesVisible() ? "bg-blue-600 text-white" : "bg-black/40 hover:bg-black/60 text-white"}`}
            >
              {t("cam.axes")}
            </button>
          </div>
          <div class="pointer-events-auto">
            <button
              onClick={() => props.onPlaybackTimeChange(0)}
              class="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5"
              aria-label={t("cam.rewind")}
            >
              <RotateCcw size={14} />
              {t("cam.rewind")}
            </button>
          </div>
        </div>
        <button
          type="button"
          class={`absolute right-4 top-16 z-30 rounded-lg p-2 text-white backdrop-blur ${settingsOpen() ? "bg-blue-600" : "bg-black/50 hover:bg-black/70"}`}
          aria-label={t("cam.visualizer.settings")}
          aria-expanded={settingsOpen()}
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <Settings size={18} />
        </button>
        <Show when={showStats()}>
          <div class="absolute bottom-4 left-4 z-20 rounded-lg bg-black/65 px-3 py-2 text-[11px] leading-5 text-slate-200 backdrop-blur pointer-events-none">
            <div>{t("cam.visualizer.moves")}: <span class="text-white">{overlay().moveCount}</span></div>
            <div>{t("cam.visualizer.points")}: <span class="text-white">{overlay().points.length}</span></div>
            <div>{t("cam.visualizer.arcs")}: <span class="text-white">{overlay().arcs.length}</span></div>
          </div>
        </Show>
        <Show when={settingsOpen()}>
          <aside class="absolute right-14 top-16 z-40 w-64 max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl border border-slate-600 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur" aria-label={t("cam.visualizer.settings")}>
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold">{t("cam.visualizer.settings")}</h3>
              <button type="button" class="rounded p-1 hover:bg-white/10" aria-label={t("common.close")} onClick={() => setSettingsOpen(false)}><X size={16} /></button>
            </div>
            <div class="space-y-3">
              {toggle(t("cam.visualizer.showStats"), showStats, setShowStats)}
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.toolpathPoints")}</h4>
                {toggle(t("cam.visualizer.showPoints"), showPoints, setShowPoints)}
                <Show when={showPoints()}>
                  {toggle(t("cam.visualizer.showLabels"), showPointLabels, setShowPointLabels)}
                  <label class="block text-xs text-slate-200">{t("cam.visualizer.filter")}
                    <select class="mt-1 w-full rounded border border-slate-600 bg-slate-800 p-1.5" value={pointFilter()} onChange={(event) => setPointFilter(event.currentTarget.value as "all" | ToolpathPointKind)}>
                      <option value="all">{t("cam.visualizer.filterAll")}</option><option value="rapid">{t("cam.visualizer.filterRapid")}</option><option value="cut">{t("cam.visualizer.filterCut")}</option><option value="arc">{t("cam.visualizer.filterArc")}</option><option value="cycle">{t("cam.visualizer.filterCycle")}</option>
                    </select>
                  </label>
                  <label class="block text-xs text-slate-200">{t("cam.visualizer.pointSize")} <span class="float-right text-slate-400">{pointSize().toFixed(1)} mm</span>
                    <input class="mt-1 w-full accent-blue-500" type="range" min="0.2" max="3" step="0.1" value={pointSize()} onInput={(event) => setPointSize(Number(event.currentTarget.value))} />
                  </label>
                </Show>
              </section>
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.arcs")}</h4>
                {toggle(t("cam.visualizer.showArcCenters"), showArcCenters, setShowArcCenters)}
                {toggle(t("cam.visualizer.showArcRadii"), showArcRadii, setShowArcRadii)}
                <label class="block text-xs text-slate-200">{t("cam.visualizer.arcTolerance")} <span class="float-right text-slate-400">{arcTolerance().toFixed(2)} mm</span>
                  <input class="mt-1 w-full accent-blue-500" type="range" min="0.01" max="1" step="0.01" value={arcTolerance()} onInput={(event) => setArcTolerance(Number(event.currentTarget.value))} />
                </label>
              </section>
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.workpiece")}</h4>
                {toggle(t("cam.visualizer.showWorkpiece"), stockVisible, setStockVisible)}
                <Show when={stockVisible()}><label class="block text-xs text-slate-200">{t("cam.visualizer.opacity")} <span class="float-right text-slate-400">{Math.round(stockOpacity() * 100)}%</span>
                  <input class="mt-1 w-full accent-blue-500" type="range" min="0.05" max="1" step="0.05" value={stockOpacity()} onInput={(event) => setStockOpacity(Number(event.currentTarget.value))} />
                </label></Show>
              </section>
            </div>
          </aside>
        </Show>
      </div>
    </Motion.div>
  )
}
