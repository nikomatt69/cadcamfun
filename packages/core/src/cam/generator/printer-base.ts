/** Settings of the 3D-printer generator (read by the slicer in `../print`) and the bead's extrusion maths. */

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
  /** Maximum height of the build, mm; a taller part is reported, not cut. */
  buildHeight?: number
  /** Solid layers under and over the part. */
  bottomLayers?: number
  topLayers?: number
  /** Height of the first layer, mm (default: the layer height). */
  firstLayerHeight?: number
  /** Speed of the first layer, % of the print speed. */
  firstLayerSpeed?: number
  /** Outer wall, infill, bridge and support speeds, % of the print speed. */
  outerWallSpeed?: number
  infillSpeed?: number
  bridgeSpeed?: number
  supportSpeed?: number
  /** Travel moves shorter than this do not retract, mm; a z-hop lifts the nozzle on the retracted travel. */
  retractMinTravel?: number
  zHop?: number
  /** Part cooling fan, % (0 = no fan), switched on from this layer (1 = the first). */
  fanSpeed?: number
  fanFromLayer?: number
  /** A layer that would print faster than this many seconds is slowed down (down to 10 mm/s). */
  minLayerTime?: number
  /** Extrusion multiplier, %. */
  flow?: number
  /** Where each wall loop starts: next to where the nozzle is, aligned on one corner, or scattered. */
  seam?: "nearest" | "aligned" | "random"
  /** Print the outer wall before the inner ones (default after them). */
  outerWallFirst?: boolean
  /** `buildplate`: supports only where they can stand on the plate; `everywhere`: also on the part itself. */
  supportPlacement?: "buildplate" | "everywhere"
  /** Horizontal and vertical (layers) gap between a support and the part, and the dense layers under an overhang. */
  supportXYGap?: number
  supportZGap?: number
  supportInterfaceLayers?: number
  /** Adhesion to the plate: nothing, skirt, brim or raft. */
  adhesion?: "none" | "skirt" | "brim" | "raft"
  skirtLoops?: number
  skirtDistance?: number
  /** Spiral vase: one continuous outer wall, no infill. */
  vase?: boolean
  flavor?: "marlin" | "klipper" | "reprap"
  /** `M83` relative extruder moves instead of absolute `M82`. */
  relativeExtrusion?: boolean
  /** Pressure / linear advance factor (0 = leave the firmware alone). */
  pressureAdvance?: number
  /** The most melt the hotend delivers, mm^3/s (default: the filament's); a bead that needs more is printed slower. */
  maxVolumetricFlow?: number
  /** Print acceleration, mm/s^2 (0 = leave the firmware alone). */
  acceleration?: number
  /** Lay the part flat on its best face before slicing. */
  autoOrient?: boolean
  /** Replace the start and end blocks; {nozzle}, {bed} and {layer} are filled in. */
  startGcode?: string
  endGcode?: string
}

/** Filament length (mm) for `length` mm of bead. */
export const calculateExtrusion = (length: number, layerHeight: number, extrusionWidth: number, filamentDiameter: number): number => {
  if (length <= 0 || layerHeight <= 0 || extrusionWidth <= 0 || filamentDiameter <= 0) return 0
  const filamentArea = Math.PI * (filamentDiameter / 2) ** 2
  return ((extrusionWidth * layerHeight) / filamentArea) * length
}
