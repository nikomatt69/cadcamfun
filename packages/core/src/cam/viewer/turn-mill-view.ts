import type { Vec3 } from "../../cad/vec.ts"
import type { Program, Rotary } from "../ir.ts"
import { toolModelOf, type ToolModel } from "../tool-model.ts"
import { headerToolModels, latheToolModels } from "../operation-tools.ts"
import type { LatheSetup } from "./machine-setup.ts"
import type { MotionTrack } from "./motion-track.ts"
import { displayPoint } from "./frames.ts"
import { turnMillAxesOf } from "./turn-mill.ts"
import type { ModelBody, LimitFinding } from "./machine-model.ts"
import { poseAt, timedIndexAt, type Timeline } from "./timeline.ts"
import { displaySpinRate, spinSense } from "./frames.ts"

/** Milling is inferred per operation, so a turning operation in a mixed program keeps its insert and free spindle. */
export const turnMillPathIsMilling = (program: Program, path: number): boolean => {
  const own = program.toolpaths[path]
  if (own === undefined) return false
  const used = turnMillAxesOf({ ...program, toolpaths: [own] })
  return used.b || used.y || used.cPositioned
}

export const turnMillToolModels = (program: Program, track: MotionTrack | undefined, gcode: string): ReadonlyMap<string, ToolModel> => {
  const turning = latheToolModels(program, track, gcode)
  const headers = headerToolModels(gcode, "mill")
  const out = new Map<string, ToolModel>()
  program.toolpaths.forEach((path, i) => {
    const number = track?.paths[i]?.runs.find((r) => r.tool !== undefined)?.tool
    const named = headers.get(path.toolId) ?? (number !== undefined ? headers.get(`T${number}`) : undefined)
    if (named !== undefined) { out.set(path.toolId, named); return }
    if (!turnMillPathIsMilling(program, i)) { out.set(path.toolId, turning.get(path.toolId)!); return }
    const fallback = toolModelOf({ type: "endmill", diameter: 10 }, "mill")
    out.set(path.toolId, named ?? { ...fallback, assumed: [...fallback.assumed, "type", "diameter"] })
  })
  return out
}

/** Main-spindle phase remains continuous when a positioned C operation returns to free turning. */
export const turnMillChuckTrack = (timeline: Timeline, milling: ReadonlyArray<boolean>, spin: boolean): Float64Array => {
  const phases = new Float64Array(timeline.moves.length + 1)
  timeline.moves.forEach((m, i) => {
    phases[i + 1] = milling[m.path] ? -(m.angles.c ?? 0) * Math.PI / 180 : phases[i]! + (spin ? spinSense("lathe", m.state.spindle) * displaySpinRate(m.state.rpm) * 2 * Math.PI * m.duration : 0)
  })
  return phases
}

export const turnMillChuckAngleAt = (timeline: Timeline, milling: ReadonlyArray<boolean>, phases: Float64Array, seconds: number): number => {
  const i = timedIndexAt(timeline, seconds), m = timeline.moves[i]
  if (m === undefined) return phases[timeline.moves.length] ?? 0
  if (milling[m.path]) return -(poseAt(timeline, seconds).angles.c ?? 0) * Math.PI / 180
  const f = m.duration > 0 ? Math.max(0, Math.min(1, (seconds - m.start) / m.duration)) : 1
  return phases[i]! + (phases[i + 1]! - phases[i]!) * f
}

export const turnMillLimitFindings = (setup: LatheSetup, timeline: Timeline): ReadonlyArray<LimitFinding> => {
  const range = setup.turnMill?.b
  if (range === undefined) return []
  const outside = timeline.moves.flatMap((m, move) => {
    const value = m.angles.b ?? 0
    return value < range[0] || value > range[1] ? [{ move, value, line: m.state.line }] : []
  })
  const first = outside[0]
  return first === undefined ? [] : [{ code: "ROTARY_B", severity: "warning", move: first.move, ...(first.line !== undefined ? { line: first.line } : {}), count: outside.length, value: first.value, range, assumed: true, message: `B ${first.value} is outside ${range[0]}..${range[1]} (assumed head limits)` }]
}

const rotateX = (p: Vec3, angle: number): Vec3 => ({ x: p.x, y: p.y * Math.cos(angle) - p.z * Math.sin(angle), z: p.y * Math.sin(angle) + p.z * Math.cos(angle) })

/** Lathe machine coordinates: XYZ place the tip, B tilts the head, C positions the chuck. Angles enter at the IR boundary. */
export const turnMillDisplayPose = (setup: LatheSetup, point: Vec3, angles: Rotary, frame: "part" | "machine", xMode = setup.xMode): { readonly tip: Vec3; readonly axis: Vec3; readonly chuckAngle: number; readonly machineAngle: number } => {
  const b = (angles.b ?? 0) * Math.PI / 180
  const c = (angles.c ?? 0) * Math.PI / 180
  const side = setup.turret === "rear" ? 1 : -1
  const tip = displayPoint(setup, point, xMode)
  const axis = { x: Math.cos(b), y: 0, z: side * Math.sin(b) }
  // The lathe display maps program X to display Z and program Z to display X; C therefore has negative display sense.
  return frame === "machine" ? { tip, axis, chuckAngle: -c, machineAngle: 0 }
    : { tip: rotateX(tip, c), axis: rotateX(axis, c), chuckAngle: 0, machineAngle: c }
}

/** Typical mill-turn machine envelopes, in the existing lathe display frame. Assumed geometry, not a machine CAD model. */
export const turnMillMachineBodies = (setup: LatheSetup): ReadonlyArray<ModelBody> => {
  const back = setup.zero === "face" ? -setup.stock.length : 0
  const r = setup.workholding.chuckDiameter / 2
  return [
    { id: "lathe-bed", link: "base", shape: { type: "box", min: { x: back - 150, y: -r - 60, z: -r - 130 }, max: { x: back + setup.stock.length + 180, y: r + 100, z: -r - 40 } } },
    { id: "headstock", link: "column", shape: { type: "box", min: { x: back - 150, y: -r - 30, z: -r - 40 }, max: { x: back - 60, y: r + 30, z: r + 30 } } },
    { id: "b-head", link: "spindle", shape: { type: "cylinder", axis: "z", center: { x: 0, y: 0, z: 35 }, radius: 28, length: 70 } },
    { id: "b-axis", link: "fork", shape: { type: "cylinder", axis: "y", center: { x: 0, y: 0, z: 75 }, radius: 38, length: 90 } }
  ]
}
