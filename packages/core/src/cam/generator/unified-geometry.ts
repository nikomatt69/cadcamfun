/**
 * Unified geometry of a `component`: every member is sliced at the same Z levels and the slices are machined
 * together, nearest member first. Port of the legacy `unifiedGeometryCalculator` (+ `integratedToolpathGenerator`).
 *
 *   members -> Z levels -> cross-section of each member per level -> ordered toolpath segments -> G-code
 *
 * The legacy "boolean operations" are a no-op (`applyBooleanOperations` returned its input), so overlapping members
 * are NOT merged into one outline there either: each member keeps its own contour. That is kept.
 *
 * Where the output deliberately differs from the legacy code (each is a legacy bug or a gap, covered by a test):
 *  - axes follow the CAD scene like the rest of the generator: a cube / rectangle is `width` (X) x `height` (Y) x
 *    `depth` (Z); the legacy unified code read `height` as Z and `depth` as Y;
 *  - Z levels run from `top - stepdown` to exactly `top - depth` (legacy: first pass at the top face, i.e. in the air);
 *  - an inside tool offset shrinks a rectangle (legacy grew it, like an outside offset);
 *  - a "down" hemisphere is widest at its flat face (legacy used the wrong centre and inverted the profile);
 *  - a component's own position is applied once (legacy added it to the members twice);
 *  - flat members (rectangle, circle, polygon, ellipse, triangle) are extruded by the job depth from their own Z, so they
 *    are machined (legacy: types it did not know produced no toolpath at all); polygon sections (prism, mesh, triangle)
 *    get a contour (legacy: "unsupported shape", nothing emitted); a zero-size section (a sphere's apex) is skipped;
 *  - mesh intersection points are de-duplicated;
 *  - the nested program header / footer (`G90`, `M3`, `M30`, ...) the legacy wrapper added is not written: the mill
 *    program writes them once for the whole selection; comments are English.
 * The clockwise full circle of a climb cut (`G2`) is the legacy unified code's own choice and is kept.
 */
import { cutLevels, f3 } from "./common.ts"
import type { CadElement, ToolpathSettings } from "./schema.ts"

// ---------------------------------------------------------------- types

export interface ElementDimensions {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  /** X extent. */
  width: number
  /** Z extent (legacy naming). */
  height: number
  /** Y extent (legacy naming). */
  depth: number
  center: { x: number; y: number; z: number }
}

export type SectionShape = "circle" | "ellipse" | "rectangle" | "polygon"

export interface ElementIntersection {
  elementId: string
  elementType: string
  center: { x: number; y: number }
  shape: SectionShape
  /** circle: `radius`; ellipse: `radiusX`, `radiusY`; rectangle: `width`, `height`; polygon: `points`. */
  parameters: any
  operation?: "union" | "subtract" | "intersect"
}

export interface ZLevelIntersection {
  zLevel: number
  elements: ElementIntersection[]
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number }
  toolpath: ToolpathSegment[]
}

export interface ToolpathSegment {
  type: "linear" | "circular" | "rapid"
  startPoint: { x: number; y: number; z: number }
  endPoint: { x: number; y: number; z: number }
  center?: { x: number; y: number }
  radius?: number
  clockwise?: boolean
  feedrate?: number
}

/** A member in the shape the calculator reads (legacy `Component3D`), positions absolute. */
export interface Component3D {
  id?: string
  type: string
  x: number
  y: number
  z: number
  width?: number
  height?: number
  depth?: number
  radius?: number
  radiusX?: number
  radiusY?: number
  radiusZ?: number
  direction?: "up" | "down"
  orientation?: "x" | "y" | "z"
  elements?: Component3D[]
  operation?: "union" | "subtract" | "intersect"
  sides?: number
  vertices?: { x: number; y: number; z: number }[]
  faces?: number[][]
  edges?: [number, number][]
  boundingDimensions?: ElementDimensions
  /** Outline of an extruded polygon (`polygon-solid`), absolute XY. */
  points?: Array<[number, number]>
}

/** The settings the unified toolpath reads. */
export type UnifiedSettings = Pick<ToolpathSettings, "toolDiameter" | "feedrate" | "plungerate" | "stepdown" | "depth" | "offset" | "direction">

/** Retract height above each level (the panel has no safe-height field; the legacy default was 5 mm). */
export const SAFE_HEIGHT = 5

const EPS = 1e-9
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)

// ---------------------------------------------------------------- member preparation

/** Types whose cross-section the calculator can compute. */
const SOLID_TYPES = new Set([
  "cube", "sphere", "hemisphere", "cylinder", "cone", "capsule", "pyramid", "prism", "ellipsoid",
  "rectangle", "circle", "polygon", "ellipse", "triangle", "mesh", "custom", "imported"
])

const hasMesh = (e: CadElement): boolean => Array.isArray(e["vertices"]) && e["vertices"].length > 0 && Array.isArray(e["faces"]) && e["faces"].length > 0

/** True when the unified routine can slice this member (otherwise it is machined on its own). */
export const isUnifiedSolid = (e: CadElement): boolean => {
  const type = String(e["type"])
  if (!SOLID_TYPES.has(type)) return false
  if (type === "mesh" || type === "custom" || type === "imported") return hasMesh(e) || (e["width"] !== undefined && e["height"] !== undefined)
  if (type === "triangle") return trianglePoints(e) !== undefined
  return true
}

const trianglePoints = (e: CadElement): Array<[number, number]> | undefined => {
  if (Array.isArray(e["points"]) && e["points"].length >= 3) {
    return (e["points"] as Array<{ x: number; y: number }>).slice(0, 3).map(p => [num(p.x), num(p.y)] as [number, number])
  }
  if (e["x1"] !== undefined && e["x2"] !== undefined && e["x3"] !== undefined) {
    return [[num(e["x1"]), num(e["y1"])], [num(e["x2"]), num(e["y2"])], [num(e["x3"]), num(e["y3"])]]
  }
  return undefined
}

/**
 * Legacy `convertToComponent3D` for one member: copies the fields the calculator reads. Flat members become solids
 * hanging `extrusion` mm below their own Z (their Z is the face the cut starts from).
 */
export const toComponent3D = (e: CadElement, extrusion: number): Component3D => {
  const type = String(e["type"])
  const base: Component3D = { type, x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
  if (e["id"] !== undefined) base.id = String(e["id"])
  for (const key of ["width", "height", "depth", "radius", "radiusX", "radiusY", "radiusZ", "sides"] as const) {
    if (e[key] !== undefined) base[key] = num(e[key])
  }
  if (e["direction"] === "up" || e["direction"] === "down") base.direction = e["direction"]
  if (e["orientation"] === "x" || e["orientation"] === "y" || e["orientation"] === "z") base.orientation = e["orientation"]
  if (e["operation"] === "union" || e["operation"] === "subtract" || e["operation"] === "intersect") base.operation = e["operation"]
  if (Array.isArray(e["vertices"])) base.vertices = e["vertices"] as NonNullable<Component3D["vertices"]>
  if (Array.isArray(e["faces"])) base.faces = e["faces"] as number[][]
  if (Array.isArray(e["edges"])) base.edges = e["edges"] as [number, number][]
  if (e["boundingDimensions"] !== undefined) base.boundingDimensions = e["boundingDimensions"] as ElementDimensions

  const hang = (patch: Partial<Component3D>): Component3D => ({ ...base, ...patch, z: base.z - extrusion / 2 })
  switch (type) {
    case "rectangle": return hang({ type: "cube", width: num(e["width"]), height: num(e["height"]), depth: extrusion })
    case "circle": return hang({ type: "cylinder", radius: num(e["radius"]), height: extrusion })
    case "polygon": return hang({ type: "prism", radius: num(e["radius"]), sides: num(e["sides"], 6), height: extrusion })
    case "ellipse": return hang({ type: "ellipse", radiusX: num(e["radiusX"]) || num(e["width"]) / 2, radiusY: num(e["radiusY"]) || num(e["height"]) / 2, height: extrusion })
    case "triangle": {
      const points = trianglePoints(e) ?? []
      return hang({ type: "polygon-solid", points, height: extrusion })
    }
    default: return base
  }
}

export interface UnifiedSplit {
  /** Members sliced together. */
  readonly solids: CadElement[]
  /** Members the unified routine cannot slice (line, text, torus, ...): machined individually. */
  readonly rest: CadElement[]
}

export const splitUnifiedMembers = (members: ReadonlyArray<CadElement>): UnifiedSplit => ({
  solids: members.filter(isUnifiedSolid),
  rest: members.filter(m => !isUnifiedSolid(m))
})

// ---------------------------------------------------------------- dimensions

const dims = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, center?: ElementDimensions["center"]): ElementDimensions => ({
  minX, maxX, minY, maxY, minZ, maxZ,
  width: maxX - minX,
  height: maxZ - minZ,
  depth: maxY - minY,
  center: center ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
})

const boundingBoxFromVertices = (vertices: ReadonlyArray<{ x: number; y: number; z: number }>): ElementDimensions => {
  if (vertices.length === 0) throw new Error("No vertices given")
  let minX = vertices[0]!.x, maxX = minX, minY = vertices[0]!.y, maxY = minY, minZ = vertices[0]!.z, maxZ = minZ
  for (const v of vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
    minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z)
  }
  return dims(minX, maxX, minY, maxY, minZ, maxZ)
}

const moved = (e: Component3D): Array<{ x: number; y: number; z: number }> =>
  (e.vertices ?? []).map(v => ({ x: v.x + e.x, y: v.y + e.y, z: v.z + e.z }))

/** Legacy `calculateElementDimensions`. */
export const calculateElementDimensions = (e: Component3D): ElementDimensions => {
  const { x, y, z } = e
  const r = e.radius ?? 0
  switch (e.type) {
    case "cube": case "rectangle": {
      const w = e.width ?? 0, h = e.height ?? 0, d = e.depth ?? 0
      return dims(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2, { x, y, z })
    }
    case "sphere": return dims(x - r, x + r, y - r, y + r, z - r, z + r, { x, y, z })
    case "hemisphere":
      return e.direction === "down"
        ? dims(x - r, x + r, y - r, y + r, z - r, z, { x, y, z: z - r / 2 })
        : dims(x - r, x + r, y - r, y + r, z, z + r, { x, y, z: z + r / 2 })
    case "cylinder": case "cone": case "prism": {
      const h = e.height ?? 0
      return dims(x - r, x + r, y - r, y + r, z - h / 2, z + h / 2, { x, y, z })
    }
    case "ellipse": {
      const h = e.height ?? 0
      return dims(x - num(e.radiusX), x + num(e.radiusX), y - num(e.radiusY), y + num(e.radiusY), z - h / 2, z + h / 2, { x, y, z })
    }
    case "polygon-solid": {
      const pts = e.points ?? []
      const h = e.height ?? 0
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      return dims(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), z - h / 2, z + h / 2)
    }
    case "capsule": {
      const h = e.height ?? 0
      switch (e.orientation ?? "z") {
        case "z": return dims(x - r, x + r, y - r, y + r, z - h / 2 - r, z + h / 2 + r, { x, y, z })
        case "x": return dims(x - h / 2 - r, x + h / 2 + r, y - r, y + r, z - r, z + r, { x, y, z })
        default: return dims(x - r, x + r, y - h / 2 - r, y + h / 2 + r, z - r, z + r, { x, y, z })
      }
    }
    case "pyramid": {
      const w = e.width ?? 0, d = e.depth || e.width || 0, h = e.height ?? 0
      return dims(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z - h / 2, z + h / 2, { x, y, z })
    }
    case "ellipsoid": {
      const rx = ellipsoidRadii(e)
      return dims(x - rx.x, x + rx.x, y - rx.y, y + rx.y, z - rx.z, z + rx.z, { x, y, z })
    }
    case "custom": case "mesh": case "imported": {
      if (e.boundingDimensions) return e.boundingDimensions
      if (e.vertices && e.vertices.length > 0) return boundingBoxFromVertices(moved(e))
      if (e.width !== undefined && e.height !== undefined) {
        const w = e.width, h = e.height, d = e.depth ?? 0
        return dims(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2, { x, y, z })
      }
      return dims(x - 1, x + 1, y - 1, y + 1, z - 1, z + 1, { x, y, z })
    }
    default:
      if (e.vertices && e.vertices.length > 0) return boundingBoxFromVertices(moved(e))
      return dims(x - 0.1, x + 0.1, y - 0.1, y + 0.1, z - 0.1, z + 0.1, { x, y, z })
  }
}

/** Legacy `combineElementDimensions`: the union box of several element boxes. */
export const combineElementDimensions = (list: ReadonlyArray<ElementDimensions>): ElementDimensions => {
  if (list.length === 0) throw new Error("No dimensions given")
  const c = { ...list[0]! }
  for (const d of list.slice(1)) {
    c.minX = Math.min(c.minX, d.minX); c.maxX = Math.max(c.maxX, d.maxX)
    c.minY = Math.min(c.minY, d.minY); c.maxY = Math.max(c.maxY, d.maxY)
    c.minZ = Math.min(c.minZ, d.minZ); c.maxZ = Math.max(c.maxZ, d.maxZ)
  }
  return dims(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ)
}

/** Legacy `calculateComponentDimensions`; members already carry absolute positions (the component's own offset applied once). */
export const calculateComponentDimensions = (component: Component3D): ElementDimensions =>
  component.elements && component.elements.length > 0
    ? combineElementDimensions(component.elements.map(calculateElementDimensions))
    : calculateElementDimensions(component)

const ellipsoidRadii = (e: Component3D): { x: number; y: number; z: number } => ({
  x: e.radiusX || (e.width ? e.width / 2 : 0),
  y: e.radiusY || (e.height ? e.height / 2 : 0),
  z: e.radiusZ || (e.depth ? e.depth / 2 : 0)
})

// ---------------------------------------------------------------- Z levels

/**
 * Cut levels of the group: `top - stepdown` down to exactly `top - depth` (depth limited to the group's height).
 * A group with no height is cut once, at its top.
 */
export const calculateZLevels = (elements: ReadonlyArray<Component3D>, s: Pick<ToolpathSettings, "depth" | "stepdown">): number[] => {
  if (elements.length === 0) return []
  const box = combineElementDimensions(elements.map(calculateElementDimensions))
  const depth = Math.min(s.depth, box.maxZ - box.minZ)
  const levels = cutLevels(depth, s.stepdown).map(level => box.maxZ + level)
  return levels.length > 0 ? levels : [box.maxZ]
}

// ---------------------------------------------------------------- cross-sections

const section = (e: Component3D, shape: SectionShape, parameters: any): ElementIntersection => ({
  elementId: e.id ?? "",
  elementType: e.type,
  center: { x: e.x, y: e.y },
  shape,
  parameters
})

/** Mesh edges against the plane `z`; the points are ordered by angle around the element and de-duplicated. */
export const calculateMeshZIntersection = (e: Component3D, zLevel: number): Array<[number, number]> => {
  const points: Array<[number, number]> = []
  if (!e.vertices || !e.faces) return points
  const v = moved(e)
  for (const face of e.faces) {
    if (face.length < 3) continue
    for (let i = 0; i < face.length; i++) {
      const a = v[face[i]!]
      const b = v[face[(i + 1) % face.length]!]
      if (!a || !b) continue
      if ((a.z >= zLevel && b.z <= zLevel) || (a.z <= zLevel && b.z >= zLevel)) {
        if (a.z === b.z && a.z === zLevel) { points.push([(a.x + b.x) / 2, (a.y + b.y) / 2]); continue }
        const t = (zLevel - a.z) / (b.z - a.z)
        points.push([a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)])
      }
    }
  }
  const unique = points.filter((p, i) => points.findIndex(q => Math.abs(q[0] - p[0]) < EPS && Math.abs(q[1] - p[1]) < EPS) === i)
  return unique.length > 2
    ? [...unique].sort((p, q) => Math.atan2(p[1] - e.y, p[0] - e.x) - Math.atan2(q[1] - e.y, q[0] - e.x))
    : unique
}

const within = (z: number, lo: number, hi: number): boolean => z >= lo - EPS && z <= hi + EPS

/** Legacy `calculateElementZLevelIntersection`: the cross-section of one member at height `zLevel`, or `null`. */
export const calculateElementZLevelIntersection = (e: Component3D, zLevel: number): ElementIntersection | null => {
  const r = e.radius ?? 0
  const h = e.height ?? 0
  const circle = (radius: number): ElementIntersection => section(e, "circle", { radius })
  switch (e.type) {
    case "cube": case "rectangle": {
      const d = e.depth ?? 0
      return within(zLevel, e.z - d / 2, e.z + d / 2) ? section(e, "rectangle", { width: e.width ?? 0, height: e.height ?? 0 }) : null
    }
    case "sphere": {
      const dz = Math.abs(zLevel - e.z)
      return dz <= r + EPS ? circle(Math.sqrt(Math.max(0, r * r - dz * dz))) : null
    }
    case "hemisphere": {
      const up = e.direction !== "down"
      const lo = up ? e.z : e.z - r
      const hi = up ? e.z + r : e.z
      if (!within(zLevel, lo, hi)) return null
      const dz = Math.abs(zLevel - e.z)
      return circle(Math.sqrt(Math.max(0, r * r - dz * dz)))
    }
    case "cylinder": return within(zLevel, e.z - h / 2, e.z + h / 2) ? circle(r) : null
    case "cone": {
      if (!within(zLevel, e.z - h / 2, e.z + h / 2)) return null
      const ratio = (e.z + h / 2 - zLevel) / h
      return circle(r * (1 - ratio))
    }
    case "ellipse": return within(zLevel, e.z - h / 2, e.z + h / 2) ? section(e, "ellipse", { radiusX: num(e.radiusX), radiusY: num(e.radiusY) }) : null
    case "capsule": {
      const orientation = e.orientation ?? "z"
      if (orientation === "z") {
        const top = e.z + h / 2 + r, bottom = e.z - h / 2 - r
        if (!within(zLevel, bottom, top)) return null
        let radiusAtZ = r
        if (zLevel > e.z + h / 2) radiusAtZ = Math.sqrt(Math.max(0, r * r - (r - (top - zLevel)) ** 2))
        else if (zLevel < e.z - h / 2) radiusAtZ = Math.sqrt(Math.max(0, r * r - (r - (zLevel - bottom)) ** 2))
        return circle(radiusAtZ)
      }
      if (!within(zLevel, e.z - r, e.z + r)) return null
      const across = Math.sqrt(Math.max(0, r * r - (zLevel - e.z) ** 2))
      return orientation === "x"
        ? section(e, "ellipse", { radiusX: h / 2 + r, radiusY: across })
        : section(e, "ellipse", { radiusX: across, radiusY: h / 2 + r })
    }
    case "pyramid": {
      if (!within(zLevel, e.z - h / 2, e.z + h / 2)) return null
      const w = e.width ?? 0, d = e.depth || e.width || 0
      const scale = 1 - (zLevel - (e.z - h / 2)) / h
      const wz = w * scale, dz = d * scale
      return wz < 0.001 || dz < 0.001 ? circle(0.001) : section(e, "rectangle", { width: wz, height: dz })
    }
    case "prism": {
      if (!within(zLevel, e.z - h / 2, e.z + h / 2)) return null
      const sides = e.sides || 6
      const points: Array<[number, number]> = Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2
        return [e.x + r * Math.cos(a), e.y + r * Math.sin(a)] as [number, number]
      })
      points.push([...points[0]!] as [number, number])
      return section(e, "polygon", { points })
    }
    case "polygon-solid": {
      if (!within(zLevel, e.z - h / 2, e.z + h / 2) || !e.points || e.points.length < 3) return null
      const points = e.points.map(p => [...p] as [number, number])
      points.push([...points[0]!] as [number, number])
      return section(e, "polygon", { points })
    }
    case "ellipsoid": {
      const q = ellipsoidRadii(e)
      if (!within(zLevel, e.z - q.z, e.z + q.z)) return null
      const scale = Math.sqrt(Math.max(0, 1 - (Math.abs(zLevel - e.z) / q.z) ** 2))
      return section(e, "ellipse", { radiusX: q.x * scale, radiusY: q.y * scale })
    }
    default: {
      // custom / mesh / imported and any unknown type: the slice of the mesh, else the box of its size.
      const box = calculateElementDimensions(e)
      if (zLevel < box.minZ - EPS || zLevel > box.maxZ + EPS) return null
      if (e.vertices && e.vertices.length > 0 && e.faces && e.faces.length > 0) {
        const points = calculateMeshZIntersection(e, zLevel)
        return points.length > 2 ? section(e, "polygon", { points }) : null
      }
      if ((e.type === "custom" || e.type === "mesh" || e.type === "imported") && e.width !== undefined && e.height !== undefined) {
        return section(e, "rectangle", { width: e.width, height: e.height })
      }
      return null
    }
  }
}

const boundingBoxOf = (list: ReadonlyArray<ElementIntersection>): ZLevelIntersection["boundingBox"] => {
  if (list.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const grow = (x0: number, x1: number, y0: number, y1: number): void => {
    box.minX = Math.min(box.minX, x0); box.maxX = Math.max(box.maxX, x1)
    box.minY = Math.min(box.minY, y0); box.maxY = Math.max(box.maxY, y1)
  }
  for (const i of list) {
    const { x, y } = i.center
    switch (i.shape) {
      case "circle": grow(x - i.parameters.radius, x + i.parameters.radius, y - i.parameters.radius, y + i.parameters.radius); break
      case "ellipse": grow(x - i.parameters.radiusX, x + i.parameters.radiusX, y - i.parameters.radiusY, y + i.parameters.radiusY); break
      case "rectangle": grow(x - i.parameters.width / 2, x + i.parameters.width / 2, y - i.parameters.height / 2, y + i.parameters.height / 2); break
      case "polygon": for (const p of i.parameters.points as Array<[number, number]>) grow(p[0], p[0], p[1], p[1]); break
    }
  }
  return box
}

// ---------------------------------------------------------------- toolpath

/** Nearest-centre-first order starting at the first section (legacy `optimizeElementOrder`). */
const orderByNearest = (list: ReadonlyArray<ElementIntersection>): ElementIntersection[] => {
  if (list.length <= 1) return [...list]
  const result = [list[0]!]
  let remaining = list.slice(1)
  let last = list[0]!.center
  while (remaining.length > 0) {
    let best = 0
    let min = Infinity
    remaining.forEach((c, i) => {
      const d = Math.hypot(c.center.x - last.x, c.center.y - last.y)
      if (d < min) { min = d; best = i }
    })
    const next = remaining[best]!
    result.push(next)
    remaining = remaining.filter((_, i) => i !== best)
    last = next.center
  }
  return result
}

/** Legacy `generateOptimizedToolpath`: contours of the sections at one level, joined by lifts and rapids. */
export const generateOptimizedToolpath = (list: ReadonlyArray<ElementIntersection>, zLevel: number, s: UnifiedSettings): ToolpathSegment[] => {
  const path: ToolpathSegment[] = []
  const { toolDiameter, feedrate, plungerate } = s
  const tool = toolDiameter / 2
  const grow = s.offset === "outside" ? tool : s.offset === "inside" ? -tool : 0
  const conventional = s.direction === "conventional"

  /** Approach to the start point of the next contour: plunge for the first, lift-and-rapid when far, else straight. */
  const approach = (start: { x: number; y: number }, first: boolean, lift: number): void => {
    if (first) {
      path.push({ type: "rapid", startPoint: { x: start.x, y: start.y, z: zLevel + SAFE_HEIGHT }, endPoint: { x: start.x, y: start.y, z: zLevel + SAFE_HEIGHT } })
      path.push({ type: "linear", startPoint: { x: start.x, y: start.y, z: zLevel + SAFE_HEIGHT }, endPoint: { x: start.x, y: start.y, z: zLevel }, feedrate: plungerate })
      return
    }
    const last = path[path.length - 1]!.endPoint
    if (Math.hypot(start.x - last.x, start.y - last.y) > toolDiameter * 1.5) {
      path.push({ type: "linear", startPoint: last, endPoint: { x: last.x, y: last.y, z: zLevel + lift }, feedrate: plungerate })
      path.push({ type: "rapid", startPoint: { x: last.x, y: last.y, z: zLevel + lift }, endPoint: { x: start.x, y: start.y, z: zLevel + lift } })
      path.push({ type: "linear", startPoint: { x: start.x, y: start.y, z: zLevel + lift }, endPoint: { x: start.x, y: start.y, z: zLevel }, feedrate: plungerate })
    } else {
      path.push({ type: "linear", startPoint: last, endPoint: { x: start.x, y: start.y, z: zLevel }, feedrate })
    }
  }

  const trace = (points: ReadonlyArray<readonly [number, number]>): void => {
    for (let i = 1; i < points.length; i++) {
      path.push({
        type: "linear",
        startPoint: { x: points[i - 1]![0], y: points[i - 1]![1], z: zLevel },
        endPoint: { x: points[i]![0], y: points[i]![1], z: zLevel },
        feedrate
      })
    }
  }

  orderByNearest(list).forEach((c, index) => {
    const first = index === 0
    const p = c.parameters
    switch (c.shape) {
      case "circle": {
        if (p.radius <= EPS) return
        const radius = p.radius + grow
        if (radius <= 0) return
        const angle = ((index * 45) % 360) * Math.PI / 180
        const start = { x: c.center.x + radius * Math.cos(angle), y: c.center.y + radius * Math.sin(angle) }
        approach(start, first, SAFE_HEIGHT / 2)
        path.push({
          type: "circular",
          startPoint: { ...start, z: zLevel },
          endPoint: { ...start, z: zLevel },
          center: { x: c.center.x, y: c.center.y },
          radius,
          clockwise: s.direction === "climb",
          feedrate
        })
        return
      }
      case "ellipse": {
        if (p.radiusX <= EPS || p.radiusY <= EPS) return
        const rx = p.radiusX + grow
        const ry = p.radiusY + grow
        if (rx <= 0 || ry <= 0) return
        const count = Math.max(72, Math.ceil(Math.PI * (rx + ry)))
        const points: Array<[number, number]> = Array.from({ length: count + 1 }, (_, i) => {
          const a = (i / count) * Math.PI * 2
          return [c.center.x + rx * Math.cos(a), c.center.y + ry * Math.sin(a)] as [number, number]
        })
        if (conventional) points.reverse()
        approach({ x: points[0]![0], y: points[0]![1] }, first, 1)
        trace(points)
        return
      }
      case "rectangle": {
        const w = p.width + (s.offset === "center" ? 0 : s.offset === "outside" ? toolDiameter : -toolDiameter)
        const h = p.height + (s.offset === "center" ? 0 : s.offset === "outside" ? toolDiameter : -toolDiameter)
        if (p.width <= EPS || p.height <= EPS || w <= 0 || h <= 0) return
        const { x, y } = c.center
        const corners: Array<[number, number]> = [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2], [x - w / 2, y - h / 2]]
        if (conventional) corners.reverse()
        approach({ x: corners[0]![0], y: corners[0]![1] }, first, 1)
        trace(corners)
        return
      }
      case "polygon": {
        const raw = p.points as Array<[number, number]>
        const closedRaw = raw.length > 0 && (raw[0]![0] !== raw[raw.length - 1]![0] || raw[0]![1] !== raw[raw.length - 1]![1]) ? [...raw, raw[0]!] : raw
        const points = grow === 0 ? closedRaw : offsetOutline(closedRaw, grow)
        if (!points || points.length < 3) return
        const ordered = conventional ? [...points].reverse() : points
        approach({ x: ordered[0]![0], y: ordered[0]![1] }, first, 1)
        trace(ordered)
        return
      }
    }
  })
  return path
}

/** Each vertex moved away from (positive) / towards (negative) the centroid, the polygon closed; `null` when it collapses. */
const offsetOutline = (points: ReadonlyArray<[number, number]>, distance: number): Array<[number, number]> | null => {
  const closed = points.length > 1 && points[0]![0] === points[points.length - 1]![0] && points[0]![1] === points[points.length - 1]![1]
  const open = closed ? points.slice(0, -1) : points
  if (open.length < 3) return null
  const cx = open.reduce((sum, p) => sum + p[0], 0) / open.length
  const cy = open.reduce((sum, p) => sum + p[1], 0) / open.length
  const out: Array<[number, number]> = []
  for (const p of open) {
    const dx = p[0] - cx, dy = p[1] - cy
    const length = Math.hypot(dx, dy)
    if (length < 0.0001) continue
    const shifted = length + distance
    if (shifted <= 0) return null
    out.push([p[0] + (dx / length) * distance, p[1] + (dy / length) * distance])
  }
  if (out.length < 3) return null
  out.push([out[0]![0], out[0]![1]])
  return out
}

/** Legacy `calculateZLevelIntersection`: every member's section at `zLevel` plus the ordered toolpath through them. */
export const calculateZLevelIntersection = (elements: ReadonlyArray<Component3D>, zLevel: number, s: UnifiedSettings): ZLevelIntersection => {
  const sections: ElementIntersection[] = []
  for (const e of elements) {
    const hit = calculateElementZLevelIntersection(e, zLevel)
    if (!hit) continue
    if (e.operation) hit.operation = e.operation
    sections.push(hit)
  }
  return { zLevel, elements: sections, boundingBox: boundingBoxOf(sections), toolpath: generateOptimizedToolpath(sections, zLevel, s) }
}

// ---------------------------------------------------------------- G-code

/** Legacy `convertToolpathToGcode`: `F` is written when it changes; plunges run at the plunge rate. */
export const convertToolpathToGcode = (path: ReadonlyArray<ToolpathSegment>, s: Pick<ToolpathSettings, "feedrate" | "plungerate">): string => {
  let gcode = ""
  let lastFeed: number | undefined
  for (const seg of path) {
    const plunge = seg.type === "linear" && seg.startPoint.z !== seg.endPoint.z
      && Math.abs(seg.startPoint.x - seg.endPoint.x) < 0.001 && Math.abs(seg.startPoint.y - seg.endPoint.y) < 0.001
    const feed = seg.feedrate || (plunge ? s.plungerate : seg.type === "rapid" ? undefined : s.feedrate)
    const at = `X${f3(seg.endPoint.x)} Y${f3(seg.endPoint.y)} Z${f3(seg.endPoint.z)}`
    const withFeed = (): string => {
      if (feed === undefined || feed === lastFeed) return ""
      lastFeed = feed
      return ` F${feed}`
    }
    switch (seg.type) {
      case "rapid": gcode += `G0 ${at} ; Rapid move\n`; break
      case "linear": gcode += `G1 ${at}${withFeed()} ; ${plunge ? "Plunge move" : "Linear move"}\n`; break
      case "circular": {
        const i = f3(seg.center!.x - seg.startPoint.x)
        const j = f3(seg.center!.y - seg.startPoint.y)
        gcode += `${seg.clockwise ? "G2" : "G3"} ${at} I${i} J${j}${withFeed()} ; ${seg.clockwise ? "Clockwise" : "Counter-clockwise"} circular move\n`
        break
      }
    }
  }
  return gcode
}

/**
 * G-code body of a component machined as one unified geometry (legacy `generateUnifiedGcode` without the program
 * header / footer): bounding-box comments, then per Z level the ordered contours of every member.
 * `members` carry absolute positions; flat ones hang `s.depth` below their Z.
 */
export const unifiedGcode = (members: ReadonlyArray<CadElement>, s: ToolpathSettings): string => {
  const solids = members.map(m => toComponent3D(m, s.depth))
  if (solids.length === 0) return "; No members to machine as a unified geometry\n"
  const box = combineElementDimensions(solids.map(calculateElementDimensions))
  let gcode = "; Unified mesh toolpath\n"
  gcode += `; Bounding box: width=${f3(box.width)}, height=${f3(box.height)}, depth=${f3(box.depth)}\n`
  gcode += `; Center: (${f3(box.center.x)}, ${f3(box.center.y)}, ${f3(box.center.z)})\n\n`
  for (const zLevel of calculateZLevels(solids, s)) {
    gcode += `; Z Level: ${f3(zLevel)}\n`
    const level = calculateZLevelIntersection(solids, zLevel, s)
    gcode += level.elements.length > 0 ? `${convertToolpathToGcode(level.toolpath, s)}\n` : "; No elements intersect at this Z level\n\n"
  }
  return gcode
}

// ---------------------------------------------------------------- details

const meshMetrics = (e: Component3D): { volume: number; surface: number } => {
  let volume = 0
  let surface = 0
  const v = moved(e)
  for (const face of e.faces ?? []) {
    if (face.length < 3) continue
    for (let i = 1; i < face.length - 1; i++) {
      const a = v[face[0]!], b = v[face[i]!], c = v[face[i + 1]!]
      if (!a || !b || !c) continue
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
      const cross = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x }
      surface += 0.5 * Math.hypot(cross.x, cross.y, cross.z)
      volume += Math.abs(a.x * (b.y * c.z - c.y * b.z) + a.y * (b.z * c.x - c.z * b.x) + a.z * (b.x * c.y - c.x * b.y)) / 6
    }
  }
  return { volume: Math.abs(volume), surface }
}

/** Volume and surface of one member: closed forms for the common solids, the bounding box otherwise (legacy). */
const volumeAndSurface = (e: Component3D): { volume: number; surface: number } => {
  const r = e.radius ?? 0
  const h = e.height ?? 0
  switch (e.type) {
    case "sphere": return { volume: (4 / 3) * Math.PI * r ** 3, surface: 4 * Math.PI * r * r }
    case "cube": case "rectangle": {
      const w = e.width ?? 0, hh = e.height ?? 0, d = e.depth ?? 0
      return { volume: w * hh * d, surface: 2 * (w * hh + w * d + hh * d) }
    }
    case "cylinder": return { volume: Math.PI * r * r * h, surface: 2 * Math.PI * r * (r + h) }
    case "capsule": return { volume: Math.PI * r * r * h + (4 / 3) * Math.PI * r ** 3, surface: 2 * Math.PI * r * h + 4 * Math.PI * r * r }
    case "custom": case "mesh": case "imported":
      if (e.vertices && e.vertices.length > 0 && e.faces && e.faces.length > 0) return meshMetrics(e)
    // falls through to the box
    default: {
      const b = calculateElementDimensions(e)
      return { volume: b.width * b.height * b.depth, surface: 2 * (b.width * b.height + b.width * b.depth + b.height * b.depth) }
    }
  }
}

export interface ComponentDetails {
  readonly dimensions: ElementDimensions
  readonly volume: number
  readonly surfaceArea: number
  readonly centerOfMass: { x: number; y: number; z: number }
}

/** Legacy `calculate3DComponentDetails` for members with absolute positions (the centre of mass is the box centre). */
export const calculate3DComponentDetails = (members: ReadonlyArray<Component3D>): ComponentDetails => {
  const dimensions = combineElementDimensions(members.map(calculateElementDimensions))
  let volume = 0
  let surfaceArea = 0
  for (const m of members) {
    const part = volumeAndSurface(m)
    volume += part.volume
    surfaceArea += part.surface
  }
  return { dimensions, volume, surfaceArea, centerOfMass: { ...dimensions.center } }
}
