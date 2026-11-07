/**
 * A runnable example for every machining operation the toolpath generator writes: the settings (valid against the real
 * `ToolpathSettings` schema), a small demo part in millimetres, and the keys of its name and one line of description.
 *
 * Pure data and pure functions, no UI: the picker (`OperationExamples.tsx`) shows them, and the test runs every one of them
 * through `generateToolpath`, so an example can never name a setting the generator no longer understands.
 *
 * Cutting data are the ones a shop would start from for the named material (carbide end mills; chip load per tooth x flutes x
 * rpm). The demo geometry is either one of the panel's own shapes, a few lines of NC text (the canned cycles the quick drill
 * does not write), a small part made of CAD primitives set on a stock, or nothing (a lathe works from the bar in the settings).
 */
import { cam } from "@cadcamfun/core"
import type { Key } from "../../../../i18n/index.ts"

const g = cam.generator

export type ExampleSettings = cam.generator.ToolpathSettings
export type ExamplePrinter = cam.generator.PrinterExtras
export type ExampleElement = Readonly<Record<string, unknown>>

/** The raw piece of a part example, in the coordinates of the CAD workpiece (top face at `topZ`). */
export interface ExampleStock {
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly x: number
  readonly y: number
  readonly topZ: number
  readonly allowance: number
}

export type ExampleGeometry =
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "polygon"; readonly sides: number; readonly radius: number }
  /** NC text the generator wraps in its program (the canned cycles of the Fixed Cycles section). */
  | { readonly kind: "gcode"; readonly text: string }
  /** CAD primitives set on a stock: what the operation reads from the selection. */
  | { readonly kind: "part"; readonly elements: ReadonlyArray<ExampleElement>; readonly stock: ExampleStock }
  /** A lathe or a probe works from the settings alone. */
  | { readonly kind: "none" }

export type ExampleFamily = "mill-2d" | "mill-drilling" | "mill-thread" | "mill-3d" | "mill-probe" | "lathe" | "print"

export interface OperationExample {
  readonly id: string
  readonly family: ExampleFamily
  readonly title: Key
  readonly description: Key
  /** The strategy palette cells (`StrategyPalette.data.ts`) this example illustrates; the picker lists them first for the cell. */
  readonly cells: ReadonlyArray<string>
  /** Keys of the settings this example sets; every other setting keeps its value when the example is applied. */
  readonly settings: Partial<ExampleSettings>
  /** The print profile (3D printer examples). */
  readonly printer?: Partial<ExamplePrinter>
  readonly geometry: ExampleGeometry
}

const keyOf = (id: string, part: "title" | "desc"): Key => `cam.example.op.${id}.${part}` as Key

const define = (
  id: string,
  family: ExampleFamily,
  cells: ReadonlyArray<string>,
  settings: Partial<ExampleSettings>,
  geometry: ExampleGeometry,
  printer?: Partial<ExamplePrinter>
): OperationExample => ({
  id, family, cells, settings, geometry,
  title: keyOf(id, "title"), description: keyOf(id, "desc"),
  ...(printer !== undefined ? { printer } : {})
})

const stock = (width: number, height: number, depth: number): ExampleStock => ({ width, height, depth, x: 0, y: 0, topZ: 0, allowance: 1 })
const part = (elements: ReadonlyArray<ExampleElement>, raw: ExampleStock): ExampleGeometry => ({ kind: "part", elements, stock: raw })
const rect = (width: number, height: number): ExampleGeometry => ({ kind: "rectangle", width, height })

// -- cutting data ---------------------------------------------------------------------------------------------------------
// Carbide end mills. Chip load x flutes x rpm gives the feed; the plunge is a third of it.

const ALUMINUM = { material: "aluminum", rpm: 10000, feedrate: 1800, plungerate: 600 } as const
const STEEL = { material: "steel", rpm: 3200, feedrate: 640, plungerate: 200 } as const
const BRASS = { material: "brass", rpm: 9000, feedrate: 1200, plungerate: 400 } as const
const WOOD = { material: "wood", rpm: 16000, feedrate: 1500, plungerate: 500 } as const
const PLASTIC = { material: "plastic", rpm: 12000, feedrate: 1600, plungerate: 500 } as const

/**
 * What every milling example starts from, so applying one after another never leaves the previous one's finishing pass,
 * compensation or surface strategy behind.
 */
const MILL = {
  machineType: "mill", direction: "climb", coolant: true, offset: "outside", stepover: 40, scallop: 0,
  finishingPass: false, useToolCompensation: false, useRestMachining: false, surfaceStrategy: "roughing", surfaceClearing: "contour"
} as const

/** The print profile every printing example starts from (the filament and what the example is about come on top). */
const PRINT = {
  infillDensity: 20, infillPattern: "grid", supportType: "none", shellCount: 2, topLayers: 4, bottomLayers: 4,
  adhesion: "none", brimWidth: 8, raftLayers: 3
} as const

// -- demo parts -----------------------------------------------------------------------------------------------------------

/** Four Ø`d` holes on a 50 x 30 grid, as circles in a plate. */
const holes = (diameter: number): ReadonlyArray<ExampleElement> =>
  ([[-25, -15], [25, -15], [25, 15], [-25, 15]] as const).map(([x, y], i) => ({ id: `hole-${i + 1}`, type: "circle", radius: diameter / 2, x, y, z: 0 }))

/** A dome on a base: the part of every 3D example. */
const DOME = part([{ id: "dome", type: "sphere", radius: 12, x: 0, y: 0, z: -12 }], stock(40, 40, 14))

/** A floor and a raised wall: a stepped part, for the flats and the pencil finish along the wall. */
const STEPPED = part([
  { id: "floor", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
  { id: "wall", type: "cube", width: 15, height: 50, depth: 6, x: 17.5, y: 0, z: -3 }
], stock(50, 50, 12))

/** Two walls meeting at a right angle on a floor: the inside corner a large tool cannot reach, for rest roughing. */
const CORNER = part([
  { id: "floor", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
  { id: "wall-x", type: "cube", width: 15, height: 50, depth: 6, x: 17.5, y: 0, z: -3 },
  { id: "wall-y", type: "cube", width: 50, height: 15, depth: 6, x: 0, y: 17.5, z: -3 }
], stock(50, 50, 12))

// -- canned cycles ----------------------------------------------------------------------------------------------------------

const POINTS: ReadonlyArray<readonly [number, number]> = [[-20, -10], [20, -10], [20, 10], [-20, 10]]
const cycleLines = (type: cam.generator.FixedCycleType, params: cam.generator.FixedCycleParams): string =>
  POINTS.map(([x, y]) => g.generateFixedCycleGCode(type, { ...params, x, y })).join("\n")
/** Rapid above the first hole, the cycle on every hole, then `G80`. */
const cycleText = (lines: string): string => `G0 X${POINTS[0]![0]} Y${POINTS[0]![1]} Z10\n${lines}\nG80`

const DRILL = { ...MILL, ...ALUMINUM, operationType: "drill", toolType: "drill", flutes: 2, tolerance: 0.01 } as const

export const OPERATION_EXAMPLES: ReadonlyArray<OperationExample> = [
  // ---- milling, 2.5D
  define("contour-plate", "mill-2d", ["contour"],
    { ...MILL, ...ALUMINUM, operationType: "contour", toolType: "endmill", toolDiameter: 8, flutes: 3, depth: 6, stepdown: 3, offset: "outside" },
    rect(80, 50)),
  define("contour-finish", "mill-2d", [],
    { ...MILL, ...STEEL, operationType: "contour", toolType: "endmill", toolDiameter: 10, flutes: 4, depth: 8, stepdown: 2, offset: "outside", finishingPass: true, finishingAllowance: 0.2 },
    { kind: "polygon", sides: 6, radius: 25 }),
  define("profile-comp", "mill-2d", [],
    { ...MILL, ...BRASS, operationType: "profile", toolType: "endmill", toolDiameter: 6, flutes: 3, depth: 4, stepdown: 2, offset: "outside", useToolCompensation: true },
    rect(60, 40)),
  define("contour-disc", "mill-2d", [],
    { ...MILL, ...PLASTIC, operationType: "contour", toolType: "endmill", toolDiameter: 6, flutes: 2, depth: 5, stepdown: 2.5, offset: "outside", direction: "climb" },
    { kind: "circle", radius: 20 }),
  define("chamfer-edge", "mill-2d", [],
    { ...MILL, ...ALUMINUM, rpm: 8000, feedrate: 900, plungerate: 300, operationType: "contour", toolType: "chamfer", toolDiameter: 12, flutes: 4, depth: 1, stepdown: 0.5, offset: "outside" },
    rect(70, 40)),
  define("pocket-rect", "mill-2d", ["pocket"],
    { ...MILL, ...ALUMINUM, operationType: "pocket", toolType: "endmill", toolDiameter: 8, flutes: 3, depth: 8, stepdown: 2, stepover: 45 },
    rect(60, 40)),
  define("pocket-round", "mill-2d", [],
    { ...MILL, ...STEEL, rpm: 4000, feedrate: 480, plungerate: 160, operationType: "pocket", toolType: "endmill", toolDiameter: 6, flutes: 3, depth: 5, stepdown: 1, stepover: 35 },
    { kind: "circle", radius: 18 }),
  define("pocket-hex", "mill-2d", [],
    { ...MILL, ...BRASS, operationType: "pocket", toolType: "endmill", toolDiameter: 6, flutes: 3, depth: 4, stepdown: 2, stepover: 40 },
    { kind: "polygon", sides: 6, radius: 22 }),
  define("pocket-slot", "mill-2d", ["slot"],
    { ...MILL, ...ALUMINUM, operationType: "pocket", toolType: "endmill", toolDiameter: 6, flutes: 3, depth: 6, stepdown: 2, stepover: 50 },
    rect(70, 10)),
  define("face-skim", "mill-2d", ["face"],
    { ...MILL, ...ALUMINUM, rpm: 6000, feedrate: 2400, plungerate: 800, operationType: "pocket", toolType: "endmill", toolDiameter: 20, flutes: 4, depth: 0.5, stepdown: 0.5, stepover: 70 },
    rect(100, 60)),
  define("engrave-plaque", "mill-2d", ["engrave"],
    { ...MILL, ...WOOD, operationType: "engrave", toolType: "vbit", toolDiameter: 6, flutes: 2, depth: 0.5, stepdown: 0.5 },
    part([{ id: "plaque", type: "rectangle", width: 60, height: 30, x: 0, y: 0, z: 0 }], stock(80, 50, 10))),

  // ---- milling, drilling and the canned cycles
  define("drill-through", "mill-drilling", ["drill"],
    { ...DRILL, toolDiameter: 6, depth: 12, stepdown: 12, rpm: 5000, feedrate: 400, plungerate: 400 },
    part(holes(6), stock(80, 50, 15))),
  define("drill-peck", "mill-drilling", ["drill_deep", "drill_peck"],
    { ...MILL, ...STEEL, operationType: "drill", toolType: "drill", toolDiameter: 8, flutes: 2, depth: 24, stepdown: 6, rpm: 1800, feedrate: 180, plungerate: 180 },
    part(holes(8), stock(80, 50, 30))),
  define("drill-spot", "mill-drilling", ["drill_center"],
    { ...DRILL, toolDiameter: 6, depth: 2.5, stepdown: 2.5, rpm: 6000, feedrate: 300, plungerate: 300 },
    { kind: "gcode", text: cycleText(cycleLines(cam.generator.FixedCycleType.DRILLING_DWELL, { z: -2.5, r: 2, p: 0.3, f: 300 })) }),
  define("drill-chipbreak", "mill-drilling", ["drill_chip_break"],
    { ...DRILL, toolDiameter: 5, depth: 15, stepdown: 3, rpm: 5500, feedrate: 350, plungerate: 350 },
    { kind: "gcode", text: cycleText(POINTS.map(([x, y]) => `G73 X${x.toFixed(3)} Y${y.toFixed(3)} Z-15.000 R2.000 Q3.000 F350`).join("\n")) }),
  define("drill-tap", "mill-drilling", ["drill_tapping"],
    { ...DRILL, toolType: "threadmill", toolDiameter: 6, depth: 10, stepdown: 10, rpm: 400, feedrate: 400, plungerate: 400 },
    { kind: "gcode", text: cycleText(cycleLines(cam.generator.FixedCycleType.RIGHT_TAPPING, { z: -10, r: 5, f: 400, s: 400 })) }),
  define("drill-ream", "mill-drilling", ["drill_reaming"],
    { ...DRILL, toolType: "reamer", toolDiameter: 8, depth: 12, stepdown: 12, rpm: 600, feedrate: 200, plungerate: 200 },
    { kind: "gcode", text: cycleText(cycleLines(cam.generator.FixedCycleType.BORING, { z: -12, r: 2, f: 200 })) }),
  define("drill-bore", "mill-drilling", ["drill_boring"],
    { ...DRILL, toolType: "drill", toolDiameter: 16, depth: 14, stepdown: 14, rpm: 1200, feedrate: 120, plungerate: 120 },
    { kind: "gcode", text: cycleText(cycleLines(cam.generator.FixedCycleType.BORING_DWELL, { z: -14, r: 2, p: 0.5, f: 120 })) }),
  define("drill-back-bore", "mill-drilling", ["drill_back_bore"],
    { ...DRILL, toolType: "drill", toolDiameter: 12, depth: 10, stepdown: 10, rpm: 900, feedrate: 90, plungerate: 90 },
    { kind: "gcode", text: cycleText(cycleLines(cam.generator.FixedCycleType.BACK_BORING, { z: -10, r: 2, f: 90, k: 2 })) }),

  // ---- milling, thread
  define("thread-internal", "mill-thread", ["thread-milling"],
    { ...MILL, ...ALUMINUM, rpm: 6000, feedrate: 300, plungerate: 100, operationType: "threading", toolType: "threadmill", toolDiameter: 6, flutes: 3, depth: 12, threadPitch: 1.5, threadType: "internal", threadHand: "right", threadPasses: 2, threadSpringPasses: 1 },
    part([{ id: "hole", type: "circle", radius: 5, x: 0, y: 0, z: 0 }], stock(40, 40, 15))),
  define("thread-external", "mill-thread", [],
    { ...MILL, ...STEEL, rpm: 2400, feedrate: 220, plungerate: 90, operationType: "threading", toolType: "threadmill", toolDiameter: 8, flutes: 3, depth: 15, threadPitch: 1.75, threadType: "external", threadHand: "right", threadPasses: 3, threadSpringPasses: 1 },
    part([{ id: "boss", type: "cylinder", radius: 6, height: 20, x: 0, y: 0, z: -10 }], stock(30, 30, 20))),

  // ---- milling, 3D surface
  define("surface-rough", "mill-3d", ["3d_surface"],
    { ...MILL, ...ALUMINUM, operationType: "3d_surface", surfaceStrategy: "roughing", surfaceClearing: "contour", toolType: "endmill", toolDiameter: 6, flutes: 3, depth: 10, stepdown: 3, stepover: 45, tolerance: 0.02 },
    DOME),
  define("surface-adaptive", "mill-3d", ["3d_surface_adaptive"],
    { ...MILL, ...ALUMINUM, operationType: "3d_surface", surfaceStrategy: "roughing", surfaceClearing: "adaptive", adaptiveEngagement: 12, toolType: "endmill", toolDiameter: 8, flutes: 3, depth: 10, stepdown: 5, stepover: 12, tolerance: 0.02 },
    DOME),
  define("surface-parallel", "mill-3d", ["3d_surface_parallel"],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "parallel", toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 3, stepover: 10, scallop: 0.05, rasterAngle: 0, tolerance: 0.02 },
    DOME),
  define("surface-waterline", "mill-3d", ["3d_surface_waterline"],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "waterline", toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 1.5, stepover: 10, tolerance: 0.02 },
    DOME),
  define("surface-steep-shallow", "mill-3d", [],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "steep-shallow", steepAngle: 40, toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 1.5, stepover: 10, scallop: 0.05, tolerance: 0.02 },
    DOME),
  define("surface-scallop", "mill-3d", ["3d_surface_scallop"],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "scallop", toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 3, stepover: 10, scallop: 0.05, tolerance: 0.02 },
    DOME),
  define("surface-spiral", "mill-3d", ["3d_surface_flowline"],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "spiral", toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 3, stepover: 10, scallop: 0.05, tolerance: 0.02 },
    DOME),
  define("surface-radial", "mill-3d", [],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 2000, operationType: "3d_surface", surfaceStrategy: "radial", toolType: "ballnose", toolDiameter: 6, flutes: 2, depth: 10, stepdown: 3, stepover: 10, scallop: 0.05, tolerance: 0.02 },
    DOME),
  define("surface-flat", "mill-3d", [],
    { ...MILL, ...ALUMINUM, operationType: "3d_surface", surfaceStrategy: "flat", toolType: "endmill", toolDiameter: 8, flutes: 3, depth: 9, stepdown: 3, stepover: 45, tolerance: 0.02 },
    STEPPED),
  define("surface-pencil", "mill-3d", ["3d_surface_pencil"],
    { ...MILL, ...ALUMINUM, rpm: 14000, feedrate: 1600, operationType: "3d_surface", surfaceStrategy: "parallel", toolType: "ballnose", toolDiameter: 2, flutes: 2, depth: 6, stepdown: 3, stepover: 40, scallop: 0.05, useRestMachining: true, restToolDiameter: 6, tolerance: 0.02 },
    STEPPED),
  define("surface-rest", "mill-3d", ["3d_surface_rest"],
    { ...MILL, ...ALUMINUM, rpm: 12000, feedrate: 1500, operationType: "3d_surface", surfaceStrategy: "roughing", toolType: "endmill", toolDiameter: 4, flutes: 3, depth: 9, stepdown: 3, stepover: 40, useRestMachining: true, restToolDiameter: 10, tolerance: 0.02 },
    CORNER),

  // ---- probing
  define("probe-top", "mill-probe", ["probing"],
    { ...MILL, material: "aluminum", operationType: "probing", toolType: "probe", toolDiameter: 4, probeCycle: "zSurface", probeFeed: 100, probeSearch: 10, probeStylus: 4, coolant: false },
    { kind: "none" }),
  define("probe-corner", "mill-probe", [],
    { ...MILL, material: "aluminum", operationType: "probing", toolType: "probe", toolDiameter: 4, probeCycle: "corner", probeFeed: 100, probeSearch: 12, probeStylus: 4, coolant: false },
    { kind: "none" }),
  define("probe-bore", "mill-probe", [],
    { ...MILL, material: "aluminum", operationType: "probing", toolType: "probe", toolDiameter: 4, probeCycle: "bore", probeFeatureSize: 20, probeFeed: 100, probeSearch: 12, probeStylus: 4, coolant: false },
    { kind: "none" }),
  define("probe-boss", "mill-probe", [],
    { ...MILL, material: "aluminum", operationType: "probing", toolType: "probe", toolDiameter: 4, probeCycle: "boss", probeFeatureSize: 30, probeFeed: 100, probeSearch: 12, probeStylus: 4, coolant: false },
    { kind: "none" }),
  define("probe-tool", "mill-probe", ["toolLength"],
    { ...MILL, material: "aluminum", operationType: "probing", toolType: "toolsetter", toolDiameter: 6, probeCycle: "toolLength", probeFeed: 80, probeSearch: 20, coolant: false },
    { kind: "none" }),

  // ---- lathe: a Ø40 x 80 bar held 25 mm deep in a 3-jaw chuck
  ...([
    ["lathe-facing", ["facing"], "facing", "facing", "external", { depth: 1, stepdown: 0.5 }],
    ["lathe-turning", ["turning"], "turning", "turning", "external", { depth: 3, stepdown: 1 }],
    ["lathe-turning-id", [], "turning", "boring", "internal", { depth: 2, stepdown: 0.5 }],
    ["lathe-boring", ["boring"], "boring", "boring", "internal", { depth: 1.5, stepdown: 0.5 }],
    ["lathe-threading", ["threading"], "threading", "threading", "external", { depth: 0.9, stepdown: 0.3 }],
    ["lathe-grooving", ["grooving"], "grooving", "grooving", "external", { depth: 2, stepdown: 0.5 }],
    ["lathe-parting", ["parting"], "parting", "parting", "external", { depth: 20, stepdown: 1 }],
    ["lathe-knurling", ["knurling"], "knurling", "turning", "external", { depth: 0.4, stepdown: 0.2 }]
  ] as const).map(([id, cells, operationType, toolType, turningOperation, cut]) => define(id, "lathe", cells, {
    machineType: "lathe", material: "steel", operationType, toolType, turningOperation, spindleDirection: "cw",
    stockDiameter: 40, stockLength: 80, gripLength: 25, chuckType: "3-jaw", rpm: 1500, feedrate: 150, plungerate: 100, coolant: true,
    // Internal cuts start from a declared Ø12 pilot bore, which the generator requires.
    ...(turningOperation === "internal" ? { stockBore: 12 } : {}), ...cut
  }, { kind: "none" })),

  // ---- 3D printing: a 0.4 mm nozzle, PLA unless the part asks for more
  define("print-standard", "print", ["standard"],
    { machineType: "3dprinter", operationType: "standard", toolType: "standard", nozzleDiameter: 0.4, layerHeight: 0.2, printSpeed: 60, printTemperature: 210, bedTemperature: 60 },
    part([{ id: "block", type: "cube", width: 30, height: 30, depth: 20, x: 0, y: 0, z: 10 }], stock(30, 30, 20)),
    { ...PRINT, filament: "pla" }),
  define("print-vase", "print", ["vase"],
    { machineType: "3dprinter", operationType: "vase", toolType: "standard", nozzleDiameter: 0.6, layerHeight: 0.3, extrusionWidth: 0.6, printSpeed: 50, printTemperature: 215, bedTemperature: 60 },
    part([{ id: "vase", type: "cylinder", radius: 15, height: 30, x: 0, y: 0, z: 15 }], stock(30, 30, 30)),
    { ...PRINT, filament: "pla", infillDensity: 0 }),
  define("print-support", "print", ["support"],
    { machineType: "3dprinter", operationType: "support", toolType: "standard", nozzleDiameter: 0.4, layerHeight: 0.2, printSpeed: 50, printTemperature: 235, bedTemperature: 80 },
    part([
      { id: "post", type: "cube", width: 10, height: 10, depth: 20, x: 0, y: 0, z: 10 },
      { id: "arm", type: "cube", width: 40, height: 10, depth: 6, x: 15, y: 0, z: 23 }
    ], stock(50, 10, 26)),
    { ...PRINT, filament: "petg", supportType: "minimal", supportAngle: 45, supportDensity: 15 }),
  define("print-infill", "print", ["infill"],
    { machineType: "3dprinter", operationType: "infill", toolType: "standard", nozzleDiameter: 0.4, layerHeight: 0.2, printSpeed: 50, printTemperature: 245, bedTemperature: 90 },
    part([{ id: "bracket", type: "cube", width: 30, height: 12, depth: 12, x: 0, y: 0, z: 6 }], stock(30, 12, 12)),
    { ...PRINT, filament: "abs", shellCount: 3, topLayers: 5, bottomLayers: 5 }),
  define("print-raft", "print", ["raft"],
    { machineType: "3dprinter", operationType: "raft", toolType: "standard", nozzleDiameter: 0.4, layerHeight: 0.2, printSpeed: 60, printTemperature: 210, bedTemperature: 60 },
    part([{ id: "tower", type: "cylinder", radius: 8, height: 25, x: 0, y: 0, z: 12.5 }], stock(16, 16, 25)),
    { ...PRINT, filament: "pla", adhesion: "raft", raftLayers: 3 }),
  define("print-brim", "print", ["brim"],
    { machineType: "3dprinter", operationType: "brim", toolType: "standard", nozzleDiameter: 0.4, layerHeight: 0.2, printSpeed: 50, printTemperature: 240, bedTemperature: 80 },
    part([{ id: "pillar", type: "cube", width: 12, height: 12, depth: 30, x: 0, y: 0, z: 15 }], stock(12, 12, 30)),
    { ...PRINT, filament: "petg", adhesion: "brim", brimWidth: 8 })
]

// -- lookup ---------------------------------------------------------------------------------------------------------------

/**
 * The examples for what the panel shows: those of the operation on the machine, the ones of the chosen strategy cell first. A
 * cell whose operation is not one the generator writes (the face cell) still lists the examples that stand for it.
 */
export const examplesFor = (
  settings: Pick<ExampleSettings, "machineType" | "operationType">,
  cell?: string
): ReadonlyArray<OperationExample> => {
  const onMachine = OPERATION_EXAMPLES.filter((example) => example.settings.machineType === settings.machineType)
  const forCell = cell === undefined ? [] : onMachine.filter((example) => example.cells.includes(cell))
  const forOperation = onMachine.filter((example) => example.settings.operationType === settings.operationType && !forCell.includes(example))
  return [...forCell, ...forOperation]
}

/** The settings an example sets, decoded against the real schema (every other field takes its default). */
export const exampleSettings = (example: OperationExample): ExampleSettings => g.decodeSettings(example.settings)

/** The print profile of an example, decoded (every other field takes its default). */
export const examplePrinter = (example: OperationExample): ExamplePrinter => g.decodeGenerateRequest({ printer: example.printer ?? {} }).printer

/** The `geometry` of a generate request for the example: the same form the panel sends (`geometryOf`). */
export const exampleGeometry = (example: OperationExample): cam.generator.GeometryInput => {
  const base = g.DEFAULT_GEOMETRY
  const shape = example.geometry
  switch (shape.kind) {
    case "rectangle": return { ...base, geometryType: "rectangle", rectangleWidth: shape.width, rectangleHeight: shape.height }
    case "circle": return { ...base, geometryType: "circle", circleRadius: shape.radius }
    case "polygon": return { ...base, geometryType: "polygon", polygonSides: shape.sides, polygonRadius: shape.radius }
    case "gcode": return { ...base, geometryType: "custom", customPath: shape.text }
    case "part": return {
      ...base, geometryType: "selected", selectedElements: shape.elements.map((element) => ({ ...element })),
      stock: { ...shape.stock, radius: 0 }
    }
    case "none": return { ...base, geometryType: "rectangle" }
  }
}

/** The whole request the generator runs for an example. */
export const exampleRequest = (example: OperationExample): cam.generator.GenerateRequest =>
  g.decodeGenerateRequest({
    settings: example.settings,
    geometry: exampleGeometry(example),
    printer: example.printer ?? {},
    evidence: false
  })

const MATERIAL_KEYS: Readonly<Record<ExampleSettings["material"], Key>> = {
  aluminum: "cam.explorer.materialName.aluminum", steel: "cam.gen.mat.steel", wood: "cam.gen.mat.wood", plastic: "cam.gen.mat.plastic",
  brass: "cam.gen.mat.brass", titanium: "cam.gen.mat.titanium", composite: "cam.gen.mat.composite", other: "cam.gen.mat.other"
}

/** The key of the material a milling or lathe example cuts; a printing example has a filament instead (`exampleFilament`). */
export const exampleMaterialKey = (example: OperationExample): Key | undefined =>
  example.family === "print" ? undefined : MATERIAL_KEYS[exampleSettings(example).material]

/** The filament of a printing example as the spool names it (PLA, PETG, ABS). */
export const exampleFilament = (example: OperationExample): string | undefined =>
  example.family === "print" ? examplePrinter(example).filament.toUpperCase() : undefined

/** The short mono token of a card: the cutter or nozzle diameter, or the bar of a lathe example. */
export const exampleChip = (example: OperationExample): string => {
  const s = exampleSettings(example)
  if (example.family === "print") return `Ø ${s.nozzleDiameter}`
  if (example.family === "lathe") return `Ø ${s.stockDiameter} × ${s.stockLength}`
  return `Ø ${s.toolDiameter}`
}
