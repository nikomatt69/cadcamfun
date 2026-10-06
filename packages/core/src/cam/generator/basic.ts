/** Toolpaths for the panel's own geometry types (rectangle, circle, polygon). */
import { applyOriginOffset, cutLevels, f3, fullCircleFrom, offsetDistance, offsetRadius, circleWords, pointMoves, cornerMoves, retractRapid, type Pt } from "./common.ts"
import type { GeometryInput, ToolpathSettings } from "./schema.ts"

// -- basic geometry toolpaths --------------------------------------------------------------------

export const rectangleToolpath = (s: ToolpathSettings, g: GeometryInput): string => {
  let gcode = "; Rectangle toolpath\n"
  const d = offsetDistance(s)
  const width = g.rectangleWidth + d * 2
  const height = g.rectangleHeight + d * 2
  const baseX = -width / 2
  const baseY = -height / 2
  const start = applyOriginOffset(s, g, baseX, baseY)
  const levels = cutLevels(s.depth, s.stepdown)
  levels.forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    if (s.operationType === "pocket") {
      const step = s.toolDiameter * (s.stepover / 100)
      const steps = Math.max(Math.ceil(width / step), Math.ceil(height / step))
      gcode += `; Pocket operation - Stepover: ${s.stepover}% (${step.toFixed(2)}mm)\n`
      const center = applyOriginOffset(s, g, 0, 0)
      gcode += `G0 X${f3(center.x)} Y${f3(center.y)} ; Move to center\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      for (let k = 1; k <= steps; k++) {
        const cx = Math.min(width / 2, (k * step) / 2)
        const cy = Math.min(height / 2, (k * step) / 2)
        const c1 = applyOriginOffset(s, g, cx, -cy)
        const c2 = applyOriginOffset(s, g, cx, cy)
        const c3 = applyOriginOffset(s, g, -cx, cy)
        const c4 = applyOriginOffset(s, g, -cx, -cy)
        gcode += `G1 X${f3(c1.x)} Y${f3(c1.y)} F${s.feedrate} ; Step ${k} corner 1\n`
        gcode += `G1 X${f3(c2.x)} Y${f3(c2.y)} F${s.feedrate} ; Step ${k} corner 2\n`
        gcode += `G1 X${f3(c3.x)} Y${f3(c3.y)} F${s.feedrate} ; Step ${k} corner 3\n`
        gcode += `G1 X${f3(c4.x)} Y${f3(c4.y)} F${s.feedrate} ; Step ${k} corner 4\n`
        gcode += `G1 X${f3(c1.x)} Y${f3(c1.y)} F${s.feedrate} ; Close loop\n`
      }
    } else {
      gcode += `G0 X${f3(start.x)} Y${f3(start.y)} ; Move to start position\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      const origin: Pt[] = [
        pt(applyOriginOffset(s, g, baseX, baseY)),
        pt(applyOriginOffset(s, g, baseX + width, baseY)),
        pt(applyOriginOffset(s, g, baseX + width, baseY + height)),
        pt(applyOriginOffset(s, g, baseX, baseY + height)),
        pt(applyOriginOffset(s, g, baseX, baseY))
      ]
      if (s.direction === "conventional") origin.reverse()
      gcode += cornerMoves(origin, s.feedrate)
    }
  })
  return gcode
}

export const pt = (p: { x: number; y: number }): Pt => [p.x, p.y]

export const circleToolpath = (s: ToolpathSettings, g: GeometryInput): string => {
  let gcode = "; Circle toolpath\n"
  const radius = offsetRadius(s, g.circleRadius)
  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    if (s.operationType === "pocket") {
      const step = s.toolDiameter * (s.stepover / 100)
      const steps = Math.ceil(radius / step)
      gcode += `; Circular pocket operation - Stepover: ${s.stepover}% (${step.toFixed(2)}mm)\n`
      const center = applyOriginOffset(s, g, 0, 0)
      gcode += `G0 X${f3(center.x)} Y${f3(center.y)} ; Move to center\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      for (let i = 1; i <= steps; i++) {
        const r = i * step
        if (r > radius) break
        gcode += `G1 X${f3(center.x + r)} Y${f3(center.y)} F${s.feedrate} ; Move to radius ${r.toFixed(3)}mm\n`
        gcode += fullCircleFrom(s, center.x, center.y, r, `Circle at radius ${r.toFixed(3)}mm`)
      }
    } else {
      const start = applyOriginOffset(s, g, radius, 0)
      const center = applyOriginOffset(s, g, 0, 0)
      gcode += `G0 X${f3(start.x)} Y${f3(start.y)} ; Move to start position\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      const { code, label } = circleWords(s)
      gcode += `${code} X${f3(start.x)} Y${f3(start.y)} I${f3(center.x - start.x)} J${f3(center.y - start.y)} F${s.feedrate} ; ${label}\n`
    }
  })
  return gcode
}

export const polygonToolpath = (s: ToolpathSettings, g: GeometryInput): string => {
  let gcode = `; Polygon toolpath (${g.polygonSides} sides)\n`
  const radius = offsetRadius(s, g.polygonRadius)
  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    if (s.operationType === "pocket") {
      const step = s.toolDiameter * (s.stepover / 100)
      const steps = Math.ceil(radius / step)
      gcode += `; Polygon pocket operation - Stepover: ${s.stepover}% (${step.toFixed(2)}mm)\n`
      const center = applyOriginOffset(s, g, 0, 0)
      gcode += `G0 X${f3(center.x)} Y${f3(center.y)} ; Move to center\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      for (let i = 1; i <= steps; i++) {
        const r = Math.min(i * step, radius)
        const points: Pt[] = []
        for (let j = 0; j < g.polygonSides; j++) {
          const a = j * ((2 * Math.PI) / g.polygonSides)
          points.push(pt(applyOriginOffset(s, g, r * Math.cos(a), r * Math.sin(a))))
        }
        points.push(points[0]!)
        if (s.direction === "conventional") points.reverse()
        points.forEach((p, j) => {
          gcode += `G1 X${f3(p[0])} Y${f3(p[1])} F${s.feedrate} ; Point ${j + 1} at radius ${r.toFixed(3)}\n`
        })
      }
    } else {
      const points: Pt[] = []
      for (let i = 0; i < g.polygonSides; i++) {
        const a = i * ((2 * Math.PI) / g.polygonSides)
        points.push(pt(applyOriginOffset(s, g, radius * Math.cos(a), radius * Math.sin(a))))
      }
      points.push(points[0]!)
      if (s.direction === "conventional") points.reverse()
      const first = points[0]!
      gcode += `G0 X${f3(first[0])} Y${f3(first[1])} ; Move to start position\n`
      gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
      gcode += pointMoves(points, s.feedrate, "Point")
    }
  })
  return gcode
}
