/**
 * What a calibration cycle found (spec 73 §5.6, §5.14), read from a run's results: the stylus record a machine profile keeps, or the
 * rotary axis. The host does this, the control only measured: machine parameters are never written, a person takes the figures over.
 * Also the worlds of the artefacts (a ring, a sphere, a height block sitting on the table, not part of the part) and the host's
 * least-squares refinement of a nine-touch sphere.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { fitSphere, isRefused } from "./fit.ts"
import { calibrateRotary, type RotaryAssumption, type RotaryCalibration } from "./rotary-cal.ts"
import type { ProbeDevice, StylusCalibration } from "./device.ts"
import type { ProbeCycle, ProbeRoutine } from "./types.ts"
import { cylinderWorld, planeWorld, sphereWorld, type ProbeWorld3 } from "./world.ts"

const DEG = Math.PI / 180
const round = (v: number): number => Number(v.toFixed(6))

export type ProbeCalibration =
  | { readonly kind: "stylus"; readonly stylus: StylusCalibration }
  | { readonly kind: "rotary"; readonly axis: "A" | "B" | "C"; readonly centres: ReadonlyArray<Vec3>; readonly angles: ReadonlyArray<number>; readonly rotary: RotaryCalibration }
  /** The results do not give a calibration (a run that stopped, a fit refused), and why. */
  | { readonly kind: "refused"; readonly reason: string }

/** The stylus record of a `stylus-calibrate` run, over what the device held. */
export const stylusCalibrationOf = (cycle: Extract<ProbeCycle, { readonly kind: "stylus-calibrate" }>, results: Readonly<Record<string, number>>, device: ProbeDevice): StylusCalibration => {
  const ball = device.stylus.ballDiameter
  const held = device.calibration
  const art = cycle.artefact
  const base = { ballDiameter: ball, effectiveRadius: held?.effectiveRadius ?? ball / 2, ...(held?.zTrigger !== undefined ? { zTrigger: held.zTrigger } : {}) }
  if (art.kind === "height") return { ...base, ...(held?.directional !== undefined ? { directional: held.directional } : {}), zTrigger: results["zTrigger"] ?? 0, artefact: { kind: "height" } }
  const n = cycle.directions ?? 4
  return {
    ...base,
    effectiveRadius: results["radius"] ?? base.effectiveRadius,
    directional: Array.from({ length: n }, (_, k) => ({ angle: (2 * Math.PI * k) / n, radius: results[`r${k}`] ?? NaN })),
    artefact: { kind: art.kind, diameter: art.diameter }
  }
}

/** The calibration a run of `cycle` gives, or undefined for a cycle that is not a calibration. */
export const calibrationOf = (cycle: ProbeCycle, results: Readonly<Record<string, number>>, device: ProbeDevice, assumed?: RotaryAssumption): ProbeCalibration | undefined => {
  if (cycle.kind === "stylus-calibrate") {
    const s = stylusCalibrationOf(cycle, results, device)
    const bad = !Number.isFinite(s.effectiveRadius) || s.directional?.some((d) => !Number.isFinite(d.radius)) === true
    return bad ? { kind: "refused", reason: "the run did not finish: no calibration" } : { kind: "stylus", stylus: s }
  }
  if (cycle.kind !== "rotary-axis") return undefined
  if (assumed === undefined) return { kind: "refused", reason: "the machine's rotary table is not known" }
  const centres = cycle.angles.map((_, i) => ({ x: results[`x${i}`] ?? NaN, y: results[`y${i}`] ?? NaN, z: results[`z${i}`] ?? NaN }))
  if (centres.some((c) => !Number.isFinite(c.x + c.y + c.z))) return { kind: "refused", reason: "the run did not finish: not every ball centre was measured" }
  const rotary = calibrateRotary(centres, cycle.angles, assumed, cycle.axis)
  return "refused" in rotary ? { kind: "refused", reason: rotary.refused } : { kind: "rotary", axis: cycle.axis, centres, angles: cycle.angles, rotary }
}

/** On the wire angles are degrees. */
export const calibrationToWire = (c: ProbeCalibration): unknown => {
  switch (c.kind) {
    case "stylus": return { ...c, stylus: { ...c.stylus, ...(c.stylus.directional !== undefined ? { directional: c.stylus.directional.map((d) => ({ angle: round(d.angle / DEG), radius: round(d.radius) })) } : {}) } }
    case "rotary": return { ...c, angles: c.angles.map((a) => round(a / DEG)), rotary: { ...c.rotary, axisTilt: round(c.rotary.axisTilt / DEG) } }
    case "refused": return c
  }
}

/** The artefact a calibration cycle touches, in the cycle's coordinates; undefined for a cycle that touches the part. */
export const artefactWorld = (cycle: ProbeCycle): ProbeWorld3 | undefined => {
  if (cycle.kind === "rotary-axis") return sphereWorld(cycle.sphere.centre, cycle.sphere.diameter / 2)
  if (cycle.kind !== "stylus-calibrate") return undefined
  const a = cycle.artefact
  switch (a.kind) {
    case "ring": return cylinderWorld({ centre: a.centre, radius: a.diameter / 2, z0: (a.top ?? 0) - 2 * a.depth - 5, z1: a.top ?? 0, inside: true })
    case "sphere": return sphereWorld(a.centre, a.diameter / 2)
    case "height": return planeWorld({ x: a.at.x, y: a.at.y, z: a.z }, { x: 0, y: 0, z: 1 })
  }
}

/**
 * The results with the host's work done: a nine-touch sphere is fitted by least squares through all its ball centres, the diameter less the
 * stylus, `sphericity` what they miss the sphere by. Without `hostFit`, or when the touches do not fit, the results as they are.
 */
export const withHostFit = (routine: Pick<ProbeRoutine, "hostFit">, results: Readonly<Record<string, number>>, device: ProbeDevice): Readonly<Record<string, number>> => {
  if (routine.hostFit !== "sphere") return results
  const pts: Vec3[] = []
  for (let i = 0; i < 9; i++) {
    const p = { x: results[`bx${i}`] ?? NaN, y: results[`by${i}`] ?? NaN, z: results[`bz${i}`] ?? NaN }
    if (!Number.isFinite(p.x + p.y + p.z)) return results
    pts.push(p)
  }
  const fit = fitSphere(pts)
  if (isRefused(fit)) return results
  const r = device.calibration?.effectiveRadius ?? device.stylus.ballDiameter / 2
  return { ...results, x: fit.centre.x, y: fit.centre.y, z: fit.centre.z, diameter: 2 * (fit.radius - r), sphericity: fit.rms }
}
