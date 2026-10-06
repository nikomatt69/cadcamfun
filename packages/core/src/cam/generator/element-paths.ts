/** Toolpaths for selected CAD elements (legacy `generateFromSelectedElements` and the primitive generators). */
import { above, circleSlice, cornerMoves, cutLevels, f3, fullCircleFrom, offsetDistance, offsetRadius, plunge, pointMoves, polygonPoints, ellipsePoints, rectangleCorners, retractRapid, type Pt } from "./common.ts"
import type { CadElement, GeometryInput, ToolpathSettings } from "./schema.ts"

// -- selected-element toolpaths ------------------------------------------------------------------

export const rectangleFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Rectangle: center (${e.x}, ${e.y}), width ${e.width}mm, height ${e.height}mm\n`
  const d = offsetDistance(s)
  const w = e.width + d * 2
  const h = e.height + d * 2
  const x0 = e.x - w / 2
  const y0 = e.y - h / 2
  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    gcode += `G0 X${f3(x0)} Y${f3(y0)} ; Move to start position\n`
    gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
    gcode += cornerMoves(rectangleCorners(x0, y0, w, h, s), s.feedrate)
  })
  return gcode
}

export const circleFromElement = (e: CadElement, s: ToolpathSettings, g: GeometryInput): string => {
  let gcode = `; Circle: center (${e.x}, ${e.y}), radius ${e.radius}mm\n`
  const radius = offsetRadius(s, e.radius)
  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    const center = { x: e.x as number, y: e.y as number }
    gcode += `G0 X${f3(center.x + radius)} Y${f3(center.y)} ; Move to start position\n`
    gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
    gcode += fullCircleFrom(s, center.x, center.y, radius)
  })
  return gcode
}

export const lineFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Line: from (${e.x1}, ${e.y1}) to (${e.x2}, ${e.y2})\n`
  cutLevels(s.depth, s.stepdown).forEach((z, index) => {
    gcode += `\n; Z Level: ${z}\n`
    if (index > 0) gcode += retractRapid(5)
    gcode += `G0 X${f3(e.x1)} Y${f3(e.y1)} ; Move to start position\n`
    gcode += `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`
    gcode += `G1 X${f3(e.x2)} Y${f3(e.y2)} F${s.feedrate} ; Linear move to end\n`
  })
  return gcode
}

export const cubeFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Cube: center (${e.x}, ${e.y}, ${e.z}), width ${e.width}mm, height ${e.height}mm, depth ${e.depth}mm\n`
  // CAD scene convention: X = width, Y = height, Z = depth.
  const d = offsetDistance(s)
  const w = e.width + d * 2
  const h = e.height + d * 2
  const x0 = e.x - w / 2
  const y0 = e.y - h / 2
  const topZ = e.z + e.depth / 2
  for (const level of cutLevels(Math.min(s.depth, e.depth), s.stepdown)) {
    const z = topZ + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    gcode += above(x0, y0, topZ, "Move to start position")
    gcode += plunge(z, s)
    gcode += cornerMoves(rectangleCorners(x0, y0, w, h, s), s.feedrate)
  }
  return gcode
}

export const sphereFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Sphere: center (${e.x}, ${e.y}, ${e.z}), radius ${e.radius}mm\n`
  const topZ = e.z + e.radius
  for (let sliceZ = topZ; sliceZ >= e.z - s.depth; sliceZ -= s.stepdown) {
    const dist = Math.abs(sliceZ - e.z)
    const sliceRadius = dist < e.radius ? Math.sqrt(e.radius * e.radius - dist * dist) : 0
    if (sliceRadius <= 0) continue
    gcode += `\n; Sphere Slice at Z=${sliceZ.toFixed(3)}, Radius=${sliceRadius.toFixed(3)}\n`
    gcode += circleSlice(e, s, offsetRadius(s, sliceRadius), sliceZ, "Move above slice")
  }
  return gcode
}

export const cylinderFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Cylinder: center (${e.x}, ${e.y}, ${e.z}), radius ${e.radius}mm, height ${e.height}mm\n`
  const radius = offsetRadius(s, e.radius)
  const topZ = e.z + e.height / 2
  for (const level of cutLevels(Math.min(s.depth, e.height), s.stepdown)) {
    const z = topZ + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    gcode += above(e.x + radius, e.y, topZ) + plunge(z, s) + fullCircleFrom(s, e.x, e.y, radius)
  }
  return gcode
}

export const coneFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Cone: base center (${e.x}, ${e.y}, ${e.z}), base radius ${e.radius}mm, height ${e.height}mm\n`
  const baseZ = e.z - e.height / 2
  const topZ = e.z + e.height / 2
  for (let sliceZ = baseZ; sliceZ <= Math.min(baseZ + s.depth, topZ); sliceZ += s.stepdown) {
    const sliceRadius = e.radius * (1 - (sliceZ - baseZ) / e.height)
    if (sliceRadius <= s.toolDiameter / 2) continue
    const radius = offsetRadius(s, sliceRadius)
    if (radius <= 0) continue
    gcode += `\n; Cone Slice at Z=${sliceZ.toFixed(3)}, Radius=${radius.toFixed(3)}\n`
    gcode += circleSlice(e, s, radius, sliceZ, "Move above slice")
  }
  return gcode
}

export const torusFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Torus: center (${e.x}, ${e.y}, ${e.z}), major radius ${e.radius}mm, minor radius ${e.tubeRadius}mm\n`
  const major = e.radius || 30
  const minor = e.tubeRadius || 10
  const topZ = e.z + minor
  const bottomZ = e.z - minor
  const tool = s.toolDiameter / 2
  for (let sliceZ = topZ; sliceZ >= Math.max(bottomZ, topZ - s.depth); sliceZ -= s.stepdown) {
    const dist = Math.abs(sliceZ - e.z)
    if (dist > minor) continue
    const slice = Math.sqrt(minor * minor - dist * dist)
    let outer = major + slice
    let inner = major - slice
    if (s.offset === "outside") { outer += tool; inner -= tool } else if (s.offset === "inside") { outer -= tool; inner += tool }
    if (inner >= outer) continue
    gcode += `\n; Torus Slice at Z=${sliceZ.toFixed(3)}, Outer=${outer.toFixed(3)}, Inner=${inner.toFixed(3)}\n`
    gcode += above(e.x + outer, e.y, sliceZ, "Move above outer circle") + plunge(sliceZ, s)
    gcode += fullCircleFrom(s, e.x, e.y, outer, s.direction === "climb" ? "Outer circle counter-clockwise" : "Outer circle clockwise")
    gcode += `G0 X${f3(e.x + inner)} Y${f3(e.y)} ; Move to inner circle\n`
    // Inner circle runs the opposite way.
    const innerCode = s.direction === "climb" ? "G2" : "G3"
    const innerLabel = s.direction === "climb" ? "Inner circle clockwise" : "Inner circle counter-clockwise"
    gcode += `${innerCode} X${f3(e.x + inner)} Y${f3(e.y)} I${f3(-inner)} J0 F${s.feedrate} ; ${innerLabel}\n`
  }
  return gcode
}

export const extrudeFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Extrude: base at (${e.x}, ${e.y}, ${e.z}), shape type: ${e.shapeType || "custom"}, height: ${e.height || 10}mm\n`
  const height = e.height || 10
  const levels = cutLevels(Math.min(height, s.depth), s.stepdown)
  if (e.shapeType === "rectangle" || e.baseShape?.type === "rectangle") {
    const d = offsetDistance(s)
    const w = (e.width || e.baseShape?.width || 50) + d * 2
    const l = (e.length || e.baseShape?.length || 50) + d * 2
    const x0 = e.x - w / 2
    const y0 = e.y - l / 2
    for (const level of levels) {
      const z = e.z + Math.min(height, -level)
      gcode += `\n; Z Level: ${z.toFixed(3)}\n` + above(x0, y0, z) + plunge(z, s)
      gcode += cornerMoves(rectangleCorners(x0, y0, w, l, s), s.feedrate)
    }
  } else if (e.shapeType === "circle" || e.baseShape?.type === "circle") {
    const radius = offsetRadius(s, e.radius || e.baseShape?.radius || 25)
    for (const level of levels) {
      const z = e.z + Math.min(height, -level)
      gcode += `\n; Z Level: ${z.toFixed(3)}\n` + circleSlice(e, s, radius, z, "Move above start position")
    }
  } else {
    gcode += "; Complex extrusion path not supported - convert to basic shapes first\n"
  }
  return gcode
}

export const textFromElement = (e: CadElement): string =>
  `; Text: position (${e.x}, ${e.y}, ${e.z}), content: "${e.text || "Text"}"\n` +
  "; Text engraving requires conversion to paths - please use CAM software for text operations\n" +
  "; Recommend using outline paths or importing as SVG for text machining\n"

export const polygonFromElement = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Polygon: center (${e.x}, ${e.y}, ${e.z}), sides: ${e.sides || 6}, radius: ${e.radius || 30}mm\n`
  const sides = e.sides || 6
  const radius = offsetRadius(s, e.radius || 30)
  if (radius <= 0) return "; Cannot generate toolpath: radius after offset is too small\n"
  const points = polygonPoints(e.x, e.y, radius, sides, s)
  cutLevels(s.depth, s.stepdown).forEach((level, index) => {
    const z = e.z + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    if (index > 0) gcode += retractRapid(e.z + 5)
    gcode += above(points[0]![0], points[0]![1], e.z) + plunge(z, s) + pointMoves(points, s.feedrate, "Point")
  })
  return gcode
}

export const pyramidToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const baseWidth = e.baseWidth || e.width || 50
  const baseDepth = e.baseDepth || e.depth || 50
  const height = e.height || 50
  let gcode = `; Pyramid: center (${e.x}, ${e.y}, ${e.z}), base width ${baseWidth}mm, base depth ${baseDepth}mm, height ${height}mm\n`
  const d = offsetDistance(s)
  const topZ = e.z + height / 2
  const bottomZ = e.z - height / 2
  for (const level of cutLevels(Math.min(s.depth, height), s.stepdown)) {
    const z = topZ + level
    const ratio = 1 - (z - bottomZ) / height
    const w = baseWidth * ratio + d * 2
    const dep = baseDepth * ratio + d * 2
    if (w <= 0 || dep <= 0) {
      gcode += `\n; Z Level: ${z.toFixed(3)} - Offset dimensions too small, skipping\n`
      continue
    }
    const x0 = e.x - w / 2
    const y0 = e.y - dep / 2
    gcode += `\n; Z Level: ${z.toFixed(3)}, Slice width: ${w.toFixed(3)}, Slice depth: ${dep.toFixed(3)}\n`
    gcode += above(x0, y0, z) + plunge(z, s) + cornerMoves(rectangleCorners(x0, y0, w, dep, s), s.feedrate)
  }
  return gcode
}

export const hemisphereToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const radius = e.radius || 25
  const dir = e.direction || "up"
  let gcode = `; Hemisphere: center (${e.x}, ${e.y}, ${e.z}), radius ${e.radius}mm, direction ${dir}\n`
  const topZ = dir === "up" ? e.z + radius : e.z
  const bottomZ = dir === "up" ? e.z : e.z - radius
  for (const level of cutLevels(Math.min(s.depth, radius), s.stepdown)) {
    const z = topZ + level
    if (z < bottomZ) continue
    const at = Math.sqrt(Math.max(0, radius * radius - (z - e.z) ** 2))
    const r = offsetRadius(s, at)
    if (r <= 0) {
      gcode += `\n; Z Level: ${z.toFixed(3)} - Radius too small, skipping\n`
      continue
    }
    gcode += `\n; Z Level: ${z.toFixed(3)}, Radius: ${r.toFixed(3)}\n` + circleSlice(e, s, r, z, "Move above start position")
  }
  return gcode
}

export const prismToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const radius = e.radius || 25
  const height = e.height || 50
  const sides = e.sides || 6
  let gcode = `; Prism: center (${e.x}, ${e.y}, ${e.z}), radius ${e.radius}mm, height ${e.height}mm, sides ${sides}\n`
  const r = offsetRadius(s, radius)
  if (r <= 0) return "; Prism radius after offset too small, cannot generate toolpath\n"
  const topZ = e.z + height / 2
  const points = polygonPoints(e.x, e.y, r, sides, s)
  for (const level of cutLevels(Math.min(s.depth, height), s.stepdown)) {
    const z = topZ + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n` + above(points[0]![0], points[0]![1], z) + plunge(z, s) + pointMoves(points, s.feedrate, "Point")
  }
  return gcode
}

export const ellipsoidToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const rx = e.radiusX || e.width / 2 || 25
  const ry = e.radiusY || e.height / 2 || 15
  const rz = e.radiusZ || e.depth / 2 || 20
  let gcode = `; Ellipsoid: center (${e.x}, ${e.y}, ${e.z}), radiusX ${rx}mm, radiusY ${ry}mm, radiusZ ${rz}mm\n`
  const topZ = e.z + rz
  const tool = s.toolDiameter / 2
  for (const level of cutLevels(Math.min(s.depth, rz * 2), s.stepdown)) {
    const z = topZ + level
    const ratio = Math.abs(z - e.z) / rz
    if (ratio > 1) continue
    const scale = Math.sqrt(1 - ratio * ratio)
    const ex = rx * scale
    const ey = ry * scale
    const ox = s.offset === "outside" ? ex + tool : s.offset === "inside" ? Math.max(0, ex - tool) : ex
    const oy = s.offset === "outside" ? ey + tool : s.offset === "inside" ? Math.max(0, ey - tool) : ey
    if (ox <= 0 || oy <= 0) {
      gcode += `\n; Z Level: ${z.toFixed(3)} - Offset dimensions too small, skipping\n`
      continue
    }
    const points = ellipsePoints(e.x, e.y, ox, oy, 36, s)
    gcode += `\n; Z Level: ${z.toFixed(3)}, X Radius: ${ex.toFixed(3)}, Y Radius: ${ey.toFixed(3)}\n`
    gcode += above(points[0]![0], points[0]![1], z) + plunge(z, s) + pointMoves(points, s.feedrate, "Ellipse point")
  }
  return gcode
}

export const capsuleToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const radius = e.radius || 15
  const height = e.height || 50
  const dir = e.direction || "z"
  let gcode = `; Capsule: center (${e.x}, ${e.y}, ${e.z}), radius ${radius}mm, height ${height}mm, direction ${dir}\n`
  const cylinderLength = Math.max(0, height - 2 * radius)
  const minZ = dir === "z" ? e.z - height / 2 : e.z - radius
  const maxZ = dir === "z" ? e.z + height / 2 : e.z + radius
  const r = offsetRadius(s, radius)
  if (r <= 0) return "; Capsule radius after offset too small, cannot generate toolpath\n"
  for (const level of cutLevels(Math.min(s.depth, maxZ - minZ), s.stepdown)) {
    const z = maxZ + level
    if (z < minZ) continue
    let slice: { type: "circle" | "ellipse"; rx: number; ry: number }
    if (dir === "z") {
      slice = { type: "circle", rx: radius, ry: radius }
    } else if (dir === "y") {
      slice = { type: "ellipse", rx: radius, ry: height / 2 }
    } else {
      slice = { type: "ellipse", rx: height / 2, ry: radius }
    }
    void cylinderLength
    gcode += `\n; Z Level: ${z.toFixed(3)}, Slice type: ${slice.type}\n`
    const points = slice.type === "circle"
      ? ellipsePoints(e.x, e.y, r, r, 36, s)
      : ellipsePoints(e.x, e.y, slice.rx, slice.ry, 36, s)
    gcode += above(points[0]![0], points[0]![1], z) + plunge(z, s)
    gcode += pointMoves(points, s.feedrate, slice.type === "circle" ? "Circle point" : "Ellipse point")
  }
  return gcode
}

export const centroid = (points: ReadonlyArray<Pt>): Pt => {
  const closed = points.length > 1 && points[0]![0] === points[points.length - 1]![0] && points[0]![1] === points[points.length - 1]![1]
  const count = closed ? points.length - 1 : points.length
  let sx = 0
  let sy = 0
  for (let i = 0; i < count; i++) { sx += points[i]![0]; sy += points[i]![1] }
  return [sx / count, sy / count]
}

/** Moves each vertex away from (positive) or towards (negative) the centroid. Same simplification as the legacy code. */
export const offsetPolygon = (points: ReadonlyArray<Pt>, distance: number): Pt[] | null => {
  if (points.length < 3) return null
  const c = centroid(points)
  const out: Pt[] = []
  for (const p of points) {
    const dx = p[0] - c[0]
    const dy = p[1] - c[1]
    const length = Math.hypot(dx, dy)
    if (length < 0.0001) continue
    out.push([p[0] + (dx / length) * distance, p[1] + (dy / length) * distance])
  }
  if (out.length < 3) return null
  const first = out[0]!
  const last = out[out.length - 1]!
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]])
  return out
}

export const triangleToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const hasPoints = Array.isArray(e.points) && e.points.length >= 3
  const hasCoords = [e.x1, e.y1, e.x2, e.y2, e.x3, e.y3].every(v => v !== undefined)
  if (!hasPoints && !hasCoords) return "; Triangle missing points or coordinates\n"
  const points: Array<{ x: number; y: number; z?: number }> = hasPoints
    ? e.points.slice(0, 3)
    : [
        { x: e.x1, y: e.y1, z: e.z1 || e.z || 0 },
        { x: e.x2, y: e.y2, z: e.z2 || e.z || 0 },
        { x: e.x3, y: e.y3, z: e.z3 || e.z || 0 }
      ]
  let gcode = `; Triangle: points [(${points[0]!.x}, ${points[0]!.y}), (${points[1]!.x}, ${points[1]!.y}), (${points[2]!.x}, ${points[2]!.y})]\n`
  const zs = points.map(p => p.z || 0)
  const maxZ = Math.max(...zs)
  const triangleDepth = maxZ - Math.min(...zs)
  const base: Pt[] = points.map(p => [p.x, p.y] as Pt)
  base.push(base[0]!)
  let outline: Pt[] = base
  if (s.offset !== "center") {
    const shifted = offsetPolygon(base, s.offset === "outside" ? s.toolDiameter / 2 : -s.toolDiameter / 2)
    if (shifted && shifted.length >= 3) outline = shifted
    else gcode += "; Could not apply offset to triangle, using original points\n"
  }
  const depth = Math.min(s.depth, triangleDepth > 0 ? triangleDepth : s.depth)
  for (const level of cutLevels(depth, s.stepdown)) {
    const z = maxZ + level
    const ring = s.direction === "conventional" ? [...outline].reverse() : outline
    gcode += `\n; Z Level: ${z.toFixed(3)}\n` + above(ring[0]![0], ring[0]![1], z) + plunge(z, s) + pointMoves(ring, s.feedrate, "Point")
  }
  return gcode
}

export const arcToolpath = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; Arc: center (${e.x}, ${e.y}, ${e.z}), radius ${e.radius}mm, startAngle ${e.startAngle || 0}°, endAngle ${e.endAngle || 360}°\n`
  const radius = e.radius || 25
  const a0 = ((e.startAngle || 0) * Math.PI) / 180
  const a1 = ((e.endAngle || 360) * Math.PI) / 180
  const ccw = s.direction === "climb"
  const r = s.offset === "inside" ? Math.max(0, radius - s.toolDiameter / 2) : s.offset === "outside" ? radius + s.toolDiameter / 2 : radius
  if (r <= 0) return "; Arc radius after offset too small, cannot generate toolpath\n"
  const full = Math.abs(a0 - a1) < 0.001 || Math.abs(Math.abs(a0 - a1) - 2 * Math.PI) < 0.001
  cutLevels(s.depth, s.stepdown).forEach((level, index) => {
    const z = e.z + level
    const sx = e.x + r * Math.cos(a0)
    const sy = e.y + r * Math.sin(a0)
    const ex = e.x + r * Math.cos(a1)
    const ey = e.y + r * Math.sin(a1)
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    if (index > 0) gcode += retractRapid(e.z + 5)
    gcode += above(sx, sy, e.z) + plunge(z, s)
    const code = ccw ? "G3" : "G2"
    const i = e.x - sx
    const j = e.y - sy
    const tx = full ? sx : ex
    const ty = full ? sy : ey
    const label = `${ccw ? "Counter-clockwise" : "Clockwise"} ${full ? "full circle" : "arc"}`
    gcode += `${code} X${f3(tx)} Y${f3(ty)} I${f3(i)} J${f3(j)} F${s.feedrate} ; ${label}\n`
  })
  return gcode
}

export const ellipseToolpath = (e: CadElement, s: ToolpathSettings): string => {
  const rx = e.radiusX || e.width / 2 || 25
  const ry = e.radiusY || e.height / 2 || 15
  let gcode = `; Ellipse: center (${e.x}, ${e.y}, ${e.z}), radiusX ${rx}mm, radiusY ${ry}mm\n`
  const tool = s.toolDiameter / 2
  cutLevels(s.depth, s.stepdown).forEach((level, index) => {
    const z = e.z + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    const ox = s.offset === "outside" ? rx + tool : s.offset === "inside" ? Math.max(0, rx - tool) : rx
    const oy = s.offset === "outside" ? ry + tool : s.offset === "inside" ? Math.max(0, ry - tool) : ry
    if (ox <= 0 || oy <= 0) {
      gcode += "; Offset dimensions too small, skipping this Z level\n"
      return
    }
    if (index > 0) gcode += retractRapid(e.z + 5)
    const points = ellipsePoints(e.x, e.y, ox, oy, 72, s)
    gcode += above(points[0]![0], points[0]![1], e.z) + plunge(z, s) + pointMoves(points, s.feedrate, "Ellipse point")
  })
  return gcode
}

export const text3dToolpath = (e: CadElement, s: ToolpathSettings): string => {
  let gcode = `; 3D Text: position (${e.x}, ${e.y}, ${e.z}), text "${e.text || ""}", height ${e.height || 10}mm, depth ${e.depth || 5}mm\n`
  const text: string = e.text || ""
  const textHeight = e.height || 10
  const textDepth = e.depth || 5
  if (!text) return "; No text content provided\n"
  gcode += "; Note: Text toolpath is approximated - for production use, convert text to paths first\n"
  for (const level of cutLevels(Math.min(s.depth, textDepth), s.stepdown)) {
    const z = e.z + level
    const right = e.x + text.length * textHeight * 0.6
    const top = e.y + textHeight
    gcode += `\n; Z Level: ${z.toFixed(3)}\n`
    gcode += above(e.x, e.y, e.z) + plunge(z, s)
    gcode += `G1 X${f3(right)} Y${f3(e.y)} F${s.feedrate} ; Bottom edge\n`
    gcode += `G1 X${f3(right)} Y${f3(top)} F${s.feedrate} ; Right edge\n`
    gcode += `G1 X${f3(e.x)} Y${f3(top)} F${s.feedrate} ; Top edge\n`
    gcode += `G1 X${f3(e.x)} Y${f3(e.y)} F${s.feedrate} ; Left edge\n`
    gcode += "; Note: For actual text engraving, each character would need to be converted to paths\n"
    gcode += "; Characters would be machined individually with appropriate tool movement\n"
  }
  gcode += "; For production text machining, please export text as SVG or DXF and import as paths\n"
  return gcode
}

/** Legacy notes for the sweep-like members a composite cannot machine yet. */
const notImplementedMember = (sub: CadElement): string => {
  switch (sub.type) {
    case "tube": return `; Tube element: ${sub.path?.length || 0} path points, radius=${sub.radius}\n; Toolpath generation for tube is not yet implemented\n`
    case "lathe": return `; Lathe element: ${sub.points?.length || 0} points, segments=${sub.segments}\n; Toolpath generation for lathe is not yet implemented\n`
    default: return `; Grid element: size=${sub.size}, divisions=${sub.divisions}, plane=${sub.plane}\n; Toolpath generation for grid is not yet implemented\n`
  }
}

export const compositeFromElement = (e: CadElement, s: ToolpathSettings, g: GeometryInput): string => {
  if (!Array.isArray(e.elements) || e.elements.length === 0) return "; No sub-elements found in composite element\n"
  let gcode = "; Composite element with sub-elements\n"
  gcode += `; Processing ${e.elements.length} sub-elements\n`
  for (const sub of e.elements) {
    if (!sub) continue
    gcode += `\n; Sub-element type: ${sub.type}\n`
    switch (sub.type) {
      case "group":
        gcode += `; Group element with ${sub.elements?.length || 0} sub-elements\n`
        gcode += Array.isArray(sub.elements) && sub.elements.length > 0 ? compositeFromElement(sub, s, g) : "; Empty group, no toolpath generated\n"
        break
      case "tube":
      case "lathe":
      case "grid":
        gcode += notImplementedMember(sub)
        break
      case "component":
        gcode += `; Component with ${sub.elements?.length || 0} elements\n`
        gcode += Array.isArray(sub.elements) && sub.elements.length > 0 ? compositeFromElement(sub, s, g) : ""
        break
      default:
        gcode += elementToolpath(sub, s, g)
    }
  }
  return gcode
}

/**
 * Contour for any element type without its own generator (legacy `generateDefaultToolpath` ->
 * `generateGenericToolpath`): a circle for round things, otherwise the rectangle of its width x height (or the
 * size / diameter it carries), down to its own depth. The legacy wrapper also repeated a program header,
 * compensation and finishing pass around this; the mill program writes those once for the whole selection.
 */
export const genericToolpath = (e: CadElement, s: ToolpathSettings): string => {
  // Legacy `extractGenericGeometry`.
  let width = e.width !== undefined ? e.width : e.size !== undefined ? e.size : 0
  let height = e.height !== undefined ? e.height : width
  let depth = e.depth !== undefined ? e.depth : e.thickness !== undefined ? e.thickness : 0
  const radius: number = e.radius !== undefined ? e.radius : e.diameter !== undefined ? e.diameter / 2 : 0
  if (radius > 0) { width = radius * 2; height = radius * 2 }
  if (width === 0 && height === 0 && depth === 0 && radius === 0) { width = 10; height = 10; depth = 10 }
  const type = String(e.type)
  const cx = e.x || 0
  const cy = e.y || 0
  const cz = e.z || 0
  // Legacy `getElementDepth`: the element's own depth, 5 mm for flat things.
  const machining = Math.min(s.depth, depth > 0 ? depth : 5)
  const levels = cutLevels(machining, s.stepdown)

  if (radius > 0 && (type === "circle" || type.includes("sphere"))) {
    const effective = s.offset === "inside" ? Math.max(0, radius - s.toolDiameter / 2) : s.offset === "outside" ? radius + s.toolDiameter / 2 : radius
    if (effective <= 0) return `; Cannot generate toolpath: radius (${radius}mm) too small for tool diameter (${s.toolDiameter}mm) with inside offset\n`
    let gcode = `; Generic circular contour: ${type} at (${cx}, ${cy}, ${cz}), radius ${radius}mm\n`
    for (const level of levels) {
      const z = cz + level
      gcode += `\n; Z Level: ${z.toFixed(3)}\n` + circleSlice({ ...e, x: cx, y: cy }, s, effective, z, "Move above start position")
    }
    return gcode
  }

  if (!width || !height) return "; Error: Invalid bounding box dimensions\n"
  const d = offsetDistance(s)
  const w = width + d * 2
  const h = height + d * 2
  if (w <= 0 || h <= 0) return `; Cannot generate toolpath: dimensions (${width}x${height}mm) too small for tool diameter (${s.toolDiameter}mm) with inside offset\n`
  let gcode = `; Generic rectangular contour: ${type} at (${cx}, ${cy}, ${cz}), size ${width}x${height}mm\n`
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  for (const level of levels) {
    const z = cz + level
    gcode += `\n; Z Level: ${z.toFixed(3)}\n` + above(x0, y0, z, "Move above start position") + plunge(z, s)
    gcode += pointMoves(rectangleCorners(x0, y0, w, h, s), s.feedrate, "Corner")
  }
  return gcode
}

/** Dispatch on the CAD element type (legacy `generateFromSelectedElements` switch). */
export const elementToolpath = (e: CadElement, s: ToolpathSettings, g: GeometryInput): string => {
  switch (e.type) {
    case "circle": return circleFromElement(e, s, g)
    case "rectangle": return rectangleFromElement(e, s)
    case "line": return lineFromElement(e, s)
    case "cube": return cubeFromElement(e, s)
    case "sphere": return sphereFromElement(e, s)
    case "cylinder": return cylinderFromElement(e, s)
    case "cone": return coneFromElement(e, s)
    case "torus": return torusFromElement(e, s)
    case "extrude": return extrudeFromElement(e, s)
    case "text": return textFromElement(e)
    case "polygon": return polygonFromElement(e, s)
    case "composite": case "group": case "component": return compositeFromElement(e, s, g)
    case "pyramid": return pyramidToolpath(e, s)
    case "hemisphere": return hemisphereToolpath(e, s)
    case "prism": return prismToolpath(e, s)
    case "ellipsoid": return ellipsoidToolpath(e, s)
    case "capsule": return capsuleToolpath(e, s)
    case "triangle": return triangleToolpath(e, s)
    case "arc": return arcToolpath(e, s)
    case "ellipse": return ellipseToolpath(e, s)
    case "text3d": return text3dToolpath(e, s)
    default:
      // Members of a container keep the legacy "not yet implemented" note; anything else gets the generic contour.
      if (e["inContainer"] === true && (e.type === "tube" || e.type === "lathe" || e.type === "grid")) return notImplementedMember(e)
      return genericToolpath(e, s)
  }
}
