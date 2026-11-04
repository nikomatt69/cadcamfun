/**
 * Process physics beyond the per-move load (spec 61 Z4 to Z6): regenerative stability lobes, Taylor tool life and the
 * calibration record that decides whether a prediction may be called calibrated.
 *
 * Everything here is `uncalibrated` unless a `ProcessCalibration` covers the machine, tool and material and the cut lies inside the
 * record's validity range. The bundled Taylor constants are handbook-class starting values, not a supplier's data. A stability result
 * from an estimated transfer function is `indicative` and never a pass; only a measured FRF yields `measured`.
 *
 * Units: mm, N, s, Hz, rpm, minutes for tool life, Vc in m/min.
 */
import { Schema } from "effect"
import { deflection } from "./cutting-data.ts"
import type { Cutter, ToolMaterial } from "./cutters.ts"
import type { IsoGroup } from "./materials.ts"

// ---------------------------------------------------------------- Z4 stability lobes

/** One flexible mode of the tool tip as measured (or assumed): natural frequency, damping ratio, stiffness. */
export interface FrfMode {
  /** Natural frequency, Hz. */
  readonly naturalHz: number
  /** Damping ratio (dimensionless, 0.005 to 0.1 for tool assemblies). */
  readonly zeta: number
  /** Modal stiffness at the tip, N/mm. */
  readonly stiffness: number
}

export interface StabilityRequest {
  readonly mode: FrfMode
  /** Specific cutting stiffness, N/mm² (the Kienzle `kc` of the cut). */
  readonly ks: number
  /** Number of teeth. */
  readonly flutes: number
  /** Directional factor of the radial immersion (1 for a slot is a conservative bound; default 1). */
  readonly directional?: number
  /** Lobes to compute per branch (default 4). */
  readonly lobes?: number
  /** Spindle speed window to report, rpm (default 1000 to 24000). */
  readonly rpmRange?: readonly [number, number]
  /** Where the transfer function came from: a measurement the user supplied, or the stepped-cantilever estimate. */
  readonly source: "measured" | "estimate"
}

export interface LobePoint {
  readonly rpm: number
  /** Limiting axial depth at that speed, mm. */
  readonly aLim: number
  /** Lobe number k (0 is the highest-speed lobe). */
  readonly lobe: number
}

export interface StabilityResult {
  /** `measured`: from a user-supplied FRF. `indicative`: from the estimate; never a pass. */
  readonly status: "measured" | "indicative"
  /** Limiting depth below which the cut is stable at every speed, mm: 1 / (2 Ks |Re G|min). */
  readonly aLimMin: number
  /** Chatter frequency at the minimum, Hz. */
  readonly chatterHz: number
  readonly curve: ReadonlyArray<LobePoint>
  /** Spindle speed bands (rpm) around the lobe tips where the limit is at least twice the minimum. */
  readonly windows: ReadonlyArray<{ readonly fromRpm: number; readonly toRpm: number; readonly aLim: number }>
  readonly calibrated: false
  readonly note: string
}

/** Real and imaginary part of the receptance of one mode at frequency ratio r = f / fn, in mm/N. */
export const receptance = (mode: FrfMode, r: number): { readonly re: number; readonly im: number } => {
  const a = 1 - r * r
  const b = 2 * mode.zeta * r
  const den = mode.stiffness * (a * a + b * b)
  return { re: a / den, im: -b / den }
}

/** The most negative real part of the receptance: -1 / (4 k zeta (1 + zeta)) at r² = 1 + 2 zeta. */
export const minRealReceptance = (mode: FrfMode): number => -1 / (4 * mode.stiffness * mode.zeta * (1 + mode.zeta))

/**
 * Single-degree-of-freedom regenerative chatter (Tlusty / Altintas). For each frequency where Re G < 0:
 * a_lim = -1 / (2 Ks Re G), phase ε = π - 2 atan(Im/Re), spindle speed n = 60 f / (N (k + ε / 2π)).
 */
export const stabilityLobes = (req: StabilityRequest): StabilityResult => {
  const { mode } = req
  const ks = req.ks * (req.directional ?? 1)
  const lobes = req.lobes ?? 4
  const [lo, hi] = req.rpmRange ?? [1000, 24000]
  const curve: LobePoint[] = []
  const steps = 400
  const rMax = 1 + 8 * mode.zeta + 0.15
  for (let i = 0; i <= steps; i++) {
    const r = Math.sqrt(1 + 2 * mode.zeta) * (1 + ((rMax - Math.sqrt(1 + 2 * mode.zeta)) / Math.sqrt(1 + 2 * mode.zeta)) * (i / steps))
    const g = receptance(mode, r)
    if (g.re >= 0) continue
    const aLim = -1 / (2 * ks * g.re)
    const eps = Math.PI - 2 * Math.atan(g.im / g.re)
    const f = r * mode.naturalHz
    for (let k = 0; k < lobes; k++) {
      const rpm = (60 * f) / (req.flutes * (k + eps / (2 * Math.PI)))
      if (rpm >= lo && rpm <= hi) curve.push({ rpm, aLim, lobe: k })
    }
  }
  curve.sort((a, b) => a.rpm - b.rpm)
  const g0 = minRealReceptance(mode)
  const aLimMin = -1 / (2 * ks * g0)
  const chatterHz = Math.sqrt(1 + 2 * mode.zeta) * mode.naturalHz
  const windows: { fromRpm: number; toRpm: number; aLim: number }[] = []
  let open: { fromRpm: number; toRpm: number; aLim: number } | undefined
  for (const p of curve) {
    if (p.aLim >= 2 * aLimMin) {
      if (open === undefined) open = { fromRpm: p.rpm, toRpm: p.rpm, aLim: p.aLim }
      else open = { fromRpm: open.fromRpm, toRpm: p.rpm, aLim: Math.max(open.aLim, p.aLim) }
    } else if (open !== undefined) {
      windows.push(open)
      open = undefined
    }
  }
  if (open !== undefined) windows.push(open)
  return {
    status: req.source === "measured" ? "measured" : "indicative",
    aLimMin,
    chatterHz,
    curve,
    windows,
    calibrated: false,
    note: req.source === "measured"
      ? "Single-degree-of-freedom model from the supplied transfer function; one mode, constant cutting stiffness, no process damping."
      : "Indicative only: the transfer function is estimated from the stepped-cantilever stiffness and an assumed damping ratio, not measured. It never passes a program."
  }
}

const TOOL_DENSITY_G_CM3: Readonly<Record<ToolMaterial, number>> = { hss: 8.1, "hss-co": 8.2, carbide: 14.5, pcd: 14.5 }
export const ESTIMATED_DAMPING: { readonly low: number; readonly mid: number; readonly high: number } = { low: 0.02, mid: 0.03, high: 0.05 }

/** First mode of the tool as a cantilever: stiffness from the stepped deflection, effective mass 0.2357 of the shank rod. */
export const estimateToolMode = (cutter: Cutter, zeta: number = ESTIMATED_DAMPING.mid): FrfMode => {
  const stiffness = 1 / deflection(cutter, 1)
  const rho = TOOL_DENSITY_G_CM3[cutter.material] * 1e-6 // kg/mm³
  const area = (Math.PI * cutter.shankDiameter * cutter.shankDiameter) / 4
  const mass = 0.2357 * rho * area * cutter.stickout // kg
  // k in N/mm = 1000 N/m; m in kg
  const naturalHz = Math.sqrt((stiffness * 1000) / mass) / (2 * Math.PI)
  return { naturalHz, zeta, stiffness }
}

/** Stability of a tool whose transfer function is estimated; the result is `indicative`. */
export const estimateStability = (cutter: Cutter, ks: number, options: { readonly zeta?: number; readonly directional?: number; readonly rpmRange?: readonly [number, number] } = {}): StabilityResult =>
  stabilityLobes({ mode: estimateToolMode(cutter, options.zeta), ks, flutes: cutter.flutes, directional: options.directional, rpmRange: options.rpmRange, source: "estimate" })

// ---------------------------------------------------------------- Z5 tool life

/** Taylor V T^n = C: V in m/min, T in minutes, C the speed for one minute of life. */
export interface TaylorConstants {
  readonly n: number
  readonly c: number
  readonly source: "table" | "request"
  readonly calibrated: false
}

/** Handbook-class starting values per tool material and ISO group; flagged `uncalibrated` wherever they are used. */
const TAYLOR_TABLE: Readonly<Record<ToolMaterial, Readonly<Partial<Record<IsoGroup, readonly [number, number]>>>>> = {
  hss: { P: [0.125, 70], M: [0.12, 45], K: [0.15, 60], N: [0.2, 300], S: [0.1, 20], H: [0.08, 25] },
  "hss-co": { P: [0.13, 90], M: [0.12, 60], K: [0.16, 80], N: [0.2, 350], S: [0.1, 28], H: [0.08, 30] },
  carbide: { P: [0.25, 420], M: [0.22, 280], K: [0.28, 480], N: [0.3, 1400], S: [0.18, 110], H: [0.2, 190] },
  pcd: { P: [0.3, 500], M: [0.3, 350], K: [0.3, 600], N: [0.4, 4000], S: [0.2, 150], H: [0.2, 250] }
}
export const TAYLOR_BASIS = "Handbook-class starting values for V·T^n = C, not a supplier's data and not calibrated to this machine"

export const taylorFor = (toolMaterial: ToolMaterial, iso: IsoGroup, override?: { readonly n: number; readonly c: number }): TaylorConstants => {
  if (override !== undefined) {
    if (!(override.n > 0 && override.n < 1) || !(override.c > 0)) throw new RangeError("Taylor constants need 0 < n < 1 and C > 0")
    return { n: override.n, c: override.c, source: "request", calibrated: false }
  }
  const row = TAYLOR_TABLE[toolMaterial][iso] ?? TAYLOR_TABLE[toolMaterial].P!
  return { n: row[0], c: row[1], source: "table", calibrated: false }
}

/** Tool life in minutes at cutting speed `vc` (m/min): T = (C / V)^(1/n). */
export const toolLifeMinutes = (t: TaylorConstants, vc: number): number => Math.pow(t.c / Math.max(vc, 1e-9), 1 / t.n)

/**
 * Wear weight of a cut from its load ratio (load over the limit, 1 = at the limit): linear, clamped to 0.5 to 2, so a light cut
 * wears less than the nominal one, a cut over the limit wears more, and the weight never decreases with load.
 */
export const wearFactor = (loadRatio: number | undefined): number => (loadRatio === undefined ? 1 : Math.min(2, Math.max(0.5, loadRatio)))

export interface ToolUse {
  readonly operation: string
  readonly tool: number
  /** Cutting speed, m/min. */
  readonly vc: number
  /** Time in cut, minutes. */
  readonly minutes: number
  /** Peak load over the limit of the operation, when the move loads are known. */
  readonly loadRatio?: number
}

export interface ToolLifeEntry {
  readonly tool: number
  /** Fraction of the life used by the whole program (1 = worn out). */
  readonly lifeUsed: number
  readonly perOperation: ReadonlyArray<{ readonly operation: string; readonly lifeUsed: number }>
  /** `ok`; `change` when a tool change before the named operation keeps every segment inside the life; `exceeded` when one operation alone exceeds it. */
  readonly status: "ok" | "change" | "exceeded"
  /** Operations before which the tool must be changed (status `change`). */
  readonly changeBefore: ReadonlyArray<string>
  readonly calibrated: false
}

/**
 * Life used per tool across the program, in order. A tool crossing `limit` (default 0.8, a reserve against the scatter of Taylor data)
 * gets a change before the operation that would cross it; an operation that exceeds the limit on its own is reported, never run silently.
 */
export const planToolLife = (uses: ReadonlyArray<ToolUse>, taylor: (tool: number) => TaylorConstants, limit = 0.8): ReadonlyArray<ToolLifeEntry> => {
  const tools = [...new Set(uses.map((u) => u.tool))]
  return tools.map((tool) => {
    const t = taylor(tool)
    const own = uses.filter((u) => u.tool === tool)
    const per = own.map((u) => ({ operation: u.operation, lifeUsed: (u.minutes / toolLifeMinutes(t, u.vc)) * wearFactor(u.loadRatio) }))
    const changeBefore: string[] = []
    let running = 0
    let exceeded = false
    per.forEach((p, i) => {
      if (p.lifeUsed > limit) {
        exceeded = true
        return
      }
      if (running + p.lifeUsed > limit && i > 0) {
        changeBefore.push(p.operation)
        running = 0
      }
      running += p.lifeUsed
    })
    const total = per.reduce((s, p) => s + p.lifeUsed, 0)
    return { tool, lifeUsed: total, perOperation: per, status: exceeded ? "exceeded" : changeBefore.length > 0 ? "change" : "ok", changeBefore, calibrated: false } satisfies ToolLifeEntry
  })
}

// ---------------------------------------------------------------- Z6 calibration

const Range = Schema.Tuple([Schema.Finite, Schema.Finite])

/** A measurement that pins a model prediction: `quantity` predicted by the model at the record's reference cut, and what was measured. */
export const ProcessCalibrationSchema = Schema.Struct({
  id: Schema.String,
  machine: Schema.String,
  tool: Schema.String,
  material: Schema.String,
  date: Schema.String,
  source: Schema.Literals(["measured", "vendor", "estimate"]),
  quantity: Schema.Literals(["force", "power", "toolLife", "frf"]),
  predicted: Schema.Finite.check(Schema.isGreaterThan(0)),
  measured: Schema.Finite.check(Schema.isGreaterThan(0)),
  /** Relative tolerance the record stands for (0.1 = 10 %). */
  tolerance: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  validity: Schema.Struct({
    diameter: Schema.optionalKey(Range),
    ae: Schema.optionalKey(Range),
    ap: Schema.optionalKey(Range),
    rpm: Schema.optionalKey(Range),
    feed: Schema.optionalKey(Range)
  })
})
export type ProcessCalibration = typeof ProcessCalibrationSchema.Type

export interface CalibrationContext {
  readonly machine: string
  readonly tool: string
  readonly material: string
  readonly quantity: ProcessCalibration["quantity"]
  readonly diameter?: number
  readonly ae?: number
  readonly ap?: number
  readonly rpm?: number
  readonly feed?: number
}

export interface CalibratedValue {
  readonly value: number
  readonly calibrated: boolean
  readonly recordId?: string
  readonly tolerance?: number
  readonly reason: string
}

const within = (range: readonly [number, number] | undefined, v: number | undefined): boolean => range === undefined || (v !== undefined && v >= range[0] && v <= range[1])

/**
 * Scale a prediction by the record that covers the context so the recorded measurement is reproduced; outside every record's
 * machine, tool, material or validity range the prediction is returned unchanged and `calibrated: false`.
 */
export const applyCalibration = (prediction: number, records: ReadonlyArray<ProcessCalibration>, ctx: CalibrationContext): CalibratedValue => {
  for (const r of records) {
    if (r.machine !== ctx.machine || r.tool !== ctx.tool || r.material !== ctx.material || r.quantity !== ctx.quantity) continue
    const v = r.validity
    if (!within(v.diameter, ctx.diameter) || !within(v.ae, ctx.ae) || !within(v.ap, ctx.ap) || !within(v.rpm, ctx.rpm) || !within(v.feed, ctx.feed)) continue
    return { value: (prediction * r.measured) / r.predicted, calibrated: true, recordId: r.id, tolerance: r.tolerance, reason: `Scaled by record ${r.id} (${r.source}, ${r.date})` }
  }
  return { value: prediction, calibrated: false, reason: records.length === 0 ? "No calibration record: uncalibrated" : "Outside every calibration record's machine, tool, material or validity range: uncalibrated" }
}
