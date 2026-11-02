/**
 * Width / height dimension lines of the selected elements, drawn over the viewport (legacy `DimensionsOverlay`).
 *
 * For every selected element the overlay takes the bounding box of its scene object, projects the box corners
 * to the screen and draws a cyan line with the size next to it. It is shown while the toolbar's "Show
 * Dimensions" toggle is on. Unlike the legacy overlay (which projected onto the whole window), the corners are
 * projected onto the overlay's own box, and the lines follow the camera while the view is orbited.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import * as THREE from "three"
import { useCADStore } from "../store/cadStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"

export interface ScreenDimension {
  readonly id: string
  /** `width` is the size along X, `depth` along Y, `height` along Z (the scene is Z-up). */
  readonly type: "width" | "depth" | "height"
  readonly startX: number
  readonly startY: number
  readonly endX: number
  readonly endY: number
  readonly textX: number
  readonly textY: number
  readonly value: string
}

export interface DimensionsOverlayProps {
  readonly scene: () => THREE.Scene | undefined
  readonly camera: () => THREE.Camera | undefined
}

const formatSize = (value: number): string => value.toFixed(2)

/** One scene object per selected element: the first (outermost) object carrying the element's id. */
const selectedObjects = (scene: THREE.Scene, ids: ReadonlyArray<string>): THREE.Object3D[] => {
  const seen = new Set<string>()
  const found: THREE.Object3D[] = []
  scene.traverse((object) => {
    const id = ids.find((candidate) => candidate === object.name || candidate === object.userData.elementId)
    if (id === undefined || seen.has(id)) return
    seen.add(id)
    found.push(object)
  })
  return found
}

/** The width and height lines of each object, projected to a `viewportWidth` x `viewportHeight` screen. */
export const measureDimensions = (
  scene: THREE.Scene,
  camera: THREE.Camera,
  ids: ReadonlyArray<string>,
  viewportWidth: number,
  viewportHeight: number
): ScreenDimension[] => {
  const project = (point: THREE.Vector3): { x: number; y: number } | null => {
    const vector = point.clone().project(camera)
    if (vector.z > 1) return null // behind the camera
    return { x: (vector.x * 0.5 + 0.5) * viewportWidth, y: (-vector.y * 0.5 + 0.5) * viewportHeight }
  }
  const dimensions: ScreenDimension[] = []
  selectedObjects(scene, ids).forEach((object, index) => {
    const box = new THREE.Box3().setFromObject(object, true)
    if (box.isEmpty()) return
    const size = new THREE.Vector3()
    box.getSize(size)
    const origin = project(new THREE.Vector3(box.min.x, box.min.y, box.min.z))
    const alongX = project(new THREE.Vector3(box.max.x, box.min.y, box.min.z))
    const alongY = project(new THREE.Vector3(box.min.x, box.max.y, box.min.z))
    const alongZ = project(new THREE.Vector3(box.min.x, box.min.y, box.max.z))
    const elementId = object.name || (object.userData.elementId as string | undefined) || `dim-${index}`
    const add = (type: ScreenDimension["type"], end: { x: number; y: number } | null, value: number, textOffset: { x: number; y: number }) => {
      if (!origin || !end) return
      dimensions.push({ id: `${elementId}-${type}`, type, startX: origin.x, startY: origin.y, endX: end.x, endY: end.y, textX: (origin.x + end.x) / 2 + textOffset.x, textY: (origin.y + end.y) / 2 + textOffset.y, value: formatSize(value) })
    }
    add("width", alongX, size.x, { x: 0, y: 15 })
    add("depth", alongY, size.y, { x: -15, y: 10 })
    add("height", alongZ, size.z, { x: -25, y: 0 })
  })
  return dimensions
}

/**
 * A cheap fingerprint of everything the dimensions depend on: the camera (matrix and projection), the overlay size and the world
 * matrix of each selected object. Equal fingerprints mean the lines would be the same, so the measure can be skipped.
 */
export const viewSignature = (scene: THREE.Scene, camera: THREE.Camera, ids: ReadonlyArray<string>, width: number, height: number): string => {
  camera.updateMatrixWorld()
  const parts: number[] = [width, height, ...camera.matrixWorld.elements, ...camera.projectionMatrix.elements]
  for (const object of selectedObjects(scene, ids)) {
    object.updateWorldMatrix(true, false)
    parts.push(...object.matrixWorld.elements)
    // The geometry can change under the same matrix (a rebuilt part is a new object, an edited one a new bounding sphere).
    const geometry = (object as THREE.Mesh).geometry
    parts.push(geometry?.boundingSphere?.radius ?? geometry?.getAttribute?.("position")?.count ?? 0, object.children.length)
  }
  return parts.join(",")
}

export default function DimensionsOverlay(props: DimensionsOverlayProps): JSX.Element {
  const cad = useCADStore()
  const selection = useSelectionStore()
  const [dimensions, setDimensions] = createSignal<ReadonlyArray<ScreenDimension>>([])
  let root: HTMLDivElement | undefined

  createEffect(() => {
    if (!cad.showDimensions || selection.selectedElementIds.length === 0) { setDimensions([]); return }
    const ids = [...selection.selectedElementIds]
    let frame = 0
    let last = ""
    let lastView = ""
    const tick = () => {
      const scene = props.scene()
      const camera = props.camera()
      if (scene && camera) {
        // The measure walks the scene and projects the corners: it runs only when the view or the parts changed, not on every idle frame.
        const view = viewSignature(scene, camera, ids, root?.clientWidth || window.innerWidth, root?.clientHeight || window.innerHeight)
        if (view !== lastView) {
          lastView = view
          const next = measureDimensions(scene, camera, ids, root?.clientWidth || window.innerWidth, root?.clientHeight || window.innerHeight)
          const key = JSON.stringify(next)
          if (key !== last) { last = key; setDimensions(next) }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div ref={root} style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%", "pointer-events": "none", overflow: "hidden", "z-index": "10" }}>
      <Show when={cad.showDimensions}>
        <For each={dimensions()}>{(dimension) => {
          const dx = () => dimension.endX - dimension.startX
          const dy = () => dimension.endY - dimension.startY
          return (
            <>
              <div style={{
                position: "absolute", left: `${dimension.startX}px`, top: `${dimension.startY}px`, width: `${Math.sqrt(dx() * dx() + dy() * dy())}px`, height: "1px",
                "background-color": "cyan", "transform-origin": "0 0", transform: `rotate(${Math.atan2(dy(), dx()) * (180 / Math.PI)}deg)`
              }} />
              <div style={{
                position: "absolute", left: `${dimension.textX}px`, top: `${dimension.textY}px`, color: "cyan", "background-color": "rgba(0, 0, 0, 0.6)",
                padding: "1px 4px", "border-radius": "2px", "font-size": "10px", "white-space": "nowrap", transform: "translate(-50%, -50%)"
              }}>{dimension.value}</div>
            </>
          )
        }}</For>
      </Show>
    </div>
  )
}
