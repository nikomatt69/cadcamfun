/**
 * The probing hardware as data (spec 73 §5.4): the spindle probe with its stylus and calibration, the tool setter, and what the
 * control offers for probing (`KernelProbing`). Pure records in mm and radians; the machine profile stores the same in its JSON
 * (degrees for angles) and `kernelProbingOfProfile` / `settingsFromMachine` read it.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { OffsetCapacity, WorkOffsetRef } from "../work-offset.ts"

/** What a calibration measured on the stylus (ring gauge, sphere or height artefact). */
export interface StylusCalibration {
  /** Nominal ball diameter, mm. */
  readonly ballDiameter: number
  /** The radius the probe triggers at, averaged over the directions, mm (ball radius less the pre-travel). */
  readonly effectiveRadius: number
  /** Effective radius by touch direction in the XY plane (`angle` radians from +X), interpolated between the entries. */
  readonly directional?: ReadonlyArray<{ readonly angle: number; readonly radius: number }>
  /** Correction added to a Z touch (the tip's trigger height against the calibrated tool length), mm. */
  readonly zTrigger?: number
  /** Offset of the ball centre from the spindle axis (stylus run-out after orientation), mm. */
  readonly centreOffset?: Vec2
  /** The artefact it was calibrated on. */
  readonly artefact?: { readonly kind: "ring" | "sphere" | "height"; readonly diameter?: number; readonly serial?: string }
  /** ISO 8601 date-time. */
  readonly calibratedAt?: string
}

export interface ProbeDevice {
  readonly id: string
  /** The tool number the probe sits in. */
  readonly toolNumber: number
  readonly stylus: { readonly ballDiameter: number; readonly length: number; readonly shankDiameter: number }
  readonly body: { readonly diameter: number; readonly length: number }
  readonly calibration?: StylusCalibration
  /** How far the stylus may deflect past the trigger before it breaks, mm. */
  readonly overtravel: { readonly xy: number; readonly z: number }
  /** mm/min: protected positioning, the first (fast) touch, the measuring touch, and the most the probe takes. */
  readonly feeds: { readonly positioning: number; readonly fast: number; readonly touch: number; readonly max: number }
  /** Back-off between the fast and the measuring touch, mm. */
  readonly backoff: number
  /** Touch fast, back off, touch again slowly (the slow touch is the one measured). */
  readonly doubleTouch: boolean
  /** Orient the spindle before probing (radians; the stylus run-out is calibrated at this angle). */
  readonly orientSpindle?: number
  /** Blocks that switch the probe on and off (the machine's M-codes), written as they are. */
  readonly on?: ReadonlyArray<string>
  readonly off?: ReadonlyArray<string>
}

/** A tool setter on the table: a contact disc or a laser beam, in machine coordinates. */
export interface ToolSetter {
  readonly kind: "contact" | "laser"
  /** Centre of the disc / beam, machine coordinates, mm. */
  readonly position: Vec3
  /** Machine Z at which the gauge line of a zero-length tool triggers, mm. */
  readonly triggerZ: number
  readonly discDiameter?: number
  readonly maxToolDiameter: number
  readonly feeds: { readonly fast: number; readonly touch: number }
  /** Spindle speed for measuring a radius (reverse spin on a contact setter, the laser's own speed). */
  readonly radiusRpm?: number
  /** A tool shorter (or a radius smaller) than nominal by more than this is broken, mm. */
  readonly brokenTolerance: number
}

/** How the probing code is written: the shared writer's own blocks, or calls to the control's probing package. */
export type MacroStyle = "inline" | "renishaw" | "heidenhain-ts" | "siemens-cycles"
export const MACRO_STYLES: ReadonlyArray<MacroStyle> = ["inline", "renishaw", "heidenhain-ts", "siemens-cycles"]

/** Where the control keeps tool length and radius, when it is not the family default. Base variable numbers (`base + tool`). */
export interface ToolOffsetAddresses {
  readonly lengthGeometry?: number
  readonly lengthWear?: number
  readonly radiusGeometry?: number
  readonly radiusWear?: number
}

/** What the machine offers for probing: probes, setter, how results are reported and where offsets go. */
export interface KernelProbing {
  readonly probes: ReadonlyArray<ProbeDevice>
  readonly toolSetter?: ToolSetter
  readonly macroStyle: MacroStyle
  /** The skip word when it is not the family's (`G31.1`, `G31 P2`). */
  readonly skipCode?: string
  /** The frame the control reports a contact in under a tilted plane: the plane's (`program`) or the work offset's (`work`). */
  readonly skipFrame: "program" | "work"
  /** The control probes inside a tilted plane (G68.2 / CYCLE800 / PLANE SPATIAL). */
  readonly tiltedPlane: boolean
  readonly offsets: OffsetCapacity
  readonly toolOffsets?: ToolOffsetAddresses
  /** First variable a native cycle reports into (Renishaw `#135`), when not the default. */
  readonly resultBase?: number
  /** Variables the probe program may use for its own values, inclusive. */
  readonly scratch?: { readonly from: number; readonly to: number }
  /** Stylus calibration baked into the program (`baked`) or read from the control's variables at run time (`variables`). */
  readonly calibrationSource: "baked" | "variables"
}

/** The ball radius the probe triggers at when it touches moving along `dir` (only the XY direction matters for a side touch). */
export const effectiveRadius = (device: ProbeDevice, dir: Vec2 | Vec3): number => {
  const cal = device.calibration
  const nominal = device.stylus.ballDiameter / 2
  if (cal === undefined) return nominal
  const table = cal.directional
  if (table === undefined || table.length === 0 || Math.hypot(dir.x, dir.y) < 1e-12) return cal.effectiveRadius
  if (table.length === 1) return table[0]!.radius
  const TAU = Math.PI * 2
  const wrap = (a: number): number => ((a % TAU) + TAU) % TAU
  const sorted = [...table].map((e) => ({ angle: wrap(e.angle), radius: e.radius })).sort((a, b) => a.angle - b.angle)
  const a = wrap(Math.atan2(dir.y, dir.x))
  for (let i = 0; i < sorted.length; i++) {
    const lo = sorted[i]!
    const hi = sorted[(i + 1) % sorted.length]!
    const span = wrap(hi.angle - lo.angle) || TAU
    const into = wrap(a - lo.angle)
    if (into <= span + 1e-15) return lo.radius + ((hi.radius - lo.radius) * into) / span
  }
  return cal.effectiveRadius
}

/** The probe a cycle names (by id), or the first one; undefined when the machine has none. */
export const resolveProbe = (m: KernelProbing | undefined, id?: string): ProbeDevice | undefined => {
  if (m === undefined || m.probes.length === 0) return undefined
  if (id === undefined) return m.probes[0]
  return m.probes.find((p) => p.id === id)
}

/** What a probe device can do wrong as data: the reasons, or an empty list. */
export const deviceProblems = (d: ProbeDevice): ReadonlyArray<string> => {
  const out: string[] = []
  if (!(d.stylus.ballDiameter > 0)) out.push("the stylus ball diameter must be positive")
  if (!(d.stylus.length > 0)) out.push("the stylus length must be positive")
  if (!(d.stylus.shankDiameter > 0) || d.stylus.shankDiameter > d.stylus.ballDiameter) out.push("the stylus shank must be positive and no wider than the ball")
  if (!(d.feeds.touch > 0) || !(d.feeds.fast > 0) || !(d.feeds.positioning > 0)) out.push("the probe feeds must be positive")
  if (d.feeds.touch > d.feeds.max || d.feeds.fast > d.feeds.max || d.feeds.positioning > d.feeds.max) out.push(`a probe feed is above the probe's maximum of ${d.feeds.max} mm/min`)
  if (!(d.overtravel.xy > 0) || !(d.overtravel.z > 0)) out.push("the stylus overtravel must be positive")
  if (!(d.backoff > 0)) out.push("the back-off must be positive")
  if (d.calibration !== undefined && !(d.calibration.effectiveRadius > 0 && d.calibration.effectiveRadius <= d.calibration.ballDiameter / 2 + 0.05)) {
    out.push("the calibrated effective radius must be positive and not larger than the ball")
  }
  return out
}

/** Planning settings of a probe cycle; `settingsFromMachine` fills them from the machine profile. */
export interface ProbeSettings {
  /** Stylus ball diameter, mm (used when the machine has no probe device). */
  readonly stylusDiameter: number
  /** Measuring touch feed, mm/min. */
  readonly feed: number
  /** First touch of a double touch, mm/min. */
  readonly fastFeed: number
  /** Protected positioning feed, mm/min. */
  readonly positioningFeed: number
  /** How far past the expected surface the probe searches, mm. */
  readonly search: number
  /** Distance the probe stands off a surface before it touches, mm. */
  readonly clearance: number
  /** Height the probe travels at between features (work coordinates), mm. */
  readonly safeZ: number
  /** Stylus overtravel the probe tolerates past the trigger, mm. */
  readonly overtravel: number
  readonly backoff: number
  readonly doubleTouch: boolean
  readonly workOffset: WorkOffsetRef
  /** Tool number of the probe. */
  readonly toolNumber?: number
  /** Effective (calibrated) stylus radius, when known; otherwise half the diameter. */
  readonly effectiveRadius?: number
  /** Orient the spindle before probing (radians). */
  readonly orientSpindle?: number
}

export const DEFAULT_PROBE_SETTINGS: ProbeSettings = {
  stylusDiameter: 6,
  feed: 100,
  fastFeed: 500,
  positioningFeed: 2000,
  search: 10,
  clearance: 5,
  safeZ: 25,
  overtravel: 2,
  backoff: 1,
  doubleTouch: true,
  workOffset: { kind: "g5x", code: "G54" }
}

/** The settings' own problems: the reasons, or an empty list. */
export const validateSettings = (s: ProbeSettings): ReadonlyArray<string> => {
  const out: string[] = []
  if (!(s.stylusDiameter > 0)) out.push("the stylus diameter must be positive")
  if (!(s.feed > 0)) out.push("the probing feed must be positive")
  if (!(s.fastFeed > 0)) out.push("the fast touch feed must be positive")
  if (!(s.positioningFeed > 0)) out.push("the positioning feed must be positive")
  if (!(s.search > 0)) out.push("the search distance must be positive")
  if (!(s.clearance > 0)) out.push("the clearance must be positive")
  if (!(s.overtravel > 0)) out.push("the overtravel must be positive")
  if (!(s.backoff > 0)) out.push("the back-off must be positive")
  if (s.doubleTouch && s.backoff >= s.search + s.clearance) out.push("the back-off must be shorter than the search")
  if (s.effectiveRadius !== undefined && !(s.effectiveRadius > 0 && s.effectiveRadius <= s.stylusDiameter / 2 + 0.05)) out.push("the effective stylus radius must be positive and not larger than the ball")
  if (![s.safeZ].every(Number.isFinite)) out.push("the safe height must be a number")
  return out
}

/** The probe device the settings describe (for a cycle planned without a machine). */
export const deviceOfSettings = (s: ProbeSettings, id = "probe"): ProbeDevice => ({
  id,
  toolNumber: s.toolNumber ?? 99,
  stylus: { ballDiameter: s.stylusDiameter, length: 50, shankDiameter: Math.min(s.stylusDiameter, Math.max(1, s.stylusDiameter * 0.6)) },
  body: { diameter: 40, length: 60 },
  ...(s.effectiveRadius !== undefined ? { calibration: { ballDiameter: s.stylusDiameter, effectiveRadius: s.effectiveRadius } } : {}),
  overtravel: { xy: s.overtravel, z: s.overtravel },
  feeds: { positioning: s.positioningFeed, fast: s.fastFeed, touch: s.feed, max: Math.max(s.positioningFeed, s.fastFeed, s.feed) },
  backoff: s.backoff,
  doubleTouch: s.doubleTouch,
  ...(s.orientSpindle !== undefined ? { orientSpindle: s.orientSpindle } : {})
})
