import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { cam } from "@cadcamfun/core"
import { disposeObject, fitCameraToObjects } from "../../cad/lib/sceneHelpers.ts"
import { createThreeObject } from "../../cad/lib/createThreeObject.ts"
import { initializeElementTransform, type ElementTransformFields } from "../../cad/lib/element-transform.ts"
import { FrameScheduler } from "../../cad/lib/frame-scheduler.ts"
import type { Element } from "../../cad/store/elementsStore.ts"
import { buildPlayback, toolColors } from "../../../viewport/view3d/playback.ts"
import { t } from "../../../i18n/index.ts"
import { resourcePreviewElements } from "../lib/resource-geometry.ts"
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
    renderer.setClearColor(0x111827)
    host.append(renderer.domElement)
    const scene = new THREE.Scene(), content = new THREE.Group()
    scene.add(content, new THREE.HemisphereLight(0xffffff, 0x334155, 2))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(100, -100, 200); scene.add(light)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000)
    camera.up.set(0, 0, 1); camera.position.set(100, -120, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const frames = new FrameScheduler(() => { const moving = controls.update(); renderer.render(scene, camera); return moving }, requestAnimationFrame, cancelAnimationFrame)
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
          const copy = structuredClone(element), object = createThreeObject(copy, { x: 0, y: 0, z: 0 })
          if (object) { initializeElementTransform(object, copy as ElementTransformFields); part.add(object) }
        }
        catch { setGeometryError(true) }
      }
      if (origin) part.position.set(-origin.x, -origin.y, -origin.z)
      if (props.program && pathsVisible()) {
        const colors = toolColors(props.program), groups = new Map<string, { readonly color: number; readonly points: number[] }>()
        for (const segment of buildPlayback(props.program).segments) {
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
  return <div data-testid="resource-geometry-preview" class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <h3 class="font-medium text-gray-900 dark:text-white">{t("cam.resource.preview")}</h3>
      <div class="flex items-center gap-3">
        <Show when={props.program}><label class="flex items-center gap-1 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={pathsVisible()} onChange={(event) => setPathsVisible(event.currentTarget.checked)} />{t("save.toolpaths")}</label></Show>
        <button type="button" class="rounded border border-gray-300 px-2 py-1 text-gray-700 dark:border-gray-600 dark:text-gray-200" onClick={() => fit()}>{t("cam.resource.fit")}</button>
      </div>
    </div>
    <div ref={host} class="relative h-80 overflow-hidden rounded-lg bg-gray-900" role="img" aria-label={t("cam.resource.preview")}>
      <Show when={unavailable()}><p role="status" class="absolute inset-0 flex items-center justify-center p-4 text-sm text-gray-300">{t("cam.resource.noWebgl")}</p></Show>
    </div>
    <Show when={geometryError()}><p role="alert" class="text-sm text-amber-600">{t("cam.resource.geometryError")}</p></Show>
    <p class="text-xs text-gray-500 dark:text-gray-400">{t("cam.resource.orbit")}</p>
  </div>
}
