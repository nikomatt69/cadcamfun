/**
 * CAD element geometry used by the toolpath generator.
 *
 * Port of the legacy helpers `elementGeometryUtils` (`extractElementGeometry`, `getElementDepth`),
 * `genericToolpathUtils` (`suggestMachiningParameters`), `toolpathGeneratorUtils`
 * (`adjustSettingsForElement`), `toolpathUtils/elementMeasurements` (`getDrillingPoints`,
 * `getElementContourPath`, `calculateBoundingBox`) and the CAM store's workpiece derivation
 * (`calculateElementDimensions`), plus the stock-relative helpers the generator needs:
 * `stockFromElement`, `alignToStock`, `orderForMachining`.
 *
 * Axis convention (matches the CAD scene, `createThreeObject`): X = width, Y = height, Z = depth for
 * a cube; cylinders, cones, prisms and capsules extend along Z by `height`; a pyramid is
 * `width` x `depth` in XY and `height` in Z.
 */
import { elementMesh } from "../model/element-mesh.ts"
import type { CadElement, OperationType, Stock, ToolpathSettings } from "./schema.ts"

export interface V3 { x: number; y: number; z: number }

export interface Bounds {
  readonly min: V3
  readonly max: V3
  readonly center: V3
  readonly dimensions: { readonly width: number; readonly height: number; readonly depth: number }
}

const n = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
const num = (value: unknown): number => n(value, 0)

const boundsOf = (min: V3, max: V3): Bounds => ({
  min,
  max,
  center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
  dimensions: { width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z }
})

const centered = (e: CadElement, dx: number, dy: number, dzMin: number, dzMax: number): Bounds => {
  const x = num(e["x"])
  const y = num(e["y"])
  const z = num(e["z"])
  return boundsOf({ x: x - dx, y: y - dy, z: z + dzMin }, { x: x + dx, y: y + dy, z: z + dzMax })
}

export const isContainer = (e: CadElement): boolean =>
  e["type"] === "component" || e["type"] === "group" || e["type"] === "composite"

/** Children with absolute positions (legacy `transformElementRelativeToComponent`). */
export const childrenOf = (parent: CadElement): CadElement[] => {
  const list: unknown = parent["elements"]
  if (!Array.isArray(list)) return []
  const dx = num(parent["x"])
  const dy = num(parent["y"])
  const dz = num(parent["z"])
  return list
    .filter((c): c is CadElement => typeof c === "object" && c !== null)
    .map(child => ({ ...shiftElement(child, dx, dy, dz), inContainer: true }))
}

/** Every non-container descendant, parents' offsets applied. */
export const flattenElements = (elements: ReadonlyArray<CadElement>): CadElement[] => {
  const out: CadElement[] = []
  const visit = (e: CadElement): void => {
    if (isContainer(e) && Array.isArray(e["elements"]) && e["elements"].length > 0) childrenOf(e).forEach(visit)
    else out.push(e)
  }
  elements.forEach(visit)
  return out
}

/** Bounding box of one element in CAD coordinates (legacy `extractElementGeometry().boundingBox`). */
export const elementBounds = (e: CadElement): Bounds => {
  const x = num(e["x"])
  const y = num(e["y"])
  const z = num(e["z"])
  switch (e["type"]) {
    case "rectangle": return centered(e, num(e["width"]) / 2, num(e["height"]) / 2, 0, 0)
    case "circle": case "polygon": return centered(e, num(e["radius"]), num(e["radius"]), 0, 0)
    case "line": {
      const x1 = n(e["x1"], x), y1 = n(e["y1"], y), z1 = n(e["z1"], z)
      const x2 = n(e["x2"], x), y2 = n(e["y2"], y), z2 = n(e["z2"], z)
      return boundsOf(
        { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
        { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) }
      )
    }
    case "cube": return centered(e, num(e["width"]) / 2, num(e["height"]) / 2, -num(e["depth"]) / 2, num(e["depth"]) / 2)
    case "sphere": return centered(e, num(e["radius"]), num(e["radius"]), -num(e["radius"]), num(e["radius"]))
    case "cylinder": case "cone": case "prism":
      return centered(e, num(e["radius"]), num(e["radius"]), -num(e["height"]) / 2, num(e["height"]) / 2)
    case "torus": {
      const radius = num(e["radius"])
      const tube = n(e["tubeRadius"], radius / 4)
      return centered(e, radius + tube, radius + tube, -tube, tube)
    }
    case "pyramid": {
      const w = num(e["width"] ?? e["baseWidth"])
      const d = num(e["depth"] ?? e["baseDepth"])
      return centered(e, w / 2, d / 2, -num(e["height"]) / 2, num(e["height"]) / 2)
    }
    case "hemisphere": {
      const r = num(e["radius"])
      return e["direction"] === "down" ? centered(e, r, r, -r, 0) : centered(e, r, r, 0, r)
    }
    case "ellipsoid": {
      const rx = num(e["radiusX"]) || num(e["width"]) / 2
      const ry = num(e["radiusY"]) || num(e["height"]) / 2
      const rz = num(e["radiusZ"]) || num(e["depth"]) / 2
      return centered(e, rx, ry, -rz, rz)
    }
    case "capsule": {
      const r = num(e["radius"])
      const total = num(e["height"]) + r * 2
      return centered(e, r, r, -total / 2, total / 2)
    }
    case "ellipse": {
      const rx = num(e["radiusX"]) || num(e["width"]) / 2
      const ry = num(e["radiusY"]) || num(e["height"]) / 2
      return centered(e, rx, ry, 0, 0)
    }
    case "arc": return centered(e, num(e["radius"]), num(e["radius"]), 0, 0)
    case "triangle": {
      const pts = Array.isArray(e["points"]) && e["points"].length >= 3
        ? (e["points"] as Array<{ x: number; y: number; z?: number }>).slice(0, 3)
        : [{ x: num(e["x1"]), y: num(e["y1"]), z: num(e["z1"] ?? e["z"]) }, { x: num(e["x2"]), y: num(e["y2"]), z: num(e["z2"] ?? e["z"]) }, { x: num(e["x3"]), y: num(e["y3"]), z: num(e["z3"] ?? e["z"]) }]
      const xs = pts.map(p => num(p.x)), ys = pts.map(p => num(p.y)), zs = pts.map(p => num(p.z))
      return boundsOf({ x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) }, { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) })
    }
    default: {
      // A solid with no formula of its own here (an extrusion, a revolution, a mesh, a parametric part) has the bounds of its mesh:
      // reading width / height / radius off it would give a box of nothing, and the part would be placed on the stock by it.
      const solid = elementMesh(e as never, 0.05)
      if (solid !== undefined) {
        const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
        for (let k = 0; k + 2 < solid.positions.length; k += 3) {
          lo.x = Math.min(lo.x, solid.positions[k]!); hi.x = Math.max(hi.x, solid.positions[k]!)
          lo.y = Math.min(lo.y, solid.positions[k + 1]!); hi.y = Math.max(hi.y, solid.positions[k + 1]!)
          lo.z = Math.min(lo.z, solid.positions[k + 2]!); hi.z = Math.max(hi.z, solid.positions[k + 2]!)
        }
        return boundsOf(lo, hi)
      }
      if (isContainer(e)) {
        if (e["width"] !== undefined && e["height"] !== undefined) return centered(e, num(e["width"]) / 2, num(e["height"]) / 2, -num(e["depth"]) / 2, num(e["depth"]) / 2)
        const kids = childrenOf(e)
        if (kids.length > 0) return unionBounds(kids.map(elementBounds))
      }
      const w = num(e["width"]) || num(e["radius"]) * 2
      const h = num(e["height"]) || num(e["radius"]) * 2
      const d = num(e["depth"])
      return centered(e, w / 2, h / 2, -d / 2, d / 2)
    }
  }
}

export const unionBounds = (list: ReadonlyArray<Bounds>): Bounds => {
  if (list.length === 0) return boundsOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const b of list) {
    min.x = Math.min(min.x, b.min.x); min.y = Math.min(min.y, b.min.y); min.z = Math.min(min.z, b.min.z)
    max.x = Math.max(max.x, b.max.x); max.y = Math.max(max.y, b.max.y); max.z = Math.max(max.z, b.max.z)
  }
  return boundsOf(min, max)
}

/** Legacy `calculateBoundingBox(element | element[])`. */
export const calculateBoundingBox = (element: CadElement | ReadonlyArray<CadElement>): Bounds =>
  unionBounds((Array.isArray(element) ? element : [element as CadElement]).map(elementBounds))

/** Highest point of the element: where machining starts when it stands in the stock. */
export const topOf = (e: CadElement): number => elementBounds(e).max.z

// ---------------------------------------------------------------- depth and suggestions

/** Machining depth the element implies (legacy `getElementDepth`; 2D elements default to 5 mm). */
export const getElementDepth = (e: CadElement): number => {
  const b = elementBounds(e)
  const type = String(e["type"])
  const depth = b.dimensions.depth
  if (depth > 0 && type !== "rectangle" && type !== "circle" && type !== "polygon") return depth
  if (type.includes("sphere") && num(e["radius"]) > 0) return num(e["radius"]) * 2
  if (["cylinder", "cone", "prism", "pyramid", "capsule"].includes(type) && num(e["height"]) > 0) return num(e["height"])
  return 5
}

export interface MachiningSuggestion {
  readonly depth: number
  readonly stepdown: number
  readonly operationType: OperationType
}

/** Legacy `suggestMachiningParameters`. */
export const suggestMachiningParameters = (e: CadElement): MachiningSuggestion => {
  const b = elementBounds(e)
  const max = Math.max(b.dimensions.width, b.dimensions.height, b.dimensions.depth, num(e["radius"]) * 2)
  const stepdown = max > 100 ? 2.0 : max > 50 ? 1.0 : 0.5
  const type = String(e["type"])
  let operationType: OperationType = "contour"
  if (type.includes("circle") || type.includes("sphere")) operationType = "contour"
  else if (type.includes("rectangle") || type.includes("cube") || type.includes("polygon")) operationType = "pocket"
  else if (type.includes("line")) operationType = "profile"
  return { depth: getElementDepth(e), stepdown, operationType }
}

/** Legacy `adjustSettingsForElement`: depth / stepdown / operation follow the element, and a tiny element is flagged. */
export const adjustSettingsForElement = (
  e: CadElement | undefined,
  settings: ToolpathSettings,
  options: { readonly depthSetManually?: boolean } = {}
): { readonly settings: ToolpathSettings; readonly suggestSmallerTool: boolean } => {
  if (!e) return { settings, suggestSmallerTool: false }
  const suggestion = suggestMachiningParameters(e)
  const b = elementBounds(e)
  const max = Math.max(b.dimensions.width, b.dimensions.height, num(e["radius"]) * 2)
  return {
    settings: {
      ...settings,
      depth: options.depthSetManually ? settings.depth : suggestion.depth,
      stepdown: suggestion.stepdown,
      operationType: suggestion.operationType
    },
    suggestSmallerTool: max < settings.toolDiameter * 2
  }
}

// ---------------------------------------------------------------- measurements

/** Legacy `getDrillingPoints`: centres of circles, the centre of boxes, circular children of components. */
export const getDrillingPoints = (e: CadElement): V3[] => {
  const x = num(e["x"]), y = num(e["y"]), z = num(e["z"])
  if (isContainer(e)) {
    const holes = childrenOf(e).filter(c => c["type"] === "circle" || c["type"] === "sphere")
    return holes.length > 0
      ? holes.map(c => ({ x: num(c["x"]), y: num(c["y"]), z: num(c["z"]) }))
      : [{ x, y, z }]
  }
  switch (e["type"]) {
    case "line": {
      const b = elementBounds(e)
      return [{ x: b.center.x, y: b.center.y, z: b.center.z }]
    }
    default: return [{ x, y, z }]
  }
}

const ring = (cx: number, cy: number, rx: number, ry: number, count: number, z: number): V3[] =>
  Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * 2 * Math.PI
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), z }
  })

/** Closed or open outline of the element in XY at its own Z; `offset` > 0 grows it (legacy `getElementContourPath`). */
export const elementOutline = (e: CadElement, offset = 0): V3[] => {
  const x = num(e["x"]), y = num(e["y"]), z = num(e["z"])
  const box = (hw: number, hh: number): V3[] => [
    { x: x - hw, y: y - hh, z }, { x: x + hw, y: y - hh, z }, { x: x + hw, y: y + hh, z }, { x: x - hw, y: y + hh, z }, { x: x - hw, y: y - hh, z }
  ]
  switch (e["type"]) {
    case "rectangle": return box(num(e["width"]) / 2 + offset, num(e["height"]) / 2 + offset)
    case "cube": return box(num(e["width"]) / 2 + offset, num(e["height"]) / 2 + offset)
    case "pyramid": return box(num(e["width"] ?? e["baseWidth"]) / 2 + offset, num(e["depth"] ?? e["baseDepth"]) / 2 + offset)
    case "circle": case "sphere": case "cylinder": case "cone": case "hemisphere":
      return ring(x, y, num(e["radius"]) + offset, num(e["radius"]) + offset, 36, z)
    case "torus": {
      const outer = num(e["radius"]) + n(e["tubeRadius"], num(e["radius"]) / 4) + offset
      return ring(x, y, outer, outer, 48, z)
    }
    case "polygon": case "prism": {
      const sides = n(e["sides"], 6)
      const r = num(e["radius"]) + offset
      const pts = Array.from({ length: sides }, (_, i) => {
        const a = i * ((2 * Math.PI) / sides)
        return { x: x + r * Math.cos(a), y: y + r * Math.sin(a), z }
      })
      return [...pts, pts[0]!]
    }
    case "ellipse": case "ellipsoid": {
      const rx = (num(e["radiusX"]) || num(e["width"]) / 2) + offset
      const ry = (num(e["radiusY"]) || num(e["height"]) / 2) + offset
      return ring(x, y, rx, ry, 72, z)
    }
    case "capsule": return ring(x, y, num(e["radius"]) + offset, num(e["radius"]) + offset, 36, z)
    case "arc": {
      const r = num(e["radius"]) + offset
      const a0 = (num(e["startAngle"]) * Math.PI) / 180
      const a1 = ((e["endAngle"] === undefined ? 360 : num(e["endAngle"])) * Math.PI) / 180
      const sweep = a1 - a0 <= 0 ? a1 - a0 + 2 * Math.PI : a1 - a0
      return Array.from({ length: 37 }, (_, i) => ({ x: x + r * Math.cos(a0 + (sweep * i) / 36), y: y + r * Math.sin(a0 + (sweep * i) / 36), z }))
    }
    case "line": {
      const b = elementBounds(e)
      return [
        { x: n(e["x1"], x), y: n(e["y1"], y), z: b.min.z },
        { x: n(e["x2"], x), y: n(e["y2"], y), z: b.min.z }
      ]
    }
    case "triangle": {
      const b = elementBounds(e)
      const pts = Array.isArray(e["points"]) && e["points"].length >= 3
        ? (e["points"] as Array<{ x: number; y: number }>).slice(0, 3).map(p => ({ x: num(p.x), y: num(p.y), z: b.max.z }))
        : [{ x: num(e["x1"]), y: num(e["y1"]), z: b.max.z }, { x: num(e["x2"]), y: num(e["y2"]), z: b.max.z }, { x: num(e["x3"]), y: num(e["y3"]), z: b.max.z }]
      return [...pts, pts[0]!]
    }
    default: {
      const b = elementBounds(e)
      return box(b.dimensions.width / 2 + offset, b.dimensions.height / 2 + offset)
        .map(p => ({ ...p, x: p.x - x + b.center.x, y: p.y - y + b.center.y }))
    }
  }
}

// ---------------------------------------------------------------- stock

export interface ElementDimensions { readonly width: number; readonly height: number; readonly depth: number }

/** Legacy CAM `calculateElementDimensions`: the raw-piece size an element implies. */
export const calculateElementDimensions = (e: CadElement): ElementDimensions => {
  const type = String(e["type"])
  if (type === "box" || type === "cube") return { width: n(e["width"], 100), height: n(e["height"], 100), depth: n(e["depth"], 20) }
  if (type === "cylinder") {
    const diameter = e["radius"] ? num(e["radius"]) * 2 : 100
    return { width: diameter, height: diameter, depth: n(e["height"], 100) }
  }
  const bb: any = e["boundingBox"]
  if (bb?.max && bb?.min) return { width: bb.max.x - bb.min.x, height: bb.max.y - bb.min.y, depth: bb.max.z - bb.min.z }
  const b = elementBounds(e)
  const { width, height, depth } = b.dimensions
  return width > 0 && height > 0 ? { width, height, depth: depth > 0 ? depth : 20 } : { width: 100, height: 100, depth: 20 }
}

/** Stock derived from a CAD element (legacy `syncWorkpieceFromCAD`), centred on the element, top at its top face. */
export const stockFromElement = (e: CadElement, allowance = 1, material?: string): Stock => {
  const dims = calculateElementDimensions(e)
  const b = elementBounds(e)
  return {
    width: dims.width,
    height: dims.height,
    depth: dims.depth,
    radius: num(e["radius"]),
    topZ: 0,
    x: b.center.x,
    y: b.center.y,
    allowance,
    ...(material ?? e["material"] ? { material: String(material ?? e["material"]) } : {}),
    ...(e["id"] ? { elementId: String(e["id"]) } : {})
  }
}

// ---------------------------------------------------------------- moving elements

const SHIFT_X = ["x", "x1", "x2", "x3"] as const
const SHIFT_Y = ["y", "y1", "y2", "y3"] as const
const SHIFT_Z = ["z", "z1", "z2", "z3"] as const

/** Copy of `e` moved by (dx, dy, dz); containers move their children's relative positions with them. */
export const shiftElement = (e: CadElement, dx: number, dy: number, dz: number): CadElement => {
  const out: CadElement = { ...e }
  for (const k of SHIFT_X) if (typeof e[k] === "number") out[k] = (e[k] as number) + dx
  for (const k of SHIFT_Y) if (typeof e[k] === "number") out[k] = (e[k] as number) + dy
  for (const k of SHIFT_Z) if (typeof e[k] === "number") out[k] = (e[k] as number) + dz
  if (Array.isArray(e["points"])) {
    out["points"] = (e["points"] as Array<{ x: number; y: number; z?: number }>).map(p => ({ ...p, x: num(p.x) + dx, y: num(p.y) + dy, ...(p.z !== undefined ? { z: num(p.z) + dz } : {}) }))
  }
  // x/y/z absent on the element itself (a line stores only endpoints) must not appear from nowhere.
  return out
}

/**
 * Moves an element so its top face is the stock top (`stock.topZ`): machining starts at the raw
 * piece's surface and depth is measured from there, whatever Z the part sits at in the CAD scene.
 */
export const alignToStock = (e: CadElement, stock: Stock | undefined): CadElement => {
  if (!stock) return e
  const dz = stock.topZ - topOf(e)
  return dz === 0 ? e : shiftElement(e, 0, 0, dz)
}

/** True when the element's XY footprint leaves the stock rectangle (centre `stock.x/y`). */
export const outsideStock = (e: CadElement, stock: Stock | undefined, tolerance = 1e-6): boolean => {
  if (!stock) return false
  const b = elementBounds(e)
  const cx = stock.x
  const cy = stock.y
  return (
    b.min.x < cx - stock.width / 2 - tolerance || b.max.x > cx + stock.width / 2 + tolerance ||
    b.min.y < cy - stock.height / 2 - tolerance || b.max.y > cy + stock.height / 2 + tolerance
  )
}

/**
 * Machining order (legacy `optimizeComponentMachiningOrder`): top Z levels first; within a level,
 * elements nearest the group centre first (inner features before the outer contour).
 */
export const orderForMachining = (elements: ReadonlyArray<CadElement>): CadElement[] => {
  if (elements.length <= 1) return [...elements]
  const centre = calculateBoundingBox(elements).center
  const level = (e: CadElement): number => Math.round(topOf(e) * 100) / 100
  const distance = (e: CadElement): number => {
    const c = elementBounds(e).center
    return Math.hypot(c.x - centre.x, c.y - centre.y)
  }
  return elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => level(b.element) - level(a.element) || distance(a.element) - distance(b.element) || a.index - b.index)
    .map(item => item.element)
}
