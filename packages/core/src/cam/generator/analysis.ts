/**
 * G-code text -> statistics and machine-neutral IR.
 *
 * The viewport and the simulator draw the IR, so generated (or pasted) text is replayed through the
 * reference interpreter and rebuilt as a `Program`: one `Toolpath`, rapids / feed moves / arcs / dwells.
 * Words the interpreter does not know (tool compensation, G64, lathe planes, extruder axes) come back as
 * warnings, never as a failure: a preview of a partial program is still useful.
 */
import { interpretGcode, type GSegment } from "../testing/gcode-interpreter.ts"
import { headerTools } from "../testing/header-tools.ts"
import { makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import type { GcodeStats } from "./schema.ts"
import { motionTrackOf, type MotionTrack } from "../viewer/motion-track.ts"

/** Rapid traverse used for time estimates, mm/min. */
export const DEFAULT_RAPID_RATE = 5000

const moveOf = (segment: GSegment): Move | undefined => {
  switch (segment.kind) {
    case "rapid": return segment.rotary === undefined
      ? { _tag: "Rapid", to: segment.to }
      : { _tag: "Rapid", to: segment.to, rotary: segment.rotary }
    case "linear": return { _tag: "Linear", to: segment.to, feed: Math.max(1, segment.feed), ...(segment.rotary !== undefined ? { rotary: segment.rotary } : {}) }
    case "arc": return { _tag: "Arc", to: segment.to, center: segment.center, clockwise: segment.clockwise, feed: Math.max(1, segment.feed) }
    case "dwell": return { _tag: "Dwell", seconds: segment.seconds }
  }
}

const spindleOf = (gcode: string): number => {
  const m = gcode.match(/\bM0?[34]\b[^\n;]*?\bS(\d+(?:\.\d+)?)/i) ?? gcode.match(/\bS(\d+(?:\.\d+)?)[^\n;]*?\bM0?[34]\b/i)
  return m ? Number(m[1]) : 0
}

export interface Analysis {
  readonly stats: GcodeStats
  readonly warnings: ReadonlyArray<string>
  readonly program: Program
  /** Machine state of every move of `program` (spec 31 §4.4). */
  readonly motion: MotionTrack
}

export const analyseGcode = (gcode: string, name = "Program", rapidRate = DEFAULT_RAPID_RATE): Analysis => {
  // The preview replays probing moves too (to their search limit); the verifier's own replay does not.
  const result = interpretGcode(gcode, { track: true, probeMoves: true })
  const moves: Move[] = []
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  let seconds = 0
  const grow = (p: { x: number; y: number; z: number }): void => {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z)
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z)
  }
  for (const segment of result.segments) {
    const move = moveOf(segment)
    if (move) moves.push(move)
    if (segment.kind === "dwell") { seconds += segment.seconds; continue }
    grow(segment.from)
    grow(segment.to)
    const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y, segment.to.z - segment.from.z)
    seconds += segment.kind === "rapid" ? (length / Math.max(1e-9, rapidRate)) * 60 : (length / Math.max(1, segment.feed)) * 60
  }
  const empty = !Number.isFinite(min.x)
  const zero = { x: 0, y: 0, z: 0 }
  // A program that changes tools mid-way is one toolpath per tool (spec 32 §4.8): the preview colours, lists and draws each
  // tool's moves apart. One tool keeps the single toolpath `gcode` / `tool` it always was.
  const states = result.states ?? []
  const groups: Array<{ readonly start: number; readonly end: number; readonly tool: number | undefined }> = []
  states.forEach((st, i) => {
    const last = groups[groups.length - 1]
    if (last === undefined) groups.push({ start: 0, end: 1, tool: st.tool })
    else if (st.tool !== undefined && last.tool !== undefined && st.tool !== last.tool) groups.push({ start: i, end: i + 1, tool: st.tool })
    else groups[groups.length - 1] = { ...last, end: i + 1, tool: last.tool ?? st.tool }
  })
  const header = headerTools(gcode)
  const split = groups.length > 1 && moves.length === states.length
  const toolpaths: Toolpath[] = !split
    ? [{ id: "gcode", name, toolId: "tool", spindleRpm: spindleOf(gcode), coolant: /\bM0?8\b/.test(gcode) ? "flood" : "off", moves }]
    : groups.map((g, k): Toolpath => {
      const own = states.slice(g.start, g.end)
      const described = g.tool !== undefined ? header.byTool.get(g.tool)?.description : undefined
      return {
        id: `gcode-${k + 1}`,
        name: g.tool !== undefined ? `T${g.tool}${described !== undefined ? ` ${described}` : ""}` : name,
        toolId: g.tool !== undefined ? `T${g.tool}` : "tool",
        spindleRpm: own.find((st) => st.rpm > 0)?.rpm ?? 0,
        coolant: own.some((st) => st.coolant === "flood") ? "flood" : own.some((st) => st.coolant === "mist") ? "mist" : "off",
        moves: moves.slice(g.start, g.end)
      }
    })
  return {
    stats: {
      lines: gcode.split(/\r?\n/).filter(line => line.trim().length > 0).length,
      cutLength: result.cutLength,
      rapidLength: result.rapidLength,
      minZ: Number.isFinite(result.minZ) ? result.minZ : 0,
      maxZ: empty ? 0 : max.z,
      estimatedSeconds: seconds,
      bounds: empty ? { min: zero, max: zero } : { min, max }
    },
    warnings: result.errors,
    program: makeProgram(name || "Program", moves.length > 0 ? toolpaths : []),
    motion: moves.length > 0 ? motionTrackOf(states, result.unsupported, split ? groups.map((g) => g.end - g.start) : [states.length]) : { paths: [], unsupported: result.unsupported }
  }
}
