/**
 * The feed-direction arrows of a toolpath, with its start and end marks: one instanced cone mesh along the cut segments
 * (`direction-markers.ts` decides where), a green ball where the cutting starts and a red one where it ends. The arrows take the
 * colour of the line under them, lightened, so they read in every colour mode. The end mark appears when the playhead gets there.
 */
import * as THREE from "three"
import { defaultDirectionSpacing, directionMarkers, markersUpTo, type DirectionMarkers } from "./direction-markers.ts"
import type { LineBuffer } from "./toolpath-colors.ts"

export interface DirectionArrows {
  readonly object: THREE.Group
  /** Show what has run: the first `segments` cut segments (`Infinity` for all of them). Returns whether anything changed. */
  readonly update: (segments: number) => boolean
}

const UP = new THREE.Vector3(0, 1, 0)
const START_COLOR = 0x22c55e, END_COLOR = 0xef4444, DEFAULT_ARROW = 0xe0f2fe

/** Diagonal of the box around a segment buffer. */
const extentOf = (positions: Float32Array): number => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    const value = positions[i + axis]!
    if (value < min[axis]!) min[axis] = value
    if (value > max[axis]!) max[axis] = value
  }
  return Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!)
}

export const createDirectionArrows = (cut: LineBuffer): DirectionArrows | undefined => {
  const positions = cut.positions
  if (positions.length < 6) return undefined
  const markers: DirectionMarkers = directionMarkers(positions, defaultDirectionSpacing(extentOf(positions)))
  const size = Math.min(8, Math.max(0.5, markers.spacing * 0.38))
  const group = new THREE.Group()
  group.name = "toolpath:direction"
  const total = markers.segments.length
  let mesh: THREE.InstancedMesh | undefined
  if (total > 0) {
    mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), total)
    const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), direction = new THREE.Vector3(), scale = new THREE.Vector3(size, size, size)
    const position = new THREE.Vector3(), color = new THREE.Color(), base = new THREE.Color(DEFAULT_ARROW)
    for (let k = 0; k < total; k++) {
      position.fromArray(markers.positions, k * 3)
      direction.fromArray(markers.directions, k * 3)
      mesh.setMatrixAt(k, matrix.compose(position, turn.setFromUnitVectors(UP, direction), scale))
      const vertex = markers.segments[k]! * 6
      if (cut.colors !== undefined && vertex + 2 < cut.colors.length) color.setRGB(cut.colors[vertex]!, cut.colors[vertex + 1]!, cut.colors[vertex + 2]!).lerp(base, 0.55)
      else color.copy(base)
      mesh.setColorAt(k, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    mesh.raycast = () => undefined
    group.add(mesh)
  }
  const ball = (color: number, at: ArrayLike<number>, offset: number): THREE.Mesh => {
    const mark = new THREE.Mesh(new THREE.SphereGeometry(size * 0.7, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }))
    mark.position.set(at[offset]!, at[offset + 1]!, at[offset + 2]!)
    mark.renderOrder = 22
    mark.raycast = () => undefined
    return mark
  }
  const segmentCount = Math.floor(positions.length / 6)
  const start = ball(START_COLOR, positions, 0)
  const end = ball(END_COLOR, positions, (segmentCount - 1) * 6 + 3)
  group.add(start, end)
  let shown = -1, ended = true, begun = true
  const update = (segments: number): boolean => {
    const count = mesh === undefined ? 0 : markersUpTo(markers, segments)
    const finished = segments >= segmentCount
    const started = segments > 0
    if (count === shown && finished === ended && started === begun) return false
    shown = count; ended = finished; begun = started
    if (mesh !== undefined) mesh.count = count
    end.visible = finished
    start.visible = started
    return true
  }
  update(Infinity)
  return { object: group, update }
}
