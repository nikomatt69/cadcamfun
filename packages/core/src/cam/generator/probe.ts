/**
 * Touch probes and tool setters: the `probing` operation of a mill.
 *
 * A probe is a sensor in the spindle, not a cutter: the spindle is OFF while it works, it approaches slowly, and the control
 * records where it touched. The cycles find the work zero of the part (a surface, an edge, a corner, the centre of a bore or a
 * boss) or the length of a tool on a setter, and write the result into the work offset (G54..G59) so the next program runs from
 * the measured zero.
 *
 * Two dialects, the controls' own conventions:
 *  - `linuxcnc` (also Grbl-style controls): `G38.2` probes toward until contact (an alarm without contact), the contact position
 *    is in `#5061 #5062 #5063` (X Y Z) in the current work coordinates, and `G10 L20 P<n>` makes the current position the given
 *    coordinate in work offset n.
 *  - `fanuc`: `G31` skip function, contact position in `#5061..#5063`, and the work offset is changed through its macro variables
 *    (`#5221..` for G54, `#5241..` for G55, ...: X, Y, Z in steps of 1).
 * The stylus is a ball: at contact its CENTRE is half a tip diameter before the surface, which every cycle compensates.
 */
import { f3, type GenerateOptions } from "./common.ts"
import type { ToolpathSettings } from "./schema.ts"

const OFFSET_NUMBER: Readonly<Record<string, number>> = { G54: 1, G55: 2, G56: 3, G57: 4, G58: 5, G59: 6 }
/** First macro variable of each work offset on Fanuc controls (X; Y is +1, Z is +2). */
const FANUC_OFFSET_BASE: Readonly<Record<string, number>> = { G54: 5221, G55: 5241, G56: 5261, G57: 5281, G58: 5301, G59: 5321 }

type Axis = "X" | "Y" | "Z"
const RESULT: Readonly<Record<Axis, string>> = { X: "#5061", Y: "#5062", Z: "#5063" }

const probeMove = (s: ToolpathSettings, axis: Axis, distance: number): string => {
  const word = s.probeDialect === "fanuc" ? "G31" : "G38.2"
  return `${word} ${axis}${f3(distance)} F${s.probeFeed} ; Probe ${axis}${distance < 0 ? "-" : "+"} until contact\n`
}

/** Makes the contact position (`#5061..`, work coordinates) the coordinate `value` in the work offset. */
const setZero = (s: ToolpathSettings, axis: Axis, value: number): string => {
  const n = OFFSET_NUMBER[s.workOffset] ?? 1
  if (s.probeDialect === "fanuc") {
    const variable = (FANUC_OFFSET_BASE[s.workOffset] ?? 5221) + (axis === "X" ? 0 : axis === "Y" ? 1 : 2)
    return `#${variable} = #${variable} + ${RESULT[axis]} - ${f3(value)} ; ${s.workOffset} ${axis} offset so the contact is ${axis}${f3(value)}\n`
  }
  return `G10 L20 P${n} ${axis}${f3(value)} ; ${s.workOffset}: the contact point becomes ${axis}${f3(value)}\n`
}

const back = (axis: Axis, distance: number): string => `G91\nG0 ${axis}${f3(distance)} ; Back off\nG90\n`

export const generateProbingGCode = (s: ToolpathSettings, options: GenerateOptions = {}): string => {
  const r = s.probeStylus / 2
  const search = s.probeSearch
  const clearance = 5
  let gcode = "; CAD/CAM SYSTEM - Generated Probing program\n"
  gcode += `; Cycle: ${s.probeCycle}  Probe: ${s.toolType === "toolsetter" ? "tool setter" : "touch probe"} stylus Ø${s.probeStylus}mm  Dialect: ${s.probeDialect}\n`
  gcode += `; Work offset: ${s.workOffset}  Search ${search}mm at F${s.probeFeed}\n`
  if (options.stamp) gcode += `; Date: ${options.stamp}\n`
  gcode += "; The spindle stays OFF: a probe is a sensor, not a cutter.\n\n"
  gcode += "G90 ; Absolute positioning\nG21 ; Metric units\nG17 ; XY plane selection\n"
  gcode += `${s.workOffset} ; Work offset\n`
  gcode += "M5 ; Spindle off\n"
  gcode += `G0 Z${f3(clearance + search)} ; Move to safe height\n\n`

  switch (s.probeCycle) {
    case "zSurface": {
      gcode += "; Z zero on the top surface\n"
      gcode += `G0 Z${f3(clearance)} ; Above the surface\n`
      gcode += probeMove(s, "Z", -search)
      gcode += setZero(s, "Z", 0)
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
    case "edgeX": {
      gcode += "; X zero on the left edge (approach from -X)\n"
      gcode += `G0 X${f3(-search)} ; Start left of the edge\n`
      gcode += `G0 Z${f3(-clearance)} ; Down beside the part\n`
      gcode += probeMove(s, "X", search * 2)
      gcode += setZero(s, "X", -r)
      gcode += back("X", -clearance)
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
    case "edgeY": {
      gcode += "; Y zero on the front edge (approach from -Y)\n"
      gcode += `G0 Y${f3(-search)} ; Start in front of the edge\n`
      gcode += `G0 Z${f3(-clearance)} ; Down beside the part\n`
      gcode += probeMove(s, "Y", search * 2)
      gcode += setZero(s, "Y", -r)
      gcode += back("Y", -clearance)
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
    case "corner": {
      gcode += "; X and Y zero on the front-left corner\n"
      gcode += `G0 X${f3(-search)} Y${f3(search)} ; Start left of the part\n`
      gcode += `G0 Z${f3(-clearance)} ; Down beside the part\n`
      gcode += probeMove(s, "X", search * 2)
      gcode += setZero(s, "X", -r)
      gcode += `G0 X${f3(-search)} ; Back off X\n`
      gcode += `G0 X${f3(search)} Y${f3(-search)} ; Start in front of the part\n`
      gcode += probeMove(s, "Y", search * 2)
      gcode += setZero(s, "Y", -r)
      gcode += `G0 Y${f3(-search)} ; Back off Y\n`
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
    case "bore":
    case "boss": {
      const inside = s.probeCycle === "bore"
      const half = s.probeFeatureSize / 2
      const reach = half + search
      gcode += `; Centre of a ${inside ? "bore" : "boss"}, nominal Ø${f3(s.probeFeatureSize)}mm. Four touches; the centre is the middle of each pair${inside ? ", the probe starts at the bore centre" : ", the probe starts beside the boss on each axis"}\n`
      // At contact the BALL CENTRE is half a tip diameter inside a bore wall (so the pair is a diameter minus a tip) and half a tip
      // outside a boss wall (a diameter plus a tip).
      const pair = (axis: Axis, first: number, second: number): string => {
        let out = ""
        if (inside) {
          out += `G0 Z${f3(-clearance)} ; Down into the bore, at its centre\n`
          out += probeMove(s, axis, -reach) + `#${first} = ${RESULT[axis]} ; ${axis} of the - wall contact\n`
          out += `G0 ${axis}0 ; Back to the centre\n`
          out += probeMove(s, axis, reach) + `#${second} = ${RESULT[axis]} ; ${axis} of the + wall contact\n`
          out += `G0 ${axis}0 ; Back to the centre\n`
        } else {
          out += `G0 ${axis}${f3(-reach)} ; Beside the boss on the - side\n`
          out += `G0 Z${f3(-clearance)} ; Down beside the boss\n`
          out += probeMove(s, axis, search * 2) + `#${first} = ${RESULT[axis]} ; ${axis} of the - wall contact\n`
          out += `G0 Z${f3(clearance + search)} ; Over the boss\n` + `G0 ${axis}${f3(reach)} ; Beside the boss on the + side\n` + `G0 Z${f3(-clearance)} ; Down beside the boss\n`
          out += probeMove(s, axis, -search * 2) + `#${second} = ${RESULT[axis]} ; ${axis} of the + wall contact\n`
          out += `G0 Z${f3(clearance + search)} ; Up\n`
        }
        return out
      }
      gcode += pair("X", 101, 102) + `#103 = [#101 + #102] / 2 ; X centre\nG0 X#103 ; Over the X centre\n`
      gcode += pair("Y", 104, 105) + `#106 = [#104 + #105] / 2 ; Y centre\nG0 Y#106 ; Over the centre\n`
      gcode += `#107 = #102 - #101 ${inside ? "+" : "-"} ${f3(s.probeStylus)} ; measured diameter along X\n`
      gcode += `#108 = #105 - #104 ${inside ? "+" : "-"} ${f3(s.probeStylus)} ; measured diameter along Y\n`
      gcode += setZero(s, "X", 0) + setZero(s, "Y", 0)
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
    case "toolLength": {
      gcode += "; Tool length on the tool setter (the tool is in the spindle and TURNING only if the setter allows it)\n"
      gcode += `T${s.toolNumber} M6 ; Load the tool to measure\n`
      gcode += `G0 Z${f3(clearance + search)} ; Above the setter\n`
      gcode += probeMove(s, "Z", -(search * 2))
      gcode += s.probeDialect === "fanuc"
        ? `#500 = ${RESULT.Z} ; Z at contact: put it in the length offset H${s.toolNumber}\n`
        : `G10 L10 P${s.toolNumber} Z${f3(0)} ; The contact point is the tool's length reference (tool ${s.toolNumber})\n`
      gcode += `G0 Z${f3(clearance + search)} ; Retract\n`
      break
    }
  }
  gcode += "\n; End of program\nG0 Z30 ; Move to safe height\nM30 ; Program end\n"
  return gcode
}
