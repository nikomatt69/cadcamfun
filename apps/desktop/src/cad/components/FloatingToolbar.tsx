import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { ChevronDown, ChevronUp, Copy, Maximize2, Move, RotateCcw, Sliders, Trash2, X } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"
import ToolPanel from "./ToolPanel.tsx"
import { t } from "../../i18n/index.ts"

interface Position { x: number; y: number }

export interface FloatingToolbarProps {
  readonly initialPosition?: Position
  onClose?: () => void
  /** The "Library" tab (the library manager lives with the library screens). */
  readonly library?: () => JSX.Element
  /** The "AI" tab (the AI hub lives with the AI screens). */
  readonly ai?: () => JSX.Element
}

const MODES = ["create", "transform", "library", "ai"] as const
type Mode = (typeof MODES)[number]
const TOOL_BUTTON = "p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"

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

  const reason = (action: string) => (noSelection() ? "No element selected" : isLayerLocked() ? "Layer is locked" : action)
  const blocked = () => noSelection() || isLayerLocked()
  const nextView = () => (cad.viewMode === "2d" ? "3D" : "2D")

  const panel = () => (
    <Show when={mode() === "create"} fallback={
      <Show when={mode() === "transform"} fallback={
        <Show when={mode() === "library"} fallback={<div class="p-2">{props.ai ? props.ai() : null}</div>}>
          <div class="p-2 flex flex-col">{props.library ? props.library() : null}</div>
        </Show>
      }>
        <div class="cad-floating-transforms">
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Move Element")} onClick={() => transform.setMode("translate")}><Move size={16} class="mb-1" /><span>Move</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Rotate Element")} onClick={() => transform.setMode("rotate")}><RotateCcw size={16} class="mb-1" /><span>Rotate</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Scale Element")} onClick={() => transform.setMode("scale")}><Maximize2 size={16} class="mb-1" /><span>Scale</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Duplicate Element")} onClick={() => { const selected = elements.selectedElement; if (selected) elements.duplicateElement(selected.id) }}><Copy size={16} class="mb-1" /><span>Copy</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Delete Element")} onClick={() => { const selected = elements.selectedElement; if (selected) elements.deleteElement(selected.id) }}><Trash2 size={16} class="mb-1" /><span>Delete</span></button>
          <button class={TOOL_BUTTON} title={`Switch to ${nextView()} View`} onClick={() => cad.setViewMode(cad.viewMode === "2d" ? "3d" : "2d")}><Sliders size={16} class="mb-1" /><span>{nextView()}</span></button>
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
          <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => setExpanded(!expanded())} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={expanded() ? "Collapse" : "Expand"}>
            <Show when={expanded()} fallback={<ChevronDown size={14} />}><ChevronUp size={14} /></Show>
          </Motion.button>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-200">CAD Tools</span>
        </div>
        <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onClose?.()} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X size={14} /></Motion.button>
      </div>

      <Show when={expanded()}>
        <div class="cad-floating-body">
          <div class="cad-floating-tabs" role="group" aria-label={t("cad.ribbon.toolModes")}>
            <For each={MODES}>{(tab) =>
              <Motion.button
                aria-pressed={mode() === tab} onClick={() => setMode(tab)} hover={{ scale: 1.05 }} press={{ scale: 0.95 }}
                class={`flex-1 px-2 py-1 text-xs font-medium rounded-md ${mode() === tab ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"}`}
              >{tab === "ai" ? "AI" : tab.charAt(0).toUpperCase() + tab.slice(1)}</Motion.button>}
            </For>
          </div>
          <div class="cad-floating-content">{panel()}</div>
        </div>
      </Show>
    </div>
  )
}
