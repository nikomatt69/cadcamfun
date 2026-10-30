/**
 * Indexed (3+2) machining: a toolpath made on a tilted work plane, written for a machine whose rotary axes turn to that plane and
 * then hold still while three axes cut.
 *
 * A work plane is a `WorkFrame` (`setup.ts`): its z axis is the direction the tool axis must take in the part, its x and y axes lie in
 * the plane. The operation computes its moves in that frame as if it were an ordinary 3-axis job (all of `operations/` and the
 * strategies work unchanged). Here the frame is turned into rotary angles for a trunnion table, and every point is carried from the
 * work frame, through the part, to machine coordinates after the table has turned:
 *
 *   machine = R (part - pivot) + pivot,   part = workToWorld(frame, work)
 *
 * R maps the frame's z axis onto the machine's +Z, so the work plane lies horizontal in the machine: arcs stay arcs in G17, helices
 * stay helices, and a drilling cycle still runs down machine Z. Nothing needs linearising, and the tool axis, not the geometry,
 * carries the tilt.
 *
 * Table layouts (the TABLE turns, not the head; the tool is always along +Z):
 *   `table-AC`  C turns about Z (the table's own axis), A tilts about X on top of it:  R = Rx(A) Rz(C)
 *   `table-BC`  C turns about Z, B tilts about Y on top of it:                         R = Ry(B) Rz(C)
 * Each normal has two solutions (tilt one way with one C, or the other way with C + 180 degrees); the first inside the limits is
 * taken, the smaller tilt first. Positive angles follow the right-hand rule about the machine axis.
 *
 * This module writes the program in machine coordinates (the coordinates are transformed here, the post only writes them). The other way
 * to post 3+2, where the control's own tilted-plane words do the transformation (G68.2 + G53.1, CYCLE800, PLANE SPATIAL), is
 * `PostOptions.workPlanes` in `post/workplane.ts`: the toolpath then stays in the work frame and the post is given the frame.
 *
 * Not covered: a machine whose HEAD tilts (the pivot moves with the tool; needs the tool length), and simultaneous 5-axis motion
 * (`five-axis.ts`, `post/five-axis-frame.ts`).
 */
import { cross3, dot3, length3, type Vec3 } from "../cad/vec.ts"
import type { Move, Toolpath } from "./ir.ts"
import { validateWorkFrame, workToWorld, type WorkFrame } from "./setup.ts"

export type RotaryLayout = "table-AC" | "table-BC"

export interface RotaryLimits {
  /** Allowed range of the tilt axis (A or B), degrees. */
  readonly tiltMin: number
  readonly tiltMax: number
  /** Allowed range of C, degrees; the default allows any angle (it is brought into [-180, 180]). */
  readonly cMin?: number
  readonly cMax?: number
}

export interface RotaryAngles {
  /** Tilt about X (`table-AC`). */
  readonly a?: number
  /** Tilt about Y (`table-BC`). */
  readonly b?: number
  readonly c: number
}

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

const normalised = (v: Vec3): Vec3 => {
  const l = length3(v)
  if (!(l > 1e-12)) throw new RangeError("The work plane normal must not be zero")
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** Brings an angle into (-180, 180] degrees. */
const wrap = (deg: number): number => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/**
 * The rotary angles that turn the part direction `normal` to machine +Z, as the candidate solutions in order of preference
 * (smaller tilt first), each with the tilt inside `limits`. Empty when the machine cannot reach the direction.
 */
export const anglesFor = (normal: Vec3, layout: RotaryLayout, limits: RotaryLimits = { tiltMin: -120, tiltMax: 120 }): ReadonlyArray<RotaryAngles> => {
  const n = normalised(normal)
  const rho = Math.hypot(n.x, n.y)
  const out: RotaryAngles[] = []
  const inLimits = (tilt: number, c: number): boolean =>
    tilt >= limits.tiltMin - 1e-9 && tilt <= limits.tiltMax + 1e-9 &&
    c >= (limits.cMin ?? -180) - 1e-9 && c <= (limits.cMax ?? 180) + 1e-9
  if (layout === "table-AC") {
    // Rz(C) n has no x component, then Rx(A) lays it on Z: C = atan2(nx, ny), A = atan2(rho, nz).
    const c = rho < 1e-12 ? 0 : Math.atan2(n.x, n.y) * DEG
    const a = Math.atan2(rho, n.z) * DEG
    for (const [tilt, turn] of [[a, c], [-a, c + 180]] as const) {
      const cw = wrap(turn)
      if (inLimits(tilt, cw)) out.push({ a: tilt, c: cw })
    }
  } else {
    // Rz(C) n has no y component, then Ry(B) lays it on Z: C = atan2(-ny, nx), B = atan2(-rho, nz).
    const c = rho < 1e-12 ? 0 : Math.atan2(-n.y, n.x) * DEG
    const b = Math.atan2(-rho, n.z) * DEG
    for (const [tilt, turn] of [[b, c], [-b, c + 180]] as const) {
      const cw = wrap(turn)
      if (inLimits(tilt, cw)) out.push({ b: tilt, c: cw })
    }
  }
  return out.sort((p, q) => Math.abs(p.a ?? p.b ?? 0) - Math.abs(q.a ?? q.b ?? 0))
}

export type Matrix = readonly [number, number, number, number, number, number, number, number, number]

const mul = (m: Matrix, p: Vec3): Vec3 => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
  y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
  z: m[6] * p.x + m[7] * p.y + m[8] * p.z
})
const rotX = (deg: number): Matrix => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [1, 0, 0, 0, c, -s, 0, s, c] }
const rotY = (deg: number): Matrix => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [c, 0, s, 0, 1, 0, -s, 0, c] }
const rotZ = (deg: number): Matrix => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [c, -s, 0, s, c, 0, 0, 0, 1] }
const times = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
]

/** The rotation the table applies to the part for these angles. */
export const tableRotation = (angles: RotaryAngles, layout: RotaryLayout): Matrix =>
  layout === "table-AC" ? times(rotX(angles.a ?? 0), rotZ(angles.c)) : times(rotY(angles.b ?? 0), rotZ(angles.c))

/** Where a point of the part ends up in the machine after the table has turned about `pivot`. */
export const partToMachine = (point: Vec3, angles: RotaryAngles, layout: RotaryLayout, pivot: Vec3): Vec3 => {
  const r = mul(tableRotation(angles, layout), { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z })
  return { x: r.x + pivot.x, y: r.y + pivot.y, z: r.z + pivot.z }
}

/** A work frame whose z axis is `normal` and whose x axis is as close to `xHint` (default world X) as the plane allows. */
export const frameFromNormal = (origin: Vec3, normal: Vec3, xHint: Vec3 = { x: 1, y: 0, z: 0 }): WorkFrame => {
  const z = normalised(normal)
  let x = { x: xHint.x - dot3(xHint, z) * z.x, y: xHint.y - dot3(xHint, z) * z.y, z: xHint.z - dot3(xHint, z) * z.z }
  if (length3(x) < 1e-9) {
    // The hint is along the normal: any perpendicular will do.
    const other = Math.abs(z.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    x = { x: other.x - dot3(other, z) * z.x, y: other.y - dot3(other, z) * z.y, z: other.z - dot3(other, z) * z.z }
  }
  x = normalised(x)
  const y = cross3(z, x)
  return { origin, xAxis: x, yAxis: y, zAxis: z }
}

export interface IndexInput {
  /** The tilted work plane the toolpath was made in. */
  readonly frame: WorkFrame
  readonly layout: RotaryLayout
  /** The centre the table turns about, in machine coordinates. */
  readonly pivot: Vec3
  readonly limits?: RotaryLimits
}

export interface IndexedToolpath {
  readonly toolpath: Toolpath
  readonly angles: RotaryAngles
}

/**
 * The toolpath for a machine whose table has been turned to the work plane: an `Orient` move, then every move in machine
 * coordinates. Throws when the machine cannot reach the plane within its limits. The tool must be retracted when `Orient`
 * executes (operations end at the clearance plane).
 */
export const indexToolpath = (toolpath: Toolpath, input: IndexInput): IndexedToolpath => {
  const issues = validateWorkFrame(input.frame)
  if (issues.length > 0) throw new RangeError(issues[0]!.message)
  const solutions = anglesFor(input.frame.zAxis, input.layout, input.limits)
  const angles = solutions[0]
  if (angles === undefined) throw new RangeError("The machine's rotary axes cannot reach this work plane within their limits")
  const to = (p: Vec3): Vec3 => partToMachine(workToWorld(input.frame, p), angles, input.layout, input.pivot)
  let at: Vec3 | undefined
  const moves: Move[] = [
    { _tag: "Comment", text: `Indexed ${input.layout}: ${input.layout === "table-AC" ? `A${angles.a!.toFixed(3)}` : `B${angles.b!.toFixed(3)}`} C${angles.c.toFixed(3)}` },
    { _tag: "Orient", ...(angles.a !== undefined ? { a: angles.a } : {}), ...(angles.b !== undefined ? { b: angles.b } : {}), c: angles.c }
  ]
  for (const move of toolpath.moves) {
    switch (move._tag) {
      case "Rapid": at = move.to; moves.push({ _tag: "Rapid", to: to(move.to) }); break
      case "Linear": at = move.to; moves.push({ _tag: "Linear", to: to(move.to), feed: move.feed }); break
      case "Arc": {
        // The centre lies in the plane of the arc, at the start height (the arc is helical only along z).
        const start = at ?? move.to
        const centre = to({ x: move.center.x, y: move.center.y, z: start.z })
        at = move.to
        moves.push({ _tag: "Arc", to: to(move.to), center: { x: centre.x, y: centre.y }, clockwise: move.clockwise, feed: move.feed })
        break
      }
      case "Cycle": {
        const bottom = to(move.to)
        const top = to({ x: move.to.x, y: move.to.y, z: move.retractHeight })
        at = { x: move.to.x, y: move.to.y, z: move.retractHeight }
        moves.push({ ...move, to: bottom, retractHeight: top.z })
        break
      }
      case "Dwell": case "Comment": moves.push(move); break
      case "Orient": moves.push(move); break
    }
  }
  return { toolpath: { ...toolpath, moves }, angles }
}
