/** A probe cycle moved by a translation (`operation-model.ts` copies and patterns of probe operations). */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { WorkFrame } from "../setup.ts"
import type { ProbeCycle } from "./types.ts"

/**
 * The cycle shifted by (dx, dy, dz): every point and height moves, directions and sizes stay. Tool-setter cycles are in machine
 * coordinates (the setter does not move with the part) and a rotary calibration is tied to the axis, so both are returned as they are.
 */
export const translateCycle = (cycle: ProbeCycle, dx: number, dy: number, dz: number): ProbeCycle => {
  const p2 = (p: Vec2): Vec2 => ({ x: p.x + dx, y: p.y + dy })
  const p3 = (p: Vec3): Vec3 => ({ x: p.x + dx, y: p.y + dy, z: p.z + dz })
  const top = (t: number | undefined): { readonly top?: number } => (t === undefined ? (dz === 0 ? {} : { top: dz }) : { top: t + dz })
  switch (cycle.kind) {
    case "z-surface": return { ...cycle, at: p2(cycle.at), expectedZ: cycle.expectedZ + dz }
    case "edge": return { ...cycle, at: p3(cycle.at) }
    case "corner": return { ...cycle, corner: p2(cycle.corner), ...top(cycle.top) }
    case "web": case "pocket": return { ...cycle, centre: p2(cycle.centre), ...top(cycle.top) }
    case "rectangle": return { ...cycle, centre: p2(cycle.centre), ...top(cycle.top) }
    case "bore": case "boss": return { ...cycle, centre: p2(cycle.centre), ...top(cycle.top) }
    case "edge-angle": return { ...cycle, start: p2(cycle.start), ...top(cycle.top) }
    case "plane": return { ...cycle, points: cycle.points.map(p2), expectedZ: cycle.expectedZ + dz }
    case "sphere": return { ...cycle, centre: p3(cycle.centre) }
    case "stylus-calibrate": {
      const a = cycle.artefact
      return { ...cycle, artefact: a.kind === "ring" ? { ...a, centre: p2(a.centre), ...top(a.top) } : a.kind === "sphere" ? { ...a, centre: p3(a.centre) } : { ...a, at: p2(a.at), z: a.z + dz } }
    }
    case "tool-length": case "tool-radius": case "broken-tool": case "rotary-axis": return cycle
  }
}

/**
 * The tilted plane a five-axis probe runs in, from the rotary angles the control swivels to (radians): the frame's axes are the columns
 * of Rz(c) Ry(b) Rx(a), so its z is the tool axis after the swivel and its origin the work zero.
 */
export const workFrameOfAngles = (angles: { readonly a?: number; readonly b?: number; readonly c?: number }): WorkFrame => {
  const a = angles.a ?? 0, b = angles.b ?? 0, c = angles.c ?? 0
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  // R = Rz(c) * Ry(b) * Rx(a), columns are the frame's axes.
  const r = [
    [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
    [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
    [-sb, cb * sa, cb * ca]
  ] as const
  const col = (j: 0 | 1 | 2): Vec3 => ({ x: r[0][j], y: r[1][j], z: r[2][j] })
  return { origin: { x: 0, y: 0, z: 0 }, xAxis: col(0), yAxis: col(1), zAxis: col(2) }
}
