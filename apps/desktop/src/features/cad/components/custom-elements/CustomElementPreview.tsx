/**
 * The custom element preview: a small Three.js stage that shows what the geometry script builds
 * (legacy `customElements/CustomElementPreview.tsx`).
 *
 * The scene is built once when the panel mounts; passing a new `object` swaps what is on it.
 * Dragging orbits, the wheel zooms — the same hand-rolled controls the legacy preview used.
 */
import { Show, createEffect, onCleanup, onMount, type JSX } from "solid-js"
import * as THREE from "three"
import { RefreshCcw } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"
import { triangleCount } from "../../lib/customElements/evaluate.ts"

export interface CustomElementPreviewProps {
  readonly object: THREE.Object3D | null
  readonly definition: CustomElementDefinition
  readonly isLoading?: boolean
}

/**
 * Three's renderer, or `null` where there is no WebGL context (a headless test window, a machine
 * without a GPU). The panel then shows an empty stage instead of failing the whole editor.
 */
const newWebGLRenderer = (): THREE.WebGLRenderer | null => {
  try { return new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
  catch { return null }
}

export default function CustomElementPreview(props: CustomElementPreviewProps): JSX.Element {
  let mount: HTMLDivElement | undefined

  let scene: THREE.Scene | undefined
  let camera: THREE.PerspectiveCamera | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let shown: THREE.Object3D | undefined
  let frame = 0
  let target = new THREE.Vector3(0, 0, 0)
  const spherical = () => new THREE.Spherical(5, Math.PI / 3, Math.PI / 4)

  onMount(() => {
    const container = mount
    if (!container) return
    const rect = container.getBoundingClientRect()
    const config = props.definition.previewConfig
    const position = config?.camera?.position ?? [3, 3, 3]
    target = new THREE.Vector3(...(config?.camera?.target ?? [0, 0, 0]))

    const built = new THREE.Scene()
    built.background = new THREE.Color(config?.background ?? "#e9eef5")
    scene = built

    const view = new THREE.PerspectiveCamera(75, rect.width / rect.height, 0.1, 1000)
    view.position.set(position[0], position[1], position[2])
    view.lookAt(target)
    camera = view

    const gl = newWebGLRenderer()
    if (!gl) return
    gl.setSize(rect.width, rect.height)
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(gl.domElement)
    renderer = gl

    if (config?.lighting !== false) {
      built.add(new THREE.AmbientLight(0x404040, 0.4))
      const key = new THREE.DirectionalLight(0xffffff, 1)
      key.position.set(5, 5, 5)
      key.castShadow = true
      key.shadow.mapSize.width = 1024
      key.shadow.mapSize.height = 1024
      built.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.3)
      fill.position.set(-5, 0, -5)
      built.add(fill)
    }

    const grid = new THREE.GridHelper(10, 10, 0x94a3b8, 0xdbe2ea)
    grid.name = "custom-element-grid"
    built.add(grid)
    built.add(new THREE.AxesHelper(2))

    // Orbit around the definition's own target; phi is clamped so the camera never flips.
    let dragging = false
    let previous = { x: 0, y: 0 }
    let orbit = spherical()
    orbit.setFromVector3(view.position.clone().sub(target))
    const moveCamera = (): void => {
      view.position.setFromSpherical(orbit).add(target)
      view.lookAt(target)
    }
    const onDown = (event: MouseEvent): void => { dragging = true; previous = { x: event.clientX, y: event.clientY } }
    const onMove = (event: MouseEvent): void => {
      if (!dragging) return
      orbit.theta -= (event.clientX - previous.x) * 0.01
      orbit.phi += (event.clientY - previous.y) * 0.01
      orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi))
      moveCamera()
      previous = { x: event.clientX, y: event.clientY }
    }
    const onUp = (): void => { dragging = false }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      orbit.radius *= event.deltaY > 0 ? 1.1 : 0.9
      orbit.radius = Math.max(0.5, Math.min(50, orbit.radius))
      moveCamera()
    }

    const canvas = gl.domElement
    canvas.addEventListener("mousedown", onDown)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    canvas.addEventListener("wheel", onWheel)

    const animate = (): void => {
      frame = requestAnimationFrame(animate)
      gl.render(built, view)
    }
    animate()

    const onResize = (): void => {
      const box = container.getBoundingClientRect()
      view.aspect = box.width / box.height
      view.updateProjectionMatrix()
      gl.setSize(box.width, box.height)
    }
    window.addEventListener("resize", onResize)

    onCleanup(() => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener("mousedown", onDown)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      canvas.removeEventListener("wheel", onWheel)
      window.removeEventListener("resize", onResize)
      if (container.contains(gl.domElement)) container.removeChild(gl.domElement)
      gl.dispose()
    })
  })

  // The definition's preview settings can change while the editor is open.
  createEffect(() => {
    const stage = scene
    const config = props.definition.previewConfig
    if (!stage) return
    stage.background = new THREE.Color(config?.background ?? "#e9eef5")
    target = new THREE.Vector3(...(config?.camera?.target ?? [0, 0, 0]))
  })

  // A new build replaces the previous one, whose GPU resources are released.
  createEffect(() => {
    const object = props.object
    const stage = scene
    if (!stage) return
    if (shown) {
      stage.remove(shown)
      shown.traverse((child) => {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose())
        else mesh.material?.dispose()
      })
      shown = undefined
    }
    if (!object || !camera) return
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    stage.add(object)
    shown = object

    const bounds = new THREE.Box3().setFromObject(object)
    const size = bounds.getSize(new THREE.Vector3())
    const largest = Math.max(size.x, size.y, size.z)
    if (largest > 0 && camera) {
      target.copy(bounds.getCenter(new THREE.Vector3()))
      const orbit = spherical()
      orbit.setFromVector3(camera.position.clone().sub(target))
      orbit.radius = Math.max(largest * 1.75, 3)
      camera.position.setFromSpherical(orbit).add(target)
      camera.lookAt(target)
      const grid = stage.getObjectByName("custom-element-grid")
      if (grid) {
        grid.position.set(target.x, bounds.min.y, target.z)
        grid.scale.setScalar(Math.max(largest / 10, 1))
      }
    }
  })

  const triangles = (): number | undefined => (props.object ? triangleCount(props.object) : undefined)

  return (
    <div class="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div ref={mount} class="w-full h-full" />

      <Show when={props.isLoading}>
        <div class="absolute inset-0 bg-white/75 dark:bg-gray-800/75 flex items-center justify-center">
          <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm">
            <RefreshCcw class="w-5 h-5 animate-spin" />
            <span>{t("cad.customElements.generating")}</span>
          </div>
        </div>
      </Show>

      <Show when={!props.object && !props.isLoading}>
        <div class="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
          <div class="text-center">
            <div class="text-2xl mb-2">📦</div>
            <div>{t("cad.customElements.noPreview")}</div>
            <div class="text-sm">{t("cad.customElements.noPreviewHint")}</div>
          </div>
        </div>
      </Show>

      <div class="absolute bottom-3 left-3 rounded-lg border border-slate-700/60 bg-slate-950/80 px-3 py-2 text-[10px] leading-4 text-slate-100 shadow-lg backdrop-blur">
        <div>🖱️ {t("cad.customElements.dragRotate")}</div>
        <div>🔘 {t("cad.customElements.scrollZoom")}</div>
      </div>

      <Show when={props.object && !props.isLoading}>
        <div class="absolute left-3 top-3 rounded-lg border border-slate-700/60 bg-slate-950/80 px-3 py-2 text-[10px] leading-4 text-slate-100 shadow-lg backdrop-blur">
          <div>{t("cad.customElements.triangles", { count: triangles() ?? 0 })}</div>
          <div>
            {t("cad.customElements.objectType")}: {props.object?.type}
          </div>
        </div>
      </Show>
    </div>
  )
}
