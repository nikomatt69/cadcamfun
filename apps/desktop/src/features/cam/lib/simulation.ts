/**
 * The simulation player's navigation (spec 32 §4.8), pure so the page tests can drive it: step one move or one operation,
 * where the tool changes, where the set-up findings happen, which operation and move are playing, and the machine readout
 * (program position, rotary angles, feed, spindle, tool, what the move is for).
 */
import { cam } from "@cadcamfun/core"

const EPS = 1e-9

/** The start of the next (dir 1) or previous (dir -1) move from `seconds`; a step back from inside a move goes to its start. */
export const stepMove = (timeline: cam.viewer.Timeline, seconds: number, dir: 1 | -1): number => {
  const moves = timeline.moves
  if (moves.length === 0) return 0
  const i = Math.min(cam.viewer.timedIndexAt(timeline, seconds), moves.length - 1)
  const current = moves[i]!
  if (dir === 1) {
    // The index found is the move playing at `seconds`, or the one ending exactly there.
    let j = i
    while (j < moves.length && moves[j]!.start <= seconds + EPS) j++
    return j < moves.length ? moves[j]!.start : timeline.duration
  }
  if (seconds > current.start + EPS) return current.start
  for (let j = i - 1; j >= 0; j--) if (moves[j]!.start < current.start - EPS) return moves[j]!.start
  return 0
}

/** The start of the next / previous operation (toolpath); back from inside an operation goes to its start. */
export const stepOperation = (spans: ReadonlyArray<cam.viewer.OperationSpan>, seconds: number, dir: 1 | -1, duration: number): number => {
  if (spans.length === 0) return 0
  if (dir === 1) return spans.find((s) => s.start > seconds + EPS)?.start ?? duration
  const current = [...spans].reverse().find((s) => s.start <= seconds + EPS)
  if (current === undefined) return 0
  if (seconds > current.start + EPS) return current.start
  return [...spans].reverse().find((s) => s.start < current.start - EPS)?.start ?? 0
}

/** The operation playing at `seconds` (index into `spans`). */
export const operationAt = (spans: ReadonlyArray<cam.viewer.OperationSpan>, seconds: number): number => {
  for (let i = spans.length - 1; i >= 0; i--) if (spans[i]!.start <= seconds + EPS) return i
  return 0
}

/** Times where the next operation uses another tool than the one before it. */
export const toolChangeTimes = (program: cam.Program, spans: ReadonlyArray<cam.viewer.OperationSpan>): number[] => {
  const out: number[] = []
  for (let i = 1; i < spans.length; i++) {
    const a = program.toolpaths[spans[i - 1]!.path]?.toolId, b = program.toolpaths[spans[i]!.path]?.toolId
    if (a !== b) out.push(spans[i]!.start)
  }
  return out
}

/** Where on the clock each finding with a source line happens (its first move), for the timeline's markers. */
export const findingTimes = (timeline: cam.viewer.Timeline, findings: ReadonlyArray<{ readonly line?: number; readonly severity: string; readonly message: string }>): ReadonlyArray<{ readonly seconds: number; readonly severity: string; readonly message: string }> =>
  findings.flatMap((f) => {
    const seconds = f.line !== undefined ? cam.viewer.timeOfLine(timeline, f.line) : undefined
    return seconds === undefined ? [] : [{ seconds, severity: f.severity, message: f.message }]
  })

export interface Readout {
  readonly program: { readonly x: number; readonly y: number; readonly z: number }
  readonly angles: { readonly a?: number; readonly b?: number; readonly c?: number }
  /** mm/min of the move playing; 0 for a rapid or a dwell. */
  readonly feed: number
  readonly rapid: boolean
  readonly spindle: "cw" | "ccw" | "off"
  readonly rpm: number
  readonly tool: number | undefined
  readonly line: number | undefined
  readonly klass: cam.viewer.MoveClass | undefined
  readonly operation: number
}

/** The machine readout at `seconds` (the DRO of the player). */
export const readoutAt = (timeline: cam.viewer.Timeline, classes: ReadonlyArray<cam.viewer.MoveClass>, seconds: number): Readout | undefined => {
  if (timeline.moves.length === 0) return undefined
  const pose = cam.viewer.poseAt(timeline, seconds)
  const i = Math.min(cam.viewer.timedIndexAt(timeline, seconds), timeline.moves.length - 1)
  const m = timeline.moves[i]!
  const length = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z)
  return {
    program: pose.point, angles: pose.angles,
    feed: m.kind === "feed" && m.duration > 0 ? (length / m.duration) * 60 : 0,
    rapid: m.kind === "rapid",
    spindle: m.state.spindle, rpm: m.state.rpm, tool: m.state.tool, line: m.state.line,
    klass: classes[i], operation: m.path
  }
}

/** Source lines around `line` for the NC strip: `before` above and `after` below, 1-based numbers. */
export const ncWindow = (gcode: string, line: number | undefined, before = 2, after = 3): ReadonlyArray<{ readonly line: number; readonly text: string; readonly current: boolean }> => {
  if (line === undefined) return []
  const lines = gcode.split(/\r?\n/)
  const from = Math.max(1, line - before), to = Math.min(lines.length, line + after)
  const out: Array<{ line: number; text: string; current: boolean }> = []
  for (let n = from; n <= to; n++) out.push({ line: n, text: lines[n - 1] ?? "", current: n === line })
  return out
}
