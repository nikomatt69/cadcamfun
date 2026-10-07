/**
 * 3D printer G-code (port of the legacy `lib/toolpath/3dprinterToolpaths.ts` element generators).
 *
 * Start/end blocks, extrusion maths and the cube / cylinder / sphere / cone / torus / text
 * generators keep the legacy shape: shells only, with the legacy `TODO` notes where infill and supports
 * would go. Composites (and a lone line) are sliced layer by layer in `printer-composite.ts`, which does
 * add rectilinear infill.
 */
import type { CadElement } from "./schema.ts"
import { calculateExtrusion, polygonLayer, printEndGCode, printStartGCode, type P3, type PrinterSettings } from "./printer-base.ts"
import { generateCompositeElement3D } from "./printer-composite.ts"
import { elementBounds, shiftElement } from "./elements.ts"

export { calculateExtrusion, printEndGCode, printStartGCode, generateCompositeElement3D }
export type { PrinterSettings }

const ring = (cx: number, cy: number, z: number, radius: number, segments: number): P3[] => {
  const points: P3[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), z })
  }
  return points
}

const roundShells = (el: CadElement, z: number, radius: number, s: PrinterSettings, e0: number, segments = 36): { gcode: string; e: number } => {
  let gcode = ""
  let e = e0
  for (let shell = 0; shell < s.shellCount; shell++) {
    const r = radius - shell * s.extrusionWidth
    if (r <= 0) break
    const out = polygonLayer(ring(el.x, el.y, z, r, segments), s, e)
    gcode += out.gcode
    e = out.e
  }
  return { gcode, e }
}

const cube3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Cube: center (${el.x}, ${el.y}, ${el.z}), size ${el.width}x${el.height}x${el.depth}\n`
  let e = 0
  const layers = Math.ceil(el.depth / s.layerHeight)
  const hw = el.width / 2
  const hd = el.height / 2
  const startZ = el.z - el.depth / 2
  for (let layer = 0; layer < layers; layer++) {
    const z = startZ + (layer + 1) * s.layerHeight
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${z.toFixed(3)}\n`
    for (let shell = 0; shell < s.shellCount; shell++) {
      const o = shell * s.extrusionWidth
      if (el.width - 2 * o <= 0 || el.height - 2 * o <= 0) break
      const corners: P3[] = [
        { x: el.x - hw + o, y: el.y - hd + o, z },
        { x: el.x + hw - o, y: el.y - hd + o, z },
        { x: el.x + hw - o, y: el.y + hd - o, z },
        { x: el.x - hw + o, y: el.y + hd - o, z },
        { x: el.x - hw + o, y: el.y - hd + o, z }
      ]
      const out = polygonLayer(corners, s, e)
      gcode += out.gcode
      e = out.e
    }
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`
  }
  return gcode
}

const cylinder3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Cylinder: center (${el.x}, ${el.y}, ${el.z}), radius ${el.radius}, height ${el.height}\n`
  let e = 0
  const layers = Math.ceil(el.height / s.layerHeight)
  const startZ = el.z - el.height / 2
  for (let layer = 0; layer < layers; layer++) {
    const z = startZ + (layer + 1) * s.layerHeight
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${z.toFixed(3)}\n`
    const out = roundShells(el, z, el.radius, s, e)
    gcode += out.gcode
    e = out.e
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`
  }
  return gcode
}

const sphere3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Sphere: center (${el.x}, ${el.y}, ${el.z}), radius ${el.radius}\n`
  let e = 0
  const layers = Math.ceil((el.radius * 2) / s.layerHeight)
  const startZ = el.z - el.radius
  for (let layer = 0; layer < layers; layer++) {
    const z = startZ + (layer + 1) * s.layerHeight
    const dist = Math.abs(z - el.z)
    if (dist > el.radius) continue
    const slice = Math.sqrt(el.radius ** 2 - dist ** 2)
    if (slice <= 0) continue
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${z.toFixed(3)}, Slice Radius: ${slice.toFixed(3)}\n`
    const out = roundShells(el, z, slice, s, e)
    gcode += out.gcode
    e = out.e
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`
  }
  return gcode
}

const cone3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Cone: base center (${el.x}, ${el.y}, ${el.z}), base radius ${el.radius}, height ${el.height}\n`
  let e = 0
  const layers = Math.ceil(el.height / s.layerHeight)
  const startZ = el.z - el.height / 2
  for (let layer = 0; layer < layers; layer++) {
    const z = startZ + (layer + 1) * s.layerHeight
    const slice = el.radius * (1 - (z - startZ) / el.height)
    if (slice <= 0) continue
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${z.toFixed(3)}, Slice Radius: ${slice.toFixed(3)}\n`
    const out = roundShells(el, z, slice, s, e)
    gcode += out.gcode
    e = out.e
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`
  }
  return gcode
}

const torus3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Torus: center (${el.x}, ${el.y}, ${el.z}), major radius ${el.radius}, minor radius ${el.tubeRadius}\n`
  let e = 0
  const major = el.radius || 30
  const minor = el.tubeRadius || 10
  const layers = Math.ceil((minor * 2) / s.layerHeight)
  const startZ = el.z - minor
  for (let layer = 0; layer < layers; layer++) {
    const z = startZ + (layer + 1) * s.layerHeight
    const dist = Math.abs(z - el.z)
    if (dist > minor) continue
    const slice = Math.sqrt(minor ** 2 - dist ** 2)
    const outer = major + slice
    const inner = major - slice
    if (outer <= 0 || inner < 0 || inner >= outer) continue
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${z.toFixed(3)}, Outer R: ${outer.toFixed(3)}, Inner R: ${inner.toFixed(3)}\n`
    for (let shell = 0; shell < s.shellCount; shell++) {
      const outerR = outer - shell * s.extrusionWidth
      if (outerR <= inner + (s.shellCount - 1 - shell) * s.extrusionWidth) break
      const o = polygonLayer(ring(el.x, el.y, z, outerR, 48), s, e)
      gcode += o.gcode
      e = o.e
      const innerR = inner + shell * s.extrusionWidth
      if (innerR > 0 && innerR < outerR - s.extrusionWidth) {
        const i = polygonLayer(ring(el.x, el.y, z, innerR, 48).reverse(), s, e)
        gcode += i.gcode
        e = i.e
      }
    }
    gcode += `; TODO: Add torus infill (ring shape) for layer ${layer + 1}\n`
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`
  }
  return gcode
}

const text3D = (el: CadElement, s: PrinterSettings): string => {
  let gcode = `; 3D Print Text: "${el.text}" at (${el.x}, ${el.y}, ${el.z})\n`
  gcode += "; ERROR: Direct 3D printing of text elements is not supported.\n"
  gcode += "; Please convert text to outlines/paths first (e.g., using an SVG export/import).\n"
  const height = el.size || 10
  const width = (el.text?.length || 5) * height * 0.6
  const thickness = el.depth || s.layerHeight * 5
  return gcode + cube3D({ ...el, type: "cube", width, height: width, depth: thickness }, s)
}

/** Body of a printable element (no start/end blocks). */
const elementBody = (el: CadElement, s: PrinterSettings): string => {
  switch (el.type) {
    case "cube": return cube3D(el, s)
    case "cylinder": return cylinder3D(el, s)
    case "sphere": return sphere3D(el, s)
    case "cone": return cone3D(el, s)
    case "torus": return torus3D(el, s)
    case "text":
    case "text3d": return text3D(el, s)
    default: {
      const width = el.width || el.radius * 2 || 10
      const height = el.height || el.radius * 2 || 10
      const depth = el.depth || el.radius * 2 || 10
      const note = `; WARNING: Unsupported element type '${el.type}' for direct 3D printing.\n; Approximating with bounding box.\n`
      return note + cube3D({ type: "cube", x: el.x, y: el.y, z: el.z, width, height, depth }, s)
    }
  }
}

/**
 * Sets the part down on the build plate: its lowest point goes to Z0 (so the first layer is printed one layer height above
 * the bed and every layer above that: a build only goes up), and it is centred on the plate. Returns the moved element and a
 * note when it does not fit. The CAD model keeps its own coordinates; only the program uses the plate's.
 */
export const placeOnBed = (el: CadElement, s: PrinterSettings): { readonly element: CadElement; readonly note: string } => {
  let bounds
  try { bounds = elementBounds(el) } catch { return { element: el, note: "" } }
  if (!Number.isFinite(bounds.min.z) || !Number.isFinite(bounds.min.x)) return { element: el, note: "" }
  const cx = (bounds.min.x + bounds.max.x) / 2
  const cy = (bounds.min.y + bounds.max.y) / 2
  const centre = s.centerOnBed !== false
  // Zero at the plate's centre: the part's own centre is X0 Y0. Zero at the corner: its centre is the plate's centre.
  const originX = s.bedOrigin === "center" ? 0 : (s.bedWidth ?? 220) / 2
  const originY = s.bedOrigin === "center" ? 0 : (s.bedDepth ?? 220) / 2
  const dx = centre ? originX - cx : s.bedOrigin === "center" ? -(s.bedWidth ?? 220) / 2 : 0
  const dy = centre ? originY - cy : s.bedOrigin === "center" ? -(s.bedDepth ?? 220) / 2 : 0
  const dz = -bounds.min.z
  const moved = shiftElement(el, dx, dy, dz)
  const width = bounds.max.x - bounds.min.x
  const depth = bounds.max.y - bounds.min.y
  const fits = width <= (s.bedWidth ?? 220) + 1e-9 && depth <= (s.bedDepth ?? 220) + 1e-9
  const note = `; Part placed on the bed (XY zero: ${s.bedOrigin === "center" ? "plate centre" : "front-left corner"}): bottom at Z0${centre ? `, centred at X${(cx + dx).toFixed(3)} Y${(cy + dy).toFixed(3)}` : ""}\n` +
    (fits ? "" : `; WARNING: the part (${width.toFixed(1)} x ${depth.toFixed(1)} mm) does not fit the ${s.bedWidth ?? 220} x ${s.bedDepth ?? 220} mm bed\n`)
  return { element: moved, note }
}

export const generate3DPrinterGCodeForElement = (original: CadElement, s: PrinterSettings): string => {
  const placed = placeOnBed(original, s)
  const el = placed.element
  if (el.type === "composite" || el.type === "component" || el.type === "group") return placed.note + generateCompositeElement3D(el, s)
  if (el.type === "line") {
    // A lone line has no area to print: like the legacy code it becomes a one-layer composite (the layer is as
    // thick as the stroke), and the result says so.
    const layerHeight = el.strokeWidth || s.extrusionWidth
    const wrapper = { id: "line-wrapper", type: "composite", elements: [el], z: el.z, height: layerHeight }
    return placed.note + generateCompositeElement3D(wrapper, { ...s, layerHeight }) + "; Warning: a line element has no printable area - nothing was extruded\n"
  }
  return printStartGCode(s) + placed.note + elementBody(el, s) + printEndGCode(s)
}
