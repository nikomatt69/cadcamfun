/**
 * The 3D envelope of a machine resource: the table (or a printer's plate), the space the part takes and where the spindle (or
 * the nozzle) sits over it, from the machine profile. It draws what the configuration states and nothing else: a machine
 * without a work volume shows a note instead of an invented box.
 */
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { cam } from "@cadcamfun/core"
import { disposeObject, fitCameraToObjects } from "../../cad/lib/sceneHelpers.ts"
import { FrameScheduler } from "../../cad/lib/frame-scheduler.ts"
import { PREVIEW_BACKGROUND, addPreviewLook } from "../lib/preview-scene.ts"
import { machineEnvelope } from "../lib/machine-details.ts"
import { machineObject } from "../lib/machine-object.ts"
import { PREVIEW_STAGE, PreviewFrame, stageNote } from "./PreviewFrame.tsx"

export function MachinePreview3D(props: { readonly profile: ReturnType<typeof cam.kernel.profileOfConfig> }): JSX.Element {
  let host: HTMLDivElement | undefined
  const [unavailable, setUnavailable] = createSignal(false)
  const envelope = createMemo(() => machineEnvelope(props.profile))
  let rebuild = () => {}, fit = () => {}
  createEffect(() => { envelope(); rebuild() })
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
    const look = addPreviewLook(renderer, scene, { x: 400, y: -600, z: 800 }, () => frames.invalidate())
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1_000_000)
    camera.up.set(0, 0, 1)
    camera.position.set(1, -1.3, 0.9)
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
      for (const child of [...content.children]) { content.remove(child); disposeObject(child) }
      content.add(machineObject(envelope()))
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
      frames.dispose(); controls.dispose(); disposeObject(content); look.dispose(); renderer.dispose(); renderer.domElement.remove()
    })
  })
  return <PreviewFrame title="Machine envelope" testId="machine-preview" onFit={() => fit()} hint="Drag to orbit · Scroll to zoom · Blue box: the space the part takes">
    <div ref={host} class={`${PREVIEW_STAGE} h-72`} role="img" aria-label="Machine envelope">
      <Show when={unavailable()}><p role="status" class={stageNote("info")}>3D preview unavailable (no WebGL)</p></Show>
      <Show when={!unavailable() && envelope().volume === undefined}><p role="status" class={stageNote("info")}>This configuration does not state a work volume, so there is nothing to draw.</p></Show>
    </div>
  </PreviewFrame>
}
