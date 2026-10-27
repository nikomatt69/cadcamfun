/**
 * The NC conversion kernel: G-code (or Klartext) text in, the same motion written by a real post out, proved by replay.
 *
 *   read      the reference interpreter replays the text in the source control's dialect (dwell unit, subprograms, canned
 *             cycles, cutter compensation, frames) into segments with the machine state of each one
 *   rebuild   the segments become a `Program` (one toolpath per tool / speed / coolant run, comments kept in place), refusing
 *             what the IR cannot carry without changing the cut: a reversed spindle (tapping), feed per revolution, constant
 *             surface speed, probing, extrusion, several work offsets
 *   write     the target post emits it with the caller's options (format, arcs, canned cycles, subprograms, smoothing)
 *   prove     the output is replayed in the target's dialect and its feed path compared with the input's, in order: the result
 *             carries the largest distance between the two and fails when it exceeds the output's rounding
 *
 * The figures (lines, bytes, cut and rapid length, dwell, estimated time) are measured on both replays, never estimated from
 * line counts. Nothing is optimised by rewriting text: a shorter program comes from the writer's modal output, the target's
 * canned cycles and subprograms, never from dropping a block.
 */
import { makeProgram, type Move, type Program, type Toolpath, type WorkOffset } from "../ir.ts"
import { interpretGcode, type GSegment, type InterpretResult, type MotionSample } from "../testing/gcode-interpreter.ts"
import { dialectOf, posts } from "./index.ts"
import type { PostId, PostOptions } from "./types.ts"

export interface NcFigures {
  /** Non-empty lines. */
  readonly lines: number
  readonly bytes: number
  /** Feed-move length (lines, arcs, helical rise), mm. */
  readonly cutLength: number
  readonly rapidLength: number
  readonly dwellSeconds: number
  /** Feed time at the programmed feeds, rapids at `rapidFeed`, dwells: seconds. */
  readonly seconds: number
  readonly tools: ReadonlyArray<number>
  readonly minZ: number
}

export interface ConvertOptions {
  /** The control the input is written for: decides the dwell unit the replay reads. Default `generic`. */
  readonly source?: PostId
  readonly target: PostId
  /** Options of the target post. */
  readonly post?: Partial<PostOptions>
  /** Rapid traverse for the time estimate, mm/min. Default 10 000. */
  readonly rapidFeed?: number
  /** Program name (default: the input's `O` number / `BEGIN PGM` name, else `PROGRAM`). */
  readonly name?: string
  /** Carry the input's comments into the output, at their place. Default true. */
  readonly comments?: boolean
}

export interface ConvertResult {
  /** True when the output was written and its replay matches the input. */
  readonly ok: boolean
  /** The converted text; empty when the input could not be read or written. */
  readonly code: string
  readonly program?: Program
  readonly before?: NcFigures
  readonly after?: NcFigures
  /** Largest distance between the input's and the output's feed paths, mm. */
  readonly deviation?: number
  /** Deviation allowed by the output format (rounding, linearised arcs), mm. */
  readonly allowed?: number
  /** Why the conversion failed. */
  readonly errors: ReadonlyArray<string>
  /** What the output does differently from the input, without changing the cut. */
  readonly notes: ReadonlyArray<string>
}

const DEFAULT_RAPID = 10_000

/** Physical lines with the code (comments removed) and the comment text. */
const splitLines = (text: string): ReadonlyArray<{ readonly code: string; readonly comment: string | undefined }> =>
  text.split(/\r?\n/).map((raw) => {
    const comments: string[] = []
    let code = raw.replace(/\(([^)]*)\)/g, (_m, c: string) => { comments.push(c.trim()); return " " })
    const semi = code.indexOf(";")
    if (semi >= 0) { comments.push(code.slice(semi + 1).trim()); code = code.slice(0, semi) }
    const comment = comments.filter((c) => c.length > 0).join(" ")
    return { code: code.trim(), comment: comment.length > 0 ? comment : undefined }
  })

const word = (code: string, letter: string, values: ReadonlyArray<number>): boolean =>
  values.some((v) => new RegExp(`(?:^|[^A-Z])${letter}0*${v}(?![\\d.])`, "i").test(code))

const figuresOf = (text: string, run: InterpretResult, rapidFeed: number): NcFigures => {
  let seconds = 0, dwell = 0
  for (const s of run.segments) {
    if (s.kind === "dwell") { dwell += s.seconds; continue }
    const length = segmentLength(s)
    seconds += s.kind === "rapid" ? (length / rapidFeed) * 60 : (length / Math.max(1e-9, s.feed)) * 60
  }
  return {
    lines: text.split(/\r?\n/).filter((l) => l.trim().length > 0).length,
    bytes: new TextEncoder().encode(text).length,
    cutLength: run.cutLength,
    rapidLength: run.rapidLength,
    dwellSeconds: dwell,
    seconds: seconds + dwell,
    tools: [...new Set(run.tools)],
    minZ: Number.isFinite(run.minZ) ? run.minZ : 0
  }
}

type Motion = Exclude<GSegment, { readonly kind: "dwell" }>
type Arc = Extract<GSegment, { readonly kind: "arc" }>

const sweepOf = (s: Arc): number => {
  const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
  const a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
  let sweep = s.clockwise ? a0 - a1 : a1 - a0
  while (sweep <= 1e-12) sweep += 2 * Math.PI
  return sweep
}

const segmentLength = (s: Motion): number => {
  if (s.kind !== "arc") return Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z)
  return Math.hypot(sweepOf(s) * (s.radiusStart + s.radiusEnd) / 2, s.to.z - s.from.z)
}

/**
 * The centre of an arc whose start and end radii differ by the rounding of the text: moved onto the perpendicular bisector of
 * the chord (the nearest point to the written centre), so both radii agree and the arc is the one the control interpolates
 * within its own tolerance.
 */
const balancedCentre = (s: Arc): { readonly x: number; readonly y: number } => {
  const mx = (s.from.x + s.to.x) / 2, my = (s.from.y + s.to.y) / 2
  const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) return s.center
  const nx = -dy / len, ny = dx / len
  const t = (s.center.x - mx) * nx + (s.center.y - my) * ny
  return { x: mx + t * nx, y: my + t * ny }
}

/** Largest radius mismatch the text's rounding can explain, mm: beyond it the arc is wrong, not rounded. */
const ARC_RADIUS_SLACK = 0.01

interface Read {
  readonly program?: Program
  readonly run?: InterpretResult
  readonly errors: ReadonlyArray<string>
  readonly notes: ReadonlyArray<string>
}

/** Reads NC text into a `Program` the posts can write, or says why the IR cannot carry it unchanged. */
export const programOfNc = (text: string, options: { readonly source?: PostId; readonly name?: string; readonly comments?: boolean } = {}): Read => {
  const errors: string[] = []
  const notes: string[] = []
  const lines = splitLines(text)
  const klartext = /\bBEGIN PGM\b/i.test(text)
  const codes = lines.map((l) => l.code.toUpperCase())

  // Words the replay models as plain moves, which the IR would then write as plain moves: refused, not silently degraded.
  codes.forEach((code, i) => {
    if (klartext) return
    if (word(code, "G", [74, 84]) || /(?:^|[^A-Z])G0*84\.[23](?![\d])/.test(code)) errors.push(`Line ${i + 1}: a tapping cycle reverses the spindle; written as plain moves it would break the tap`)
    else if (word(code, "G", [76, 87, 88])) errors.push(`Line ${i + 1}: a boring cycle with oriented stop or manual retract cannot be written as plain moves`)
    if (word(code, "G", [33, 32])) errors.push(`Line ${i + 1}: spindle-synchronised threading cannot be written as plain moves`)
    if (/(?:^|[^A-Z])G0*(?:38\.[2-5]|31)(?![\d])/.test(code)) errors.push(`Line ${i + 1}: probing moves cannot be converted (where the stylus touches is known only on the machine)`)
  })
  const okuma = options.source === "okuma"
  const offsets = new Set<WorkOffset>()
  for (const code of codes) {
    // Klartext selects a preset row with cycle 247 (Q339); on Okuma G56-G58 are tool length offsets and G15 H<n> selects the
    // work coordinate system.
    if (klartext) for (const m of code.matchAll(/^Q339=\+?0*([1-6])$/g)) offsets.add(`G${53 + Number(m[1])}` as WorkOffset)
    else if (okuma) for (const m of code.matchAll(/(?:^|[^A-Z])G0*15\s*H0*([1-6])(?![\d.])/g)) offsets.add(`G${53 + Number(m[1])}` as WorkOffset)
    else for (const m of code.matchAll(/(?:^|[^A-Z])G0*(5[4-9])(?![\d.])/g)) offsets.add(`G${m[1]}` as WorkOffset)
  }
  if (offsets.size > 1) errors.push(`The program uses several work offsets (${[...offsets].join(", ")}): convert each setup on its own`)
  if (errors.length > 0) return { errors, notes }

  const run = interpretGcode(text, { track: true, okuma, dwell: options.source === undefined ? "seconds" : dialectOf(options.source)?.dwell ?? "seconds" })
  for (const e of run.errors) errors.push(e)
  const states = run.states ?? []
  if (states.length !== run.segments.length) errors.push("The replay could not report the machine state of every move")
  const refuse = (test: (s: MotionSample) => boolean, why: string) => {
    const at = states.find(test)
    if (at !== undefined) errors.push(`Line ${at.line}: ${why}`)
  }
  refuse((s) => s.spindle === "ccw", "the spindle turns counter-clockwise (M4): the posts write M3 only")
  refuse((s) => s.feedMode === "rev", "feed per revolution (G95) is a turning program: the posts write mm/min")
  refuse((s) => s.css, "constant surface speed (G96) is a turning program")
  refuse((s) => s.probe, "probing moves cannot be converted")
  refuse((s) => s.extrude !== 0, "extruder moves are a printer program")
  if (run.segments.length === 0) errors.push("The program has no motion to convert")
  if (errors.length > 0) return { errors, notes, run }

  // Comments, by the physical line they are on; Klartext lines keep their own numbering (one decoded line per line).
  const commentAt = new Map<number, string>()
  if (options.comments !== false) lines.forEach((l, i) => { if (l.comment !== undefined) commentAt.set(i + 1, l.comment) })
  const commentLines = [...commentAt.keys()].sort((a, b) => a - b)
  let nextComment = 0

  const toolpaths: Toolpath[] = []
  let current: { tool: number | undefined; rpm: number; coolant: MotionSample["coolant"]; moves: Move[] } | undefined
  const flush = () => {
    if (current === undefined || current.moves.length === 0) return
    const k = toolpaths.length + 1
    toolpaths.push({ id: `nc-${k}`, name: current.tool !== undefined ? `T${current.tool}` : `Operation ${k}`, toolId: String(current.tool ?? 1), spindleRpm: current.rpm, coolant: current.coolant, moves: current.moves })
  }
  let mended = 0
  run.segments.forEach((segment, i) => {
    const state = states[i]!
    const rpm = state.spindle === "off" ? 0 : Math.round(state.rpm)
    if (current === undefined || state.tool !== current.tool || rpm !== current.rpm || state.coolant !== current.coolant) {
      flush()
      current = { tool: state.tool, rpm, coolant: state.coolant, moves: [] }
    }
    while (nextComment < commentLines.length && commentLines[nextComment]! <= segment.line) {
      current.moves.push({ _tag: "Comment", text: commentAt.get(commentLines[nextComment]!)! })
      nextComment++
    }
    switch (segment.kind) {
      case "dwell":
        if (segment.seconds > 0) current.moves.push({ _tag: "Dwell", seconds: segment.seconds })
        return
      case "rapid":
        current.moves.push({ _tag: "Rapid", to: segment.to, ...(segment.rotary !== undefined ? { rotary: segment.rotary } : {}) })
        return
      case "linear":
        if (!(segment.feed > 0)) { errors.push(`Line ${segment.line}: a feed move without a feed`); return }
        current.moves.push({ _tag: "Linear", to: segment.to, feed: segment.feed, ...(segment.rotary !== undefined ? { rotary: segment.rotary } : {}) })
        return
      case "arc": {
        if (!(segment.feed > 0)) { errors.push(`Line ${segment.line}: an arc without a feed`); return }
        const mismatch = Math.abs(segment.radiusStart - segment.radiusEnd)
        if (mismatch > ARC_RADIUS_SLACK) { errors.push(`Line ${segment.line}: the arc's start and end radii differ by ${mismatch.toFixed(4)} mm`); return }
        const center = mismatch > 1e-7 ? balancedCentre(segment) : segment.center
        if (center !== segment.center) mended++
        current.moves.push({ _tag: "Arc", to: segment.to, center, clockwise: segment.clockwise, feed: segment.feed })
        return
      }
    }
  })
  flush()
  if (errors.length > 0) return { errors, notes, run }

  if (mended > 0) notes.push(`${mended} arcs had start and end radii a rounding apart: their centres were moved onto the chord's bisector (at most ${ARC_RADIUS_SLACK} mm)`)
  if (!klartext && codes.some((c) => word(c, "G", [73, 81, 82, 83, 85, 86, 89]))) notes.push("Canned drilling cycles were replayed as moves; the target writes its own cycles only where it has them and the IR keeps the hole")
  if (codes.some((c) => /(?:^|[^A-Z])M0*98(?![\d.])/.test(c) || /\bCALL LBL\b/.test(c))) notes.push("Subprogram calls were expanded; the `subprograms` option writes repeated toolpaths as subprograms of the target again")
  if (codes.some((c) => word(c, "G", [41, 42]))) notes.push("Cutter radius compensation was applied: the output is the tool-centre path for the compensated radius")
  if (codes.some((c) => word(c, "G", [68]) || /G0*68\.2/.test(c) || /CYCLE800/.test(c))) notes.push("Rotated and tilted frames were applied: the output is in the work offset's own axes")
  if (states.some((s) => s.plane !== 17)) notes.push("Arcs in the G18 / G19 planes were replayed as chords within 0.01 mm")
  if (states.every((s) => s.tool === undefined)) notes.push("The input selects no tool: the output calls tool 1")

  const inch = codes.some((c) => word(c, "G", [20])) && !codes.some((c) => word(c, "G", [21]))
  const number = /^\s*O(\d{1,4})\b/im.exec(text)?.[1]
  const pgm = /\bBEGIN PGM\s+(\S+)/i.exec(text)?.[1]
  const name = options.name ?? pgm ?? (number !== undefined ? `O${number}` : "PROGRAM")
  const program = makeProgram(name, toolpaths, {
    units: inch ? "inch" : "mm",
    ...(offsets.size === 1 ? { workOffset: [...offsets][0]! } : {}),
    ...(number !== undefined ? { metadata: { programNumber: String(Number(number)) } } : {})
  })
  return { program, run, errors, notes }
}

type P = { readonly x: number; readonly y: number; readonly z: number }

/** The feed path as points at most `step` apart, arcs followed exactly, in program order. */
const feedPoints = (segments: ReadonlyArray<GSegment>, step: number): P[] => {
  const out: P[] = []
  for (const s of segments) {
    if (s.kind === "dwell" || s.kind === "rapid") continue
    if (out.length === 0 || Math.hypot(out[out.length - 1]!.x - s.from.x, out[out.length - 1]!.y - s.from.y, out[out.length - 1]!.z - s.from.z) > 1e-9) out.push(s.from)
    if (s.kind !== "arc") {
      const n = Math.max(1, Math.ceil(segmentLength(s) / step))
      for (let i = 1; i <= n; i++) out.push({ x: s.from.x + ((s.to.x - s.from.x) * i) / n, y: s.from.y + ((s.to.y - s.from.y) * i) / n, z: s.from.z + ((s.to.z - s.from.z) * i) / n })
      continue
    }
    const sweep = sweepOf(s), dir = s.clockwise ? -1 : 1
    const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
    const n = Math.max(1, Math.ceil(segmentLength(s) / step))
    for (let i = 1; i <= n; i++) {
      const a = a0 + dir * sweep * (i / n), r = s.radiusStart + ((s.radiusEnd - s.radiusStart) * i) / n
      out.push({ x: s.center.x + r * Math.cos(a), y: s.center.y + r * Math.sin(a), z: s.from.z + ((s.to.z - s.from.z) * i) / n })
    }
  }
  return out
}

const toSegment = (p: P, a: P, b: P): number => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = dx * dx + dy * dy + dz * dz
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy, p.z - a.z - t * dz)
}

/**
 * Largest distance from the points of `a` to the polyline of `b`, matched in order: each point is compared with the stretch of
 * `b` just ahead of the last match, so the cost stays linear and a path that runs the same places in another order fails.
 */
const orderedDeviation = (a: ReadonlyArray<P>, b: ReadonlyArray<P>, window = 400): number => {
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : Infinity
  let worst = 0, j = 0
  for (const p of a) {
    let best = Infinity, at = j
    const end = Math.min(b.length - 1, j + window)
    for (let k = Math.max(0, j); k <= end; k++) {
      const d = k === 0 ? Math.hypot(p.x - b[0]!.x, p.y - b[0]!.y, p.z - b[0]!.z) : toSegment(p, b[k - 1]!, b[k]!)
      if (d < best - 1e-12) { best = d; at = k }
    }
    j = at
    worst = Math.max(worst, best)
  }
  return worst
}

/** Converts NC text for `options.source` into the target post's text, and proves the motion is the same. */
export const convertNc = (text: string, options: ConvertOptions): ConvertResult => {
  const rapidFeed = options.rapidFeed ?? DEFAULT_RAPID
  const read = programOfNc(text, options)
  const before = read.run !== undefined ? figuresOf(text, read.run, rapidFeed) : undefined
  if (read.program === undefined || read.errors.length > 0) return { ok: false, code: "", ...(before !== undefined ? { before } : {}), errors: read.errors, notes: read.notes }
  const post = posts[options.target]
  let code: string
  try {
    code = post.emit(read.program, options.post ?? {})
  } catch (cause) {
    return { ok: false, code: "", program: read.program, ...(before !== undefined ? { before } : {}), errors: [`${post.id}: ${cause instanceof Error ? cause.message : String(cause)}`], notes: read.notes }
  }
  const replay = interpretGcode(code, { dwell: dialectOf(options.target)?.dwell ?? "seconds", okuma: options.target === "okuma" })
  const after = figuresOf(code, replay, rapidFeed)
  const errors = replay.errors.map((e) => `The output does not replay: ${e}`)
  const decimals = options.post?.decimals ?? 3
  const unit = read.program.units === "inch" ? 25.4 : 1
  // Rounding of both texts, and the chords of arcs the target writes as lines (its tolerance), with a hair of float slack.
  const allowed = 2 * Math.pow(10, -decimals) * unit + (options.post?.tolerance ?? 0.01) + 1e-6
  const total = Math.max(before?.cutLength ?? 0, after.cutLength)
  const step = Math.max(0.05, total / 200_000)
  const a = feedPoints(read.run!.segments, step), b = feedPoints(replay.segments, step)
  const deviation = Math.max(orderedDeviation(a, b), orderedDeviation(b, a))
  if (!(deviation <= allowed + step / 2)) errors.push(`The output's feed path departs from the input's by ${Number.isFinite(deviation) ? deviation.toFixed(4) : "an unmatched path"} mm (allowed ${allowed.toFixed(4)} mm)`)
  if (Math.abs(after.minZ - (before?.minZ ?? after.minZ)) > allowed) errors.push(`The output reaches Z ${after.minZ.toFixed(3)}, the input Z ${before!.minZ.toFixed(3)}`)
  return { ok: errors.length === 0, code, program: read.program, ...(before !== undefined ? { before } : {}), after, deviation, allowed, errors, notes: read.notes }
}
