/**
 * Direct editing of the holes of an exact solid (Fusion's Press Pull on a cylindrical face, SolidWorks' "Move face" on a bore):
 * the holes come from `recognizeHoles` (an import, a Boolean result and a parametric part are alike), the edit is two exact
 * Booleans on the solid itself, so every other face is untouched.
 *
 *  - **resize**: the narrowest cylinders of the hole (the drill) change diameter. The old bore is filled with a cylinder of its
 *    own radius over the segment (the wall it leaves is the wall that was there), then the new bore is cut. A larger bore is cut
 *    directly. The counterbore or countersink above stays as it is, so the new bore must be narrower than it.
 *  - **fill**: the whole hole is filled, every segment, back to the surface it was cut in.
 *
 * Refused with a reason, the solid unchanged: a drill-point bottom (the cone would have to be rebuilt for the new diameter), a
 * bore that would break into its own counterbore or past a neighbouring wall (the result is checked: valid, the volume moved by
 * exactly the analytic cylinder), and a hole made of cones only.
 */
import { add3, scale3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import type { RecognizedHole } from "./features.ts"
import { frame, type Vec3 } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeCylinder } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** How far a cutter runs past an open end of the hole, mm: the subtraction never has to decide a coplanar end face. */
const OVERRUN = 1

export type HoleEdit =
  | { readonly kind: "resize"; readonly diameter: number }
  | { readonly kind: "fill" }

export interface HoleEditResult {
  readonly brep: Brep
  /** Volume added (fill) or removed (cut) by the edit, mm³; positive for material added. */
  readonly volumeChange: number
}

const cylinderAlong = (entry: Vec3, direction: Vec3, from: number, to: number, diameter: number): Brep =>
  makeCylinder(diameter / 2, to - from, frame(add3(entry, scale3(direction, from)), direction))

/** The hole's drill segments (the narrowest cylinders), from the entry along the hole direction. */
const drillSegments = (hole: RecognizedHole): ReadonlyArray<{ readonly start: number; readonly end: number; readonly diameter: number }> => {
  const cylinders = hole.segments.filter((s) => s.kind === "cylinder")
  const narrowest = Math.min(...cylinders.map((s) => s.diameterStart))
  return cylinders.filter((s) => Math.abs(s.diameterStart - narrowest) <= 1e-6).map((s) => ({ start: s.start, end: s.end, diameter: s.diameterStart }))
}

/**
 * Edits one recognised hole of `b`. The result is checked before it is returned: a valid solid whose volume moved by the exact
 * volume of the cylinders involved (within 1e-6 relative), otherwise the reason it was refused.
 */
export const editHole = (b: Brep, hole: RecognizedHole, edit: HoleEdit): HoleEditResult | string => {
  if (hole.segments.every((s) => s.kind !== "cylinder")) return "the hole has no cylindrical wall to edit"
  if (edit.kind === "resize") {
    if (!(edit.diameter > 0) || !Number.isFinite(edit.diameter)) return "the diameter must be positive"
    if (hole.bottom === "drill-point") return "the hole ends in a drill point: its cone would have to be rebuilt for the new diameter"
    if (edit.diameter >= (hole.headDiameter ?? Infinity) - 1e-6) return `the new diameter ${edit.diameter} would break into the ${hole.form} (Ø${hole.headDiameter})`
  }
  const through = hole.bottom === "through"
  const before = massProperties(b).volume
  try {
    let solid = b
    const segments = edit.kind === "fill"
      ? hole.segments.filter((s) => s.kind === "cylinder").map((s) => ({ start: s.start, end: s.end, diameter: s.diameterStart }))
      : drillSegments(hole)
    if (edit.kind === "fill" && hole.segments.some((s) => s.kind === "cone")) return "a countersink or drill point cannot be filled by cylinders: fill the cone with its own body"
    const grow = edit.kind === "resize" && edit.diameter > Math.max(...segments.map((s) => s.diameter))
    // 1. Fill what is there (unless a larger bore will remove it anyway). A filler ends exactly where the bore ends, so it never
    //    stands proud of the solid: its caps are coplanar with the faces the hole was cut in.
    if (!grow) {
      for (const s of segments) solid = booleanBrep(solid, cylinderAlong(hole.entry, hole.direction, s.start, s.end, s.diameter), "union").brep
    }
    // 2. Cut the new bore.
    if (edit.kind === "resize") {
      for (const s of segments) {
        const last = s.end >= hole.depth - 1e-6
        const from = s.start <= 1e-6 ? -OVERRUN : s.start
        const to = last && through ? hole.depth + OVERRUN : s.end
        solid = booleanBrep(solid, cylinderAlong(hole.entry, hole.direction, from, to, edit.diameter), "subtract").brep
      }
    }
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const after = massProperties(solid).volume
    // The analytic change: the old drill volume against the new one over the same segments.
    const area = (d: number): number => Math.PI * (d / 2) ** 2
    const expected = edit.kind === "fill"
      ? segments.reduce((v, s) => v + area(s.diameter) * (s.end - s.start), 0)
      : segments.reduce((v, s) => v + (area(s.diameter) - area(edit.diameter)) * (s.end - s.start), 0)
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the cylinders account for ${expected.toFixed(6)} mm³: it broke into a neighbouring feature`
    }
    return { brep: solid, volumeChange: after - before }
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
