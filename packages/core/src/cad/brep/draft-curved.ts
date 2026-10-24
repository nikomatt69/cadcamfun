/**
 * The draft of a curved face on the exact model (spec 40 U2), for the faces that are drafted most: the wall of a hole and the
 * side of a boss whose axis is the pull direction. The mesh rebuild leans such a wall by moving each vertex square to the pull by
 * (its height above the neutral plane) x tan(angle), so a cylinder becomes a cone; here the same cone is built with the hole and
 * boss edits (`hole-edit.ts`, `boss-edit.ts`), checked against the exact frustum volume:
 *
 *   boss   r(h) = r0 - (h - neutral) tan(angle)    narrower where the pull points to
 *   hole   r(h) = r0 + (h - neutral) tan(angle)    wider where the pull points to (the opening, when pulled out of it)
 *
 * A draft that would widen a boss towards its free end, or a hole towards its bottom (an undercut), a wall that is not a cylinder
 * along the pull, and the counterbore wall of a hole (only its drill is drafted) are refused with the reason. The side of a conical
 * boss is drafted the same way about its neutral circle (`cone-edit.ts`).
 */
import { dot3 } from "../vec.ts"
import { draftCone } from "./cone-edit.ts"
import { resizeBoss, recognizeBosses } from "./boss-edit.ts"
import { brepLocator } from "./classify.ts"
import { recognizeHoles } from "./features.ts"
import { editHole } from "./hole-edit.ts"
import type { Vec3 } from "./math.ts"
import type { Brep } from "./topology.ts"

export interface CurvedDraft {
  /** A point on or near the face to draft. */
  readonly near: Vec3
  /** Unit pull direction. */
  readonly pull: Vec3
  /** Height of the neutral plane along the pull, mm. */
  readonly neutral: number
  /** Degrees, positive narrows a boss in the pull direction. */
  readonly angle: number
}

/** The drafted solid, or why that face cannot be drafted exactly. */
export const draftCurvedFace = (b: Brep, d: CurvedDraft): Brep | string => {
  const found = brepLocator(b).closest(d.near)
  if (found.face === undefined) return "the drafted face could not be found on the exact model"
  const fi = found.face
  const s = b.faces[fi]!.surface
  if (s.kind === "cone") return draftCone(b, d)
  if (s.kind !== "cylinder") return `a draft of a ${s.kind} face has no exact model yet (only the wall of a hole or the side of a boss along the pull)`
  if (Math.abs(Math.abs(dot3(s.frame.z, d.pull)) - 1) > 1e-6) return "a draft of a cylinder that is not along the pull direction has no exact model yet"
  const tan = Math.tan((d.angle * Math.PI) / 180)
  if (tan === 0) return b
  const height = (p: Vec3): number => dot3(d.pull, p)

  const boss = recognizeBosses(b).find((x) => x.face === fi)
  if (boss !== undefined) {
    const r0 = boss.diameter / 2, along = dot3(d.pull, boss.axis)
    // The way the cone narrows: towards the free end. A boss free at both ends or at none narrows the way the draft turns it.
    const forward = boss.free === "far" ? 1 : boss.free === "near" ? -1 : (tan * along > 0 ? 1 : -1)
    if (tan * along * forward <= 0) return "this draft would widen the boss towards its free end (an undercut)"
    const baseAt = forward > 0 ? 0 : boss.length
    const rBase = r0 - (height({ x: boss.origin.x + boss.axis.x * baseAt, y: boss.origin.y + boss.axis.y * baseAt, z: boss.origin.z + boss.axis.z * baseAt }) - d.neutral) * tan
    if (!(rBase > 0)) return "the draft makes the boss radius at its base negative"
    const r = resizeBoss(b, boss, 2 * rBase, (Math.atan(tan * along * forward) * 180) / Math.PI, forward > 0 ? "far" : "near")
    return typeof r === "string" ? r : r.brep
  }

  const hole = recognizeHoles(b).find((h) => h.segments.some((seg) => seg.faces.includes(fi)))
  if (hole !== undefined) {
    const drills = hole.segments.filter((seg) => seg.kind === "cylinder" && Math.abs(seg.diameterStart - hole.diameter) <= 1e-6)
    const seg = drills.find((x) => x.faces.includes(fi))
    if (seg === undefined) return "only the drill of a hole is drafted (this is its counterbore or countersink)"
    if (drills.length !== 1) return "a hole with several drill segments has no exact draft yet"
    const along = dot3(d.pull, hole.direction)
    // Narrower towards the bottom: the radius falls along the hole direction, d r / d t = tan(angle) (pull . direction) < 0.
    if (tan * along >= 0) return "this draft would widen the hole towards its bottom (an undercut)"
    const at = { x: hole.entry.x + hole.direction.x * seg.start, y: hole.entry.y + hole.direction.y * seg.start, z: hole.entry.z + hole.direction.z * seg.start }
    const rStart = hole.diameter / 2 + (height(at) - d.neutral) * tan
    if (!(rStart > 0)) return "the draft makes the hole radius at its opening negative"
    const r = editHole(b, hole, { kind: "resize", diameter: 2 * rStart, taper: (Math.atan(-tan * along) * 180) / Math.PI })
    return typeof r === "string" ? r : r.brep
  }
  return "the cylindrical face is neither the wall of a hole nor the side of a boss"
}
