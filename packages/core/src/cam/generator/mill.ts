/** Mill program: header, prologue, tool compensation, geometry toolpath, finishing block, epilogue. */
import { millToolpath, stockComment } from "./dispatch.ts"
import { generateProbingGCode } from "./probe.ts"
import { f3, type GenerateOptions } from "./common.ts"
import type { GeometryInput, ToolpathSettings } from "./schema.ts"

// -- mill program --------------------------------------------------------------------------------

const FINISHABLE: ReadonlyArray<string> = ["contour", "profile", "pocket"]

/**
 * The finishing pass of an outline operation, for real: the first pass keeps `finishingAllowance` of material on the wall (the
 * tool path is offset by that much further from the wall: the tool is treated as that much larger for the offset only), then a
 * second pass at the wall's own size takes it off, at the same depth levels, on the outline. Only the `contour` strategy exists
 * for outlines; a 3D surface runs its finishing inside its own toolpath (see `surface.ts`).
 */
const withFinishingPass = (s: ToolpathSettings, g: GeometryInput, path: (s: ToolpathSettings, g: GeometryInput) => string): string => {
  if (!s.finishingPass || !FINISHABLE.includes(s.operationType)) return path(s, g)
  if (s.offset === "center" || s.finishingAllowance <= 0) {
    return `; Finishing pass skipped: it needs an inside or outside tool offset and a finishing allowance above zero\n${path(s, g)}`
  }
  let out = ""
  if (s.finishingStrategy !== "contour") out += `; The ${s.finishingStrategy} finishing strategy does not exist for outlines: contour finishing is used\n`
  const a = s.finishingAllowance
  out += `; Pass 1: ${f3(a)}mm of material left on the wall\n`
  out += path({ ...s, toolDiameter: s.toolDiameter + 2 * a }, g)
  out += "\n; Pass 2: finishing the wall to size\n"
  out += path({ ...s, operationType: s.operationType === "pocket" ? "contour" : s.operationType, offset: s.operationType === "pocket" ? "inside" : s.offset }, g)
  return out
}

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

  const toolpath = withFinishingPass(s, g, millToolpath)

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

  gcode += "\n; End of program\n"
  gcode += "G0 Z30 ; Move to safe height\n"
  if (s.coolant) gcode += "M9 ; Coolant off\n"
  gcode += "M5 ; Stop spindle\n"
  gcode += "M30 ; Program end\n"
  return gcode
}
