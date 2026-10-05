/**
 * The shared G-code emitter (spec 04-core-cam.md §4).
 *
 * Modal output is produced **while emitting**, never by re-reading strings
 * afterwards (legacy bug 8): the writer knows the machine state at every word it
 * writes — motion mode, rounded position, feed, cycle parameters — and suppresses
 * exactly the words that did not change. A move that would not move anything
 * after rounding is skipped without touching the modal state, so a `G1` after a
 * `G0` to the same point is never confused with it, and a `G1` back to the
 * position before an arc is never dropped.
 */
import { arcSegmentCount } from "../../cad/arc-math.ts"
import type { Vec3 } from "../../cad/vec.ts"
import {
  type ArcMove,
  type CycleMove,
  type Move,
  type Program,
  type Toolpath,
  arcSweepBetween,
  expandCycle,
  isFullCircle,
  moveTarget
} from "../ir.ts"
import { type ArcMode, type Dialect, type PostOptions, defaultPostOptions } from "./types.ts"

const MM_PER_INCH = 25.4

/** Fixed-decimal number; `-0.000` becomes `0.000`; zero decimals keep a trailing dot (control convention). */
export const formatNumber = (value: number, decimals: number): string => {
  const fixed = value.toFixed(decimals)
  const text = Number(fixed) === 0 ? (0).toFixed(decimals) : fixed
  return decimals === 0 ? `${text}.` : text
}

const formatFeed = (feed: number, decimals: number): string =>
  Math.abs(feed - Math.round(feed)) < 1e-9 ? String(Math.round(feed)) : formatNumber(feed, decimals)

/** ASCII-only comment text without parentheses, which would end the comment early. */
export const sanitizeComment = (text: string, upper: boolean): string => {
  const clean = text
    .replace(/[()]/g, " ")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim()
  return upper ? clean.toUpperCase() : clean
}

const CYCLE_CODE: Record<CycleMove["cycle"], string> = {
  drill: "G81",
  dwell: "G82",
  peck: "G83",
  chipBreak: "G73"
}

/** Maps tool ids to tool numbers: numeric ids are used as is, otherwise numbers follow first use. */
export const toolNumbers = (program: Program): Map<string, number> => {
  const ids: string[] = []
  for (const tp of program.toolpaths) if (!ids.includes(tp.toolId)) ids.push(tp.toolId)
  const allNumeric = ids.every((id) => /^\d+$/.test(id) && Number(id) > 0)
  const map = new Map<string, number>()
  ids.forEach((id, i) => map.set(id, allNumeric ? Number(id) : i + 1))
  return map
}

class Writer {
  readonly lines: string[] = []
  private blockNumber: number
  private readonly step: number
  private readonly numbered: boolean
  // Machine state, in output units and as rounded by the formatter.
  private px: number | undefined
  private py: number | undefined
  private pz: number | undefined
  private motion: string | undefined
  private feed: string | undefined
  private retractMode: string | undefined
  private cycle: { code: string; z?: string; r?: string; q?: string; p?: string } | undefined
  // True IR position (mm), for arc geometry and cycle expansion.
  ir: Vec3 | undefined
  spindleRpm = 0
  coolant: "off" | "flood" | "mist" = "off"
  tool = 0
  readonly scale: number

  constructor(
    private readonly options: PostOptions,
    private readonly dialect: Dialect,
    private readonly arcMode: ArcMode,
    units: "mm" | "inch"
  ) {
    this.numbered = options.lineNumbers !== undefined
    this.blockNumber = options.lineNumbers?.start ?? 0
    this.step = options.lineNumbers?.step ?? 0
    this.scale = units === "inch" ? 1 / MM_PER_INCH : 1
  }

  raw(line: string): void {
    this.lines.push(line)
  }

  comment(text: string): void {
    const clean = sanitizeComment(text, this.dialect.uppercaseComments)
    if (clean.length > 0) this.lines.push(`(${clean})`)
  }

  block(...words: ReadonlyArray<string | undefined>): void {
    const present = words.filter((w): w is string => w !== undefined && w.length > 0)
    if (present.length === 0) return
    const text = present.join(" ")
    if (this.numbered) {
      this.lines.push(`N${this.blockNumber} ${text}`)
      this.blockNumber += this.step
    } else {
      this.lines.push(text)
    }
  }

  private num(value: number): string {
    return formatNumber(value * this.scale, this.options.decimals)
  }

  private feedWord(feed: number): string | undefined {
    const text = formatFeed(feed * this.scale, this.options.decimals)
    if (text === this.feed) return undefined
    this.feed = text
    return `F${text}`
  }

  /** Axis words for a target, omitting axes that did not change after rounding. */
  private axes(to: Vec3, forceXY = false): { words: string[]; x: number; y: number; z: number } {
    const xs = this.num(to.x)
    const ys = this.num(to.y)
    const zs = this.num(to.z)
    const x = Number(xs)
    const y = Number(ys)
    const z = Number(zs)
    const words: string[] = []
    if (forceXY || this.px !== x) words.push(`X${xs}`)
    if (forceXY || this.py !== y) words.push(`Y${ys}`)
    if (this.pz !== z) words.push(`Z${zs}`)
    return { words, x, y, z }
  }

  private commit(to: Vec3, x: number, y: number, z: number): void {
    this.px = x
    this.py = y
    this.pz = z
    this.ir = { x: to.x, y: to.y, z: to.z }
  }

  private endCycle(): void {
    if (this.cycle !== undefined) {
      this.block("G80")
      this.cycle = undefined
      this.motion = undefined
    }
  }

  rapid(to: Vec3): void {
    this.endCycle()
    const a = this.axes(to)
    if (a.words.length === 0) {
      this.ir = { ...to }
      return
    }
    this.block(this.motion === "G0" ? undefined : "G0", ...a.words)
    this.motion = "G0"
    this.commit(to, a.x, a.y, a.z)
  }

  linear(to: Vec3, feed: number): void {
    this.endCycle()
    const a = this.axes(to)
    if (a.words.length === 0) {
      this.ir = { ...to }
      return
    }
    this.block(this.motion === "G1" ? undefined : "G1", ...a.words, this.feedWord(feed))
    this.motion = "G1"
    this.commit(to, a.x, a.y, a.z)
  }

  dwell(seconds: number): void {
    this.endCycle()
    const p =
      this.dialect.dwell === "milliseconds"
        ? String(Math.round(seconds * 1000))
        : formatNumber(seconds, this.options.decimals)
    this.block("G4", `P${p}`)
  }

  arc(move: ArcMove): void {
    this.endCycle()
    const from = this.ir
    if (from === undefined) {
      // No known start: a leading arc cannot be expressed; fall back to a straight move.
      this.linear(move.to, move.feed)
      return
    }
    const sweep = arcSweepBetween(from, move.to, move.center, move.clockwise)
    const radius = Math.hypot(from.x - move.center.x, from.y - move.center.y)
    const full = isFullCircle(move, from)
    if (this.arcMode === "linearize") {
      const n = arcSegmentCount(radius, sweep, this.options.tolerance, full ? 8 : 1)
      const a0 = Math.atan2(from.y - move.center.y, from.x - move.center.x)
      const dir = move.clockwise ? -1 : 1
      for (let i = 1; i <= n; i++) {
        if (i === n) {
          this.linear(move.to, move.feed)
        } else {
          const a = a0 + (dir * sweep * i) / n
          this.linear(
            {
              x: move.center.x + radius * Math.cos(a),
              y: move.center.y + radius * Math.sin(a),
              z: from.z + ((move.to.z - from.z) * i) / n
            },
            move.feed
          )
        }
      }
      return
    }
    if (this.arcMode === "radius" && full) {
      // A full circle has no unique R form: two half circles.
      const mid: Vec3 = {
        x: 2 * move.center.x - from.x,
        y: 2 * move.center.y - from.y,
        z: (from.z + move.to.z) / 2
      }
      this.emitArc({ ...move, to: mid }, from, Math.PI)
      this.emitArc(move, mid, Math.PI)
      return
    }
    this.emitArc(move, from, sweep)
  }

  private emitArc(move: ArcMove, from: Vec3, sweep: number): void {
    const a = this.axes(move.to, true)
    const code = move.clockwise ? "G2" : "G3"
    const motionWord = this.motion === code ? undefined : code
    if (this.arcMode === "radius") {
      const r = Math.hypot(from.x - move.center.x, from.y - move.center.y)
      const signed = sweep > Math.PI + 1e-9 ? -r : r
      this.block(motionWord, ...a.words, `R${this.num(signed)}`, this.feedWord(move.feed))
    } else {
      // I/J are relative to the start point *as the control knows it* (the rounded one).
      const sx = this.px ?? from.x * this.scale
      const sy = this.py ?? from.y * this.scale
      const i = formatNumber(move.center.x * this.scale - sx, this.options.decimals)
      const j = formatNumber(move.center.y * this.scale - sy, this.options.decimals)
      this.block(motionWord, ...a.words, `I${i}`, `J${j}`, this.feedWord(move.feed))
    }
    this.motion = code
    this.commit(move.to, a.x, a.y, a.z)
  }

  cycleMove(move: CycleMove): void {
    const from = this.ir ?? { x: move.to.x, y: move.to.y, z: move.retractHeight }
    if (!this.options.useCannedCycles || !this.dialect.canned) {
      for (const m of expandCycle(move, from)) this.move(m)
      return
    }
    const code = CYCLE_CODE[move.cycle]
    if (this.cycle?.code !== code) {
      this.cycle = { code }
    }
    const state = this.cycle!
    const xs = this.num(move.to.x)
    const ys = this.num(move.to.y)
    const words: string[] = []
    if (this.motion !== code) words.push(code)
    if (this.retractMode !== "G99") {
      words.push("G99")
      this.retractMode = "G99"
    }
    if (this.px !== Number(xs)) words.push(`X${xs}`)
    if (this.py !== Number(ys)) words.push(`Y${ys}`)
    const zs = this.num(move.to.z)
    if (state.z !== zs) {
      words.push(`Z${zs}`)
      state.z = zs
    }
    const rs = this.num(move.retractHeight)
    if (state.r !== rs) {
      words.push(`R${rs}`)
      state.r = rs
    }
    if (move.cycle === "peck" || move.cycle === "chipBreak") {
      const q = this.num(move.peckDepth > 0 ? move.peckDepth : move.retractHeight - move.to.z)
      if (state.q !== q) {
        words.push(`Q${q}`)
        state.q = q
      }
    }
    if (move.cycle !== "drill" && move.dwellSeconds > 0) {
      const p =
        this.dialect.dwell === "milliseconds"
          ? String(Math.round(move.dwellSeconds * 1000))
          : formatNumber(move.dwellSeconds, this.options.decimals)
      if (state.p !== p) {
        words.push(`P${p}`)
        state.p = p
      }
    }
    const f = this.feedWord(move.feed)
    if (f !== undefined) words.push(f)
    this.block(...words)
    this.motion = code
    // The control rapids over the hole and returns to the R plane (G99).
    this.px = Number(xs)
    this.py = Number(ys)
    this.pz = Number(rs)
    this.ir = { x: move.to.x, y: move.to.y, z: move.retractHeight }
  }

  move(move: Move): void {
    switch (move._tag) {
      case "Rapid":
        this.rapid(move.to)
        break
      case "Linear":
        this.linear(move.to, move.feed)
        break
      case "Arc":
        this.arc(move)
        break
      case "Dwell":
        this.dwell(move.seconds)
        break
      case "Comment":
        this.comment(move.text)
        break
      case "Cycle":
        this.cycleMove(move)
        break
    }
  }

  finishMotion(): void {
    this.endCycle()
  }
}

const resolveArcMode = (requested: ArcMode, dialect: Dialect): ArcMode => {
  if (requested === "linearize" || dialect.arcModes.includes(requested)) return requested
  return dialect.arcModes.includes("radius") ? "radius" : "linearize"
}

const feedRange = (toolpath: Toolpath): string => {
  let lo = Infinity
  let hi = -Infinity
  for (const m of toolpath.moves) {
    if (m._tag === "Linear" || m._tag === "Arc" || m._tag === "Cycle") {
      lo = Math.min(lo, m.feed)
      hi = Math.max(hi, m.feed)
    }
  }
  if (lo === Infinity) return "none"
  return lo === hi ? `${Math.round(lo)}` : `${Math.round(lo)}-${Math.round(hi)}`
}

export const emitProgram = (program: Program, userOptions: Partial<PostOptions>, dialect: Dialect): string => {
  const options: PostOptions = { ...defaultPostOptions, ...userOptions }
  const w = new Writer(options, dialect, resolveArcMode(options.arcMode, dialect), program.units)
  const numbers = toolNumbers(program)

  for (const line of dialect.begin(program)) w.raw(line)
  if (options.header) {
    w.comment(`PROGRAM: ${program.name}`)
    w.comment(`UNITS: ${program.units === "inch" ? "INCH" : "MM"}`)
    w.comment(`WORK OFFSET: ${program.workOffset}`)
    for (const key of Object.keys(program.metadata ?? {}).sort()) {
      w.comment(`${key}: ${program.metadata?.[key] ?? ""}`)
    }
    if (options.stamp !== undefined) w.comment(`GENERATED: ${options.stamp}`)
    program.toolpaths.forEach((tp, i) => {
      w.comment(`OP ${i + 1}: ${tp.name} | T${numbers.get(tp.toolId)} [${tp.toolId}] | S${Math.round(tp.spindleRpm)} | F${feedRange(tp)}`)
    })
  }
  w.block(program.units === "inch" ? "G20" : "G21", ...dialect.setup)
  w.block(program.workOffset)

  let zMax = -Infinity
  let first = true
  for (const tp of program.toolpaths) {
    w.comment(`OPERATION: ${tp.name}`)
    const n = numbers.get(tp.toolId) ?? 1
    if (n !== w.tool) {
      w.finishMotion()
      if (w.spindleRpm > 0) {
        w.block("M5")
        w.spindleRpm = 0
      }
      if (w.coolant !== "off") {
        w.block("M9")
        w.coolant = "off"
      }
      for (const b of dialect.toolChange(n, first)) w.block(b)
      w.tool = n
    }
    first = false
    if (tp.spindleRpm > 0 && w.spindleRpm !== Math.round(tp.spindleRpm)) {
      w.block("M3", `S${Math.round(tp.spindleRpm)}`)
      w.spindleRpm = Math.round(tp.spindleRpm)
    } else if (tp.spindleRpm === 0 && w.spindleRpm > 0) {
      w.block("M5")
      w.spindleRpm = 0
    }
    if (tp.coolant !== w.coolant) {
      if (w.coolant !== "off") w.block("M9")
      if (tp.coolant !== "off") w.block(tp.coolant === "flood" ? "M8" : "M7")
      w.coolant = tp.coolant
    }
    for (const move of tp.moves) {
      w.move(move)
      const to = moveTarget(move)
      if (to !== undefined && to.z > zMax) zMax = to.z
    }
    w.finishMotion()
  }

  w.finishMotion()
  if (w.ir !== undefined && Number.isFinite(zMax)) w.rapid({ x: w.ir.x, y: w.ir.y, z: Math.max(zMax, w.ir.z) })
  w.block("M5")
  if (w.coolant !== "off") w.block("M9")
  w.block(dialect.end)
  for (const line of dialect.finish) w.raw(line)
  return `${w.lines.join("\n")}\n`
}
