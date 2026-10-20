import * as THREE from "three"
import { isTauri } from "../app/sidecar.ts"
import { prepareViewportEdges, type ViewportEdgesInput } from "../../src-tauri/guest-js/viewport-geometry.ts"

type PrepareEdges = (input: ViewportEdgesInput) => Promise<Float32Array>
let nativePreparationPending = false

/** Existing small/browser meshes stay synchronous; large desktop meshes use bounded Rust IPC. */
export function createDisplayEdges(
  source: THREE.BufferGeometry,
  thresholdAngle = 1,
  onReady?: () => void,
  prepare: PrepareEdges | undefined = isTauri() ? prepareViewportEdges : undefined,
): THREE.BufferGeometry {
  const positions = source.getAttribute("position")
  const indices = source.getIndex()
  const indexArray = indices?.array
  const positionArray = positions?.array
  const triangles = (indices?.count ?? positions?.count ?? 0) / 3
  if (!prepare || !onReady || nativePreparationPending || triangles < 1024 || triangles > 250_000 ||
      !(positions instanceof THREE.BufferAttribute) || !(positionArray instanceof Float32Array) || positions.itemSize !== 3 || positions.normalized ||
      indices?.normalized || (indexArray !== undefined && !(indexArray instanceof Uint16Array || indexArray instanceof Uint32Array))) {
    return new THREE.EdgesGeometry(source, thresholdAngle)
  }

  const target = new THREE.BufferGeometry()
  // No placeholder attribute: it could acquire a GPU buffer before being replaced.
  const controller = new AbortController()
  const cancel = () => controller.abort()
  target.addEventListener("dispose", cancel)
  source.addEventListener("dispose", cancel)
  const positionVersion = positions.version, indexVersion = indices?.version
  const current = () => !controller.signal.aborted && source.getAttribute("position") === positions &&
    source.getIndex() === indices && positions.version === positionVersion && indices?.version === indexVersion
  const cleanup = () => {
    target.removeEventListener("dispose", cancel)
    source.removeEventListener("dispose", cancel)
  }
  const install = (attribute: THREE.BufferAttribute) => {
    if (!current()) return
    target.setAttribute("position", attribute)
    target.computeBoundingBox()
    target.computeBoundingSphere()
    onReady()
  }
  // The source remains authoritative and is never detached. Disposal invalidates both
  // native success and fallback; a late result cannot recreate a discarded GPU buffer.
  // Admit before packing: a large assembly must not enqueue one binary IPC copy per mesh.
  nativePreparationPending = true
  void (async () => {
    try {
      let endpoints: Float32Array
      try {
        endpoints = await prepare({ positions: positionArray, indices: indexArray, thresholdAngle, signal: controller.signal })
      } catch {
        if (!current()) return
        const fallback = new THREE.EdgesGeometry(source, thresholdAngle)
        const attribute = fallback.getAttribute("position")
        fallback.deleteAttribute("position")
        fallback.dispose()
        if (attribute instanceof THREE.BufferAttribute) install(attribute)
        return
      }
      install(new THREE.BufferAttribute(endpoints, 3))
    } finally {
      cleanup()
      nativePreparationPending = false
    }
  })().catch(() => {
    // A malformed source/callback must not leave an unhandled asynchronous rejection.
    // Native errors already take the same Three.js fallback as browser rendering.
  })
  return target
}
