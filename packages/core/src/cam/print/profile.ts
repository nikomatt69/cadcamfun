/**
 * The print profile: every setting of the slicer with its default, resolved from the generator's `PrinterSettings`
 * (which carries only what the caller set). One place decides what an absent value means.
 */
import type { PrinterSettings } from "../generator/printer-base.ts"
import { findFilament } from "./filament.ts"

export type InfillPattern = "lines" | "grid" | "triangles" | "honeycomb" | "gyroid" | "concentric"
export type SupportMode = "none" | "buildplate" | "everywhere"
export type Adhesion = "none" | "skirt" | "brim" | "raft"

export interface PrintProfile {
  readonly layerHeight: number
  readonly firstLayerHeight: number
  readonly extrusionWidth: number
  readonly nozzleDiameter: number
  readonly filamentDiameter: number
  readonly walls: number
  readonly topLayers: number
  readonly bottomLayers: number
  readonly infillDensity: number
  readonly infillPattern: InfillPattern
  /** mm/s */
  readonly printSpeed: number
  readonly travelSpeed: number
  readonly firstLayerSpeed: number
  readonly outerWallSpeed: number
  readonly infillSpeed: number
  readonly bridgeSpeed: number
  readonly supportSpeed: number
  readonly retractionDistance: number
  readonly retractionSpeed: number
  readonly retractMinTravel: number
  readonly zHop: number
  readonly nozzleTemperature: number
  readonly bedTemperature: number
  /** 0..100; 0 = no fan. */
  readonly fanSpeed: number
  /** 1-based layer the fan starts on. */
  readonly fanFromLayer: number
  readonly minLayerTime: number
  /** Extrusion multiplier (1 = nominal). */
  readonly flow: number
  readonly seam: "nearest" | "aligned" | "random"
  readonly outerWallFirst: boolean
  readonly support: SupportMode
  readonly supportAngle: number
  readonly supportDensity: number
  readonly supportXYGap: number
  readonly supportZGap: number
  readonly supportInterfaceLayers: number
  readonly adhesion: Adhesion
  readonly brimWidth: number
  readonly skirtLoops: number
  readonly skirtDistance: number
  readonly raftLayers: number
  readonly vase: boolean
  readonly flavor: "marlin" | "klipper" | "reprap"
  readonly relativeExtrusion: boolean
  readonly pressureAdvance: number
  /** The most melt the hotend delivers, mm^3/s; a bead that would need more is printed slower. 0 = no limit. */
  readonly maxVolumetricFlow: number
  readonly acceleration: number
  readonly bedWidth: number
  readonly bedDepth: number
  readonly buildHeight: number
  readonly bedOrigin: "corner" | "center"
  readonly centerOnBed: boolean
  readonly material: string
  readonly autoOrient: boolean
  readonly startGcode: string | undefined
  readonly endGcode: string | undefined
}

const positive = (value: number | undefined, fallback: number): number => (value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback)
const nonNegative = (value: number | undefined, fallback: number): number => (value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback)

const PATTERNS: ReadonlyArray<InfillPattern> = ["lines", "grid", "triangles", "honeycomb", "gyroid", "concentric"]

export const resolveProfile = (s: PrinterSettings): PrintProfile => {
  const layerHeight = positive(s.layerHeight, 0.2)
  const extrusionWidth = positive(s.extrusionWidth, positive(s.nozzleDiameter, 0.4))
  const supportType = s.supportType
  const raft = s.adhesion === "raft" || (s.adhesion === undefined && (s.raftLayers ?? 0) > 0)
  const brimWidth = nonNegative(s.brimWidth, 0)
  const adhesion: Adhesion = s.adhesion ?? (raft ? "raft" : brimWidth > 0 ? "brim" : "none")
  return {
    layerHeight,
    firstLayerHeight: positive(s.firstLayerHeight, layerHeight),
    extrusionWidth,
    nozzleDiameter: positive(s.nozzleDiameter, extrusionWidth),
    filamentDiameter: positive(s.filamentDiameter, 1.75),
    walls: Math.max(0, Math.round(nonNegative(s.shellCount, 2))),
    topLayers: Math.max(0, Math.round(nonNegative(s.topLayers, 4))),
    bottomLayers: Math.max(0, Math.round(nonNegative(s.bottomLayers, 4))),
    infillDensity: Math.min(100, nonNegative(s.infillDensity, 20)),
    infillPattern: PATTERNS.includes(s.infillPattern as InfillPattern) ? (s.infillPattern as InfillPattern) : "grid",
    printSpeed: positive(s.printSpeed, 60),
    travelSpeed: positive(s.travelSpeed, 150),
    firstLayerSpeed: positive(s.firstLayerSpeed, 50) / 100,
    outerWallSpeed: positive(s.outerWallSpeed, 70) / 100,
    infillSpeed: positive(s.infillSpeed, 100) / 100,
    bridgeSpeed: positive(s.bridgeSpeed, 50) / 100,
    supportSpeed: positive(s.supportSpeed, 100) / 100,
    retractionDistance: nonNegative(s.retractionDistance, 2),
    retractionSpeed: positive(s.retractionSpeed, 40),
    retractMinTravel: nonNegative(s.retractMinTravel, 1.5),
    zHop: nonNegative(s.zHop, 0),
    nozzleTemperature: positive(s.printTemperature, 200),
    bedTemperature: nonNegative(s.bedTemperature, 60),
    fanSpeed: Math.min(100, nonNegative(s.fanSpeed, 100)),
    fanFromLayer: Math.max(1, Math.round(positive(s.fanFromLayer, 2))),
    minLayerTime: nonNegative(s.minLayerTime, 5),
    flow: positive(s.flow, 100) / 100,
    seam: s.seam ?? "nearest",
    outerWallFirst: s.outerWallFirst === true,
    support: supportType === "none" || supportType === undefined ? "none" : (s.supportPlacement ?? (supportType === "full" ? "everywhere" : "buildplate")),
    supportAngle: Math.min(89, positive(s.supportOverhangAngle, 45)),
    supportDensity: Math.min(100, positive(s.supportDensity, 15)),
    supportXYGap: nonNegative(s.supportXYGap, 0.6),
    supportZGap: Math.max(0, Math.round(nonNegative(s.supportZGap, 1))),
    supportInterfaceLayers: Math.max(0, Math.round(nonNegative(s.supportInterfaceLayers, 2))),
    adhesion,
    brimWidth: adhesion === "brim" ? positive(brimWidth, 8) : brimWidth,
    skirtLoops: Math.max(1, Math.round(positive(s.skirtLoops, 2))),
    skirtDistance: nonNegative(s.skirtDistance, 3),
    raftLayers: adhesion === "raft" ? Math.max(1, Math.round(positive(s.raftLayers, 3))) : 0,
    vase: s.vase === true,
    flavor: s.flavor ?? "marlin",
    relativeExtrusion: s.relativeExtrusion === true,
    pressureAdvance: nonNegative(s.pressureAdvance, 0),
    maxVolumetricFlow: nonNegative(s.maxVolumetricFlow, findFilament(s.material)?.maxVolumetricFlow ?? 0),
    acceleration: nonNegative(s.acceleration, 0),
    bedWidth: positive(s.bedWidth, 220),
    bedDepth: positive(s.bedDepth, 220),
    buildHeight: positive(s.buildHeight, 250),
    bedOrigin: s.bedOrigin ?? "corner",
    centerOnBed: s.centerOnBed !== false,
    material: s.material ?? "pla",
    autoOrient: s.autoOrient === true,
    startGcode: s.startGcode,
    endGcode: s.endGcode
  }
}

/** Filament density, g/cm^3, from the material name; anything that is not a known grade weighs like PLA. */
export const filamentDensity = (material: string): number => findFilament(material)?.densityGcm3 ?? 1.24
