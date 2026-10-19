/**
 * What each move of a program is for (spec 32 §4.4), read from its geometry on the playback timeline, so imported programs
 * get it as well as generated ones:
 *
 *   rapid      G0 across                         retract   going up (G0 or feed) with no XY travel, or a feed back out
 *   plunge     feed straight down                 ramp      feed down while travelling (helix, zig-zag ramp)
 *   lead-in    a feed arc between the descent and the first cut     lead-out  a feed arc between the last cut and the way up
 *   cut        feed at one height in the material                   link      feed above the stock top (in the air)
 *   cycle      a canned cycle's strokes (drill, peck, tap, bore)    probe     a touch-probe move
 *   dwell      a G4 / cycle dwell
 *
 * A lathe's Z is its spindle axis, so heights mean nothing there: its feeds are cuts, the 45° pull-off a retract. A printer's
 * moves are travel (rapid) or deposit (cut).
 */
import type { MachineKind } from "../machine.ts"
import type { Timeline, TimedMove } from "./timeline.ts"

export type MoveClass = "rapid" | "retract" | "plunge" | "ramp" | "lead-in" | "lead-out" | "cut" | "link" | "cycle" | "probe" | "dwell"

export const MOVE_CLASSES: ReadonlyArray<MoveClass> = ["rapid", "retract", "plunge", "ramp", "lead-in", "lead-out", "cut", "link", "cycle", "probe", "dwell"]

/** The preview's colour of each class (the move colour mode and its legend). */
export const MOVE_CLASS_COLORS: Readonly<Record<MoveClass, number>> = {
  rapid: 0xef4444, retract: 0x94a3b8, plunge: 0xf97316, ramp: 0xfbbf24, "lead-in": 0x22c55e, "lead-out": 0xa3e635,
  cut: 0x38bdf8, link: 0xe879f9, cycle: 0xa855f7, probe: 0x2dd4bf, dwell: 0xffffff
}

export interface ClassifyOptions {
  readonly kind?: MachineKind
  /** The stock's top, program Z: feed moves wholly above it are links. */
  readonly stockTop?: number
  /** Source lines of canned cycles (`cycleLines`). */
  readonly cycleLines?: ReadonlySet<number>
}

const EPS = 1e-6
const xy = (m: TimedMove): number => Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y)

/** Source lines (1-based) that call a canned cycle: G73, G74, G76, G81-G89 (and the lathe's G74 / G75 / G76 pecks and threads). */
export const cycleLinesOf = (gcode: string): ReadonlySet<number> => {
  const out = new Set<number>()
  let modal = false
  gcode.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").toUpperCase()
    const g = [...text.matchAll(/G\s*0*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    if (g.some((v) => v === 73 || v === 74 || v === 75 || v === 76 || (v >= 81 && v <= 89))) modal = true
    else if (g.some((v) => v === 80 || v === 0 || v === 1 || v === 2 || v === 3)) modal = false
    if (modal && /[XYZ]\s*[-+.\d]/.test(text)) out.add(i + 1)
  })
  return out
}

/** The class of every move of the timeline, in its order. */
export const classifyMoves = (timeline: Timeline, options: ClassifyOptions = {}): MoveClass[] => {
  const moves = timeline.moves
  const kind = options.kind ?? "mill"
  const base: MoveClass[] = moves.map((m) => {
    if (m.kind === "dwell") return "dwell"
    if (m.state.probe) return "probe"
    if (kind === "3dprinter") return m.kind === "rapid" || m.state.extrude <= 0 ? "rapid" : "cut"
    const line = m.state.line
    if (m.kind === "feed" && line !== undefined && options.cycleLines?.has(line)) return "cycle"
    const dz = m.to.z - m.from.z
    if (kind === "lathe") {
      if (m.kind === "rapid") return "rapid"
      // The pull-off after a pass: out radially and back along Z at once.
      return Math.abs(m.to.x) > Math.abs(m.from.x) + EPS && dz > EPS ? "retract" : "cut"
    }
    const travel = xy(m)
    if (m.kind === "rapid") return dz > EPS && travel < EPS ? "retract" : "rapid"
    if (dz > EPS) return "retract"
    if (dz < -EPS) return travel < EPS ? "plunge" : "ramp"
    if (options.stockTop !== undefined && Math.min(m.from.z, m.to.z) > options.stockTop + EPS) return "link"
    return "cut"
  })
  if (kind === "lathe" || kind === "3dprinter") return base
  // Arcs at one height between the descent and the cutting are lead-ins; before the way up, lead-outs.
  const out = [...base]
  for (let i = 0; i < moves.length; i++) {
    if (base[i] !== "cut" || moves[i]!.center === undefined) continue
    const before = base[i - 1], after = base[i + 1]
    if ((before === "plunge" || before === "ramp") && after === "cut") out[i] = "lead-in"
    else if (before === "cut" && (after === "retract" || after === "rapid" || after === undefined)) out[i] = "lead-out"
  }
  return out
}

/** Moves of each class: their count and length, for the legend and the assistant. */
export const moveClassSummary = (timeline: Timeline, classes: ReadonlyArray<MoveClass>): ReadonlyArray<{ readonly kind: MoveClass; readonly count: number; readonly length: number; readonly seconds: number }> => {
  const sums = new Map<MoveClass, { count: number; length: number; seconds: number }>()
  timeline.moves.forEach((m, i) => {
    const c = classes[i]!
    const s = sums.get(c) ?? { count: 0, length: 0, seconds: 0 }
    s.count++
    s.length += Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z)
    s.seconds += m.duration
    sums.set(c, s)
  })
  return MOVE_CLASSES.filter((k) => sums.has(k)).map((k) => ({ kind: k, ...sums.get(k)! }))
}

/** One band per toolpath (operation) on the playback clock: where it starts and ends, and the moves it spans. */
export interface OperationSpan { readonly path: number; readonly start: number; readonly end: number; readonly first: number; readonly last: number }

export const operationSpans = (timeline: Timeline): ReadonlyArray<OperationSpan> => {
  const spans: OperationSpan[] = []
  timeline.moves.forEach((m, i) => {
    const last = spans[spans.length - 1]
    if (last !== undefined && last.path === m.path) spans[spans.length - 1] = { ...last, end: m.start + m.duration, last: i }
    else spans.push({ path: m.path, start: m.start, end: m.start + m.duration, first: i, last: i })
  })
  return spans
}

/** The first moment the timeline plays source line `line` (the NC editor's "go to"), or `undefined`. */
export const timeOfLine = (timeline: Timeline, line: number): number | undefined => timeline.moves.find((m) => m.state.line === line)?.start
