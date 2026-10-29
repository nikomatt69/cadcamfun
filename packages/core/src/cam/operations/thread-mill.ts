/**
 * The path of the tool centre under Heidenhain cycles 262 THREAD MILLING (internal) and 267 OUTSIDE THREAD MILLING (spec 69 G4c.2),
 * as moves: to the start of the helix, one pitch of Z per turn, and out. The centre runs at `(D - d) / 2` inside a hole and at
 * `(D + d) / 2` round a boss (nominal diameter D, cutter d), at the full thread depth in a single pass. The cycle has no entry arc here
 * and no radial passes: those are the kernel's own operation, and the post writes the cycle only where the control\'s routine is wanted.
 * Handedness is the helix: a right-hand thread rises with counter-clockwise travel. Internal climb milling is counter-clockwise,
 * external climb is clockwise. `testing/heidenhain.ts` reads the cycle back as this same path.
 */
import type { Move } from "../ir.ts"

export interface ThreadMill {
  readonly center: { readonly x: number; readonly y: number }
  /** Work Z of the surface (Q203), the set-up clearance above it (Q200) and the 2nd one (Q204). */
  readonly surface: number
  readonly clearance: number
  readonly secondClearance: number
  /** Length of the thread below the surface, mm (positive). */
  readonly length: number
  readonly diameter: number
  readonly pitch: number
  readonly toolRadius: number
  readonly internal: boolean
  readonly rightHand: boolean
  readonly climb: boolean
  readonly feed: number
}

/** True when the cutter turns counter-clockwise on this thread. */
export const threadTurnsCcw = (t: Pick<ThreadMill, "internal" | "climb">): boolean => (t.internal ? t.climb : !t.climb)

export const threadMillMoves = (t: ThreadMill): Move[] => {
  const rc = t.internal ? t.diameter / 2 - t.toolRadius : t.diameter / 2 + t.toolRadius
  if (!(rc > 1e-9)) throw new RangeError(`A cutter of radius ${t.toolRadius} does not fit a M${t.diameter} thread`)
  if (!(t.length > 0) || !(t.pitch > 0)) throw new RangeError("A thread needs a length and a pitch")
  const ccw = threadTurnsCcw(t)
  // A right-hand thread rises with counter-clockwise travel: the cutter starts at the bottom going up, or at the top coming down.
  const rising = ccw === t.rightHand
  const { x, y } = t.center
  const top = t.surface + t.clearance
  const bottom = t.surface - t.length
  const turns = t.length / t.pitch
  const whole = Math.floor(turns + 1e-9)
  const frac = turns - whole
  const at = (angle: number, z: number) => ({ x: x + rc * Math.cos(angle), y: y + rc * Math.sin(angle), z })
  const out: Move[] = [{ _tag: "Rapid", to: { x, y, z: top } }]
  const z0 = rising ? bottom : t.surface
  out.push({ _tag: "Rapid", to: { x: x + rc, y, z: top } }, { _tag: "Linear", to: { x: x + rc, y, z: z0 }, feed: t.feed })
  const dir = rising ? 1 : -1
  let angle = 0
  for (let i = 1; i <= whole; i++) {
    out.push({ _tag: "Arc", to: { x: x + rc, y, z: z0 + dir * i * t.pitch }, center: { x, y }, clockwise: !ccw, feed: t.feed })
  }
  if (frac > 1e-9) {
    angle = (ccw ? 1 : -1) * frac * 2 * Math.PI
    out.push({ _tag: "Arc", to: at(angle, z0 + dir * t.length), center: { x, y }, clockwise: !ccw, feed: t.feed })
  }
  const last = (out[out.length - 1] as { to: { x: number; y: number } }).to
  out.push({ _tag: "Rapid", to: { x: last.x, y: last.y, z: top } }, { _tag: "Rapid", to: { x, y, z: top } }, { _tag: "Rapid", to: { x, y, z: t.surface + t.secondClearance } })
  return out
}
