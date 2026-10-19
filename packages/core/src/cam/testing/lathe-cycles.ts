/**
 * Fanuc lathe multiple repetitive cycles (spec 32 §4.3), expanded into the moves the turret makes, in the lathe's (radius,
 * Z) plane: G71 stock removal in turning (passes along Z), G72 in facing (passes along X), G73 pattern repeating, G70
 * finishing, G76 multiple threading, G74 face peck drilling / grooving and G75 outer-diameter peck grooving. The two-block
 * format of Fanuc 0i/30i is read by the interpreter; these functions only do the geometry.
 *
 * Radii, not diameters: the interpreter converts its program X (diameter or radius mode) before and after. Every cycle
 * starts and ends at its start point A, as the control does.
 */

export interface LathePoint { readonly r: number; readonly z: number }
export interface LatheMove { readonly kind: "rapid" | "feed"; readonly to: LathePoint }
/** A profile point and whether the profile reaches it in rapid (G0 in the profile blocks) or at feed. */
export interface ProfilePoint extends LathePoint { readonly rapid: boolean }

const EPS = 1e-9

/** Level / cut coordinates: G71 levels in r and cuts along z, G72 the other way round. */
type Axis = "r" | "z"
const level = (p: LathePoint, axis: Axis): number => (axis === "r" ? p.r : p.z)
const along = (p: LathePoint, axis: Axis): number => (axis === "r" ? p.z : p.r)
const point = (lv: number, al: number, axis: Axis): LathePoint => (axis === "r" ? { r: lv, z: al } : { r: al, z: lv })

export interface RoughInput {
  /** Start point A (where the cycle is called from). */
  readonly start: LathePoint
  /** The finishing profile from A: A first, then the points of the ns..nf blocks. */
  readonly profile: ReadonlyArray<ProfilePoint>
  /** Depth of cut per pass (radius for G71, Z for G72), > 0. */
  readonly depth: number
  /** Retract after each pass, >= 0. */
  readonly retract: number
  /** Finishing allowance, signed: r (radius) and z. */
  readonly allowance: LathePoint
  /** `r`: G71 (levels in X, cuts along Z); `z`: G72 (levels in Z, cuts along X). */
  readonly axis: Axis
}

/** Where `value` of the level coordinate crosses the profile, first in profile order after its first point (the infeed). */
const crossing = (profile: ReadonlyArray<LathePoint>, value: number, axis: Axis): number | undefined => {
  for (let i = 1; i + 1 < profile.length; i++) {
    const a = profile[i]!, b = profile[i + 1]!
    const la = level(a, axis), lb = level(b, axis)
    if ((value - la) * (value - lb) > EPS || Math.abs(lb - la) < EPS && Math.abs(value - la) > EPS) continue
    const t = Math.abs(lb - la) < EPS ? 0 : (value - la) / (lb - la)
    return along(a, axis) + (along(b, axis) - along(a, axis)) * t
  }
  return undefined
}

const shift = (p: ProfilePoint, by: LathePoint): ProfilePoint => ({ r: p.r + by.r, z: p.z + by.z, rapid: p.rapid })

/**
 * G71 / G72 stock removal: passes at every `depth` from A towards the profile (shifted by the allowance), each from A's cut
 * coordinate to where its level meets the profile, a 45° retract, a rapid back; then one pass along the shifted profile and
 * back to A. A profile that moves away from A in the level direction is cut on the side it lies on (external / internal).
 */
export const roughCycle = (input: RoughInput): LatheMove[] => {
  const { start: A, axis } = input
  const profile = input.profile.map((p, i) => (i === 0 ? p : shift(p, input.allowance)))
  if (profile.length < 3 || input.depth <= EPS) return []
  const body = profile.slice(1)
  const a0 = level(A, axis), b0 = along(A, axis)
  const levels = body.map((p) => level(p, axis))
  // Towards the profile in the level coordinate, and the direction the cuts run in.
  const mean = levels.reduce((s, v) => s + v, 0) / levels.length
  const s = mean < a0 ? -1 : 1
  const limit = s < 0 ? Math.min(...levels) : Math.max(...levels)
  const end = body[body.length - 1]!
  const t = Math.sign(along(end, axis) - b0) || -1
  const moves: LatheMove[] = []
  for (let k = 1; k < 10_000; k++) {
    const lv = a0 + s * k * input.depth
    if (s * (lv - limit) >= -EPS) break
    const hit = crossing(profile, lv, axis) ?? along(end, axis)
    if (t * (hit - b0) <= EPS) continue
    moves.push({ kind: "rapid", to: point(lv, b0, axis) })
    moves.push({ kind: "feed", to: point(lv, hit, axis) })
    moves.push({ kind: "feed", to: point(lv - s * input.retract, hit - t * input.retract, axis) })
    moves.push({ kind: "rapid", to: point(lv - s * input.retract, b0, axis) })
  }
  // The last pass follows the profile with its allowance, then back to A.
  moves.push({ kind: "rapid", to: { r: body[0]!.r, z: body[0]!.z } })
  for (const p of body.slice(1)) moves.push({ kind: "feed", to: { r: p.r, z: p.z } })
  moves.push({ kind: "rapid", to: point(a0, along(end, axis), axis) })
  moves.push({ kind: "rapid", to: { r: A.r, z: A.z } })
  return moves
}

/**
 * G73 pattern repeating: the profile `passes` times, the first shifted by the allowance plus the relief (`relief`, radius and
 * Z), each next one closer, the last on the allowance; each pass from A and back to A.
 */
export const patternCycle = (start: LathePoint, profile: ReadonlyArray<ProfilePoint>, relief: LathePoint, allowance: LathePoint, passes: number): LatheMove[] => {
  const n = Math.max(1, Math.round(passes))
  const body = profile.slice(1)
  if (body.length === 0) return []
  const moves: LatheMove[] = []
  for (let k = 1; k <= n; k++) {
    const f = n === 1 ? 0 : (n - k) / (n - 1)
    const by = { r: allowance.r + relief.r * f, z: allowance.z + relief.z * f }
    const first = shift(body[0]!, by)
    moves.push({ kind: "rapid", to: { r: first.r, z: first.z } })
    for (const p of body.slice(1)) { const q = shift(p, by); moves.push({ kind: "feed", to: { r: q.r, z: q.z } }) }
    moves.push({ kind: "rapid", to: { r: start.r, z: start.z } })
  }
  return moves
}

/** G70 finishing: the profile as written (its rapids stay rapids), then back to A. */
export const finishCycle = (start: LathePoint, profile: ReadonlyArray<ProfilePoint>): LatheMove[] => [
  ...profile.slice(1).map((p): LatheMove => ({ kind: p.rapid ? "rapid" : "feed", to: { r: p.r, z: p.z } })),
  { kind: "rapid", to: { r: start.r, z: start.z } }
]

export interface ThreadInput {
  readonly start: LathePoint
  /** Thread root radius at the end (X of the second block / 2) and the end Z. */
  readonly root: LathePoint
  /** Radius difference start - end (taper thread), 0 for a straight thread. */
  readonly taper: number
  /** Thread height (radius), first cut depth, minimum cut depth, finishing allowance; mm. */
  readonly height: number
  readonly firstDepth: number
  readonly minDepth: number
  readonly finishAllowance: number
  /** Finishing passes at full depth (>= 1). */
  readonly finishPasses: number
}

/** The cut depths of G76: Δd·√n while below height - allowance (at least `minDepth` apart), then the full height `m` times. */
export const threadDepths = (input: Pick<ThreadInput, "height" | "firstDepth" | "minDepth" | "finishAllowance" | "finishPasses">): number[] => {
  const rough = Math.max(0, input.height - input.finishAllowance)
  const out: number[] = []
  let previous = 0
  for (let n = 1; n < 1000 && input.firstDepth > EPS; n++) {
    let d = input.firstDepth * Math.sqrt(n)
    if (d - previous < input.minDepth) d = previous + input.minDepth
    if (d >= rough - EPS) break
    out.push(d)
    previous = d
  }
  if (rough > EPS && rough > previous + EPS) out.push(rough)
  for (let m = 0; m < Math.max(1, Math.round(input.finishPasses)); m++) out.push(input.height)
  return out
}

/**
 * G76 multiple threading, drawn with radial infeed: for every depth, in to the pass radius at A's Z, along the thread to the
 * end (the taper from start to end), out to A's radius, back to A's Z. External when the root is inside A.
 */
export const threadCycle = (input: ThreadInput): LatheMove[] => {
  const outward = input.root.r < input.start.r ? 1 : -1
  const moves: LatheMove[] = []
  for (const depth of threadDepths(input)) {
    const r = input.root.r + outward * (input.height - depth)
    moves.push({ kind: "rapid", to: { r: r + input.taper, z: input.start.z } })
    moves.push({ kind: "feed", to: { r, z: input.root.z } })
    moves.push({ kind: "rapid", to: { r: input.start.r, z: input.root.z } })
    moves.push({ kind: "rapid", to: { r: input.start.r, z: input.start.z } })
  }
  return moves
}

/**
 * G74 (along Z) / G75 (along X) peck cycles: columns from A to the end point, each pecked in steps with a retract between
 * pecks, then out to A's level; the columns step across by `across`.
 */
export const peckCycle = (start: LathePoint, end: LathePoint, peck: number, across: number, retract: number, axis: "z" | "r"): LatheMove[] => {
  const cutFrom = axis === "z" ? start.z : start.r, cutTo = axis === "z" ? end.z : end.r
  const stepFrom = axis === "z" ? start.r : start.z, stepTo = axis === "z" ? end.r : end.z
  const at = (cut: number, step: number): LathePoint => (axis === "z" ? { r: step, z: cut } : { r: cut, z: step })
  const dir = Math.sign(cutTo - cutFrom)
  const sdir = Math.sign(stepTo - stepFrom)
  const columns: number[] = [stepFrom]
  if (sdir !== 0 && across > EPS) for (let c = stepFrom + sdir * across; sdir * (stepTo - c) > EPS; c += sdir * across) columns.push(c)
  if (sdir !== 0 && Math.abs(columns[columns.length - 1]! - stepTo) > EPS) columns.push(stepTo)
  const moves: LatheMove[] = []
  for (const column of columns) {
    moves.push({ kind: "rapid", to: at(cutFrom, column) })
    if (dir === 0) continue
    const step = peck > EPS ? peck : Math.abs(cutTo - cutFrom)
    let depth = cutFrom
    while (dir * (cutTo - depth) > EPS) {
      depth = dir * (cutTo - depth) > step ? depth + dir * step : cutTo
      moves.push({ kind: "feed", to: at(depth, column) })
      if (dir * (cutTo - depth) > EPS && retract > EPS) {
        moves.push({ kind: "rapid", to: at(depth - dir * retract, column) })
        moves.push({ kind: "feed", to: at(depth, column) })
      }
    }
    moves.push({ kind: "rapid", to: at(cutFrom, column) })
  }
  moves.push({ kind: "rapid", to: start })
  return moves
}
