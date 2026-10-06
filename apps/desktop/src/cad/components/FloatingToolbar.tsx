import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { ChevronDown, ChevronUp, Copy, Maximize2, Move, RotateCcw, Sliders, Trash2, X } from "lucide-solid"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"
import ToolPanel from "./ToolPanel.tsx"

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
  const [windowSize, setWindowSize] = createSignal({ width: window.innerWidth, height: window.innerHeight })
  let toolbar: HTMLDivElement | undefined
  let grab: Position = { x: 0, y: 0 }

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

  /** Clamps to the host's box; before layout (or headless) the point is kept as given. */
  const constrain = (point: Position): Position => {
    const rect = toolbar?.getBoundingClientRect()
    const box = host()?.getBoundingClientRect()
    const width = rect?.width ?? 300
    const height = rect?.height ?? 100
    if (!box || box.width === 0 || box.height === 0) return point
    return {
      x: Math.min(Math.max(0, point.x), Math.max(0, box.width - width)),
      y: Math.min(Math.max(0, point.y), Math.max(0, box.height - height))
    }
  }

  const move = (event: MouseEvent) => {
    if (!dragging()) return
    const box = host()?.getBoundingClientRect()
    setPosition(constrain({ x: event.clientX - grab.x - (box?.left ?? 0), y: event.clientY - grab.y - (box?.top ?? 0) }))
  }
  const stop = () => setDragging(false)
  const start = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("button")) return
    const rect = toolbar?.getBoundingClientRect()
    grab = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
    setDragging(true)
  }

  onMount(() => {
    const resize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", stop)
    onCleanup(() => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", stop)
    })
  })
  createEffect(() => { windowSize(); setPosition((previous) => constrain(previous)) })

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
        <div class="p-2 flex flex-col gap-2">
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Move Element")} onClick={() => transform.setMode("translate")}><Move size={16} class="mb-1" /><span>Move</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Rotate Element")} onClick={() => transform.setMode("rotate")}><RotateCcw size={16} class="mb-1" /><span>Rotate</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Scale Element")} onClick={() => transform.setMode("scale")}><Maximize2 size={16} class="mb-1" /><span>Scale</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Duplicate Element")} onClick={() => { const selected = elements.selectedElement; if (selected) elements.duplicateElement(selected.id) }}><Copy size={16} class="mb-1" /><span>Copy</span></button>
          <button class={TOOL_BUTTON} disabled={blocked()} title={reason("Delete Element")} onClick={() => { const selected = elements.selectedElement; if (selected) elements.deleteElement(selected.id) }}><Trash2 size={16} class="mb-1" /><span>Delete</span></button>
          <button class={TOOL_BUTTON} title={`Switch to ${nextView()} View`} onClick={() => cad.setViewMode(cad.viewMode === "2d" ? "3d" : "2d")}><Sliders size={16} class="mb-1" /><span>{nextView()}</span></button>
        </div>
      </Show>
    }>
      <div class="p-2 grid  gap-2"><ToolPanel /></div>
    </Show>
  )

  return (
    <Motion.div
      ref={toolbar}
      style={{ position: "absolute", left: `${position().x}px`, top: `${position().y}px`, "touch-action": "none", "z-index": 1000 }}
      initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3 }}
      class="bg-white max-h-[80vh] dark:bg-gray-800 rounded-xl shadow-lg backdrop-blur-lg bg-opacity-90 dark:bg-opacity-90 border border-gray-200 dark:border-gray-700"
    >
      <div class="p-1 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 hover:bg-black/[0.02]" classList={{ "cursor-grabbing": dragging(), "cursor-grab": !dragging() }} onMouseDown={start}>
        <div class="flex items-center space-x-1">
          <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => setExpanded(!expanded())} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={expanded() ? "Collapse" : "Expand"}>
            <Show when={expanded()} fallback={<ChevronDown size={14} />}><ChevronUp size={14} /></Show>
          </Motion.button>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-200">CAD Tools</span>
        </div>
        <Motion.button hover={{ scale: 1.05 }} press={{ scale: 0.95 }} onClick={() => props.onClose?.()} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X size={14} /></Motion.button>
      </div>

      <Show when={expanded()}>
        <div class="p-1.5 overflow-y-auto max-h-[70vh]">
          <div class="flex space-x-0.5 mb-2 bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
            <For each={MODES}>{(tab) =>
              <Motion.button
                onClick={() => setMode(tab)} hover={{ scale: 1.05 }} press={{ scale: 0.95 }}
                class={`flex-1 px-2 py-1 text-xs font-medium rounded-md ${mode() === tab ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"}`}
              >{tab.charAt(0).toUpperCase() + tab.slice(1)}</Motion.button>}
            </For>
          </div>
          {panel()}
        </div>
      </Show>
    </Motion.div>
  )
}
