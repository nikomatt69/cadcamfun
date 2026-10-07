/** Shared pieces of the 3D-printer generator: settings, start/end blocks, extrusion maths, polygon layers. */

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
  /** Build plate, mm; the part is centred on it unless `centerOnBed` is false. */
  bedWidth?: number
  bedDepth?: number
  centerOnBed?: boolean
  /** `center`: X0 Y0 is the middle of the plate (delta printers); default the front-left corner. */
  bedOrigin?: "corner" | "center"
}

export interface P3 { x: number; y: number; z: number }
export interface P2 { x: number; y: number }
export type Polygon = P2[]
export type SliceGeometry = Polygon[]

export const f3 = (n: number): string => n.toFixed(3)

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

export const moveTo = (p: P3, speed: number, e: number, amount: number): { gcode: string; e: number } => {
  const next = e + amount
  let gcode = `G1 X${f3(p.x)} Y${f3(p.y)} Z${f3(p.z)}`
  if (amount > 0) gcode += ` E${next.toFixed(5)}`
  return { gcode: `${gcode} F${speed * 60}\n`, e: next }
}

/** Travel to the first point, then extrude along the polygon. */
export const polygonLayer = (points: ReadonlyArray<P3>, s: PrinterSettings, e0: number): { gcode: string; e: number } => {
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
