/**
 * The 3D sample of a material resource: a sphere and a block in the material's colour on the shared preview stage. The
 * surface follows the properties — a dense material (metal) is drawn metallic and lit by a studio environment, a light one
 * (plastic, wood) matte — so the sample reads like the stock the CAM preview will show.
 */
import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { disposeObject } from "../../cad/lib/sceneHelpers.ts"
import { FrameScheduler } from "../../cad/lib/frame-scheduler.ts"
import { PREVIEW_BACKGROUND, addPreviewLights, hexColor } from "../lib/preview-scene.ts"
import { PREVIEW_STAGE, PreviewFrame, stageNote } from "./PreviewFrame.tsx"

const METAL_DENSITY = 2000 // kg/m³ — aluminium and above are metals, plastics / woods sit below

/** Density in kg/m³: the library stores both kg/m³ (7850) and g/cm³ (7.85), so a small figure is read as g/cm³. */
export const densityKgM3 = (density: number): number => (density > 0 && density < 100 ? density * 1000 : density)

export interface MaterialSample { readonly color: string; readonly metalness: number; readonly roughness: number }

/** The surface of a material from its stored properties. */
export const materialSample = (properties: Readonly<Record<string, unknown>>): MaterialSample => {
  const density = densityKgM3(Number(properties["density"]) || 0)
  const metal = density >= METAL_DENSITY
  return { color: hexColor(properties["color"]), metalness: metal ? 0.9 : 0.04, roughness: metal ? 0.32 : 0.62 }
}

export function MaterialPreview3D(props: { readonly properties: Readonly<Record<string, unknown>>; readonly height?: number }): JSX.Element {
  let host: HTMLDivElement | undefined
  const [unavailable, setUnavailable] = createSignal(false)
  let apply = () => {}
  createEffect(() => { materialSample(props.properties); apply() })
  onMount(() => {
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) } catch { setUnavailable(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.append(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(PREVIEW_BACKGROUND)
    addPreviewLights(scene)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    const surface = new THREE.MeshStandardMaterial()
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), surface)
    sphere.position.set(-1.35, 0, 1)
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), surface)
    block.position.set(1.15, 0, 0.85)
    block.rotation.z = 0.5
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x232d38, roughness: 0.9, metalness: 0 }))
    scene.add(sphere, block, floor)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.up.set(0, 0, 1)
    camera.position.set(2.6, -6.4, 3.6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0.8)
    controls.enableDamping = true
    controls.update()
    const frames = new FrameScheduler(() => { const moving = controls.update(); renderer.render(scene, camera); return moving }, requestAnimationFrame, cancelAnimationFrame)
    controls.addEventListener("change", frames.invalidate)
    apply = () => {
      const sample = materialSample(props.properties)
      surface.color.set(sample.color); surface.metalness = sample.metalness; surface.roughness = sample.roughness
      frames.invalidate()
    }
    const resize = () => {
      const width = Math.max(1, host!.clientWidth), height = Math.max(1, host!.clientHeight)
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); frames.invalidate()
    }
    const observer = new ResizeObserver(resize); observer.observe(host)
    const visibility = () => frames.suspend(document.hidden)
    document.addEventListener("visibilitychange", visibility)
    apply(); resize(); visibility()
    onCleanup(() => {
      apply = () => {}; observer.disconnect(); document.removeEventListener("visibilitychange", visibility)
      frames.dispose(); controls.dispose(); disposeObject(scene); environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove()
    })
  })
  return <PreviewFrame title="Material sample" testId="material-preview" hint="Drag to orbit · Scroll to zoom">
    <div ref={host} class={PREVIEW_STAGE} style={{ height: `${props.height ?? 260}px` }} role="img" aria-label="3D material sample">
      <Show when={unavailable()}><p role="status" class={stageNote("info")}>3D preview unavailable (no WebGL)</p></Show>
    </div>
  </PreviewFrame>
}
