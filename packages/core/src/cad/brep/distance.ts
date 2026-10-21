/**
 * Minimum distance between two solids (clearance), exact to the closest-point tolerance of the surfaces and not to a mesh.
 *
 * Candidates come from a tessellation of each solid (its vertices and edge samples); for each of the nearest ones the pair is
 * refined by alternating exact closest-point queries (a point of A to B, that point back to A, ...), which converges to a
 * local minimum of the distance between the two boundaries. Two solids that overlap have distance 0 and `overlap` set; solids
 * that only touch have distance ~0 and `overlap` false.
 */
import { dist3, type Vec3 } from "./math.ts"
import { brepLocator } from "./classify.ts"
import { tessellateBrep } from "./tessellate.ts"
import type { Brep } from "./topology.ts"

export interface MinimumDistance {
  readonly distance: number
  /** Closest point on A and on B. */
  readonly pointA: Vec3
  readonly pointB: Vec3
  readonly faceA?: number
  readonly faceB?: number
  /** True when part of one solid is inside the other. */
  readonly overlap: boolean
}

export interface DistanceOptions {
  /** Candidates refined per solid (default 6). */
  readonly candidates?: number
  /** Chord tolerance of the candidate tessellation, mm. */
  readonly chordTol?: number
}

export const minimumDistance = (A: Brep, B: Brep, options: DistanceOptions = {}): MinimumDistance => {
  const la = brepLocator(A), lb = brepLocator(B)
  const samples = (b: Brep): Vec3[] => {
    const t = tessellateBrep(b, { ...(options.chordTol !== undefined ? { chordTol: options.chordTol } : {}), angleTolDeg: 20 })
    const out: Vec3[] = []
    for (let i = 0; i < t.positions.length; i += 3) out.push({ x: t.positions[i]!, y: t.positions[i + 1]!, z: t.positions[i + 2]! })
    return out
  }
  const k = options.candidates ?? 6
  let best: { d: number; a: Vec3; b: Vec3; fa?: number; fb?: number } = { d: Infinity, a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } }
  let overlap = false
  const run = (from: Brep, to: Brep, lf: ReturnType<typeof brepLocator>, lt: ReturnType<typeof brepLocator>, swap: boolean): void => {
    const near = samples(from)
      .map((p) => ({ p, c: lt.closest(p) }))
      .sort((x, y) => x.c.distance - y.c.distance)
    // Keep candidates apart so the k refinements do not all start from the same patch.
    const picked: typeof near = []
    const gap = near.length === 0 ? 0 : near[0]!.c.distance * 0.25 + 1e-9
    for (const n of near) {
      if (picked.length >= k) break
      if (picked.every((q) => dist3(q.p, n.p) > gap)) picked.push(n)
    }
    for (const n of picked) {
      let p = n.p
      let q = n.c.point
      let fp: number | undefined, fq = n.c.face
      let prev = Infinity
      for (let it = 0; it < 40; it++) {
        const cp = lf.closest(q)
        p = cp.point; fp = cp.face
        const cq = lt.closest(p)
        q = cq.point; fq = cq.face
        const d = dist3(p, q)
        if (Math.abs(prev - d) < 1e-12 * (1 + d)) break
        prev = d
      }
      const d = dist3(p, q)
      if (d < best.d) best = swap ? { d, a: q, b: p, ...(fq !== undefined ? { fa: fq } : {}), ...(fp !== undefined ? { fb: fp } : {}) } : { d, a: p, b: q, ...(fp !== undefined ? { fa: fp } : {}), ...(fq !== undefined ? { fb: fq } : {}) }
    }
    // One sample inside the other solid means they overlap.
    if (picked.some((n) => lt.classify(n.p, 1e-7) === "in")) overlap = true
  }
  run(A, B, la, lb, false)
  run(B, A, lb, la, true)
  return {
    distance: overlap ? 0 : best.d,
    pointA: best.a,
    pointB: best.b,
    ...(best.fa !== undefined ? { faceA: best.fa } : {}),
    ...(best.fb !== undefined ? { faceB: best.fb } : {}),
    overlap
  }
}
