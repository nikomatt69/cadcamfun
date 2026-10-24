/**
 * Direct editing of the tapered bosses of an exact solid (spec 40 U2): the convex cones that go all the way round (a conical pin, a
 * drafted boss, a tapered shaft section), read from the faces. The twin of `boss-edit.ts` for a side that is not a cylinder.
 *
 * A boss is the frustum between its two end planes; every edit here is "this frustum becomes that frustum", done with the exact
 * Boolean as in a drafted boss: the old frustum (run past a free end) comes out of the solid, the new one goes in. The result is
 * checked like every edit of the kind: a valid solid whose volume moved by exactly the volume of the new frustum less the old one.
 *
 *  - **push/pull** moves the cone along its normal by `distance`: both radii change by distance / cos(semi-angle) and the taper stays;
 *  - **draft** turns the cone about its neutral circle to the draft angle against the pull (the same law as the cylinder's draft, so a
 *    cylinder drafted and a cone drafted to the same angle at the same neutral plane agree).
 *
 * A boss whose ends are not square to its axis, one that would be pointed or turned inside out, an undercut, and an edit that runs
 * into a neighbouring feature are refused with the reason, the solid unchanged.
 */
import { add3, dot3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { recognizeConeBosses, type RecognizedConeBoss } from "./boss-edit.ts"
import { brepLocator } from "./classify.ts"
import { massProperties } from "./mass.ts"
import { frame, type Vec3 } from "./math.ts"
import { makeCone } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** How far the old frustum is run past a free end, mm. */
const OVERRUN = 1
const frustumVolume = (r1: number, r2: number, length: number): number => (Math.PI * length * (r1 * r1 + r1 * r2 + r2 * r2)) / 3

/** The cone boss whose side is face `face`, or undefined. */
export const coneBossOfFace = (b: Brep, face: number): RecognizedConeBoss | undefined => recognizeConeBosses(b).find((x) => x.face === face)

/**
 * The boss with its frustum replaced by one of radius `rStart` at its start and `rEnd` at its end (both positive). Checked before it is
 * returned: valid, and the volume moved by exactly the difference of the two frusta.
 */
export const reshapeConeBoss = (b: Brep, boss: RecognizedConeBoss, rStart: number, rEnd: number): Brep | string => {
  if (!(rStart > 1e-6 && rEnd > 1e-6)) return `the edit would leave the boss pointed or inside out (radii ${rStart.toFixed(3)} and ${rEnd.toFixed(3)} mm)`
  const r0 = boss.diameter / 2, r1 = r0 + boss.slope * boss.length
  const before = massProperties(b).volume
  const at = (t: number): Vec3 => add3(boss.origin, scale3(boss.axis, t))
  try {
    // The old frustum, run past a free end along its own taper (so no cap is coplanar with the boss's own).
    const from = boss.free === "near" || boss.free === "both" ? -OVERRUN : 0
    const to = boss.free === "far" || boss.free === "both" ? boss.length + OVERRUN : boss.length
    const radiusAt = (t: number) => r0 + boss.slope * t
    if (!(radiusAt(from) > 1e-6 && radiusAt(to) > 1e-6)) return "the boss narrows to a point within a millimetre of its free end; the cutter cannot run past it"
    const old = makeCone(radiusAt(from), radiusAt(to), to - from, frame(at(from), boss.axis))
    const next = makeCone(rStart, rEnd, boss.length, frame(at(0), boss.axis))
    const without = booleanBrep(b, old, "subtract").brep
    // A solid that is nothing but the boss leaves nothing behind: the new frustum is the whole result.
    const solid = without.faces.length === 0 || massProperties(without).volume < 1e-9 ? next : booleanBrep(without, next, "union").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const after = massProperties(solid).volume
    const expected = frustumVolume(rStart, rEnd, boss.length) - frustumVolume(r0, r1, boss.length)
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the frustum accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}

/**
 * A solid that is nothing but one pointed cone and its flat base (the catalogue's cone): the offset of its side is the same cone with
 * the base radius grown by distance / cos(semi-angle) and the apex where the grown side meets the axis. The new solid is built
 * directly, so no Boolean decides anything at the apex.
 */
const pushPullPointedCone = (b: Brep, face: number, distance: number): Brep | string | undefined => {
  if (b.faces.length !== 2) return undefined
  const s = b.faces[face]!.surface, base = b.faces[1 - face]!.surface
  if (s.kind !== "cone" || base.kind !== "plane" || Math.abs(Math.abs(dot3(base.frame.z, s.frame.z)) - 1) > 1e-9) return undefined
  const tan = Math.tan(s.semiAngle)
  if (Math.abs(tan) < 1e-12) return undefined
  const baseT = dot3(sub3(base.frame.origin, s.frame.origin), s.frame.z), apexT = -s.radius / tan
  const rBase = s.radius + baseT * tan, height = Math.abs(apexT - baseT)
  if (!(rBase > 1e-6)) return undefined
  const rNew = rBase + distance * Math.sqrt(1 + tan * tan)
  if (!(rNew > 1e-6)) return `pulling the cone in by ${-distance} mm leaves nothing (its base radius is ${rBase.toFixed(3)} mm)`
  const toApex = apexT > baseT ? s.frame.z : scale3(s.frame.z, -1)
  return makeCone(rNew, 0, (height * rNew) / rBase, frame(add3(s.frame.origin, scale3(s.frame.z, baseT)), toApex))
}

/** The solid with the conical side `face` moved by `distance` along its outward normal (positive grows the boss), or why not. */
export const pushPullCone = (b: Brep, face: number, distance: number): Brep | string => {
  const pointed = pushPullPointedCone(b, face, distance)
  if (pointed !== undefined) return pointed
  const boss = coneBossOfFace(b, face)
  if (boss === undefined) return "the conical face is not the side of a boss (a countersink, a cone that is not all the way round or a pointed cone has no exact push/pull yet)"
  const radial = distance * Math.sqrt(1 + boss.slope * boss.slope)
  const r0 = boss.diameter / 2
  return reshapeConeBoss(b, boss, r0 + radial, r0 + boss.slope * boss.length + radial)
}

/** The solid with the conical side near `near` drafted to `angle` degrees against `pull` about the circle at `neutral`, or why not. */
export const draftCone = (b: Brep, d: { readonly near: Vec3; readonly pull: Vec3; readonly neutral: number; readonly angle: number }): Brep | string => {
  const found = brepLocator(b).closest(d.near)
  const boss = found.face === undefined ? undefined : coneBossOfFace(b, found.face)
  if (boss === undefined) return "the conical face is not the side of a boss (a countersink, a cone that is not all the way round or a pointed cone has no exact draft yet)"
  const along = dot3(d.pull, boss.axis)
  if (Math.abs(Math.abs(along) - 1) > 1e-6) return "a draft of a cone that is not along the pull direction has no exact model yet"
  const tan = Math.tan((d.angle * Math.PI) / 180)
  // r(h) = rN - (h - neutral) tan: along the axis, dr/dt = -along tan. The boss narrows towards its free end or it is an undercut.
  const slope = -along * tan
  const forward = boss.free === "far" ? 1 : boss.free === "near" ? -1 : (slope < 0 ? 1 : -1)
  if (slope * forward >= 0) return "this draft would widen the boss towards its free end (an undercut)"
  const r0 = boss.diameter / 2
  // The neutral circle keeps its radius: the axial position t where the height along the pull equals `neutral`.
  const tNeutral = ((d.neutral - dot3(d.pull, boss.origin)) / along)
  const rNeutral = r0 + boss.slope * tNeutral
  if (!(rNeutral > 1e-6)) return "the neutral plane cuts the boss where it has no radius (the cone is pointed there)"
  return reshapeConeBoss(b, boss, rNeutral - slope * tNeutral, rNeutral + slope * (boss.length - tNeutral))
}
