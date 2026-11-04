/**
 * What the 3D overlay is told about a run (spec 73 §4): the run, its operation and the timeline the program plays on, turned into
 * the overlay's model. The tilted frame is drawn with the same rotation order the controls use for a tilted plane (rotations about
 * the fixed X, Y, Z axes in that order, as PLANE SPATIAL does), the rotary calibration as the sphere at each measured angle.
 */
import { cam } from "@cadcamfun/core"
import type { Vec3 } from "@cadcamfun/core"
import { probeOverlayModel, type ProbeOverlayModel } from "../../../../viewport/view3d/probe-overlay.ts"
import { contactTimesOnTimeline } from "./contact-times.ts"
import { getPath, type CycleSpec } from "./cycle-fields.ts"
import { refWire, type ProbeOperation, type TiltedFrame } from "./operation.ts"
import { offsetChange, type ProbeRunResult } from "./result.ts"

const rot = cam.testing

/** The X and Y axes of a tilted plane (A about X, then B about Y, then C about Z, all fixed axes), in work coordinates. */
export const frameAxesOfAbc = (frame: TiltedFrame): { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 } => {
  const m = rot.mulM3(rot.mulM3(rot.rot3("z", frame.c), rot.rot3("y", frame.b)), rot.rot3("x", frame.a))
  return { x: rot.mul3(m, { x: 1, y: 0, z: 0 }), y: rot.mul3(m, { x: 0, y: 1, z: 0 }), z: rot.mul3(m, { x: 0, y: 0, z: 1 }) }
}

/** Where a cycle is: the point its tilted plane or its triad is drawn at. */
export const anchorOf = (spec: CycleSpec): Vec3 => {
  const pick = (path: string): number | undefined => { const v = getPath(spec, path); return typeof v === "number" ? v : undefined }
  const x = pick("centre.x") ?? pick("at.x") ?? pick("corner.x") ?? pick("start.x") ?? pick("sphere.centre.x") ?? pick("artefact.centre.x") ?? 0
  const y = pick("centre.y") ?? pick("at.y") ?? pick("corner.y") ?? pick("start.y") ?? pick("sphere.centre.y") ?? pick("artefact.centre.y") ?? 0
  const z = pick("centre.z") ?? pick("expectedZ") ?? pick("at.z") ?? pick("sphere.centre.z") ?? pick("top") ?? 0
  return { x, y, z }
}

/** The calibration spheres of a rotary run: the nominal ball, and the centre measured at each angle when the run kept them (`cal_<i>_x/y/z`). */
const spheresOf = (op: ProbeOperation, result: ProbeRunResult): ProbeOverlayModel["spheres"] => {
  if (op.cycle.kind !== "rotary-axis") return []
  const diameter = Number(getPath(op.cycle, "sphere.diameter") ?? 0)
  if (!(diameter > 0)) return []
  const measured: Array<{ centre: Vec3; diameter: number }> = []
  for (let i = 0; ; i++) {
    const x = result.outcome.results[`cal_${i}_x`], y = result.outcome.results[`cal_${i}_y`], z = result.outcome.results[`cal_${i}_z`]
    if (x === undefined || y === undefined || z === undefined) break
    measured.push({ centre: { x, y, z }, diameter })
  }
  if (measured.length > 0) return measured
  return [{ centre: { x: Number(getPath(op.cycle, "sphere.centre.x") ?? 0), y: Number(getPath(op.cycle, "sphere.centre.y") ?? 0), z: Number(getPath(op.cycle, "sphere.centre.z") ?? 0) }, diameter }]
}

export const overlayModelOf = (input: {
  readonly result: ProbeRunResult
  readonly operation: ProbeOperation
  readonly deviationScale: number
  /** The timeline the program plays on: places the contacts in time. */
  readonly timeline?: { readonly moves: ReadonlyArray<{ readonly start: number; readonly duration: number; readonly state: { readonly line?: number | undefined } }> } | undefined
  readonly triadLength?: number
}): ProbeOverlayModel => {
  const { result, operation } = input
  const change = offsetChange(result.outcome, refWire(operation.workOffset))
  const times = input.timeline !== undefined ? contactTimesOnTimeline(result.outcome.contacts, input.timeline) : undefined
  const frame = operation.frame
  return probeOverlayModel({
    outcome: result.outcome, expected: result.expected, deviationScale: input.deviationScale,
    ...(times !== undefined ? { times } : {}),
    ...(change !== undefined ? { before: change.before, after: change.after } : {}),
    ...(frame !== undefined ? { frames: [{ origin: anchorOf(operation.cycle), ...(({ x, y }) => ({ x, y }))(frameAxesOfAbc(frame)) }] } : {}),
    spheres: spheresOf(operation, result),
    ...(input.triadLength !== undefined ? { triadLength: input.triadLength } : {})
  })
}
