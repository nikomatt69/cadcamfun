/**
 * Sheet-metal design-for-manufacture rules (spec 47 SM7): the checks a flat-pattern shop applies before a part is nested and bent.
 * Every finding carries the rule id, the measured value, the required one and what to change. The limits are the usual press-brake
 * and punching rules of thumb (T = thickness, R = inside bend radius):
 *
 *   SM-FLANGE-MIN     flange length  >= 4 T + R   (the die needs material to hold)
 *   SM-HOLE-BEND      hole edge to bend line >= 2.5 T + R   (the hole does not stretch)
 *   SM-HOLE-MIN       hole diameter >= T   (punch strength)
 *   SM-HOLE-EDGE      hole edge to part edge >= 2 T
 *   SM-RELIEF-DEPTH   bend relief depth >= T + R
 *   SM-RELIEF-WIDTH   bend relief width >= T
 */
export interface SheetPartSpec {
  readonly thickness: number
  /** Inside bend radius, mm. */
  readonly bendRadius: number
  readonly flanges?: ReadonlyArray<{ readonly id: string; readonly length: number }>
  readonly holes?: ReadonlyArray<{ readonly id: string; readonly diameter: number; readonly distanceToBend?: number; readonly distanceToEdge?: number }>
  readonly reliefs?: ReadonlyArray<{ readonly id: string; readonly depth: number; readonly width: number }>
}

export type SheetRuleId = "SM-FLANGE-MIN" | "SM-HOLE-BEND" | "SM-HOLE-MIN" | "SM-HOLE-EDGE" | "SM-RELIEF-DEPTH" | "SM-RELIEF-WIDTH"

export interface SheetFinding {
  readonly rule: SheetRuleId
  readonly severity: "error"
  readonly feature: string
  readonly measured: number
  readonly required: number
  readonly message: string
}

export interface SheetDfmReport { readonly ok: boolean; readonly findings: ReadonlyArray<SheetFinding>; readonly checked: number }

const EPS = 1e-9
const round = (x: number): number => Math.round(x * 1e4) / 1e4

export const sheetMetalDfm = (part: SheetPartSpec): SheetDfmReport => {
  const { thickness: T, bendRadius: R } = part
  if (!(T > 0) || !(R >= 0)) throw new RangeError("thickness must be positive and bendRadius not negative")
  const findings: SheetFinding[] = []
  let checked = 0
  const check = (rule: SheetRuleId, feature: string, measured: number, required: number, what: string, change: string): void => {
    checked++
    if (measured < required - EPS) findings.push({ rule, severity: "error", feature, measured, required, message: `${what} is ${round(measured)} mm, at least ${round(required)} mm is needed: ${change}` })
  }
  for (const f of part.flanges ?? []) check("SM-FLANGE-MIN", f.id, f.length, 4 * T + R, `Flange '${f.id}'`, "lengthen the flange or reduce the bend radius")
  for (const h of part.holes ?? []) {
    check("SM-HOLE-MIN", h.id, h.diameter, T, `Hole '${h.id}' diameter`, "enlarge the hole or drill it instead of punching")
    if (h.distanceToBend !== undefined) check("SM-HOLE-BEND", h.id, h.distanceToBend, 2.5 * T + R, `Hole '${h.id}' to the bend line`, "move the hole away from the bend")
    if (h.distanceToEdge !== undefined) check("SM-HOLE-EDGE", h.id, h.distanceToEdge, 2 * T, `Hole '${h.id}' to the edge`, "move the hole inward")
  }
  for (const r of part.reliefs ?? []) {
    check("SM-RELIEF-DEPTH", r.id, r.depth, T + R, `Relief '${r.id}' depth`, "deepen the relief past the bend radius")
    check("SM-RELIEF-WIDTH", r.id, r.width, T, `Relief '${r.id}' width`, "widen the relief")
  }
  return { ok: findings.length === 0, findings, checked }
}
