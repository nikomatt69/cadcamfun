import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { ChevronDown, ChevronUp, Copy, Maximize2, Move, RotateCcw, Sliders, Trash2, X } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"
import ToolPanel from "./ToolPanel.tsx"
import { t } from "../../../i18n/index.ts"

interface Position { x: number; y: number }

export interface FloatingToolbarProps {
  readonly initialPosition?: Position
  onClose?: () => void
  /** The "Library" tab (the library manager lives with the library screens). */
  readonly library?: () => JSX.Element
  /** The "AI" tab (the AI hub lives with the AI screens). */
  readonly ai?: () => JSX.Element
}

type Mode = "create" | "transform" | "library" | "ai"
const TOOL_BUTTON = "flex flex-col items-center justify-center gap-1 rounded-md bg-[color:var(--ent-surface-subtle)] p-2 text-xs text-[color:var(--ent-text)] hover:bg-[color:var(--ent-surface-inset)] aria-pressed:bg-[color:var(--ent-accent-soft)] aria-pressed:text-[color:var(--ent-accent)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ent-accent)]"

/** The draggable tool window over the canvas: create (tool panel), transform actions, library and AI tabs. */
export default function FloatingToolbar(props: FloatingToolbarProps): JSX.Element {
  const cad = useCADStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const transform = useTransformControlsStore()
  const [mode, setMode] = createSignal<Mode>("create")
  const [position, setPosition] = createSignal<Position>(props.initialPosition ?? { x: 100, y: 100 })
  const [expanded, setExpanded] = createSignal(true)
  const [dragging, setDragging] = createSignal(false)
  let toolbar: HTMLDivElement | undefined
  let grab: Position = { x: 0, y: 0 }
  let dragOrigin: Position = { x: 0, y: 0 }
  let pointerId: number | undefined

  /**
   * The window floats *inside* the surface it belongs to (the canvas), not over the
   * whole viewport: the shell's title bar, status bar and docked AI panel would
   * otherwise cover it, and an ancestor's `transform`/`backdrop-filter` would silently
   * rebase `position: fixed` anyway. `offsetParent` is that positioned ancestor.
   */
  const host = (): HTMLElement | undefined =>
    (toolbar?.offsetParent as HTMLElement | null | undefined) ?? toolbar?.parentElement ?? undefined

  const isLayerLocked = createMemo(() => {
    if (!layers.activeLayer) return true
    return layers.layers.find((layer) => layer.id === layers.activeLayer)?.locked ?? false
  })
  const noSelection = () => !elements.selectedElement

  /** Use layout dimensions so animated ancestor transforms cannot move the window outside its host. */
  const constrain = (point: Position): Position => {
    const parent = host()
    if (!parent || parent.clientWidth === 0 || parent.clientHeight === 0) return point
    return {
      x: Math.min(Math.max(0, point.x), Math.max(0, parent.clientWidth - (toolbar?.offsetWidth ?? 340))),
      y: Math.min(Math.max(0, point.y), Math.max(0, parent.clientHeight - (toolbar?.offsetHeight ?? 100)))
    }
  }
  const clamp = () => setPosition(previous => {
    const next = constrain(previous)
    return next.x === previous.x && next.y === previous.y ? previous : next
  })
  const move = (event: PointerEvent) => {
    if (!dragging() || event.pointerId !== pointerId) return
    event.stopPropagation()
    const parent = host()
    const box = parent?.getBoundingClientRect()
    const scaleX = parent && box?.width ? box.width / parent.clientWidth : 1
    const scaleY = parent && box?.height ? box.height / parent.clientHeight : 1
    setPosition(constrain({ x: dragOrigin.x + (event.clientX - grab.x) / scaleX, y: dragOrigin.y + (event.clientY - grab.y) / scaleY }))
  }
  const stop = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    event.stopPropagation()
    const header = event.currentTarget as HTMLElement
    if (header.hasPointerCapture?.(event.pointerId)) header.releasePointerCapture(event.pointerId)
    pointerId = undefined
    setDragging(false)
  }
  const start = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return
    event.preventDefault()
    event.stopPropagation()
    clamp()
    grab = { x: event.clientX, y: event.clientY }
    dragOrigin = position()
    pointerId = event.pointerId
    const header = event.currentTarget as HTMLElement
    header.focus({ preventScroll: true })
    header.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }
  const moveWithKeys = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    const delta = event.shiftKey ? 1 : 10
    const offsets: Record<string, Position> = { ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 }, ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta } }
    const offset = offsets[event.key]
    if (!offset && event.key !== "Home") return
    event.preventDefault()
    event.stopPropagation()
    setPosition(previous => constrain(offset ? { x: previous.x + offset.x, y: previous.y + offset.y } : props.initialPosition ?? { x: 100, y: 100 }))
  }
  onMount(() => {
    clamp()
    const observer = new ResizeObserver(clamp)
    if (host()) observer.observe(host()!)
    if (toolbar) observer.observe(toolbar)
    window.addEventListener("resize", clamp)
    onCleanup(() => { observer.disconnect(); window.removeEventListener("resize", clamp) })
  })

  const reason = (action: string) => (noSelection() ? t("cad.noElementSelected") : isLayerLocked() ? t("cad.layerLocked") : action)
  const blocked = () => noSelection() || isLayerLocked()
  const nextView = () => (cad.viewMode === "2d" ? "3D" : "2D")
  const availableModes = (): Mode[] => ["create", "transform", ...(props.library ? ["library" as const] : []), ...(props.ai ? ["ai" as const] : [])]
  const modeLabel = (mode: Mode): string => t(`cad.${mode}`)

  const panel = () => (
    <Show when={mode() === "create"} fallback={
      <Show when={mode() === "transform"} fallback={
        <Show when={mode() === "library"} fallback={<div class="p-2">{props.ai ? props.ai() : null}</div>}>
          <div class="p-2 flex flex-col">{props.library ? props.library() : null}</div>
        </Show>
      }>
        <div class="cad-floating-transforms">
          <button type="button" class={TOOL_BUTTON} disabled={blocked()} aria-pressed={transform.mode === "translate"} title={reason(t("cad.move"))} onClick={() => transform.setMode("translate")}><Move size={16} aria-hidden="true" /><span>{t("cad.move")}</span></button>
          <button type="button" class={TOOL_BUTTON} disabled={blocked()} aria-pressed={transform.mode === "rotate"} title={reason(t("cad.rotate"))} onClick={() => transform.setMode("rotate")}><RotateCcw size={16} aria-hidden="true" /><span>{t("cad.rotate")}</span></button>
          <button type="button" class={TOOL_BUTTON} disabled={blocked()} aria-pressed={transform.mode === "scale"} title={reason(t("cad.scale"))} onClick={() => transform.setMode("scale")}><Maximize2 size={16} aria-hidden="true" /><span>{t("cad.scale")}</span></button>
          <button type="button" class={TOOL_BUTTON} disabled={blocked()} title={reason(t("cad.ribbon.copy"))} onClick={() => { const selected = elements.selectedElement; if (selected) elements.duplicateElement(selected.id) }}><Copy size={16} aria-hidden="true" /><span>{t("cad.ribbon.copy")}</span></button>
          <button type="button" class={TOOL_BUTTON} disabled={blocked()} title={reason(t("cad.customElements.delete"))} onClick={() => { const selected = elements.selectedElement; if (selected) elements.deleteElement(selected.id) }}><Trash2 size={16} aria-hidden="true" /><span>{t("cad.customElements.delete")}</span></button>
          <button type="button" class={TOOL_BUTTON} title={cad.viewMode === "2d" ? t("cad.view3d") : t("cad.view2d")} onClick={() => cad.setViewMode(cad.viewMode === "2d" ? "3d" : "2d")}><Sliders size={16} aria-hidden="true" /><span>{nextView()}</span></button>
        </div>
      </Show>
    }>
      <ToolPanel />
    </Show>
  )

  return (
    <div
      ref={toolbar}
      style={{ position: "absolute", left: `${position().x}px`, top: `${position().y}px`, "z-index": 1000 }}
      class="cad-floating-toolbar" data-testid="cad-floating-toolbar"
      on:pointerdown={event => event.stopPropagation()} on:pointerup={event => event.stopPropagation()}
    >
      <div class="cad-floating-header" tabIndex={0} aria-label={t("cad.moveToolbar")} title={t("cad.moveToolbar")}
        classList={{ "cursor-grabbing": dragging(), "cursor-grab": !dragging() }}
        on:pointerdown={start} on:pointermove={move} on:pointerup={stop} on:pointercancel={stop}
        on:lostpointercapture={() => { pointerId = undefined; setDragging(false) }} on:keydown={moveWithKeys}>
        <div class="flex items-center space-x-1">
          <button type="button" aria-expanded={expanded()} onClick={() => setExpanded(!expanded())} class="p-1 rounded-lg hover:bg-[color:var(--ent-surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ent-accent)]" aria-label={expanded() ? t("cad.collapse") : t("cad.expand")}>
            <Show when={expanded()} fallback={<ChevronDown size={14} />}><ChevronUp size={14} /></Show>
          </button>
          <span class="text-xs font-medium text-[color:var(--ent-text)]">{t("cad.tb.cadTools")}</span>
        </div>
        <Show when={props.onClose}><button type="button" onClick={() => props.onClose?.()} class="p-1 rounded-lg hover:bg-[color:var(--ent-surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ent-accent)]" aria-label={t("cad.drawing.close")}><X size={14} /></button></Show>
      </div>

      <Show when={expanded()}>
        <div class="cad-floating-body">
          <div class="cad-floating-tabs" role="group" aria-label={t("cad.ribbon.toolModes")}>
            <For each={availableModes()}>{(tab) =>
              <button type="button"
                aria-pressed={mode() === tab} onClick={() => setMode(tab)}
                class={`flex-1 px-2 py-1 text-xs font-medium rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ent-accent)] ${mode() === tab ? "bg-[color:var(--ent-surface)] text-[color:var(--ent-accent)] shadow-sm" : "text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)]"}`}
              >{modeLabel(tab)}</button>}
            </For>
          </div>
          <div class="cad-floating-content">{panel()}</div>
        </div>
      </Show>
    </div>
  )
}
