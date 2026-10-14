/**
 * Feature recognition on the exact model (hyperMILL's feature technology, Fusion's hole recognition): the holes of a solid
 * read from its faces, not from a history, so a STEP import, a Boolean result and a parametric part are recognised alike.
 *
 * A hole is a run of coaxial concave faces of revolution (cylinders and cones whose material lies outside the axis) that
 * together go all the way round the axis. Runs that touch along the axis are one hole: a counterbore is a wide cylinder
 * above the drill, a countersink a cone at the opening, a drill point a cone closing the bottom. Whether an end of the run
 * is open is asked of the solid itself: the point on the axis just past that end is outside the material.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { brepLocator } from "./classify.ts"
import { curvePoint, surfaceNormal, surfaceProject, type Surface } from "./geom.ts"
import { MODEL_TOL, type Vec3 } from "./math.ts"
import type { Brep } from "./topology.ts"

/** One face of revolution of a hole, located from the hole's entry along its direction. */
export interface HoleSegment {
  readonly kind: "cylinder" | "cone"
  /** Distance from the entry where the segment starts and ends (start < end). */
  readonly start: number
  readonly end: number
  /** Diameter at `start` and at `end` (equal on a cylinder). */
  readonly diameterStart: number
  readonly diameterEnd: number
  readonly faces: ReadonlyArray<number>
}

export type HoleForm = "simple" | "counterbore" | "countersink"
export type HoleBottom = "through" | "flat" | "drill-point"

export interface RecognizedHole {
  /** Centre of the opening the hole is entered from (on the axis, at the outermost point of the entry segment). */
  readonly entry: Vec3
  /** Unit direction into the material. */
  readonly direction: Vec3
  /** Axial length from the entry to the bottom or the exit. */
  readonly depth: number
  /** Diameter of the narrowest cylinder: the drill. */
  readonly diameter: number
  readonly form: HoleForm
  readonly bottom: HoleBottom
  /** Counterbore or countersink diameter at the opening, and the counterbore's depth. */
  readonly headDiameter?: number
  readonly headDepth?: number
  /** From the entry along `direction`. */
  readonly segments: ReadonlyArray<HoleSegment>
}

export interface HoleRecognitionOptions {
  /** Largest gap between coaxial faces along the axis that still joins them into one hole, mm (default 1e-4). */
  readonly gap?: number
  /** Distance tolerance for "same axis" and "same radius", mm (default 1e-4). */
  readonly tol?: number
}

interface Ring {
  readonly kind: "cylinder" | "cone"
  readonly origin: Vec3
  readonly axis: Vec3
  /** Axial range along `axis` from `origin`, and the radius at both ends. */
  lo: number
  hi: number
  rLo: number
  rHi: number
  readonly faces: number[]
  angles: number[]
}

const TAU = 2 * Math.PI
/** Largest angular gap between boundary samples of a ring that still counts as going all the way round. */
const MAX_GAP = Math.PI / 3

/** Boundary samples of a face: its edges, 16 points each (the seam's end points included). */
const faceSamples = (b: Brep, fi: number): Vec3[] => {
  const out: Vec3[] = []
  for (const loop of b.faces[fi]!.loops) {
    for (const c of loop.coedges) {
      const e = b.edges[c.edge]!
      for (let k = 0; k <= 16; k++) out.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16))
    }
  }
  return out
}

/** The axis and radius function of a concave face of revolution, or undefined when the face is not one. */
const revolution = (b: Brep, fi: number): { origin: Vec3; axis: Vec3; radiusAt: (t: number) => number; kind: "cylinder" | "cone" } | undefined => {
  const f = b.faces[fi]!
  const s: Surface = f.surface
  if (s.kind !== "cylinder" && s.kind !== "cone") return undefined
  const origin = s.frame.origin, axis = s.frame.z
  const samples = faceSamples(b, fi)
  if (samples.length === 0) return undefined
  // Concave: the outward normal of the solid points towards the axis.
  const p = samples[Math.floor(samples.length / 2)]!
  const uv = surfaceProject(s, p)
  const n0 = surfaceNormal(s, uv.u, uv.v)
  const n = f.reversed ? scale3(n0, -1) : n0
  const d = sub3(p, origin)
  const radial = sub3(d, scale3(axis, dot3(d, axis)))
  if (dot3(n, radial) >= 0) return undefined
  if (s.kind === "cylinder") return { origin, axis, radiusAt: () => s.radius, kind: "cylinder" }
  // Cone: radius `radius` at the frame origin, growing by tan(semiAngle) per unit along the axis.
  const k = Math.tan(s.semiAngle)
  return { origin, axis, radiusAt: (t: number) => s.radius + k * t, kind: "cone" }
}

const lineDistance = (origin: Vec3, axis: Vec3, p: Vec3): number => {
  const d = sub3(p, origin)
  return length3(sub3(d, scale3(axis, dot3(d, axis))))
}

/** Largest gap between sorted angles on the circle. */
const largestGap = (angles: ReadonlyArray<number>): number => {
  if (angles.length === 0) return TAU
  const a = [...angles].sort((x, y) => x - y)
  let gap = a[0]! + TAU - a[a.length - 1]!
  for (let i = 1; i < a.length; i++) gap = Math.max(gap, a[i]! - a[i - 1]!)
  return gap
}

/**
 * The holes of a solid. Each hole is reported once, entered from its widest opening (from either end of a through hole of
 * one diameter, the end whose direction has the larger +z, then +y, then +x component, so the result is deterministic).
 */
export const recognizeHoles = (b: Brep, options: HoleRecognitionOptions = {}): ReadonlyArray<RecognizedHole> => {
  const tol = options.tol ?? 1e-4
  const gap = options.gap ?? 1e-4
  // 1. Concave faces of revolution, merged into rings: same axis line, same kind and radius law.
  const rings: Ring[] = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    const rev = revolution(b, fi)
    if (rev === undefined) continue
    const samples = faceSamples(b, fi)
    const ref = Math.abs(rev.axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const u = normalize3(cross3(rev.axis, ref)), v = cross3(rev.axis, u)
    let lo = Infinity, hi = -Infinity
    const angles: number[] = []
    for (const p of samples) {
      const d = sub3(p, rev.origin)
      const t = dot3(d, rev.axis)
      lo = Math.min(lo, t)
      hi = Math.max(hi, t)
      const r = sub3(d, scale3(rev.axis, t))
      if (length3(r) > tol) angles.push(Math.atan2(dot3(r, v), dot3(r, u)) + Math.PI)
    }
    const ring = rings.find((g) =>
      g.kind === rev.kind &&
      Math.abs(Math.abs(dot3(g.axis, rev.axis)) - 1) < 1e-9 &&
      lineDistance(g.origin, g.axis, rev.origin) < tol &&
      (() => {
        // Same radius law: compare the radii at the new face's ends, measured on the ring's own axis.
        const s = Math.sign(dot3(g.axis, rev.axis))
        const t0 = dot3(sub3(rev.origin, g.origin), g.axis)
        const rAt = (tg: number) => (g.hi === g.lo ? g.rLo : g.rLo + ((g.rHi - g.rLo) * (tg - g.lo)) / (g.hi - g.lo))
        const a = t0 + s * lo, c = t0 + s * hi
        // Coaxial bores of one diameter separated by air (the two flanges of a U) are two holes: join only touching faces.
        if (Math.min(a, c) > g.hi + gap || Math.max(a, c) < g.lo - gap) return false
        return Math.abs(rAt(a) - rev.radiusAt(lo)) < tol && Math.abs(rAt(c) - rev.radiusAt(hi)) < tol
      })()
    )
    if (ring === undefined) {
      rings.push({ kind: rev.kind, origin: rev.origin, axis: rev.axis, lo, hi, rLo: rev.radiusAt(lo), rHi: rev.radiusAt(hi), faces: [fi], angles })
    } else {
      // Re-express the face on the ring's axis (which may point the other way) and widen the ring.
      const s = Math.sign(dot3(ring.axis, rev.axis))
      const t0 = dot3(sub3(rev.origin, ring.origin), ring.axis)
      const a = t0 + s * lo, c = t0 + s * hi
      const ra = rev.radiusAt(lo), rc = rev.radiusAt(hi)
      const [na, nr] = a < c ? [a, ra] : [c, rc]
      const [xa, xr] = a < c ? [c, rc] : [a, ra]
      if (na < ring.lo) { ring.lo = na; ring.rLo = nr }
      if (xa > ring.hi) { ring.hi = xa; ring.rHi = xr }
      ring.faces.push(fi)
      // Angles are measured about the ring's own (u, v): recompute them on that basis.
      const ref = Math.abs(ring.axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
      const ru = normalize3(cross3(ring.axis, ref)), rv = cross3(ring.axis, ru)
      for (const p of samples) {
        const d = sub3(p, ring.origin)
        const r = sub3(d, scale3(ring.axis, dot3(d, ring.axis)))
        if (length3(r) > tol) ring.angles.push(Math.atan2(dot3(r, rv), dot3(r, ru)) + Math.PI)
      }
    }
  }
  // 2. A ring that does not go all the way round is a fillet or a partial bore, not a hole.
  const full = rings.filter((r) => largestGap(r.angles) <= MAX_GAP && r.hi - r.lo > tol)
  // 3. Rings on one axis line that touch along it are one hole.
  const used = new Set<number>()
  const holes: RecognizedHole[] = []
  const locator = full.length > 0 ? brepLocator(b) : undefined
  for (let i = 0; i < full.length; i++) {
    if (used.has(i)) continue
    const base = full[i]!
    const line = full.map((r, j) => ({ r, j })).filter(({ r, j }) =>
      !used.has(j) && Math.abs(Math.abs(dot3(r.axis, base.axis)) - 1) < 1e-9 && lineDistance(base.origin, base.axis, r.origin) < tol)
    // Every ring on base's axis parameter.
    const placed = line.map(({ r, j }) => {
      const s = Math.sign(dot3(r.axis, base.axis))
      const t0 = dot3(sub3(r.origin, base.origin), base.axis)
      const a = t0 + s * r.lo, c = t0 + s * r.hi
      return a < c ? { j, r, lo: a, hi: c, rLo: r.rLo, rHi: r.rHi } : { j, r, lo: c, hi: a, rLo: r.rHi, rHi: r.rLo }
    }).sort((x, y) => x.lo - y.lo)
    // Split into chains of rings that touch.
    const chains: Array<typeof placed> = []
    for (const p of placed) {
      const last = chains[chains.length - 1]
      if (last !== undefined && p.lo <= last[last.length - 1]!.hi + gap) last.push(p)
      else chains.push([p])
    }
    for (const chain of chains) {
      for (const p of chain) used.add(p.j)
      const lo = chain[0]!.lo, hi = Math.max(...chain.map((p) => p.hi))
      const rMax = Math.max(...chain.map((p) => Math.max(p.rLo, p.rHi)))
      const eps = Math.max(10 * MODEL_TOL, Math.min(0.05, rMax * 0.05))
      // Probe just past each end, on the axis; a cone closing to the axis (a drill point) ends in material.
      const at = (t: number) => add3(base.origin, scale3(base.axis, t))
      const open = (t: number) => locator!.classify(at(t), MODEL_TOL * 10) === "out"
      const loOpen = open(lo - eps), hiOpen = open(hi + eps)
      if (!loOpen && !hiOpen) continue // an internal cavity, not a hole
      const rEnd = (end: "lo" | "hi") => end === "lo" ? chain[0]!.rLo : chain.reduce((a, p) => (p.hi > a.hi ? p : a)).rHi
      let entryEnd: "lo" | "hi"
      if (loOpen && hiOpen) {
        const rl = rEnd("lo"), rh = rEnd("hi")
        if (Math.abs(rl - rh) > tol) entryEnd = rl > rh ? "lo" : "hi"
        else {
          // Enter against the direction that points most "up": the hole is drilled from the top.
          const d = base.axis
          const key = Math.abs(d.z) > 1e-9 ? d.z : Math.abs(d.y) > 1e-9 ? d.y : d.x
          entryEnd = key > 0 ? "hi" : "lo"
        }
      } else entryEnd = loOpen ? "lo" : "hi"
      const direction = entryEnd === "lo" ? base.axis : scale3(base.axis, -1)
      const entryT = entryEnd === "lo" ? lo : hi
      const depth = hi - lo
      const toEntry = (t: number) => (entryEnd === "lo" ? t - lo : hi - t)
      const segments: HoleSegment[] = chain.map((p) => {
        const a = toEntry(p.lo), c = toEntry(p.hi)
        return a < c
          ? { kind: p.r.kind, start: a, end: c, diameterStart: 2 * p.rLo, diameterEnd: 2 * p.rHi, faces: [...p.r.faces] }
          : { kind: p.r.kind, start: c, end: a, diameterStart: 2 * p.rHi, diameterEnd: 2 * p.rLo, faces: [...p.r.faces] }
      }).sort((x, y) => x.start - y.start)
      const cylinders = segments.filter((s) => s.kind === "cylinder")
      if (cylinders.length === 0) continue // a lone cone is a countersink or a dimple without a drill
      const diameter = Math.min(...cylinders.map((s) => s.diameterStart))
      const first = segments[0]!
      let form: HoleForm = "simple"
      let headDiameter: number | undefined, headDepth: number | undefined
      if (first.kind === "cone" && first.diameterStart > first.diameterEnd + tol) {
        form = "countersink"
        headDiameter = first.diameterStart
      } else if (first.kind === "cylinder" && first.diameterStart > diameter + tol && segments.length > 1) {
        form = "counterbore"
        headDiameter = first.diameterStart
        headDepth = first.end - first.start
      }
      const last = segments[segments.length - 1]!
      const bottom: HoleBottom = loOpen && hiOpen ? "through" : last.kind === "cone" && last.diameterEnd < last.diameterStart - tol ? "drill-point" : "flat"
      holes.push({
        entry: at(entryT),
        direction,
        depth,
        diameter,
        form,
        bottom,
        ...(headDiameter !== undefined ? { headDiameter } : {}),
        ...(headDepth !== undefined ? { headDepth } : {}),
        segments
      })
    }
  }
  return holes
}
