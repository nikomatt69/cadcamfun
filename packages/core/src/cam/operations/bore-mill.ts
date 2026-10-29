/**
 * The path of the tool centre under Heidenhain cycle 208 BORE MILLING (spec 69 G4c.2), as moves: a helix of pitch `pitch` at the
 * radius that leaves the nominal diameter (first at the roughing diameter when it is given), a full circle at the bottom, and out
 * to the 2nd set-up clearance over the centre. The post writes the cycle in place of these moves; every other post, the viewer and
 * the verifier use them. `testing/heidenhain.ts` reads the cycle back as the same path.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"

export interface BoreMill {
  readonly center: { readonly x: number; readonly y: number }
  /** Work Z of the surface (Q203) and the distances above it: set-up clearance (Q200) and 2nd set-up clearance (Q204). */
  readonly surface: number
  readonly clearance: number
  readonly secondClearance: number
  /** Work Z of the bottom of the bore. */
  readonly bottom: number
  readonly toolRadius: number
  /** Nominal diameter (Q335) and the diameter to rough to first (Q342, 0 = none). */
  readonly diameter: number
  readonly roughDiameter?: number
  /** Infeed per helix turn (Q334), mm. */
  readonly pitch: number
  readonly feed: number
  /** Climb milling (Q351 = +1) turns counter-clockwise inside a bore. */
  readonly climb: boolean
}

export const boreMillMoves = (b: BoreMill): Move[] => {
  const radii: number[] = []
  if ((b.roughDiameter ?? 0) > 0 && b.roughDiameter! < b.diameter - 1e-9) radii.push(b.roughDiameter! / 2 - b.toolRadius)
  radii.push(b.diameter / 2 - b.toolRadius)
  if (radii.some((r) => !(r > 1e-9))) throw new RangeError(`A Ø${b.diameter} bore needs a cutter smaller than that (radius ${b.toolRadius})`)
  const { x, y } = b.center
  const top = b.surface + b.clearance
  const out: Move[] = [{ _tag: "Rapid", to: { x, y, z: top } }]
  const turns = Math.max(1, Math.ceil((b.surface - b.bottom) / b.pitch - 1e-9))
  for (const r of radii) {
    const start: Vec3 = { x: x + r, y, z: b.surface }
    out.push({ _tag: "Rapid", to: { x: x + r, y, z: top } }, { _tag: "Linear", to: start, feed: b.feed })
    for (let i = 1; i <= turns; i++) {
      const z = i === turns ? b.bottom : b.surface - ((b.surface - b.bottom) * i) / turns
      out.push({ _tag: "Arc", to: { x: x + r, y, z }, center: { x, y }, clockwise: !b.climb, feed: b.feed })
    }
    out.push({ _tag: "Arc", to: { x: x + r, y, z: b.bottom }, center: { x, y }, clockwise: !b.climb, feed: b.feed }, { _tag: "Rapid", to: { x: x + r, y, z: top } })
  }
  out.push({ _tag: "Rapid", to: { x, y, z: top } }, { _tag: "Rapid", to: { x, y, z: b.surface + b.secondClearance } })
  return out
}
