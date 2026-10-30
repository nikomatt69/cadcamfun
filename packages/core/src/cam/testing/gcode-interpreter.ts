/**
 * Reference G-code interpreter: it parses the text the posts emit (or the user pastes) and replays it
 * into plain segments, independently of the IR and of the emitter that produced the text. The post tests
 * assert geometry on it (depth, arc radii, path length, rapids at depth); in production it is the replay
 * behind the kernel's evidence, the verifier, the G-code parser and the cost measure.
 *
 * Supported: `G0 G1 G2 G3` (I/J or R), `G4`, `G17`, `G20/G21`, `G90/G91` (X Y Z; arc centres are always
 * relative to the start point), `G98/G99`, canned cycles `G73 G81 G82 G83` + `G80` (absolute only), modal
 * feed, rotary words `A/B/C` (degrees, carried on the segment they are written on), `M` codes recorded, and
 * subprograms: `O<n>` programs after the main one, `M98 P<n> [L<count>]` calls (nested up to
 * {@link MAX_CALL_DEPTH}), `M99` return, `M30`/`M2` ending the whole program.
 * Lathe and printer words (spec 31 §4.4): `G18`/`G19` planes (their arcs are replayed as chords, sagitta at most
 * {@link PLANE_ARC_SAGITTA}), `G7`/`G8` diameter/radius mode, `G32`/`G33` threading (F is the pitch), `G94`/`G95`,
 * `G96`/`G97` constant surface speed, `G50` (S: spindle limit; X/Z: coordinate setting), `G92`/`G92.1` coordinate setting
 * (E alone resets the extruder), `G28` (homing: no drawn motion), the extruder `E` with `M82`/`M83`. With `track` the
 * machine state of every segment (spindle, plane, extrusion, tool, coolant, line) comes back in `states`.
 * Spec 32 §4.3: tapping and boring cycles `G84 G74 G85 G86 G76 G87 G88 G89` (the tap's spindle reverses in the track),
 * cutter radius compensation `G41/G42 D` / `G40` (`cutter-comp.ts`; the radius from `toolRadius`, `G10 L12` or the header),
 * frames: `G52` local shift, `G10 L2` + `G54-G59` work offsets, `G68` rotation, `G68.2` / `CYCLE800` tilted planes
 * (`G69` cancels; Heidenhain `PLANE SPATIAL` / `PLANE RESET` with the cycle 7 datum read as a `G52` shift), `G93` inverse-time feed
 * (F = 1 / minutes of the block: the feed along the written axes is F times the block's length), `G100 T<n> M6` (Brother tool
 * change), `G90.1` absolute arc centres, `G53` (machine coordinates: like `G28`, no drawn motion); lathe
 * repetitive cycles `G70-G76` (`lathe-cycles.ts`), `U`/`W` incremental addresses, `G112/G113` polar interpolation (C is the
 * face's Y); Siemens keywords and cycle calls are statements (only `CYCLE800` moves anything), never misread as words.
 * Anything else with an effect on motion is reported in `errors` (and `unsupported`). Output units are always millimetres.
 *
 * Motion inside a subprogram carries the line of the call in the main program as `line` (the block the
 * operation, the tool and every finding refer to) and its own physical line as `subLine`.
 */

import { alongLine, joinOf, offsetElement, type CompElement, type CompLine, type CompSide } from "./cutter-comp.ts"
import { headerTools } from "./header-tools.ts"
import { nameTools, usesToolChangeWord } from "./tool-words.ts"
import { expandMacros, hasMacroSyntax } from "./macro-runtime.ts"
import { decodeKlartext } from "./heidenhain.ts"
import { finishCycle, patternCycle, peckCycle, roughCycle, threadCycle, type LatheMove, type ProfilePoint } from "./lathe-cycles.ts"

/** Deepest `M98` nesting the interpreter follows (Fanuc allows four). */
export const MAX_CALL_DEPTH = 8

export interface P3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type GSegment =
  | { readonly kind: "rapid" | "linear"; readonly from: P3; readonly to: P3; readonly feed: number; readonly line: number; readonly subLine?: number; readonly rotary?: RotaryAngles }
  | {
      readonly kind: "arc"
      readonly from: P3
      readonly to: P3
      readonly center: { readonly x: number; readonly y: number }
      readonly clockwise: boolean
      readonly radiusStart: number
      readonly radiusEnd: number
      readonly feed: number
      readonly line: number
      readonly subLine?: number
    }
  | { readonly kind: "dwell"; readonly seconds: number; readonly line: number; readonly subLine?: number }

/** Rotary-axis angles carried by a move (simultaneous 5-axis), degrees. */
export interface RotaryAngles {
  readonly a?: number
  readonly b?: number
  readonly c?: number
}

export interface InterpretOptions {
  /** Unit of `G4 P` and cycle `P` words. Default `seconds`. */
  readonly dwell?: "seconds" | "milliseconds"
  readonly start?: P3
  /** Return the machine state of every segment in `states` (the viewer's motion track). */
  readonly track?: boolean
  /**
   * Replay probing moves (`G38.2`-`G38.5`, Fanuc `G31`) as feed moves to their programmed end (the search limit; where the
   * stylus touches is not known before the machine runs). Off by default: the verifier and the evidence never see them as cuts.
   */
  readonly probeMoves?: boolean
  /**
   * The radius of the cutter compensated by `G41` / `G42 D<d>` (the control's D register for the tool in the spindle).
   * Without it the radius comes from `G10 L12` in the program or its header comments (`T1 D=6.`, `Tool: … Ø6mm`).
   */
  readonly toolRadius?: (d: number | undefined, tool: number | undefined) => number | undefined
  /** Read G70-G76 as lathe cycles and U / W as incremental X / Z. Default: a program with no Y words that uses G18, G96 or T0101-style tools. */
  readonly lathe?: boolean
  /**
   * Okuma OSP words: `G15 H<n>` selects work coordinate system n (read as `G54`…`G59` for n = 1…6) and `G56`/`G57`/`G58` are tool
   * length offsets, not work offsets. Default false (ISO meaning).
   */
  readonly okuma?: boolean
  /** Called with every segment (and, with `track`, its machine state) once the block that made it is complete, in program order. */
  readonly onSegment?: (segment: GSegment, state: MotionSample | undefined) => void
  /**
   * With `onSegment`: keep neither the segments nor the states, so a program of millions of motions is replayed in constant memory
   * (`segments` of the result is empty, the totals are still counted). Not for programs with lathe cycles, which look back at their
   * own segments.
   */
  readonly discard?: boolean
}

/** Largest chord sagitta of a G18/G19 arc, mm (the IR's `Arc` lies in XY, so other planes are replayed as chords). */
export const PLANE_ARC_SAGITTA = 0.01
/** Spindle limit of a constant-surface-speed program without `G50 S`, rpm. */
export const DEFAULT_CSS_MAX_RPM = 4000

/** Machine state while a segment runs (spec 31 §4.4). */
export interface MotionSample {
  readonly spindle: "cw" | "ccw" | "off"
  /** rpm at the end of the segment (with G96, from the surface speed and the diameter, within the limit). */
  readonly rpm: number
  readonly css: boolean
  readonly plane: 17 | 18 | 19
  readonly xMode: "diameter" | "radius"
  /** Filament pushed during the segment, mm (0 for travel). */
  readonly extrude: number
  /** A retraction happened since the previous segment. */
  readonly retract: boolean
  /** A `G28` homing happened since the previous segment. */
  readonly home: boolean
  readonly tool: number | undefined
  readonly coolant: "off" | "flood" | "mist"
  readonly feedMode: "min" | "rev"
  readonly line: number
  /** A probing move (touch probe or tool setter), not a cut. */
  readonly probe: boolean
}

export interface InterpretResult {
  readonly segments: ReadonlyArray<GSegment>
  readonly errors: ReadonlyArray<string>
  readonly end: P3
  /** Length of feed moves (lines, arcs incl. helical rise, canned feed strokes), mm. */
  readonly cutLength: number
  readonly rapidLength: number
  readonly minZ: number
  /** Every `M` code seen, in order (e.g. `M3`, `M6`, `M30`). */
  readonly mCodes: ReadonlyArray<string>
  /** Tool numbers selected with `T`. */
  readonly tools: ReadonlyArray<number>
  /** Names of tools the program gave as `T="NAME"` (Siemens), by the number they were given in order of appearance. */
  readonly toolNames: ReadonlyMap<number, string>
  /** Program text had a program end (`M2`/`M30`). */
  readonly ended: boolean
  /** Words with an effect on motion that were not replayed. */
  readonly unsupported: ReadonlyArray<{ readonly line: number; readonly word: string }>
  /** With `track`: the machine state of each segment, aligned with `segments`. */
  readonly states?: ReadonlyArray<MotionSample>
}

interface Word {
  readonly letter: string
  readonly value: number
}

const tokenize = (line: string): Word[] => {
  const out: Word[] = []
  const re = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g
  for (let m = re.exec(line); m !== null; m = re.exec(line)) out.push({ letter: m[1]!.toUpperCase(), value: Number(m[2]) })
  return out
}

const stripLine = (raw: string): string =>
  raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/;.*$/, "")
    .trim()

/** What a block does to the flow of the program. */
type Flow = "next" | "return" | "end"

export const interpretGcode = (text: string, options: InterpretOptions = {}): InterpretResult => {
  const segments: GSegment[] = []
  const errors: string[] = []
  const unsupported: Array<{ line: number; word: string }> = []
  // Variables, expressions, jumps, loops and macro calls run first, as the control would: the replay then sees the program it cuts.
  let lineMap: ReadonlyArray<number> | undefined
  if (hasMacroSyntax(text)) {
    const expanded = expandMacros(text)
    text = expanded.text
    lineMap = expanded.lines
    for (const message of expanded.errors) {
      errors.push(message)
      unsupported.push({ line: Number(/^line (\d+)/.exec(message)?.[1] ?? 0), word: "macro" })
    }
  }
  if (/\bBEGIN PGM\b/i.test(text)) {
    const decoded = decodeKlartext(text, (tool) => options.toolRadius?.(undefined, tool))
    // A fixed cycle that moves in a path is several lines: findings still name the Klartext line (and the source line behind it).
    lineMap = decoded.lines.map((l) => lineMap?.[l - 1] ?? l)
    text = decoded.text
    for (const problem of decoded.unsupported) {
      unsupported.push(problem)
      errors.push(`Line ${problem.line}: unsupported Klartext block ${problem.word}`)
    }
  }
  // Siemens `T="NAME"` / `T=3`: a named tool takes the number of its first appearance, recorded in `toolNames`.
  const named = nameTools(text)
  text = named.text
  const toolNames = named.names
  // A program that has an `M6` selects the tool with `T` and changes it at `M6` (a `T2` read lines earlier is a preselect); without
  // one (a turret lathe: `T0101`) the `T` word changes the tool itself.
  const usesToolChange = usesToolChangeWord(text)
  let pendingTool: number | undefined
  const mCodes: string[] = []
  const tools: number[] = []
  let drained = 0
  const states: Array<{ -readonly [K in keyof MotionSample]: MotionSample[K] }> | undefined = options.track ? [] : undefined
  let pos: P3 = options.start ?? { x: 0, y: 0, z: 0 }
  let unit = 1
  let motion = -1
  let feed = 0
  let retractMode = 98
  let ended = false
  let absolute = true
  /** Physical line of the block being executed and, inside a subprogram, the line of the outermost call. */
  let physical = 0
  let site: number | undefined
  const cycle: { z?: number; r?: number; q?: number; p?: number } = {}
  let minZ = Infinity
  let cutLength = 0
  let rapidLength = 0
  const dwellFactor = options.dwell === "milliseconds" ? 1 / 1000 : 1
  // Machine state (spec 31 §4.4). `shift` is the G92 / G50 coordinate setting: output = programmed + shift.
  let plane: 17 | 18 | 19 = 17
  let xMode: "diameter" | "radius" = "diameter"
  let spindle: "cw" | "ccw" | "off" = "off"
  let sWord = 0
  let css = false
  let maxRpm: number | undefined
  let feedRev = false
  /** `G93` inverse-time feed: F is 1 / minutes of the block, so the feed along the written axes is F times the block's length. */
  let inverse = false
  let coolant: "off" | "flood" | "mist" = "off"
  let tool: number | undefined
  let eAbsolute = true
  let ePos = 0
  let retracted = false
  let homed = false
  const shift = { x: 0, y: 0, z: 0 }

  const note = (p: P3): void => {
    if (p.z < minZ) minZ = p.z
  }
  const dist = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  // Rotary words are modal like any other: only the axes written on a line change.
  let rotary: RotaryAngles = {}
  const rotaryOf = (): RotaryAngles | undefined => (Object.keys(rotary).length === 0 ? undefined : { ...rotary })
  const inSub = (): { readonly subLine?: number } => (site === undefined ? {} : { subLine: physical })
  const rpmAt = (x: number): number => {
    if (!css) return sWord
    const limit = maxRpm ?? DEFAULT_CSS_MAX_RPM
    const diameter = xMode === "diameter" ? Math.abs(x) : 2 * Math.abs(x)
    return diameter < 1e-6 ? limit : Math.min(limit, (1000 * sWord) / (Math.PI * diameter))
  }
  /** Feed in mm/min: under G95 and for threading, F is per revolution. */
  const feedNow = (threading: boolean): number => {
    if (!feedRev && !threading) return feed
    const rpm = spindle === "off" ? 0 : rpmAt(pos.x)
    return rpm > 0 ? feed * rpm : feed
  }
  /** Hands the finished segments to `onSegment`, and lets them go when the caller asked not to keep them. */
  const drain = (): void => {
    if (options.onSegment === undefined) return
    for (let n = drained; n < segments.length; n++) options.onSegment(segments[n]!, states?.[n])
    if (options.discard === true) { segments.length = 0; if (states !== undefined) states.length = 0; drained = 0 } else drained = segments.length
  }
  const sample = (line: number, at: P3): void => {
    if (states === undefined) return
    states.push({ spindle, rpm: spindle === "off" ? 0 : rpmAt(at.x), css, plane, xMode, extrude: 0, retract: retracted, home: homed, tool, coolant, feedMode: feedRev ? "rev" : "min", line, probe: motion === 38 })
    retracted = false
    homed = false
  }

  // A block that only turns the rotary axes (`G0 A90`) is a move too: zero length, new angles.
  let emittedRotary = "{}"
  const turned = (angles: RotaryAngles | undefined): boolean => { const key = JSON.stringify(angles ?? {}); if (key === emittedRotary) return false; emittedRotary = key; return true }
  const rapid = (to: P3, line: number): void => {
    const angles = rotaryOf()
    if (dist(pos, to) < 1e-12 && !turned(angles)) return
    turned(angles)
    segments.push(angles === undefined ? { kind: "rapid", from: pos, to, feed, line, ...inSub() } : { kind: "rapid", from: pos, to, feed, line, ...inSub(), rotary: angles })
    sample(line, to)
    rapidLength += dist(pos, to)
    pos = to
    note(pos)
  }
  const linear = (to: P3, line: number, rate = feed): void => {
    const angles = rotaryOf()
    if (dist(pos, to) < 1e-12 && !turned(angles)) return
    turned(angles)
    segments.push(angles === undefined ? { kind: "linear", from: pos, to, feed: rate, line, ...inSub() } : { kind: "linear", from: pos, to, feed: rate, line, ...inSub(), rotary: angles })
    sample(line, to)
    cutLength += dist(pos, to)
    pos = to
    note(pos)
  }
  /**
   * An arc in the G18 (ZX) or G19 (YZ) plane — or any arc of a tilted frame — replayed as chords; the sense is seen from the
   * plane's normal (+Y, +X). `from` and `target` are in the arc's own frame, `map` places a chord point in the output.
   */
  const planeArc = (from: P3, target: P3, clockwise: boolean, words: { readonly i?: number; readonly j?: number; readonly k?: number; readonly r?: number }, line: number, map: (p: P3) => P3): void => {
    // (u, v, w): the plane's axes in right-handed order and its normal. G18: (Z, X, Y), G19: (Y, Z, X).
    const toUvw = (p: P3): [number, number, number] => (plane === 18 ? [p.z, p.x, p.y] : plane === 19 ? [p.y, p.z, p.x] : [p.x, p.y, p.z])
    const fromUvw = (u: number, v: number, w: number): P3 => (plane === 18 ? { x: v, y: w, z: u } : plane === 19 ? { x: w, y: u, z: v } : { x: u, y: v, z: w })
    const [u0, v0, w0] = toUvw(from)
    const [u1, v1, w1] = toUvw(target)
    const du = plane === 18 ? words.k : plane === 19 ? words.j : words.i
    const dv = plane === 18 ? words.i : plane === 19 ? words.k : words.j
    let cu: number, cv: number
    if (du !== undefined || dv !== undefined) {
      cu = u0 + (du ?? 0) * unit
      cv = v0 + (dv ?? 0) * unit
    } else if (words.r !== undefined) {
      const eu = u1 - u0, ev = v1 - v0, d = Math.hypot(eu, ev)
      if (d < 1e-12) { errors.push(`line ${physical}: R arc with identical endpoints`); return }
      const radius = Math.abs(words.r) * unit
      const h2 = radius * radius - (d / 2) * (d / 2)
      if (h2 < -1e-9) errors.push(`line ${physical}: R too small for the chord`)
      const h = Math.sqrt(Math.max(0, h2))
      const side = (clockwise ? -1 : 1) * (words.r > 0 ? 1 : -1)
      cu = (u0 + u1) / 2 + (-ev / d) * h * side
      cv = (v0 + v1) / 2 + (eu / d) * h * side
    } else { errors.push(`line ${physical}: arc without ${plane === 18 ? "I/K" : plane === 19 ? "J/K" : "I/J"}/R`); return }
    const r0 = Math.hypot(u0 - cu, v0 - cv), r1 = Math.hypot(u1 - cu, v1 - cv)
    const a0 = Math.atan2(v0 - cv, u0 - cu), a1 = Math.atan2(v1 - cv, u1 - cu)
    let sweep = clockwise ? a0 - a1 : a1 - a0
    sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    if (Math.hypot(u1 - u0, v1 - v0) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
    const radius = Math.max(r0, r1, 1e-9)
    const step = radius > PLANE_ARC_SAGITTA ? 2 * Math.acos(1 - PLANE_ARC_SAGITTA / radius) : sweep
    const count = Math.min(10_000, Math.max(1, Math.ceil(sweep / step)))
    const rate = feedNow(false)
    for (let n = 1; n <= count; n++) {
      const t = n / count
      if (n === count) { linear(map(target), line, rate); break }
      const a = a0 + (clockwise ? -1 : 1) * sweep * t
      const r = r0 + (r1 - r0) * t
      linear(map(fromUvw(cu + r * Math.cos(a), cv + r * Math.sin(a), w0 + (w1 - w0) * t)), line, rate)
    }
  }

  // -- frames (spec 32 §4.3) ------------------------------------------------------------------------------------------------
  // Program coordinates p reach the output as M·p + t (a G68 rotation, a G68.2 / CYCLE800 tilted plane) plus the offsets:
  // the G92 / G50 setting, the G52 local shift and the work offset selected (G54-G59) relative to G54 when G10 L2 set them.
  // Without a frame and with no local or work offset this is the old `programmed + shift`, to the bit.
  const local = { x: 0, y: 0, z: 0 }
  const workOffsets = new Map<number, P3>()
  let activeWork = 54
  let frame: Frame | undefined
  let arcCentreAbsolute = false
  let polar = false
  const offsets = (): P3 => {
    const own = workOffsets.get(activeWork), base = workOffsets.get(54)
    const w = own === undefined ? { x: 0, y: 0, z: 0 } : { x: own.x - (base?.x ?? 0), y: own.y - (base?.y ?? 0), z: own.z - (base?.z ?? 0) }
    return { x: shift.x + local.x + w.x, y: shift.y + local.y + w.y, z: shift.z + local.z + w.z }
  }
  const place = (p: P3): P3 => {
    const o = offsets()
    if (frame === undefined) return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z }
    const q = mul3(frame.m, p)
    return { x: q.x + frame.t.x + o.x, y: q.y + frame.t.y + o.y, z: q.z + frame.t.z + o.z }
  }
  const programOf = (q: P3): P3 => {
    const o = offsets()
    const d = { x: q.x - o.x, y: q.y - o.y, z: q.z - o.z }
    return frame === undefined ? d : mulT3(frame.m, { x: d.x - frame.t.x, y: d.y - frame.t.y, z: d.z - frame.t.z })
  }

  // -- cutter radius compensation (G41 / G42) ------------------------------------------------------------------------------
  // The programmed contour is offset by the tool radius (`cutter-comp.ts`). An element is drawn once the next one is known
  // (the corner between them decides where it ends); Z-only blocks in between wait with it. `progPos` is the programmed,
  // uncompensated position the next block's coordinates are read from.
  const dRegisters = new Map<number, number>()
  const header = headerTools(text)
  let comp: { readonly side: CompSide; readonly radius: number } | undefined
  let compStartup = false
  interface Pending { readonly el: CompElement; readonly off: CompElement | undefined; readonly rapid: boolean; readonly feed: number; readonly line: number; readonly startup: boolean; readonly queued: Array<{ readonly z: number; readonly rapid: boolean; readonly feed: number; readonly line: number }> }
  let pending: Pending | undefined
  let progPos: P3 | undefined
  const here = (): P3 => progPos ?? pos
  const radiusFor = (d: number | undefined): number | undefined => {
    if (d !== undefined && dRegisters.has(d)) return dRegisters.get(d)
    const given = options.toolRadius?.(d, tool)
    if (given !== undefined) return given
    if (d !== undefined && header.byTool.has(d)) return header.byTool.get(d)!.diameter / 2
    if (tool !== undefined && header.byTool.has(tool)) return header.byTool.get(tool)!.diameter / 2
    return header.single !== undefined ? header.single / 2 : undefined
  }
  const arcTo = (target: P3, center: { readonly x: number; readonly y: number }, clockwise: boolean, rate: number, line: number): void => {
    const radiusStart = Math.hypot(pos.x - center.x, pos.y - center.y)
    const radiusEnd = Math.hypot(target.x - center.x, target.y - center.y)
    const a0 = Math.atan2(pos.y - center.y, pos.x - center.x)
    const a1 = Math.atan2(target.y - center.y, target.x - center.x)
    let sweep = clockwise ? a0 - a1 : a1 - a0
    sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    if (Math.hypot(target.x - pos.x, target.y - pos.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
    const length = Math.hypot(radiusStart * sweep, target.z - pos.z)
    segments.push({ kind: "arc", from: pos, to: target, center, clockwise, radiusStart, radiusEnd, feed: rate, line, ...inSub() })
    sample(line, target)
    cutLength += length
    pos = target
    note(pos)
  }
  const go = (to: P3, rapidMove: boolean, rate: number, line: number): void => { if (rapidMove) rapid(to, line); else linear(to, line, rate) }
  /** Draws the pending element up to `end` (on its offset), then the Z-only blocks that waited with it. */
  const drawPending = (p: Pending, end: P3): void => {
    if (p.startup || p.off === undefined || p.off.kind === "line") go(end, p.rapid, p.feed, p.line)
    else arcTo(end, p.off.center, p.off.clockwise, p.feed, p.line)
    for (const q of p.queued) go({ ...pos, z: q.z }, q.rapid, q.feed, q.line)
  }
  const flushComp = (): void => {
    if (pending === undefined) return
    const p = pending
    pending = undefined
    const own = p.off ?? offsetElement(p.el, comp?.side ?? 1, comp?.radius ?? 0)
    drawPending(p, own?.to ?? p.el.to)
  }
  /** A programmed XY element while compensating. */
  const compElement = (el: CompElement, rapidMove: boolean, rate: number, line: number): void => {
    const c = comp!
    const off = offsetElement(el, c.side, c.radius)
    if (off === undefined && el.kind === "arc") {
      errors.push(`line ${physical}: cutter compensation: a tool of radius ${c.radius} does not fit the arc of radius ${Math.hypot(el.from.x - el.center.x, el.from.y - el.center.y).toFixed(3)} (the control would alarm or gouge)`)
      return
    }
    const next: Pending = { el, off, rapid: rapidMove, feed: rate, line, startup: false, queued: [] }
    if (compStartup) {
      compStartup = false
      pending = { ...next, startup: true }
      return
    }
    const prev = pending
    if (prev === undefined || off === undefined) { flushComp(); if (off !== undefined) { go(off.from, rapidMove, rate, line); pending = next } return }
    pending = next
    if (prev.startup) { drawPending(prev, off.from); return }
    const join = prev.off !== undefined ? joinOf(prev.el, el, prev.off, off, c.side) : undefined
    if (join === undefined) { drawPending(prev, prev.off?.to ?? prev.el.to); if (Math.hypot(pos.x - off.from.x, pos.y - off.from.y) > 1e-9) go({ ...off.from, z: pos.z }, prev.rapid, prev.feed, line); return }
    if (join.kind === "meet") {
      if (prev.off!.kind === "line" && alongLine(prev.off as CompLine, join.point) < -1e-9) errors.push(`line ${prev.line}: cutter compensation: the tool is larger than this element; the corner is overcut`)
      drawPending(prev, join.point)
      return
    }
    drawPending(prev, join.from)
    arcTo({ x: join.to.x, y: join.to.y, z: pos.z }, join.center, join.clockwise, prev.feed, line)
  }

  // -- lathe repetitive cycles (G70-G76 with G18, `lathe-cycles.ts`) ----------------------------------------------------------
  const latheText = options.lathe ?? (!/\bY\s*[-+.\d]/i.test(text) && /\b(G18|G96|T\d{4})\b/i.test(text))
  const first: { g71?: { depth: number; retract: number }; g72?: { depth: number; retract: number }; g73?: { relief: { r: number; z: number }; passes: number }; g74?: number; g75?: number; g76?: { finish: number; minDepth: number; allowance: number } } = {}
  let jumpTo: number | undefined
  const radiusOfX = (x: number): number => (xMode === "diameter" ? x / 2 : x)
  const xOfRadius = (r: number): number => (xMode === "diameter" ? r * 2 : r)
  /** P / Q of the cycles are in the least input increment (0.001 mm, 0.0001 in); a value written with a decimal point is in mm. */
  const increment = (v: number): number => (Number.isInteger(v) ? v * (unit === 1 ? 0.001 : 0.00254) : v * unit)
  /** The profile of blocks N`ns`..N`nf`, replayed from the cycle's start point; and the index of the N`nf` line. */
  const profileOf = (ns: number, nf: number, start: P3): { readonly points: ProfilePoint[]; readonly end: number } | undefined => {
    const find = (n: number, from: number) => { for (let i = from; i < lines.length; i++) if (new RegExp(`^\\s*N0*${n}(?!\\d)`, "i").test(lines[i]!)) return i; return -1 }
    const i0 = find(ns, 0), i1 = i0 < 0 ? -1 : find(nf, i0)
    if (i0 < 0 || i1 < 0) { errors.push(`line ${physical}: the cycle's profile N${ns}..N${nf} is not in the program`); return undefined }
    const prefix = `G${plane} ${absolute ? "G90" : "G91"} ${unit === 1 ? "G21" : "G20"} ${xMode === "radius" ? "G8" : "G7"} ${feedRev ? "G95" : "G94"}`
    const sub = interpretGcode([prefix, ...lines.slice(i0, i1 + 1)].join("\n"), { start, lathe: true })
    for (const e of sub.errors) errors.push(`line ${physical}: profile: ${e}`)
    const points: ProfilePoint[] = [{ r: radiusOfX(start.x), z: start.z, rapid: true }]
    for (const s of sub.segments) if (s.kind !== "dwell") points.push({ r: radiusOfX(s.to.x), z: s.to.z, rapid: s.kind === "rapid" })
    return { points, end: i1 }
  }
  const drawLathe = (moves: ReadonlyArray<LatheMove>, y: number, line: number, threading = false): void => {
    for (const m of moves) go(place({ x: xOfRadius(m.to.r), y, z: m.to.z }), m.kind === "rapid", feedNow(threading), line)
  }
  const latheCycle = (g: number, get: (letter: string) => number | undefined, line: number): void => {
    const start = programOf(here())
    const A = { r: radiusOfX(start.x), z: start.z }
    const P = get("P"), Q = get("Q"), U = get("U"), W = get("W"), R = get("R"), X = get("X"), Z = get("Z"), D = get("D")
    const allowance = { r: U !== undefined ? radiusOfX(U * unit) : 0, z: (W ?? 0) * unit }
    const profiled = (): ReturnType<typeof profileOf> => (P !== undefined && Q !== undefined ? profileOf(Math.round(P), Math.round(Q), start) : undefined)
    switch (g) {
      case 71:
      case 72: {
        const key = g === 71 ? "g71" : "g72"
        if (P === undefined || Q === undefined) { first[key] = { depth: ((g === 71 ? U : W) ?? 0) * unit, retract: (R ?? 0) * unit }; return }
        const profile = profiled()
        if (profile === undefined) return
        const depth = first[key]?.depth ?? (D !== undefined ? increment(D) : 0)
        if (depth <= 0) { errors.push(`line ${physical}: G${g} without a depth of cut`); return }
        drawLathe(roughCycle({ start: A, profile: profile.points, depth, retract: first[key]?.retract ?? 0, allowance, axis: g === 71 ? "r" : "z" }), start.y, line)
        jumpTo = profile.end + 1
        return
      }
      case 73: {
        if (P === undefined || Q === undefined) { first.g73 = { relief: { r: U !== undefined ? U * unit : 0, z: (W ?? 0) * unit }, passes: R ?? 1 }; return }
        const profile = profiled()
        if (profile === undefined) return
        drawLathe(patternCycle(A, profile.points, first.g73?.relief ?? { r: 0, z: 0 }, allowance, first.g73?.passes ?? D ?? 1), start.y, line)
        jumpTo = profile.end + 1
        return
      }
      case 70: {
        const profile = profiled()
        if (profile !== undefined) drawLathe(finishCycle(A, profile.points), start.y, line)
        return
      }
      case 76: {
        if (X === undefined && Z === undefined && U === undefined && W === undefined) {
          const p = Math.round(P ?? 0)
          first.g76 = { finish: Math.max(1, Math.floor(p / 10000)), minDepth: Q !== undefined ? increment(Q) : 0, allowance: (R ?? 0) * unit }
          return
        }
        const rootX = X !== undefined ? X * unit : start.x + (U ?? 0) * unit
        const rootZ = Z !== undefined ? Z * unit : start.z + (W ?? 0) * unit
        const height = P !== undefined ? increment(P) : 0
        if (height <= 0 || feed <= 0) { errors.push(`line ${physical}: G76 without a thread height (P) or lead (F)`); return }
        drawLathe(threadCycle({
          start: A, root: { r: radiusOfX(rootX), z: rootZ }, taper: (R ?? 0) * unit, height, firstDepth: Q !== undefined ? increment(Q) : height,
          minDepth: first.g76?.minDepth ?? 0, finishAllowance: first.g76?.allowance ?? 0, finishPasses: first.g76?.finish ?? 1
        }), start.y, line, true)
        return
      }
      case 74:
      case 75: {
        const key = g === 74 ? "g74" : "g75"
        if (X === undefined && Z === undefined && U === undefined && W === undefined) { first[key] = (R ?? 0) * unit; return }
        const end = { r: X !== undefined ? radiusOfX(X * unit) : U !== undefined ? A.r + radiusOfX(U * unit) : A.r, z: Z !== undefined ? Z * unit : A.z + (W ?? 0) * unit }
        const along = g === 74 ? Q : P, across = g === 74 ? P : Q
        drawLathe(peckCycle(A, end, along !== undefined ? increment(along) : 0, across !== undefined ? increment(across) : 0, first[key] ?? 0, g === 74 ? "z" : "r"), start.y, line)
        return
      }
    }
  }

  const lines = text.split(/\r?\n/)
  // Programs: the first `O` block and everything before the second is the main program; every later `O<n>` block is
  // a subprogram that only an `M98` runs. A text with at most one `O` line is the main program whole.
  const starts: Array<{ readonly index: number; readonly number: number }> = []
  lines.forEach((raw, index) => {
    const m = /^O\s*0*(\d+)\b/i.exec(stripLine(raw))
    if (m !== null) starts.push({ index, number: Number(m[1]) })
  })
  const mainEnd = starts.length > 1 ? starts[1]!.index : lines.length
  const programs = new Map<number, { readonly start: number; readonly end: number }>()
  starts.slice(1).forEach((p, i) => {
    programs.set(p.number, { start: p.index + 1, end: i + 2 < starts.length ? starts[i + 2]!.index : lines.length })
  })

  /**
   * A statement that is not a word block: a Siemens cycle call `NAME(…)` or a keyword (`TRAORI`, `MSG`, Fanuc macro `IF`…).
   * `CYCLE800` sets a tilted plane; the others are skipped, and listed as unsupported when they carry axis words (the old
   * tokenizer read `CYCLE800(…)` as `E800`, `TRANS X10` as a move).
   */
  const statement = (raw: string, code: string): boolean => {
    const upper = raw.toUpperCase()
    const called = /^\s*(?:N\d+\s+)?([A-Z_]{2,}[A-Z0-9_]*)\s*\(([^)]*)\)/.exec(upper)
    const keyword = called?.[1] ?? /^([A-Z_]{2,}[A-Z0-9_]*)\b/.exec(code.toUpperCase())?.[1]
    if (keyword === undefined) return false
    if (keyword === "CYCLE800") { cycle800(called?.[2] ?? ""); return true }
    if (keyword === "PLANE") { klartextPlane(code.toUpperCase()); return true }
    if (SILENT_STATEMENTS.has(keyword)) return true
    if (tokenize(code).some((w) => "XYZABCIJKRE".includes(w.letter)) || called !== null) {
      errors.push(`line ${physical}: unsupported ${keyword}`)
      unsupported.push({ line: physical, word: keyword })
    }
    return true
  }
  /**
   * Heidenhain `PLANE SPATIAL SPA SPB SPC ...` (rotations about the fixed X, Y, Z axes in that order: M = Rz(SPC) Ry(SPB) Rx(SPA)) and
   * `PLANE RESET`. The plane's origin is the datum (cycle 7, read as a G52 shift); the positioning words (TURN, MB, FMAX, SEQ) do not
   * change what the program's coordinates mean.
   */
  const klartextPlane = (code: string): void => {
    flushComp()
    if (/^PLANE RESET\b/.test(code)) { frame = undefined; return }
    const angle = (name: string): number | undefined => { const m = new RegExp(`\\b${name}([+-]?(?:\\d+\\.?\\d*|\\.\\d+))`).exec(code); return m === null ? undefined : Number(m[1]) }
    const spa = angle("SPA"), spb = angle("SPB"), spc = angle("SPC")
    if (!/^PLANE SPATIAL\b/.test(code) || spa === undefined || spb === undefined || spc === undefined) {
      errors.push(`line ${physical}: unsupported ${code.split(/\s+/).slice(0, 2).join(" ")}`); unsupported.push({ line: physical, word: "PLANE" }); return
    }
    frame = { m: mulM3(mulM3(rot3("z", spc), rot3("y", spb)), rot3("x", spa)), t: { x: 0, y: 0, z: 0 }, planar: false }
  }
  /** Siemens CYCLE800 swivel plane: axis-by-axis rotation (the mode's bit pairs name the axes, first in the low bits). */
  const cycle800 = (args: string): void => {
    const a = args.split(",").map((s) => Number(s.replace(/"[^"]*"/g, "").trim()))
    const at = (i: number): number => (Number.isFinite(a[i]) ? a[i]! : 0)
    if (args.trim() === "" || a.slice(4, 13).every((v) => !Number.isFinite(v) || v === 0)) { frame = undefined; return }
    const mode = Math.round(at(3))
    if ((mode >> 6) & 3) { errors.push(`line ${physical}: unsupported CYCLE800 mode ${mode} (only axis-by-axis)`); unsupported.push({ line: physical, word: "CYCLE800" }); return }
    const axisOf = (bits: number): "x" | "y" | "z" | undefined => (bits === 1 ? "x" : bits === 2 ? "y" : bits === 3 ? "z" : undefined)
    let m = IDENTITY3
    ;[at(7), at(8), at(9)].forEach((angle, i) => { const axis = axisOf((mode >> (2 * i)) & 3); if (axis !== undefined) m = mulM3(m, rot3(axis, angle)) })
    const before = { x: at(4) * unit, y: at(5) * unit, z: at(6) * unit }, after = mul3(m, { x: at(10) * unit, y: at(11) * unit, z: at(12) * unit })
    const additive = Math.round(at(2)) % 10 === 1 && frame !== undefined
    const own: Frame = { m, t: { x: before.x + after.x, y: before.y + after.y, z: before.z + after.z }, planar: false }
    frame = additive ? compose(frame!, own) : own
  }

  const execLine = (raw: string, index: number, depth: number): Flow => {
    physical = lineMap?.[index] ?? index + 1
    const lineNo = site ?? physical
    const code = stripLine(raw)
    if (code === "" || code.startsWith("%")) return "next"
    if (statement(raw, code)) return "next"
    let words = tokenize(code)
    if (words[0]?.letter === "O") words = words.slice(1)
    if (words[0]?.letter === "N") words = words.slice(1)
    if (words.length === 0) return "next"

    const get = (letter: string): number | undefined => words.find((w) => w.letter === letter)?.value
    let changeTool = false
    let cycleStarted = false
    let ending = false
    let returning = false
    /** The block sets coordinates (G92 / G50 X Z, G52, G10) or homes (G28 / G53): its axis words are not a move. */
    let setting: "g92" | "g50" | "home" | "g52" | "g10" | undefined
    /** The block sets a frame (G68, G68.2) or cancels it (G69): its words are the frame's. */
    let frameWord: "g68" | "g68.2" | "g69" | undefined
    let lathe: number | undefined
    let compWord: CompSide | 0 | undefined
    let sIsParameter = false
    let call: { readonly program: number; readonly times: number } | undefined
    const latheContext = latheText
    for (const w of words) {
      if (w.letter === "G") {
        const g = Math.round(w.value * 10) / 10
        if (latheContext && [70, 71, 72, 73, 74, 75, 76].includes(g)) lathe = g
        else if ([0, 1, 2, 3, 73, 74, 76, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89].includes(g)) {
          motion = g
          if (g === 73 || g === 74 || g === 76 || (g >= 81 && g <= 89)) cycleStarted = true
        }
        // Mazak synchronous tapping: G84.2 right hand, G84.3 left hand (the ISO G84 / G74 strokes).
        else if (g === 84.2 || g === 84.3) { motion = g === 84.2 ? 84 : 74; cycleStarted = true }
        else if (options.okuma === true && g === 15) {
          const h = get("H")
          if (h === undefined || !Number.isInteger(h) || h < 1 || h > 6) { errors.push(`line ${physical}: G15 needs H1-H6 (work coordinate systems beyond 6 are not modelled)`); unsupported.push({ line: physical, word: "G15" }) }
          else activeWork = 53 + h
        } else if (options.okuma === true && (g === 56 || g === 57 || g === 58)) {
          // OSP tool length offsets: no geometric effect on the programmed path.
        } else if (g === 32 || g === 33) motion = 32
        else if (options.probeMoves === true && ((g >= 38.2 && g <= 38.5) || g === 31)) motion = 38
        else if (g === 20 || g === 70) unit = 25.4
        else if (g === 21 || g === 71) unit = 1
        else if (g === 98 || g === 99) retractMode = g
        else if (g === 4) {
          const f = get("F")
          // Siemens writes seconds on F; P (and Fanuc's X) follow the configured unit.
          const seconds = get("P") !== undefined || get("X") !== undefined ? (get("P") ?? get("X") ?? 0) * dwellFactor : f ?? 0
          segments.push({ kind: "dwell", seconds, line: lineNo, ...inSub() })
          sample(lineNo, pos)
        } else if (g === 90) { absolute = true; eAbsolute = true }
        else if (g === 91) { absolute = false; eAbsolute = false }
        else if (g === 17 || g === 18 || g === 19) plane = g
        else if (g === 7) xMode = "diameter"
        else if (g === 8) xMode = "radius"
        else if (g === 93) { inverse = true; feedRev = false }
        else if (g === 94) { feedRev = false; inverse = false }
        else if (g === 95) { feedRev = true; inverse = false }
        else if (g === 96) css = true
        else if (g === 97) css = false
        else if (g === 92) setting = "g92"
        else if (g === 92.1) { shift.x = 0; shift.y = 0; shift.z = 0 }
        else if (g === 50) setting = "g50"
        else if (g === 28 || g === 53) setting = "home"
        else if (g === 52) setting = "g52"
        else if (g === 10) setting = "g10"
        else if (g >= 54 && g <= 59 && Number.isInteger(g)) activeWork = g
        else if (g === 68) frameWord = "g68"
        else if (g === 68.2) frameWord = "g68.2"
        else if (g === 69) frameWord = "g69"
        else if (g === 41 || g === 42) compWord = plane === 18 ? undefined : g === 41 ? 1 : -1
        else if (g === 40) compWord = plane === 18 ? undefined : 0
        else if (g === 90.1) arcCentreAbsolute = true
        else if (g === 91.1) arcCentreAbsolute = false
        else if (g === 112 || g === 12.1) polar = true
        else if (g === 113 || g === 13.1) { polar = false; pos = { ...pos, y: 0 }; if (progPos) progPos = { ...progPos, y: 0 } }
        // Brother Speedio tool change `G100 T<n> M6`: the T and M6 on the line do the work; G100 alone (Fanuc tool-data setting) is not read.
        else if (g === 100 && words.some((v) => v.letter === "M" && Math.round(v.value) === 6)) { /* tool change block */ }
        else if (ACCEPTED_G.includes(g)) {
          // Accepted modal words without geometric effect here (tool length, exact stop / blending, look-ahead, TCP, G53.1).
        } else { errors.push(`line ${physical}: unsupported G${g}`); unsupported.push({ line: physical, word: `G${g}` }) }
      } else if (w.letter === "M") {
        const m = Math.round(w.value)
        mCodes.push(`M${m}`)
        if (m === 2 || m === 30) { ended = true; ending = true }
        else if (m === 99) returning = true
        else if (m === 98) {
          const program = get("P")
          const times = get("L")
          if (program === undefined) errors.push(`line ${physical}: M98 without a program number`)
          else call = { program: Math.round(program), times: times === undefined ? 1 : Math.max(0, Math.round(times)) }
        } else if (m === 3) spindle = "cw"
        else if (m === 4) spindle = "ccw"
        else if (m === 5 || m === 19) spindle = "off"
        else if (m === 6) changeTool = true
        else if (m === 7) coolant = "mist"
        else if (m === 8) coolant = "flood"
        else if (m === 9) coolant = "off"
        else if (m === 82) eAbsolute = true
        else if (m === 83) eAbsolute = false
        if ([104, 109, 140, 190, 106, 107, 141, 191].includes(m)) sIsParameter = true
      } else if (w.letter === "T") {
        const n = Math.round(w.value)
        pendingTool = n
        if (!usesToolChange) { tools.push(n); tool = n }
      } else if (w.letter === "F") {
        // In a dwell block F is the time (Siemens `G4 F<s>`), never the feed: the modal feed stays.
        if (!words.some((v) => v.letter === "G" && Math.round(v.value * 10) === 40)) feed = inverse ? w.value : w.value * unit
      } else if ((w.letter === "A" || w.letter === "B" || w.letter === "C") && !(polar && w.letter === "C")) {
        // Rotary angles are degrees in both unit systems; they persist until changed. Under G112 C is a length (face Y).
        rotary = { ...rotary, [w.letter.toLowerCase()]: w.value }
      }
    }
    // `M6` puts the selected tool in the spindle (`T1 M6`, `M6 T1`, or a `T2` read lines earlier).
    if (changeTool && pendingTool !== undefined) { tools.push(pendingTool); tool = pendingTool }
    const s = get("S")
    if (s !== undefined && !sIsParameter) {
      // `G50 S` / `G92 S` alone limit the spindle of a lathe; otherwise S is the speed (rpm, or m/min under G96).
      if ((setting === "g50" || setting === "g92") && get("X") === undefined && get("Y") === undefined && get("Z") === undefined) maxRpm = s
      else sWord = s
    }
    // A G4 line is a dwell only; it carries no motion words of its own.
    if (words.some((w) => w.letter === "G" && Math.round(w.value) === 4)) return ending ? "end" : "next"

    if (frameWord !== undefined) {
      flushComp()
      const at = programOf(here())
      if (frameWord === "g69") frame = undefined
      else if (frameWord === "g68") {
        if (plane !== 17) { errors.push(`line ${physical}: unsupported G68 outside G17`); unsupported.push({ line: physical, word: "G68" }) }
        else {
          const cx = get("X") !== undefined ? get("X")! * unit : at.x, cy = get("Y") !== undefined ? get("Y")! * unit : at.y
          const m = rot3("z", get("R") ?? 0)
          const c = mul3(m, { x: cx, y: cy, z: 0 })
          frame = { m, t: { x: cx - c.x, y: cy - c.y, z: 0 }, planar: true }
        }
      } else {
        // G68.2 X Y Z I J K: the feature frame's origin and its Euler angles (Z, then X', then Z'').
        const m = mulM3(mulM3(rot3("z", get("I") ?? 0), rot3("x", get("J") ?? 0)), rot3("z", get("K") ?? 0))
        frame = { m, t: { x: (get("X") ?? 0) * unit, y: (get("Y") ?? 0) * unit, z: (get("Z") ?? 0) * unit }, planar: false }
      }
      return ending ? "end" : "next"
    }
    if (lathe !== undefined) {
      flushComp()
      latheCycle(lathe, get, lineNo)
      return ending ? "end" : "next"
    }

    const x = get("X")
    const y = polar ? get("C") : get("Y")
    const z = get("Z")
    const rawE = get("E")
    const e = rawE === undefined ? undefined : rawE * unit
    // Fanuc lathe incremental addresses (G-code system A): U is an X distance, W a Z distance.
    const u = latheContext ? get("U") : undefined
    const wInc = latheContext ? get("W") : undefined
    const rotaryWord = get("A") !== undefined || get("B") !== undefined || (!polar && get("C") !== undefined)
    const hasAxis = x !== undefined || y !== undefined || z !== undefined || u !== undefined || wInc !== undefined || (rotaryWord && (motion === 0 || motion === 1))
    if (setting !== undefined) {
      if (setting === "home") homed = true
      else if (setting === "g52") {
        if (x !== undefined) local.x = x * unit
        if (y !== undefined) local.y = y * unit
        if (z !== undefined) local.z = z * unit
      } else if (setting === "g10") {
        const l = get("L"), p = get("P"), r = get("R")
        if (l === 2 && p !== undefined && p >= 1 && p <= 6) {
          const was = workOffsets.get(53 + Math.round(p)) ?? { x: 0, y: 0, z: 0 }
          workOffsets.set(53 + Math.round(p), { x: x !== undefined ? x * unit : was.x, y: y !== undefined ? y * unit : was.y, z: z !== undefined ? z * unit : was.z })
        } else if ((l === 12 || l === 13) && p !== undefined && r !== undefined) {
          // Fanuc cutter radius geometry (L12) or wear (L13) of D`p`.
          const d = Math.round(p)
          dRegisters.set(d, l === 12 ? r * unit : (dRegisters.get(d) ?? 0) + r * unit)
        }
        // Tool length offsets (L10, L11, L1) and the extended work offsets (L20) do not move the drawn path.
      } else {
        // Coordinate setting: the tool stays where it is and that point gets the programmed value.
        const o = offsets()
        const h = here()
        if (x !== undefined) shift.x = h.x - x * unit - (o.x - shift.x)
        if (y !== undefined) shift.y = h.y - y * unit - (o.y - shift.y)
        if (z !== undefined) shift.z = h.z - z * unit - (o.z - shift.z)
        if (e !== undefined && setting === "g92") ePos = e
      }
      return ending ? "end" : "next"
    }
    let extrusion = 0
    if (e !== undefined) {
      const next = eAbsolute ? e : ePos + e
      extrusion = next - ePos
      ePos = next
    }
    const before = segments.length
    // `G91`: the axis words are distances from where the tool is (arc centres always are).
    const axis = (value: number | undefined, current: number, offset: number): number => (value === undefined ? current : absolute ? value * unit + offset : current + value * unit)
    const start = here()
    let target: P3
    if (frame === undefined && u === undefined && wInc === undefined) {
      const o = offsets()
      target = { x: axis(x, start.x, o.x), y: axis(y, start.y, o.y), z: axis(z, start.z, o.z) }
    } else {
      const p0 = programOf(start)
      const p = { x: x === undefined ? p0.x : absolute ? x * unit : p0.x + x * unit, y: y === undefined ? p0.y : absolute ? y * unit : p0.y + y * unit, z: z === undefined ? p0.z : absolute ? z * unit : p0.z + z * unit }
      if (u !== undefined) p.x = p0.x + u * unit
      if (wInc !== undefined) p.z = p0.z + wInc * unit
      target = place(p)
    }

    // Cutter compensation: G40 ends it (the block's move leaves the offset), G41 / G42 start it on the next XY move.
    if (compWord === 0) {
      flushComp()
      comp = undefined
      compStartup = false
      progPos = undefined
    } else if (compWord !== undefined) {
      flushComp()
      const d = get("D")
      const radius = radiusFor(d)
      if (radius === undefined) {
        errors.push(`line ${physical}: G${compWord === 1 ? 41 : 42} needs the tool radius (D${d ?? ""} is not set by G10 L12, the host or a T/D header comment): drawn on the programmed path`)
        unsupported.push({ line: physical, word: `G${compWord === 1 ? 41 : 42}` })
        comp = undefined
      } else if (radius > 0) {
        comp = { side: compWord, radius }
        compStartup = true
        progPos = { ...here() }
      }
    }
    const compensating = comp !== undefined && plane === 17 && (frame === undefined || frame.planar) && (motion === 0 || motion === 1 || motion === 2 || motion === 3)
    if (comp !== undefined && compWord === undefined && !compensating && hasAxis) flushComp()

    if (compensating && hasAxis) {
      const from = here()
      const xy = Math.hypot(target.x - from.x, target.y - from.y) > 1e-12
      let arc: { readonly center: { readonly x: number; readonly y: number }; readonly clockwise: boolean } | undefined
      if (motion === 2 || motion === 3) {
        const i = get("I"), j = get("J"), r = get("R")
        const c = arcCentre(from, target, motion === 2, i, j, r)
        if (c !== undefined) arc = { center: c, clockwise: motion === 2 }
      }
      const rate = motion === 0 ? feed : feedNow(false)
      if (xy || arc !== undefined) compElement(arc !== undefined ? { kind: "arc", from, to: target, center: arc.center, clockwise: arc.clockwise } : { kind: "line", from, to: target }, motion === 0, rate, lineNo)
      else if (Math.abs(target.z - from.z) > 1e-12) {
        if (pending !== undefined) pending.queued.push({ z: target.z, rapid: motion === 0, feed: rate, line: lineNo })
        else go({ ...pos, z: target.z }, motion === 0, rate, lineNo)
      }
      progPos = target
    } else if (motion === 0 && hasAxis) rapid(target, lineNo)
    else if (motion === 1 && hasAxis) linear(target, lineNo, inverse ? feed * dist(start, target) : feedNow(false))
    else if (motion === 32 && hasAxis) linear(target, lineNo, feedNow(true))
    else if (motion === 38 && hasAxis) linear(target, lineNo, feedNow(false))
    else if ((motion === 2 || motion === 3) && hasAxis && (plane !== 17 || (frame !== undefined && !frame.planar))) {
      const i = get("I"), j = get("J"), k = get("K"), r = get("R")
      const words = { ...(i !== undefined ? { i } : {}), ...(j !== undefined ? { j } : {}), ...(k !== undefined ? { k } : {}), ...(r !== undefined ? { r } : {}) }
      if (frame === undefined) planeArc(start, target, motion === 2, words, lineNo, (p) => p)
      else planeArc(programOf(start), programOf(target), motion === 2, words, lineNo, place)
    } else if ((motion === 2 || motion === 3) && hasAxis) {
      const center = arcCentre(start, target, motion === 2, get("I"), get("J"), get("R"))
      if (center !== undefined) arcTo(target, center, motion === 2, feedNow(false), lineNo)
    } else if (motion === 73 || motion === 74 || motion === 76 || (motion >= 81 && motion <= 89)) {
      flushComp()
      if (!absolute) {
        if (hasAxis || cycleStarted) errors.push(`line ${physical}: canned cycle in incremental mode`)
        return ending ? "end" : "next"
      }
      const zw = get("Z")
      const rw = get("R")
      const qw = get("Q")
      const pw = get("P")
      if (zw !== undefined) cycle.z = zw * unit
      if (rw !== undefined) cycle.r = rw * unit
      if (qw !== undefined) cycle.q = qw * unit
      if (pw !== undefined) cycle.p = pw * dwellFactor
      if (!(x !== undefined || y !== undefined || cycleStarted)) return ending ? "end" : "next"
      if (cycle.z === undefined || cycle.r === undefined) {
        errors.push(`line ${physical}: canned cycle without Z/R`)
        return ending ? "end" : "next"
      }
      // The hole, its bottom and its R level in program coordinates; `at` places a level of the hole in the output.
      const p0 = programOf(pos)
      const hx = x !== undefined ? x * unit : p0.x
      const hy = y !== undefined ? y * unit : p0.y
      const initialZ = p0.z
      const bottom = cycle.z
      const rz = cycle.r
      const at = (zz: number, dx = 0): P3 => place({ x: hx + dx, y: hy, z: zz })
      if (Math.abs(hx - p0.x) > 1e-12 || Math.abs(hy - p0.y) > 1e-12) rapid(at(initialZ), lineNo)
      const dwell = (): void => {
        if (motion !== 81 && (cycle.p ?? 0) > 0) { segments.push({ kind: "dwell", seconds: cycle.p ?? 0, line: lineNo, ...inSub() }); sample(lineNo, pos) }
      }
      const up = retractMode === 98 ? Math.max(initialZ, rz) : rz
      const turning = spindle
      if (motion === 87) {
        // Back boring: oriented and shifted, down past the hole to R (below), back on the axis, the spindle on, up to Z.
        const q = cycle.q ?? 0
        spindle = "off"
        rapid(at(initialZ, q), lineNo)
        rapid(at(rz, q), lineNo)
        rapid(at(rz), lineNo)
        spindle = turning === "off" ? "cw" : turning
        linear(at(bottom), lineNo, feedNow(false))
        dwell()
        spindle = "off"
        rapid(at(bottom, q), lineNo)
        rapid(at(initialZ, q), lineNo)
        rapid(at(initialZ), lineNo)
        spindle = turning
        return ending ? "end" : "next"
      }
      rapid(at(rz), lineNo)
      if (motion === 81 || motion === 82) {
        linear(at(bottom), lineNo)
        dwell()
      } else if (motion === 73 || motion === 83) {
        const peck = cycle.q !== undefined && cycle.q > 0 ? cycle.q : rz - bottom
        let level = rz
        while (level > bottom + 1e-9) {
          const next = Math.max(bottom, level - peck)
          linear(at(next), lineNo)
          if (next <= bottom + 1e-9) break
          if (motion === 83) {
            rapid(at(rz), lineNo)
            rapid(at(Math.min(rz, next + 0.5)), lineNo)
          } else {
            rapid(at(Math.min(rz, next + 0.5)), lineNo)
          }
          level = next
        }
        dwell()
      } else {
        // Tapping, boring: in at feed, then each cycle's own way out to R.
        const rate = feedNow(false)
        linear(at(bottom), lineNo, rate)
        if (motion === 84 || motion === 74) {
          // The tap reverses at the bottom and feeds out at the same rate (G84 right hand: M3 in, M4 out; G74 the reverse).
          dwell()
          spindle = motion === 84 ? "ccw" : "cw"
          linear(at(rz), lineNo, rate)
          spindle = turning
        } else if (motion === 85 || motion === 89) {
          if (motion === 89) dwell()
          linear(at(rz), lineNo, rate)
        } else if (motion === 86) {
          spindle = "off"
          rapid(at(rz), lineNo)
          spindle = turning
        } else if (motion === 88) {
          dwell()
          spindle = "off"
          rapid(at(rz), lineNo)
          spindle = turning
        } else {
          // G76 fine boring: dwell, orient (spindle stopped), shift Q off the wall, out, shift back.
          const q = cycle.q ?? 0
          dwell()
          spindle = "off"
          rapid(at(bottom, q), lineNo)
          rapid(at(up, q), lineNo)
          rapid(at(up), lineNo)
          spindle = turning
          return ending ? "end" : "next"
        }
      }
      if (motion === 81 || motion === 82 || motion === 73 || motion === 83) rapid(at(up), lineNo)
      else if (up > rz) rapid(at(up), lineNo)
    }
    if (extrusion !== 0) {
      const made = segments.length - before
      // The filament of the block is spread over the segments it made (chords of an arc) by their length.
      if (made === 0) { if (extrusion < 0) retracted = true }
      else if (states !== undefined) {
        let total = 0
        for (let n = before; n < segments.length; n++) { const g = segments[n]!; if (g.kind !== "dwell") total += dist(g.from, g.to) }
        for (let n = before; n < segments.length; n++) {
          const g = segments[n]!
          states[n]!.extrude = total > 0 && g.kind !== "dwell" ? (extrusion * dist(g.from, g.to)) / total : extrusion / made
        }
      }
    }
    drain()

    if (call !== undefined) {
      const target = programs.get(call.program)
      if (target === undefined) errors.push(`line ${physical}: M98 calls O${call.program}, which the program does not define`)
      else if (depth >= MAX_CALL_DEPTH) errors.push(`line ${physical}: subprograms nested deeper than ${MAX_CALL_DEPTH}`)
      else {
        const outer = site
        const callPhysical = physical
        for (let n = 0; n < call.times; n++) {
          site ??= callPhysical
          const flow = run(target.start, target.end, depth + 1)
          site = outer
          if (flow === "end") return "end"
        }
        physical = callPhysical
      }
    }
    return ending ? "end" : returning ? "return" : "next"
  }

  /** The centre of a G17 arc from I/J (relative, or absolute under G90.1) or R. */
  const arcCentre = (from: P3, target: P3, clockwise: boolean, i: number | undefined, j: number | undefined, r: number | undefined): { x: number; y: number } | undefined => {
    if (i !== undefined || j !== undefined) {
      if (frame === undefined && !arcCentreAbsolute) return { x: from.x + (i ?? 0) * unit, y: from.y + (j ?? 0) * unit }
      const p0 = programOf(from)
      const c = place(arcCentreAbsolute ? { x: (i ?? 0) * unit, y: (j ?? 0) * unit, z: p0.z } : { x: p0.x + (i ?? 0) * unit, y: p0.y + (j ?? 0) * unit, z: p0.z })
      return { x: c.x, y: c.y }
    }
    if (r !== undefined) {
      const dx = target.x - from.x
      const dy = target.y - from.y
      const d = Math.hypot(dx, dy)
      if (d < 1e-12) { errors.push(`line ${physical}: R arc with identical endpoints`); return undefined }
      const radius = Math.abs(r) * unit
      const h2 = radius * radius - (d / 2) * (d / 2)
      if (h2 < -1e-9) errors.push(`line ${physical}: R too small for the chord`)
      const h = Math.sqrt(Math.max(0, h2))
      // Minor arc (R > 0): centre on the right of the chord for CW, left for CCW.
      const side = (clockwise ? -1 : 1) * (r > 0 ? 1 : -1)
      const mx = (from.x + target.x) / 2
      const my = (from.y + target.y) / 2
      return { x: mx + (-dy / d) * h * side, y: my + (dx / d) * h * side }
    }
    errors.push(`line ${physical}: arc without I/J/R`)
    return undefined
  }

  const run = (start: number, end: number, depth: number): Flow => {
    for (let index = start; index < end; index++) {
      const flow = execLine(lines[index]!, index, depth)
      if (flow !== "next") return flow
      // A lathe cycle continues after its profile blocks.
      if (jumpTo !== undefined) { const to = jumpTo; jumpTo = undefined; if (to > index && to <= end) index = to - 1 }
    }
    return "next"
  }

  run(0, mainEnd, 0)
  flushComp()
  drain()

  return { segments, errors, end: pos, cutLength, rapidLength, minZ, mCodes, tools, toolNames, ended, unsupported, ...(states !== undefined ? { states } : {}) }
}

// -- frame maths ----------------------------------------------------------------------------------------------------------

type Mat3 = readonly [number, number, number, number, number, number, number, number, number]
interface Frame { readonly m: Mat3; readonly t: P3; readonly planar: boolean }
const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const mul3 = (m: Mat3, p: P3): P3 => ({ x: m[0] * p.x + m[1] * p.y + m[2] * p.z, y: m[3] * p.x + m[4] * p.y + m[5] * p.z, z: m[6] * p.x + m[7] * p.y + m[8] * p.z })
const mulT3 = (m: Mat3, p: P3): P3 => ({ x: m[0] * p.x + m[3] * p.y + m[6] * p.z, y: m[1] * p.x + m[4] * p.y + m[7] * p.z, z: m[2] * p.x + m[5] * p.y + m[8] * p.z })
const mulM3 = (a: Mat3, b: Mat3): Mat3 => {
  const out: number[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!)
  return out as unknown as Mat3
}
/** A right-handed rotation about a frame axis, degrees. */
const rot3 = (axis: "x" | "y" | "z", degrees: number): Mat3 => {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === "y" ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]
}
/** `inner` expressed in `outer`: p -> outer(inner(p)). */
const compose = (outer: Frame, inner: Frame): Frame => {
  const t = mul3(outer.m, inner.t)
  return { m: mulM3(outer.m, inner.m), t: { x: t.x + outer.t.x, y: t.y + outer.t.y, z: t.z + outer.t.z }, planar: outer.planar && inner.planar }
}

/** G words accepted without a geometric effect on the drawn path. */
const ACCEPTED_G: ReadonlyArray<number> = [5, 5.1, 8, 9, 43, 43.4, 43.5, 49, 53.1, 54.1, 61, 61.1, 62, 63, 64, 103, 187, 234]

/** Keyword statements that do not move the machine (Siemens settings, messages, TCP on / off). */
const SILENT_STATEMENTS = new Set(["MSG", "TRAORI", "TRAFOOF", "SOFT", "BRISK", "FFWON", "FFWOF", "CFC", "CFTCP", "CFIN", "STOPRE", "WORKPIECE", "DIAMON", "DIAMOF", "DIAM90", "CYCLE832", "COMPCAD", "COMPCURV", "COMPOF", "SUPA", "TOFFON", "TOFFOF", "SETMS", "SPOS", "WAIT", "DEF", "PRINT_START", "PRINT_END", "START_PRINT", "END_PRINT", "SET_PRESSURE_ADVANCE"])
