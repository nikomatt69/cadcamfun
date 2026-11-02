import { elementBrep, rebuild, type History } from "@cadcamfun/core"
import * as THREE from "three"

/**
 * An element the canvas cannot draw (a history that builds no body, a B-rep without faces, a type with no builder, data that
 * is not geometry) must not vanish: a blank canvas tells the person nothing. It is drawn as a red marker at its position,
 * selectable like any element, and `userData.invalidReason` carries the kernel's own words for the banner.
 */
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** Why the element has no geometry, in the kernel's words where it has any. */
export const invalidReason = (element: Record<string, unknown>): string => {
  const type = String(element.type ?? "")
  try {
    if (type === "parametric") {
      const history = element.history as History | undefined
      if (history === undefined || typeof history !== "object" || !Array.isArray(history.features)) return "the parametric element has no feature history"
      const built = rebuild(history)
      const failed = built.issues.find((issue) => issue.severity === "error")
      if (failed !== undefined) return `${failed.feature}: ${failed.message}`
      if (built.bodies.length === 0) return "the history builds no body (it has no closed profile that is extruded, revolved, swept or lofted)"
      return "the bodies of the history could not be united into one solid"
    }
    if (type === "brep") {
      const exact = elementBrep(element)
      return exact.brep === undefined ? exact.reason : "the B-rep has no faces that can be drawn"
    }
    if (type.startsWith("boolean-")) {
      const operands = Array.isArray(element.operands) ? element.operands : []
      return operands.length < 2 ? "a Boolean needs two operands" : "the Boolean could not be formed from its operands (an operand is not a solid, or is missing)"
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return type === "" ? "the element has no type" : `the element of type '${type}' has no drawable geometry (the type is unknown, or its data is missing or invalid)`
}

/** The size of the marker: the element's own extent when it states one, else 10 mm. */
const markerSize = (element: Record<string, unknown>): number => {
  const sizes = [element.width, element.height, element.depth, element.length, finite(element.radius) ? element.radius * 2 : undefined, element.size].filter((value): value is number => finite(value) && value > 0)
  return sizes.length === 0 ? 10 : Math.min(200, Math.max(4, ...sizes))
}

export const INVALID_COLOR = 0xe53935

/** A translucent red box with a cross through it, at the element's position. */
export const createInvalidMarker = (element: Record<string, unknown>, offset: { readonly x: number; readonly y: number; readonly z: number }, reason: string): THREE.Group => {
  const size = markerSize(element)
  const half = size / 2
  const group = new THREE.Group()
  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color: INVALID_COLOR, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
  ))
  const cross = new THREE.BufferGeometry()
  cross.setAttribute("position", new THREE.Float32BufferAttribute([
    -half, -half, -half, half, half, half, -half, half, -half, half, -half, half,
    -half, -half, half, half, half, -half, half, -half, -half, -half, half, half
  ], 3))
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)), new THREE.LineBasicMaterial({ color: INVALID_COLOR })))
  group.add(new THREE.LineSegments(cross, new THREE.LineBasicMaterial({ color: INVALID_COLOR })))
  group.position.set((finite(element.x) ? element.x : 0) + offset.x, (finite(element.y) ? element.y : 0) + offset.y, (finite(element.z) ? element.z : 0) + offset.z)
  group.userData.isInvalidMarker = true
  group.userData.invalidReason = reason
  return group
}
