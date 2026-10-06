import { Show, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { useSelectionStore } from "../store/selectorStore.ts"

interface BoxSelectionProps {
  worldToScreen(position: { x: number; y: number; z: number }): { x: number; y: number } | null
}

/** The rubber-band rectangle drawn while the selection tool drags a box. */
export default function BoxSelection(props: BoxSelectionProps): JSX.Element {
  const selection = useSelectionStore()
  const rect = () => {
    const start = selection.boxStartPosition, end = selection.boxEndPosition
    if (!selection.isBoxSelecting || !start || !end) return undefined
    const a = props.worldToScreen({ ...start, z: 0 }), b = props.worldToScreen({ ...end, z: 0 })
    if (!a || !b) return undefined
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
  }
  return (
    <Show when={rect()}>{(box) =>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        class="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-20 pointer-events-none z-30"
        style={{ left: `${box().left}px`, top: `${box().top}px`, width: `${box().width}px`, height: `${box().height}px` }} />}
    </Show>
  )
}
