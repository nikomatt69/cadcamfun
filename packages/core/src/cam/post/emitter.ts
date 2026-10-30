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
  isControlNode,
  isFullCircle,
  moveTarget
} from "../ir.ts"
import { type ArcMode, type Dialect, type PlaneCall, type PostOptions, type TiltedPlane, defaultPostOptions } from "./types.ts"
import { prepareFiveAxis, tipMinutesOf } from "./five-axis-frame.ts"
import { frameMatrix, isIdentityPlane } from "./workplane.ts"
import { assertCycleSafe } from "../cycle-safety.ts"
import { bodyOf, planSubprograms } from "./subprograms.ts"
import { KLARTEXT_PREFIX, MacroEmitter, familyOf } from "./macro-syntax.ts"
import { klartextCycle, klartextFixedCycle } from "./klartext-cycles.ts"
import type { WordExpr } from "../macro.ts"

const MM_PER_INCH = 25.4

/** Fixed-decimal number; `-0.000` becomes `0.000`; zero decimals keep a trailing dot (control convention). */
export const formatNumber = (value: number, decimals: number): string => {
  const fixed = value.toFixed(decimals)
  const text = Number(fixed) === 0 ? (0).toFixed(decimals) : fixed
  return decimals === 0 ? `${text}.` : text
}

const formatFeed = (feed: number, decimals: number): string =>
  Math.abs(feed - Math.round(feed)) < 1e-9 ? String(Math.round(feed)) : formatNumber(feed, decimals)

/** Inverse-time feed word (1 / minutes): six significant digits, never rounded to zero by a coarse output format. */
const formatFeedPerMinute = (value: number): string => String(Number(value.toPrecision(6)))

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
  /** The tilted work plane in force (`PostOptions.workPlanes`), if any. */
  plane: TiltedPlane | undefined
  /** Inverse-time feed (`G93`) switched on. */
  private inverse = false
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
  /** Variables, macros and control flow in this control's words (spec 69 G4). */
  readonly macro: MacroEmitter

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
    this.macro = new MacroEmitter(familyOf(dialect.id))
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

  /**
   * Replaces the numeric axis words of the axes `expr` computes by the control's own words (`X[#100+5]`), after the blocks a
   * computed value needs first. The nominal position stays the position the writer tracks, but the control's value is not the
   * rounded number, so the axis is written again on the next numeric move.
   */
  private withExpr(a: { words: string[]; x: number; y: number; z: number }, expr: WordExpr | undefined): void {
    if (expr === undefined) return
    if (this.incremental) throw new RangeError("A computed word cannot be written in a subprogram body that is incremental")
    for (const [key, letter] of [["x", "X"], ["y", "Y"], ["z", "Z"]] as const) {
      const e = expr[key]
      if (e === undefined) continue
      const w = this.macro.word(letter, e)
      for (const line of w.pre) this.macroLine(line)
      const text = `${letter}${w.text}`
      const at = a.words.findIndex((x) => x.startsWith(letter))
      if (at >= 0) a.words[at] = text
      else a.words.push(text)
      if (key === "x") this.px = undefined
      if (key === "y") this.py = undefined
      if (key === "z") this.pz = undefined
    }
  }

  /** One block of a control node: labels and o-words stand on their own, everything else is a block like any other. */
  private macroLine(line: string): void {
    if (line.startsWith(KLARTEXT_PREFIX)) { this.lines.push(line); return }
    if (/^(N\d+|[A-Za-z_][A-Za-z0-9_]*:|o[<\d].*|;.*|\(.*\))$/.test(line)) { this.lines.push(line); return }
    this.block(line)
  }

  controlNode(move: Extract<Move, { readonly _tag: "Assign" | "MacroCall" | "If" | "Else" | "EndIf" | "While" | "EndWhile" | "Label" | "Goto" | "Message" }>): void {
    this.endCycle()
    for (const line of this.macro.node(move)) this.macroLine(line)
    // A branch or a jump leaves the control's modal state unknown to the writer: the next move states its mode and axes again.
    if (move._tag !== "Assign" && move._tag !== "Message" && move._tag !== "MacroCall") this.forgetModalState()
  }

  private forgetModalState(): void {
    this.px = undefined
    this.py = undefined
    this.pz = undefined
    this.motion = undefined
    this.feed = undefined
  }

  rapid(to: Vec3, rotary?: Rotary, expr?: WordExpr): void {
    this.endCycle()
    const a = this.axes(to)
    this.withExpr(a, expr)
    // Tip control first: switching it on checks the rotary axes where they stand, before this move turns them.
    this.ensureTcp(rotary !== undefined)
    const r = this.rotaryWords(rotary)
    if (r.length > 0 && this.tcpOn && this.dialect.tcpLimits?.noRapidRotary === true) {
      // The tip is kept only on feed moves: the same straight line, as G1.
      const feed = this.options.tcpRapidFeed ?? 5000
      if (!(Number.isFinite(feed) && feed > 0)) throw new RangeError(`tcpRapidFeed must be a positive feed, not ${feed}`)
      this.leaveInverse()
      this.block(this.motion === "G1" ? undefined : "G1", ...a.words, ...r, this.feedWord(feed))
      this.motion = "G1"
      this.commit(to, a.x, a.y, a.z)
      return
    }
    if (a.words.length === 0 && r.length === 0) {
      this.ir = { ...to }
      return
    }
    this.block(this.motion === "G0" ? undefined : "G0", ...a.words, ...r)
    this.motion = "G0"
    this.commit(to, a.x, a.y, a.z)
  }

  linear(to: Vec3, feed: number, rotary?: Rotary, expr?: WordExpr, source?: Move): void {
    this.endCycle()
    const a = this.axes(to)
    this.withExpr(a, expr)
    this.ensureTcp(rotary !== undefined)
    const r = this.rotaryWords(rotary)
    if (a.words.length === 0 && r.length === 0) {
      this.ir = { ...to }
      return
    }
    // Inverse-time feed (`PostOptions.inverseTimeFeed`): the move's tip time is known, the word is 1 / minutes and not modal.
    const minutes = this.options.inverseTimeFeed === true && source !== undefined ? tipMinutesOf(source) : undefined
    if (minutes !== undefined && minutes > 0) {
      if (!this.inverse) { this.block(this.dialect.inverseTime!.on); this.inverse = true }
      this.block(this.motion === "G1" ? undefined : "G1", ...a.words, ...r, `F${formatFeedPerMinute(1 / minutes)}`)
      this.motion = "G1"
      this.feed = undefined
      this.commit(to, a.x, a.y, a.z)
      return
    }
    this.leaveInverse()
    let feedWord = this.feedWord(feed)
    if (expr?.feed !== undefined) {
      const w = this.macro.word("F", expr.feed)
      for (const line of w.pre) this.macroLine(line)
      feedWord = `F${w.text}`
      this.feed = undefined
    }
    this.block(this.motion === "G1" ? undefined : "G1", ...a.words, ...r, feedWord)
    this.motion = "G1"
    this.commit(to, a.x, a.y, a.z)
  }

  /** Back to feed per minute (`G94`) when inverse-time feed is on. */
  leaveInverse(): void {
    if (!this.inverse) return
    this.block(this.dialect.inverseTime!.off)
    this.inverse = false
    this.feed = undefined
  }

  /** Switches tool-centre-point control off (before a tool change or a plane change); a no-op when it is off. */
  closeTcp(): void {
    this.ensureTcp(false)
  }

  private planeCall(plane: TiltedPlane): PlaneCall {
    const decimals = this.options.angleDecimals ?? 4
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError("angleDecimals must be an integer from 0 to 6")
    const o = plane.frame.origin
    return {
      plane, matrix: frameMatrix(plane.frame), tool: this.tool, ...(this.options.swivel !== undefined ? { swivel: this.options.swivel } : {}),
      origin: { x: this.num(o.x), y: this.num(o.y), z: this.num(o.z) },
      angle: (degrees) => formatNumber(degrees, decimals),
      number: (value) => this.num(value),
      rotaryAxes: plane.layout === undefined ? [] : plane.layout === "table-AC" ? ["A", "C"] : ["B", "C"]
    }
  }

  private planeLines(lines: ReadonlyArray<string>): void {
    for (const line of lines) {
      if (line.startsWith(KLARTEXT_PREFIX)) this.lines.push(line)
      else this.block(line)
    }
  }

  /**
   * Puts a tilted work plane into effect with the control's words. The control turns the rotary axes, so what the writer knew about the
   * position, the motion mode and the rotary words is gone: the next move states everything again.
   */
  applyPlane(plane: TiltedPlane): void {
    const codes = this.dialect.tiltedPlane
    if (codes === undefined) throw new RangeError(`${this.dialect.id}: this control has no tilted-plane words`)
    this.endCycle()
    this.closeTcp()
    this.leaveInverse()
    const call = this.planeCall(plane)
    const z = plane.frame.zAxis
    this.comment(`TILTED PLANE: TOOL AXIS ${z.x.toFixed(4)} ${z.y.toFixed(4)} ${z.z.toFixed(4)} AT ${call.origin.x} ${call.origin.y} ${call.origin.z}`)
    this.planeLines(codes.set(call))
    this.plane = plane
    this.forgetModalState()
    this.ir = undefined
    for (const letter of Object.keys(this.rotary)) delete this.rotary[letter]
  }

  /** Cancels the tilted work plane, if one is in force; the control's reset also brings the rotary axes home where it can. */
  cancelPlane(): void {
    const plane = this.plane
    if (plane === undefined) return
    this.endCycle()
    this.closeTcp()
    this.leaveInverse()
    const call = this.planeCall(plane)
    this.planeLines(this.dialect.tiltedPlane!.reset(call))
    this.plane = undefined
    this.forgetModalState()
    this.ir = undefined
    for (const letter of Object.keys(this.rotary)) delete this.rotary[letter]
    for (const letter of call.rotaryAxes) this.rotary[letter] = formatNumber(0, this.options.decimals)
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
      const turned = Object.entries(this.rotary).filter(([, text]) => Number(text) !== 0)
      if (turned.length > 0 && this.dialect.tcpLimits?.rotaryZeroAtOn === true) {
        throw new RangeError(`${this.dialect.id}: tool-centre-point control must be switched on with the rotary axes at 0, they stand at ${turned.map(([l, t]) => `${l}${t}`).join(" ")}: position them at 0 first, or post with tcp: false`)
      }
      if (typeof code === "string") this.block(code, `H${this.tool}`)
      else this.block(code.on(this.tool, this.options.tcpTransformation))
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
    this.leaveInverse()
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

  /** The Klartext definition of the hole's cycle (once while it stays the same) and the positioning block that calls it (`M99`). */
  private klartextCycleSignature: string | undefined
  /** Inside the moves of a marked fixed cycle that was written natively: they are the cycle's expansion, not written. */
  private skipping = false
  private skippedEnd: Vec3 | undefined

  private cycleBegin(move: Extract<Move, { readonly _tag: "CycleBegin" }>): void {
    if (this.dialect.klartextCycles !== true || this.scale !== 1 || move.family !== "heidenhain" || this.options.nativeCycles !== true) return
    this.endCycle()
    const cycle = klartextFixedCycle(move.number, move.params, this.options.decimals)
    if (cycle.signature !== this.klartextCycleSignature) {
      for (const line of cycle.define) this.lines.push(line)
      this.klartextCycleSignature = cycle.signature
    }
    const x = move.params["x"], y = move.params["y"]
    if (x === undefined || y === undefined) throw new RangeError(`Cycle ${move.number} needs its call position (x, y)`)
    const here = this.ir
    const top = (move.params["Q203"] ?? 0) + (move.params["Q204"] ?? 0)
    if (here !== undefined && here.z < top) this.rapid({ ...here, z: top })
    const sg = (t: string): string => (t.startsWith("-") ? t : `+${t}`)
    this.lines.push(`${KLARTEXT_PREFIX}L X${sg(this.num(x))} Y${sg(this.num(y))} R0 FMAX M99`)
    this.skipping = true
    this.skippedEnd = { x, y, z: top }
  }

  private cycleEnd(): void {
    if (!this.skipping) return
    this.skipping = false
    const at = this.skippedEnd!
    // The cycle leaves the tool over the centre at the 2nd set-up clearance: say so with a block of our own, so what follows (and the
    // M functions that ride on a positioning block) starts from a position the program states.
    this.px = this.py = this.pz = undefined
    this.motion = undefined
    this.ir = { ...at }
    this.rapid(at)
  }

  private klartextHole(move: CycleMove, from: Vec3): void {
    if (from.z < move.retractHeight) this.rapid({ ...from, z: move.retractHeight })
    const cycle = klartextCycle(move, this.options.decimals)
    if (cycle.signature !== this.klartextCycleSignature) {
      for (const line of cycle.define) this.lines.push(line)
      this.klartextCycleSignature = cycle.signature
    }
    const x = this.num(move.to.x), y = this.num(move.to.y)
    const sg = (t: string): string => (t.startsWith("-") ? t : `+${t}`)
    this.lines.push(`${KLARTEXT_PREFIX}L X${sg(x)} Y${sg(y)} R0 FMAX M99`)
    this.px = Number(x)
    this.py = Number(y)
    this.pz = Number(this.num(move.retractHeight))
    this.ir = { x: move.to.x, y: move.to.y, z: move.retractHeight }
  }

  cycleMove(move: CycleMove): void {
    assertCycleSafe(move)
    this.leaveInverse()
    const from = this.ir ?? { x: move.to.x, y: move.to.y, z: move.retractHeight }
    const klartext = this.dialect.klartextCycles === true && this.scale === 1
    if (move.cycle === "tap" && !klartext && (!this.options.useCannedCycles || !this.dialect.canned || this.dialect.rigidTap === undefined)) {
      throw new RangeError(`${this.dialect.id}: rigid tapping needs the control's G84 cycle (canned cycles on); mill the thread instead`)
    }
    if (move.cycle === "tap" && this.spindleRpm > 0 && Math.abs(move.feed - move.pitch! * this.spindleRpm) > 1e-6 * move.feed + 1e-9) {
      throw new RangeError(`Tapping feed ${move.feed} mm/min is not the pitch ${move.pitch} x ${this.spindleRpm} rpm: the tap would strip the thread`)
    }
    if (klartext) {
      this.klartextHole(move, from)
      return
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
    if (move._tag === "CycleBegin") { this.cycleBegin(move); return }
    if (move._tag === "CycleEnd") { this.cycleEnd(); return }
    if (this.skipping) return
    switch (move._tag) {
      case "Rapid":
        this.rapid(move.to, move.rotary, move.expr)
        break
      case "Linear":
        this.linear(move.to, move.feed, move.rotary, move.expr, move)
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
      case "Assign":
      case "MacroCall":
      case "If":
      case "Else":
      case "EndIf":
      case "While":
      case "EndWhile":
      case "Label":
      case "Goto":
      case "Message":
        this.controlNode(move)
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

/** Tilted planes the program asks for, refused when the control has no word for them or the toolpath is in another frame already. */
const planesOf = (program: Program, options: Partial<PostOptions>, dialect: Dialect): ReadonlyMap<string, TiltedPlane> => {
  const wanted = options.workPlanes
  const out = new Map<string, TiltedPlane>()
  if (wanted === undefined) return out
  const ids = new Set(program.toolpaths.map((tp) => tp.id))
  for (const id of Object.keys(wanted)) if (!ids.has(id)) throw new RangeError(`workPlanes names toolpath "${id}", which the program does not have: the plane would be dropped silently`)
  for (const tp of program.toolpaths) {
    const plane = wanted[tp.id]
    if (plane === undefined || isIdentityPlane(plane.frame)) continue
    if (dialect.tiltedPlane === undefined) throw new RangeError(`${dialect.id}: this control has no tilted-plane words (G68.2, CYCLE800, PLANE SPATIAL); toolpath "${tp.name}" would cut in the wrong place: post it in machine coordinates (indexToolpath) or use a post that has them`)
    if (tp.moves.some((m) => m._tag === "Orient")) throw new RangeError(`Toolpath "${tp.name}" is positioned in machine coordinates (Orient) and also names a tilted plane: use one of the two`)
    if (tp.moves.some(carriesRotary)) throw new RangeError(`Toolpath "${tp.name}" turns the rotary axes and also names a tilted plane: the two frames do not compose`)
    out.set(tp.id, plane)
  }
  return out
}

const planeKey = (p: TiltedPlane | undefined): string | undefined =>
  p === undefined ? undefined : JSON.stringify([p.frame.origin, p.frame.xAxis, p.frame.yAxis, p.frame.zAxis, p.layout ?? null, p.solution ?? null])

export const emitProgram = (program: Program, userOptions: Partial<PostOptions>, dialect: Dialect): string => {
  rejectUnwritable(program, dialect)
  const planes = planesOf(program, userOptions, dialect)
  const prepared = prepareFiveAxis(program, userOptions, dialect)
  program = prepared.program
  const options: PostOptions = { ...defaultPostOptions, ...prepared.options }
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
      // The tool-length word of the new tool replaces the tip-control word (G43.4 -> G43): say so before the changer, not after.
      w.closeTcp()
      w.leaveInverse()
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
      // A changer works in the machine's frame: the tilted plane is cancelled first and set again for the next operation.
      if (w.plane !== undefined) { w.cancelPlane(); zMax = -Infinity }
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
      if (tp.coolant === "mist" && dialect.noMist === true) w.comment("MIST REQUESTED: THIS CONTROL HAS FLOOD COOLANT M8 ONLY")
      if (tp.coolant !== "off") w.block(tp.coolant === "flood" || dialect.noMist === true ? "M8" : "M7")
      w.coolant = tp.coolant
    }
    const wantedPlane = planes.get(tp.id)
    if (planeKey(w.plane) !== planeKey(wantedPlane)) {
      w.cancelPlane()
      zMax = -Infinity
      if (wantedPlane !== undefined) w.applyPlane(wantedPlane)
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
  if (w.macro.open > 0) throw new RangeError(`The program leaves ${w.macro.open} If or While open: every If needs its EndIf and every While its EndWhile`)
  w.endTcp()
  w.leaveInverse()
  w.cancelPlane()
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
