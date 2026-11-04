/**
 * Rotary axis calibration by probing a sphere (spec 73 §5.14): a reference ball fixed to the table is measured with five touches at
 * several angles of one rotary axis; the centres lie on a circle about the axis the table really turns on, so the circle gives the
 * pivot and the direction of that axis, and the difference to what the control believes is the error to correct.
 *
 * `rotaryRoutine` is the program: for each angle the table is turned (`Orient`), the probe goes where the *assumed* kinematics put the
 * ball, measures its centre into variables of its own (`<prefix>c<i>_x` ...), and a `Report` lists them for the host to fit. No tool
 * centre point and no tilted plane are on while it runs, so the touches are plain positions of the machine. `calibrateRotary` is the
 * fit. Nothing here writes a machine parameter: the result is reported (the control's own cycle 451 / CYCLE996 writes it).
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import type { RotaryLayout } from "../indexing.ts"
import { fitCircle3, isRefused } from "./fit.ts"
import { planProbeCycle } from "./cycles.ts"
import { tablePose } from "./simulate.ts"
import type { ProbeContext, ProbeCycle, ProbeRoutine, ProbeRoutineResult } from "./types.ts"

const DEG = Math.PI / 180

/** What the control believes about the machine's rotary axes. */
export interface RotaryAssumption {
  readonly layout: RotaryLayout
  /** Where the control believes the table turns, machine coordinates. */
  readonly pivot: Vec3
}

const NOMINAL_AXIS: Readonly<Record<"A" | "B" | "C", Vec3>> = { A: { x: 1, y: 0, z: 0 }, B: { x: 0, y: 1, z: 0 }, C: { x: 0, y: 0, z: 1 } }

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

/**
 * The probe program of a `rotary-axis` cycle. Refused when the axis is not one the layout has, fewer than three distinct angles are
 * given (a circle needs three points), or the sphere cannot be reached (the cycle's own refusals).
 */
export const rotaryRoutine = (cycle: Extract<ProbeCycle, { readonly kind: "rotary-axis" }>, ctx: ProbeContext, assumed: RotaryAssumption): ProbeRoutineResult => {
  const tilt = assumed.layout === "table-AC" ? "A" : "B"
  if (cycle.axis !== tilt && cycle.axis !== "C") return { refused: `the ${assumed.layout} machine has no ${cycle.axis} axis (it has ${tilt} and C)` }
  const distinct = [...new Set(cycle.angles.map((a) => Math.round(a * 1e6)))]
  if (distinct.length < 3) return { refused: "a rotary axis is calibrated from at least three different angles" }
  if (distinct.length !== cycle.angles.length) return { refused: "the angles of a rotary calibration must all differ" }
  if (cycle.angles.length > 10) return { refused: "a rotary calibration takes at most ten angles (the report holds 32 values)" }
  if (Math.max(...cycle.angles) - Math.min(...cycle.angles) < 20 * DEG) return { refused: "the angles span less than 20 degrees: the circle they give is not determined" }
  const moves: Move[] = []
  const results: Record<string, import("../macro.ts").Expr> = {}
  const nominal: Record<string, number> = {}
  const units: Record<string, "mm" | "deg"> = {}
  const contacts: ProbeRoutine["contacts"][number][] = []
  const notes: string[] = [`the table of the ${assumed.layout} machine is turned about ${cycle.axis} to ${cycle.angles.length} angles; the ball is measured at the place the control's own pivot puts it`]
  const values: Array<{ name: string; value: import("../macro.ts").Expr }> = []
  for (const [i, theta] of cycle.angles.entries()) {
    const pose = { a: cycle.axis === "A" ? theta : 0, b: cycle.axis === "B" ? theta : 0, c: cycle.axis === "C" ? theta : 0 }
    const expected = tablePose({ layout: assumed.layout, pivot: assumed.pivot }, pose, false).toMachine(cycle.sphere.centre)
    const r = planProbeCycle({ kind: "sphere", centre: expected, diameter: cycle.sphere.diameter }, { ...ctx, prefix: `${ctx.prefix}c${i}_` })
    if ("refused" in r) return { refused: `angle ${(theta / DEG).toFixed(3)} degrees: ${r.refused}` }
    moves.push({ _tag: "Orient", ...(cycle.axis === "A" ? { a: theta / DEG } : cycle.axis === "B" ? { b: theta / DEG } : { c: theta / DEG }) }, ...r.moves)
    for (const k of ["x", "y", "z"] as const) {
      results[`${k}${i}`] = r.results[k]!
      nominal[`${k}${i}`] = r.nominal[k]!
      units[`${k}${i}`] = "mm"
      values.push({ name: `${k}${i}`, value: r.results[k]! })
    }
    contacts.push(...r.contacts.map((c) => ({ ...c, name: `c${i}_${c.name}` })))
  }
  moves.push({ _tag: "Report", label: "ROTARY", values })
  return { cycle, moves, contacts, results, nominal, units, notes }
}

export interface RotaryCalibration {
  /** A point on the axis the table really turns on (the centre of the circle the ball describes), machine coordinates. */
  readonly pivot: Vec3
  /** Unit direction of that axis, signed so that turning to a larger angle is a right-handed turn about it. */
  readonly axisDirection: Vec3
  /** `pivot` less the assumed pivot with the part along the axis removed (that part cannot be seen from one axis), mm. */
  readonly pivotError: Vec3
  /** The angle between the axis found and the nominal one, radians. */
  readonly axisTilt: number
  /** The radius of the circle the ball's centre describes, mm. */
  readonly radius: number
  /** What the centres miss the circle by (RMS), mm. */
  readonly rms: number
}

/**
 * The axis from the ball's measured centres at `angles` (radians, the same order). Refused when the centres are not a circle in space
 * (fewer than three, on a line, all the same).
 */
export const calibrateRotary = (centres: ReadonlyArray<Vec3>, angles: ReadonlyArray<number>, assumed: RotaryAssumption, axis: "A" | "B" | "C"): RotaryCalibration | { readonly refused: string } => {
  if (centres.length !== angles.length) return { refused: "each centre needs its angle" }
  if (centres.length < 3) return { refused: "a circle needs at least three centres" }
  const fit = fitCircle3(centres)
  if (isRefused(fit)) return fit
  const order = angles.map((a, i) => ({ a, i })).sort((p, q) => p.a - q.a)
  const first = centres[order[0]!.i]!, second = centres[order[1]!.i]!
  const turn = dot(fit.normal, cross(sub(first, fit.centre), sub(second, fit.centre)))
  const n = turn >= 0 ? fit.normal : { x: -fit.normal.x, y: -fit.normal.y, z: -fit.normal.z }
  const nominal = NOMINAL_AXIS[axis]
  const d = sub(fit.centre, assumed.pivot)
  const along = dot(d, n)
  return {
    pivot: fit.centre,
    axisDirection: n,
    pivotError: { x: d.x - along * n.x, y: d.y - along * n.y, z: d.z - along * n.z },
    axisTilt: Math.acos(Math.min(1, Math.max(-1, dot(n, nominal)))),
    radius: fit.radius,
    rms: fit.rms
  }
}
