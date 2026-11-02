import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"

/**
 * Face and edge picking on an exact solid. A `brep` element is drawn as one mesh per face (`userData.brepFace`) and one pickable line
 * per edge (`userData.brepEdge`), so the hits of a ray already say which face or edge of which body is under the cursor. This module
 * chooses between them, writes their name, and draws the highlight: a translucent copy of the face, a thick copy of the edge, both
 * sharing the geometry already on the GPU.
 */
export type SubEntityKind = "face" | "edge"

export interface SubEntityPick {
  readonly kind: SubEntityKind
  /** Index of the face or edge in the B-rep (`userData.brepFace` / `brepEdge`). */
  readonly index: number
  readonly elementId: string
  /** The piece of the drawing that was hit (a face mesh or an edge line). */
  readonly object: THREE.Object3D
  readonly surface?: string
  readonly name?: string
}

export interface RayHit { readonly object: THREE.Object3D; readonly distance: number }

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
 * the nearest face wins. Anything that is not a face or an edge of a B-rep (a primitive, a control point, a marker) is skipped.
 */
export const pickSubEntity = (hits: ReadonlyArray<RayHit>): SubEntityPick | undefined => {
  const sorted = [...hits].sort((a, b) => a.distance - b.distance)
  const face = sorted.find((hit) => hit.object.userData.brepFace !== undefined)
  const limit = face === undefined ? Infinity : face.distance * (1 + EDGE_DEPTH_SLACK) + EDGE_SLACK_MM
  const edge = sorted.find((hit) => hit.object.userData.brepEdge !== undefined && hit.distance <= limit)
  const hit = edge ?? face
  if (hit === undefined) return undefined
  const elementId = elementIdOf(hit.object)
  if (elementId === undefined) return undefined
  const kind: SubEntityKind = edge !== undefined ? "edge" : "face"
  const index = Number(kind === "edge" ? hit.object.userData.brepEdge : hit.object.userData.brepFace)
  const surface = hit.object.userData.surface as string | undefined
  const name = hit.object.userData.faceName as string | undefined
  return { kind, index, elementId, object: hit.object, ...(surface !== undefined && kind === "face" ? { surface } : {}), ...(name !== undefined && kind === "face" ? { name } : {}) }
}

/** Same entity of the same element (the hover only repaints when this changes). */
export const sameSubEntity = (a: SubEntityPick | undefined, b: SubEntityPick | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.kind === b.kind && a.index === b.index && a.elementId === b.elementId)

/** "Face 7 · top · plane" / "Edge 12", with the face's own name and surface kind; `labels` lets the caller translate the head. */
export const describeSubEntity = (pick: SubEntityPick, labels: { readonly face: (index: number) => string; readonly edge: (index: number) => string } = { face: (index) => `Face ${index}`, edge: (index) => `Edge ${index}` }): string => {
  const head = pick.kind === "face" ? labels.face(pick.index) : labels.edge(pick.index)
  const tail = [pick.name, pick.surface].filter((part): part is string => typeof part === "string" && part !== "")
  return tail.length === 0 ? head : `${head} · ${tail.join(" · ")}`
}

export const SUB_COLORS = { hover: 0x00e5ff, picked: 0xffab00 } as const
export type SubHighlightKind = keyof typeof SUB_COLORS

/**
 * The highlight of a pick, to add to the scene. It is a world-space copy placed with the piece's current world matrix and shares its
 * geometry, so freeing it frees only what it made (`disposeSubHighlight`). A rebuilt or moved part makes it stale: the canvas drops it then.
 */
export const createSubHighlight = (pick: SubEntityPick, kind: SubHighlightKind): THREE.Object3D => {
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

/** Removes a highlight and frees its material; the geometry belongs to the part. */
export const disposeSubHighlight = (overlay: THREE.Object3D | undefined): void => {
  if (overlay === undefined) return
  overlay.removeFromParent()
  ;((overlay as THREE.Mesh).material as THREE.Material | undefined)?.dispose()
}
