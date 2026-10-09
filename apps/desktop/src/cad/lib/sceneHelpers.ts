import * as THREE from "three"
import { CSG } from "three-csg-ts"
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js"
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { useCADStore } from "../store/cadStore.ts"
import { HISTORY_LIMIT, useElementsStore, type Element } from "../store/elementsStore.ts"
import { createThreeObject } from "./createThreeObject.ts"

export const HOVER_COLOR = 0x4a90e2
export const SELECTED_COLOR = 0xff3366

/** The X/Y/Z axis lines with their letter sprites. Child order matters: 0 = X, 1 = Y, 2 = Z (2D mode hides Z). */
export function createCustomAxes(size: number): THREE.Group {
  const line = (points: number[], color: number) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3))
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }))
  }
  const label = (text: string, position: [number, number, number], color: THREE.Color): THREE.Sprite | null => {
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d")
    if (!context) return null
    context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`
    context.font = "Bold 48px Arial"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(text, 32, 32)
    const texture = new THREE.CanvasTexture(canvas)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))
    sprite.position.set(...position)
    sprite.scale.set(2, 2, 2)
    return sprite
  }

  const group = new THREE.Group()
  group.add(line([-size * 2, 0, 0, size * 2, 0, 0], 0x0000ff))
  group.add(line([0, -size * 2, 0, 0, size * 2, 0], 0xff00ff))
  group.add(line([0, 0, -size * 2, 0, 0, size * 2], 0x00ff7f))
  for (const sprite of [
    label("X", [size + 1, 0, 0], new THREE.Color(0, 0, 1)),
    label("Y", [0, size + 1, 0], new THREE.Color(1, 0, 1)),
    label("Z", [0, 0, size + 1], new THREE.Color(0, 1, 0.5))
  ]) if (sprite) group.add(sprite)
  group.userData.isCustomAxes = true
  return group
}

export function createOriginIndicator(): THREE.Group {
  const group = new THREE.Group()
  group.userData.isOriginIndicator = true
  group.add(new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })))
  return group
}

/** Dolly the camera so the objects fill the view, keeping the current viewing direction. */
export function fitCameraToObjects(camera: THREE.PerspectiveCamera, target: THREE.Vector3, objects: readonly THREE.Object3D[]): THREE.Vector3 | null {
  if (objects.length === 0) return null
  const box = new THREE.Box3()
  for (const object of objects) box.union(new THREE.Box3().setFromObject(object))
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  const distance = Math.abs(maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)))
  const direction = camera.position.clone().sub(target).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance * 1.25)))
  camera.lookAt(center)
  return center
}

type Material = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; wireframe?: boolean }
export type HighlightState = "none" | "hover" | "selected"

const materialsOf = (object: THREE.Object3D): Material[] => {
  const material = (object as THREE.Mesh).material as Material | Material[] | undefined
  return material ? (Array.isArray(material) ? material : [material]) : []
}

/** Tints an element's object for hover/selection, remembering the original look so it can be restored. */
export function applyHighlight(root: THREE.Object3D, state: HighlightState): void {
  root.traverse((object) => {
    if (object.userData.isControlPoint) return
    for (const material of materialsOf(object)) {
      const base = (material.userData.highlightBase ??= {
        color: material.color?.getHex(),
        emissive: material.emissive?.getHex(),
        emissiveIntensity: material.emissiveIntensity
      }) as { color?: number; emissive?: number; emissiveIntensity?: number }
      const tint = state === "selected" ? SELECTED_COLOR : state === "hover" ? HOVER_COLOR : undefined
      const intensity = state === "selected" ? 0.5 : 0.3
      const lit = material.emissive !== undefined && !material.wireframe && !(object instanceof THREE.Line)
      if (tint === undefined) {
        if (base.color !== undefined) material.color?.setHex(base.color)
        if (base.emissive !== undefined) material.emissive?.setHex(base.emissive)
        if (base.emissiveIntensity !== undefined) material.emissiveIntensity = base.emissiveIntensity
      } else if (lit) {
        material.emissive!.setHex(tint)
        material.emissiveIntensity = intensity
      } else if (material.color) material.color.setHex(tint)
    }
  })
}

/** Per-element transform fields written by the gizmo; the factory output is moved/rotated/scaled around the element centre. */
export interface ElementTransformFields {
  /** Euler angles in degrees (the property panel's "Rotation" vector). */
  readonly rotation?: { x?: number; y?: number; z?: number }
  readonly scale?: { x?: number; y?: number; z?: number }
  readonly translateX?: number
  readonly translateY?: number
  readonly translateZ?: number
  /** Where the element sits; the factory bakes these into `object.position`. */
  readonly x?: number
  readonly y?: number
  readonly z?: number
}

export const premultiplyObject = (object: THREE.Object3D, matrix: THREE.Matrix4): void => {
  object.updateMatrix()
  object.matrix.premultiply(matrix)
  object.matrix.decompose(object.position, object.quaternion, object.scale)
  object.updateMatrixWorld(true)
}

const IDENTITY_QUATERNION = new THREE.Quaternion()

const rotationOf = (element: ElementTransformFields) => new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(element.rotation?.x ?? 0), THREE.MathUtils.degToRad(element.rotation?.y ?? 0), THREE.MathUtils.degToRad(element.rotation?.z ?? 0)
))

/** The element x / y / z a factory object was built at, kept so a move can be applied as a delta. */
interface Placement {
  readonly x: number
  readonly y: number
  readonly z: number
}

const placementOf = (element: ElementTransformFields): Placement => ({
  x: Number(element.x) || 0,
  y: Number(element.y) || 0,
  z: Number(element.z) || 0,
})

/**
 * Re-applies an element's placement and gizmo transform to an object whose geometry is unchanged.
 *
 * The factory bakes `x` / `y` / `z` into `object.position` and leaves the rest to the gizmo matrix,
 * so both are replayed here from the pose the factory produced: the x / y / z delta as a
 * translation, the gizmo fields as a matrix about the centre. Without this the canvas would have to
 * rebuild the geometry to move a part, which on a large assembly means rebuilding all of it.
 *
 * `userData.pivot` ends up holding the centre in world space, which is what the gizmo attaches to.
 */
export function applyElementTransform(object: THREE.Object3D, element: ElementTransformFields): void {
  const base = object.userData.baseMatrix as THREE.Matrix4 | undefined
  const localPivot = object.userData.localPivot as THREE.Vector3 | undefined
  const placedAt = object.userData.placedAt as Placement | undefined
  if (!base || !localPivot || !placedAt) return

  // Back to the factory pose first, so the transform below is applied from scratch and never compounds.
  object.matrix.copy(base)
  object.matrix.decompose(object.position, object.quaternion, object.scale)

  const at = placementOf(element)
  object.position.set(
    object.position.x + at.x - placedAt.x,
    object.position.y + at.y - placedAt.y,
    object.position.z + at.z - placedAt.z
  )

  const translate = new THREE.Vector3(element.translateX ?? 0, element.translateY ?? 0, element.translateZ ?? 0)
  const scale = new THREE.Vector3(element.scale?.x ?? 1, element.scale?.y ?? 1, element.scale?.z ?? 1)
  const rotation = rotationOf(element)
  const moved = translate.lengthSq() > 0 || scale.x !== 1 || scale.y !== 1 || scale.z !== 1 || !rotation.equals(IDENTITY_QUATERNION)

  const pivot = localPivot.clone()
  if (moved) {
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x + translate.x, pivot.y + translate.y, pivot.z + translate.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
      .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    premultiplyObject(object, matrix)
    pivot.add(translate)
  } else {
    object.updateMatrix()
    object.updateMatrixWorld(true)
  }
  object.userData.pivot = pivot
}

/** Builds the Three object of an element; `userData.pivot` is its centre in world space. */
export function buildElementObject(element: Element): THREE.Object3D | null {
  const object = createThreeObject(element)
  if (!object) return null
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  object.updateMatrix()
  // The pose the factory produced: the baseline every later placement update is measured from.
  object.userData.baseMatrix = object.matrix.clone()
  object.userData.localPivot = box.isEmpty() ? object.position.clone() : box.getCenter(new THREE.Vector3())
  object.userData.placedAt = placementOf(element as ElementTransformFields)
  object.userData.isCADElement = true
  object.userData.elementId = element.id
  applyElementTransform(object, element as ElementTransformFields)
  object.traverse((child) => {
    if (child !== object) {
      child.userData.isCADElement = true
      child.userData.elementId = element.id
      child.userData.isChild = true
    }
  })
  return object
}

/**
 * Frees the GPU memory of an object and of everything under it, and detaches it from its parent.
 *
 * A factory object owns its geometry *and* its material (one `MeshStandardMaterial` per element), so
 * dropping only the geometry leaks a shader object per element per rebuild — which is what makes a
 * long editing session get slower and slower rather than merely slower.
 */
export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) materials.add(entry)
  })
  for (const material of materials) {
    // Texture slots (including sprite maps) are independent WebGL allocations.
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform.value instanceof THREE.Texture) textures.add(uniform.value)
        else if (Array.isArray(uniform.value)) for (const value of uniform.value) if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  }
  for (const texture of textures) texture.dispose()
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  root.removeFromParent()
}

export interface DragStart {
  readonly pivotMatrix: THREE.Matrix4
  readonly items: ReadonlyArray<{ readonly id: string; readonly object: THREE.Object3D; readonly matrix: THREE.Matrix4; readonly center: THREE.Vector3 }>
}

/** `delta` = the gizmo pivot's current matrix relative to where the drag started. */
export const deltaFrom = (start: DragStart, pivot: THREE.Object3D): THREE.Matrix4 => {
  pivot.updateMatrix()
  return pivot.matrix.clone().multiply(start.pivotMatrix.clone().invert())
}

export function applyDragDelta(start: DragStart, delta: THREE.Matrix4): void {
  for (const item of start.items) {
    item.object.matrix.copy(item.matrix).premultiply(delta)
    item.object.matrix.decompose(item.object.position, item.object.quaternion, item.object.scale)
    item.object.updateMatrixWorld(true)
  }
}

const hasPoint = (element: Element) => ("x" in element && "y" in element) || ("x1" in element && "x2" in element)

/** Writes a finished gizmo drag back to the elements as one history step. */
export function commitDrag(start: DragStart, delta: THREE.Matrix4): void {
  const deltaPosition = new THREE.Vector3()
  const deltaQuaternion = new THREE.Quaternion()
  const deltaScale = new THREE.Vector3()
  delta.decompose(deltaPosition, deltaQuaternion, deltaScale)
  const changes = new Map<string, Partial<Element>>()
  const store = useElementsStore.getState()
  for (const item of start.items) {
    const element = store.elements.find((candidate) => candidate.id === item.id)
    if (!element) continue
    const moved = item.center.clone().applyMatrix4(delta)
    const move = moved.sub(item.center)
    const update: Record<string, number> = {}
    let rotation: { x: number; y: number; z: number } | undefined
    let scale: { x: number; y: number; z: number } | undefined
    const fields = element as ElementTransformFields
    if (hasPoint(element)) {
      if ("x" in element) { update.x = element.x + move.x; update.y = element.y + move.y; update.z = (element.z ?? 0) + move.z }
      else {
        update.x1 = element.x1 + move.x; update.y1 = element.y1 + move.y; update.z1 = (element.z1 ?? 0) + move.z
        update.x2 = element.x2 + move.x; update.y2 = element.y2 + move.y; update.z2 = (element.z2 ?? 0) + move.z
      }
    } else {
      update.translateX = (fields.translateX ?? 0) + move.x
      update.translateY = (fields.translateY ?? 0) + move.y
      update.translateZ = (fields.translateZ ?? 0) + move.z
    }
    if (Math.abs(deltaQuaternion.w) < 0.999999) {
      const accumulated = deltaQuaternion.clone().multiply(rotationOf(fields))
      const euler = new THREE.Euler().setFromQuaternion(accumulated, "XYZ")
      rotation = { x: THREE.MathUtils.radToDeg(euler.x), y: THREE.MathUtils.radToDeg(euler.y), z: THREE.MathUtils.radToDeg(euler.z) }
    }
    if (Math.abs(deltaScale.x - 1) > 1e-6 || Math.abs(deltaScale.y - 1) > 1e-6 || Math.abs(deltaScale.z - 1) > 1e-6) {
      scale = { x: (fields.scale?.x ?? 1) * deltaScale.x, y: (fields.scale?.y ?? 1) * deltaScale.y, z: (fields.scale?.z ?? 1) * deltaScale.z }
    }
    changes.set(item.id, { ...update, ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) } as Partial<Element>)
  }
  if (changes.size === 0) return
  // A finished gizmo drag is one history step (the same rule `updateElement` follows while `isEditing`).
  useElementsStore.getState().endEdit()
  useElementsStore.setState((state) => {
    const elements = state.elements.map((element) => (changes.has(element.id) ? { ...element, ...changes.get(element.id)! } : element))
    const history = state.history.slice(0, state.currentHistoryIndex + 1)
    history.push(elements)
    // Keep the bounded length of the undo stack: a drawing can be edited for hours.
    const kept = history.length > HISTORY_LIMIT ? history.slice(history.length - HISTORY_LIMIT) : history
    const selected = state.selectedElement ? elements.find((element) => element.id === state.selectedElement!.id) ?? null : null
    return { elements, selectedElement: selected, history: kept, currentHistoryIndex: kept.length - 1 }
  })
}

export type BooleanOperation = "union" | "subtract" | "intersect"

const firstMesh = (object: THREE.Object3D): THREE.Mesh | undefined => {
  let found: THREE.Mesh | undefined
  object.traverse((child) => { if (!found && child instanceof THREE.Mesh) found = child })
  return found
}

/**
 * CSG over the given scene objects (first one is the base for subtract). The result is returned as a `mesh` element
 * (vertices/faces in element space) so it is selectable, transformable and saved like any other element.
 */
export function booleanElement(operation: BooleanOperation, objects: readonly THREE.Object3D[], layerId: string): Omit<Element, "id"> | null {
  const meshes = objects.map(firstMesh).filter((mesh): mesh is THREE.Mesh => mesh !== undefined)
  if (meshes.length < 2) return null
  for (const mesh of meshes) { mesh.updateMatrixWorld(true); mesh.matrix.copy(mesh.matrixWorld) }
  const [base, ...rest] = meshes as [THREE.Mesh, ...THREE.Mesh[]]
  let result: THREE.Mesh = base
  for (const operand of rest) {
    result = operation === "union" ? CSG.union(result, operand) : operation === "subtract" ? CSG.subtract(result, operand) : CSG.intersect(result, operand)
  }
  result.updateMatrix()
  const geometry = result.geometry.clone().applyMatrix4(result.matrix)
  const position = geometry.getAttribute("position")
  if (!position || position.count === 0) return null
  const { originOffset } = useCADStore.getState()
  const vertices = Array.from({ length: position.count }, (_, i) => ({
    x: position.getX(i) - originOffset.x, y: position.getY(i) - originOffset.y, z: position.getZ(i) - originOffset.z
  }))
  const index = geometry.getIndex()
  const faces: number[][] = []
  if (index) for (let i = 0; i + 2 < index.count; i += 3) faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)])
  else for (let i = 0; i + 2 < position.count; i += 3) faces.push([i, i + 1, i + 2])
  const material = (base.material as Material | Material[])
  const color = (Array.isArray(material) ? material[0] : material)?.color?.getHex()
  return { type: "mesh", name: `Boolean ${operation}`, layerId, vertices, faces, color: color ?? 0x4285f4 }
}

const download = (blob: Blob, filename: string) => {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

/** The scene without helpers, gizmos or control points. */
const exportableScene = (scene: THREE.Scene): THREE.Scene => {
  const exported = new THREE.Scene()
  for (const child of scene.children) if (child.userData.isCADElement && child.visible) exported.add(child.clone())
  return exported
}

export const exportSTL = (scene: THREE.Scene): void => {
  download(new Blob([new STLExporter().parse(exportableScene(scene)) as BlobPart], { type: "application/octet-stream" }), "model.stl")
}

export const exportOBJ = (scene: THREE.Scene): void => {
  download(new Blob([new OBJExporter().parse(exportableScene(scene))], { type: "text/plain" }), "model.obj")
}

export const exportGLTF = (scene: THREE.Scene): Promise<void> =>
  new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      exportableScene(scene),
      (result) => {
        const body = result instanceof ArrayBuffer ? result : JSON.stringify(result)
        download(new Blob([body], { type: result instanceof ArrayBuffer ? "model/gltf-binary" : "model/gltf+json" }), result instanceof ArrayBuffer ? "model.glb" : "model.gltf")
        resolve()
      },
      reject,
      { binary: true }
    )
  })

/**
 * Whether the canvas draws an element: it is hidden by its own `visible: false`, or by a layer that exists and is hidden. An
 * element whose layer is not in the list (a drawing saved elsewhere, a layer name the assistant gave) is drawn, never lost.
 */
export const isDrawn = (element: { readonly layerId: string; readonly visible?: boolean | undefined }, layers: ReadonlyArray<{ readonly id: string; readonly visible: boolean }>): boolean => {
  if (element.visible === false) return false
  const layer = layers.find((candidate) => candidate.id === element.layerId)
  return layer === undefined || layer.visible
}
