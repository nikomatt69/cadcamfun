import { Show, type JSX } from "solid-js"
import { Seg, Sep, ShellSegs, Strip } from "../../../shared/components/workspace-strip.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { displayChord } from "../../../shared/keybindings/chord.ts"
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
  const app = useApp()
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
  /** The transform keys of the user's keymap: `G Move · R Rotate · S Scale · Esc Cancel`. */
  const hint = (): string => {
    const first = (id: string): string => {
      const chord = app.keys.keymap().entry(id)?.chords[0]
      return chord === undefined ? "–" : displayChord(chord, app.keys.platform)
    }
    return t("cad.status.shortcuts", { move: first("cad.transform.translate"), rotate: first("cad.transform.rotate"), scale: first("cad.transform.scale"), cancel: first("edit.cancel") })
  }
  const is2D = () => cad.viewMode === "2d"
  const selectedCount = () => selection.selectedElementIds?.length || 0
  const transformText = (): string => {
    if (transform.isTransforming) return t("cad.status.transformActive", { mode: transform.mode.toUpperCase() })
    return transform.mode !== "none" ? transform.mode.toUpperCase() : t("cad.status.select")
  }
  const layer = () => layers.layers.find((candidate) => candidate.id === layers.activeLayer)
  const bounds = () => (selectedCount() > 0 ? selection.getSelectionBounds() : null)
  const hidden = () => elements.elements.filter((element) => element.visible === false).length

  return (
    <Strip
      label={t("cad.status.label")}
      testId="cad-status-bar"
      left={
        <>
          <Seg label={t("cad.status.mode")} value={is2D() ? t("cad.xy") : t("cad.3d")} tone={is2D() ? "blue" : "purple"} />
          <Seg label={t("cad.status.tool")} value={transformText()} tone={transform.isTransforming ? "amber" : "neutral"} title={t("cad.status.toolTitle")} />
          <Sep />
          <Seg label={t("cad.status.material")} value={<span class="capitalize">{workpiece().material}</span>} tone="green" hideBelow="md" />
          <Seg label={t("cad.status.stock")} value={`${workpiece().width.toFixed(1)} × ${workpiece().height.toFixed(1)} × ${workpiece().depth.toFixed(1)}`} tone="cyan" hideBelow="md" title={t("cad.status.stockTitle")} />
          <Sep />
          <Seg value={t("cad.status.grid")} tone="green" pressed={cad.gridVisible} onClick={() => cad.toggleGrid()} title={t("cad.status.toggleGrid")} testId="status-grid" />
          <Seg value={t("cad.status.axis")} tone="blue" pressed={cad.axisVisible} onClick={() => cad.toggleAxis()} title={t("cad.status.toggleAxis")} testId="status-axis" />
          <Seg value={t("cad.status.dims")} tone="amber" pressed={cad.showDimensions} onClick={() => cad.toggleDimensions()} title={t("cad.status.toggleDims")} testId="status-dims" />
          <Sep />
          <Seg label={t("cad.status.layer")} value={layer()?.name ?? t("dashboard.metric.unavailable")} hideBelow="lg" title={t("cad.status.layerTitle")} />
          <Seg label={t("cad.status.elements")} value={elements.elements?.length || 0} hideBelow="md" />
          <Show when={hidden() > 0}><Seg label={t("cad.status.hidden")} value={hidden()} tone="muted" hideBelow="lg" /></Show>
          <Show when={selectedCount() > 0}><Seg value={t("cad.selected", { count: selectedCount() })} tone="amber" /></Show>
          <Show when={elements.selectedElement}>
            {(selected) => <Seg label={t("cad.status.selected")} value={`${selected().type} ${selected().id.substring(0, 6)}`} tone="blue" hideBelow="lg" title={selected().id} />}
          </Show>
          <Show when={bounds()}>
            {(box) => <Seg label={t("cad.status.size")} value={`${box().width.toFixed(1)} × ${box().height.toFixed(1)}${is2D() ? "" : ` × ${box().depth.toFixed(1)}`}`} tone="cyan" hideBelow="xl" title={t("cad.status.sizeTitle")} />}
          </Show>
        </>
      }
      right={
        <>
          <span class="flex items-center gap-2 font-mono" title={t("cad.status.cursor")}>
            <span class="text-blue-400">{t("cad.field.x")}</span><span class="text-blue-200">{mm(elements.mousePosition?.x)}</span>
            <span class="text-fuchsia-400">{t("cad.field.y")}</span><span class="text-fuchsia-200">{mm(elements.mousePosition?.y)}</span>
            <Show when={!is2D()}><span class="text-emerald-400">Z</span><span class="text-emerald-200">{mm(elements.mousePosition?.z)}</span></Show>
          </span>
          <span class="hidden text-gray-500 2xl:inline">{hint()}</span>
          <Sep />
          <ShellSegs />
        </>
      }
    />
  )
}
