import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Box, Circle, Minus, Square, Triangle, Copy, Clipboard, CopyPlus, FlipHorizontal2, Layers, Scissors, Wrench, FileText, Maximize2 } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import type { SurfacingOp } from "./SurfacingPanel.tsx"
import type { BooleanOperation } from "../lib/sceneHelpers.ts"
import { SvgIcon } from "./icons.tsx"
import { ElementForm, formPositionFor } from "./ToolPanel.tsx"
import { useAppOptional } from "../../../shared/state/context.ts"
import { displayChord } from "../../../shared/keybindings/chord.ts"
import { isSectionAxis } from "../lib/section.ts"
import { isExplodeAxis } from "../lib/exploded-view.ts"

interface Props {
  readonly ready: boolean
  readonly operation?: SurfacingOp
  readonly onSurface: (operation: SurfacingOp) => void
  readonly onDrawing?: () => void
  readonly onBoolean: (operation: BooleanOperation) => void
}

interface ActionProps {
  readonly label: string
  readonly icon: JSX.Element
  readonly active?: boolean
  readonly disabled?: boolean
  readonly hint?: string
  readonly onClick: () => void
}

function Action(props: ActionProps): JSX.Element {
  return <button type="button" class="cad-ribbon-action" aria-pressed={props.active}
    disabled={props.disabled} title={props.hint ?? props.label} onClick={props.onClick}>
    {props.icon}<span>{props.label}</span>
  </button>
}

/** A single compact command strip, bound to the same state as the existing CAD controls. */
export default function CadRibbon(props: Props): JSX.Element {
  const cad = useCADStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()

  const keys = useAppOptional()?.keys
  const [createPart, setCreatePart] = createSignal<string | null>(null)
  /** The creation commands of the keymap: one id per part the ribbon can start. */
  const CREATE: Readonly<Record<string, string>> = {
    line: "line", circle: "circle", rectangle: "rectangle", box: "cube", cylinder: "cylinder", sphere: "sphere", cone: "cone", torus: "torus", parametric: "parametric"
  }
  onMount(() => {
    if (keys === undefined) return
    const off = keys.register(Object.fromEntries(Object.entries(CREATE).map(([name, type]) => [`cad.create.${name}`, () => {
      if (creationBlocked()) return false
      setCreatePart(type)
    }])))
    onCleanup(off)
  })
  /** The tooltip of a creation button: its label and the user's chord for it. */
  const hintFor = (type: string, label: string): string => {
    const name = Object.entries(CREATE).find(([, part]) => part === type)?.[0]
    const chord = name === undefined || keys === undefined ? undefined : keys.keymap().entry(`cad.create.${name}`)?.chords[0]
    return chord === undefined || keys === undefined ? label : `${label} (${displayChord(chord, keys.platform)})`
  }
  const activeLayer = () => layers.layers.find(layer => layer.id === layers.activeLayer)
  const creationBlocked = () => !props.ready || !activeLayer() || activeLayer()?.locked === true
  const singleSelected = () => {
    if (selection.selectedElementIds.length !== 1) return undefined
    return elements.elements.find(element => element.id === selection.selectedElementIds[0])
  }
  const copySelection = () => { const element = singleSelected(); if (element) { elements.selectElement(element.id); elements.copySelectedElement() } }

  const booleanBlocked = () => {
    const selected = elements.elements.filter(element => selection.selectedElementIds.includes(element.id))
    return !props.ready || selected.length < 2 || selected.some(element =>
      element.locked === true || layers.layers.find(layer => layer.id === element.layerId)?.locked !== false)
  }
  const toggleSection = () => {
    const enabled = !cad.section.enabled
    if (enabled) cad.setViewMode("3d")
    cad.setSection({ enabled })
  }
  return <div class="cad-ribbon" role="region" aria-label={t("cad.ribbon.label")} data-testid="cad-ribbon">
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.surface")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.surface")}</span>
      <div class="cad-ribbon-actions">
        <Action label={t("cad.surfacing.chamferBox")} icon={<Wrench size={13} />} active={props.operation === "chamferBox"} onClick={() => props.onSurface("chamferBox")} />
        <Action label={t("cad.surfacing.chamferCylTop")} icon={<Wrench size={13} />} active={props.operation === "chamferCylinderTop"} onClick={() => props.onSurface("chamferCylinderTop")} />
        <Action label={t("cad.surfacing.shell")} icon={<Box size={13} />} active={props.operation === "shell"} onClick={() => props.onSurface("shell")} />
        <Action label={t("cad.surfacing.sweep")} icon={<SvgIcon name="sweep" size={13} />} active={props.operation === "sweep"} onClick={() => props.onSurface("sweep")} />
        <Action label={t("cad.surfacing.loft")} icon={<Layers size={13} />} active={props.operation === "loft"} onClick={() => props.onSurface("loft")} />
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.combine")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.combine")}</span>
      <div class="cad-ribbon-actions">
        <Action label={t("cad.ribbon.union")} icon={<SvgIcon name="boolUnion" size={13} />} disabled={booleanBlocked()} onClick={() => props.onBoolean("union")} />
        <Action label={t("cad.ribbon.subtract")} icon={<SvgIcon name="boolSubtract" size={13} />} disabled={booleanBlocked()} onClick={() => props.onBoolean("subtract")} />
        <Action label={t("cad.ribbon.intersect")} icon={<SvgIcon name="boolIntersect" size={13} />} disabled={booleanBlocked()} onClick={() => props.onBoolean("intersect")} />
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.inspect")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.inspect")}</span>
      <div class="cad-ribbon-actions">
        <Action label={t("cad.section")} icon={<Scissors size={13} />} active={cad.section.enabled} onClick={toggleSection} />
        <Action label={t("cad.explode.title")} icon={<Maximize2 size={13} />} active={cad.explodedView.enabled}
          disabled={!props.ready || (!cad.explodedView.enabled && cad.explodablePartCount < 2)}
          hint={t("cad.explode.hint")} onClick={() => cad.setExplodedView({ enabled: !cad.explodedView.enabled })} />
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.edit")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.edit")}</span>
      <div class="cad-ribbon-actions">
        <Action label={t("cad.ribbon.duplicate")} icon={<CopyPlus size={13} />} disabled={creationBlocked() || !singleSelected()}
          onClick={() => { const element = singleSelected(); if (element) elements.duplicateElement(element.id) }} />
        <Action label={t("cad.ribbon.copy")} icon={<Copy size={13} />} disabled={!singleSelected()} onClick={copySelection} />
        <Action label={t("cad.ribbon.paste")} icon={<Clipboard size={13} />} disabled={creationBlocked() || !elements.clipboard} onClick={() => elements.pasteElement()} />
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.create")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.create")}</span>
      <div class="cad-ribbon-actions">
        <Action label={t("cad.drawing.title")} icon={<FileText size={13} />} disabled={!props.ready || !elements.elements.some(e => e.type === "parametric")} onClick={() => props.onDrawing?.()} />
        <Action label={t("cad.ribbon.parametric")} hint={hintFor("parametric", t("cad.ribbon.parametric"))} icon={<Box size={13} />} disabled={creationBlocked()} onClick={() => setCreatePart("parametric")} />
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.sketch")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.sketch")}</span>
      <div class="cad-ribbon-actions">
        <For each={[{ type: "line", label: t("cad.ribbon.line"), icon: <Minus size={13} /> }, { type: "circle", label: t("cad.ribbon.circle"), icon: <Circle size={13} /> }, { type: "rectangle", label: t("cad.ribbon.rectangle"), icon: <Square size={13} /> }] as const}>{tool =>
          <Action label={tool.label} hint={hintFor(tool.type, tool.label)} icon={tool.icon} disabled={creationBlocked()} onClick={() => setCreatePart(tool.type)} />
        }</For>
      </div>
    </div>
    <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.solids")}>
      <span class="cad-ribbon-heading">{t("cad.ribbon.solids")}</span>
      <div class="cad-ribbon-actions">
        <For each={[{ type: "cube", label: t("cad.ribbon.box"), icon: <Box size={13} /> }, { type: "cylinder", label: t("cad.ribbon.cylinder"), icon: <SvgIcon name="cylinder" size={13} /> }, { type: "sphere", label: t("cad.ribbon.sphere"), icon: <Circle size={13} /> }, { type: "cone", label: t("cad.ribbon.cone"), icon: <Triangle size={13} /> }, { type: "torus", label: t("cad.ribbon.torus"), icon: <SvgIcon name="torus" size={13} /> }] as const}>{tool =>
          <Action label={tool.label} hint={hintFor(tool.type, tool.label)} icon={tool.icon} disabled={creationBlocked()} onClick={() => setCreatePart(tool.type)} />
        }</For>
      </div>
    </div>
    <Show when={createPart()} keyed>{type =>
      <ElementForm type={type} formPosition={formPositionFor(window.innerWidth / 2 - 160, 100)} onCancel={() => setCreatePart(null)}
        onAdd={element => { if (creationBlocked()) return; elements.addElement(element); setCreatePart(null) }} />
    }</Show>
    <Show when={cad.explodedView.enabled}>
      <div class="cad-ribbon-group" role="group" aria-label={t("cad.explode.title")}>
        <span class="cad-ribbon-heading">{t("cad.explode.title")}</span>
        <div class="cad-ribbon-actions">
          <select aria-label={t("cad.explode.direction")} value={cad.explodedView.axis} onChange={event => {
            const axis = event.currentTarget.value
            if (isExplodeAxis(axis)) cad.setExplodedView({ axis })
          }}><option value="auto">{t("cad.explode.auto")}</option><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select>
          <label class="flex items-center gap-1 text-xs" title={t("cad.explode.separation")}>
            <input type="range" min="0" max="3" step="0.01" class="w-24" aria-label={t("cad.explode.separation")}
              value={cad.explodedView.amount} onInput={event => cad.setExplodedView({ amount: Number(event.currentTarget.value) })} />
            <output class="w-9 tabular-nums">{Math.round(cad.explodedView.amount * 100)}%</output>
          </label>
          <Action label={t("cad.explode.assemble")} icon={<Box size={13} />} onClick={() => cad.setExplodedView({ enabled: false })} />
        </div>
      </div>
    </Show>
    <Show when={cad.section.enabled}>
      <div class="cad-ribbon-group" role="group" aria-label={t("cad.ribbon.sectionControls")}>
        <span class="cad-ribbon-heading">{t("cad.ribbon.sectionControls")}</span>
        <div class="cad-ribbon-actions">
          <select aria-label={t("cad.section.axis")} value={cad.section.axis} onChange={event => {
            const axis = event.currentTarget.value
            if (isSectionAxis(axis)) cad.setSection({ axis })
          }}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select>
          <label class="cad-ribbon-position"><input type="number" aria-label={t("cad.section.constant")} value={cad.section.position} step="0.5"
            onInput={event => { const position = event.currentTarget.valueAsNumber; if (Number.isFinite(position)) cad.setSection({ position }) }} /><span>mm</span></label>
          <Action label={t("cad.section.invert")} icon={<FlipHorizontal2 size={13} />} active={cad.section.inverted}
            onClick={() => cad.setSection({ inverted: !cad.section.inverted })} />
        </div>
      </div>
    </Show>
  </div>
}
