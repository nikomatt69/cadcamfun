import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { cam } from "@cadcamfun/core"
import { disposeObject, fitCameraToObjects } from "../../cad/lib/sceneHelpers.ts"
import { FrameScheduler } from "../../cad/lib/frame-scheduler.ts"
import type { Element } from "../../cad/store/elementsStore.ts"
import { createComponentPreviewObject } from "../lib/component-preview.ts"
import { buildPlayback, playbackSegments, toolColors } from "../../../viewport/view3d/playback.ts"
import { t } from "../../../i18n/index.ts"
import { resourcePreviewElements } from "../lib/resource-geometry.ts"
import { PREVIEW_BACKGROUND, addPreviewLights } from "../lib/preview-scene.ts"
import { PREVIEW_STAGE, PreviewFrame, stageNote } from "./PreviewFrame.tsx"
export { resourceElements } from "../lib/resource-geometry.ts"

/** A read-only scene owns its GPU resources and never writes to the active CAD workspace. */
export function ResourceGeometryPreview(props: {
  readonly elements: ReadonlyArray<Element>; readonly program?: cam.Program;
  readonly origin?: { readonly x: number; readonly y: number; readonly z: number }
}): JSX.Element {
  let host: HTMLDivElement | undefined
  const [unavailable, setUnavailable] = createSignal(false)
  const [geometryError, setGeometryError] = createSignal(false)
  const [pathsVisible, setPathsVisible] = createSignal(true)
  let rebuild = () => {}, fit = () => {}
  createEffect(() => { props.elements; props.program; props.origin; pathsVisible(); rebuild() })
  onMount(() => {
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) } catch { setUnavailable(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(PREVIEW_BACKGROUND)
    host.append(renderer.domElement)
    const scene = new THREE.Scene(), content = new THREE.Group()
    scene.background = new THREE.Color(PREVIEW_BACKGROUND)
    scene.add(content)
    addPreviewLights(scene)
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100000)
    camera.position.set(0, 0, 5)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const frames = new FrameScheduler(() => { const moving = controls.update(); renderer.render(scene, camera); return moving }, (callback) => requestAnimationFrame(callback), (id) => cancelAnimationFrame(id))
    controls.addEventListener("change", frames.invalidate)
    fit = () => {
      const center = fitCameraToObjects(camera, controls.target, content.children)
      if (center) controls.target.copy(center)
      controls.update(); frames.invalidate()
    }
    rebuild = () => {
      for (const child of [...content.children]) disposeObject(child)
      setGeometryError(false)
      const part = new THREE.Group(), origin = props.origin
      content.add(part)
      let elements: Element[] = []
      try { elements = resourcePreviewElements(props.elements) } catch { setGeometryError(true) }
      for (const element of elements) {
        try {
          const object = createComponentPreviewObject(element)
          if (object) part.add(object)
          else setGeometryError(true)
        }
        catch { setGeometryError(true) }
      }
      if (origin) part.position.set(-origin.x, -origin.y, -origin.z)
      part.updateMatrixWorld(true)
      if (new THREE.Box3().setFromObject(part).isEmpty()) setGeometryError(true)
      if (props.program && pathsVisible()) {
        const colors = toolColors(props.program), groups = new Map<string, { readonly color: number; readonly points: number[] }>()
        for (const segment of playbackSegments(buildPlayback(props.program))) {
          const key = `${segment.toolId}:${segment.rapid}`
          let group = groups.get(key)
          if (!group) { group = { color: segment.rapid ? 0x94a3b8 : colors.get(segment.toolId) ?? 0x38bdf8, points: [] }; groups.set(key, group) }
          group.points.push(segment.from.x, segment.from.y, segment.from.z, segment.to.x, segment.to.y, segment.to.z)
        }
        for (const { points, color } of groups.values()) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3))
          content.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 })))
        }
      }
      fit()
    }
    const resize = () => {
      const width = Math.max(1, host!.clientWidth), height = Math.max(1, host!.clientHeight)
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); frames.invalidate()
    }
    const observer = new ResizeObserver(resize); observer.observe(host)
    const visibility = () => frames.suspend(document.hidden)
    document.addEventListener("visibilitychange", visibility)
    resize(); rebuild(); visibility()
    onCleanup(() => {
      rebuild = () => {}; fit = () => {}; observer.disconnect(); document.removeEventListener("visibilitychange", visibility)
      frames.dispose(); controls.dispose(); disposeObject(content); renderer.dispose(); renderer.domElement.remove()
    })
  })
  return <PreviewFrame title={t("cam.resource.preview")} testId="resource-geometry-preview" onFit={() => fit()} fitLabel={t("cam.resource.fit")} hint={t("cam.resource.orbit")}
    actions={<Show when={props.program}><label class="flex items-center gap-1"><input type="checkbox" class="accent-blue-600" checked={pathsVisible()} onChange={(event) => setPathsVisible(event.currentTarget.checked)} />{t("save.toolpaths")}</label></Show>}>
    <div ref={host} class={`${PREVIEW_STAGE} h-80`} role="img" aria-label={t("cam.resource.preview")}>
      <Show when={unavailable()}><p role="status" class={stageNote("info")}>{t("cam.resource.noWebgl")}</p></Show>
      <Show when={!unavailable() && props.elements.length === 0}><p role="status" class={stageNote("info")}>{t("cam.resource.previewEmpty")}</p></Show>
      <Show when={!unavailable() && geometryError()}><p role="status" class={stageNote("warn")}>{t("cam.resource.geometryError")}</p></Show>
    </div>
  </PreviewFrame>
}
