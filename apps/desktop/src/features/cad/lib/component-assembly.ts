import * as THREE from "three"
import type { Element } from "../store/elementsStore.ts"
import type { SelectionBounds } from "../store/selectorStore.ts"
import { createThreeObject } from "./createThreeObject.ts"
import { initializeElementTransform, type ElementTransformFields } from "./element-transform.ts"
import { disposeObject } from "./sceneHelpers.ts"

export const componentChildren = (element: Element): Element[] => {
  if (Array.isArray(element.elements)) return element.elements
  if (element.type === "component" || element.type === "group") {
    return element.data?.elements ?? element.data?.geometry?.elements ?? []
  }
  return []
}

export interface ComponentEntry { readonly element: Element; readonly depth: number }
export function componentEntries(elements: readonly Element[], depth = 0): ComponentEntry[] {
  return elements.flatMap((element) => [{ element, depth }, ...componentEntries(componentChildren(element), depth + 1)])
}

/** Clone the entire assembly; no instance or library record shares mutable geometry with another. */
export function cloneComponentElement(element: Element, freshIds = false): Element {
  const copy = structuredClone(element)
  const visit = (node: Element): void => {
    if (freshIds) node.id = crypto.randomUUID()
    delete node.selected
    delete node.originalLibraryItem
    const children = componentChildren(node)
    if (children.length) {
      node.elements = children
      for (const child of children) visit(child)
    }
  }
  visit(copy)
  return copy
}

/** Translate only coordinates in this element's frame; descendants keep their local poses. */
export function translateComponentElement(element: Element, dx: number, dy: number, dz: number): Element {
  const copy = cloneComponentElement(element)
  if (element.type === "line") {
    for (const suffix of ["1", "2"]) {
      copy[`x${suffix}`] = (element[`x${suffix}`] ?? 0) + dx
      copy[`y${suffix}`] = (element[`y${suffix}`] ?? 0) + dy
      copy[`z${suffix}`] = (element[`z${suffix}`] ?? 0) + dz
    }
  } else if (["mesh", "spline", "polyline"].includes(element.type)) {
    const key = element.type === "mesh" ? "vertices" : "points"
    if (Array.isArray(copy[key])) copy[key] = copy[key].map((point: { x: number; y: number; z?: number }) =>
      ({ ...point, x: point.x + dx, y: point.y + dy, z: (point.z ?? 0) + dz }))
  } else {
    copy.x = (element.x ?? 0) + dx
    copy.y = (element.y ?? 0) + dy
    copy.z = (element.z ?? 0) + dz
  }
  return copy
}

/** Bounds use the same geometry and transforms as the viewport, including every nested child. */
export function componentBounds(elements: readonly Element[]): SelectionBounds | null {
  const box = new THREE.Box3()
  for (const element of elements) {
    const copy = cloneComponentElement(element)
    const object = createThreeObject(copy, { x: 0, y: 0, z: 0 })
    if (!object) continue
    try {
      initializeElementTransform(object, copy as ElementTransformFields)
      box.union(new THREE.Box3().setFromObject(object))
    } finally { disposeObject(object) }
  }
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) return null
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
    width: size.x, height: size.y, depth: size.z, centerX: center.x, centerY: center.y, centerZ: center.z }
}

export interface ComponentDetails {
  readonly name: string
  readonly description?: string
  readonly layerId: string
  readonly tags?: string[]
}
export function createComponentAssembly(elements: readonly Element[], details: ComponentDetails): Element {
  const bounds = componentBounds(elements)
  if (!bounds) throw new Error("The selection has no usable geometry.")
  const entries = componentEntries(elements)
  return {
    id: crypto.randomUUID(), type: "component", ...details,
    x: bounds.centerX, y: bounds.centerY, z: bounds.centerZ,
    width: bounds.width, height: bounds.height, depth: bounds.depth,
    elements: elements.map((element) => cloneComponentElement(
      translateComponentElement(element, -bounds.centerX, -bounds.centerY, -bounds.centerZ), true)),
    metadata: { createdAt: new Date().toISOString(), isComposite: true, elementCount: elements.length,
      totalElementCount: entries.length, subcomponentCount: entries.filter(({ element }) => element.type === "component").length,
      elementTypes: [...new Set(entries.map(({ element }) => element.type))], originalElements: elements.map((element) => element.id) }
  }
}

/** One document shape for local and project libraries; the root keeps its own rotation and scale. */
export function componentLibraryDocument(element: Element): Record<string, unknown> {
  const root = translateComponentElement(element, -(element.x ?? 0), -(element.y ?? 0), -(element.z ?? 0))
  return { version: "1.0", name: element.name ?? "Component", type: "composite", elements: [root],
    metadata: { ...element.metadata, savedFrom: "cad-editor", tags: element.tags ?? [] } }
}

/** Read old direct-element records and complete component documents without dropping siblings. */
export function libraryComponentElement(item: Record<string, unknown>): Element | null {
  let data = item.data
  if (typeof data === "string") {
    try { data = JSON.parse(data) } catch { return null }
  }
  if (!data || typeof data !== "object") return null
  const document = data as Record<string, unknown>
  const geometry = document.geometry as { elements?: Element[] } | undefined
  const elements = (Array.isArray(document.elements) && document.elements.length ? document.elements : geometry?.elements) as Element[] | undefined
  // Direct component records already carry their root pose and children.
  if ((document.type === "component" || document.type === "group") && typeof document.x === "number") {
    return cloneComponentElement(document as Element, true)
  }
  if (elements?.length) {
    if (elements.length === 1) return cloneComponentElement(elements[0]!, true)
    return createComponentAssembly(elements, { name: String(item.name ?? document.name ?? "Component"), layerId: "default" })
  }
  if (typeof document.type === "string" && (typeof document.x === "number" || typeof document.x1 === "number" || Array.isArray(document.vertices))) {
    return cloneComponentElement(document as Element, true)
  }
  return null
}
