/**
 * Controller cutter compensation for the profile (`G41` / `G42`, spec 72 P2-3): the program is the contour itself with the offset on,
 * the control keeps the tool centre a radius off it from the radius in the tool's register, so a worn tool is corrected at the machine.
 *
 * The programmed contour is the profile's own plan made with a tool of no radius (so the climb / conventional orientation, the start on a
 * straight and the allowance are the ones the tool-centre profile has). The approach is a straight line at 45 degrees ending on the
 * contour start, the exit the mirror image; both must lie on free ground, else the operation is refused with the reason.
 */
import type { Vec2 } from "../../cad/vec.ts"
import { distanceToChain, pointInRing } from "../geometry.ts"
import type { Levels } from "../params.ts"
import { followPath, approach, liftTo, type MoveBuilder } from "./common.ts"
import { pathPolyline, startTangent, type Path } from "../path.ts"

const TOL = 1e-6

export interface CompensatedLap {
  readonly path: Path
  /** The ring is cut with the tool outside it (an outside profile) or inside it. */
  readonly outside: boolean
  /** The ring turns counter-clockwise. */
  readonly ccw: boolean
  readonly radius: number
}

const leftOf = (t: Vec2): Vec2 => ({ x: -t.y, y: t.x })

/** The approach and exit of a lap: the points where the offset is switched on and off, or the reason none fits. */
export const compensatedLead = (lap: CompensatedLap): { readonly left: boolean; readonly P: Vec2; readonly Q: Vec2 } => {
  const { path, radius: r } = lap
  const S = path.start
  const t = startTangent(path)
  // The tool stands outside the ring for an outside profile, inside it for an inside one; counter-clockwise puts the outside on the right.
  const left = lap.outside !== lap.ccw
  const l = leftOf(t)
  const n = left ? l : { x: -l.x, y: -l.y }
  const ring = pathPolyline(path, 0.01)
  const free = (p: Vec2): boolean => (lap.outside ? !pointInRing(p, ring) : pointInRing(p, ring)) && distanceToChain(p, ring, true) >= r - TOL
  const along = (a: Vec2, c: Vec2): boolean => Array.from({ length: 11 }, (_, i) => ({ x: a.x + ((c.x - a.x) * i) / 10, y: a.y + ((c.y - a.y) * i) / 10 })).every(free)
  // Where the tool centre stands once the offset is applied at the contour start.
  const C = { x: S.x + r * n.x, y: S.y + r * n.y }
  for (const k of [2, 3, 4, 6]) {
    const L = k * r
    const P = { x: S.x + L * (n.x - t.x), y: S.y + L * (n.y - t.y) }
    const Q = { x: S.x + L * (n.x + t.x), y: S.y + L * (n.y + t.y) }
    if (free(P) && free(Q) && along(P, C) && along(C, Q)) return { left, P, Q }
  }
  throw new RangeError("Controller compensation: no straight approach and exit of up to six tool radii fits beside the contour start; use the tool-centre path (compensation none) or a smaller tool")
}

/** One lap per depth: plunge beside the contour, switch the offset on in the approach, cut, switch it off in the exit, lift. */
export const emitCompensatedLaps = (b: MoveBuilder, lap: CompensatedLap, levels: Levels, feed: number, plungeFeed: number): void => {
  if (lap.path.segs.length === 0) return
  const { left, P, Q } = compensatedLead(lap)
  const S = lap.path.start
  for (const z of levels.passZ) {
    approach(b, P, levels)
    b.rapid({ x: P.x, y: P.y, z: levels.entryZ })
    b.linear({ x: P.x, y: P.y, z }, plungeFeed)
    b.push({ _tag: "CutterComp", side: left ? "left" : "right" })
    b.linear({ x: S.x, y: S.y, z }, feed)
    followPath(b, lap.path, z, feed)
    b.push({ _tag: "CutterComp", side: "off" })
    b.linear({ x: Q.x, y: Q.y, z }, feed)
    liftTo(b, levels.retractZ)
  }
}
