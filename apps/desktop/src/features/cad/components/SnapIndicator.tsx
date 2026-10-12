import { Match, Show, Switch, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { SnapType } from "../lib/enanchedSnapService.ts"

interface SnapIndicatorProps { readonly x: number; readonly y: number; readonly type: SnapType; readonly visible: boolean }

/** The marker drawn over the canvas at the snapped point; one look per snap type. Port of the legacy component. */
export default function SnapIndicator(props: SnapIndicatorProps): JSX.Element {
  const base = () => ({ position: "absolute", transform: "translate(-50%, -50%)", "pointer-events": "none", left: `${props.x}px`, top: `${props.y}px` }) as const
  const pop = { initial: { scale: 0 }, animate: { scale: 1 }, exit: { scale: 0 } }
  return (
    <Show when={props.visible}>
      <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <Switch>
          <Match when={props.type === SnapType.ENDPOINT}><Motion.div style={base()} {...pop}><div class="w-3 h-3 rounded-full border-2 border-blue-500 bg-white" /></Motion.div></Match>
          <Match when={props.type === SnapType.MIDPOINT}><Motion.div style={base()} {...pop}><div class="w-3 h-3 rounded-sm border-2 border-green-500 bg-white" /></Motion.div></Match>
          <Match when={props.type === SnapType.INTERSECTION}><Motion.div style={base()} initial={{ scale: 0, rotate: 0 }} animate={{ scale: 1, rotate: 45 }} exit={{ scale: 0 }}><div class="w-3 h-3 bg-red-500" /></Motion.div></Match>
          <Match when={props.type === SnapType.TANGENT}><Motion.div style={base()} {...pop}><div class="w-4 h-4 rounded-full border-2 border-purple-500 bg-white" /><div class="absolute top-1/2 left-1/2 w-4 h-0.5 bg-purple-500 transform -translate-x-1/2 -translate-y-1/2" /></Motion.div></Match>
          <Match when={props.type === SnapType.PERPENDICULAR}><Motion.div style={base()} {...pop}><div class="w-4 h-4 flex items-center justify-center"><div class="absolute w-4 h-0.5 bg-cyan-500" /><div class="absolute w-0.5 h-4 bg-cyan-500" /></div></Motion.div></Match>
          <Match when={props.type === SnapType.HORIZONTAL}><Motion.div style={base()} {...pop}><div class="absolute w-4 h-0.5 bg-yellow-500" /><div class="w-2 h-2 rounded-full bg-yellow-500" /></Motion.div></Match>
          <Match when={props.type === SnapType.VERTICAL}><Motion.div style={base()} {...pop}><div class="absolute w-0.5 h-4 bg-yellow-500" /><div class="w-2 h-2 rounded-full bg-yellow-500" /></Motion.div></Match>
          <Match when={props.type === SnapType.GRID}><Motion.div style={base()} {...pop}><div class="w-3 h-3 rounded-full border border-gray-500 bg-white" /></Motion.div></Match>
          <Match when={props.type === SnapType.CENTER}><Motion.div style={base()} {...pop}><div class="w-5 h-5 rounded-full border border-teal-500 bg-transparent"><div class="w-1 h-1 bg-teal-500 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" /></div></Motion.div></Match>
          <Match when={props.type === SnapType.EQUIDISTANT}><Motion.div style={base()} {...pop}><div class="w-4 h-4 border-2 border-indigo-500 rounded-full bg-transparent"><div class="w-2 h-0.5 bg-indigo-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" /><div class="w-0.5 h-2 bg-indigo-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" /></div></Motion.div></Match>
        </Switch>
      </div>
    </Show>
  )
}
