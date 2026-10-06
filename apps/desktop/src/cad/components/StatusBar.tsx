import { Match, Show, Switch, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Eye, EyeOff, Grid3x3, Layers, Maximize2, MousePointer, Move, RotateCw, Zap } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"

const MONO = "font-mono text-xs bg-gray-800 px-2 py-1 rounded"

/** The editor's bottom bar: mode, active transform tool, units, stock, view toggles, counts and the cursor coordinates. */
export default function StatusBar(): JSX.Element {
  const cad = useCADStore()
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const transform = useTransformControlsStore()

  const workpiece = () => ({
    width: cad.workpiece?.width || 100,
    height: cad.workpiece?.height || 100,
    depth: cad.workpiece?.depth || 20,
    material: cad.workpiece?.material || "aluminum"
  })
  const is2D = () => cad.viewMode === "2d"
  const selectedCount = () => selection.selectedElementIds?.length || 0
  const transformText = () => {
    if (transform.isTransforming) return `${transform.mode.toUpperCase()} (Active)`
    return transform.mode !== "none" ? transform.mode.toUpperCase() : "Select"
  }
  const fadeIn = (delay: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay } })

  return (
    <Motion.div
      class="bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] text-white px-4 py-2 flex items-center justify-between shadow-lg border-t border-gray-700"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
    >
      <div class="flex items-center space-x-6">
        <Motion.div class="flex items-center" {...fadeIn(0)}>
          <span class="text-gray-400 mr-2">Mode:</span>
          <span class={`font-medium px-2 py-1 rounded text-xs ${is2D() ? "bg-blue-900 text-blue-200" : "bg-purple-900 text-purple-200"}`}>{is2D() ? "2D (XY)" : "3D"}</span>
        </Motion.div>
        <Motion.div class="flex items-center" {...fadeIn(0.1)}>
          <span class="text-gray-400 mr-2">Tool:</span>
          <div class="flex items-center space-x-1">
            <Switch fallback={<MousePointer size={12} class="text-gray-400" />}>
              <Match when={transform.mode === "translate"}><Move size={12} class="text-blue-400" /></Match>
              <Match when={transform.mode === "rotate"}><RotateCw size={12} class="text-green-400" /></Match>
              <Match when={transform.mode === "scale"}><Maximize2 size={12} class="text-yellow-400" /></Match>
            </Switch>
            <span class={`font-medium text-xs ${transform.isTransforming ? "text-yellow-300" : "text-gray-300"}`}>{transformText()}</span>
          </div>
        </Motion.div>
        <Motion.div class="flex items-center" {...fadeIn(0.2)}>
          <span class="text-gray-400 mr-2">Units:</span><span class="font-medium text-orange-300">mm</span>
        </Motion.div>
        <Motion.div class="flex items-center" {...fadeIn(0.3)}>
          <span class="text-gray-400 mr-2">Material:</span><span class="font-medium capitalize text-green-300">{workpiece().material}</span>
        </Motion.div>
        <Motion.div class="flex items-center" {...fadeIn(0.4)}>
          <span class="text-gray-400 mr-2">Stock:</span>
          <span class="font-medium text-xs text-cyan-300">{workpiece().width.toFixed(1)} × {workpiece().height.toFixed(1)} × {workpiece().depth.toFixed(1)}</span>
        </Motion.div>
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex items-center">
          <Grid3x3 size={12} class={`mr-1 ${cad.gridVisible ? "text-green-400" : "text-gray-600"}`} />
          <span class={`text-xs ${cad.gridVisible ? "text-green-300" : "text-gray-500"}`}>Grid</span>
        </div>
        <div class="flex items-center">
          <Show when={cad.axisVisible} fallback={<EyeOff size={12} class="text-gray-600 mr-1" />}><Eye size={12} class="text-blue-400 mr-1" /></Show>
          <span class={`text-xs ${cad.axisVisible ? "text-blue-300" : "text-gray-500"}`}>Axis</span>
        </div>
        <div class="flex items-center">
          <Layers size={12} class={`mr-1 ${cad.showDimensions ? "text-yellow-400" : "text-gray-600"}`} />
          <span class={`text-xs ${cad.showDimensions ? "text-yellow-300" : "text-gray-500"}`}>Dims</span>
        </div>
        <div class="flex items-center">
          <span class="text-gray-400 mr-1 text-xs">Elements:</span>
          <span class="font-medium text-xs bg-gray-800 px-2 py-1 rounded">{elements.elements?.length || 0}</span>
        </div>
        <Show when={selectedCount() > 0}>
          <div class="flex items-center"><Zap size={12} class="text-orange-400 mr-1" /><span class="text-xs text-orange-300">{selectedCount()} selected</span></div>
        </Show>
      </div>

      <div class="flex items-center space-x-6">
        <div class="flex items-center space-x-3">
          <div class="flex items-center"><span class="mr-1 text-xs font-bold" style={{ color: "#0066ff" }}>X:</span><span class={MONO} style={{ color: "#66b3ff" }}>{(elements.mousePosition?.x || 0).toFixed(2)}</span></div>
          <div class="flex items-center"><span class="mr-1 text-xs font-bold" style={{ color: "#ff00ff" }}>Y:</span><span class={MONO} style={{ color: "#ff99ff" }}>{(elements.mousePosition?.y || 0).toFixed(2)}</span></div>
          <Show when={!is2D()}>
            <div class="flex items-center"><span class="mr-1 text-xs font-bold" style={{ color: "#00ff7f" }}>Z:</span><span class={MONO} style={{ color: "#66ffb3" }}>{(elements.mousePosition?.z || 0).toFixed(2)}</span></div>
          </Show>
        </div>
        <div class="flex items-center">
          <span class="text-gray-400 mr-2 text-xs">Selected:</span>
          <Show when={elements.selectedElement} fallback={<span class="text-gray-500 text-xs italic">None</span>}>{(selected) =>
            <div class="flex items-center bg-blue-900 px-2 py-1 rounded text-xs">
              <span class="text-blue-200 font-medium">{selected().type}</span>
              <span class="text-blue-400 ml-1">({selected().id.substring(0, 6)}...)</span>
            </div>}
          </Show>
        </div>
        <div class="text-xs text-gray-500"><span class="hidden lg:inline">G-Move | R-Rotate | S-Scale | ESC-Cancel</span></div>
      </div>
    </Motion.div>
  )
}
