/**
 * Motion track (spec 31 §4.4): the machine state the IR does not carry — spindle sense and speed, plane, diameter or radius
 * X, extrusion, tool, coolant and source line — for every move the viewer plays.
 *
 * The IR is unchanged. A parsed program has one toolpath whose moves were built 1:1 from the interpreter's segments, so the
 * track is a parallel array per toolpath, aligned with `expandMoves(path.moves)` (the list the playback walks). It is stored
 * run-length (a run starts wherever the state changes) plus the per-move arrays that really change every move (extrusion,
 * source line, constant-surface-speed rpm). A program that was not parsed (kernel artifact, assistant operations) gets
 * `motionTrackFromProgram`: the toolpath's spindle at its `spindleRpm`, XY plane, no extrusion.
 */
import { Schema } from "effect"
import { expandMoves, type Program } from "../ir.ts"
import type { MotionSample } from "../testing/gcode-interpreter.ts"
import type { Vec3 } from "../../cad/vec.ts"

const Index = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const MotionRunSchema = Schema.Struct({
  /** First move of the run. */
  start: Index,
  spindle: Schema.Literals(["cw", "ccw", "off"]),
  /** rpm of the run; under G96 the per-move `rpm` array has the value at each move. */
  rpm: Schema.Finite,
  css: Schema.Boolean,
  plane: Schema.Literals([17, 18, 19]),
  xMode: Schema.Literals(["diameter", "radius"]),
  tool: Schema.optionalKey(Schema.Int),
  coolant: Schema.Literals(["off", "flood", "mist"]),
  feedMode: Schema.Literals(["min", "rev"])
})
export type MotionRun = typeof MotionRunSchema.Type

export const MotionPathTrackSchema = Schema.Struct({
  /** Moves of the toolpath after `expandMoves`. */
  count: Index,
  runs: Schema.Array(MotionRunSchema),
  /** Filament per move, mm; absent when nothing is extruded. */
  extrude: Schema.optionalKey(Schema.Array(Schema.Finite)),
  /** Source line per move; absent for programs that were not parsed. */
  lines: Schema.optionalKey(Schema.Array(Index)),
  /** rpm per move; present only when the program uses constant surface speed. */
  rpm: Schema.optionalKey(Schema.Array(Schema.Finite)),
  /** Moves preceded by a retraction / a G28 homing. */
  retracts: Schema.optionalKey(Schema.Array(Index)),
  homes: Schema.optionalKey(Schema.Array(Index))
})
export type MotionPathTrack = typeof MotionPathTrackSchema.Type

export const MotionTrackSchema = Schema.Struct({
  paths: Schema.Array(MotionPathTrackSchema),
  /** Words with an effect on motion that the replay skipped: the preview is partial. */
  unsupported: Schema.Array(Schema.Struct({ line: Index, word: Schema.String }))
})
export type MotionTrack = typeof MotionTrackSchema.Type

/** The state of one move, as the viewer reads it. */
export interface MotionState {
  readonly spindle: "cw" | "ccw" | "off"
  readonly rpm: number
  readonly css: boolean
  readonly plane: 17 | 18 | 19
  readonly xMode: "diameter" | "radius"
  readonly tool: number | undefined
  readonly coolant: "off" | "flood" | "mist"
  readonly feedMode: "min" | "rev"
  readonly extrude: number
  readonly line: number | undefined
}

const sameRun = (a: MotionRun, s: MotionSample, css: boolean): boolean =>
  a.spindle === s.spindle && a.css === s.css && a.plane === s.plane && a.xMode === s.xMode && a.tool === s.tool &&
  a.coolant === s.coolant && a.feedMode === s.feedMode && (css || a.rpm === s.rpm)

/** The track of a parsed program (one toolpath) from the interpreter's samples. */
export const motionTrackOf = (samples: ReadonlyArray<MotionSample>, unsupported: MotionTrack["unsupported"] = []): MotionTrack => {
  const css = samples.some((s) => s.css)
  const runs: MotionRun[] = []
  const extrude: number[] = []
  const lines: number[] = []
  const rpm: number[] = []
  const retracts: number[] = []
  const homes: number[] = []
  let extruding = false
  samples.forEach((s, index) => {
    const last = runs[runs.length - 1]
    if (last === undefined || !sameRun(last, s, css)) {
      runs.push({ start: index, spindle: s.spindle, rpm: s.rpm, css: s.css, plane: s.plane, xMode: s.xMode, ...(s.tool !== undefined ? { tool: s.tool } : {}), coolant: s.coolant, feedMode: s.feedMode })
    }
    extrude.push(s.extrude)
    if (s.extrude !== 0) extruding = true
    lines.push(s.line)
    rpm.push(s.rpm)
    if (s.retract) retracts.push(index)
    if (s.home) homes.push(index)
  })
  return {
    paths: [{
      count: samples.length, runs, lines,
      ...(extruding ? { extrude } : {}), ...(css ? { rpm } : {}),
      ...(retracts.length > 0 ? { retracts } : {}), ...(homes.length > 0 ? { homes } : {})
    }],
    unsupported
  }
}

/** Expanded move count of each toolpath, chaining the start points the way the playback does. */
export const expandedCounts = (program: Program): number[] => {
  let from: Vec3 = { x: 0, y: 0, z: 0 }
  return program.toolpaths.map((path) => {
    const moves = expandMoves(path.moves, from)
    for (const move of moves) if (move._tag === "Rapid" || move._tag === "Linear" || move._tag === "Arc") from = move.to
    return moves.length
  })
}

/** A program that was not parsed: each toolpath's spindle turns clockwise at its rpm (off at 0), XY plane, nothing extruded. */
export const motionTrackFromProgram = (program: Program): MotionTrack => {
  const counts = expandedCounts(program)
  return {
    paths: program.toolpaths.map((path, index) => ({
      count: counts[index]!,
      runs: [{ start: 0, spindle: path.spindleRpm > 0 ? "cw" as const : "off" as const, rpm: path.spindleRpm, css: false, plane: 17 as const, xMode: "diameter" as const, coolant: path.coolant, feedMode: "min" as const }]
    })),
    unsupported: []
  }
}

/** The track describes this program (same toolpaths, same expanded move counts); a stale one must not be used. */
export const trackFits = (track: MotionTrack, program: Program): boolean => {
  if (track.paths.length !== program.toolpaths.length) return false
  const counts = expandedCounts(program)
  return track.paths.every((p, i) => p.count === counts[i] && p.runs.length > 0 && p.runs[0]!.start === 0 &&
    (p.extrude === undefined || p.extrude.length === p.count) && (p.lines === undefined || p.lines.length === p.count) && (p.rpm === undefined || p.rpm.length === p.count))
}

/** The track to play `program` with: the given one when it fits, else the one derived from the program itself. */
export const trackFor = (program: Program, track: MotionTrack | undefined): MotionTrack =>
  track !== undefined && trackFits(track, program) ? track : motionTrackFromProgram(program)

const OFF: MotionState = { spindle: "off", rpm: 0, css: false, plane: 17, xMode: "diameter", tool: undefined, coolant: "off", feedMode: "min", extrude: 0, line: undefined }

/** State of move `index` of toolpath `path`. Out-of-range indices read as a stopped machine. */
export const stateAt = (track: MotionTrack, path: number, index: number): MotionState => {
  const p = track.paths[path]
  if (p === undefined || index < 0 || index >= p.count) return OFF
  let lo = 0, hi = p.runs.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (p.runs[mid]!.start <= index) lo = mid; else hi = mid - 1 }
  const run = p.runs[lo]!
  return {
    spindle: run.spindle, rpm: p.rpm?.[index] ?? run.rpm, css: run.css, plane: run.plane, xMode: run.xMode, tool: run.tool,
    coolant: run.coolant, feedMode: run.feedMode, extrude: p.extrude?.[index] ?? 0, line: p.lines?.[index]
  }
}
