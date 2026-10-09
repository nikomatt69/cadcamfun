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
import { RotateCcw } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { View3D, type RenderMode, type ViewPreset } from "../../viewport/view3d/index.ts"
import { t } from "../../i18n/index.ts"
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
    props.onPlaybackTimeChange(0)
  }

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
      </div>
    </Motion.div>
  )
}
