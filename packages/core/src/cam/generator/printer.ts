/**
 * 3D printer G-code (port of the legacy `lib/toolpath/3dprinterToolpaths.ts` element generators).
 *
 * Start/end blocks, extrusion maths and the cube / cylinder / sphere / cone / torus / text
 * layer generators keep the legacy shape. Composites print each child in turn between one
 * start and one end block.
 */
import type { CadElement } from "./schema.ts"

export interface PrinterSettings {
  layerHeight: number
  printSpeed: number
  travelSpeed?: number
  printTemperature: number
  bedTemperature: number
  extrusionWidth: number
  filamentDiameter: number
  retractionDistance?: number
  retractionSpeed?: number
  infillDensity: number
  infillPattern: string
  shellCount: number
  supportType: string
  supportOverhangAngle?: number
  supportDensity?: number
  raftLayers?: number
  brimWidth?: number
  material?: string
  nozzleDiameter?: number
}

interface P3 { x: number; y: number; z: number }

const f3 = (n: number): string => n.toFixed(3)

export const printStartGCode = (s: PrinterSettings): string =>
  "; Print Start G-code\n" +
  "M82 ; Set extruder to absolute mode\n" +
  "G21 ; Set units to millimeters\n" +
  "G90 ; Use absolute coordinates\n" +
  `M104 S${s.printTemperature} ; Set extruder temperature (no wait)\n` +
  `M140 S${s.bedTemperature} ; Set bed temperature (no wait)\n` +
  "G28 ; Home all axes\n" +
  `M109 S${s.printTemperature} ; Wait for extruder temperature\n` +
  `M190 S${s.bedTemperature} ; Wait for bed temperature\n` +
  "G1 Z5 F5000 ; Move Z up\n" +
  "G1 X0 Y0 Z0.2 F3000 ; Move to prime position\n" +
  "G92 E0 ; Reset extruder position\n" +
  "G1 E5 F1800 ; Prime the extruder\n" +
  "G92 E0 ; Reset extruder position again\n" +
  "G1 Z0.3 F3000 ; Lift slightly before starting print\n\n"

export const printEndGCode = (s: PrinterSettings): string =>
  "\n; Print End G-code\n" +
  `G1 E-${s.retractionDistance || 2} F${(s.retractionSpeed || 60) * 60} ; Retract filament\n` +
  "G91 ; Relative positioning\n" +
  "G1 Z5 F3000 ; Move Z up relative\n" +
  "G90 ; Absolute positioning\n" +
  "G1 X0 Y200 F3000 ; Present print (move Y forward)\n" +
  "M104 S0 ; Turn off extruder temperature\n" +
  "M140 S0 ; Turn off bed temperature\n" +
  "M84 ; Disable motors\n"

/** Filament length (mm) for `length` mm of bead. */
export const calculateExtrusion = (length: number, layerHeight: number, extrusionWidth: number, filamentDiameter: number): number => {
  if (length <= 0 || layerHeight <= 0 || extrusionWidth <= 0 || filamentDiameter <= 0) return 0
  const filamentArea = Math.PI * (filamentDiameter / 2) ** 2
  return ((extrusionWidth * layerHeight) / filamentArea) * length
}

const moveTo = (p: P3, speed: number, e: number, amount: number): { gcode: string; e: number } => {
  const next = e + amount
  let gcode = `G1 X${f3(p.x)} Y${f3(p.y)} Z${f3(p.z)}`
  if (amount > 0) gcode += ` E${next.toFixed(5)}`
  return { gcode: `${gcode} F${speed * 60}\n`, e: next }
}

const polygonLayer = (points: ReadonlyArray<P3>, s: PrinterSettings, e0: number): { gcode: string; e: number } => {
  if (points.length < 2) return { gcode: "", e: e0 }
  let e = e0
  let gcode = moveTo(points[0]!, s.travelSpeed || 150, e, 0).gcode
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const move = moveTo(b, s.printSpeed, e, calculateExtrusion(Math.hypot(b.x - a.x, b.y - a.y), s.layerHeight, s.extrusionWidth, s.filamentDiameter))
    gcode += move.gcode
    e = move.e
  }
  return { gcode, e }
}

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

/** Body of a printable element (no start/end blocks) and the highest Z it reaches. */
const elementBody = (el: CadElement, s: PrinterSettings): { body: string; lastZ: number } => {
  switch (el.type) {
    case "cube": return { body: cube3D(el, s), lastZ: el.z + el.depth / 2 }
    case "cylinder": return { body: cylinder3D(el, s), lastZ: el.z + el.height / 2 }
    case "sphere": return { body: sphere3D(el, s), lastZ: el.z + el.radius }
    case "cone": return { body: cone3D(el, s), lastZ: el.z + el.height / 2 }
    case "torus": return { body: torus3D(el, s), lastZ: el.z + (el.tubeRadius || 10) }
    case "text":
    case "text3d": return { body: text3D(el, s), lastZ: el.z + (el.depth || 5) }
    default: {
      const width = el.width || el.radius * 2 || 10
      const height = el.height || el.radius * 2 || 10
      const depth = el.depth || el.radius * 2 || 10
      const note = `; WARNING: Unsupported element type '${el.type}' for direct 3D printing.\n; Approximating with bounding box.\n`
      return { body: note + cube3D({ type: "cube", x: el.x, y: el.y, z: el.z, width, height, depth }, s), lastZ: el.z + depth / 2 }
    }
  }
}

export const generateCompositeElement3D = (el: CadElement, s: PrinterSettings): string => {
  const children: CadElement[] = Array.isArray(el.elements) ? el.elements : []
  if (children.length === 0) return "; Error: composite element has no sub-elements\n"
  let body = `; 3D Print Composite: ${children.length} sub-elements\n`
  let lastZ = 0
  for (const child of children) {
    if (!child) continue
    if (child.type === "composite" || child.type === "group" || child.type === "component") {
      body += generateCompositeElement3D(child, s)
      continue
    }
    const part = elementBody(child, s)
    body += part.body
    lastZ = Math.max(lastZ, part.lastZ)
  }
  return printStartGCode(s) + body + printEndGCode(s)
}

export const generate3DPrinterGCodeForElement = (el: CadElement, s: PrinterSettings): string => {
  if (el.type === "composite" || el.type === "component" || el.type === "group") return generateCompositeElement3D(el, s)
  return printStartGCode(s) + elementBody(el, s).body + printEndGCode(s)
}
