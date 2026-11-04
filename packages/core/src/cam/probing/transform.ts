/** A probe cycle moved by a translation (`operation-model.ts` copies and patterns of probe operations). */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
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
