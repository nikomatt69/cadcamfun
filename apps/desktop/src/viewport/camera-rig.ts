/**
 * The camera behaviour both 3D views share, as a thin three.js layer over `camera-nav.ts`: zoom toward the cursor, orbit about a
 * pivot (the selection, else the surface under the cursor), animated snap and fit, an orthographic stand-in for hosts that own a
 * single perspective camera, and clip planes that follow the camera.
 *
 * The host keeps its `OrbitControls` and its frame loop and calls the rig twice a frame:
 *
 *   const animating = rig.beforeUpdate(now)    // a running transition sets the camera
 *   const moved = controls.update()
 *   const changed = rig.afterUpdate(moved)     // pivot compensation, clip planes
 *
 * and redraws when `moved || animating || changed`. Every number in here comes from `camera-nav.ts`; this file only moves
 * three.js objects.
 */
import * as THREE from "three"
import {
  FLAT_FOV_DEG, adaptiveClip, clampDistanceFactor, dollyAboutPoint, dollyZoomDistance, fitBoxOrthoHalfHeight, fitBoxPerspective, intersectRayPlane, normalize,
  orbitDirection, orthoZoomAboutCursor, orthoZoomForHalfHeight, pivotOrbitShift, poseEye, redirectTransition, sampleTransition, wheelZoomFactor,
  cameraBasis, type Vec3, type ViewPose, type ViewTransition
} from "./camera-nav.ts"

/** The parts of `OrbitControls` the rig reads and writes. */
export interface RigControls {
  target: THREE.Vector3
  enabled: boolean
  enableZoom: boolean
  enableRotate: boolean
  minDistance: number
  maxDistance: number
  minZoom: number
  maxZoom: number
  zoomSpeed: number
}

export type RigCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera

export interface CameraRigOptions {
  readonly controls: RigControls
  readonly camera: () => RigCamera
  /** Receives the wheel and the pointer-down events in the capture phase: the parent of the canvas. */
  readonly surface: HTMLElement
  /** The canvas, whose box maps the pointer to normalised device coordinates. */
  readonly canvas: () => HTMLElement
  /** The scene point under a pointer position (NDC, y up), or `undefined` over nothing. */
  readonly pick: (ndc: THREE.Vector2, camera: RigCamera) => THREE.Vector3 | undefined
  /** Centre of the selection, the orbit pivot while something is selected. */
  readonly selectionCenter?: () => THREE.Vector3 | undefined
  /** Bounding sphere of everything drawn, including whatever must stay inside the clip range (a grid). */
  readonly sceneSphere: () => { readonly center: Vec3; readonly radius: number } | undefined
  readonly invalidate: () => void
  readonly reducedMotion: () => boolean
  /** False while something else owns the pointer (placing a part, a box selection). */
  readonly canNavigate?: () => boolean
}

export interface CameraRig {
  /** Look at the target from `direction` (unit, target to eye), animated. */
  readonly snapTo: (direction: Vec3) => void
  /** Turn the eye about the target at once (a drag on the view cube). */
  readonly orbitBy: (dAzimuth: number, dPolar: number) => void
  /** Frame `box` keeping the viewing direction; `animate: false` lands at once. */
  readonly fit: (box: THREE.Box3 | undefined, animate?: boolean) => void
  /** Whether a perspective camera is standing in for an orthographic one. */
  readonly flat: () => boolean
  /** Perspective cameras only: a very narrow field of view at a stretched distance keeps the framing and removes the perspective. */
  readonly setFlat: (flat: boolean) => void
  readonly beforeUpdate: (now: number) => boolean
  readonly afterUpdate: (moved: boolean) => boolean
  /** Recomputes near and far now (after the scene or the camera changed outside the frame loop). */
  readonly updateClip: () => void
  readonly cancel: () => void
  readonly dispose: () => void
}

const toVec = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z]
const isOrtho = (camera: RigCamera): camera is THREE.OrthographicCamera => (camera as THREE.OrthographicCamera).isOrthographicCamera === true

export const createCameraRig = (options: CameraRigOptions): CameraRig => {
  const { controls, surface } = options
  let transition: ViewTransition | undefined
  let pivot: THREE.Vector3 | undefined
  let pointerIsDown = false
  let beforeQuaternion: THREE.Quaternion | undefined
  let savedFov: number | undefined
  let savedMax: number | undefined
  const ndc = new THREE.Vector2()
  const scratchRay = new THREE.Raycaster()

  const poseOf = (camera: RigCamera): ViewPose => {
    const offset = camera.position.clone().sub(controls.target)
    const distance = Math.max(offset.length(), 1e-6)
    return { target: toVec(controls.target), direction: offset.lengthSq() > 0 ? normalize(toVec(offset)) : [0, -1, 0], distance, ...(isOrtho(camera) ? { zoom: camera.zoom } : {}) }
  }
  const applyPose = (camera: RigCamera, pose: ViewPose): void => {
    controls.target.set(...pose.target)
    camera.position.set(...poseEye(pose))
    camera.up.set(0, 0, 1)
    if (isOrtho(camera) && pose.zoom !== undefined && camera.zoom !== pose.zoom) { camera.zoom = pose.zoom; camera.updateProjectionMatrix() }
  }
  const begin = (to: ViewPose): void => {
    const camera = options.camera()
    const now = performance.now()
    transition = redirectTransition(transition, poseOf(camera), to, now, options.reducedMotion())
    options.invalidate()
  }
  const cursorNdc = (event: { clientX: number; clientY: number }): THREE.Vector2 => {
    const rect = options.canvas().getBoundingClientRect()
    return ndc.set(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1)
  }

  // ---------------------------------------------------------------------------------------------------- wheel zoom
  /** The rig navigates only what is drawn on the canvas: a panel, a dialog or a button on top of it keeps its own wheel and pointer. */
  const onCanvas = (event: Event): boolean => event.target === options.canvas()
  const wheel = (event: WheelEvent): void => {
    if (!onCanvas(event) || !controls.enabled || !controls.enableZoom || options.canNavigate?.() === false) return
    event.preventDefault(); event.stopPropagation()
    transition = undefined
    const camera = options.camera()
    const f = wheelZoomFactor(event.deltaY, event.deltaMode, controls.zoomSpeed)
    const zoomIn = event.deltaY < 0
    const point = cursorNdc(event)
    if (isOrtho(camera)) {
      const factor = Math.min(controls.maxZoom / camera.zoom, Math.max(controls.minZoom / camera.zoom, zoomIn ? 1 / f : f))
      camera.updateMatrixWorld()
      const result = orthoZoomAboutCursor({
        position: toVec(camera.position), target: toVec(controls.target), basis: basisOf(camera),
        halfWidth: (camera.right - camera.left) / 2, halfHeight: (camera.top - camera.bottom) / 2, zoom: camera.zoom, ndc: [point.x, point.y], factor
      })
      camera.position.set(...result.position); controls.target.set(...result.target); camera.zoom = result.zoom
      camera.updateProjectionMatrix()
    } else {
      const eye = toVec(camera.position), target = toVec(controls.target)
      const distance = camera.position.distanceTo(controls.target)
      const factor = clampDistanceFactor(distance, zoomIn ? f : 1 / f, controls.minDistance, controls.maxDistance)
      const under = options.pick(point, camera)
      let at: Vec3 | undefined = under ? toVec(under) : undefined
      if (!at) {
        // Nothing under the cursor: the point on the plane through the target, square to the view.
        scratchRay.setFromCamera(point, camera)
        const forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]])
        at = intersectRayPlane(toVec(scratchRay.ray.origin), toVec(scratchRay.ray.direction), target, forward)
      }
      if (at) {
        const next = dollyAboutPoint({ position: eye, target }, at, factor)
        camera.position.set(...next.position); controls.target.set(...next.target)
      } else camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target)
    }
    options.invalidate()
  }
  const basisOf = (camera: RigCamera) => {
    const e = camera.matrixWorld.elements
    return { right: [e[0]!, e[1]!, e[2]!] as Vec3, up: [e[4]!, e[5]!, e[6]!] as Vec3, back: [e[8]!, e[9]!, e[10]!] as Vec3 }
  }

  // ---------------------------------------------------------------------------------------------------- orbit pivot
  const down = (event: PointerEvent): void => {
    if (!onCanvas(event)) return
    pointerIsDown = true
    transition = undefined
    pivot = undefined
    if (event.button !== 0 || !controls.enabled || !controls.enableRotate || options.canNavigate?.() === false) return
    const selected = options.selectionCenter?.()
    pivot = selected?.clone() ?? options.pick(cursorNdc(event), options.camera())?.clone()
  }
  const up = (): void => { pointerIsDown = false }

  surface.addEventListener("wheel", wheel, { capture: true, passive: false })
  surface.addEventListener("pointerdown", down, true)
  window.addEventListener("pointerup", up)
  window.addEventListener("pointercancel", up)

  // ---------------------------------------------------------------------------------------------------- frame hooks
  const lastClip = { near: 0, far: 0 }
  const updateClip = (): boolean => {
    const camera = options.camera()
    const sphere = options.sceneSphere()
    if (!sphere) return false
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const clip = adaptiveClip({
      eye: toVec(camera.position), target: toVec(controls.target), center: sphere.center, radius: sphere.radius,
      orthographic: isOrtho(camera), forward: [-e[8]!, -e[9]!, -e[10]!]
    })
    const changed = Math.abs(clip.near - camera.near) > Math.abs(camera.near) * 1e-3 + 1e-9 || Math.abs(clip.far - camera.far) > Math.abs(camera.far) * 1e-3 + 1e-9
    if (!changed) return false
    camera.near = clip.near; camera.far = clip.far
    camera.updateProjectionMatrix()
    lastClip.near = clip.near; lastClip.far = clip.far
    return true
  }

  const beforeUpdate = (now: number): boolean => {
    const camera = options.camera()
    beforeQuaternion = pivot ? camera.quaternion.clone() : undefined
    if (!transition) return false
    const sample = sampleTransition(transition, now)
    applyPose(camera, sample.pose)
    if (sample.done) transition = undefined
    return true
  }
  const afterUpdate = (moved: boolean): boolean => {
    const camera = options.camera()
    let changed = false
    if (pivot) {
      if (beforeQuaternion && moved) {
        const shift = pivotOrbitShift(toVec(pivot), toVec(controls.target), beforeQuaternion.toArray() as unknown as [number, number, number, number], camera.quaternion.toArray() as unknown as [number, number, number, number])
        if (Math.abs(shift[0]) + Math.abs(shift[1]) + Math.abs(shift[2]) > 0) {
          camera.position.set(camera.position.x + shift[0], camera.position.y + shift[1], camera.position.z + shift[2])
          controls.target.set(controls.target.x + shift[0], controls.target.y + shift[1], controls.target.z + shift[2])
          changed = true
        }
      } else if (!pointerIsDown) pivot = undefined
    }
    if (moved || changed || transition || lastClip.far === 0) changed = updateClip() || changed
    return changed
  }

  // ---------------------------------------------------------------------------------------------------- commands
  const snapTo = (direction: Vec3): void => {
    const camera = options.camera()
    const pose = poseOf(camera)
    begin({ ...pose, direction: normalize(direction) })
  }
  const orbitBy = (dAzimuth: number, dPolar: number): void => {
    const camera = options.camera()
    transition = undefined
    const pose = poseOf(camera)
    applyPose(camera, { ...pose, direction: orbitDirection(pose.direction, dAzimuth, dPolar) })
    options.invalidate()
  }
  const fit = (box: THREE.Box3 | undefined, animate = true): void => {
    if (!box || box.isEmpty()) return
    const camera = options.camera()
    const pose = poseOf(camera)
    const bounds = { min: toVec(box.min), max: toVec(box.max) }
    let to: ViewPose
    if (isOrtho(camera)) {
      const aspect = (camera.right - camera.left) / Math.max(camera.top - camera.bottom, 1e-9)
      const half = fitBoxOrthoHalfHeight(bounds, pose.direction, aspect)
      to = { ...pose, target: toVec(box.getCenter(new THREE.Vector3())), zoom: orthoZoomForHalfHeight(camera.top, half) }
    } else {
      const framing = fitBoxPerspective(bounds, pose.direction, camera.fov, camera.aspect)
      to = { ...pose, target: framing.target, distance: framing.distance }
    }
    if (animate) begin(to)
    else { transition = undefined; applyPose(camera, to); options.invalidate() }
  }

  const setFlat = (flat: boolean): void => {
    const camera = options.camera()
    if (isOrtho(camera) || flat === (savedFov !== undefined)) return
    const pose = poseOf(camera)
    transition = undefined
    if (flat) {
      savedFov = camera.fov; savedMax = controls.maxDistance
      const distance = dollyZoomDistance(pose.distance, camera.fov, FLAT_FOV_DEG)
      camera.fov = FLAT_FOV_DEG
      controls.maxDistance = Infinity
      applyPose(camera, { ...pose, distance })
    } else {
      const fov = savedFov!
      const distance = dollyZoomDistance(pose.distance, camera.fov, fov)
      camera.fov = fov
      controls.maxDistance = savedMax ?? controls.maxDistance
      savedFov = undefined; savedMax = undefined
      applyPose(camera, { ...pose, distance })
    }
    camera.updateProjectionMatrix()
    lastClip.far = 0
    options.invalidate()
  }

  return {
    snapTo, orbitBy, fit, flat: () => savedFov !== undefined, setFlat, beforeUpdate, afterUpdate,
    updateClip: () => { updateClip() },
    cancel: () => { transition = undefined; pivot = undefined },
    dispose: () => {
      surface.removeEventListener("wheel", wheel, true)
      surface.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      transition = undefined; pivot = undefined
    }
  }
}

// `cameraBasis` is part of the rig's public vocabulary for hosts that need the frame of an eye direction.
export { cameraBasis }
