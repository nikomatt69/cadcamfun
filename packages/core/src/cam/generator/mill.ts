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
  gcode += `G0 Z${g.stock ? f3(g.stock.topZ + 10) : "10"} ; Move to safe height\n\n`

  if (s.useHighSpeedMode) {
    gcode += "; High Speed Machining mode enabled\n"
    gcode += "G64 P0.01 ; Path blending with tolerance of 0.01mm\n\n"
  } else if (s.useExactStop) {
    gcode += "; Exact Stop mode enabled\n"
    gcode += "G61 ; Exact stop mode\n\n"
  }

  // With the control compensating (G41 / G42) the program follows the part's contour itself: the control adds the tool
  // radius. Offsetting the path here as well would cut a radius too far (spec 32 §2.2).
  const compensated = s.useToolCompensation && (s.operationType === "contour" || s.operationType === "profile") && (s.offset === "outside" || s.offset === "inside")
  const toolpath = withFinishingPass(compensated ? { ...s, offset: "center" } : s, g, millToolpath)

  if (s.useToolCompensation) {
    gcode += "; Tool compensation enabled\n"
    // The side follows the path as written: outside a counter-clockwise contour (or inside a clockwise one) the tool is on
    // the right of the travel (G42), otherwise on the left (G41).
    const first = firstLoop(toolpath)
    const side = !compensated || first === undefined ? "" : (s.offset === "outside") === (signedArea(first.points) > 0) ? "G42" : "G41"
    if (side && first !== undefined) {
      gcode += `${side} D${s.toolNumber || 1} ; Tool compensation\n`
      // The start-up move runs into the first corner along the first element, from more than a tool radius away.
      const [a, b] = first.points
      const dx = b!.x - a!.x, dy = b!.y - a!.y, len = Math.hypot(dx, dy) || 1
      const lead = s.toolDiameter + 2
      gcode += `G0 X${(a!.x - (dx / len) * lead).toFixed(3)} Y${(a!.y - (dy / len) * lead).toFixed(3)} ; Approach point for compensation\n`
      gcode += toolpath
      gcode += "G40 ; Cancel tool compensation\n"
    } else {
      if (s.operationType === "contour" || s.operationType === "profile") gcode += "; Warning: tool compensation needs an inside or outside contour; the path is offset by the program instead\n"
      gcode += toolpath
    }
  } else {
    gcode += toolpath
  }

  gcode += "\n; End of program\n"
  gcode += `G0 Z${g.stock ? f3(Math.max(30, g.stock.topZ + 10)) : "30"} ; Move to safe height\n`
  if (s.coolant) gcode += "M9 ; Coolant off\n"
  gcode += "M5 ; Stop spindle\n"
  gcode += "M30 ; Program end\n"
  return gcode
}

/** The XY points of the first closed run of G1 moves in a toolpath text (the first contour level), with the start repeated. */
const firstLoop = (toolpath: string): { readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> } | undefined => {
  const points: Array<{ x: number; y: number }> = []
  let x: number | undefined, y: number | undefined
  for (const raw of toolpath.split("\n")) {
    const line = raw.replace(/;.*$/, "").trim()
    const mx = /X(-?[\d.]+)/.exec(line), my = /Y(-?[\d.]+)/.exec(line)
    if (mx) x = Number(mx[1])
    if (my) y = Number(my[1])
    if (!/^G0?1\b/.test(line) || x === undefined || y === undefined) { if (points.length > 2 && /^G0?0\b/.test(line) && (mx || my || /Z/.test(line))) break; continue }
    const last = points[points.length - 1]
    if (last === undefined || Math.hypot(last.x - x, last.y - y) > 1e-9) points.push({ x, y })
    if (points.length > 3 && Math.hypot(points[0]!.x - x, points[0]!.y - y) < 1e-6) return { points }
  }
  return points.length > 2 ? { points } : undefined
}

const signedArea = (points: ReadonlyArray<{ readonly x: number; readonly y: number }>): number => {
  let a = 0
  for (let i = 0; i < points.length; i++) { const p = points[i]!, q = points[(i + 1) % points.length]!; a += p.x * q.y - q.x * p.y }
  return a / 2
}
