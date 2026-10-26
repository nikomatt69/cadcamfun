/**
 * The built-in structural parts (`predefinedLibraries.ts`) as real parametric parts.
 *
 * Their definitions are a list of simple solids in a legacy shape: `{ type: "box", width, length | depth, height, position }`
 * with the position at the solid's *corner*, hollow cuts marked `negative`, tubes given by their diameters, a gusset as a
 * polygon. The editor's elements are centred and use other field names, so placing one of them used to give a generic cube
 * (and the extrusions had no preview at all). Here each part becomes one `parametric` element whose history has a primitive
 * per solid - centred where the data puts the corner, a cut as a `subtract` - so it renders, measures and edits like any
 * other parametric part, and a hollow section is really hollow.
 *
 * Axes: the editor stands on Z. A part that names its long side `length` is already Z-up (`width` X, `length` Y, `height`
 * Z). The others stack their `height` in the data's Y and run `depth` along its Z; they are turned onto the same frame
 * (`depth` becomes Y, `height` becomes Z), so every part stands on the work plane with its length along Y.
 */
import type { History, PrimitiveFeature } from "@cadcamfun/core"

interface Corner { readonly x: number; readonly y: number; readonly z: number }
interface LegacySolid {
  readonly type?: unknown
  readonly width?: number
  readonly height?: number
  readonly depth?: number
  readonly length?: number
  readonly outerDiameter?: number
  readonly innerDiameter?: number
  readonly points?: ReadonlyArray<Corner>
  readonly position?: Corner
  readonly negative?: boolean
}

const SUPPORTED: ReadonlySet<string> = new Set(["box", "extrusion", "cylinder", "polygon"])

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isCorner = (value: unknown): value is Corner => typeof value === "object" && value !== null &&
  isNumber((value as Corner).x) && isNumber((value as Corner).y) && isNumber((value as Corner).z)

/** True for a list of solids in the legacy library shape (the editor's own elements have no `position` object). */
export const isLegacyPart = (elements: ReadonlyArray<unknown>): elements is ReadonlyArray<LegacySolid> =>
  elements.length > 0 && elements.every((element) => {
    const solid = element as LegacySolid
    return typeof solid === "object" && solid !== null && typeof solid.type === "string" && SUPPORTED.has(solid.type) && isCorner(solid.position)
  })

/** How far a cut runs past the faces it cuts through, so the two never share a face. */
const OVERSHOOT = 1

export interface LibraryPart {
  readonly type: "parametric"
  readonly name: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly history: History
}

/** The history features of one solid: its primitive, and for a tube the bore cut out of it. */
const featuresOf = (solid: LegacySolid, index: number): ReadonlyArray<PrimitiveFeature> | undefined => {
  const id = `part${index + 1}`
  const position = solid.position!
  switch (solid.type) {
    case "box":
    case "extrusion": {
      const along = solid.length ?? solid.depth
      if (!isNumber(solid.width) || solid.width <= 0 || !isNumber(solid.height) || solid.height <= 0 || !isNumber(along) || along <= 0) return undefined
      // `length` parts are Z-up already; the others keep `height` in the data's Y and `depth` in its Z.
      const origin = solid.length !== undefined ? position : { x: position.x, y: position.z, z: position.y }
      const cut = solid.negative === true
      const long = cut ? along + 2 * OVERSHOOT : along
      return [{
        id, type: "primitive", element: "cube", operation: cut ? "subtract" : index === 0 ? "new" : "union",
        params: { width: solid.width, height: long, depth: solid.height },
        at: [origin.x + solid.width / 2, origin.y + along / 2, origin.z + solid.height / 2]
      }]
    }
    case "cylinder": {
      if (!isNumber(solid.outerDiameter) || solid.outerDiameter <= 0 || !isNumber(solid.height) || solid.height <= 0) return undefined
      const centre: [number, number, number] = [position.x, position.y, position.z + solid.height / 2]
      const outer: PrimitiveFeature = { id, type: "primitive", element: "cylinder", operation: index === 0 ? "new" : "union", params: { radius: solid.outerDiameter / 2, height: solid.height }, at: centre }
      if (solid.innerDiameter === undefined || solid.innerDiameter === 0) return [outer]
      if (!isNumber(solid.innerDiameter) || solid.innerDiameter < 0 || solid.innerDiameter >= solid.outerDiameter) return undefined
      return [outer, { id: `${id}bore`, type: "primitive", element: "cylinder", operation: "subtract", params: { radius: solid.innerDiameter / 2, height: solid.height + 2 * OVERSHOOT }, at: centre }]
    }
    case "polygon": {
      const points = solid.points
      if (!Array.isArray(points) || points.length < 3 || !points.every(isCorner) || !isNumber(solid.height) || solid.height <= 0) return undefined
      // The outline lies in the data's X-Z plane and the plate is `height` thick along its Y: on the work plane that is X-Y,
      // thickened along Z.
      return [{
        id, type: "primitive", element: "extrusion", operation: index === 0 ? "new" : "union",
        params: { depth: solid.height }, profile: points.map((point) => [point.x, point.z]),
        at: [position.x, position.z, position.y]
      }]
    }
  }
  return undefined
}

/**
 * The parametric element for a legacy part, or `undefined` when the list is not in that shape (a part made in the
 * editor, saved as elements, is left alone).
 */
export const legacyPartElement = (name: string, solids: ReadonlyArray<unknown>): LibraryPart | undefined => {
  if (!isLegacyPart(solids)) return undefined
  const features: PrimitiveFeature[] = []
  for (let index = 0; index < solids.length; index++) {
    const made = featuresOf(solids[index]!, index)
    if (made === undefined) return undefined
    features.push(...made)
  }
  // A cut can only come after the solid it cuts, and the first solid must be the one that starts the body.
  if (features[0]?.operation === "subtract") return undefined
  return { type: "parametric", name, x: 0, y: 0, z: 0, history: { parameters: {}, features } }
}
