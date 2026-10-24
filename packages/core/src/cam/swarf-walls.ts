/**
 * The ruled walls of an exact solid, as the rulings a flank cut needs (spec 51 F4): the cone and the cylinder faces, read from the
 * B-rep. A wall is two rims square to the axis and, when it is not all the way round, two straight rulings; anything else on its
 * boundary (a trimmed wall, a wall cut by another feature) is refused with the reason, never approximated.
 */
import { brepLocator } from "../cad/brep/classify.ts"
import { elementBrep } from "../cad/scene-step.ts"
import { curvePoint, surfaceNormal, surfacePoint } from "../cad/brep/geom.ts"
import type { Brep } from "../cad/brep/topology.ts"
import type { Vec3 } from "../cad/vec.ts"
import type { SwarfWall } from "./operations/swarf.ts"

const TAU = 2 * Math.PI
/** A gap in the boundary angles of a third of a turn or more means the wall is not all the way round. */
const MAX_GAP = Math.PI / 3

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** Ruling count so that the chord of the rail stays within `tolerance` of the wall: sagitta = rho (1 - cos(d/2)). */
const rulingCount = (span: number, rho: number, tolerance: number): number => {
  const step = rho > tolerance ? 2 * Math.acos(Math.max(0, 1 - tolerance / rho)) : Math.PI / 2
  return Math.max(2, Math.ceil(span / Math.min(step, Math.PI / 6)))
}

/** The rulings of the cone or cylinder face `face`, or why that face cannot be cut with the flank. `tolerance` bounds the chord error of the rail, mm. */
export const swarfWallOfFace = (b: Brep, face: number, tolerance = 0.005): SwarfWall | string => {
  const f = b.faces[face]
  if (f === undefined) return "the face does not exist"
  const s = f.surface
  if (s.kind !== "cone" && s.kind !== "cylinder") return `a ${s.kind} face is not ruled by straight lines this model reads (cone and cylinder walls only)`
  const frame = s.frame
  const slope = s.kind === "cone" ? Math.tan(s.semiAngle) : 0
  const samples: Array<{ readonly v: number; readonly u: number }> = []
  for (const loop of f.loops) for (const c of loop.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 16; k++) {
      const p = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16)
      const q = { x: p.x - frame.origin.x, y: p.y - frame.origin.y, z: p.z - frame.origin.z }
      const v = dot(q, frame.z)
      const rx = dot(q, frame.x), ry = dot(q, frame.y)
      if (Math.hypot(rx, ry) < 1e-6) continue // the apex of a pointed cone has no angle
      samples.push({ v, u: Math.atan2(ry, rx) })
    }
  }
  if (samples.length === 0) return "the face has no boundary"
  let vLo = Infinity, vHi = -Infinity
  for (const p of samples) { vLo = Math.min(vLo, p.v); vHi = Math.max(vHi, p.v) }
  const scale = Math.max(1, vHi - vLo)
  const vTol = 1e-6 * scale
  if (vHi - vLo < 1e-6) return "the wall has no height"
  // Angles: all the way round, or the arc that remains once the largest gap is taken out.
  const angles = samples.map((p) => (p.u + TAU) % TAU).sort((x, y) => x - y)
  let gap = angles[0]! + TAU - angles[angles.length - 1]!, gapEnd = angles[0]!
  for (let i = 1; i < angles.length; i++) if (angles[i]! - angles[i - 1]! > gap) { gap = angles[i]! - angles[i - 1]!; gapEnd = angles[i]! }
  const full = gap < MAX_GAP
  const u0 = full ? 0 : gapEnd
  const span = full ? TAU : TAU - gap
  if (!full) {
    // Only the two rims and the two straight edges bound the wall: a sample that is on neither is a trimmed or cut wall.
    const onEdge = (u: number): boolean => {
      const d = (((u - u0) % TAU) + TAU) % TAU
      return d < 1e-6 || Math.abs(d - span) < 1e-6
    }
    for (const p of samples) {
      if (Math.abs(p.v - vLo) > vTol && Math.abs(p.v - vHi) > vTol && !onEdge(p.u)) return "the wall is trimmed: its boundary is not two rims square to the axis and two straight edges"
    }
  } else {
    // All the way round: the rims, and the seam, one straight edge at a single angle.
    const between = samples.filter((p) => Math.abs(p.v - vLo) > vTol && Math.abs(p.v - vHi) > vTol)
    const seam = between[0]?.u
    for (const p of between) if (Math.abs((((p.u - seam!) % TAU) + 1.5 * TAU) % TAU - 0.5 * TAU) > 1e-6) return "the wall is trimmed: its boundary is not two rims square to the axis and one seam"
  }
  const rho = (v: number): number => s.radius + slope * v
  if (!(rho(vLo) > 1e-6 && rho(vHi) > 1e-6)) return "the wall runs to a point (its apex is on the wall)"
  const n = rulingCount(span, Math.max(rho(vLo), rho(vHi)), tolerance)
  const bottom: Vec3[] = [], top: Vec3[] = [], normal: Vec3[] = []
  const vMid = (vLo + vHi) / 2
  for (let i = 0; i <= n; i++) {
    const u = u0 + (span * i) / n
    let lo = surfacePoint(s, u, vLo), hi = surfacePoint(s, u, vHi)
    const nat = surfaceNormal(s, u, vMid)
    const out = f.reversed ? { x: -nat.x, y: -nat.y, z: -nat.z } : nat
    // The tool axis runs from the low end up: the ruling is walked towards +Z (either way when it is level).
    if (hi.z < lo.z - 1e-12) [lo, hi] = [hi, lo]
    bottom.push(lo); top.push(hi); normal.push(out)
  }
  // Convex when the outward normal points away from the axis; a concave wall limits the cutter by its radius of curvature across the ruling.
  const mid = surfacePoint(s, u0, vMid)
  const radial = { x: mid.x - frame.origin.x - frame.z.x * vMid, y: mid.y - frame.origin.y - frame.z.y * vMid, z: mid.z - frame.origin.z - frame.z.z * vMid }
  const concave = dot(normal[0]!, radial) < 0
  const cosHalf = s.kind === "cone" ? Math.cos(s.semiAngle) : 1
  return { bottom, top, normal, ...(concave ? { concaveRadius: Math.min(rho(vLo), rho(vHi)) / cosHalf } : {}) }
}

/** The walls of every cone and cylinder face of the solid that can be cut with the flank, with the reason for each that cannot. */
export const swarfWalls = (b: Brep, tolerance = 0.005): { readonly walls: ReadonlyArray<{ readonly face: number; readonly wall: SwarfWall }>; readonly refused: ReadonlyArray<{ readonly face: number; readonly reason: string }> } => {
  const walls: Array<{ face: number; wall: SwarfWall }> = []
  const refused: Array<{ face: number; reason: string }> = []
  b.faces.forEach((f, face) => {
    if (f.surface.kind !== "cone" && f.surface.kind !== "cylinder") return
    const r = swarfWallOfFace(b, face, tolerance)
    if (typeof r === "string") refused.push({ face, reason: r })
    else walls.push({ face, wall: r })
  })
  return { walls, refused }
}

/**
 * The walls nearest to the given points of the solids of a part (CAD world mm): the point names the wall, the exact solid gives its
 * rulings. A point whose nearest face is not a cone or cylinder wall that can be cut with the flank is reported with the reason.
 */
export const swarfWallsNear = (
  elements: ReadonlyArray<Readonly<Record<string, unknown>>>, points: ReadonlyArray<Vec3>, tolerance = 0.005
): { readonly walls: ReadonlyArray<SwarfWall>; readonly problems: ReadonlyArray<string> } => {
  const byId = new Map(elements.map((e) => [String(e["id"] ?? ""), e]))
  const bodies: Brep[] = []
  const problems: string[] = []
  for (const e of elements) {
    if (e["type"] === "workpiece") continue
    const placed = elementBrep(e, byId)
    if (placed.brep !== undefined) bodies.push(placed.brep)
    else problems.push(`${String(e["name"] ?? e["id"] ?? e["type"])}: no exact model (${placed.reason})`)
  }
  const walls: SwarfWall[] = []
  points.forEach((p, i) => {
    let best: { brep: Brep; face: number; distance: number } | undefined
    for (const brep of bodies) {
      const c = brepLocator(brep).closest(p)
      if (c.face !== undefined && (best === undefined || c.distance < best.distance)) best = { brep, face: c.face, distance: c.distance }
    }
    if (best === undefined) { problems.push(`point ${i + 1}: no solid with an exact model near it`); return }
    const wall = swarfWallOfFace(best.brep, best.face, tolerance)
    if (typeof wall === "string") problems.push(`point ${i + 1}: ${wall}`)
    else walls.push(wall)
  })
  return { walls, problems }
}
