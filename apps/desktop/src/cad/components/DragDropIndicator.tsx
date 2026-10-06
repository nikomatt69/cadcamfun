import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"

interface DragDropIndicatorProps {
  readonly position: { x: number; y: number; z: number }
  readonly screenPosition?: { x: number; y: number } | undefined
}

/** The blinking drop marker with the target coordinates, shown while a library component is dragged over the canvas. */
export default function DragDropIndicator(props: DragDropIndicatorProps): JSX.Element {
  const [visible, setVisible] = createSignal(true)
  onMount(() => {
    const timer = setInterval(() => setVisible((v) => !v), 400)
    onCleanup(() => clearInterval(timer))
  })
  const placement = () => props.screenPosition
    ? { left: `${props.screenPosition.x}px`, top: `${props.screenPosition.y}px`, transform: "translate(-50%, -50%)" }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
  return (
    <Show when={visible()}>
      <div class="absolute pointer-events-none z-50" style={placement()}>
        <div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full border-2 border-blue-500 flex items-center justify-center"><div class="w-2 h-2 bg-blue-500 rounded-full" /></div>
          <div class="mt-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded">
            {props.position.x.toFixed(1)}, {props.position.y.toFixed(1)}, {props.position.z.toFixed(1)}
          </div>
        </div>
      </div>
    </Show>
  )
}
