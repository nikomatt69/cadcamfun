/**
 * The turned part at time t (spec 31 §5.3): the bar's outer and inner radius along the spindle axis after the feed moves made
 * so far with the spindle turning. A point tool (nose radius 0) on a round part removes, at its Z, everything outside its
 * radius (external tools) or inside it (boring / internal tools); a grooving or parting blade does so over its width. Material
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
  const apply = (x: number, r: number) => {
    const lo = Math.floor((x - half - x0) / bin), hi = Math.floor((x + half - x0) / bin)
    for (let b = Math.max(0, lo); b <= Math.min(n - 1, hi); b++) {
      if (setup.internal) { if (r > inner[b]!) inner[b] = Math.min(r, outer[b]!) }
      else if (r < outer[b]!) outer[b] = Math.max(inner[b]!, r)
    }
  }
  for (const move of timeline.moves) {
    if (move.start >= seconds) break
    if (move.kind !== "feed" || move.state.spindle === "off") continue
    const f = move.duration > 0 ? Math.min(1, (seconds - move.start) / move.duration) : 1
    const radiusOf = (px: number) => Math.max(0, move.state.xMode === "diameter" ? Math.abs(px) / 2 : Math.abs(px))
    const a = move.from, b = pointOn(move, f)
    // Display x is program Z. Sample at bin resolution along Z, at least both ends.
    const steps = Math.max(1, Math.ceil(Math.abs(b.z - a.z) / bin))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      apply(a.z + (b.z - a.z) * t, radiusOf(a.x + (b.x - a.x) * t))
    }
    // A radial move inside one bin: its innermost (outermost, for a boring bar) radius is what it reached.
    // A facing cut that runs past the axis (X-1) has gone through the centre on the way.
    const crosses = (a.x < 0) !== (b.x < 0) && a.x !== 0 && b.x !== 0
    if (steps === 1) apply(b.z, setup.internal ? Math.max(radiusOf(a.x), radiusOf(b.x)) : crosses ? 0 : Math.min(radiusOf(a.x), radiusOf(b.x)))
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
    if (last !== undefined && Math.abs(last.x1 - x) < 1e-9 && Math.abs(last.outer - o) <= tolerance && Math.abs(last.inner - i) <= tolerance) last.x1 = x + profile.bin
    else runs.push({ x0: x, x1: x + profile.bin, outer: o, inner: i })
  }
  return runs
}
