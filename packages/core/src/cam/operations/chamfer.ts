/**
 * 2D chamfer / deburr (Fusion "2D Chamfer", hyperMILL deburring): a cone cutter (chamfer mill, spot drill, engraver) runs
 * along the top edges of a part at the depth that gives the requested chamfer width.
 *
 * For a cone of half angle α with a flat tip of radius r_tip, a chamfer of horizontal width w needs
 *
 *   chamfer depth    a = w / tan α
 *   tip depth        d = a + t                    (t: tip offset, so the flat tip runs below the chamfer face)
 *   cone radius at the top surface   r_top = r_tip + d tan α     (must not exceed the cone's largest radius)
 *   tool centre      r_top - w away from the edge, on the side without material
 *
 * The tool enters at the tip depth from a lead point outside the chamfer reach, follows the edge loop once in climb
 * direction (clockwise around material that is inside the loop, counter-clockwise inside a hole or a pocket), returns to the
 * lead point and lifts. A cone that cannot reach the width, or a loop too small for the tool centre, is a reported failure,
 * never a silently shallower chamfer.
 */
import { Schema } from "effect"
import { offsetPolyline } from "../../cad/offset.ts"
import { signedArea } from "../../cad/shapes.ts"
import type { Vec2 } from "../../cad/vec.ts"
import type { Toolpath } from "../ir.ts"
import { NonNegative, OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Tool } from "../tool.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"

export class ChamferParams extends Schema.Class<ChamferParams>("cam/ChamferParams")(
  Schema.Struct({
    ...OperationFields,
    /** Horizontal width of the chamfer, mm. */
    width: Positive,
    /** How far the tip runs below the chamfer's bottom edge, mm. */
    tipOffset: withDefault(NonNegative, 0.2),
    /** Horizontal distance of the lead point beyond the chamfer reach, mm. */
    lead: withDefault(Positive, 1)
  }).check(heightsOrdered)
) {}

/** The cone that cuts: largest radius, flat tip radius, half of the included angle (radians). */
export interface ChamferCone {
  readonly radius: number
  readonly tipRadius: number
  readonly halfAngle: number
}

/** An edge loop at the top surface; `outside`: the material is inside the loop (an outline), `inside`: outside it (a hole). */
export interface ChamferLoop {
  readonly points: ReadonlyArray<Vec2>
  readonly side: "outside" | "inside"
}

export interface ChamferGeometry {
  readonly depth: number
  readonly tipDepth: number
  readonly topRadius: number
  /** Distance of the tool centre from the edge, away from the material. */
  readonly offset: number
  readonly fits: boolean
}

export const chamferGeometry = (cone: ChamferCone, width: number, tipOffset: number): ChamferGeometry => {
  const tan = Math.tan(cone.halfAngle)
  const depth = width / Math.max(tan, 1e-9)
  const tipDepth = depth + tipOffset
  const topRadius = cone.tipRadius + tipDepth * tan
  return { depth, tipDepth, topRadius, offset: topRadius - width, fits: topRadius <= cone.radius + 1e-9 && tan > 1e-9 }
}

const ccw = (ring: ReadonlyArray<Vec2>): Vec2[] => (signedArea(ring) >= 0 ? [...ring] : [...ring].reverse())

/** The ring grown (d > 0) or shrunk (d < 0); its largest loop, or undefined when it collapses. */
const offsetLoop = (ring: ReadonlyArray<Vec2>, d: number): Vec2[] | undefined => {
  if (Math.abs(d) < 1e-9) return ccw(ring)
  let best: Vec2[] | undefined
  for (const l of offsetPolyline(ccw(ring), d, true)) if (best === undefined || Math.abs(signedArea(l)) > Math.abs(signedArea(best))) best = l
  return best === undefined || best.length < 3 ? undefined : ccw(best)
}

const nearest = (ring: ReadonlyArray<Vec2>, p: Vec2): Vec2 => {
  let best = ring[0]!, d = Infinity
  for (const q of ring) { const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) { d = e; best = q } }
  return best
}

export interface ChamferResult {
  readonly toolpath: Toolpath
  readonly geometry: ChamferGeometry
  readonly warnings: ReadonlyArray<string>
  /** Loops that could not be chamfered (with the reason); the toolpath covers the others. */
  readonly skipped: ReadonlyArray<string>
}

/** Chamfers `loops` whose edge lies at `topZ` (work coordinates) with `cone`. */
export const generateChamfer = (params: ChamferParams, loops: ReadonlyArray<ChamferLoop>, cone: ChamferCone, tool: Tool, topZ: number): ChamferResult => {
  const geometry = chamferGeometry(cone, params.width, params.tipOffset)
  const b = new MoveBuilder()
  const warnings: string[] = []
  const skipped: string[] = []
  b.comment(`Chamfer ${params.width} mm: ${params.name}`)
  if (!geometry.fits) {
    skipped.push(`The cone reaches Ø${(2 * cone.radius).toFixed(3)}; a ${params.width} mm chamfer with a ${params.tipOffset} mm tip offset needs Ø${(2 * geometry.topRadius).toFixed(3)} at the top`)
  } else {
    const levels = levelsOf({ ...params, totalDepth: geometry.tipDepth, stepdown: geometry.tipDepth }, topZ)
    const z = topZ - geometry.tipDepth
    const lead = Math.max(params.lead, params.width + 0.5)
    loops.forEach((loop, index) => {
      const away = loop.side === "outside" ? 1 : -1
      const path = offsetLoop(loop.points, away * geometry.offset)
      if (path === undefined) { skipped.push(`Loop ${index + 1}: too small for the tool centre ${geometry.offset.toFixed(3)} mm from its edge`); return }
      // Climb: clockwise around material inside the loop (M3), counter-clockwise inside a hole.
      const ordered = loop.side === "outside" ? [...path].reverse() : path
      const start = ordered[0]!
      const leadRing = offsetLoop(loop.points, away * (geometry.offset + lead))
      const leadPoint = leadRing !== undefined ? nearest(leadRing, start) : start
      if (leadRing === undefined) warnings.push(`Loop ${index + 1}: no room for a lead; the cone plunges on the chamfer`)
      approach(b, leadPoint, levels)
      b.linear({ x: leadPoint.x, y: leadPoint.y, z }, params.plungeFeed)
      b.linear({ x: start.x, y: start.y, z }, params.feed)
      for (let k = 1; k < ordered.length; k++) b.linear({ x: ordered[k]!.x, y: ordered[k]!.y, z }, params.feed)
      b.linear({ x: start.x, y: start.y, z }, params.feed)
      b.linear({ x: leadPoint.x, y: leadPoint.y, z }, params.feed)
      liftTo(b, levels.retractZ)
    })
    finish(b, levels)
  }
  return {
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves },
    geometry, warnings, skipped
  }
}
