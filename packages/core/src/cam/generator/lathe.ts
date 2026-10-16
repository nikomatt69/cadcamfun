/** Lathe operations (facing, turning, boring, threading, grooving, parting, knurling). */
import { cutLevels, f3, type GenerateOptions } from "./common.ts"
import type { LatheOperationType, ToolpathSettings } from "./schema.ts"
import type { TurnedProfile } from "./history-features.ts"

/** Distance kept between the tool and the chuck jaws, mm. */
export const JAW_CLEARANCE = 2

/**
 * How far from the finished face (Z0) the tool may go: the bar sticks out of the jaws by `stockLength - gripLength`, and the
 * tool stays `JAW_CLEARANCE` in front of them (spec 31: a cut into the jaws is a crash, not a toolpath).
 */
export const latheReach = (s: ToolpathSettings): number => Math.max(1, s.stockLength! - s.gripLength - JAW_CLEARANCE)

/** A comment when an operation was shortened to stay in front of the jaws. */
const reachNote = (s: ToolpathSettings, wanted: number): string =>
  wanted > latheReach(s) + 1e-9 ? `; Limited to Z-${f3(latheReach(s))}: the chuck grips ${f3(s.gripLength)} mm of the ${f3(s.stockLength!)} mm bar\n` : ""

/** The free end of the revolution is Z0; the chuck end is negative Z, and X is diameter. */
const profileTurning = (s: ToolpathSettings, profile: TurnedProfile): string => {
  const reach = latheReach(s)
  // Past the reach the profile is inside the jaws: it is turned up to the reach (a second setup does the rest).
  const points = [...profile.points].reverse().map((p) => ({ x: 2 * p.r, z: Math.max(-reach, p.t - profile.end) }))
  const safeX = s.stockDiameter! + 2
  const minimum = Math.min(...points.map((p) => p.x))
  const allowance = s.finishingPass ? s.finishingAllowance * 2 : 0
  let out = "\n; Turning the selected revolution profile (X diameter, Z towards the chuck)\n" + reachNote(s, profile.end - profile.start)
  const pass = (diameter: number, label: string) => {
    out += `; ${label}\nG0 X${f3(safeX)}\nG0 Z2\n`
    const first = points[0]!
    out += `G1 X${f3(Math.max(first.x, diameter))} F${s.plungerate}\nG1 Z0 F${s.feedrate}\n`
    for (const p of points.slice(1)) out += `G1 X${f3(Math.max(p.x, diameter))} Z${f3(p.z)} F${s.feedrate}\n`
    out += `G0 X${f3(safeX)} ; Radial retract before axial travel\nG0 Z2\n`
  }
  const target = Math.min(s.stockDiameter!, minimum + allowance)
  const passes = Math.ceil((s.stockDiameter! - target) / (2 * s.stepdown))
  if (passes > 10_000) throw new RangeError("Turning would require more than 10000 roughing passes")
  for (let i = 1; i <= passes; i++) pass(Math.max(target, s.stockDiameter! - 2 * s.stepdown * i), `Roughing pass ${i}`)
  pass(0, "Finishing pass: following the model envelope")
  return out
}

// -- lathe program -------------------------------------------------------------------------------

const latheFacing = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  let gcode = "\n; Facing operation\n"
  gcode += `G0 X${f3(d + 2)} Z2 ; Position tool\n`
  for (const z of cutLevels(s.depth, s.stepdown)) {
    gcode += `G0 X${f3(d + 2)} Z${f3(z)} ; Rapid to start position\n`
    gcode += `G1 X-1 F${s.feedrate} ; Face cut\n`
    gcode += `G0 X${f3(d + 2)} ; Retract\n`
  }
  return gcode
}

const latheTurning = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const length = Math.min(s.stockLength!, latheReach(s))
  const internalZ = Math.min(s.stockLength! * 0.7, latheReach(s))
  let gcode = "\n; Turning operation\n" + reachNote(s, s.turningOperation === "internal" ? s.stockLength! * 0.7 : s.stockLength!)
  if (s.turningOperation === "external") {
    gcode += `G0 X${f3(d + 2)} Z2 ; Position tool\n`
    gcode += "G0 Z0 ; Move to face\n"
    for (let cut = 0; cut < s.depth; cut += s.stepdown) {
      const currentDepth = Math.min(s.depth, cut + s.stepdown)
      const diameter = d - currentDepth * 2
      gcode += `G0 X${f3(diameter + 1)} ; Rapid to diameter\n`
      gcode += `G1 X${f3(diameter)} F${s.feedrate / 2} ; Plunge to depth\n`
      gcode += `G1 Z${f3(-length)} F${s.feedrate} ; Turn along -Z, towards the chuck\n`
      gcode += `G0 X${f3(d + 2)} ; Retract\n`
      gcode += "G0 Z0 ; Return to face\n"
    }
  } else if (s.turningOperation === "internal") {
    const hole = d / 2
    gcode += `G0 X${f3(hole - 1)} Z2 ; Position tool\n`
    gcode += "G0 Z0 ; Move to face\n"
    for (let cut = 0; cut < s.depth; cut += s.stepdown) {
      const currentDepth = Math.min(s.depth, cut + s.stepdown)
      const diameter = hole + currentDepth * 2
      gcode += `G0 X${f3(diameter - 1)} ; Rapid to diameter\n`
      gcode += `G1 X${f3(diameter)} F${s.feedrate / 2} ; Plunge to depth\n`
      gcode += `G1 Z${f3(-internalZ)} F${s.feedrate} ; Turn along -Z, towards the chuck\n`
      gcode += `G0 X${f3(hole - 1)} ; Retract\n`
      gcode += "G0 Z0 ; Return to face\n"
    }
  }
  return gcode
}

const latheBoring = (s: ToolpathSettings): string => {
  const start = s.stockDiameter! * 0.3
  const boreZ = Math.min(s.stockLength! * 0.5, latheReach(s))
  let gcode = "\n; Boring operation\n" + reachNote(s, s.stockLength! * 0.5)
  gcode += `G0 X${f3(start - 1)} Z2 ; Position tool\n`
  gcode += "G0 Z0 ; Move to hole entrance\n"
  for (let cut = 0; cut < s.depth; cut += s.stepdown) {
    const currentDepth = Math.min(s.depth, cut + s.stepdown)
    gcode += `G1 X${f3(start + currentDepth * 2)} F${s.feedrate / 2} ; Bore to diameter\n`
    gcode += `G1 Z-${f3(boreZ)} F${s.feedrate} ; Bore along Z\n`
    gcode += `G0 X${f3(start - 1)} ; Retract\n`
    gcode += "G0 Z0 ; Return to hole entrance\n"
  }
  return gcode
}

const latheThreading = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const pitch = 1.5
  const startZ = 2
  const endZ = Math.max(startZ - s.stockLength! * 0.7, -latheReach(s))
  let gcode = "\n; Threading operation\n" + reachNote(s, s.stockLength! * 0.7 - startZ)
  gcode += `G0 X${f3(d + 5)} Z${f3(startZ)} ; Position tool\n`
  const passes = Math.round(s.depth / 0.1)
  for (let i = 1; i <= passes; i++) {
    gcode += `G0 X${f3(d - i * 0.1 * 2)} ; Rapid to thread diameter\n`
    gcode += `G32 Z${f3(endZ)} F${pitch} ; Thread cutting move\n`
    gcode += `G0 X${f3(d + 2)} ; Retract\n`
    gcode += `G0 Z${f3(startZ)} ; Return to start\n`
  }
  return gcode
}

const latheGrooving = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const width = 3
  const positionZ = -Math.max(width / 2, Math.min(20, latheReach(s) - width / 2))
  let gcode = "\n; Grooving operation\n" + reachNote(s, 20 + width / 2)
  gcode += `G0 X${f3(d + 2)} Z${f3(positionZ)} ; Position tool\n`
  for (let cut = 0; cut < s.depth; cut += 0.5) {
    const currentDepth = Math.min(s.depth, cut + 0.5)
    gcode += `G1 X${f3(d - currentDepth * 2)} F${s.feedrate / 2} ; Plunge to depth\n`
    gcode += `G0 X${f3(d + 2)} ; Retract\n`
  }
  gcode += `G0 Z${f3(positionZ - width / 2)} ; Position to groove start\n`
  gcode += `G1 X${f3(d - s.depth * 2)} F${s.feedrate / 2} ; Plunge to depth\n`
  gcode += `G1 Z${f3(positionZ + width / 2)} F${s.feedrate} ; Cut to groove end\n`
  gcode += `G0 X${f3(d + 2)} ; Retract\n`
  return gcode
}

const latheParting = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const partZ = -Math.min(30, latheReach(s))
  let gcode = "\n; Parting operation\n" + reachNote(s, 30)
  gcode += `G0 X${f3(d + 2)} Z${f3(partZ)} ; Position tool\n`
  gcode += `G1 X-1 F${s.feedrate / 3} ; Part off\n`
  gcode += `G0 X${f3(d + 5)} ; Retract\n`
  return gcode
}

const latheKnurling = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const startZ = 2
  const endZ = Math.max(startZ - 30, -latheReach(s))
  let gcode = "\n; Knurling operation\n" + reachNote(s, 30 - startZ)
  gcode += `G0 X${f3(d + 2)} Z${f3(startZ)} ; Position tool\n`
  gcode += `G1 X${f3(d)} F${s.feedrate / 2} ; Approach to diameter\n`
  gcode += `G1 Z${f3(endZ)} F${s.feedrate / 4} ; Knurl along length\n`
  gcode += `G0 X${f3(d + 5)} ; Retract\n`
  gcode += `G0 Z${f3(startZ)} ; Return to start\n`
  gcode += `G1 X${f3(d + 0.2)} F${s.feedrate / 2} ; Approach with pressure\n`
  gcode += `G1 Z${f3(endZ)} F${s.feedrate / 4} ; Knurl along length again\n`
  gcode += `G0 X${f3(d + 5)} ; Retract\n`
  return gcode
}

/**
 * Moves the Z zero of a lathe program. With the zero on the chuck face, Z grows towards the front face of the stock, so every
 * Z word of a motion block is `stockLength` larger than with the zero on the finished face; moving towards the chuck is still -Z.
 */
export const shiftLatheZ = (gcode: string, dz: number): string =>
  gcode.split("\n").map((line) => {
    if (!/^\s*G(0|1|32|00|01)\b/.test(line)) return line
    const comment = line.indexOf(";")
    const code = comment < 0 ? line : line.slice(0, comment)
    const rest = comment < 0 ? "" : line.slice(comment)
    return code.replace(/\bZ(-?\d+(?:\.\d+)?)/g, (_, z: string) => `Z${f3(Number(z) + dz)}`) + rest
  }).join("\n")

export const generateLatheGCode = (s: ToolpathSettings, options: GenerateOptions = {}, profile?: TurnedProfile): string => {
  // A turned part needs bar for the chuck to hold beyond its own length: the whole profile then lies in front of the jaws.
  if (profile !== undefined) s = { ...s, stockDiameter: Math.max(s.stockDiameter ?? 0, profile.maxDiameter), stockLength: Math.max(s.stockLength ?? 0, profile.end - profile.start + s.gripLength + JAW_CLEARANCE), toolType: "turning" }
  let gcode = ""
  gcode += "; CAD/CAM SYSTEM - Generated Lathe G-code with AI assistance\n"
  gcode += `; Operation: ${s.operationType}\n`
  gcode += `; Material: ${s.material}\n`
  gcode += `; Tool: ${s.toolType}\n`
  gcode += `; Stock: Ø${s.stockDiameter}mm x ${s.stockLength}mm\n`
  if (options.stamp) gcode += `; Date: ${options.stamp}\n`
  gcode += "\n"
  gcode += "G90 ; Absolute positioning\n"
  gcode += "G21 ; Metric units\n"
  gcode += "G18 ; XZ plane selection (standard for lathes)\n"
  gcode += `${s.spindleDirection === "cw" ? "M3" : "M4"} S${s.rpm} ; Start spindle ${s.spindleDirection === "cw" ? "clockwise" : "counter-clockwise"}\n`
  if (s.coolant) gcode += "M8 ; Coolant on\n"

  const ops: Record<LatheOperationType, (s: ToolpathSettings) => string> = {
    facing: latheFacing, turning: latheTurning, boring: latheBoring, threading: latheThreading,
    grooving: latheGrooving, parting: latheParting, knurling: latheKnurling
  }
  const op = ops[s.operationType as LatheOperationType]
  let body = ""
  if (profile !== undefined) body += profileTurning(s, profile)
  else if (op) body += op(s)
  body += "\n; End of program\n"
  body += profile !== undefined ? `G0 X${f3(s.stockDiameter! + 2)}\nG0 Z50 ; Retract to safe position\n` : "G0 X50 Z50 ; Retract to safe position\n"
  if (s.latheZero === "chuck") {
    gcode += `; Z zero is the chuck face: Z grows towards the front face of the ${f3(s.stockLength!)} mm stock\n`
    body = shiftLatheZ(body, s.stockLength!)
  }
  gcode += body
  if (s.coolant) gcode += "M9 ; Coolant off\n"
  gcode += "M5 ; Stop spindle\n"
  gcode += "M30 ; Program end\n"
  return gcode
}
