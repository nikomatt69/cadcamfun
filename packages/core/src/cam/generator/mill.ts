/** Mill program: header, prologue, tool compensation, geometry toolpath, finishing block, epilogue. */
import { millToolpath, stockComment } from "./dispatch.ts"
import { generateProbingGCode } from "./probe.ts"
import type { GenerateOptions } from "./common.ts"
import type { GeometryInput, ToolpathSettings } from "./schema.ts"

// -- mill program --------------------------------------------------------------------------------

export const generateMillGCode = (s: ToolpathSettings, g: GeometryInput, options: GenerateOptions = {}): string => {
  // A probe is not a cutter: its own program (spindle off, slow approach, offsets written).
  if (s.operationType === "probing") return generateProbingGCode(s, options)
  let gcode = ""
  gcode += "; CAD/CAM SYSTEM - Generated Mill G-code with AI assistance\n"
  gcode += `; Operation: ${s.operationType}\n`
  gcode += `; Material: ${s.material}\n`
  gcode += `; Tool: ${s.toolType} Ø${s.toolDiameter}mm\n`
  gcode += stockComment(g.stock)
  if (options.stamp) gcode += `; Date: ${options.stamp}\n`
  gcode += "\n"
  gcode += "G90 ; Absolute positioning\n"
  gcode += "G21 ; Metric units\n"
  gcode += "G17 ; XY plane selection\n"
  // G54 is the control's default work offset: only another one needs to be selected.
  if (s.workOffset !== "G54") gcode += `${s.workOffset} ; Work offset\n`
  gcode += `M3 S${s.rpm} ; Start spindle\n`
  if (s.coolant) gcode += "M8 ; Coolant on\n"
  gcode += "G0 Z10 ; Move to safe height\n\n"

  if (s.useHighSpeedMode) {
    gcode += "; High Speed Machining mode enabled\n"
    gcode += "G64 P0.01 ; Path blending with tolerance of 0.01mm\n\n"
  } else if (s.useExactStop) {
    gcode += "; Exact Stop mode enabled\n"
    gcode += "G61 ; Exact stop mode\n\n"
  }

  const toolpath = millToolpath(s, g)

  if (s.useToolCompensation) {
    gcode += "; Tool compensation enabled\n"
    let side = ""
    if (s.operationType === "contour" || s.operationType === "profile") {
      if (s.offset === "outside") side = s.direction === "climb" ? "G42" : "G41"
      else if (s.offset === "inside") side = s.direction === "climb" ? "G41" : "G42"
    }
    if (side) {
      gcode += `${side} D${s.toolNumber || 1} ; Tool compensation\n`
      // The legacy lookup took the first `G1` line, which is the Z plunge (no X/Y), so the approach never appeared.
      let match: RegExpMatchArray | null = null
      for (const line of toolpath.split("\n")) {
        if (line.trim().startsWith("G1")) {
          match = line.match(/X([-\d.]+)\s+Y([-\d.]+)/)
          if (match) break
        }
      }
      if (match) gcode += `G0 X${(parseFloat(match[1]!) - 5).toFixed(3)} Y${parseFloat(match[2]!).toFixed(3)} ; Approach point for compensation\n`
      gcode += toolpath
      gcode += "G40 ; Cancel tool compensation\n"
    } else {
      gcode += toolpath
    }
  } else {
    gcode += toolpath
  }

  if (s.finishingPass) {
    gcode += "\n; Finishing pass\n"
    gcode += `; Finishing allowance: ${s.finishingAllowance}mm\n`
    switch (s.finishingStrategy) {
      case "contour": gcode += "; Contour finishing strategy\n"; break
      case "parallel": gcode += "; Parallel finishing strategy\n"; break
      case "spiral": gcode += "; Spiral finishing strategy\n"; break
      case "radial": gcode += "; Radial finishing strategy\n"; break
    }
  }

  gcode += "\n; End of program\n"
  gcode += "G0 Z30 ; Move to safe height\n"
  if (s.coolant) gcode += "M9 ; Coolant off\n"
  gcode += "M5 ; Stop spindle\n"
  gcode += "M30 ; Program end\n"
  return gcode
}
