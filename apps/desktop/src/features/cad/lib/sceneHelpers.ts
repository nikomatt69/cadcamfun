import { downloadFile } from "../../../shared/lib/save-file.ts"
import * as THREE from "three"
import { CSG } from "three-csg-ts"
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js"
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { useCADStore } from "../store/cadStore.ts"
import { HISTORY_LIMIT, useElementsStore, type Element } from "../store/elementsStore.ts"
import { GRID_COLORS } from "../../../viewport/adaptive-grid.ts"
import { createThreeObject } from "./createThreeObject.ts"
import { initializeElementTransform, premultiplyObject, rotationOf, type ElementTransformFields } from "./element-transform.ts"

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
  group.add(line([-size * 2, 0, 0, size * 2, 0, 0], GRID_COLORS.axisX))
  group.add(line([0, -size * 2, 0, 0, size * 2, 0], GRID_COLORS.axisY))
  group.add(line([0, 0, -size * 2, 0, 0, size * 2], GRID_COLORS.axisZ))
  for (const sprite of [
    label("X", [size + 1, 0, 0], new THREE.Color(GRID_COLORS.axisX)),
    label("Y", [0, size + 1, 0], new THREE.Color(GRID_COLORS.axisY)),
    label("Z", [0, 0, size + 1], new THREE.Color(GRID_COLORS.axisZ))
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
  // Frame the bounding sphere, not the longest side: from a corner direction the eye would otherwise sit inside a cube.
  const radius = Math.max(size.length() / 2, 0.001)
  const distance = radius / Math.sin(Math.min(camera.fov, camera.fov * Math.min(1, camera.aspect)) * Math.PI / 360)
  const direction = camera.position.clone().sub(target).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance * 1.1)))
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
      // A hint of the tint, not a wash: the outline says what is selected, the part keeps the colour it was given.
      const intensity = state === "selected" ? 0.2 : 0.12
      const lit = material.emissive !== undefined && !material.wireframe && !(object instanceof THREE.Line)
      if (tint === undefined) {
        if (base.color !== undefined) material.color?.setHex(base.color)
        if (base.emissive !== undefined) material.emissive?.setHex(base.emissive)
        if (base.emissiveIntensity !== undefined) material.emissiveIntensity = base.emissiveIntensity
      } else if (lit) {
        // The part's own colour glows a little: it brightens without changing hue; the outline carries the selection colour.
        if (base.color !== undefined) material.emissive!.setHex(base.color); else material.emissive!.setHex(tint)
        material.emissiveIntensity = intensity
      } else if (material.color) material.color.setHex(tint)
    }
  })
}

export { applyElementTransform, type ElementTransformFields } from "./element-transform.ts"

/** Builds the Three object of an element; `userData.pivot` is its centre in world space. */
export function buildElementObject(element: Element, onEdgesReady?: () => void): THREE.Object3D | null {
  const object = createThreeObject(element, undefined, onEdgesReady)
  if (!object) return null
  initializeElementTransform(object, element as ElementTransformFields)
  object.userData.isCADElement = true
  object.userData.elementId = element.id
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
  downloadFile({ name: filename, data: blob })
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
