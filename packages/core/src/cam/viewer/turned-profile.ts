/**
 * The turned part at time t (spec 31 §5.3): the bar's outer and inner radius along the spindle axis after the feed moves made
 * so far with the spindle turning. The insert's nose (its radius, the set-up's `noseRadius`) removes, under it, everything
 * outside its arc (external tools) or inside it (boring / internal tools): shoulders come out with the nose radius in their
 * corner. A sharp tool (radius 0) removes at its Z everything outside its radius; a grooving or parting blade does so over its
 * width. Material
 * no longer joined to the chuck (in front of a cut that reached the bore or the axis) falls away: that is how facing and
 * parting look. Rapids remove nothing (a rapid into material is a crash the checks report, not a cut).
 */
import type { LatheSetup } from "./machine-setup.ts"
import { latheStockEnds } from "./machine-bodies.ts"
import { pointOn, type Timeline } from "./timeline.ts"

export interface TurnedProfile {
  /** Display x of bin 0 (the bar's back end, in the chuck). */
  readonly x0: number
  readonly bin: number
  readonly outer: Float64Array
  readonly inner: Float64Array
}

const MAX_BINS = 20_000
export const PROFILE_BIN = 0.05

export const emptyProfile = (setup: LatheSetup): TurnedProfile => {
  const { back, free } = latheStockEnds(setup)
  const length = free - back
  const bin = Math.max(PROFILE_BIN, length / MAX_BINS)
  const n = Math.max(1, Math.ceil(length / bin))
  return { x0: back, bin, outer: new Float64Array(n).fill(setup.stock.diameter / 2), inner: new Float64Array(n).fill(setup.stock.bore / 2) }
}

export const turnedProfileAt = (setup: LatheSetup, timeline: Timeline, seconds: number): TurnedProfile => {
  const profile = emptyProfile(setup)
  const { outer, inner, bin, x0 } = profile
  const n = outer.length
  const half = setup.toolWidth / 2
  const cut = (b: number, r: number) => {
    if (setup.internal) { if (r > inner[b]!) inner[b] = Math.min(r, outer[b]!) }
    else if (r < outer[b]!) outer[b] = Math.max(inner[b]!, r)
  }
  const rn = Math.max(0, setup.noseRadius)
  for (const move of timeline.moves) {
    if (move.start >= seconds) break
    if (move.kind !== "feed" || move.state.spindle === "off" || move.state.probe) continue
    const f = move.duration > 0 ? Math.min(1, (seconds - move.start) / move.duration) : 1
    const radiusOf = (px: number) => Math.max(0, move.state.xMode === "diameter" ? Math.abs(px) / 2 : Math.abs(px))
    const a = move.from, b = pointOn(move, f)
    if (rn > 0) {
      // A rounded nose: its centre sits rn towards the free end and rn off the part from the theoretical tip; every bin under
      // the nose takes the circle's height there. Centres every half bin, so the arc's flat bottom covers every bin.
      const signedR = (px: number) => (move.state.xMode === "diameter" ? px / 2 : px)
      const length = Math.hypot(b.z - a.z, signedR(b.x) - signedR(a.x))
      const steps = Math.min(200_000, Math.max(1, Math.ceil(length / (bin / 2))))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const cz = a.z + (b.z - a.z) * t + rn
        const cr = signedR(a.x + (b.x - a.x) * t) + (setup.internal ? -rn : rn)
        const lo = Math.max(0, Math.floor((cz - rn - x0) / bin)), hi = Math.min(n - 1, Math.floor((cz + rn - x0) / bin))
        for (let q = lo; q <= hi; q++) {
          const dz = x0 + (q + 0.5) * bin - cz
          const h = Math.sqrt(Math.max(0, rn * rn - dz * dz))
          cut(q, Math.max(0, setup.internal ? cr + h : cr - h))
        }
      }
      continue
    }
    // Display x is program Z. Every bin the move (and the blade's width) covers takes the radius at the nearest point of
    // the move to the bin's centre: no bin is skipped between samples, whatever the float rounding.
    const zlo = Math.min(a.z, b.z), zhi = Math.max(a.z, b.z)
    const radial = zhi - zlo < 1e-12
    // A facing cut that runs past the axis (X-1) has gone through the centre on the way.
    const crosses = (a.x < 0) !== (b.x < 0) && a.x !== 0 && b.x !== 0
    const radialR = setup.internal ? Math.max(radiusOf(a.x), radiusOf(b.x)) : crosses ? 0 : Math.min(radiusOf(a.x), radiusOf(b.x))
    const lo = Math.max(0, Math.floor((zlo - half - x0) / bin)), hi = Math.min(n - 1, Math.floor((zhi + half - x0) / bin))
    for (let k = lo; k <= hi; k++) {
      if (radial) { cut(k, radialR); continue }
      const zc = Math.min(zhi, Math.max(zlo, x0 + (k + 0.5) * bin))
      const t = (zc - a.z) / (b.z - a.z)
      cut(k, radiusOf(a.x + (b.x - a.x) * t))
    }
  }
  // Material is held by the chuck: past the first bin cut through, the rest of the bar has fallen away.
  for (let b = 0; b < n; b++) {
    if (outer[b]! <= inner[b]! + 1e-9) {
      for (let k = b; k < n; k++) { outer[k] = 0; inner[k] = 0 }
      break
    }
  }
  return profile
}

/** The profile as runs of equal radii (x from, x to, outer, inner), for the revolved mesh; empty runs are dropped. */
export const profileRuns = (profile: TurnedProfile, tolerance = 1e-6): ReadonlyArray<{ readonly x0: number; readonly x1: number; readonly outer: number; readonly inner: number }> => {
  const runs: Array<{ x0: number; x1: number; outer: number; inner: number }> = []
  for (let b = 0; b < profile.outer.length; b++) {
    const o = profile.outer[b]!, i = profile.inner[b]!
    if (o <= i + 1e-9) continue
    const x = profile.x0 + b * profile.bin
    const last = runs[runs.length - 1]
    // A merged run reports the turned size (the smallest outer, the largest bore), not the first bin's: the bin on a shoulder's
    // nose radius would otherwise name the whole diameter after it.
    if (last !== undefined && Math.abs(last.x1 - x) < 1e-9 && Math.abs(last.outer - o) <= tolerance && Math.abs(last.inner - i) <= tolerance) { last.x1 = x + profile.bin; last.outer = Math.min(last.outer, o); last.inner = Math.max(last.inner, i) }
    else runs.push({ x0: x, x1: x + profile.bin, outer: o, inner: i })
  }
  return runs
}
