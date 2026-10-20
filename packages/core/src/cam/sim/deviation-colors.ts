/**
 * The colours of the stock compared with the part (spec 32 §4.5, E3), one per column of the height field: red where the
 * program cut below the finished surface (a gouge), green within the tolerance, cyan to deep blue as material is left above
 * it (up to `excessRange` mm, beyond which it stays blue). Same cells and tolerance as the verifier's numbers.
 */
import type { DeviationResult } from "../verify/deviation.ts"

export const DEVIATION_COLORS = { gouge: 0xef4444, ok: 0x22c55e, excessLow: 0x22d3ee, excessHigh: 0x1d4ed8 } as const

const rgb = (c: number): readonly [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]

/** Writes r g b per column into `out` (length 3 × columns). */
export const deviationColors = (result: DeviationResult, tolerance: number, out: Float32Array, excessRange = 2): void => {
  const gouge = rgb(DEVIATION_COLORS.gouge), ok = rgb(DEVIATION_COLORS.ok), lo = rgb(DEVIATION_COLORS.excessLow), hi = rgb(DEVIATION_COLORS.excessHigh)
  for (let k = 0; k < result.deviation.length; k++) {
    let c: readonly [number, number, number]
    if (result.gougeCells[k] === 1) c = gouge
    else if (result.uncutCells[k] !== 1) c = ok
    else {
      const t = Math.max(0, Math.min(1, (result.deviation[k]! - tolerance) / Math.max(1e-9, excessRange)))
      c = [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]
    }
    out[k * 3] = c[0]; out[k * 3 + 1] = c[1]; out[k * 3 + 2] = c[2]
  }
}
