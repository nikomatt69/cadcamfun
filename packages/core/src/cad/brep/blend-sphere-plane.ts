/** Rolling-circle construction of an isolated spherical cap's concave foot on a planar support. */
import { curvePoint, curveProject } from "./geom.ts"
import { dot3, length3, madd3, MODEL_TOL, normalize3, sub3 } from "./math.ts"
import { revolveProfile, type ProfileLoop } from "./sweep.ts"
import { compactBrep, edgeUses, mergeBreps, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"
import type { BlendCandidate } from "./blend.ts"

export const isSpherePlaneRim = (b: Brep, e: BlendCandidate): boolean =>
  e.curve === "circle" && b.faces[e.faceA]?.surface.kind === "plane" && b.faces[e.faceB]?.surface.kind === "sphere"

/**
 * The section is bounded by the plane, the exact rolling circle and the remaining sphere. Replacing this turned cap
 * avoids a tangent Boolean and keeps both contact circles exact. No arbitrary cap trim or blend junction is inferred.
 */
export const blendSpherePlaneRim = (b: Brep, e: BlendCandidate, radius: number): Brep | string => {
  const sf = b.faces[e.faceB]!, pf = b.faces[e.faceA]!, axis = e.axis
  if (sf.surface.kind !== "sphere" || pf.surface.kind !== "plane" || axis === undefined) return "the rim must join a sphere to a plane"
  if (e.convex || dot3(e.nB, sub3(e.a, sf.surface.frame.origin)) <= 0) return "this sphere/plane construction requires an outward cap with a concave foot"
  if (b.shells.length !== 1) return "a sphere/plane fillet needs an isolated cap on one support shell"
  const rimLoops = pf.loops.filter((loop) => loop.coedges.some((coedge) => coedge.edge === e.edge))
  if (rimLoops.length !== 1 || rimLoops[0]!.coedges.length !== 1) return "the planar contact must be one complete circular boundary"
  const uses = edgeUses(b)
  for (const loop of sf.loops) for (const coedge of loop.coedges) {
    if (coedge.edge !== e.edge && uses[coedge.edge]!.some((use) => use.face !== e.faceB)) return "a trimmed spherical cap needs a blend junction law"
  }
  const origin = axis.origin, normal = e.nA, centre = sf.surface.frame.origin, R = sf.surface.radius
  const h = dot3(sub3(centre, origin), normal)
  if (length3(sub3(centre, madd3(origin, normal, h))) > MODEL_TOL) return "the sphere and the rim do not share an axis"
  if (Math.abs(h) >= R - MODEL_TOL) return "the plane must cross the sphere away from a pole"
  // The rolling circle centre is r above the plane and R+r from the sphere centre.
  const d = R + radius, q2 = d * d - (radius - h) ** 2
  if (!(q2 > 0)) return "the rolling circle cannot touch both surfaces"
  const q = Math.sqrt(q2)
  if (q <= radius + MODEL_TOL) return "the fillet reaches its axis and would self-intersect"
  const contactR = (q * R) / d, contactZ = h + ((radius - h) * R) / d
  if (contactZ <= MODEL_TOL) return "the spherical contact is below the supporting plane"
  // The enlarged contact disc must stay wholly clear of every other boundary. Only analytic carriers are accepted.
  for (const loop of pf.loops) for (const coedge of loop.coedges) {
    if (coedge.edge === e.edge) continue
    const edge = b.edges[coedge.edge]!
    if (edge.curve.kind !== "line" && edge.curve.kind !== "circle") return "clearance to a non-analytic support boundary is not established"
    const t = curveProject(edge.curve, origin, edge.t0, edge.t1)
    if (length3(sub3(curvePoint(edge.curve, t), origin)) <= q + MODEL_TOL) return "the fillet reaches another boundary of the supporting face"
  }
  // A planar support below the contact plane cannot intersect the added material above it. Other raised geometry needs
  // a general surface intersection/junction check, so it must not be accepted from a bounding-box or sample heuristic.
  for (const [fi, face] of b.faces.entries()) {
    if (fi === e.faceA || fi === e.faceB) continue
    if (face.surface.kind !== "plane") return "the cap must be isolated above a planar support"
    for (const loop of face.loops) for (const coedge of loop.coedges) {
      const edge = b.edges[coedge.edge]!
      if (edge.curve.kind !== "line" || [edge.v0, edge.v1].some((v) => dot3(sub3(b.vertices[v]!.point, origin), normal) > MODEL_TOL)) return "clearance to raised or curved support geometry needs a junction check"
    }
  }
  let ballEnd = Math.atan2(h - radius, -q)
  while (ballEnd >= -Math.PI / 2) ballEnd -= 2 * Math.PI
  const section: ProfileLoop = [
    { kind: "line", a: { x: 0, y: 0 }, b: { x: q, y: 0 } },
    { kind: "arc", center: { x: q, y: radius }, radius, start: -Math.PI / 2, end: ballEnd },
    { kind: "arc", center: { x: 0, y: h }, radius: R, start: Math.atan2(contactZ - h, contactR), end: Math.PI / 2 },
    { kind: "line", a: { x: 0, y: h + R }, b: { x: 0, y: 0 } }
  ]
  const cap = revolveProfile({ loops: [section] }, 2 * Math.PI, { origin, axis: normal, radial: normalize3(sub3(e.a, origin)), name: "blend" })
  const bottom = cap.faces.findIndex((face) => face.surface.kind === "plane")
  const contact = cap.faces[bottom]?.loops[0]?.coedges[0]
  if (bottom < 0 || contact === undefined || cap.faces[bottom]!.loops.length !== 1 || cap.faces[bottom]!.loops[0]!.coedges.length !== 1) return "the turned cap has no unique planar contact"
  const merged = mergeBreps([b, cap]), offset = b.faces.length
  const sides = cap.faces.flatMap((_, i) => i === bottom ? [] : [offset + i])
  const replacement = { edge: b.edges.length + contact.edge, reversed: contact.reversed }
  const faces = merged.faces.map((face, fi) => fi === e.faceA
    ? { ...face, loops: face.loops.map((loop) => ({ coedges: loop.coedges.map((coedge) => coedge.edge === e.edge ? replacement : coedge) })) }
    : fi >= offset && face.surface.kind === "sphere" && sf.name !== undefined ? { ...face, name: sf.name } : face)
  const result = compactBrep({ ...merged, faces, shells: b.shells.map((shell) => ({ ...shell, faces: shell.faces.flatMap((fi) => fi === e.faceB ? sides : [fi]) })) })
  const report = validateBrep(result, { coarseVolume: true })
  return report.valid ? result : `the sphere/plane fillet did not form a valid shell: ${report.issues.map((issue) => issue.message).join("; ")}`
}
