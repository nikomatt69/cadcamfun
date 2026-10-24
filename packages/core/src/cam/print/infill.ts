/**
 * Infill patterns. A pattern is generated as raw polylines over a bounding box (lines, a grid, triangles, honeycomb cells,
 * a gyroid contour); the planner then clips them to the area to fill. Spacing follows the density: the bead length per
 * unit area times the line width is the fraction of the layer that is filled.
 */
import type { Vec2 } from "../../cad/vec.ts"
import type { Box2 } from "./geom.ts"
import type { InfillPattern } from "./profile.ts"

export type Polyline = Vec2[]

const rad = (deg: number): number => (deg * Math.PI) / 180

/** Parallel lines at `angle` (degrees) every `spacing` mm that cover the box; every other line runs backwards (serpentine). */
const parallel = (box: Box2, spacing: number, angle: number): Polyline[] => {
  // Rotated frame about the world origin: the lines of a layer line up with the lines of the next, whatever the box.
  const half = Math.max(Math.hypot(box.minX, box.minY), Math.hypot(box.minX, box.maxY), Math.hypot(box.maxX, box.minY), Math.hypot(box.maxX, box.maxY)) + spacing
  const c = Math.cos(rad(angle))
  const s = Math.sin(rad(angle))
  const out: Polyline[] = []
  const first = Math.ceil(-half / spacing - 1e-9)
  const last = Math.floor(half / spacing + 1e-9)
  let flip = false
  for (let k = first; k <= last; k++) {
    const v = k * spacing
    const a = { x: -s * v - c * half, y: c * v - s * half }
    const b = { x: -s * v + c * half, y: c * v + s * half }
    out.push(flip ? [b, a] : [a, b])
    flip = !flip
  }
  return out
}

/** Zigzag rows plus the vertical edges between them: one hexagonal cell grid of side `side`. */
const honeycomb = (box: Box2, side: number): Polyline[] => {
  const w = Math.sqrt(3) * side
  const rowStep = 1.5 * side
  const out: Polyline[] = []
  const rows = Math.ceil((box.maxY - box.minY) / rowStep) + 3
  const cols = Math.ceil((box.maxX - box.minX) / w) + 3
  const x0 = Math.floor(box.minX / w) * w - w
  const base = Math.floor(box.minY / rowStep) - 1
  for (let r = 0; r < rows; r++) {
    // Rows are anchored to the world grid, so the cells of one layer sit over those of the next.
    const index = base + r
    const cy = index * rowStep
    const shift = (index & 1) === 0 ? 0 : w / 2
    const zig: Vec2[] = []
    for (let j = 0; j <= cols; j++) {
      const cx = x0 + j * w + shift
      zig.push({ x: cx - w / 2, y: cy + side / 2 }, { x: cx, y: cy + side })
    }
    zig.push({ x: x0 + (cols + 1) * w + shift - w / 2, y: cy + side / 2 })
    out.push(zig)
    for (let j = 0; j <= cols; j++) {
      const x = x0 + j * w + shift - w / 2
      out.push([{ x, y: cy + side / 2 }, { x, y: cy - side / 2 }])
    }
  }
  return out
}

/**
 * Contour length of the gyroid per unit area and per unit of 1/period, found by marching squares over one period at several
 * heights (`gyroidCalibration`). The cross-section of the surface through a layer is a family of curves whose total length
 * grows as 1/period; this is the constant k in `length / area = k / period`.
 */
let gyroidK: number | undefined

const gyroidField = (x: number, y: number, z: number): number => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x)

/** Marching squares of `f = 0` on a grid of `nx` x `ny` cells; consecutive edge crossings are chained into polylines. */
const marching = (nx: number, ny: number, x0: number, y0: number, cell: number, f: (x: number, y: number) => number): Polyline[] => {
  const vals = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f(x0 + i * cell, y0 + j * cell)
  const v = (i: number, j: number): number => vals[j * (nx + 1) + i]!
  // Edge ids: horizontal (i,j)-(i+1,j) = 2*(j*(nx+1)+i), vertical (i,j)-(i,j+1) = 2*(j*(nx+1)+i)+1.
  const hId = (i: number, j: number): number => 2 * (j * (nx + 1) + i)
  const vId = (i: number, j: number): number => 2 * (j * (nx + 1) + i) + 1
  const point = (id: number): Vec2 => {
    const vertical = (id & 1) === 1
    const node = id >> 1
    const i = node % (nx + 1)
    const j = Math.floor(node / (nx + 1))
    const a = v(i, j)
    const b = vertical ? v(i, j + 1) : v(i + 1, j)
    const t = a / (a - b)
    return vertical ? { x: x0 + i * cell, y: y0 + (j + t) * cell } : { x: x0 + (i + t) * cell, y: y0 + j * cell }
  }
  const links = new Map<number, number[]>()
  const link = (p: number, q: number): void => {
    const a = links.get(p)
    if (a === undefined) links.set(p, [q]); else a.push(q)
    const b = links.get(q)
    if (b === undefined) links.set(q, [p]); else b.push(p)
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c0 = v(i, j), c1 = v(i + 1, j), c2 = v(i + 1, j + 1), c3 = v(i, j + 1)
      const mask = (c0 > 0 ? 1 : 0) | (c1 > 0 ? 2 : 0) | (c2 > 0 ? 4 : 0) | (c3 > 0 ? 8 : 0)
      if (mask === 0 || mask === 15) continue
      const bottom = hId(i, j), right = vId(i + 1, j), top = hId(i, j + 1), left = vId(i, j)
      switch (mask) {
        case 1: case 14: link(left, bottom); break
        case 2: case 13: link(bottom, right); break
        case 3: case 12: link(left, right); break
        case 4: case 11: link(right, top); break
        case 6: case 9: link(bottom, top); break
        case 7: case 8: link(left, top); break
        case 5: case 10: {
          const centre = (c0 + c1 + c2 + c3) / 4 > 0
          if ((mask === 5) === centre) { link(left, top); link(bottom, right) } else { link(left, bottom); link(right, top) }
          break
        }
      }
    }
  }
  const seen = new Set<number>()
  const out: Polyline[] = []
  const walk = (start: number): Polyline => {
    const ids = [start]
    seen.add(start)
    for (let dir = 0; dir < 2; dir++) {
      let prev = -1
      let cur = start
      if (dir === 1) {
        const around = links.get(start)!
        if (around.length < 2) break
        prev = around[0]!
        cur = around[1]!
        if (seen.has(cur)) break
        ids.unshift(cur)
        seen.add(cur)
        // Continue backwards from `cur`, away from `start`.
        let back = start
        for (;;) {
          const next = (links.get(cur) ?? []).find((n) => n !== back && !seen.has(n))
          if (next === undefined) break
          ids.unshift(next)
          seen.add(next)
          back = cur
          cur = next
        }
        break
      }
      for (;;) {
        const next = (links.get(cur) ?? []).find((n) => n !== prev && !seen.has(n))
        if (next === undefined) break
        ids.push(next)
        seen.add(next)
        prev = cur
        cur = next
      }
    }
    const pts = ids.map(point)
    // A closed contour: the end meets the start.
    const ends = [ids[0]!, ids[ids.length - 1]!]
    if (ids.length > 2 && (links.get(ends[0]!) ?? []).includes(ends[1]!)) pts.push(pts[0]!)
    return pts
  }
  for (const id of links.keys()) if (!seen.has(id)) out.push(walk(id))
  return out
}

const calibrateGyroid = (): number => {
  if (gyroidK !== undefined) return gyroidK
  const n = 96
  const cell = (2 * Math.PI) / n
  let length = 0
  const zs = 8
  for (let k = 0; k < zs; k++) {
    const z = ((k + 0.5) / zs) * 2 * Math.PI
    for (const line of marching(n, n, 0, 0, cell, (x, y) => gyroidField(x, y, z))) {
      for (let i = 1; i < line.length; i++) length += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y)
    }
  }
  // Mean contour length per period square (2 pi)^2, scaled to a period of 1 mm.
  gyroidK = (length / zs / ((2 * Math.PI) ** 2)) * (2 * Math.PI)
  return gyroidK
}

/** Gyroid cross-section at height `z`, period chosen so the contour fills `density` of the layer. */
const gyroid = (box: Box2, lineWidth: number, density: number, z: number): Polyline[] => {
  const target = (density * (box.maxX - box.minX) * (box.maxY - box.minY)) / lineWidth
  const contour = (period: number): Polyline[] => {
    const k = (2 * Math.PI) / period
    const cell = Math.max(period / 20, 0.15)
    const nx = Math.ceil((box.maxX - box.minX) / cell) + 2
    const ny = Math.ceil((box.maxY - box.minY) / cell) + 2
    if (nx * ny > 4_000_000) return []
    return marching(nx, ny, box.minX - cell, box.minY - cell, cell, (x, y) => gyroidField(x * k, y * k, z * k))
  }
  // length / area = c / period on average, and fraction = length * width / area  =>  period = c * width / fraction. The length
  // of one layer's cut depends on its height, so the period is corrected once from what the cut really measures.
  let period = Math.max(lineWidth * 2, (calibrateGyroid() * lineWidth) / Math.max(0.01, density))
  let lines = contour(period)
  const measured = lines.reduce((sum, line) => sum + lineLengthIn(line, box), 0)
  if (measured > 1e-6 && Math.abs(measured - target) / target > 0.03) {
    period = Math.max(lineWidth * 2, period * (measured / target))
    lines = contour(period)
  }
  return lines
}

/** Length of a polyline inside a box. */
const lineLengthIn = (line: Polyline, box: Box2): number => {
  let l = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    if (mx >= box.minX && mx <= box.maxX && my >= box.minY && my <= box.maxY) l += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return l
}

export interface PatternRequest {
  readonly pattern: Exclude<InfillPattern, "concentric">
  readonly box: Box2
  /** Bead width, mm. */
  readonly lineWidth: number
  /** Fraction of the layer to fill, 0..1. */
  readonly density: number
  readonly layer: number
  readonly z: number
}

/** The raw infill polylines over the box (to be clipped to the area to fill). */
export const infillPattern = (req: PatternRequest): Polyline[] => {
  const { box, lineWidth: w, layer } = req
  const density = Math.max(0.01, Math.min(1, req.density))
  switch (req.pattern) {
    case "lines": return parallel(box, w / density, layer % 2 === 0 ? 45 : 135)
    case "grid": return [...parallel(box, (2 * w) / density, 45), ...parallel(box, (2 * w) / density, 135)]
    case "triangles": return [0, 60, 120].flatMap((a) => parallel(box, (3 * w) / density, a))
    // Edges per area of a regular hexagon grid: bead length = 2 / (sqrt(3) * side) per mm^2.
    case "honeycomb": return honeycomb(box, (2 * w) / (Math.sqrt(3) * density))
    case "gyroid": return gyroid(box, w, density, req.z)
  }
}

/** Solid fill: lines at 45 degrees that alternate with the layer, touching bead to bead. */
export const solidLines = (box: Box2, lineWidth: number, layer: number, angle?: number): Polyline[] =>
  parallel(box, lineWidth, angle ?? (layer % 2 === 0 ? 45 : 135))

/** Lines used for bridges, supports and the raft at an explicit angle and spacing. */
export const linesAt = (box: Box2, spacing: number, angle: number): Polyline[] => parallel(box, spacing, angle)
