import { Show, type JSX } from "solid-js"
import { screenRectangle, type ScreenBox } from "../lib/box-selection.ts"

/** The rubber band stays under the pointer in CSS pixels, including front/side perspective views. */
export default function BoxSelection(props: { readonly box: ScreenBox | undefined }): JSX.Element {
  const rect = () => props.box ? screenRectangle(props.box) : undefined
  return <Show when={rect()}>{box => <div data-testid="box-selection" aria-hidden="true"
    class={`absolute pointer-events-none z-30 ${box().leftToRight ? "border border-blue-400 bg-blue-400/15" : "border border-dashed border-amber-400 bg-amber-400/10"}`}
    style={{ left: `${box().left}px`, top: `${box().top}px`, width: `${box().width}px`, height: `${box().height}px` }} />}</Show>
}
