/**
 * Mass properties of a B-rep from its exact geometry (SMLib's SmApiMassProperties): volume, surface area, centroid and
 * the inertia tensor (unit density), by the divergence theorem over the boundary faces.
 *
 * - Planar faces are integrated exactly: Green's theorem turns the face integral into line integrals along the exact
 *   edge curves (Gauss quadrature per curve piece, exact for lines and to machine precision for arcs and splines).
 * - Curved faces are integrated over a fine triangulation of their (u, v) domain with a degree-8 Gauss rule on the
 *   exact surface (S_u × S_v), so the only error is the trimming polygon of curved boundaries in (u, v).
 */
import { cross3, dot3, gaussLegendre, length3, toFrame, TRIANGLE_RULE, unwrapNear, type Vec3 } from "./math.ts"
import { curveDerivs, curvePoint, surfaceDerivs, surfacePeriods, surfaceProject } from "./geom.ts"
import type { Brep, Face } from "./topology.ts"
import { defaultChordTol as displayChord, faceBoundaries, tessellateBrep, type TessellateOptions } from "./tessellate.ts"

export interface MassProperties {
  readonly volume: number
  readonly area: number
  readonly centroid: Vec3
  /** Inertia tensor about the centroid, unit density, row-major [Ixx, Ixy, Ixz, Iyx, Iyy, Iyz, Izx, Izy, Izz]. */
  readonly inertia: readonly [number, number, number, number, number, number, number, number, number]
  /** Area of each face, by face index. */
  readonly faceAreas: ReadonlyArray<number>
}

/** Accumulated boundary integrals (all as flux of a vector field through the outward normal, except area). */
class Acc {
  area = 0
  vol = 0
  mx = 0; my = 0; mz = 0
  xx = 0; yy = 0; zz = 0
  xy = 0; yz = 0; zx = 0
  /** Adds w × (integrands at P with outward area vector dA = n dS, and scalar dS). */
  add(P: Vec3, nA: Vec3, dS: number, w: number): void {
    const { x, y, z } = P
    this.area += w * dS
    this.vol += (w * (x * nA.x + y * nA.y + z * nA.z)) / 3
    this.mx += (w * x * x * nA.x) / 2
    this.my += (w * y * y * nA.y) / 2
    this.mz += (w * z * z * nA.z) / 2
    this.xx += (w * x * x * x * nA.x) / 3
    this.yy += (w * y * y * y * nA.y) / 3
    this.zz += (w * z * z * z * nA.z) / 3
    this.xy += (w * x * x * y * nA.x) / 2
    this.yz += (w * y * y * z * nA.y) / 2
    this.zx += (w * z * z * x * nA.z) / 2
  }
}

/** ∫∫ over a planar face, by Green's theorem along the exact loops (natural orientation: material on the left). */
const planarFace = (b: Brep, f: Face, acc: Acc): number => {
  if (f.surface.kind !== "plane") throw new Error("planarFace on a non-plane")
  const fr = f.surface.frame
  const nNat = cross3(fr.x, fr.y)
  const n = f.reversed ? { x: -nNat.x, y: -nNat.y, z: -nNat.z } : nNat
  const sign = f.reversed ? -1 : 1
  const before = acc.area
  const gl = gaussLegendre(4)
  for (const loop of f.loops) {
    for (const c of loop.coedges) {
      const e = b.edges[c.edge]!
      const pieces = e.curve.kind === "line" ? 1 : e.curve.kind === "nurbs" ? Math.max(16, e.curve.data.points.length * 4) : Math.max(4, Math.ceil((e.t1 - e.t0) / (Math.PI / 16)))
      const G = gaussLegendre(e.curve.kind === "line" ? 4 : 16)
      for (let p = 0; p < pieces; p++) {
        const ta = e.t0 + ((e.t1 - e.t0) * p) / pieces, tb = e.t0 + ((e.t1 - e.t0) * (p + 1)) / pieces
        for (let k = 0; k < G.x.length; k++) {
          const t = (ta + tb) / 2 + ((tb - ta) / 2) * G.x[k]!
          const wt = ((tb - ta) / 2) * G.w[k]!
          const [P, D] = curveDerivs(e.curve, t)
          const l = toFrame(fr, P)
          const dl = { x: dot3(D, fr.x), y: dot3(D, fr.y) }
          // Coedge direction and face orientation: the loop runs with the material on its left in natural (a, b).
          const dir = (c.reversed ? -1 : 1) * sign
          const db = dl.y * wt * dir
          // ∫_0^a g(s, b) ds with g evaluated at P(s, b) = O + s x + b y (polynomial of degree ≤ 3 in s).
          for (let q = 0; q < gl.x.length; q++) {
            const s = (l.x / 2) * (1 + gl.x[q]!)
            const ws = (l.x / 2) * gl.w[q]!
            const Ps = { x: fr.origin.x + fr.x.x * s + fr.y.x * l.y, y: fr.origin.y + fr.x.y * s + fr.y.y * l.y, z: fr.origin.z + fr.x.z * s + fr.y.z * l.y }
            // Green: ∫∫_R g da db = ∮ (∫_0^a g ds) db, for the region to the left of the loop.
            acc.add(Ps, n, 1, ws * db)
          }
        }
      }
    }
  }
  return acc.area - before
}

/** Mass properties; `options` tune the triangulation used for curved faces (default: very fine). */
export const massProperties = (b: Brep, options: TessellateOptions = {}): MassProperties => {
  const acc = new Acc()
  const faceAreas = b.faces.map(() => 0)
  const curved = b.faces.some((f) => f.surface.kind !== "plane")
  if (curved) {
    // The rule integrates the exact surface; only the (u, v) trimming polygon of curved boundaries approximates, so
    // the default boundary sampling is 50× finer than the display tolerance.
    const opts: TessellateOptions = { angleTolDeg: 4, paramStep: 0.25, ...options, chordTol: options.chordTol ?? displayChord(b) / 50 }
    const fine = tessellateBrep(b, opts)
    // The same boundary rings the triangulation was constrained to: used to add the slivers between each chord in
    // (u, v) and the true trimming curve, so curved trims integrate to second order in the chord height.
    const bounds = faceBoundaries(b, opts)
    const G = gaussLegendre(6)
    for (const fm of fine.faces) {
      const f = b.faces[fm.face]!
      if (f.surface.kind === "plane") continue
      const sigma = f.reversed ? -1 : 1
      const before = acc.area
      const per = surfacePeriods(f.surface)
      for (const ring of bounds.rings[fm.face] ?? []) {
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]!, c = ring[(k + 1) % ring.length]!
          if (a.edge === undefined || c.inEdge !== a.edge || a.t === undefined || c.inT === undefined) continue
          const e = b.edges[a.edge]!
          const du = c.u - a.u, dv = c.v - a.v
          for (let q = 0; q < G.x.length; q++) {
            const sq = (1 + G.x[q]!) / 2, wq = G.w[q]! / 2
            const t = a.t + (c.inT - a.t) * sq
            const cu = a.u + du * sq, cv = a.v + dv * sq
            const tp = surfaceProject(f.surface, curvePoint(e.curve, t), { u: cu, v: cv })
            const tu = per.u !== undefined ? unwrapNear(tp.u, cu, per.u) : tp.u
            const tv = per.v !== undefined ? unwrapNear(tp.v, cv, per.v) : tp.v
            const ou = tu - cu, ov = tv - cv
            // Material is on the left of a → c: a true boundary to the left removes area, to the right adds it.
            const area = -(du * ov - dv * ou)
            if (area === 0) continue
            const d = surfaceDerivs(f.surface, cu + ou / 2, cv + ov / 2)
            const N = cross3(d.su, d.sv)
            acc.add(d.p, { x: N.x * sigma, y: N.y * sigma, z: N.z * sigma }, length3(N), wq * area)
          }
        }
      }
      for (let i = 0; i < fm.domain.length; i += 3) {
        const ia = fm.domain[i]!, ib = fm.domain[i + 1]!, ic = fm.domain[i + 2]!
        const ua = fm.uvs[ia * 2]!, va = fm.uvs[ia * 2 + 1]!
        const ub = fm.uvs[ib * 2]!, vb = fm.uvs[ib * 2 + 1]!
        const uc = fm.uvs[ic * 2]!, vc = fm.uvs[ic * 2 + 1]!
        const J = Math.abs((ub - ua) * (vc - va) - (vb - va) * (uc - ua)) / 2
        if (J === 0) continue
        for (const [l1, l2, l3, w] of TRIANGLE_RULE) {
          const u = l1 * ua + l2 * ub + l3 * uc, v = l1 * va + l2 * vb + l3 * vc
          const d = surfaceDerivs(f.surface, u, v)
          const N = cross3(d.su, d.sv)
          const nA = { x: N.x * sigma, y: N.y * sigma, z: N.z * sigma }
          acc.add(d.p, nA, length3(N), w * J)
        }
      }
      faceAreas[fm.face] = acc.area - before
    }
  }
  b.faces.forEach((f, fi) => {
    if (f.surface.kind === "plane") faceAreas[fi] = planarFace(b, f, acc)
  })
  const V = acc.vol
  const c = V !== 0 ? { x: acc.mx / V, y: acc.my / V, z: acc.mz / V } : { x: 0, y: 0, z: 0 }
  // Inertia about the origin, then the parallel-axis shift to the centroid.
  const Ixx = acc.yy + acc.zz - V * (c.y * c.y + c.z * c.z)
  const Iyy = acc.xx + acc.zz - V * (c.x * c.x + c.z * c.z)
  const Izz = acc.xx + acc.yy - V * (c.x * c.x + c.y * c.y)
  const Ixy = -(acc.xy - V * c.x * c.y)
  const Iyz = -(acc.yz - V * c.y * c.z)
  const Izx = -(acc.zx - V * c.z * c.x)
  return { volume: V, area: acc.area, centroid: c, inertia: [Ixx, Ixy, Izx, Ixy, Iyy, Iyz, Izx, Iyz, Izz], faceAreas }
}

/** Volume only (same accuracy as `massProperties`). */
export const brepVolume = (b: Brep, options: TessellateOptions = {}): number => massProperties(b, options).volume
