/**
 * What each kind of machine is, kinematically, and how its axes relate to the drawing.
 *
 * ISO 841 rule: a program always describes the TOOL moving relative to the (stationary) workpiece, whichever part the machine
 * really moves. What differs is what turns and what is made:
 *  - mill: the TOOL rotates (spindle), the workpiece is clamped; material is removed. Z is the spindle axis, +Z away from the part.
 *  - lathe: the WORKPIECE rotates (chuck), the tool only travels in X (radial) and Z (along the spindle axis); material is removed.
 *    There is no Y. +Z points away from the chuck, so the stock lies at negative Z behind the finished face (Z0); +X points away
 *    from the axis, and X is programmed as a diameter.
 *  - 3D printer: nothing rotates for cutting; the nozzle deposits material layer by layer. Z is the layer height and only grows
 *    while printing; E is the filament pushed through the nozzle.
 * One table drives the assistant's knowledge, the consistency check on G-code, and the CAD-to-machine axis mapping.
 */
import type { MachineType } from "./generator/schema.ts"

export type MachineKind = MachineType

export interface AxisInfo {
  readonly name: string
  /** Which physical part moves along it. */
  readonly moves: "tool" | "workpiece" | "bed" | "filament"
  readonly positive: string
  readonly note?: string
}

export interface Kinematics {
  readonly kind: MachineKind
  readonly title: string
  /** What turns while it works. */
  readonly rotates: "tool" | "workpiece" | "nothing"
  /** Whether it removes material (`subtractive`) or builds it (`additive`). */
  readonly process: "subtractive" | "additive"
  readonly plane: "G17" | "G18"
  readonly axes: ReadonlyArray<AxisInfo>
  /** X is programmed as a diameter (lathes), not as a radius. */
  readonly xIsDiameter: boolean
  readonly zero: string
  readonly spindle: string
  /** Direction of travel that cuts, in program terms. */
  readonly cutting: string
  readonly operations: ReadonlyArray<string>
  /** The settings of the generator that only this machine uses. */
  readonly settings: ReadonlyArray<string>
  readonly drawingMapping: string
}

export const KINEMATICS: Readonly<Record<MachineKind, Kinematics>> = {
  mill: {
    kind: "mill",
    title: "Milling machine (3-axis vertical)",
    rotates: "tool",
    process: "subtractive",
    plane: "G17",
    axes: [
      { name: "X", moves: "tool", positive: "to the right of the operator" },
      { name: "Y", moves: "tool", positive: "away from the operator" },
      { name: "Z", moves: "tool", positive: "up, away from the workpiece (along the spindle)", note: "cutting depths are negative Z" }
    ],
    xIsDiameter: false,
    zero: "Z0 is the top of the stock; X0 Y0 is the origin chosen in the generator (stock centre by default)",
    spindle: "M3 spindle clockwise, M4 counter-clockwise, M5 stop; S is rpm. The tool turns, the workpiece does not.",
    cutting: "plunge to negative Z, then feed in XY; climb milling runs counter-clockwise (G3) round an outside contour with a clockwise spindle",
    operations: ["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface", "probing"],
    settings: ["toolType", "toolDiameter", "flutes", "depth", "stepdown", "stepover", "feedrate", "plungerate", "rpm", "offset", "direction", "workOffset", "probeCycle", "probeFeed", "probeSearch", "probeStylus", "probeDialect", "probeFeatureSize"],
    drawingMapping: "CAD X, Y, Z are machine X, Y, Z; the top face of the part is Z0"
  },
  lathe: {
    kind: "lathe",
    title: "Lathe (turning centre, 2 axes)",
    rotates: "workpiece",
    process: "subtractive",
    plane: "G18",
    axes: [
      { name: "X", moves: "tool", positive: "away from the spindle axis (radial); programmed as a DIAMETER", note: "never negative beyond the small overshoot of a facing cut" },
      { name: "Z", moves: "tool", positive: "away from the chuck, along the spindle axis", note: "the stock is at negative Z behind the face" }
    ],
    xIsDiameter: true,
    zero: "Z0 is the finished front face of the part, X0 is the spindle axis",
    spindle: "M3 / M4 turn the chuck (the workpiece), G96 constant surface speed or G97 fixed rpm; the tool does not rotate. There is no Y axis.",
    cutting: "turning feeds along -Z towards the chuck, facing feeds -X towards the axis, boring and internal work stay inside the bore, threading (G32) feeds -Z at the pitch",
    operations: ["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"],
    settings: ["stockDiameter", "stockLength", "spindleDirection", "turningOperation", "applyToolCompensation", "latheZero"],
    drawingMapping: "a revolved profile: its x (radius) becomes X = 2 x (diameter), its y (height along the axis) becomes Z measured from the finished face, negative into the part"
  },
  "3dprinter": {
    kind: "3dprinter",
    title: "FDM 3D printer (Cartesian)",
    rotates: "nothing",
    process: "additive",
    plane: "G17",
    axes: [
      { name: "X", moves: "tool", positive: "to the right on the bed" },
      { name: "Y", moves: "tool", positive: "towards the back of the bed" },
      { name: "Z", moves: "bed", positive: "up the build: the layer height; it only increases while printing", note: "on bed-slinger machines the bed moves, the program is the same" },
      { name: "E", moves: "filament", positive: "pushes filament into the nozzle; the extruder is in absolute mode (M82) and reset with G92 E0" }
    ],
    xIsDiameter: false,
    zero: "Z0 is the bed surface; the first layer is printed at the layer height, X0 Y0 is the origin of the part on the bed",
    spindle: "no spindle: M104/M109 set the nozzle temperature, M140/M190 the bed; M106/M107 the part fan",
    cutting: "it builds up: each layer is printed at a higher Z than the last, shells first then infill; travel moves are not extruded and retract first",
    operations: ["standard", "vase", "support", "infill", "raft", "brim"],
    settings: ["nozzleDiameter", "filamentDiameter", "layerHeight", "extrusionWidth", "printSpeed", "printTemperature", "bedTemperature", "bedWidth", "bedDepth", "centerOnBed", "bedOrigin"],
    drawingMapping: "CAD X, Y are bed X, Y; CAD Z is height above the bed (the part must sit on Z >= 0)"
  }
}

/** The zeros a machine can use, and what each means. The settings keys are the generator's. */
export interface OriginChoice { readonly value: string; readonly label: string; readonly meaning: string }
export interface OriginOptions { readonly setting: string; readonly choices: ReadonlyArray<OriginChoice>; readonly offsets?: ReadonlyArray<string> }

export const ORIGINS: Readonly<Record<MachineKind, OriginOptions>> = {
  mill: {
    setting: "originType",
    offsets: ["G54", "G55", "G56", "G57", "G58", "G59"],
    choices: [
      { value: "workpiece-center", label: "Stock centre", meaning: "X0 Y0 at the middle of the stock, Z0 on its top face" },
      { value: "workpiece-corner", label: "Stock corner", meaning: "X0 Y0 at the front-left corner of the stock, Z0 on its top face" },
      { value: "machine-zero", label: "Machine zero", meaning: "the machine's own reference (home) position" },
      { value: "custom", label: "Custom", meaning: "X0 Y0 at the given offset from the stock centre (originX, originY, originZ)" }
    ]
  },
  lathe: {
    setting: "latheZero",
    choices: [
      { value: "face", label: "Finished face", meaning: "Z0 on the front face of the part; the stock is at negative Z, towards the chuck" },
      { value: "chuck", label: "Chuck face", meaning: "Z0 on the chuck; Z grows towards the front face of the stock" }
    ]
  },
  "3dprinter": {
    setting: "bedOrigin",
    choices: [
      { value: "corner", label: "Front-left corner", meaning: "X0 Y0 at the front-left corner of the plate; the part is set down in the middle" },
      { value: "center", label: "Plate centre", meaning: "X0 Y0 at the middle of the plate (delta printers); the part is centred on it" }
    ]
  }
}

export const kinematicsOf = (kind: MachineKind): Kinematics => KINEMATICS[kind]

/** A point on the revolved profile of a turned part (x radius, y height along the axis) in lathe axes. `faceY` is the profile height of the finished front face. */
export const cadToLathe = (point: { readonly x: number; readonly y: number }, faceY: number): { readonly X: number; readonly Z: number } =>
  ({ X: 2 * Math.abs(point.x), Z: point.y - faceY })

/** A point of the drawing in machine axes (mill and printer keep the drawing's axes; for a lathe use `cadToLathe`). */
export const cadToMachine = (kind: Exclude<MachineKind, "lathe">, point: { readonly x: number; readonly y: number; readonly z?: number }): { readonly X: number; readonly Y: number; readonly Z: number } => {
  void kind
  return { X: point.x, Y: point.y, Z: point.z ?? 0 }
}

// ---------------------------------------------------------------- consistency of a program with its machine

export interface AxisIssue {
  readonly severity: "error" | "warning" | "info"
  readonly code: string
  readonly line: number
  readonly message: string
}

const WORD = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g

/**
 * Reads a program for what is illogical for the machine it is meant for: an axis it does not have, a direction that goes
 * the wrong way, a process step done in the wrong order. Static; it never replaces the verification.
 */
export const checkAxes = (gcode: string, kind: MachineKind): ReadonlyArray<AxisIssue> => {
  const issues: AxisIssue[] = []
  const add = (severity: AxisIssue["severity"], code: string, line: number, message: string) => issues.push({ severity, code, line, message })
  let spindleOn = false
  let planeSeen = false
  let heated = false
  let homed = false
  let absolute = true
  let motion = -1
  let sawExtrusion = false
  const pos = { x: 0, y: 0, z: 0, e: 0 }
  let lastLayerZ: number | undefined
  const reported = new Set<string>()
  const once = (key: string, severity: AxisIssue["severity"], code: string, line: number, message: string) => {
    if (reported.has(key)) return
    reported.add(key)
    add(severity, code, line, message)
  }
  gcode.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const text = raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").trim()
    if (text === "" || text.startsWith("%")) return
    const words = [...text.matchAll(WORD)].map((m) => ({ letter: m[1]!.toUpperCase(), value: Number(m[2]) }))
    const get = (letter: string) => words.find((w) => w.letter === letter)?.value
    const has = (letter: string, value?: number) => words.some((w) => w.letter === letter && (value === undefined || w.value === value))
    for (const w of words) {
      if (w.letter === "G") {
        const g = Math.round(w.value * 10) / 10
        if ([0, 1, 2, 3, 32].includes(g)) motion = g
        if (g === 17 || g === 18) { planeSeen = true; if ((g === 18) !== (kind === "lathe") && kind !== "3dprinter") once("plane", "warning", "PLANE_MISMATCH", line, `G${g} selects the ${g === 18 ? "XZ" : "XY"} plane; a ${kind} works in ${kinematicsOf(kind).plane}`) }
        if (g === 90) absolute = true
        if (g === 91) absolute = false
        if (g === 28) homed = true
      }
      if (w.letter === "M") {
        if (w.value === 3 || w.value === 4) spindleOn = true
        if (w.value === 5) spindleOn = false
        if (w.value === 104 || w.value === 109) heated = true
      }
    }
    const x = get("X"), y = get("Y"), z = get("Z"), e = get("E")
    const moves = x !== undefined || y !== undefined || z !== undefined || e !== undefined
    const cutting = (motion === 1 || motion === 2 || motion === 3 || motion === 32) && moves
    if (kind === "lathe") {
      if (y !== undefined && (has("G", 0) || has("G", 1) || motion >= 0)) once("y", "error", "LATHE_Y_AXIS", line, "A lathe has no Y axis: use X (diameter) and Z (along the spindle)")
      if (e !== undefined) once("e", "warning", "LATHE_EXTRUDER", line, "E is an extruder axis; a lathe has none")
      if (x !== undefined && x < -2) once("x", "error", "LATHE_X_NEGATIVE", line, `X${x} goes past the spindle axis (X is a diameter and should stay at or above 0, apart from the small overshoot of a facing cut)`)
      if (cutting && !spindleOn) once("spindle", "error", "LATHE_NO_SPINDLE", line, "A cutting move before the chuck is turning (M3 / M4): the workpiece must rotate, not the tool")
      if (has("G", 32) && get("F") === undefined) once("pitch", "error", "THREAD_NO_PITCH", line, "G32 needs F, the thread pitch in mm per revolution")
      if (cutting && z !== undefined && z > 5 && motion !== 0) once("zpos", "warning", "LATHE_Z_AWAY", line, `Z${z} feeds the tool away from the chuck, outside the part: the stock lies at negative Z behind the finished face`)
    } else if (kind === "mill") {
      if (e !== undefined) once("e", "warning", "MILL_EXTRUDER", line, "E is an extruder axis; a mill has none")
      if (cutting && !spindleOn) once("spindle", "error", "MILL_NO_SPINDLE", line, "A cutting move before the spindle (the tool) is turning (M3 / M4)")
      if (has("G", 18)) once("plane", "warning", "PLANE_MISMATCH", line, "G18 is the lathe plane; a mill works in G17")
    } else {
      if (has("M", 3) || has("M", 4)) once("spindle", "warning", "PRINTER_SPINDLE", line, "A printer has no spindle: M3 / M4 do nothing here")
      if (x !== undefined && has("G", 18)) add("warning", "PLANE_MISMATCH", line, "G18 is the lathe plane")
      if (e !== undefined) {
        const next = absolute ? e : pos.e + e
        if (next > pos.e + 1e-9 && cutting) {
          sawExtrusion = true
          if (!heated) once("cold", "error", "PRINTER_COLD_EXTRUSION", line, "Extruding before the nozzle was heated (M104 / M109)")
          // The layer being printed is the nozzle's current Z, whether it was set on this line or earlier.
          const zNow = z === undefined ? pos.z : absolute ? z : pos.z + z
          if (lastLayerZ !== undefined && zNow < lastLayerZ - 1e-6) once("down", "warning", "PRINTER_LAYER_DOWN", line, `Printing at Z${zNow} below the previous layer (Z${lastLayerZ}): a build only goes up`)
          lastLayerZ = lastLayerZ === undefined ? zNow : Math.max(lastLayerZ, zNow)
        }
        pos.e = next
      }
    }
    if (moves) {
      if (x !== undefined) pos.x = absolute ? x : pos.x + x
      if (y !== undefined) pos.y = absolute ? y : pos.y + y
      if (z !== undefined) pos.z = absolute ? z : pos.z + z
    }
  })
  if (kind === "lathe" && !planeSeen) add("warning", "PLANE_MISSING", 1, "A lathe program should select the XZ plane (G18)")
  if (kind === "3dprinter" && !homed && gcode.trim() !== "") add("info", "PRINTER_NOT_HOMED", 1, "No G28: the printer does not know where its axes are")
  return issues
}
