/**
 * The 3D tool of a tool resource (spec 31): its type and properties through `cam.toolModelOf`, drawn by `toolObject` — the
 * very object the CAM preview moves along the program. What the resource does not give is listed as assumed.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { cam } from "@cadcamfun/core"
import { toolObject } from "../../../viewport/view3d/tool-object.ts"
import { disposeObject } from "../../../viewport/view3d/machine-scene.ts"

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** A resource row (stored or being edited) as the tool model reads it. */
export const toolResourceOf = (row: Readonly<Record<string, unknown>>): cam.ToolResource => ({
  type: String(row["type"] ?? "endmill"),
  diameter: numberOrNull(row["diameter"]) ?? 0,
  numberOfFlutes: numberOrNull(row["numberOfFlutes"]),
  cuttingLength: numberOrNull(row["cuttingLength"]),
  totalLength: numberOrNull(row["totalLength"]),
  shankDiameter: numberOrNull(row["shankDiameter"]),
  cornerRadius: numberOrNull(row["cornerRadius"]),
  tipAngle: numberOrNull(row["tipAngle"]),
  threadPitch: numberOrNull(row["threadPitch"]),
  holderDiameter: numberOrNull(row["holderDiameter"]),
  holderLength: numberOrNull(row["holderLength"]),
  stickout: numberOrNull(row["stickout"])
})

export function ToolPreview3D(props: { readonly tool: Readonly<Record<string, unknown>>; readonly height?: number }): JSX.Element {
  let host: HTMLDivElement | undefined
  const [unavailable, setUnavailable] = createSignal(false)
  const model = createMemo(() => {
    const resource = toolResourceOf(props.tool)
    return cam.toolModelOf(resource, cam.toolMachineOf(resource.type))
  })
  let rebuild = () => {}
  createEffect(() => { model(); rebuild() })
  onMount(() => {
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { setUnavailable(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.append(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1f2937)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6), new THREE.HemisphereLight(0xffffff, 0x334155, 0.8))
    const light = new THREE.DirectionalLight(0xffffff, 1.4)
    light.position.set(80, -60, 120)
    scene.add(light)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    let object: THREE.Object3D | undefined
    let frame = 0
    const render = () => { controls.update(); renderer.render(scene, camera) }
    const resize = () => {
      if (!host) return
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight)
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render()
    }
    rebuild = () => {
      if (object) { scene.remove(object); disposeObject(object) }
      const m = model()
      object = toolObject(m, { assumeHolder: true })
      scene.add(object)
      const box = new THREE.Box3().setFromObject(object)
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length() || 10
      controls.target.copy(center)
      // A mill tool is seen from the side (its axis up); a lathe insert from the front of its tool plane.
      const dir = m.family === "lathe" ? new THREE.Vector3(0.15, -1, 0.2) : new THREE.Vector3(1, -1.1, 0.45)
      camera.position.copy(center).add(dir.normalize().multiplyScalar(size * 1.6))
      camera.lookAt(center)
      render()
    }
    rebuild(); resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const loop = () => { frame = requestAnimationFrame(loop); render() }
    controls.addEventListener("start", () => { if (!frame) loop() })
    controls.addEventListener("end", () => { cancelAnimationFrame(frame); frame = 0; render() })
    onCleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); if (object) disposeObject(object); renderer.dispose(); renderer.domElement.remove(); rebuild = () => {} })
  })
  return (
    <div data-testid="tool-preview" class="space-y-2">
      <div ref={host} class="w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: `${props.height ?? 260}px` }}>
        <Show when={unavailable()}><p class="p-4 text-sm text-gray-500">3D preview unavailable (no WebGL)</p></Show>
      </div>
      <p data-testid="tool-preview-description" class="text-sm text-gray-700 dark:text-gray-300">{cam.describeTool(model())}</p>
      <Show when={model().assumed.length > 0}>
        <p data-testid="tool-preview-assumed" class="text-xs text-amber-600 dark:text-amber-400">
          Not given, drawn from the tool type: <For each={model().assumed}>{(field, i) => <span>{i() > 0 ? ", " : ""}{field}</span>}</For>. The CAM preview and the set-up checks use the same shape.
        </p>
      </Show>
    </div>
  )
}
