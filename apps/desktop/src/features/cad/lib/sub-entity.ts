import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"

/**
 * Face, edge and vertex picking on an exact solid. A `brep` element is drawn as one mesh per face (`userData.brepFace`) and one pickable
 * line per edge (`userData.brepEdge`), so the hits of a ray already say which face or edge of which body is under the cursor. The corners
 * are not drawn: the element group carries them as `userData.brepVertices` (scene-space xyz triples, the vertex index is the triple's
 * index) and the ray is measured against them. This module chooses between the three with the snapping priority vertex > edge > face,
 * writes their name, and draws the highlight: a translucent copy of the face, a thick copy of the edge (both sharing the geometry already
 * on the GPU) or a dot on the corner.
 */
export type SubEntityKind = "face" | "edge" | "vertex"

export interface SubEntityPick {
  readonly kind: SubEntityKind
  /** Index of the face or edge in the B-rep (`userData.brepFace` / `brepEdge`). */
  readonly index: number
  readonly elementId: string
  /** The piece of the drawing that was hit (a face mesh or an edge line). */
  readonly object: THREE.Object3D
  readonly surface?: string
  readonly name?: string
  /** A vertex only: where the corner is in model coordinates (the drawing's origin offset removed) and in the scene. */
  readonly coords?: { readonly x: number; readonly y: number; readonly z: number }
  readonly world?: { readonly x: number; readonly y: number; readonly z: number }
}

export interface RayHit { readonly object: THREE.Object3D; readonly distance: number }

/** What `pickSubEntity` needs to see the corners: the cast ray, and how far (world units) a corner may be from it at a given distance. */
export interface VertexPicking {
  readonly ray: THREE.Ray
  readonly radiusAt: (distance: number) => number
}

/** A corner is picked within this many screen pixels of the cursor (an edge line is picked within about half of it). */
export const VERTEX_PICK_PIXELS = 9

/**
 * The world size of `pixels` screen pixels at `distance` in front of the camera, for a camera `viewportHeight` pixels tall:
 * the frustum height at that distance over the viewport height, times the pixels.
 */
export const pixelRadiusAt = (camera: THREE.Camera, viewportHeight: number, pixels = VERTEX_PICK_PIXELS): ((distance: number) => number) => {
  const perspective = camera as THREE.PerspectiveCamera
  const orthographic = camera as THREE.OrthographicCamera
  if (perspective.isPerspectiveCamera === true) {
    const perPixel = (2 * Math.tan((perspective.fov * Math.PI) / 360)) / Math.max(1, viewportHeight)
    return (distance) => pixels * perPixel * Math.max(distance, 0) / Math.max(perspective.zoom, 1e-9)
  }
  if (orthographic.isOrthographicCamera === true) {
    const perPixel = (orthographic.top - orthographic.bottom) / Math.max(1, viewportHeight) / Math.max(orthographic.zoom, 1e-9)
    return () => pixels * perPixel
  }
  return () => 0
}

/** The B-rep group an object belongs to (the one that carries `brepVertices`), if any. */
const brepGroupOf = (object: THREE.Object3D): THREE.Object3D | undefined => {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) if (current.userData.brepVertices !== undefined) return current
  return undefined
}

/** One corner of a drawn B-rep in world space. */
export const brepVertexWorld = (group: THREE.Object3D, index: number): THREE.Vector3 | undefined => {
  const vertices = group.userData.brepVertices as Float32Array | undefined
  if (vertices === undefined || index < 0 || index * 3 + 2 >= vertices.length) return undefined
  return new THREE.Vector3(vertices[index * 3]!, vertices[index * 3 + 1]!, vertices[index * 3 + 2]!).applyMatrix4(group.matrixWorld)
}

/**
 * The corner nearest to the ray among those no farther than `limit` along it (a corner behind the visible surface is not under the
 * cursor) and within `radiusAt(distance)` of the ray. `undefined` when none qualifies.
 */
export const nearestVertexToRay = (group: THREE.Object3D, picking: VertexPicking, limit: number): { readonly index: number; readonly world: THREE.Vector3; readonly distance: number } | undefined => {
  const vertices = group.userData.brepVertices as Float32Array | undefined
  if (vertices === undefined) return undefined
  group.updateWorldMatrix(true, false)
  const { ray } = picking
  const point = new THREE.Vector3()
  let best: { index: number; world: THREE.Vector3; distance: number; miss: number } | undefined
  for (let index = 0; index * 3 + 2 < vertices.length; index++) {
    point.set(vertices[index * 3]!, vertices[index * 3 + 1]!, vertices[index * 3 + 2]!).applyMatrix4(group.matrixWorld)
    const along = point.clone().sub(ray.origin).dot(ray.direction)
    if (along <= 0 || along > limit) continue
    const miss = ray.distanceToPoint(point)
    if (miss > picking.radiusAt(along)) continue
    if (best === undefined || miss < best.miss) best = { index, world: point.clone(), distance: along, miss }
  }
  return best === undefined ? undefined : { index: best.index, world: best.world, distance: best.distance }
}

const elementIdOf = (object: THREE.Object3D): string | undefined => {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    const id = current.userData.elementId as string | undefined
    if (id) return id
  }
  return undefined
}

/** An edge counts as hit when it is not behind the face in front of it by more than this fraction of the distance (plus `EDGE_SLACK_MM`). */
export const EDGE_DEPTH_SLACK = 0.004
export const EDGE_SLACK_MM = 0.05

/**
 * The face or edge under the ray. `hits` are the ray's intersections, nearest first. An edge wins over the face it bounds when the
 * edge line was hit and lies on the visible side of the nearest face (an edge behind a wall is not under the cursor); otherwise
 * the nearest face wins. With `vertices` (the cast ray and the pixel tolerance) a corner of the body near the cursor wins over both:
 * vertex > edge > face. Anything that is not a face or an edge of a B-rep (a primitive, a control point, a marker) is skipped.
 */
export const pickSubEntity = (hits: ReadonlyArray<RayHit>, vertices?: VertexPicking): SubEntityPick | undefined => {
  const sorted = [...hits].sort((a, b) => a.distance - b.distance)
  const face = sorted.find((hit) => hit.object.userData.brepFace !== undefined)
  const limit = face === undefined ? Infinity : face.distance * (1 + EDGE_DEPTH_SLACK) + EDGE_SLACK_MM
  const edge = sorted.find((hit) => hit.object.userData.brepEdge !== undefined && hit.distance <= limit)
  if (vertices !== undefined) {
    const nearest = edge ?? face
    const group = nearest === undefined ? undefined : brepGroupOf(nearest.object)
    const owner = nearest === undefined ? undefined : elementIdOf(nearest.object)
    if (nearest !== undefined && group !== undefined && owner !== undefined) {
      // A corner lies on the surface that is drawn: it may be as deep as that surface plus the slack an edge is given and the pick radius.
      const reach = nearest.distance * (1 + EDGE_DEPTH_SLACK) + EDGE_SLACK_MM + vertices.radiusAt(nearest.distance)
      const corner = nearestVertexToRay(group, vertices, reach)
      if (corner !== undefined) {
        const offset = (group.userData.brepOffset ?? { x: 0, y: 0, z: 0 }) as { x: number; y: number; z: number }
        return { kind: "vertex", index: corner.index, elementId: owner, object: group, world: { x: corner.world.x, y: corner.world.y, z: corner.world.z },
          coords: { x: corner.world.x - offset.x, y: corner.world.y - offset.y, z: corner.world.z - offset.z } }
      }
    }
  }
  const hit = edge ?? face
  if (hit === undefined) return undefined
  const elementId = elementIdOf(hit.object)
  if (elementId === undefined) return undefined
  const kind: "face" | "edge" = edge !== undefined ? "edge" : "face"
  const index = Number(kind === "edge" ? hit.object.userData.brepEdge : hit.object.userData.brepFace)
  const surface = hit.object.userData.surface as string | undefined
  const name = hit.object.userData.faceName as string | undefined
  return { kind, index, elementId, object: hit.object, ...(surface !== undefined && kind === "face" ? { surface } : {}), ...(name !== undefined && kind === "face" ? { name } : {}) }
}

/** Same entity of the same element (the hover only repaints when this changes). */
export const sameSubEntity = (a: SubEntityPick | undefined, b: SubEntityPick | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.kind === b.kind && a.index === b.index && a.elementId === b.elementId)

const coordText = (value: number): string => String(Number((Math.abs(value) < 5e-5 ? 0 : value).toFixed(2)))

/** The corner's model coordinates as text: "X 10 Y 0 Z 25". */
export const describeVertexCoords = (coords: { readonly x: number; readonly y: number; readonly z: number }): string =>
  `X ${coordText(coords.x)} Y ${coordText(coords.y)} Z ${coordText(coords.z)}`

/** "Face 7 · top · plane" / "Edge 12" / "Vertex 3 · X 10 Y 0 Z 25", with the face's own name and surface kind; `labels` lets the caller translate the head. */
export const describeSubEntity = (pick: Pick<SubEntityPick, "kind" | "index" | "name" | "surface" | "coords">, labels: { readonly face: (index: number) => string; readonly edge: (index: number) => string; readonly vertex?: (index: number) => string } = { face: (index) => `Face ${index}`, edge: (index) => `Edge ${index}` }): string => {
  const head = pick.kind === "face" ? labels.face(pick.index) : pick.kind === "edge" ? labels.edge(pick.index) : (labels.vertex ?? ((index: number) => `Vertex ${index}`))(pick.index)
  const tail = pick.kind === "vertex"
    ? (pick.coords === undefined ? [] : [describeVertexCoords(pick.coords)])
    : [pick.name, pick.surface].filter((part): part is string => typeof part === "string" && part !== "")
  return tail.length === 0 ? head : `${head} · ${tail.join(" · ")}`
}

export const SUB_COLORS = { hover: 0x00e5ff, picked: 0xffab00 } as const
export type SubHighlightKind = keyof typeof SUB_COLORS

/**
 * The highlight of a pick, to add to the scene. It is a world-space copy placed with the piece's current world matrix and shares its
 * geometry, so freeing it frees only what it made (`disposeSubHighlight`). A rebuilt or moved part makes it stale: the canvas drops it then.
 */
export const createSubHighlight = (pick: SubEntityPick, kind: SubHighlightKind): THREE.Object3D => {
  if (pick.kind === "vertex") {
    // A dot on the corner, in world space. Its one-point geometry is the highlight's own, so disposing the highlight frees it.
    const geometry = new THREE.BufferGeometry()
    const at = pick.world ?? { x: 0, y: 0, z: 0 }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([at.x, at.y, at.z], 3))
    const dot = new THREE.Points(geometry, new THREE.PointsMaterial({ color: SUB_COLORS[kind], size: kind === "picked" ? 12 : 10, sizeAttenuation: false, depthTest: false, transparent: true }))
    dot.matrixAutoUpdate = false
    dot.renderOrder = 9
    dot.frustumCulled = false
    dot.raycast = () => undefined
    dot.userData.isSubHighlight = true
    dot.userData.ownsGeometry = true
    return dot
  }
  const source = pick.object
  source.updateWorldMatrix(true, false)
  let overlay: THREE.Object3D
  if ((source as { isLineSegments2?: boolean }).isLineSegments2 === true) {
    const material = new LineMaterial({ color: SUB_COLORS[kind], linewidth: 4, transparent: false })
    overlay = new LineSegments2((source as LineSegments2).geometry, material)
  } else if ((source as { isLineSegments?: boolean }).isLineSegments === true || (source as { isLine?: boolean }).isLine === true) {
    overlay = new THREE.LineSegments((source as THREE.LineSegments).geometry, new THREE.LineBasicMaterial({ color: SUB_COLORS[kind] }))
  } else {
    overlay = new THREE.Mesh((source as THREE.Mesh).geometry, new THREE.MeshBasicMaterial({
      color: SUB_COLORS[kind], transparent: true, opacity: kind === "picked" ? 0.55 : 0.4, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }))
  }
  overlay.matrixAutoUpdate = false
  overlay.matrix.copy(source.matrixWorld)
  overlay.matrixWorldNeedsUpdate = true
  overlay.renderOrder = 8
  overlay.raycast = () => undefined
  overlay.userData.isSubHighlight = true
  return overlay
}

/** Removes a highlight and frees its material; the geometry belongs to the part, except a corner dot's own one-point geometry. */
export const disposeSubHighlight = (overlay: THREE.Object3D | undefined): void => {
  if (overlay === undefined) return
  overlay.removeFromParent()
  ;((overlay as THREE.Mesh).material as THREE.Material | undefined)?.dispose()
  if (overlay.userData.ownsGeometry === true) ((overlay as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose()
}
