/**
 * The machine around a toolpath, as the phone draws it (spec 31 §5, the spec 13 §6 payload).
 *
 * The desktop sends body shapes (`box`, `cylinder-x`, `cone-x`), not meshes: the phone tessellates them, so the
 * payload stays small and the same scene fits any screen. CAD never comes from here. Everything is in display
 * coordinates, which the sidecar already produced — this module only builds triangles, colours and outlines.
 *
 * A body that `spins` (lathe bar, chuck, jaws) goes into a separate buffer: the Metal module rotates it about the
 * display x axis, so the phone needs no live turned profile. Bodies marked `assumed` are translucent (the desktop's
 * 0.45) and drawn after the opaque ones; `wire` bodies (mill stock outline, printer build volume) are edges only.
 */
import type { PreviewBody, PreviewBodyShape, PreviewCutter, PreviewMachine, PreviewToolGlyph } from "@cadcamfun/api"
import { PREVIEW_MESSAGE } from "./preview-scene"

type Rgb = readonly [number, number, number]
export type MachinePoint = readonly [number, number, number]

/** Interleaved solid vertex: xyz, normal xyz, rgba. Keep in step with `PreviewUpload.swift` and the Metal shader. */
export const SOLID_VERTEX_FLOATS = 10

/** Triangles a machine scene may upload. A real scene is a few thousand; this only catches a corrupt payload. */
export const PREVIEW_MAX_SOLID_TRIANGLES = 20_000

/** The desktop's opacity for a workholding it had to assume (`machine-scene.ts`). */
export const ASSUMED_BODY_ALPHA = 0.45

/** Debug palette of `apps/desktop/src/viewport/view3d/machine-scene.ts`. */
export const BODY_COLOR: Readonly<Record<PreviewBody["role"], Rgb>> = {
  stock: [0.78, 0.66, 0.47],
  jaw: [0.55, 0.59, 0.65],
  parallel: [0.39, 0.45, 0.55],
  "vise-base": [0.2, 0.25, 0.32],
  clamp: [0.71, 0.33, 0.04],
  table: [0.12, 0.16, 0.22],
  chuck: [0.28, 0.33, 0.4],
  collet: [0.39, 0.45, 0.55],
  tailstock: [0.58, 0.64, 0.7],
  bed: [0.07, 0.09, 0.15],
  "build-volume": [0.28, 0.33, 0.4],
}

export const MACHINE_LABELS: Readonly<Record<PreviewMachine["kind"], string>> = {
  mill: "Mill",
  lathe: "Lathe",
  "3dprinter": "3D printer",
}

/** The desktop's cutting-part colours (`viewport/view3d/tool-object.ts`): amber mill and lathe, a brass nozzle. */
export const TOOL_GLYPH_COLOR: Readonly<Record<PreviewToolGlyph["family"], Rgb>> = {
  mill: [0.96, 0.62, 0.04],
  lathe: [0.98, 0.75, 0.14],
  nozzle: [0.83, 0.63, 0.09],
}

export const MACHINE_SOURCE_LABELS: Readonly<Record<PreviewMachine["source"], string>> = {
  override: "chosen in the preview",
  kernel: "kernel program",
  generator: "generator output",
  inferred: "from the G-code",
  settings: "generator setting",
}

export interface MachineWire {
  readonly from: MachinePoint
  readonly to: MachinePoint
  readonly color: Rgb
}

export interface SolidUpload {
  /** Interleaved `SOLID_VERTEX_FLOATS` vertices, or empty. */
  readonly vertices: Float32Array
  /** Opaque triangles first, translucent triangles after. */
  readonly indices: Uint32Array
  readonly opaqueTriangles: number
}

export interface MachineSolids {
  readonly solids: SolidUpload
  /** Bodies that turn with the spindle; the native module rotates them. */
  readonly spindle: SolidUpload
  readonly wire: ReadonlyArray<MachineWire>
}

interface Sink {
  readonly vertices: number[]
  readonly opaque: number[]
  readonly translucent: number[]
}

const emptyUpload = (): SolidUpload => ({ vertices: new Float32Array(), indices: new Uint32Array(), opaqueTriangles: 0 })

const flush = (sink: Sink): SolidUpload => {
  const indices = new Uint32Array(sink.opaque.length + sink.translucent.length)
  indices.set(sink.opaque, 0)
  indices.set(sink.translucent, sink.opaque.length)
  return { vertices: Float32Array.from(sink.vertices), indices, opaqueTriangles: sink.opaque.length / 3 }
}

const rotateX = (x: number, y: number, z: number, angle: number): MachinePoint => {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return [x, y * cos - z * sin, y * sin + z * cos]
}

const rotateNormal = (x: number, y: number, z: number, angle: number): MachinePoint => {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return [x, y * cos - z * sin, y * sin + z * cos]
}

const vertex = (sink: Sink, point: MachinePoint, normal: MachinePoint, color: Rgb, alpha: number, opaque: boolean): number => {
  const index = sink.vertices.length / SOLID_VERTEX_FLOATS
  sink.vertices.push(point[0], point[1], point[2], normal[0], normal[1], normal[2], color[0], color[1], color[2], alpha)
  return index
}

const triangle = (sink: Sink, a: number, b: number, c: number, opaque: boolean): void => {
  const target = opaque ? sink.opaque : sink.translucent
  target.push(a, b, c)
}

/** A planar quad with one normal, wound counter-clockwise seen from the normal side. */
const quad = (sink: Sink, points: ReadonlyArray<MachinePoint>, normal: MachinePoint, color: Rgb, alpha: number, opaque: boolean): void => {
  const indices = points.map((point) => vertex(sink, point, normal, color, alpha, opaque))
  triangle(sink, indices[0]!, indices[1]!, indices[2]!, opaque)
  triangle(sink, indices[0]!, indices[2]!, indices[3]!, opaque)
}

const box = (sink: Sink, shape: Extract<PreviewBodyShape, { type: "box" }>, color: Rgb, alpha: number, opaque: boolean, angle: number): void => {
  const { min, max } = shape
  const p = (x: number, y: number, z: number): MachinePoint => rotateX(x, y, z, angle)
  const faces: ReadonlyArray<readonly [MachinePoint, ReadonlyArray<MachinePoint>]> = [
    [[1, 0, 0], [p(max.x, min.y, min.z), p(max.x, max.y, min.z), p(max.x, max.y, max.z), p(max.x, min.y, max.z)]],
    [[-1, 0, 0], [p(min.x, max.y, min.z), p(min.x, min.y, min.z), p(min.x, min.y, max.z), p(min.x, max.y, max.z)]],
    [[0, 1, 0], [p(max.x, max.y, min.z), p(min.x, max.y, min.z), p(min.x, max.y, max.z), p(max.x, max.y, max.z)]],
    [[0, -1, 0], [p(min.x, min.y, min.z), p(max.x, min.y, min.z), p(max.x, min.y, max.z), p(min.x, min.y, max.z)]],
    [[0, 0, 1], [p(min.x, max.y, max.z), p(max.x, max.y, max.z), p(max.x, min.y, max.z), p(min.x, min.y, max.z)]],
    [[0, 0, -1], [p(max.x, max.y, min.z), p(min.x, max.y, min.z), p(min.x, min.y, min.z), p(max.x, min.y, min.z)]],
  ]
  for (const [normal, points] of faces) quad(sink, points, rotateNormal(normal[0], normal[1], normal[2], angle), color, alpha, opaque)
}

/** Enough facets to read as a round bar on a phone, few enough for a 20 000-triangle cap. */
const radialSegments = (radius: number): number => Math.max(16, Math.min(64, Math.ceil(radius * 2)))

const radial = (angle: number): MachinePoint => [0, Math.cos(angle), Math.sin(angle)]

const cylinder = (sink: Sink, shape: Extract<PreviewBodyShape, { type: "cylinder-x" }>, color: Rgb, alpha: number, opaque: boolean): void => {
  const segments = radialSegments(shape.radius)
  const outer = shape.radius, inner = Math.max(0, Math.min(shape.inner, outer))
  const step = (2 * Math.PI) / segments
  const outerWall = (i: number, sign: 1 | -1, at: number): number =>
    vertex(sink, [at, Math.cos(i * step) * outer, Math.sin(i * step) * outer], radial(i * step), color, alpha, opaque)
  const innerWall = (i: number, sign: 1 | -1, at: number): number => {
    const n = radial(i * step)
    return vertex(sink, [at, Math.cos(i * step) * inner, Math.sin(i * step) * inner], [-n[0], -n[1], -n[2]], color, alpha, opaque)
  }
  for (let i = 0; i < segments; i++) {
    const a0 = outerWall(i, 1, shape.x0), b0 = outerWall(i, 1, shape.x1)
    const a1 = outerWall(i + 1, 1, shape.x0), b1 = outerWall(i + 1, 1, shape.x1)
    // Wound outward: x0/a0 -> x1/b1 -> x1/b0.
    triangle(sink, a0, b1, b0, opaque)
    triangle(sink, a0, a1, b1, opaque)
    if (inner > 0) {
      const ia0 = innerWall(i, -1, shape.x0), ib0 = innerWall(i, -1, shape.x1)
      const ia1 = innerWall(i + 1, -1, shape.x0), ib1 = innerWall(i + 1, -1, shape.x1)
      // Inner wall faces the axis: reverse winding.
      triangle(sink, ia0, ib0, ib1, opaque)
      triangle(sink, ia0, ib1, ia1, opaque)
    }
  }
  // End rings: +x at x1, -x at x0. A fan when the bore is closed.
  for (const [at, normal] of [[shape.x1, [1, 0, 0] as const], [shape.x0, [-1, 0, 0] as const]] as const) {
    for (let i = 0; i < segments; i++) {
      const o0 = vertex(sink, [at, Math.cos(i * step) * outer, Math.sin(i * step) * outer], normal, color, alpha, opaque)
      const o1 = vertex(sink, [at, Math.cos((i + 1) * step) * outer, Math.sin((i + 1) * step) * outer], normal, color, alpha, opaque)
      if (inner > 0) {
        const i0 = vertex(sink, [at, Math.cos(i * step) * inner, Math.sin(i * step) * inner], normal, color, alpha, opaque)
        const i1 = vertex(sink, [at, Math.cos((i + 1) * step) * inner, Math.sin((i + 1) * step) * inner], normal, color, alpha, opaque)
        if (normal[0] > 0) {
          triangle(sink, o0, o1, i1, opaque)
          triangle(sink, o0, i1, i0, opaque)
        } else {
          triangle(sink, o0, i1, o1, opaque)
          triangle(sink, o0, i0, i1, opaque)
        }
      } else {
        const centre = vertex(sink, [at, 0, 0], normal, color, alpha, opaque)
        if (normal[0] > 0) triangle(sink, centre, o0, o1, opaque)
        else triangle(sink, centre, o1, o0, opaque)
      }
    }
  }
}

const cone = (sink: Sink, shape: Extract<PreviewBodyShape, { type: "cone-x" }>, color: Rgb, alpha: number, opaque: boolean): void => {
  const segments = radialSegments(Math.max(shape.r0, shape.r1))
  const step = (2 * Math.PI) / segments
  const dx = shape.x1 - shape.x0, dr = shape.r1 - shape.r0
  const length = Math.hypot(dx, dr) || 1
  const normalAt = (i: number): MachinePoint => {
    const radialPart = radial(i * step)
    return [(-dr / length), (dx / length) * radialPart[1], (dx / length) * radialPart[2]]
  }
  const ring = (i: number, x: number, radius: number): number =>
    vertex(sink, [x, Math.cos(i * step) * radius, Math.sin(i * step) * radius], normalAt(i), color, alpha, opaque)
  for (let i = 0; i < segments; i++) {
    const a0 = ring(i, shape.x0, shape.r0), b0 = ring(i, shape.x1, shape.r1)
    const a1 = ring(i + 1, shape.x0, shape.r0), b1 = ring(i + 1, shape.x1, shape.r1)
    triangle(sink, a0, a1, b1, opaque)
    triangle(sink, a0, b1, b0, opaque)
  }
  for (const [x, radius, normal] of [[shape.x1, shape.r1, [1, 0, 0] as const], [shape.x0, shape.r0, [-1, 0, 0] as const]] as const) {
    if (!(radius > 1e-9)) continue
    const centre = vertex(sink, [x, 0, 0], normal, color, alpha, opaque)
    for (let i = 0; i < segments; i++) {
      const p0 = vertex(sink, [x, Math.cos(i * step) * radius, Math.sin(i * step) * radius], normal, color, alpha, opaque)
      const p1 = vertex(sink, [x, Math.cos((i + 1) * step) * radius, Math.sin((i + 1) * step) * radius], normal, color, alpha, opaque)
      if (normal[0] > 0) triangle(sink, centre, p0, p1, opaque)
      else triangle(sink, centre, p1, p0, opaque)
    }
  }
}

const appendShape = (sink: Sink, shape: PreviewBodyShape, color: Rgb, alpha: number, opaque: boolean, angle = 0): void => {
  if (shape.type === "box") box(sink, shape, color, alpha, opaque, angle)
  else if (shape.type === "cylinder-x") cylinder(sink, shape, color, alpha, opaque)
  else cone(sink, shape, color, alpha, opaque)
}

const edge = (from: MachinePoint, to: MachinePoint, color: Rgb): MachineWire => ({ from, to, color })

/** Outline of a body: the twelve box edges, or the rings and a few rulings of a round body. */
export const bodyEdges = (body: PreviewBody): MachineWire[] => {
  const color = BODY_COLOR[body.role] ?? ([0.58, 0.64, 0.7] as const)
  const angle = body.rotateX ?? 0
  const rotate = (point: MachinePoint): MachinePoint => rotateX(point[0], point[1], point[2], angle)
  const shape = body.shape
  if (shape.type === "box") {
    const { min, max } = shape
    const corner = (x: boolean, y: boolean, z: boolean): MachinePoint => rotate([x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z])
    const corners = [
      corner(false, false, false), corner(true, false, false), corner(true, true, false), corner(false, true, false),
      corner(false, false, true), corner(true, false, true), corner(true, true, true), corner(false, true, true),
    ]
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const
    return pairs.map(([a, b]) => edge(corners[a]!, corners[b]!, color))
  }
  const segments = radialSegments(shape.type === "cylinder-x" ? shape.radius : Math.max(shape.r0, shape.r1))
  const step = (2 * Math.PI) / segments
  const out: MachineWire[] = []
  const ringAt = (x: number, radius: number): MachinePoint[] =>
    Array.from({ length: segments }, (_, i) => rotate([x, Math.cos(i * step) * radius, Math.sin(i * step) * radius]))
  if (shape.type === "cylinder-x") {
    for (const [x, radius] of [[shape.x0, shape.radius], [shape.x1, shape.radius], ...(shape.inner > 0 ? [[shape.x0, shape.inner], [shape.x1, shape.inner]] as const : [])] as const) {
      const points = ringAt(x, radius)
      for (let i = 0; i < segments; i++) out.push(edge(points[i]!, points[(i + 1) % segments]!, color))
    }
    for (const i of [0, Math.floor(segments / 4), Math.floor(segments / 2), Math.floor((3 * segments) / 4)]) {
      out.push(edge(ringAt(shape.x0, shape.radius)[i]!, ringAt(shape.x1, shape.radius)[i]!, color))
    }
    return out
  }
  for (const [x, radius] of [[shape.x0, shape.r0], [shape.x1, shape.r1]] as const) {
    if (!(radius > 1e-9)) continue
    const points = ringAt(x, radius)
    for (let i = 0; i < segments; i++) out.push(edge(points[i]!, points[(i + 1) % segments]!, color))
  }
  for (const i of [0, Math.floor(segments / 4), Math.floor(segments / 2), Math.floor((3 * segments) / 4)]) {
    out.push(edge(ringAt(shape.x0, shape.r0)[i]!, ringAt(shape.x1, shape.r1)[i]!, color))
  }
  return out
}

/**
 * The machine payload as GPU buffers: opaque solids, translucent (assumed) solids after them, the spindle's own
 * buffers, and the wire outlines. Empty arrays mean "no machine scene", never a fault.
 */
export const prepareMachineSolids = (machine: PreviewMachine | undefined): MachineSolids => {
  if (machine === undefined) return { solids: emptyUpload(), spindle: emptyUpload(), wire: [] }
  const solids: Sink = { vertices: [], opaque: [], translucent: [] }
  const spindle: Sink = { vertices: [], opaque: [], translucent: [] }
  const wire: MachineWire[] = []
  for (const body of machine.bodies) {
    if (body.wire) {
      wire.push(...bodyEdges(body))
      continue
    }
    const sink = body.spins ? spindle : solids
    const alpha = body.assumed ? ASSUMED_BODY_ALPHA : 1
    appendShape(sink, body.shape, BODY_COLOR[body.role] ?? [0.58, 0.64, 0.7], alpha, !body.assumed, body.rotateX)
  }
  if ((solids.opaque.length + solids.translucent.length) / 3 > PREVIEW_MAX_SOLID_TRIANGLES) throw new Error(PREVIEW_MESSAGE.machineTooLarge)
  if ((spindle.opaque.length + spindle.translucent.length) / 3 > PREVIEW_MAX_SOLID_TRIANGLES) throw new Error(PREVIEW_MESSAGE.machineTooLarge)
  return { solids: flush(solids), spindle: flush(spindle), wire }
}

/** A cylinder along the display z (the tool's axis on a mill), from `from` to `to`. */
const verticalCylinder = (
  sink: Sink,
  x: number,
  y: number,
  from: number,
  to: number,
  radius: number,
  color: Rgb,
): void => {
  const segments = radialSegments(radius)
  const step = (2 * Math.PI) / segments
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI
    const a1 = ((i + 1) / segments) * 2 * Math.PI
    const n0: MachinePoint = [Math.cos(a0), Math.sin(a0), 0]
    const n1: MachinePoint = [Math.cos(a1), Math.sin(a1), 0]
    const b0 = vertex(sink, [x + n0[0] * radius, y + n0[1] * radius, from], n0, color, 1, true)
    const t0 = vertex(sink, [x + n0[0] * radius, y + n0[1] * radius, to], n0, color, 1, true)
    const b1 = vertex(sink, [x + n1[0] * radius, y + n1[1] * radius, from], n1, color, 1, true)
    const t1 = vertex(sink, [x + n1[0] * radius, y + n1[1] * radius, to], n1, color, 1, true)
    triangle(sink, b0, t0, t1, true)
    triangle(sink, b0, t1, b1, true)
  }
}

/** A cone along the display z, from radius `r0` at `from` to radius `r1` at `to`. */
const verticalCone = (
  sink: Sink,
  x: number,
  y: number,
  from: number,
  to: number,
  r0: number,
  r1: number,
  color: Rgb,
): void => {
  const segments = radialSegments(Math.max(r0, r1))
  const step = (2 * Math.PI) / segments
  const length = Math.hypot(to - from, r1 - r0) || 1
  const slope = (r1 - r0) / length
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI
    const a1 = ((i + 1) / segments) * 2 * Math.PI
    const normalAt = (angle: number): MachinePoint => {
      const radial = Math.cos(angle) * -slope
      return [radial, Math.sin(angle) * -slope, (r1 - r0) / length]
    }
    const n0 = normalAt(a0)
    const n1 = normalAt(a1)
    const b0 = vertex(sink, [x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, from], n0, color, 1, true)
    const t0 = vertex(sink, [x + Math.cos(a0) * r1, y + Math.sin(a0) * r1, to], n0, color, 1, true)
    const b1 = vertex(sink, [x + Math.cos(a1) * r0, y + Math.sin(a1) * r0, from], n1, color, 1, true)
    const t1 = vertex(sink, [x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, to], n1, color, 1, true)
    triangle(sink, b0, t0, t1, true)
    triangle(sink, b0, t1, b1, true)
  }
}

/** A flat disc at `z`, facing `normal`. */
const disc = (sink: Sink, x: number, y: number, z: number, radius: number, normal: MachinePoint, color: Rgb): void => {
  const segments = radialSegments(radius)
  const centre = vertex(sink, [x, y, z], normal, color, 1, true)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI
    const a1 = ((i + 1) / segments) * 2 * Math.PI
    const p0 = vertex(sink, [x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, z], normal, color, 1, true)
    const p1 = vertex(sink, [x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, z], normal, color, 1, true)
    if (normal[2] >= 0) triangle(sink, centre, p0, p1, true)
    else triangle(sink, centre, p1, p0, true)
  }
}

/**
 * The cutter at the playhead, as a solid: the real tool of the running operation, not a marker.
 *
 * The tool's axis is the display z (up) on a mill: the cutting part stands on the tip, the shank follows, and the
 * holder caps it. The desktop put the tip there, so the phone never places the tool itself. A ball nose is drawn as
 * a cone (the nose radius), a flat cutter as a flat face.
 */
export const prepareCutterSolid = (cutter: PreviewCutter, tip: MachinePoint, color: Rgb = TOOL_GLYPH_COLOR.mill): SolidUpload => {
  const sink: Sink = { vertices: [], opaque: [], translucent: [] }
  const radius = Math.max(cutter.diameter, 0.01) / 2
  const flute = Math.max(cutter.fluteLength, 0.05)
  const nose = Math.min(Math.max(cutter.noseRadius, 0), flute)
  const z = tip[2]
  if (nose > 0) {
    verticalCone(sink, tip[0], tip[1], z, z + nose, 0, radius, color)
    verticalCylinder(sink, tip[0], tip[1], z + nose, z + flute, radius, color)
  } else {
    verticalCylinder(sink, tip[0], tip[1], z, z + flute, radius, color)
    disc(sink, tip[0], tip[1], z, radius, [0, 0, -1], color)
  }
  // The shank, up to the holder's face.
  const shankRadius = Math.max(cutter.shankDiameter, cutter.diameter, 0.01) / 2
  const face = z + Math.max(cutter.stickout, flute)
  if (face > z + flute) verticalCylinder(sink, tip[0], tip[1], z + flute, face, shankRadius, color)
  // The holder, capped at the top.
  const holderRadius = Math.max(cutter.holder.diameter, 0.01) / 2
  const holderLength = Math.max(cutter.holder.length, 0.05)
  verticalCylinder(sink, tip[0], tip[1], face, face + holderLength, holderRadius, color)
  disc(sink, tip[0], tip[1], face + holderLength, holderRadius, [0, 0, 1], color)
  return flush(sink)
}

/**
 * The lathe insert or printer nozzle drawn beside the playhead, in display coordinates. Fits
 * `MACHINE_GLYPH_MAX_VERTICES` in `preview-scene.ts` (the nozzle is the largest: 21 lines), which the
 * active-line upload cap counts in.
 */export const toolGlyphLines = (
  tip: MachinePoint,
  glyph: PreviewToolGlyph,
  length: number,
  color: Rgb,
): Array<{ readonly from: MachinePoint; readonly to: MachinePoint; readonly color: Rgb }> => {
  const out: Array<{ readonly from: MachinePoint; readonly to: MachinePoint; readonly color: Rgb }> = []
  const line = (from: MachinePoint, to: MachinePoint) => out.push({ from, to, color })
  if (glyph.family === "lathe") {
    const side = glyph.turret === "front" ? -1 : 1
    const along = Math.max(length * 0.45, 4)
    const width = Math.max(glyph.width > 0 ? glyph.width : Math.max(length * 0.28, 3), 1)
    const a: MachinePoint = [tip[0] - width / 2, 0, tip[2] + side * along]
    const b: MachinePoint = [tip[0] + width / 2, 0, tip[2] + side * along]
    line(tip, a)
    line(a, b)
    line(b, tip)
    // A shallow thickness so the insert reads as a solid from an angled orbit.
    const thick = Math.max(width * 0.25, 0.8)
    for (const y of [-thick, thick]) {
      const at: MachinePoint = [a[0], y + tip[1], a[2]]
      const bt: MachinePoint = [b[0], y + tip[1], b[2]]
      line(at, bt)
      line(at, tip)
      line(bt, tip)
    }
    return out
  }
  if (glyph.family === "nozzle") {
    const radius = Math.max(glyph.diameter > 0 ? glyph.diameter / 2 : length * 0.12, 0.5)
    const top: MachinePoint = [tip[0], tip[1], tip[2] + Math.max(length, 3)]
    const segments = 16
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2, b = ((i + 1) / segments) * Math.PI * 2
      const p0: MachinePoint = [tip[0] + Math.cos(a) * radius, tip[1] + Math.sin(a) * radius, top[2]]
      const p1: MachinePoint = [tip[0] + Math.cos(b) * radius, tip[1] + Math.sin(b) * radius, top[2]]
      line(p0, p1)
      if (i % 4 === 0) line(p0, tip)
    }
    line(top, [top[0], top[1], top[2] + radius * 0.6])
    return out
  }
  return out
}
