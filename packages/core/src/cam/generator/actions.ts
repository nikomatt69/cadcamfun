/**
 * Action-driven toolpaths for selected CAD elements.
 *
 * The legacy panel only ever contoured a selected element, whatever operation the user picked.
 * Here the operation decides what the element becomes:
 *
 *  - `contour` / `profile` / `3d_surface` — follow the element (its per-type generator);
 *  - `pocket` — clear the inside of a closed shape, spiralling out from its centre;
 *  - `drill` — canned cycle (`G81`, or `G83` peck when `stepdown < depth`) at the element's drilling points;
 *  - `engrave` — follow the outline at one shallow, constant depth;
 *  - `threading` — thread milling (`operations/thread.ts`): a helix round each hole or boss, pitch, hand, passes from the settings.
 *
 * Elements arrive already aligned to the stock (top face at Z0) and shifted to the machine origin.
 */
import { Schema } from "effect"
import { ThreadParams, generateThread } from "../operations/thread.ts"
import { movesToGcode } from "./surface.ts"
import { above, circleWords, cutLevels, f3, plunge, retractRapid, type Pt } from "./common.ts"
import { elementToolpath } from "./element-paths.ts"
import { elementOutline, getDrillingPoints, type V3 } from "./elements.ts"
import type { CadElement, GeometryInput, ToolpathSettings } from "./schema.ts"

const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)

// ---------------------------------------------------------------- pocket

type Shape =
  | { readonly kind: "rect"; readonly cx: number; readonly cy: number; readonly w: number; readonly h: number }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly kind: "polygon"; readonly cx: number; readonly cy: number; readonly r: number; readonly sides: number }

/** The closed XY shape a pocket clears, or `undefined` when the element cannot be pocketed. */
export const pocketShape = (e: CadElement): Shape | undefined => {
  const x = num(e["x"]), y = num(e["y"])
  switch (e["type"]) {
    case "rectangle": return { kind: "rect", cx: x, cy: y, w: num(e["width"]), h: num(e["height"]) }
    case "cube": return { kind: "rect", cx: x, cy: y, w: num(e["width"]), h: num(e["height"]) }
    case "pyramid": return { kind: "rect", cx: x, cy: y, w: num(e["width"] ?? e["baseWidth"]), h: num(e["depth"] ?? e["baseDepth"]) }
    case "circle": case "cylinder": case "sphere": case "cone": case "hemisphere": case "capsule":
      return { kind: "circle", cx: x, cy: y, r: num(e["radius"]) }
    case "polygon": case "prism": return { kind: "polygon", cx: x, cy: y, r: num(e["radius"]), sides: num(e["sides"], 6) }
    case "ellipse": case "ellipsoid":
      return { kind: "ellipse", cx: x, cy: y, rx: num(e["radiusX"]) || num(e["width"]) / 2, ry: num(e["radiusY"]) || num(e["height"]) / 2 }
    default: return undefined
  }
}

const ringPoints = (cx: number, cy: number, rx: number, ry: number, count: number, s: ToolpathSettings): Pt[] => {
  const pts: Pt[] = Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * 2 * Math.PI
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt
  })
  return s.direction === "conventional" ? pts.reverse() : pts
}

const polygonRing = (cx: number, cy: number, r: number, sides: number, s: ToolpathSettings): Pt[] => {
  const pts: Pt[] = Array.from({ length: sides }, (_, i) => {
    const a = i * ((2 * Math.PI) / sides)
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt
  })
  pts.push(pts[0]!)
  return s.direction === "conventional" ? pts.reverse() : pts
}

const rectRing = (cx: number, cy: number, hw: number, hh: number, s: ToolpathSettings): Pt[] => {
  const pts: Pt[] = [[cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh], [cx + hw, cy - hh]]
  return s.direction === "conventional" ? pts.reverse() : pts
}

/** Concentric rings, centre outwards, stepping by `stepover` % of the tool diameter; the tool centre stays inside. */
export const pocketElement = (e: CadElement, s: ToolpathSettings): string | undefined => {
  const shape = pocketShape(e)
  if (!shape) return undefined
  const toolR = s.toolDiameter / 2
  const step = s.toolDiameter * (s.stepover / 100)
  let gcode = `; Pocket: ${String(e["type"])} at (${f3(shape.cx)}, ${f3(shape.cy)}) - stepover ${s.stepover}% (${step.toFixed(2)}mm)\n`

  // Largest ring the tool centre may reach, and the ring count.
  let rings: Array<{ readonly path: ReadonlyArray<Pt>; readonly label: string; readonly circle?: number }> = []
  const reach = shape.kind === "rect" ? Math.min(shape.w, shape.h) / 2 - toolR
    : shape.kind === "circle" ? shape.r - toolR
    : shape.kind === "polygon" ? shape.r * Math.cos(Math.PI / shape.sides) - toolR
    : Math.min(shape.rx, shape.ry) - toolR
  if (reach < 0) return gcode + `; Cannot pocket: shape is smaller than the tool (Ø${s.toolDiameter}mm)\n`
  const count = Math.max(1, Math.ceil(reach / step))
  for (let k = 1; k <= count; k++) {
    const inset = Math.min(reach, k * step)
    switch (shape.kind) {
      case "rect": {
        const hw = Math.max(0, shape.w / 2 - toolR - (reach - inset))
        const hh = Math.max(0, shape.h / 2 - toolR - (reach - inset))
        rings.push({ path: rectRing(shape.cx, shape.cy, hw, hh, s), label: `Ring ${k}` })
        break
      }
      case "circle": rings.push({ path: [], label: `Ring ${k}`, circle: Math.max(inset, 0.0001) }); break
      case "polygon": rings.push({ path: polygonRing(shape.cx, shape.cy, Math.max(0.0001, (shape.r - toolR / Math.cos(Math.PI / shape.sides)) * (inset / Math.max(reach, 1e-9))), shape.sides, s), label: `Ring ${k}` }); break
      case "ellipse": {
        const t = inset / Math.max(reach, 1e-9)
        rings.push({ path: ringPoints(shape.cx, shape.cy, Math.max(0.0001, (shape.rx - toolR) * t), Math.max(0.0001, (shape.ry - toolR) * t), 48, s), label: `Ring ${k}` })
        break
      }
    }
  }

  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    gcode += `G0 X${f3(shape.cx)} Y${f3(shape.cy)} ; Move to center\n`
    gcode += plunge(z, s)
    for (const ring of rings) {
      if (ring.circle !== undefined && shape.kind === "circle") {
        const { code, label } = circleWords(s)
        gcode += `G1 X${f3(shape.cx + ring.circle)} Y${f3(shape.cy)} F${s.feedrate} ; ${ring.label}\n`
        gcode += `${code} X${f3(shape.cx + ring.circle)} Y${f3(shape.cy)} I${f3(-ring.circle)} J0 F${s.feedrate} ; ${label}\n`
      } else {
        ring.path.forEach((p, i) => { gcode += `G1 X${f3(p[0])} Y${f3(p[1])} F${s.feedrate} ; ${ring.label} point ${i + 1}\n` })
      }
    }
  })
  return gcode
}

// ---------------------------------------------------------------- drill

/** Nearest-neighbour order from the origin. */
export const orderPoints = (points: ReadonlyArray<V3>): V3[] => {
  const left = [...points]
  const out: V3[] = []
  let at = { x: 0, y: 0 }
  while (left.length > 0) {
    let best = 0
    for (let i = 1; i < left.length; i++) {
      if (Math.hypot(left[i]!.x - at.x, left[i]!.y - at.y) < Math.hypot(left[best]!.x - at.x, left[best]!.y - at.y)) best = i
    }
    const next = left.splice(best, 1)[0]!
    out.push(next)
    at = next
  }
  return out
}

export interface DrillPoint extends V3 {
  /** Depth for this hole (stock-limited), mm, positive. */
  readonly depth: number
  readonly source: string
}

/** One canned cycle per point, nearest first, a single `G80` at the end. */
export const drillPoints = (points: ReadonlyArray<DrillPoint>, s: ToolpathSettings, label: string): string => {
  const ordered = orderPoints(points) as DrillPoint[]
  let gcode = `; Drilling ${ordered.length} point(s) from ${label} - depth ${s.depth}mm${s.stepdown < s.depth ? `, peck ${s.stepdown}mm` : ""}\n`
  const first = ordered[0]
  if (first) gcode += `G0 X${f3(first.x)} Y${f3(first.y)} Z${f3(10)} ; Move above first hole\n`
  for (const p of ordered) {
    const peck = s.stepdown < p.depth
    gcode += `${peck ? "G83" : "G81"} X${f3(p.x)} Y${f3(p.y)} Z${f3(-p.depth)} R${f3(2)}${peck ? ` Q${f3(s.stepdown)}` : ""} F${s.plungerate} ; ${peck ? "Peck drilling" : "Drilling"}\n`
  }
  gcode += "G80 ; Cancel fixed cycle\n"
  return gcode
}

/** Hole points of one element, each with the depth it may drill. */
export const drillPointsOf = (e: CadElement, depth: number): DrillPoint[] =>
  getDrillingPoints(e).map(p => ({ ...p, depth, source: String(e["type"]) }))

/** Warning when the tool is wider than the circle it is asked to drill. */
export const drillWarning = (e: CadElement, s: ToolpathSettings): string =>
  e["type"] === "circle" && num(e["radius"]) * 2 < s.toolDiameter - 1e-9
    ? `; Warning: tool Ø${s.toolDiameter}mm is larger than the hole Ø${(num(e["radius"]) * 2).toFixed(3)}mm\n`
    : ""

export const drillElement = (e: CadElement, s: ToolpathSettings): string =>
  drillWarning(e, s) + drillPoints(drillPointsOf(e, s.depth), s, String(e["type"]))

// ---------------------------------------------------------------- engrave

export const engraveElement = (e: CadElement, s: ToolpathSettings): string => {
  const outline = elementOutline(e, 0)
  if (outline.length < 2) return `; Engrave: ${String(e["type"])} has no outline\n`
  const z = -Math.min(s.depth, s.stepdown)
  const path: Pt[] = outline.map(p => [p.x, p.y] as Pt)
  const ordered = s.direction === "conventional" ? [...path].reverse() : path
  let gcode = `; Engrave: ${String(e["type"])} outline at constant depth ${f3(z)}mm\n`
  gcode += above(ordered[0]![0], ordered[0]![1], 0) + plunge(z, s)
  ordered.slice(1).forEach((p, i) => { gcode += `G1 X${f3(p[0])} Y${f3(p[1])} F${s.feedrate} ; Engrave point ${i + 1}\n` })
  // An open path (line, arc) is engraved back so both ends are cut the same.
  const closed = Math.hypot(path[0]![0] - path[path.length - 1]![0], path[0]![1] - path[path.length - 1]![1]) < 1e-6
  if (!closed) ordered.slice(0, -1).reverse().forEach((p, i) => { gcode += `G1 X${f3(p[0])} Y${f3(p[1])} F${s.feedrate} ; Return point ${i + 1}\n` })
  return gcode
}

// ---------------------------------------------------------------- thread milling

/** Nominal diameter a threaded element asks for, or undefined when it is not round. */
const threadDiameter = (e: CadElement): number | undefined => {
  switch (e["type"]) {
    case "circle": case "cylinder": case "cone": case "sphere": case "hemisphere": case "capsule": return num(e["radius"]) > 0 ? num(e["radius"]) * 2 : undefined
    default: return undefined
  }
}

/** A thread-milling helix for a round element: the hole (internal) or the boss (external) of the thread. */
export const threadElement = (e: CadElement, s: ToolpathSettings): string => {
  const diameter = threadDiameter(e)
  if (diameter === undefined) return `; Warning: thread milling needs a circle or a cylinder (a hole or a boss); '${String(e["type"])}' is not round\n`
  const params = Schema.decodeUnknownSync(ThreadParams)({
    name: `Thread ${String(e["type"])}`, x: num(e["x"]), y: num(e["y"]), diameter, pitch: s.threadPitch,
    internal: s.threadType === "internal", rightHand: s.threadHand === "right", climb: s.direction === "climb",
    passes: s.threadPasses, springPasses: s.threadSpringPasses, totalDepth: s.depth,
    clearanceHeight: 10, safeHeight: 5, retractHeight: 2, feed: s.feedrate, plungeFeed: s.plungerate, spindleRpm: s.rpm, coolant: s.coolant ? "flood" : "off"
  })
  const tool = { id: "1", name: `${s.toolType} ${s.toolDiameter}`, kind: "endmill" as const, diameter: s.toolDiameter, flutes: s.flutes, maxRpm: Math.max(s.rpm, 1) }
  const result = generateThread(params, tool, { x: 1, y: 1, z: 1, origin: { x: 0, y: 0, z: 0 }, material: s.material })
  const header = `; Thread mill M${f3(diameter)}x${f3(s.threadPitch)} ${s.threadType} ${s.threadHand}-hand, minor Ø${f3(result.stats.minorDiameter)}, ${result.stats.radii.length} pass(es)\n`
  return header + result.warnings.map((w) => `; Warning: ${w}\n`).join("") + movesToGcode(result.toolpath.moves)
}

// ---------------------------------------------------------------- dispatch

/** What `operationType` does to one element. */
export const elementOperation = (e: CadElement, s: ToolpathSettings, g: GeometryInput): string => {
  switch (s.operationType) {
    case "pocket":
      return pocketElement(e, s) ?? `; Pocket is not available for '${String(e["type"])}' - following its contour instead\n${elementToolpath(e, s, g)}`
    case "drill": return drillElement(e, s)
    case "engrave": return engraveElement(e, s)
    case "threading": return threadElement(e, s)
    default: return elementToolpath(e, s, g)
  }
}

