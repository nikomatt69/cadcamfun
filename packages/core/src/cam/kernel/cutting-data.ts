/**
 * Cutting data of the CAM kernel: spindle speed, feed, depths, entry and coolant for one cutter in one material doing one
 * kind of cut, limited by the cutter and the machine, with the physics that justify them.
 *
 *   Vc  (material x tool material x coating x cut)       ->  n = 1000 Vc / (π D_eff), clamped to the spindle and the cutter
 *   fz  (material, scaled with D, rigidity, cut)          ->  chip thinning: fz = h_ex / sin(φ_e/…) for ae < D/2
 *   ap, ae (material limits per cut, flute length, depth)
 *   vf = n z fz, clamped to the machine feed
 *   Kienzle: h_m = 2 ae fz sinκ / (D φ),  kc = kc11 h_m^-mc,  Pc = ap ae vf kc / 6e7,  Mc = 30e3 Pc / (π n),  Fc = 6e4 Pc / Vc
 *   tool deflection: stepped cantilever, δ = F/(3E) [Lf³/I_f + (L³ - Lf³)/I_s]
 *
 * When power, torque or deflection exceed the machine or the quality limit, the axial depth is reduced first (it is
 * linear in the load), then the feed. Every adjustment is reported in `limitedBy`; a value that cannot be met is a
 * warning, never a silent change.
 */
import type { Coolant } from "../ir.ts"
import { pointLength, type Coating, type Cutter, type ToolMaterial } from "./cutters.ts"
import type { IsoGroup, WorkpieceMaterial } from "./materials.ts"

export type CutClass =
  | "face"
  | "slot"
  | "rough-side"
  | "adaptive"
  | "finish-wall"
  | "finish-floor"
  | "finish-3d"
  | "drill"
  | "spot"
  | "chamfer"
  | "engrave"
  | "thread-mill"
  | "tap"
  | "ream"

export type Rigidity = "hobby" | "light" | "standard" | "heavy"

export interface MachineLimits {
  readonly maxRpm: number
  readonly minRpm?: number
  /** Highest programmable cutting feed, mm/min. */
  readonly maxFeed: number
  /** Spindle power, kW; `undefined` = not checked. */
  readonly powerKw?: number
  /**
   * The power available by speed band: the spindle holds `kW` up to `rpm`, and the next band takes over above it. A real
   * spindle is constant-power to its base speed and constant-torque above it, so a single number overstates the high end.
   * `powerKw` stays the flat ceiling the configuration declares; the curve narrows it where the machine says so.
   */
  readonly powerCurve?: ReadonlyArray<{ readonly rpm: number; readonly kW: number }>
  /** Spindle torque, N·m; `undefined` = not checked. */
  readonly torqueNm?: number
  readonly rigidity?: Rigidity
  /** Spindle efficiency between the motor and the cut (default 0.8). */
  readonly efficiency?: number
}

/**
 * The power the spindle can deliver at `rpm`, kW: the curve read at that speed, bounded by the flat ceiling.
 *
 * The curve is the power the spindle holds at the speeds it names, and between two named speeds it falls the way a
 * constant-torque spindle does: linearly, because the power is what the torque divided by the speed gives. A speed below
 * the first point takes the first point's power, a speed above the last takes the last one's. The flat `powerKw` is the
 * rated power: the curve never raises it.
 */
export const powerLimitAt = (machine: MachineLimits, rpm: number): number | undefined => {
  const curve = machine.powerCurve
  if (curve === undefined || curve.length === 0) return machine.powerKw
  const first = curve[0]!
  if (curve.length === 1) return Math.min(machine.powerKw ?? first.kW, first.kW)
  if (rpm <= first.rpm) return Math.min(machine.powerKw ?? first.kW, first.kW)
  for (let i = 1; i < curve.length; i++) {
    const low = curve[i - 1]!
    const high = curve[i]!
    if (rpm <= high.rpm) {
      const span = high.rpm - low.rpm
      const kW = span > 0 ? low.kW + ((high.kW - low.kW) * (rpm - low.rpm)) / span : high.kW
      return Math.min(machine.powerKw ?? kW, kW)
    }
  }
  const last = curve[curve.length - 1]!
  return Math.min(machine.powerKw ?? last.kW, last.kW)
}

export interface CuttingRequest {
  readonly material: WorkpieceMaterial
  readonly cutter: Cutter
  readonly cut: CutClass
  readonly machine: MachineLimits
  /** Total depth the operation must reach, mm; the axial depth per pass never exceeds it. */
  readonly depth?: number
  /** Radial engagement, mm (wall allowance of a finish, a forced stepover). */
  readonly ae?: number
  /** Axial depth per pass, mm. */
  readonly ap?: number
  /** Cusp height of a ball-nose finish, mm (default 0.01). */
  readonly scallop?: number
  /** Largest tool deflection, mm (default 0.05 roughing, 0.01 finishing). */
  readonly maxDeflection?: number
}

export interface CuttingData {
  readonly cut: CutClass
  readonly rpm: number
  /** Cutting speed at the effective diameter at `rpm`, m/min. */
  readonly vc: number
  /** Cutting speed the material and the tool call for, m/min. */
  readonly vcRecommended: number
  /** Diameter the speed refers to (a ball or a bull nose cuts on a smaller circle at shallow depth), mm. */
  readonly effectiveDiameter: number
  /** Programmed feed per tooth (drills: per revolution), mm. */
  readonly fz: number
  /** Largest chip the edge actually sees after chip thinning, mm. */
  readonly chipThickness: number
  readonly feed: number
  readonly plungeFeed: number
  readonly ap: number
  readonly ae: number
  /** `ae` as a share of the diameter, percent (1-100), the way the operations take it. */
  readonly stepoverPercent: number
  readonly rampAngle: number
  readonly helixPitch: number
  readonly coolant: Coolant
  /** Drilling only. */
  readonly peck?: number
  readonly chipBreak?: boolean
  readonly feedPerRev?: number
  /** Thread milling only: radial passes. */
  readonly passes?: number
  /** Material removal rate, cm³/min. */
  readonly mrr: number
  readonly powerKw: number
  readonly torqueNm: number
  readonly forceN: number
  readonly deflectionMm: number
  readonly limitedBy: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  /** Limits the cut still exceeds after every reduction (spindle power / torque, deflection): the cut is not feasible as planned. */
  readonly exceeded: ReadonlyArray<string>
  readonly source: string
  /** Where every number comes from: the table row read and the factors applied to it. */
  readonly reference: CuttingReference
}

/**
 * Traceable source of a cutting-data result: the row of the material table (`materials.ts` `MATERIALS`) and the columns
 * read from it, then each factor of this module that scaled them. `vc = columns.vc × factors.coating × factors.cutSpeed`,
 * `fz = columns.fz10 × factors.diameterScale × factors.rigidityFeed × factors.toolMaterialFeed × factors.cutFeed` (before
 * chip thinning and the machine / load limits, which `limitedBy` lists).
 */
export interface CuttingReference {
  readonly table: "MATERIALS"
  /** Material id (the row). */
  readonly row: string
  readonly rowName: string
  /** Column name -> value read from the row. */
  readonly columns: Readonly<Record<string, number>>
  /** Factor name -> multiplier applied by the calculation. */
  readonly factors: Readonly<Record<string, number>>
  readonly basis: string
}

export const REFERENCE_BASIS = "Handbook starting values (order of magnitude of Sandvik Coromant, Kennametal and Machinery's Handbook tables), not a supplier's certified data for this cutter"

/** The speed column a tool material reads, its raw value, and the factor `toolSpeed` applies to it. */
const speedRead = (tm: ToolMaterial, mat: WorkpieceMaterial, finish: boolean): { readonly column: string; readonly value: number; readonly factor: number } => {
  const key = finish ? "finish" : "rough"
  const hss = (tm === "hss" || tm === "hss-co") && mat.vcHss !== undefined
  const value = hss ? mat.vcHss![key] : mat.vcCarbide[key]
  return { column: hss ? `vcHss.${key}` : `vcCarbide.${key}`, value, factor: r3(toolSpeed(tm, mat, finish, []) / value) }
}

const FERROUS: ReadonlySet<IsoGroup> = new Set(["P", "M", "K", "S", "H"])

/** Speed factor of a coating in a material (1 = the coating the handbook speed assumes); warnings explain a poor match. */
export const coatingFactor = (coating: Coating, mat: WorkpieceMaterial, warnings: string[]): number => {
  const ferrous = FERROUS.has(mat.iso)
  switch (coating) {
    case "none": return ferrous ? 0.8 : 1
    case "tin": return ferrous ? 0.9 : 0.95
    case "ticn": return ferrous ? 0.95 : 0.95
    case "altin":
    case "alcrn":
      if (mat.family === "aluminium-wrought" || mat.family === "aluminium-cast" || mat.family === "copper") {
        warnings.push(`${coating.toUpperCase()} coating in ${mat.name}: aluminium sticks to it (built-up edge); prefer uncoated, ZrN or DLC`)
        return 0.85
      }
      return 1
    case "zrn":
    case "dlc":
      if (ferrous) { warnings.push(`${coating.toUpperCase()} is a non-ferrous coating; it wears quickly in ${mat.name}`); return 0.8 }
      return coating === "dlc" ? 1.1 : 1.05
    case "diamond":
      if (ferrous) { warnings.push(`Diamond reacts with iron at cutting temperature: unsuitable for ${mat.name}`); return 0.5 }
      return 1.2
  }
}

const toolSpeed = (tm: ToolMaterial, mat: WorkpieceMaterial, finish: boolean, warnings: string[]): number => {
  const carbide = finish ? mat.vcCarbide.finish : mat.vcCarbide.rough
  switch (tm) {
    case "carbide": return carbide
    case "pcd":
      if (mat.iso !== "N") { warnings.push(`PCD is for non-ferrous materials, not ${mat.name}: carbide speeds used`); return carbide }
      return carbide * 2
    case "hss":
    case "hss-co": {
      const hss = mat.vcHss
      if (hss === undefined) { warnings.push(`HSS is not suitable for ${mat.name}: use carbide (speed set to 15% of carbide)`); return carbide * 0.15 }
      return (finish ? hss.finish : hss.rough) * (tm === "hss-co" ? 1.1 : 1)
    }
  }
}

const FINISH: ReadonlySet<CutClass> = new Set(["finish-wall", "finish-floor", "finish-3d", "engrave"])

/** How well a cutter suits a material, 0-1: its tool material and coating against the handbook assumption. */
export const suitability = (c: Cutter, mat: WorkpieceMaterial): number => {
  const sink: string[] = []
  const coating = coatingFactor(c.coating, mat, sink)
  const tm = c.material === "carbide" || c.material === "pcd" ? 1 : mat.vcHss === undefined ? 0.1 : 0.6
  return Math.min(1, coating) * tm * (sink.length > 0 ? 0.8 : 1)
}

/** Speed factor of each kind of cut relative to the material's rough / finish speed. */
const CUT_SPEED: Readonly<Record<CutClass, number>> = {
  face: 1, slot: 0.85, "rough-side": 1, adaptive: 1.2, "finish-wall": 1, "finish-floor": 1, "finish-3d": 1,
  drill: 1, spot: 0.8, chamfer: 0.8, engrave: 0.8, "thread-mill": 0.7, tap: 0.45, ream: 0.6
}

/** Feed-per-tooth factor of each kind of cut relative to side milling. */
const CUT_FEED: Readonly<Record<CutClass, number>> = {
  face: 1.5, slot: 0.85, "rough-side": 1, adaptive: 1, "finish-wall": 0.8, "finish-floor": 0.8, "finish-3d": 0.7,
  drill: 1, spot: 0.5, chamfer: 0.6, engrave: 0.4, "thread-mill": 0.5, tap: 1, ream: 2.5
}

const RIGIDITY: Readonly<Record<Rigidity, { readonly depth: number; readonly feed: number }>> = {
  hobby: { depth: 0.5, feed: 0.8 },
  light: { depth: 0.75, feed: 0.9 },
  standard: { depth: 1, feed: 1 },
  heavy: { depth: 1.15, feed: 1 }
}

/** Young's modulus of the cutter body, N/mm². */
const youngModulus = (tm: ToolMaterial): number => (tm === "hss" || tm === "hss-co" ? 210_000 : 580_000)

/** Feed per tooth of a cutter of diameter `d` (side milling, ae ≤ D/2), mm. Grows almost linearly for small tools, slower above 10 mm. */
export const baseChipLoad = (mat: WorkpieceMaterial, d: number): number => {
  const scale = d < 10 ? Math.pow(d / 10, 0.9) : Math.pow(Math.min(d, 25) / 10, 0.6)
  return mat.fz10 * scale
}

/** Engagement angle of radial depth `ae` on a cutter of diameter `d`, radians (π for a slot). */
export const engagementAngle = (ae: number, d: number): number => Math.acos(Math.max(-1, Math.min(1, 1 - (2 * Math.min(ae, d)) / d)))

/** Chip-thinning factor: the programmed fz that gives the edge a chip of fz when ae < D/2 (1 at or above D/2). */
export const chipThinning = (ae: number, d: number): number => {
  if (ae >= d / 2) return 1
  const s = Math.sin(engagementAngle(ae, d))
  return s > 1e-9 ? 1 / s : Infinity
}

/** Diameter a ball / bull nose cuts on at axial depth `ap`, mm. */
export const effectiveDiameter = (c: Cutter, ap: number): number => {
  const d = c.diameter
  if (c.kind === "ball") {
    const r = d / 2
    return ap >= r ? d : 2 * Math.sqrt(Math.max(0, ap * (d - ap)))
  }
  if (c.kind === "bull" && c.cornerRadius !== undefined) {
    const rc = c.cornerRadius
    if (ap >= rc) return d
    return d - 2 * rc + 2 * Math.sqrt(Math.max(0, rc * rc - (rc - ap) * (rc - ap)))
  }
  if (c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" || c.kind === "countersink") {
    const half = ((c.angle ?? 90) * Math.PI) / 360
    return Math.min(d, (c.tipDiameter ?? 0) + 2 * ap * Math.tan(half))
  }
  return d
}

/** Spacing of ball-nose passes that leaves cusps of `scallop` mm: s = 2 sqrt(2 R h - h²). */
export const scallopStepover = (radius: number, scallop: number): number => 2 * Math.sqrt(Math.max(0, 2 * radius * scallop - scallop * scallop))

/** Tip deflection of the cutter under `force` N: stepped cantilever, flutes as a core of 0.8 D. */
export const deflection = (c: Cutter, force: number): number => {
  const e = youngModulus(c.material)
  const L = c.stickout
  const lf = Math.min(c.fluteLength, L)
  const iFlute = (Math.PI * Math.pow(0.8 * c.diameter, 4)) / 64
  const iShank = (Math.PI * Math.pow(c.shankDiameter, 4)) / 64
  return (force / (3 * e)) * (Math.pow(lf, 3) / iFlute + (Math.pow(L, 3) - Math.pow(lf, 3)) / iShank)
}

const round = (v: number, step: number): number => Math.round(v / step) * step
const r3 = (v: number): number => Math.round(v * 1000) / 1000

/** Kienzle load of one cut: the specific cutting force `kc`, the mean chip `hm`, power at the cut, spindle torque and tangential force. */
export interface Load { readonly kc: number; readonly hm: number; readonly powerKw: number; readonly torqueNm: number; readonly forceN: number }

/**
 * Kienzle load of a milling cut. One function for the nominal cut (`cuttingData`) and for every move of a program
 * (`engagement.ts` `moveLoads`), so the two cannot drift: the nominal result is the per-move result at constant engagement.
 */
export const millingLoad = (mat: WorkpieceMaterial, c: Cutter, deff: number, ap: number, ae: number, fz: number, feed: number, rpm: number, vc: number): Load => {
  const phi = engagementAngle(ae, deff)
  const sinK = c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" || c.kind === "countersink" ? Math.sin(((c.angle ?? 90) * Math.PI) / 360) : 1
  const hm = phi > 1e-9 ? (2 * Math.min(ae, deff) * fz * sinK) / (deff * phi) : fz
  const kc = mat.kc11 * Math.pow(Math.max(hm, 0.001), -mat.mc)
  const powerKw = (ap * Math.min(ae, deff) * feed * kc) / 60e6
  const torqueNm = rpm > 0 ? (powerKw * 30_000) / (Math.PI * rpm) : 0
  const forceN = vc > 0 ? (60_000 * powerKw) / vc : 0
  return { kc, hm, powerKw, torqueNm, forceN }
}

/** Ramp / helix descent: slope of the material, never steeper than one third of the diameter per turn. */
const entryOf = (mat: WorkpieceMaterial, c: Cutter): { readonly rampAngle: number; readonly helixPitch: number } => {
  const rampAngle = mat.rampAngle
  const helixPitch = Math.max(0.05, Math.min(Math.PI * c.diameter * Math.tan((rampAngle * Math.PI) / 180), c.diameter / 3))
  return { rampAngle, helixPitch: r3(helixPitch) }
}

const clampRpm = (wanted: number, c: Cutter, m: MachineLimits, limitedBy: string[], warnings: string[]): number => {
  let rpm = wanted
  const toolMax = c.maxRpm ?? Infinity
  if (rpm > m.maxRpm || rpm > toolMax) {
    const cap = Math.min(m.maxRpm, toolMax)
    limitedBy.push(cap === m.maxRpm ? "machine spindle speed" : "cutter speed rating")
    warnings.push(`Spindle limited to ${Math.round(cap)} rpm (${Math.round(wanted)} rpm wanted): cutting speed is ${Math.round((cap / wanted) * 100)}% of the recommendation`)
    rpm = cap
  }
  if (m.minRpm !== undefined && rpm < m.minRpm) {
    limitedBy.push("machine minimum spindle speed")
    warnings.push(`Spindle raised to its minimum ${m.minRpm} rpm (${Math.round(wanted)} rpm wanted): the cutting speed is above the recommendation`)
    rpm = m.minRpm
  }
  return Math.max(1, rpm >= 1000 ? round(rpm, 10) : Math.round(rpm))
}

/** Cutting data for a drill or a spot drill. */
const drilling = (req: CuttingRequest, warnings: string[], limitedBy: string[]): CuttingData => {
  const { material: mat, cutter: c, machine: m } = req
  const d = c.diameter
  const speed = toolSpeed(c.material, mat, false, warnings) * coatingFactor(c.coating, mat, warnings)
  const vcRecommended = speed * mat.drillSpeedFactor * CUT_SPEED[req.cut]
  const rigidity = RIGIDITY[m.rigidity ?? "standard"]
  const hss = c.material === "hss" || c.material === "hss-co"
  let feedPerRev = Math.max(0.01, mat.drillFeed10 * Math.pow(Math.min(d, 25) / 10, 0.8) * (hss ? 0.8 : 1) * rigidity.feed * CUT_FEED[req.cut])
  const rpm = clampRpm((1000 * vcRecommended) / (Math.PI * d), c, m, limitedBy, warnings)
  const vc = (Math.PI * d * rpm) / 1000
  let feed = feedPerRev * rpm
  if (feed > m.maxFeed) { limitedBy.push("machine feed"); feed = m.maxFeed; feedPerRev = feed / rpm }
  const depth = req.depth ?? d
  const ratio = depth / d
  let peck: number | undefined
  let chipBreak: boolean | undefined
  if (req.cut === "drill" && (ratio > 3 || (mat.stringyChips && ratio > 2))) {
    peck = r3(Math.max(0.2, mat.peckFactor * d))
    // Chip-breaking pecks keep the cycle short while the flutes still clear the chips; deep holes need full retracts.
    chipBreak = mat.stringyChips && ratio <= 5
  }
  if (req.cut === "drill" && ratio > 10) warnings.push(`Hole depth ${r3(depth)} mm is ${ratio.toFixed(1)} x D: a standard drill reaches about 5-8 x D; use a long-series drill and pilot hole`)
  if (depth + pointLength(c) > c.fluteLength + 1e-9) warnings.push(`Hole depth ${r3(depth)} mm plus the point exceeds the ${c.fluteLength} mm flutes of ${c.name}: chips cannot clear`)
  // Drilling torque from Kienzle with the chip of one lip: h = f/2 sin(κ), κ = half the point angle.
  const kappa = ((c.angle ?? 140) * Math.PI) / 360
  const h = (feedPerRev / 2) * Math.sin(kappa)
  const kc = mat.kc11 * Math.pow(Math.max(h, 0.001), -mat.mc)
  const torqueNm = (d * d * feedPerRev * kc) / 8000
  const powerKw = (torqueNm * 2 * Math.PI * rpm) / 60_000
  const powerLimit = powerLimitAt(m, rpm)
  const exceeded: string[] = []
  if (powerLimit !== undefined && powerKw / (m.efficiency ?? 0.8) > powerLimit) {
    exceeded.push(`Drilling needs ${(powerKw / (m.efficiency ?? 0.8)).toFixed(2)} kW, the spindle has ${powerLimit} kW at ${rpm} rpm`)
  }
  if (m.torqueNm !== undefined && torqueNm > m.torqueNm) exceeded.push(`Drilling needs ${torqueNm.toFixed(1)} N·m, the spindle gives ${m.torqueNm} N·m at low speed`)
  const thrust = 0.5 * kc * (feedPerRev / 2) * d * Math.sin(kappa)
  const { rampAngle, helixPitch } = entryOf(mat, c)
  return {
    cut: req.cut, rpm, vc: r3(vc), vcRecommended: r3(vcRecommended), effectiveDiameter: d, fz: r3(feedPerRev / Math.max(1, c.flutes)), chipThickness: r3(h),
    feed: Math.round(feed), plungeFeed: Math.round(feed), ap: r3(depth), ae: d, stepoverPercent: 100, rampAngle, helixPitch, coolant: mat.coolant,
    ...(peck !== undefined ? { peck } : {}), ...(chipBreak !== undefined ? { chipBreak } : {}), feedPerRev: r3(feedPerRev),
    mrr: r3((Math.PI * d * d * feed) / 4 / 1000), powerKw: r3(powerKw), torqueNm: r3(torqueNm), forceN: Math.round(thrust), deflectionMm: 0,
    limitedBy, warnings, exceeded, source: `${mat.name}: drill feed ${mat.drillFeed10} mm/rev at Ø10, Vc ${Math.round(vcRecommended)} m/min (handbook starting values)`,
    reference: {
      table: "MATERIALS", row: mat.id, rowName: mat.name,
      columns: { [speedRead(c.material, mat, false).column]: speedRead(c.material, mat, false).value, drillSpeedFactor: mat.drillSpeedFactor, drillFeed10: mat.drillFeed10, kc11: mat.kc11, mc: mat.mc, peckFactor: mat.peckFactor },
      factors: { toolMaterialSpeed: speedRead(c.material, mat, false).factor, coating: r3(coatingFactor(c.coating, mat, [])), cutSpeed: CUT_SPEED[req.cut], cutFeed: CUT_FEED[req.cut], diameterScale: r3(Math.pow(Math.min(d, 25) / 10, 0.8)), rigidityFeed: rigidity.feed, toolMaterialFeed: hss ? 0.8 : 1 },
      basis: REFERENCE_BASIS
    }
  }
}

/**
 * Cutting data for a rigid tap or a reamer: speed from the material's drilling speed (`CUT_SPEED`: taps 45 %, reamers 60 %), feed
 * per revolution the pitch (a tap must advance exactly one pitch per turn) or 2.5 x the drilling feed (a reamer's many flutes).
 * Torque: tapping M = kc P² d / 8000 N·m with kc at the chip of one lead tooth (thread depth 0.6134 P over a 2.5-pitch lead);
 * reaming M = kc ae f d / 2000 with the radial allowance ae the drill left.
 */
const holeFinishing = (req: CuttingRequest, warnings: string[], limitedBy: string[]): CuttingData => {
  const { material: mat, cutter: c, machine: m } = req
  const d = c.diameter
  const tapping = req.cut === "tap"
  const pitch = c.pitch ?? 1
  const speed = toolSpeed(c.material, mat, false, warnings) * coatingFactor(c.coating, mat, warnings)
  const vcRecommended = speed * mat.drillSpeedFactor * CUT_SPEED[req.cut]
  const rigidity = RIGIDITY[m.rigidity ?? "standard"]
  const hss = c.material === "hss" || c.material === "hss-co"
  let rpm = clampRpm((1000 * vcRecommended) / (Math.PI * d), c, m, limitedBy, warnings)
  let feedPerRev = tapping ? pitch : Math.max(0.02, mat.drillFeed10 * Math.pow(Math.min(d, 25) / 10, 0.8) * (hss ? 0.8 : 1) * rigidity.feed * CUT_FEED[req.cut])
  let feed = feedPerRev * rpm
  if (feed > m.maxFeed) {
    limitedBy.push("machine feed")
    // A tap keeps one pitch per revolution: the spindle slows down instead.
    if (tapping) { rpm = Math.max(1, Math.floor(m.maxFeed / pitch)); feed = pitch * rpm }
    else { feed = m.maxFeed; feedPerRev = feed / rpm }
  }
  const vc = (Math.PI * d * rpm) / 1000
  const depth = req.depth ?? d
  const ae = tapping ? 0.6134 * pitch : Math.max(0.05, (d - Math.round((d - (d <= 6 ? 0.2 : 0.3)) * 10) / 10) / 2)
  const h = tapping ? (0.6134 * pitch) / (2.5 * Math.max(1, c.flutes)) : feedPerRev / Math.max(1, c.flutes)
  const kc = mat.kc11 * Math.pow(Math.max(h, 0.001), -mat.mc)
  const torqueNm = tapping ? (kc * pitch * pitch * d) / 8000 : (kc * ae * feedPerRev * d) / 2000
  const powerKw = (torqueNm * 2 * Math.PI * rpm) / 60_000
  const exceeded: string[] = []
  const powerLimit = powerLimitAt(m, rpm)
  if (powerLimit !== undefined && powerKw / (m.efficiency ?? 0.8) > powerLimit) {
    exceeded.push(`${tapping ? "Tapping" : "Reaming"} needs ${(powerKw / (m.efficiency ?? 0.8)).toFixed(2)} kW, the spindle has ${powerLimit} kW at ${rpm} rpm`)
  }
  if (m.torqueNm !== undefined && torqueNm > m.torqueNm) exceeded.push(`${tapping ? "Tapping" : "Reaming"} needs ${torqueNm.toFixed(1)} N·m, the spindle gives ${m.torqueNm} N·m at low speed`)
  if (depth > c.fluteLength + 1e-9) warnings.push(`${tapping ? "Thread" : "Bore"} depth ${r3(depth)} mm exceeds the ${c.fluteLength} mm flutes of ${c.name}`)
  if (tapping && mat.iso === "H") warnings.push(`Tapping ${mat.name} breaks taps: mill the thread instead`)
  if (tapping && mat.stringyChips) warnings.push(`${mat.name} makes long chips: use a spiral-flute tap in blind holes`)
  return {
    cut: req.cut, rpm, vc: r3(vc), vcRecommended: r3(vcRecommended), effectiveDiameter: d, fz: r3(feedPerRev / Math.max(1, c.flutes)), chipThickness: r3(h),
    feed: Math.round(feed * 1000) / 1000, plungeFeed: Math.round(feed * 1000) / 1000, ap: r3(depth), ae: r3(ae), stepoverPercent: 100, rampAngle: mat.rampAngle, helixPitch: r3(pitch),
    coolant: mat.coolant === "off" ? "flood" : mat.coolant, feedPerRev: r3(feedPerRev),
    mrr: r3((Math.PI * d * ae * feed) / 1000), powerKw: r3(powerKw), torqueNm: r3(torqueNm), forceN: Math.round((2000 * torqueNm) / d), deflectionMm: 0,
    limitedBy, warnings, exceeded,
    source: `${mat.name}: ${tapping ? `tap at one pitch (${pitch} mm) per revolution` : `ream at ${r3(feedPerRev)} mm/rev`}, Vc ${Math.round(vcRecommended)} m/min (handbook starting values)`,
    reference: {
      table: "MATERIALS", row: mat.id, rowName: mat.name,
      columns: { [speedRead(c.material, mat, false).column]: speedRead(c.material, mat, false).value, drillSpeedFactor: mat.drillSpeedFactor, drillFeed10: mat.drillFeed10, kc11: mat.kc11, mc: mat.mc },
      factors: { toolMaterialSpeed: speedRead(c.material, mat, false).factor, coating: r3(coatingFactor(c.coating, mat, [])), cutSpeed: CUT_SPEED[req.cut], cutFeed: CUT_FEED[req.cut], rigidityFeed: rigidity.feed, toolMaterialFeed: hss ? 0.8 : 1 },
      basis: REFERENCE_BASIS
    }
  }
}

/** Recommended cutting data; deterministic and pure. */
export const cuttingData = (req: CuttingRequest): CuttingData => {
  const warnings: string[] = []
  const limitedBy: string[] = []
  const { material: mat, cutter: c, machine: m, cut } = req
  if (cut === "drill" || cut === "spot") {
    if (c.kind !== "drill" && c.kind !== "spot" && c.kind !== "chamfer" && c.kind !== "countersink") warnings.push(`${c.name} is not a drill: it plunges like one at drilling data`)
    return drilling(req, warnings, limitedBy)
  }
  if (cut === "tap" || cut === "ream") {
    if (cut === "tap" && c.kind !== "tap") warnings.push(`${c.name} is not a tap`)
    if (cut === "ream" && c.kind !== "reamer" && c.kind !== "boringbar") warnings.push(`${c.name} is not a reamer: it is fed in and out like one`)
    return holeFinishing(req, warnings, limitedBy)
  }
  if (c.kind === "drill") warnings.push(`${c.name} is a drill: it may only plunge, not ${cut}`)
  const d = c.diameter
  const rigidity = RIGIDITY[m.rigidity ?? "standard"]
  const finish = FINISH.has(cut)

  // Engagement the cut calls for (the request overrides it).
  let ae: number, ap: number
  switch (cut) {
    case "face": ae = 0.7 * d; ap = { N: 2, P: 1.5, K: 1.5, M: 1, S: 0.8, H: 0.3 }[mat.iso]; break
    case "slot": ae = d; ap = mat.slotAp * d * rigidity.depth; break
    case "rough-side": ae = mat.sideAe * d * rigidity.depth; ap = mat.sideAp * d * rigidity.depth; break
    case "adaptive": ae = mat.adaptiveAe * d * rigidity.depth; ap = Math.min(2 * d, c.fluteLength); break
    case "finish-wall": ae = Math.min(mat.finishAllowance, 0.1 * d); ap = c.fluteLength; break
    case "finish-floor": ae = 0.6 * d; ap = Math.min(mat.finishAllowance, 0.1 * d); break
    case "finish-3d": {
      const radius = c.kind === "ball" ? d / 2 : c.kind === "bull" ? (c.cornerRadius ?? d / 2) : d / 2
      ae = c.kind === "flat" ? 0.1 * d : scallopStepover(radius, req.scallop ?? 0.01)
      ap = Math.min(Math.max(0.1 * d, ae), d / 4)
      break
    }
    case "chamfer": ae = 0.5; ap = 0.5; break
    case "engrave": ae = effectiveDiameter(c, 0.2); ap = 0.2; break
    case "thread-mill": ae = 0.6134 * (c.pitch ?? 1) / Math.max(1, mat.threadPasses); ap = c.fluteLength; break
  }
  if (req.ae !== undefined) ae = req.ae
  if (req.ap !== undefined) ap = req.ap
  ae = Math.max(0.005, Math.min(ae, d))
  const fluteCap = cut === "face" ? c.fluteLength * 0.8 : c.fluteLength
  if (ap > fluteCap) { ap = fluteCap; limitedBy.push("flute length") }
  if (req.depth !== undefined && req.depth > 0 && ap > req.depth) ap = req.depth
  ap = Math.max(0.01, ap)

  // Speed on the diameter that actually cuts.
  const vcRecommended = toolSpeed(c.material, mat, finish, warnings) * coatingFactor(c.coating, mat, warnings) * CUT_SPEED[cut]
  const deff = Math.max(0.05 * d, effectiveDiameter(c, ap))
  const rpm = clampRpm((1000 * vcRecommended) / (Math.PI * deff), c, m, limitedBy, warnings)
  const vc = (Math.PI * deff * rpm) / 1000

  // Chip load: the chip the edge wants, thickened for a light radial engagement so the edge still cuts.
  const hss = c.material === "hss" || c.material === "hss-co"
  const target = baseChipLoad(mat, cut === "face" ? Math.min(d, 10) : d) * rigidity.feed * (hss ? 0.8 : 1) * CUT_FEED[cut]
  const thinning = Math.min(cut === "adaptive" || cut === "finish-wall" || cut === "thread-mill" ? 3 : 2, chipThinning(ae, deff))
  let fz = target * thinning
  let feed = rpm * c.flutes * fz
  if (feed > m.maxFeed) { limitedBy.push("machine feed"); feed = m.maxFeed; fz = feed / (rpm * c.flutes) }

  // Load and deflection; reduce ap, then the feed, until the machine and the cutter carry it.
  const maxDeflection = req.maxDeflection ?? (finish ? 0.01 : 0.05)
  const eta = m.efficiency ?? 0.8
  const apMin = Math.min(ap, Math.max(0.05, 0.1 * d))
  // The power the spindle can deliver at this speed: the curve narrows the flat ceiling where the machine says so.
  const powerLimit = powerLimitAt(m, rpm)
  let load = millingLoad(mat, c, deff, ap, ae, fz, feed, rpm, vc)
  let defl = deflection(c, load.forceN)
  for (let i = 0; i < 24; i++) {
    const power = powerLimit !== undefined ? load.powerKw / eta / (0.9 * powerLimit) : 0
    const torque = m.torqueNm !== undefined ? load.torqueNm / m.torqueNm : 0
    const bend = defl / maxDeflection
    const ratio = Math.max(power, torque, bend)
    if (ratio <= 1 + 1e-9) break
    const reason = ratio === bend ? "tool deflection" : ratio === power ? "spindle power" : "spindle torque"
    if (!limitedBy.includes(reason)) limitedBy.push(reason)
    if (ap > apMin + 1e-9 && cut !== "finish-floor" && req.ap === undefined) ap = Math.max(apMin, ap / Math.min(ratio * 1.02, 4))
    else { feed = feed / Math.min(ratio * 1.02, 4); fz = feed / (rpm * c.flutes) }
    load = millingLoad(mat, c, deff, ap, ae, fz, feed, rpm, vc)
    defl = deflection(c, load.forceN)
  }
  const exceeded: string[] = []
  if (powerLimit !== undefined && load.powerKw / eta > powerLimit + 1e-9) {
    exceeded.push(`The cut needs ${(load.powerKw / eta).toFixed(2)} kW, the spindle has ${powerLimit} kW at ${rpm} rpm`)
  }
  if (m.torqueNm !== undefined && load.torqueNm > m.torqueNm * 1.001) exceeded.push(`The cut needs ${load.torqueNm.toFixed(1)} N·m, the spindle gives ${m.torqueNm} N·m`)
  if (defl > maxDeflection * 1.001) exceeded.push(`Tool deflection ${defl.toFixed(3)} mm exceeds ${maxDeflection} mm: shorten the stickout or use a stiffer cutter`)

  const chip = fz / thinning
  if (chip < mat.minFz * 0.999) warnings.push(`Chip of ${r3(chip)} mm is below the ${mat.minFz} mm ${mat.name} needs to cut instead of rubbing (work hardening / melting): use a larger or fewer-flute cutter`)
  if (cut === "slot" && (mat.iso === "H")) warnings.push(`Slotting ${mat.name} breaks cutters: use adaptive (trochoidal) clearing`)
  if (c.material === "hss" && (mat.iso === "S" || mat.iso === "H")) warnings.push(`HSS in ${mat.name} wears in minutes: carbide only`)

  const plungeShare = mat.iso === "N" ? 0.5 : 0.35
  const { rampAngle, helixPitch } = entryOf(mat, c)
  const passes = cut === "thread-mill" ? mat.threadPasses : undefined
  return {
    cut, rpm, vc: r3(vc), vcRecommended: r3(vcRecommended), effectiveDiameter: r3(deff), fz: r3(fz), chipThickness: r3(chip),
    feed: Math.max(1, Math.round(feed)), plungeFeed: Math.max(1, Math.round(feed * plungeShare)), ap: r3(ap), ae: r3(ae),
    stepoverPercent: Math.max(1, Math.min(100, Math.round((ae / d) * 1000) / 10)), rampAngle, helixPitch: r3(Math.min(helixPitch, Math.max(ap, 0.05))),
    coolant: mat.coolant, ...(passes !== undefined ? { passes } : {}),
    mrr: r3((ap * ae * feed) / 1000), powerKw: r3(load.powerKw / eta), torqueNm: r3(load.torqueNm), forceN: Math.round(load.forceN), deflectionMm: Math.round(defl * 10000) / 10000,
    limitedBy, warnings, exceeded,
    source: `${mat.name} (ISO ${mat.iso}): Vc ${Math.round(vcRecommended)} m/min, fz ${r3(target)} mm at Ø${d}, kc1.1 ${mat.kc11} N/mm² mc ${mat.mc} (handbook starting values)`,
    reference: {
      table: "MATERIALS", row: mat.id, rowName: mat.name,
      columns: {
        [speedRead(c.material, mat, finish).column]: speedRead(c.material, mat, finish).value, fz10: mat.fz10, kc11: mat.kc11, mc: mat.mc, minFz: mat.minFz,
        ...(cut === "rough-side" ? { sideAp: mat.sideAp, sideAe: mat.sideAe } : cut === "slot" ? { slotAp: mat.slotAp } : cut === "adaptive" ? { adaptiveAe: mat.adaptiveAe } : cut === "finish-wall" || cut === "finish-floor" ? { finishAllowance: mat.finishAllowance } : cut === "thread-mill" ? { threadPasses: mat.threadPasses } : {})
      },
      factors: {
        toolMaterialSpeed: speedRead(c.material, mat, finish).factor, coating: r3(coatingFactor(c.coating, mat, [])), cutSpeed: CUT_SPEED[cut], cutFeed: CUT_FEED[cut],
        diameterScale: r3(baseChipLoad(mat, cut === "face" ? Math.min(d, 10) : d) / mat.fz10), rigidityDepth: rigidity.depth, rigidityFeed: rigidity.feed,
        toolMaterialFeed: hss ? 0.8 : 1, chipThinning: r3(thinning)
      },
      basis: REFERENCE_BASIS
    }
  }
}
