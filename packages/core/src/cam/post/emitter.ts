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
  type OrientMove,
  type Program,
  type Rotary,
  type Toolpath,
  arcSweepBetween,
  expandCycle,
  isFullCircle,
  moveTarget
} from "../ir.ts"
import { type ArcMode, type Dialect, type PostOptions, defaultPostOptions } from "./types.ts"
import { assertCycleSafe } from "../cycle-safety.ts"
import { bodyOf, planSubprograms } from "./subprograms.ts"

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
  chipBreak: "G73",
  tap: "G84",
  ream: "G85",
  bore: "G86"
}

/** Pocket of every tool id: the override where it has a usable number, then the first free number in order of first use. */
const numbered = (ids: ReadonlyArray<string>, override: Readonly<Record<string, number>>): Map<string, number> => {
  const map = new Map<string, number>()
  const taken = new Set<number>()
  for (const id of ids) {
    const pocket = override[id]
    if (pocket !== undefined && Number.isInteger(pocket) && pocket > 0 && !taken.has(pocket)) {
      map.set(id, pocket)
      taken.add(pocket)
    }
  }
  let next = 1
  for (const id of ids) {
    if (map.has(id)) continue
    while (taken.has(next)) next++
    map.set(id, next)
    taken.add(next)
  }
  return map
}

/** Maps tool ids to tool numbers: numeric ids are used as is, otherwise numbers follow first use. */
export const toolNumbers = (program: Program, override?: Readonly<Record<string, number>>): Map<string, number> => {
  const ids: string[] = []
  for (const tp of program.toolpaths) if (!ids.includes(tp.toolId)) ids.push(tp.toolId)
  if (override !== undefined) return numbered(ids, override)
  const allNumeric = ids.every((id) => /^\d+$/.test(id) && Number(id) > 0)
  const map = new Map<string, number>()
  ids.forEach((id, i) => map.set(id, allNumeric ? Number(id) : i + 1))
  return map
}

/** The state a subprogram body leaves the control in. */
interface SubprogramExit {
  readonly motion: string | undefined
  readonly feed: string | undefined
  /** Rounded displacement of the tool over the body, output units. */
  readonly dx: number
  readonly dy: number
  readonly dz: number
}

const shifted = (move: Move, by: Vec3): Move => {
  switch (move._tag) {
    case "Rapid":
    case "Linear":
      return { ...move, to: { x: move.to.x - by.x, y: move.to.y - by.y, z: move.to.z - by.z } }
    case "Arc":
      return { ...move, to: { x: move.to.x - by.x, y: move.to.y - by.y, z: move.to.z - by.z }, center: { x: move.center.x - by.x, y: move.center.y - by.y } }
    default:
      return move
  }
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
  /** Last written angle of each rotary axis. */
  private readonly rotary: Record<string, string> = {}
  private feed: string | undefined
  private retractMode: string | undefined
  /** Tool-centre-point control (`G234` on Haas) active over a simultaneous 5-axis section. */
  private tcpOn = false
  /** High-speed smoothing (`PostOptions.smoothing`) switched on. */
  private smoothingOn = false
  private cycle: { code: string; z?: string; r?: string; q?: string; p?: string } | undefined
  /**
   * Incremental output (`G91`) for the body of a subprogram: the axis words are the change of the rounded position, which
   * starts at the origin of the body's own frame, so the control adds up exactly the positions the absolute text would give.
   */
  incremental = false
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
    units: "mm" | "inch",
    blockStart?: number
  ) {
    this.numbered = options.lineNumbers !== undefined
    this.blockNumber = blockStart ?? options.lineNumbers?.start ?? 0
    this.step = options.lineNumbers?.step ?? 0
    this.scale = units === "inch" ? 1 / MM_PER_INCH : 1
  }

  raw(line: string): void {
    this.lines.push(line)
  }

  comment(text: string): void {
    const clean = sanitizeComment(text, this.dialect.uppercaseComments)
    if (clean.length > 0) this.lines.push(this.dialect.commentStyle === "semicolon" ? `;${clean}` : `(${clean})`)
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
    const word = (letter: string, text: string, value: number, current: number | undefined): string =>
      this.incremental ? `${letter}${formatNumber(value - (current ?? 0), this.options.decimals)}` : `${letter}${text}`
    if (forceXY || this.px !== x) words.push(word("X", xs, x, this.px))
    if (forceXY || this.py !== y) words.push(word("Y", ys, y, this.py))
    if (this.pz !== z) words.push(word("Z", zs, z, this.pz))
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

  rapid(to: Vec3, rotary?: Rotary): void {
    this.endCycle()
    const a = this.axes(to)
    const r = this.rotaryWords(rotary)
    if (a.words.length === 0 && r.length === 0) {
      this.ir = { ...to }
      this.ensureTcp(rotary !== undefined)
      return
    }
    this.ensureTcp(rotary !== undefined)
    this.block(this.motion === "G0" ? undefined : "G0", ...a.words, ...r)
    this.motion = "G0"
    this.commit(to, a.x, a.y, a.z)
  }

  linear(to: Vec3, feed: number, rotary?: Rotary): void {
    this.endCycle()
    const a = this.axes(to)
    const r = this.rotaryWords(rotary)
    if (a.words.length === 0 && r.length === 0) {
      this.ir = { ...to }
      this.ensureTcp(rotary !== undefined)
      return
    }
    this.ensureTcp(rotary !== undefined)
    this.block(this.motion === "G1" ? undefined : "G1", ...a.words, ...r, this.feedWord(feed))
    this.motion = "G1"
    this.commit(to, a.x, a.y, a.z)
  }

  /** Rotary words of a move, only the axes whose rounded angle changed. */
  private rotaryWords(rotary: Rotary | undefined): string[] {
    if (rotary === undefined) return []
    const words: string[] = []
    for (const [letter, value] of [["A", rotary.a], ["B", rotary.b], ["C", rotary.c]] as const) {
      if (value === undefined) continue
      const text = formatNumber(value, this.options.decimals)
      if (this.rotary[letter] === text) continue
      this.rotary[letter] = text
      words.push(`${letter}${text}`)
    }
    return words
  }

  /**
   * Tool-centre-point control, on and off around a simultaneous 5-axis section. Haas `G234` cancels `G43`
   * (and `G43` cancels it), so the two are never active together: the control must always have one of them.
   * A run of rotary moves is bracketed by `G234 H<n>` … `G43 H<n>`, so a plain 3-axis section that follows
   * still runs with tool length compensation.
   */
  private ensureTcp(want: boolean): void {
    const code = this.dialect.tcp
    if (code === undefined || this.options.tcp === false || want === this.tcpOn) return
    if (want) {
      if (typeof code === "string") this.block(code, `H${this.tool}`)
      else this.block(code.on(this.tool))
      this.tcpOn = true
    } else {
      if (typeof code === "string") this.block("G43", `H${this.tool}`)
      else this.block(code.off(this.tool))
      this.tcpOn = false
    }
  }

  /** Rotary positioning (degrees, never converted to inches): only the axes that changed are written. */
  orient(move: OrientMove): void {
    this.endCycle()
    const words: string[] = []
    for (const [letter, value] of [["A", move.a], ["B", move.b], ["C", move.c]] as const) {
      if (value === undefined) continue
      const text = formatNumber(value, this.options.decimals)
      if (this.rotary[letter] === text) continue
      this.rotary[letter] = text
      words.push(`${letter}${text}`)
    }
    if (words.length === 0) return
    this.block(this.motion === "G0" ? undefined : "G0", ...words)
    this.motion = "G0"
  }

  dwell(seconds: number): void {
    this.endCycle()
    const p =
      this.dialect.dwell === "milliseconds"
        ? String(Math.round(seconds * 1000))
        : formatNumber(seconds, this.options.decimals)
    this.block("G4", `${this.dialect.dwellWord ?? "P"}${p}`)
  }

  arc(move: ArcMove): void {
    this.endCycle()
    const from = this.ir
    if (from === undefined) {
      throw new RangeError("Arc requires a known start position")
    }
    const sweep = arcSweepBetween(from, move.to, move.center, move.clockwise)
    const radius = Math.hypot(from.x - move.center.x, from.y - move.center.y)
    const endRadius = Math.hypot(move.to.x - move.center.x, move.to.y - move.center.y)
    if (![from.x, from.y, from.z, move.to.x, move.to.y, move.to.z, move.center.x, move.center.y, move.feed, radius, endRadius].every(Number.isFinite) ||
      radius <= 0 || move.feed <= 0 || Math.abs(radius - endRadius) > 1e-6) {
      throw new RangeError("Arc requires finite geometry, positive radius/feed and matching endpoint radii")
    }
    const full = isFullCircle(move, from)
    const collapsed = !full && Number(this.num(move.to.x)) === this.px && Number(this.num(move.to.y)) === this.py
    // A control without helical interpolation in one block gets the helix as lines (its Z changes after rounding).
    const helix = this.dialect.arcLimits?.helical === false && Number(this.num(move.to.z)) !== (this.pz ?? Number(this.num(from.z)))
    if (this.arcMode === "linearize" || collapsed || helix) {
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
    if (full && (this.arcMode === "radius" || this.dialect.arcLimits?.fullCircle === false)) {
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
    assertCycleSafe(move)
    const from = this.ir ?? { x: move.to.x, y: move.to.y, z: move.retractHeight }
    if (move.cycle === "tap" && (!this.options.useCannedCycles || !this.dialect.canned || this.dialect.rigidTap === undefined)) {
      throw new RangeError(`${this.dialect.id}: rigid tapping needs the control's G84 cycle (canned cycles on); mill the thread instead`)
    }
    if (move.cycle === "tap" && this.spindleRpm > 0 && Math.abs(move.feed - move.pitch! * this.spindleRpm) > 1e-6 * move.feed + 1e-9) {
      throw new RangeError(`Tapping feed ${move.feed} mm/min is not the pitch ${move.pitch} x ${this.spindleRpm} rpm: the tap would strip the thread`)
    }
    if (!this.options.useCannedCycles || !this.dialect.canned) {
      for (const m of expandCycle(move, from)) this.move(m)
      return
    }
    if (from.z < move.retractHeight) this.rapid({ ...from, z: move.retractHeight })
    const code = this.dialect.cycleCodes?.[move.cycle] ?? CYCLE_CODE[move.cycle]
    if (this.cycle?.code !== code) {
      // Rigid tapping is entered from the cancelled state, with its prefix block (the spindle switches to position control).
      if (move.cycle === "tap") {
        this.endCycle()
        const prefix = this.dialect.rigidTap?.prefix?.(this.spindleRpm)
        if (prefix !== undefined) this.block(prefix)
      }
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
    if (move.cycle !== "drill" && (move.cycle === "dwell" || move.dwellSeconds > 0 || state.p !== undefined)) {
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
    // A bare modal repeat can be empty (same hole/feed/depth), losing a requested cycle.
    if (words.length === 0) words.push(code)
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
        this.rapid(move.to, move.rotary)
        break
      case "Linear":
        this.linear(move.to, move.feed, move.rotary)
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
      case "Orient":
        this.orient(move)
        break
    }
  }

  finishMotion(): void {
    this.endCycle()
  }

  /** The number the next numbered block gets. */
  nextBlock(): number {
    return this.blockNumber
  }

  /** Starts a subprogram body: the tool is at the origin of the body's frame, with no motion mode or feed set yet. */
  startBody(): void {
    this.px = 0
    this.py = 0
    this.pz = 0
    this.ir = { x: 0, y: 0, z: 0 }
    this.motion = undefined
    this.feed = undefined
  }

  /** What a body leaves behind: the modal motion code and feed, and the total rounded displacement. */
  bodyExit(): SubprogramExit {
    return { motion: this.motion, feed: this.feed, dx: this.px ?? 0, dy: this.py ?? 0, dz: this.pz ?? 0 }
  }

  /**
   * Calls a subprogram right after the positioning move. The control ends up where the body's increments add up to from here,
   * with the modal motion code and feed the body left; `end` is the true end point of the toolpath the call replaces.
   */
  call(text: string, exit: SubprogramExit, end: Vec3 | undefined): void {
    this.endCycle()
    this.block(text)
    const d = this.options.decimals
    this.px = Number(((this.px ?? 0) + exit.dx).toFixed(d))
    this.py = Number(((this.py ?? 0) + exit.dy).toFixed(d))
    this.pz = Number(((this.pz ?? 0) + exit.dz).toFixed(d))
    this.motion = exit.motion
    this.feed = exit.feed
    if (end !== undefined) this.ir = { ...end }
  }

  /** Switches the control's contour smoothing on (once per operation) or off (before a tool change, at the end). */
  smoothing(want: boolean): void {
    const spec = this.dialect.smoothing
    const tolerance = this.options.smoothing
    if (spec === undefined || tolerance === undefined || want === this.smoothingOn) return
    if (want) {
      if (!(Number.isFinite(tolerance) && tolerance > 0)) throw new RangeError(`Smoothing tolerance must be a positive number of millimetres, not ${tolerance}`)
      // The tolerance in program units, never rounded to zero by a coarse output format.
      const text = String(Number((tolerance * this.scale).toPrecision(3)))
      for (const b of spec.on(text)) this.block(b)
    } else {
      for (const b of spec.off) this.block(b)
    }
    this.smoothingOn = want
  }

  /**
   * Closes a simultaneous 5-axis section at the end of the program: the control must not be left with
   * tool-centre-point control active (it is cancelled at `M30` on Haas, but a reader expects to see it).
   */
  endTcp(): void {
    if (!this.tcpOn) return
    const code = this.dialect.tcp
    this.block(typeof code === "object" ? (code.end ?? code.off)(this.tool) : "G49")
    this.tcpOn = false
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

const carriesRotary = (move: Move): boolean =>
  (move._tag === "Rapid" || move._tag === "Linear") && move.rotary !== undefined

/**
 * Fails closed on a program this dialect cannot express:
 *  - a 3-axis dialect (grbl) must never lose rotary angles silently: the machine would cut somewhere else;
 *  - a toolpath may not mix a positioned `Orient` (3+2, machine coordinates) with moves that carry rotary
 *    angles (simultaneous, work coordinates): the two frames do not compose.
 */
const rejectUnwritable = (program: Program, dialect: Dialect): void => {
  for (const toolpath of program.toolpaths) {
    const simultaneous = toolpath.moves.some(carriesRotary)
    const indexed = toolpath.moves.some((m) => m._tag === "Orient")
    if (simultaneous && indexed) {
      throw new RangeError(`Toolpath "${toolpath.name}" mixes positioned rotary axes (3+2) with simultaneous rotary motion: split it into two operations`)
    }
    if (simultaneous && !dialect.rotary) {
      throw new RangeError(`Toolpath "${toolpath.name}" drives rotary axes, which the ${dialect.id} post cannot write: use a 5-axis post (haas) or a 3-axis operation`)
    }
  }
}

export const emitProgram = (program: Program, userOptions: Partial<PostOptions>, dialect: Dialect): string => {
  rejectUnwritable(program, dialect)
  const options: PostOptions = { ...defaultPostOptions, ...userOptions }
  const w = new Writer(options, dialect, resolveArcMode(options.arcMode, dialect), program.units)
  const numbers = toolNumbers(program, options.toolNumbers)
  const spec = options.subprograms === true ? dialect.subprograms : undefined
  const unit = Math.pow(10, -options.decimals) * (program.units === "inch" ? MM_PER_INCH : 1)
  const plan = spec === undefined ? undefined : planSubprograms(program, spec.first(program), spec.last, unit)

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
    for (const g of plan?.groups ?? []) w.comment(`SUBPROGRAM O${g.number}: ${program.toolpaths[g.leader]!.name} X${g.members.length}`)
  }
  w.block(program.units === "inch" ? (dialect.unitCodes?.inch ?? "G20") : (dialect.unitCodes?.mm ?? "G21"), ...dialect.setup)
  w.block(dialect.workOffset?.(program.workOffset) ?? program.workOffset)

  let zMax = -Infinity
  let first = true
  // A subprogram body is written once, in its own incremental frame, from the motion of the toolpath that leads its group.
  // The first call needs only what it leaves the control in; the text is written after the main program, numbered on from it.
  const buildBody = (gi: number, blockStart: number): { readonly lines: ReadonlyArray<string>; readonly exit: SubprogramExit; readonly next: number } => {
    const group = plan!.groups[gi]!
    const source = bodyOf(program.toolpaths[group.leader]!)!
    const b = new Writer(options, dialect, resolveArcMode(options.arcMode, dialect), program.units, blockStart)
    b.incremental = true
    b.raw(spec!.begin(group.number))
    b.block("G91")
    b.startBody()
    // The body is written about the rounded positioning point, the position the control is really at: rounding then commutes
    // with the translation of a copy, so a copy at a whole number of output steps is exactly its own text.
    const snap = (v: number): number => Number((v * b.scale).toFixed(options.decimals)) / b.scale
    const origin = { x: snap(source.origin.x), y: snap(source.origin.y), z: snap(source.origin.z) }
    for (const move of source.body) b.move(shifted(move, origin))
    b.finishMotion()
    const exit = b.bodyExit()
    b.block("G90")
    b.block(spec!.end)
    return { lines: b.lines, exit, next: b.nextBlock() }
  }
  const exits = new Map<number, SubprogramExit>()
  for (const [ti, tp] of program.toolpaths.entries()) {
    w.comment(`OPERATION: ${tp.name}`)
    const n = numbers.get(tp.toolId) ?? 1
    if (n !== w.tool) {
      w.finishMotion()
      w.smoothing(false)
      // A changer pulls the tool out of the spindle: it must be above the deepest point the
      // program has already reached, not inside the previous operation's cut.
      if (options.retractBeforeToolChange && w.ir !== undefined && w.ir.z < zMax - 1e-9) w.rapid({ x: w.ir.x, y: w.ir.y, z: zMax })
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
    w.smoothing(true)
    const call = plan?.callOf.get(ti)
    if (call === undefined) {
      for (const move of tp.moves) {
        w.move(move)
        const to = moveTarget(move)
        if (to !== undefined && to.z > zMax) zMax = to.z
      }
    } else {
      // The positioning move as usual, then one block in place of the rest of the toolpath.
      tp.moves.forEach((move, mi) => {
        if (mi <= call.head) w.move(move)
        const to = moveTarget(move)
        if (to !== undefined && to.z > zMax) zMax = to.z
      })
      let exit = exits.get(call.group)
      if (exit === undefined) {
        exit = buildBody(call.group, 0).exit
        exits.set(call.group, exit)
      }
      const last = [...tp.moves].reverse().map(moveTarget).find((p) => p !== undefined)
      w.call(spec!.call(plan!.groups[call.group]!.number), exit, last)
    }
    w.finishMotion()
  }

  w.finishMotion()
  if (w.ir !== undefined && Number.isFinite(zMax)) w.rapid({ x: w.ir.x, y: w.ir.y, z: Math.max(zMax, w.ir.z) })
  // Leave the control with tool length compensation, never with tool-centre-point control still on
  // (Haas cancels it at M30 too, but a clean end block is what an operator expects to read).
  w.endTcp()
  w.smoothing(false)
  w.block("M5")
  if (w.coolant !== "off") w.block("M9")
  w.block(dialect.end)
  // Subprograms follow the end of the main program and precede the closing delimiter.
  let next = w.nextBlock()
  for (const gi of [...exits.keys()].sort((a, b) => a - b)) {
    const built = buildBody(gi, next)
    w.lines.push(...built.lines)
    next = built.next
  }
  for (const line of dialect.finish) w.raw(line)
  return `${w.lines.join("\n")}\n`
}
