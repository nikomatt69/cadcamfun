import type { Vec2 } from "./vec.ts"
import { signedArea } from "./shapes.ts"

/** Triangle indices in the input winding for a simple planar ring. */
export const triangulateRing = (points: ReadonlyArray<Vec2>): ReadonlyArray<readonly [number, number, number]> => {
  const area = signedArea(points)
  if (points.length < 3 || !Number.isFinite(area) || area === 0) throw new RangeError("Profile must have nonzero finite area")
  const sign = Math.sign(area)
  const cross = (a: Vec2, b: Vec2, c: Vec2) => sign * ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  const remaining = points.map((_, index) => index)
  const result: Array<readonly [number, number, number]> = []
  while (remaining.length > 3) {
    let clipped = false
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!
      const b = remaining[i]!
      const c = remaining[(i + 1) % remaining.length]!
      const pa = points[a]!, pb = points[b]!, pc = points[c]!
      if (cross(pa, pb, pc) <= 0) continue
      const occupied = remaining.some((index) => {
        if (index === a || index === b || index === c) return false
        const p = points[index]!
        return cross(pa, pb, p) >= 0 && cross(pb, pc, p) >= 0 && cross(pc, pa, p) >= 0
      })
      if (occupied) continue
      result.push([a, b, c])
      remaining.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) throw new RangeError("Profile must be a simple triangulable ring")
  }
  result.push([remaining[0]!, remaining[1]!, remaining[2]!])
  return result
}
