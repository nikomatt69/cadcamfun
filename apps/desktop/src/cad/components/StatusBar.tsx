import { Show, type JSX } from "solid-js"
import { Seg, Sep, ShellSegs, Strip } from "../../components/workspace-strip.tsx"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"

const mm = (value: number | undefined): string => (value ?? 0).toFixed(2)

/**
 * The CAD editor's information strip: mode, transform tool, material and stock, the grid / axes / dimensions
 * toggles, layer, counts, the selection (type, id, size), the cursor and the transform shortcuts, on one thin row.
 * The shell's own footer keeps units, snap and the sidecar state.
 */
export default function StatusBar(): JSX.Element {
  const cad = useCADStore()
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const layers = useLayerStore()
  const transform = useTransformControlsStore()

  const workpiece = () => ({
    width: cad.workpiece?.width || 100,
    height: cad.workpiece?.height || 100,
    depth: cad.workpiece?.depth || 20,
    material: cad.workpiece?.material || "aluminum"
  })
  const is2D = () => cad.viewMode === "2d"
  const selectedCount = () => selection.selectedElementIds?.length || 0
  const transformText = (): string => {
    if (transform.isTransforming) return `${transform.mode.toUpperCase()} (active)`
    return transform.mode !== "none" ? transform.mode.toUpperCase() : "Select"
  }
  const layer = () => layers.layers.find((candidate) => candidate.id === layers.activeLayer)
  const bounds = () => (selectedCount() > 0 ? selection.getSelectionBounds() : null)
  const hidden = () => elements.elements.filter((element) => element.visible === false).length

  return (
    <Strip
      label="CAD status"
      testId="cad-status-bar"
      left={
        <>
          <Seg label="Mode" value={is2D() ? "2D (XY)" : "3D"} tone={is2D() ? "blue" : "purple"} />
          <Seg label="Tool" value={transformText()} tone={transform.isTransforming ? "amber" : "neutral"} title="Active transform tool" />
          <Sep />
          <Seg label="Material" value={<span class="capitalize">{workpiece().material}</span>} tone="green" hideBelow="md" />
          <Seg label="Stock" value={`${workpiece().width.toFixed(1)} × ${workpiece().height.toFixed(1)} × ${workpiece().depth.toFixed(1)}`} tone="cyan" hideBelow="md" title="Workpiece size, mm" />
          <Sep />
          <Seg value="Grid" tone="green" pressed={cad.gridVisible} onClick={() => cad.toggleGrid()} title="Toggle grid" testId="status-grid" />
          <Seg value="Axis" tone="blue" pressed={cad.axisVisible} onClick={() => cad.toggleAxis()} title="Toggle axes" testId="status-axis" />
          <Seg value="Dims" tone="amber" pressed={cad.showDimensions} onClick={() => cad.toggleDimensions()} title="Toggle dimensions" testId="status-dims" />
          <Sep />
          <Seg label="Layer" value={layer()?.name ?? "—"} hideBelow="lg" title="Active layer" />
          <Seg label="Elements" value={elements.elements?.length || 0} hideBelow="md" />
          <Show when={hidden() > 0}><Seg label="Hidden" value={hidden()} tone="muted" hideBelow="lg" /></Show>
          <Show when={selectedCount() > 0}><Seg value={`${selectedCount()} selected`} tone="amber" /></Show>
          <Show when={elements.selectedElement}>
            {(selected) => <Seg label="Selected" value={`${selected().type} ${selected().id.substring(0, 6)}`} tone="blue" hideBelow="lg" title={selected().id} />}
          </Show>
          <Show when={bounds()}>
            {(box) => <Seg label="Size" value={`${box().width.toFixed(1)} × ${box().height.toFixed(1)}${is2D() ? "" : ` × ${box().depth.toFixed(1)}`}`} tone="cyan" hideBelow="xl" title="Selection size, mm" />}
          </Show>
        </>
      }
      right={
        <>
          <span class="flex items-center gap-2 font-mono" title="Cursor position, mm">
            <span class="text-blue-400">X</span><span class="text-blue-200">{mm(elements.mousePosition?.x)}</span>
            <span class="text-fuchsia-400">Y</span><span class="text-fuchsia-200">{mm(elements.mousePosition?.y)}</span>
            <Show when={!is2D()}><span class="text-emerald-400">Z</span><span class="text-emerald-200">{mm(elements.mousePosition?.z)}</span></Show>
          </span>
          <span class="hidden text-gray-500 2xl:inline">G Move · R Rotate · S Scale · Esc Cancel</span>
          <Sep />
          <ShellSegs />
        </>
      }
    />
  )
}
