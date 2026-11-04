/**
 * The part the probe can be picked on (spec 73 §4): the stock and the solid elements as boxes and cylinders in work coordinates, the
 * surfaces `targetAt` matches a pick against. The CAM view draws only the stock outline, so these are added to it while a feature
 * is being picked or when the probing settings ask for the part.
 */
import { cam, type Solid } from "@cadcamfun/core"
import type { WorkOrigin } from "./probe-targets.ts"

type CadElement = cam.generator.CadElement

const SOLID_TYPES = new Set(["cube", "cylinder", "prism", "cone", "pyramid", "capsule", "sphere", "hemisphere", "ellipsoid", "torus"])

export const partSolidsOf = (
  elements: ReadonlyArray<CadElement>,
  origin: WorkOrigin,
  stock?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly depth: number; readonly topZ: number }
): ReadonlyArray<Solid> => {
  const out: Solid[] = []
  if (stock !== undefined && stock.width > 0 && stock.height > 0 && stock.depth > 0) {
    out.push({ _tag: "Box", origin: { x: stock.x - stock.width / 2 - origin.x, y: stock.y - stock.height / 2 - origin.y, z: stock.topZ - stock.depth - origin.z }, size: { x: stock.width, y: stock.height, z: stock.depth } })
  }
  for (const element of cam.generator.flattenElements(elements)) {
    if (!SOLID_TYPES.has(String(element["type"]))) continue
    const b = cam.generator.elementBounds(element)
    const { width, height, depth } = b.dimensions
    if (!(width > 0 && height > 0 && depth > 0)) continue
    const shifted = { x: b.min.x - origin.x, y: b.min.y - origin.y, z: b.min.z - origin.z }
    out.push(String(element["type"]) === "cylinder" && Math.abs(width - height) < 1e-6
      ? { _tag: "Cylinder", origin: { x: shifted.x + width / 2, y: shifted.y + height / 2, z: shifted.z }, radius: width / 2, height: depth, segments: 64 }
      : { _tag: "Box", origin: shifted, size: { x: width, y: height, z: depth } })
  }
  return out
}
