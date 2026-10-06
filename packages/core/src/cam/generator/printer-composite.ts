/**
 * Layer-by-layer printing of composite elements (legacy `generateCompositeElement3D` and its helpers).
 *
 * Every layer collects the 2D outline of each primitive that crosses the layer height, prints the shells of
 * those outlines, fills the inside with rectilinear ("lines") infill and notes where supports would go.
 * Same limits as the legacy code: only cube, cylinder, sphere, cone and torus contribute an outline
 * (ellipsoid, line and text only widen the Z range), only the "lines" infill pattern exists, and support
 * generation is a placeholder that writes comments.
 *
 * Axis convention of the port (CAD scene): a cube is `width` (X) x `height` (Y) x `depth` (Z).
 */
import type { CadElement } from "./schema.ts"
import { calculateExtrusion, f3, moveTo, polygonLayer, printEndGCode, printStartGCode, type P2, type P3, type Polygon, type PrinterSettings, type SliceGeometry } from "./printer-base.ts"

const isContainer = (el: CadElement): boolean => el["type"] === "composite" || el["type"] === "component" || el["type"] === "group"

interface ZBounds { minZ: number; maxZ: number }

/** Z range of an element (legacy `getElementBounds`), `null` when it cannot be determined. */
export const elementZBounds = (el: CadElement | undefined): ZBounds | null => {
  if (!el) return null
  let minZ = Infinity
  let maxZ = -Infinity
  const update = (lo: number, hi: number): void => { minZ = Math.min(minZ, lo); maxZ = Math.max(maxZ, hi) }
  switch (el["type"]) {
    case "cube":
      if (el["z"] != null && el["depth"] != null) update(el["z"] - el["depth"] / 2, el["z"] + el["depth"] / 2)
      else return null
      break
    case "cylinder":
    case "cone":
      if (el["z"] != null && el["height"] != null) update(el["z"] - el["height"] / 2, el["z"] + el["height"] / 2)
      else return null
      break
    case "sphere":
      if (el["z"] != null && el["radius"] != null) update(el["z"] - el["radius"], el["z"] + el["radius"])
      else return null
      break
    case "torus":
      if (el["z"] != null && el["tubeRadius"] != null) update(el["z"] - el["tubeRadius"], el["z"] + el["tubeRadius"])
      else return null
      break
    case "ellipsoid":
      if (el["z"] != null && el["radiusZ"] != null) update(el["z"] - el["radiusZ"], el["z"] + el["radiusZ"])
      else return null
      break
    case "line":
      if (el["z"] != null) update(el["z"] - (el["strokeWidth"] || 0.2) / 2, el["z"] + (el["strokeWidth"] || 0.2) / 2)
      break
    case "text":
    case "text3d":
      if (el["z"] != null) {
        const height = el["depth"] || el["size"] || 1
        update(el["z"] - height / 2, el["z"] + height / 2)
      } else return null
      break
    case "composite":
    case "component":
    case "group": {
      if (!Array.isArray(el["elements"])) return null
      let any = false
      for (const sub of el["elements"]) {
        const b = elementZBounds(sub)
        if (b) { update(b.minZ, b.maxZ); any = true }
      }
      if (!any) return null
      break
    }
    default:
      return null
  }
  return minZ === Infinity || maxZ === -Infinity ? null : { minZ, maxZ }
}

const circle = (x: number, y: number, radius: number, segments: number): Polygon => {
  const out: Polygon = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    out.push({ x: x + radius * Math.cos(a), y: y + radius * Math.sin(a) })
  }
  return out
}

/** The 2D outline(s) of one primitive at `layerZ` (the geometry half of the legacy `generate*Slice` functions). */
export const sliceOutline = (el: CadElement, s: PrinterSettings, layerZ: number): SliceGeometry => {
  const { x, y, z } = el as { x: number; y: number; z: number }
  switch (el["type"]) {
    case "cube": {
      const startZ = z - el["depth"] / 2
      if (!(layerZ > startZ && layerZ <= startZ + el["depth"])) return []
      const hw = el["width"] / 2
      const hh = el["height"] / 2
      return [[{ x: x - hw, y: y - hh }, { x: x + hw, y: y - hh }, { x: x + hw, y: y + hh }, { x: x - hw, y: y + hh }]]
    }
    case "cylinder": {
      const startZ = z - el["height"] / 2
      return layerZ > startZ && layerZ <= startZ + el["height"] ? [circle(x, y, el["radius"], 36)] : []
    }
    case "sphere": {
      const dist = Math.abs(layerZ - z)
      if (!(dist <= el["radius"])) return []
      const slice = Math.sqrt(el["radius"] ** 2 - dist ** 2)
      return slice > 0 ? [circle(x, y, slice, 36)] : []
    }
    case "cone": {
      const startZ = z - el["height"] / 2
      if (!(layerZ > startZ && layerZ <= startZ + el["height"])) return []
      const slice = el["radius"] * (1 - (layerZ - startZ) / el["height"])
      return slice > s.extrusionWidth / 2 ? [circle(x, y, slice, 36)] : []
    }
    case "torus": {
      const major = el["radius"]
      const minor = el["tubeRadius"]
      const dist = Math.abs(layerZ - z)
      if (!(dist <= minor)) return []
      const tube = Math.sqrt(Math.max(0, minor * minor - dist * dist))
      const outer = major + tube
      const inner = major - tube
      if (!(outer > inner && inner >= 0)) return []
      const rings: SliceGeometry = [circle(x, y, outer, 48)]
      // The hole winds the other way, as polygon libraries expect.
      if (inner > 0) rings.push(circle(x, y, inner, 48).reverse())
      return rings
    }
    default:
      return []
  }
}

/** Outlines of every primitive crossing `layerZ`, descending into containers (legacy `getPrimitivesAtLayer`). */
export const outlinesAtLayer = (el: CadElement | undefined, layerZ: number, s: PrinterSettings): SliceGeometry => {
  if (!el) return []
  const bounds = elementZBounds(el)
  if (!bounds || layerZ < bounds.minZ - s.layerHeight || layerZ > bounds.maxZ + s.layerHeight) return []
  if (isContainer(el)) return Array.isArray(el["elements"]) ? el["elements"].flatMap((sub: CadElement) => outlinesAtLayer(sub, layerZ, s)) : []
  return sliceOutline(el, s, layerZ)
}

/**
 * Approximate offset of a polygon along its vertex bisectors (legacy `offsetPolygonSimple`): positive moves
 * away from the material, negative into it. Outer rings run counter-clockwise and holes clockwise, so the
 * material is always on the left of an edge. (The legacy code took the left normal as "outwards", which
 * made every shell and the infill boundary grow instead of shrink.)
 */
export const offsetPolygonSimple = (polygon: Polygon, distance: number): Polygon | null => {
  if (polygon.length < 3) return null
  const out: Polygon = []
  const len = polygon.length
  for (let i = 0; i < len; i++) {
    const p1 = polygon[i]!
    const p2 = polygon[(i + 1) % len]!
    const p3 = polygon[(i + 2) % len]!
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y }
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }
    const n1 = { x: v1.y, y: -v1.x }
    const n2 = { x: v2.y, y: -v2.x }
    const m1 = Math.hypot(n1.x, n1.y)
    const m2 = Math.hypot(n2.x, n2.y)
    if (m1 === 0 || m2 === 0) continue
    const u1 = { x: n1.x / m1, y: n1.y / m1 }
    const u2 = { x: n2.x / m2, y: n2.y / m2 }
    const bis = { x: u1.x + u2.x, y: u1.y + u2.y }
    const bm = Math.hypot(bis.x, bis.y)
    if (bm < 1e-6) continue
    const ub = { x: bis.x / bm, y: bis.y / bm }
    const dot = u1.x * u2.x + u1.y * u2.y
    const sinHalf = Math.sqrt(Math.max(0, (1 + dot) / 2))
    if (sinHalf < 1e-3) continue
    const adjusted = distance / sinHalf
    out.push({ x: p2.x + ub.x * adjusted, y: p2.y + ub.y * adjusted })
  }
  return out.length >= 3 ? out : null
}

const perimeters = (geometry: SliceGeometry, layerZ: number, s: PrinterSettings, e0: number): { gcode: string; e: number } => {
  if (geometry.length === 0) return { gcode: "", e: e0 }
  let gcode = `; Layer Perimeters at Z=${f3(layerZ)}\n`
  let e = e0
  for (const polygon of geometry) {
    if (polygon.length < 3) continue
    for (let shell = 0; shell < s.shellCount; shell++) {
      const shellPolygon = offsetPolygonSimple(polygon, -(shell * s.extrusionWidth))
      if (shellPolygon && shellPolygon.length >= 3) {
        const points: P3[] = shellPolygon.map(p => ({ ...p, z: layerZ }))
        points.push({ ...points[0]! })
        const out = polygonLayer(points, s, e)
        gcode += out.gcode
        e = out.e
      } else {
        gcode += `; Skipping shell ${shell + 1} due to offset failure or polygon too small.\n`
        break
      }
    }
  }
  return { gcode, e }
}

/** Filled stretches of a horizontal line through the outlines (non-zero winding: rings add, holes subtract). */
const fillSpans = (geometry: SliceGeometry, y: number): Array<[number, number]> => {
  const hits: Array<{ x: number; dir: number }> = []
  for (const polygon of geometry) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!
      const b = polygon[(i + 1) % polygon.length]!
      if (a.y === b.y) continue
      if (y >= Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) hits.push({ x: a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y), dir: b.y > a.y ? 1 : -1 })
    }
  }
  hits.sort((p, q) => p.x - q.x)
  const spans: Array<[number, number]> = []
  let winding = 0
  for (let i = 0; i < hits.length - 1; i++) {
    winding += hits[i]!.dir
    if (winding === 0) continue
    const last = spans[spans.length - 1]
    if (last && Math.abs(last[1] - hits[i]!.x) < 1e-9) last[1] = hits[i + 1]!.x
    else spans.push([hits[i]!.x, hits[i + 1]!.x])
  }
  return spans
}

/**
 * Rectilinear ("lines") infill inside the inner boundary, serpentine, spacing from the density. The legacy
 * version drew the bounding box of each outline without ever travelling to the start of a line; here each
 * line is clipped to the outline and the nozzle travels to its start before extruding.
 */
const infill = (geometry: SliceGeometry, layerZ: number, s: PrinterSettings, e0: number): { gcode: string; e: number } => {
  if (geometry.length === 0 || s.infillDensity <= 0) return { gcode: "", e: e0 }
  let gcode = `; Layer Infill at Z=${f3(layerZ)} (Pattern: ${s.infillPattern})\n`
  let e = e0
  if (s.infillPattern === "lines") {
    const ys = geometry.flatMap(polygon => polygon.map(p => p.y))
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const density = Math.max(0.1, Math.min(100, s.infillDensity))
    const spacing = s.extrusionWidth / (density / 100)
    let y = minY
    let direction = 1
    while (y <= maxY) {
      const spans = fillSpans(geometry, y)
      for (const [from, to] of direction === 1 ? spans : [...spans].reverse()) {
        const a: P3 = { x: direction === 1 ? from : to, y, z: layerZ }
        const b: P3 = { x: direction === 1 ? to : from, y, z: layerZ }
        const length = Math.abs(b.x - a.x)
        if (length <= 1e-3) continue
        gcode += moveTo(a, s.travelSpeed || 150, e, 0).gcode
        const move = moveTo(b, s.printSpeed, e, calculateExtrusion(length, s.layerHeight, s.extrusionWidth, s.filamentDiameter))
        gcode += move.gcode
        e = move.e
      }
      y += spacing
      direction *= -1
    }
  } else {
    gcode += `; WARNING: Infill pattern '${s.infillPattern}' not fully implemented for layer-wide infill.\n`
  }
  return { gcode, e }
}

/** Placeholder like the legacy one: names the support type and notes the missing overhang detection. */
const support = (current: SliceGeometry, previous: SliceGeometry | null, s: PrinterSettings): string => {
  if (!previous || s.supportType === "none") return ""
  let gcode = `; Layer Support (Type: ${s.supportType})\n`
  if (current.length > 0 && previous.length === 0) gcode += "; TODO: Implement overhang detection logic\n"
  return gcode
}

export const generateCompositeElement3D = (el: CadElement, s: PrinterSettings): string => {
  const id = el["id"] || "composite"
  let body = `; Start Composite Element: ${id}\n`
  let out = printStartGCode(s)
  let lastZ = 0
  let e = 0

  let minZ: number
  let maxZ: number
  const bounds = elementZBounds(el)
  const x = el["x"] || 0
  const y = el["y"] || 0
  let minX = x - 50
  let maxX = x + 50
  let minY = y - 50
  let maxY = y + 50
  if (!bounds) {
    // Rough estimate from the root element alone, as the legacy code did.
    const radius = el["radius"] || el["width"] || el["height"] || 100
    minX = x - radius; maxX = x + radius; minY = y - radius; maxY = y + radius
    minZ = (el["z"] || 0) - radius
    maxZ = (el["z"] || 0) + radius
  } else {
    minZ = bounds.minZ
    maxZ = bounds.maxZ
  }
  const layers = Math.max(1, Math.ceil((maxZ - minZ) / s.layerHeight))
  body += `; Estimated Layers: ${layers} (MinZ: ${f3(minZ)}, MaxZ: ${f3(maxZ)}) X: ${f3(minX)}..${f3(maxX)} Y: ${f3(minY)}..${f3(maxY)}\n`

  let previous: SliceGeometry | null = null
  for (let layer = 0; layer < layers; layer++) {
    const layerZ = minZ + (layer + 1) * s.layerHeight
    let gcode = `\n; --- COMPOSITE LAYER ${layer + 1} / ${layers} at Z=${f3(layerZ)} --- \n`
    lastZ = Math.max(lastZ, layerZ)
    const current = outlinesAtLayer(el, layerZ, s)

    const shells = perimeters(current, layerZ, s, e)
    gcode += shells.gcode
    let layerE = shells.e

    let inner: SliceGeometry = []
    if (s.shellCount > 0 && s.infillDensity > 0) {
      const distance = s.shellCount * s.extrusionWidth
      for (const polygon of current) {
        const offset = offsetPolygonSimple(polygon, -distance)
        if (offset && offset.length >= 3) inner.push(offset)
      }
    } else if (s.infillDensity > 0) {
      inner = current
    }
    const fill = infill(inner, layerZ, s, layerE)
    gcode += fill.gcode
    layerE = fill.e

    gcode += support(current, previous, s)
    body += gcode
    e = layerE
    previous = current
  }
  void lastZ
  out += body
  out += printEndGCode(s)
  out += `; End Composite Element: ${id}\n`
  return out
}

export type { P2 }
