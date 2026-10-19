/**
 * Lathe tools as the preview draws them (spec 31 §5.3): flat outlines in the tool plane (display x = Z, display z = radius),
 * the programmed point at the origin, extruded `thickness` across y. A lathe tool does not turn: the outline is translated
 * to the program point and mirrored for a front turret.
 *
 *   turning / facing  80 degree rhombic insert (CNMG-like) pointing at the part, on a square shank going away from the axis
 *   threading         60 degree profile insert
 *   grooving / parting a blade `width` wide along Z
 *   boring            a round bar along +Z out of the bore, the insert cutting outwards
 *   facing            the same insert turned to cut towards the axis (its edge leads in -X)
 *   knurling          two hardened wheels pressed on the bar
 * A nose radius rounds the insert's tip (the programmed point is the theoretical sharp tip).
 */
import { ISO_INSERT_ANGLE, type IsoInsertShape } from "../tool-model.ts"

export interface ToolOutline {
  readonly part: "insert" | "shank"
  /** Closed polygon, (x, z) display coordinates relative to the programmed point, rear turret. */
  readonly points: ReadonlyArray<{ readonly x: number; readonly z: number }>
  readonly thickness: number
}

const rhombus = (size: number, angleDeg: number, dirX: number, dirZ: number): Array<{ x: number; z: number }> => {
  // Tip at the origin, the long diagonal along (dirX, dirZ) pointing away from the tip.
  const len = Math.hypot(dirX, dirZ)
  const ux = dirX / len, uz = dirZ / len
  const half = (angleDeg * Math.PI) / 360
  const d = size // long diagonal
  const w = d * Math.tan(half) // short diagonal half-width at the middle
  const mx = ux * d / 2, mz = uz * d / 2
  return [{ x: 0, z: 0 }, { x: mx - uz * w / 2, z: mz + ux * w / 2 }, { x: ux * d, z: uz * d }, { x: mx + uz * w / 2, z: mz - ux * w / 2 }]
}

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

/** Rounds the corner of a closed outline at `index` with radius `r` (a fillet tangent to both edges). */
const roundCorner = (points: ReadonlyArray<{ x: number; z: number }>, index: number, r: number): Array<{ x: number; z: number }> => {
  if (r <= 1e-9) return [...points]
  const n = points.length
  const p = points[index]!, a = points[(index - 1 + n) % n]!, b = points[(index + 1) % n]!
  const ua = { x: a.x - p.x, z: a.z - p.z }, ub = { x: b.x - p.x, z: b.z - p.z }
  const la = Math.hypot(ua.x, ua.z), lb = Math.hypot(ub.x, ub.z)
  const da = { x: ua.x / la, z: ua.z / la }, db = { x: ub.x / lb, z: ub.z / lb }
  const half = Math.acos(Math.max(-1, Math.min(1, da.x * db.x + da.z * db.z))) / 2
  const t = Math.min(r / Math.tan(half), la * 0.45, lb * 0.45)
  const rr = t * Math.tan(half)
  const bis = { x: da.x + db.x, z: da.z + db.z }, lbis = Math.hypot(bis.x, bis.z)
  const c = { x: p.x + (bis.x / lbis) * (rr / Math.sin(half)), z: p.z + (bis.z / lbis) * (rr / Math.sin(half)) }
  const s0 = { x: p.x + da.x * t, z: p.z + da.z * t }, s1 = { x: p.x + db.x * t, z: p.z + db.z * t }
  const a0 = Math.atan2(s0.z - c.z, s0.x - c.x), a1 = Math.atan2(s1.z - c.z, s1.x - c.x)
  let sweep = a1 - a0
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const fillet = Array.from({ length: 9 }, (_, k) => ({ x: c.x + rr * Math.cos(a0 + (sweep * k) / 8), z: c.z + rr * Math.sin(a0 + (sweep * k) / 8) }))
  return [...points.slice(0, index), ...fillet, ...points.slice(index + 1)]
}

/**
 * The insert of an ISO shape with its tip at the origin pointing along -(dirX, dirZ): rhombi C / D / V / S with their tip
 * angle, a triangle T, a trigon W (drawn as its 80° corner), a round R insert touching at the origin.
 */
const isoInsert = (shape: IsoInsertShape, size: number, dirX: number, dirZ: number): Array<{ x: number; z: number }> => {
  if (shape === "R") {
    const len = Math.hypot(dirX, dirZ), r = size / 2
    const c = { x: (dirX / len) * r, z: (dirZ / len) * r }
    return Array.from({ length: 32 }, (_, k) => ({ x: c.x - (dirX / len) * r * Math.cos((k / 32) * 2 * Math.PI) - (dirZ / len) * r * Math.sin((k / 32) * 2 * Math.PI), z: c.z - (dirZ / len) * r * Math.cos((k / 32) * 2 * Math.PI) + (dirX / len) * r * Math.sin((k / 32) * 2 * Math.PI) }))
  }
  if (shape === "T" || shape === "W") {
    // An equilateral triangle (T), or the 80° corner of a trigon: the tip and the two far corners.
    const len = Math.hypot(dirX, dirZ), ux = dirX / len, uz = dirZ / len
    const half = ((shape === "T" ? 60 : 80) * Math.PI) / 360
    const h = size * Math.cos(half), w = size * Math.sin(half)
    return [{ x: 0, z: 0 }, { x: ux * h - uz * w, z: uz * h + ux * w }, { x: ux * h + uz * w, z: uz * h - ux * w }]
  }
  return rhombus(size, ISO_INSERT_ANGLE[shape], dirX, dirZ)
}

export const latheToolOutlines = (toolType: string, width: number, noseRadius = 0, shape?: IsoInsertShape): ReadonlyArray<ToolOutline> => {
  switch (toolType) {
    case "threading":
      return [
        { part: "insert", points: [{ x: 0, z: 0 }, { x: 4, z: 7 }, { x: -4, z: 7 }], thickness: 5 },
        { part: "shank", points: rect(-8, 7, 8, 70), thickness: 16 }
      ]
    case "grooving":
    case "parting": {
      const w = Math.max(0.5, width || 3)
      return [
        { part: "insert", points: rect(-w / 2, 0, w / 2, 25), thickness: 4 },
        { part: "shank", points: rect(-w / 2 - 6, 25, w / 2 + 6, 80), thickness: 16 }
      ]
    }
    case "boring":
      return [
        { part: "insert", points: roundCorner(isoInsert(shape ?? "D", 9, 1, -1.2), 0, noseRadius), thickness: 4 },
        { part: "shank", points: rect(4, -10, 140, -2), thickness: 10 }
      ]
    case "facing":
      return [
        { part: "insert", points: shape === "R" ? isoInsert("R", 12, 1, 0.45) : roundCorner(isoInsert(shape ?? "C", 12, 1, 0.45), 0, noseRadius), thickness: 5 },
        { part: "shank", points: rect(8, 2, 90, 22), thickness: 20 }
      ]
    case "knurling": {
      // Two wheels touching the bar at the programmed point, side by side along Z, in a fork.
      const wheel = (cx: number): Array<{ x: number; z: number }> => Array.from({ length: 24 }, (_, k) => ({ x: cx + 5 * Math.cos((k / 24) * 2 * Math.PI), z: 9 + 9 * Math.sin((k / 24) * 2 * Math.PI) }))
      return [
        { part: "insert", points: wheel(-6), thickness: 6 },
        { part: "insert", points: wheel(6), thickness: 6 },
        { part: "shank", points: rect(-14, 18, 14, 85), thickness: 20 }
      ]
    }
    default:
      return [
        { part: "insert", points: shape === "R" ? isoInsert("R", 12, 0.45, 1) : roundCorner(isoInsert(shape ?? "C", 12, 0.45, 1), 0, noseRadius), thickness: 5 },
        { part: "shank", points: rect(2, 10, 22, 90), thickness: 20 }
      ]
  }
}
