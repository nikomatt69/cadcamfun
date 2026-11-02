/**
 * Viewport 3D PMI display for the active capture: each annotation is anchored at its ref `hint`
 * (the picked point) or plane origin, projected with the viewport camera like `DimensionsOverlay`.
 * A leader line joins the anchor to its callout label (GD&T frame text / datum letter / dimension
 * text from `@cadcamfun/core`). Annotations without an anchor are listed unanchored, never placed
 * at an invented position.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import * as THREE from "three"
import { t } from "../../../i18n/index.ts"
import { activeAnnotations, projectPmiLabels, type PmiOverlayLabel } from "../pmi-format.ts"
import { usePmiStore } from "../pmi-store.ts"

export default function PmiViewportOverlay(props: { readonly scene: () => THREE.Scene | undefined; readonly camera: () => THREE.Camera | undefined }): JSX.Element {
  const store = usePmiStore()
  const [labels, setLabels] = createSignal<readonly PmiOverlayLabel[]>([])
  const [unanchored, setUnanchored] = createSignal<readonly import("@cadcamfun/core").pmi.PmiAnnotation[]>([])
  let root: HTMLDivElement | undefined

  createEffect(() => {
    const annotations = activeAnnotations(store.set, store.activeCaptureId)
    if (annotations.length === 0) { setLabels([]); setUnanchored([]); return }
    let frame = 0, last = ""
    const tick = () => {
      const camera = props.camera()
      if (camera !== undefined && props.scene() !== undefined) {
        const next = projectPmiLabels(annotations, camera, root?.clientWidth || window.innerWidth, root?.clientHeight || window.innerHeight)
        const key = JSON.stringify(next.labels)
        if (key !== last) { last = key; setLabels(next.labels); setUnanchored(next.unanchored) }
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div ref={root} data-testid="pmi-viewport-overlay" style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%", "pointer-events": "none", overflow: "hidden", "z-index": "11" }}>
      <svg style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} aria-hidden="true">
        <For each={labels()}>{(l) => <line x1={l.anchorX} y1={l.anchorY} x2={l.x} y2={l.y} stroke={l.broken ? "#dc2626" : "#f59e0b"} stroke-width="1" />}</For>
      </svg>
      <For each={labels()}>{(l) => (
        <div data-testid="pmi-label" data-kind={l.kind} style={{ position: "absolute", left: `${l.x}px`, top: `${l.y}px`, transform: "translate(-50%,-50%)", color: l.broken ? "#fca5a5" : "#fde68a", "background-color": "rgba(0,0,0,0.78)", padding: "2px 6px", "border-radius": "3px", "font-size": "11px", "font-weight": "600", "line-height": "14px", "white-space": "nowrap", border: l.kind === "datum" ? "1px solid #fde68a" : "none" }}>{l.text}</div>
      )}</For>
      <Show when={unanchored().length > 0}>
        <div data-testid="pmi-unanchored" style={{ position: "absolute", left: "8px", bottom: "8px", color: "#fecaca", "background-color": "rgba(0,0,0,0.78)", padding: "3px 7px", "font-size": "11px", "font-weight": "600", "line-height": "14px", "border-radius": "2px" }}>
          {t("cad.pmi.unanchored", { count: unanchored().length })}
        </div>
      </Show>
    </div>
  )
}
