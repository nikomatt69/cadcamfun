import { For, Show, type JSX } from "solid-js"
import type { RenderMode, TransformMode, ViewPreset } from "./view3d.tsx"
import "./viewport-controls.css"

// Kept within WP7 ownership until the screen agent moves these keys into en.cad.json.
export const viewportLabels = {
  perspective: "Perspective", top: "Top", bottom: "Bottom", front: "Front", back: "Back",
  left: "Left", right: "Right", isometric: "Isometric", "four-view": "Four views",
  shaded: "Shaded", "shaded-edges": "Shaded with edges", wireframe: "Wireframe", xray: "X-ray",
  translate: "Move", rotate: "Rotate", scale: "Scale", none: "Select",
  fit: "Fit to view", grid: "Grid", axes: "Axes", origin: "Workpiece origin", fullscreen: "Fullscreen",
  controls: "View controls", render: "Render mode", view: "View preset", shortcuts: "Orbit: drag | Pan: right drag | Zoom: wheel | Fit: F",
} as const

interface ControlsProps {
  readonly preset: ViewPreset
  readonly mode: RenderMode
  readonly grid: boolean
  readonly axes: boolean
  readonly enabled: boolean
  readonly transform: TransformMode
  readonly canTransform: boolean
  readonly onPreset: (preset: ViewPreset) => void
  readonly onMode: (mode: RenderMode) => void
  readonly onGrid: () => void
  readonly onAxes: () => void
  readonly onFit: () => void
  readonly onFullscreen: () => void
  readonly onTransform: (mode: TransformMode) => void
  readonly footer?: JSX.Element
}

export function ViewportControls(props: ControlsProps): JSX.Element {
  return <>
    <div class="vp3-controls" role="toolbar" aria-label={viewportLabels.controls}>
      <select aria-label={viewportLabels.view} value={props.preset} disabled={!props.enabled} onChange={e => props.onPreset(e.currentTarget.value as ViewPreset)}>
        <For each={Object.keys(viewportLabels).filter(k => ["perspective", "top", "bottom", "front", "back", "left", "right", "isometric", "four-view"].includes(k)) as ViewPreset[]}>
          {preset => <option value={preset}>{viewportLabels[preset]}</option>}
        </For>
      </select>
      <select aria-label={viewportLabels.render} value={props.mode} disabled={!props.enabled} onChange={e => props.onMode(e.currentTarget.value as RenderMode)}>
        <For each={["shaded", "shaded-edges", "wireframe", "xray"] as RenderMode[]}>{mode => <option value={mode}>{viewportLabels[mode]}</option>}</For>
      </select>
      <button type="button" disabled={!props.enabled} title={viewportLabels.fit} onClick={props.onFit}>{viewportLabels.fit}</button>
      <button type="button" disabled={!props.enabled} aria-pressed={props.grid} onClick={props.onGrid}>{viewportLabels.grid}</button>
      <button type="button" disabled={!props.enabled} aria-pressed={props.axes} onClick={props.onAxes}>{viewportLabels.axes}</button>
    </div>
    <div class="vp3-cube" role="group" aria-label={viewportLabels.view}>
      <For each={["top", "left", "front", "right", "back", "bottom", "isometric"] as ViewPreset[]}>{preset =>
        <button type="button" disabled={!props.enabled} aria-pressed={props.preset === preset} onClick={() => props.onPreset(preset)}>{viewportLabels[preset]}</button>
      }</For>
    </div>
    <Show when={props.canTransform}>
      <div class="vp3-transform" role="toolbar" aria-label={viewportLabels.translate}>
        <For each={["none", "translate", "rotate", "scale"] as TransformMode[]}>{mode => <button type="button" aria-pressed={props.transform === mode} onClick={() => props.onTransform(mode)}>{viewportLabels[mode]}</button>}</For>
      </div>
    </Show>
    <div class="vp3-footer" classList={{ "vp3-footer--player": !!props.footer }}>
      <span>{viewportLabels.shortcuts}</span>
      <div class="vp3-footer-actions">{props.footer}<button type="button" disabled={!props.enabled} onClick={props.onFullscreen}>{viewportLabels.fullscreen}</button></div>
    </div>
  </>
}
