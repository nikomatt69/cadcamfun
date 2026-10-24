/**
 * The push/pull of a cylindrical wall on the exact model (spec 40 U2): moving the side of a boss or the wall of a hole along its
 * normal is a change of radius, which is what the boss and hole edits do exactly. A positive distance goes out of the solid: a boss
 * grows by it, a hole shrinks by it (the material comes into the bore). The side of a conical boss is the same change on its frustum (`cone-edit.ts`). Any other curved face (a fillet band, a torus that is not the whole solid, NURBS, a countersink); the dome that ends a round pin and the socket that ends a bore are `dome-edit.ts`; a ball and a ring alone are the same surface with the radius moved and the
 * counterbore wall of a hole have no exact push/pull here and are refused with the reason.
 */
import { recognizeBosses, resizeBoss } from "./boss-edit.ts"
import { recognizeHoles } from "./features.ts"
import { pushPullCone } from "./cone-edit.ts"
import { pushPullChain } from "./chain-edit.ts"
import { pushPullDome } from "./dome-edit.ts"
import { editHole } from "./hole-edit.ts"
import { makeSphere, makeTorus } from "./primitives.ts"
import type { Brep } from "./topology.ts"

/** The solid with the wall `face` moved by `distance` (out of the solid when positive), or why it cannot be. */
export const pushPullCylinder = (b: Brep, face: number, distance: number): Brep | string => {
  const f = b.faces[face]
  if (f === undefined) return "the pushed face could not be found on the exact model"
  if (f.surface.kind === "cone") return pushPullCone(b, face, distance)
  if (f.surface.kind === "sphere" && b.faces.length > 1) return pushPullDome(b, face, distance)
  // A ball and a ring are one face each: their offset is the same surface with the radius moved by the distance.
  if (b.faces.length === 1 && !f.reversed) {
    const s = f.surface
    if (s.kind === "sphere") return s.radius + distance > 1e-6 ? makeSphere(s.radius + distance, s.frame) : `pushing the sphere in by ${-distance} mm leaves nothing (its radius is ${s.radius})`
    if (s.kind === "torus") {
      return s.minor + distance > 1e-6 && s.minor + distance < s.major - 1e-6 ? makeTorus(s.major, s.minor + distance, s.frame)
        : `the tube of the ring would be ${(s.minor + distance).toFixed(3)} mm (it must stay between 0 and the major radius ${s.major})`
    }
  }
  if (f.surface.kind !== "cylinder") return `a push/pull of a ${f.surface.kind} face has no exact model yet (only the wall of a hole or the side of a boss)`
  const boss = recognizeBosses(b).find((x) => x.face === face)
  if (boss !== undefined) {
    const diameter = boss.diameter + 2 * distance
    if (!(diameter > 0)) return `pulling the boss in by ${-distance} mm would leave no boss (its diameter is ${boss.diameter})`
    const r = resizeBoss(b, boss, diameter)
    return typeof r === "string" ? r : r.brep
  }
  const hole = recognizeHoles(b).find((h) => h.segments.some((s) => s.faces.includes(face)))
  if (hole !== undefined) {
    const drill = hole.segments.find((s) => s.kind === "cylinder" && s.faces.includes(face) && Math.abs(s.diameterStart - hole.diameter) <= 1e-6)
    if (drill === undefined) return "only the drill of a hole can be pushed or pulled (this is its counterbore or countersink)"
    const diameter = hole.diameter - 2 * distance
    if (!(diameter > 0)) return `pushing the hole wall in by ${distance} mm would fill the hole (its diameter is ${hole.diameter})`
    const r = editHole(b, hole, { kind: "resize", diameter })
    return typeof r === "string" ? r : r.brep
  }
  // Neither a hole nor a boss: a rounded edge or a curved wall of an extrusion. The mesh rebuild offsets the whole smooth chain it belongs to.
  return pushPullChain(b, face, distance)
}
