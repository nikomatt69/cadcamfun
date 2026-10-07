/** Lathe operations (facing, turning, boring, threading, grooving, parting, knurling). */
import { cutLevels, f3, type GenerateOptions } from "./common.ts"
import type { LatheOperationType, ToolpathSettings } from "./schema.ts"

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
  const length = s.stockLength!
  let gcode = "\n; Turning operation\n"
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
      gcode += `G1 Z${f3(-length * 0.7)} F${s.feedrate} ; Turn along -Z, towards the chuck\n`
      gcode += `G0 X${f3(hole - 1)} ; Retract\n`
      gcode += "G0 Z0 ; Return to face\n"
    }
  }
  return gcode
}

const latheBoring = (s: ToolpathSettings): string => {
  const start = s.stockDiameter! * 0.3
  let gcode = "\n; Boring operation\n"
  gcode += `G0 X${f3(start - 1)} Z2 ; Position tool\n`
  gcode += "G0 Z0 ; Move to hole entrance\n"
  for (let cut = 0; cut < s.depth; cut += s.stepdown) {
    const currentDepth = Math.min(s.depth, cut + s.stepdown)
    gcode += `G1 X${f3(start + currentDepth * 2)} F${s.feedrate / 2} ; Bore to diameter\n`
    gcode += `G1 Z-${f3(s.stockLength! * 0.5)} F${s.feedrate} ; Bore along Z\n`
    gcode += `G0 X${f3(start - 1)} ; Retract\n`
    gcode += "G0 Z0 ; Return to hole entrance\n"
  }
  return gcode
}

const latheThreading = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const pitch = 1.5
  const startZ = 2
  const endZ = startZ - s.stockLength! * 0.7
  let gcode = "\n; Threading operation\n"
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
  const positionZ = -20
  let gcode = "\n; Grooving operation\n"
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
  let gcode = "\n; Parting operation\n"
  gcode += `G0 X${f3(d + 2)} Z${f3(-30)} ; Position tool\n`
  gcode += `G1 X-1 F${s.feedrate / 3} ; Part off\n`
  gcode += `G0 X${f3(d + 5)} ; Retract\n`
  return gcode
}

const latheKnurling = (s: ToolpathSettings): string => {
  const d = s.stockDiameter!
  const startZ = 2
  const endZ = startZ - 30
  let gcode = "\n; Knurling operation\n"
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

export const generateLatheGCode = (s: ToolpathSettings, options: GenerateOptions = {}): string => {
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
  if (op) body += op(s)
  body += "\n; End of program\n"
  body += "G0 X50 Z50 ; Retract to safe position\n"
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
