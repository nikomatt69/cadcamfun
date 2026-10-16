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
 * Anything else with an effect on motion is reported in `errors` (and `unsupported`). Output units are always millimetres.
 *
 * Motion inside a subprogram carries the line of the call in the main program as `line` (the block the
 * operation, the tool and every finding refer to) and its own physical line as `subLine`.
 */

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
  const mCodes: string[] = []
  const tools: number[] = []
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
  const sample = (line: number, at: P3): void => {
    if (states === undefined) return
    states.push({ spindle, rpm: spindle === "off" ? 0 : rpmAt(at.x), css, plane, xMode, extrude: 0, retract: retracted, home: homed, tool, coolant, feedMode: feedRev ? "rev" : "min", line })
    retracted = false
    homed = false
  }

  const rapid = (to: P3, line: number): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "rapid", from: pos, to, feed, line, ...inSub() } : { kind: "rapid", from: pos, to, feed, line, ...inSub(), rotary: angles })
    sample(line, to)
    rapidLength += dist(pos, to)
    pos = to
    note(pos)
  }
  const linear = (to: P3, line: number, rate = feed): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "linear", from: pos, to, feed: rate, line, ...inSub() } : { kind: "linear", from: pos, to, feed: rate, line, ...inSub(), rotary: angles })
    sample(line, to)
    cutLength += dist(pos, to)
    pos = to
    note(pos)
  }
  /** An arc in the G18 (ZX) or G19 (YZ) plane, replayed as chords; the sense is seen from the plane's normal (+Y, +X). */
  const planeArc = (target: P3, clockwise: boolean, words: { readonly i?: number; readonly j?: number; readonly k?: number; readonly r?: number }, line: number): void => {
    // (u, v, w): the plane's axes in right-handed order and its normal. G18: (Z, X, Y), G19: (Y, Z, X).
    const toUvw = (p: P3): [number, number, number] => (plane === 18 ? [p.z, p.x, p.y] : [p.y, p.z, p.x])
    const fromUvw = (u: number, v: number, w: number): P3 => (plane === 18 ? { x: v, y: w, z: u } : { x: w, y: u, z: v })
    const [u0, v0, w0] = toUvw(pos)
    const [u1, v1, w1] = toUvw(target)
    const du = plane === 18 ? words.k : words.j
    const dv = plane === 18 ? words.i : words.k
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
    } else { errors.push(`line ${physical}: arc without ${plane === 18 ? "I/K" : "J/K"}/R`); return }
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
      if (n === count) { linear(target, line, rate); break }
      const a = a0 + (clockwise ? -1 : 1) * sweep * t
      const r = r0 + (r1 - r0) * t
      linear(fromUvw(cu + r * Math.cos(a), cv + r * Math.sin(a), w0 + (w1 - w0) * t), line, rate)
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

  const execLine = (raw: string, index: number, depth: number): Flow => {
    physical = index + 1
    const lineNo = site ?? physical
    const code = stripLine(raw)
    if (code === "" || code.startsWith("%")) return "next"
    let words = tokenize(code)
    if (words[0]?.letter === "O") words = words.slice(1)
    if (words[0]?.letter === "N") words = words.slice(1)
    if (words.length === 0) return "next"

    const get = (letter: string): number | undefined => words.find((w) => w.letter === letter)?.value
    let cycleStarted = false
    let ending = false
    let returning = false
    /** The block sets coordinates (G92 / G50 X Z) or homes (G28): its axis words are not a move. */
    let setting: "g92" | "g50" | "home" | undefined
    let sIsParameter = false
    let call: { readonly program: number; readonly times: number } | undefined
    for (const w of words) {
      if (w.letter === "G") {
        const g = Math.round(w.value * 10) / 10
        if ([0, 1, 2, 3, 73, 80, 81, 82, 83].includes(g)) {
          motion = g
          if (g === 73 || (g >= 81 && g <= 83)) cycleStarted = true
        } else if (g === 32 || g === 33) motion = 32
        else if (g === 20) unit = 25.4
        else if (g === 21) unit = 1
        else if (g === 98 || g === 99) retractMode = g
        else if (g === 4) {
          const p = get("P") ?? get("X") ?? 0
          segments.push({ kind: "dwell", seconds: p * dwellFactor, line: lineNo, ...inSub() })
          sample(lineNo, pos)
        } else if (g === 90) { absolute = true; eAbsolute = true }
        else if (g === 91) { absolute = false; eAbsolute = false }
        else if (g === 17 || g === 18 || g === 19) plane = g
        else if (g === 7) xMode = "diameter"
        else if (g === 8) xMode = "radius"
        else if (g === 94) feedRev = false
        else if (g === 95) feedRev = true
        else if (g === 96) css = true
        else if (g === 97) css = false
        else if (g === 92) setting = "g92"
        else if (g === 92.1) { shift.x = 0; shift.y = 0; shift.z = 0 }
        else if (g === 50) setting = "g50"
        else if (g === 28) setting = "home"
        else if ([40, 49, 43, 54, 55, 56, 57, 58, 59].includes(g)) {
          // Accepted modal words without geometric effect here.
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
        else if (m === 7) coolant = "mist"
        else if (m === 8) coolant = "flood"
        else if (m === 9) coolant = "off"
        else if (m === 82) eAbsolute = true
        else if (m === 83) eAbsolute = false
        if ([104, 109, 140, 190, 106, 107, 141, 191].includes(m)) sIsParameter = true
      } else if (w.letter === "T") {
        tools.push(Math.round(w.value))
        tool = Math.round(w.value)
      } else if (w.letter === "F") {
        feed = w.value * unit
      } else if (w.letter === "A" || w.letter === "B" || w.letter === "C") {
        // Rotary angles are degrees in both unit systems; they persist until changed.
        rotary = { ...rotary, [w.letter.toLowerCase()]: w.value }
      }
    }
    const s = get("S")
    if (s !== undefined && !sIsParameter) {
      // `G50 S` / `G92 S` alone limit the spindle of a lathe; otherwise S is the speed (rpm, or m/min under G96).
      if ((setting === "g50" || setting === "g92") && get("X") === undefined && get("Y") === undefined && get("Z") === undefined) maxRpm = s
      else sWord = s
    }
    // A G4 line is a dwell only; it carries no motion words of its own.
    if (words.some((w) => w.letter === "G" && Math.round(w.value) === 4)) return ending ? "end" : "next"

    const x = get("X")
    const y = get("Y")
    const z = get("Z")
    const e = get("E")
    const hasAxis = x !== undefined || y !== undefined || z !== undefined
    if (setting !== undefined) {
      if (setting === "home") homed = true
      else {
        // Coordinate setting: the tool stays where it is and that point gets the programmed value.
        if (x !== undefined) shift.x = pos.x - x * unit
        if (y !== undefined) shift.y = pos.y - y * unit
        if (z !== undefined) shift.z = pos.z - z * unit
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
    const target: P3 = { x: axis(x, pos.x, shift.x), y: axis(y, pos.y, shift.y), z: axis(z, pos.z, shift.z) }

    if (motion === 0 && hasAxis) rapid(target, lineNo)
    else if (motion === 1 && hasAxis) linear(target, lineNo, feedNow(false))
    else if (motion === 32 && hasAxis) linear(target, lineNo, feedNow(true))
    else if ((motion === 2 || motion === 3) && hasAxis && plane !== 17) {
      const i = get("I"), j = get("J"), k = get("K"), r = get("R")
      planeArc(target, motion === 2, { ...(i !== undefined ? { i } : {}), ...(j !== undefined ? { j } : {}), ...(k !== undefined ? { k } : {}), ...(r !== undefined ? { r } : {}) }, lineNo)
    } else if ((motion === 2 || motion === 3) && hasAxis) {
      const clockwise = motion === 2
      const i = get("I")
      const j = get("J")
      const r = get("R")
      let center: { x: number; y: number } | undefined
      if (i !== undefined || j !== undefined) {
        center = { x: pos.x + (i ?? 0) * unit, y: pos.y + (j ?? 0) * unit }
      } else if (r !== undefined) {
        const dx = target.x - pos.x
        const dy = target.y - pos.y
        const d = Math.hypot(dx, dy)
        if (d < 1e-12) errors.push(`line ${physical}: R arc with identical endpoints`)
        else {
          const radius = Math.abs(r) * unit
          const h2 = radius * radius - (d / 2) * (d / 2)
          if (h2 < -1e-9) errors.push(`line ${physical}: R too small for the chord`)
          const h = Math.sqrt(Math.max(0, h2))
          // Minor arc (R > 0): centre on the right of the chord for CW, left for CCW.
          const side = (clockwise ? -1 : 1) * (r > 0 ? 1 : -1)
          const mx = (pos.x + target.x) / 2
          const my = (pos.y + target.y) / 2
          center = { x: mx + (-dy / d) * h * side, y: my + (dx / d) * h * side }
        }
      } else errors.push(`line ${physical}: arc without I/J/R`)
      if (center !== undefined) {
        const radiusStart = Math.hypot(pos.x - center.x, pos.y - center.y)
        const radiusEnd = Math.hypot(target.x - center.x, target.y - center.y)
        const a0 = Math.atan2(pos.y - center.y, pos.x - center.x)
        const a1 = Math.atan2(target.y - center.y, target.x - center.x)
        let sweep = clockwise ? a0 - a1 : a1 - a0
        sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        if (Math.hypot(target.x - pos.x, target.y - pos.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
        const length = Math.hypot(radiusStart * sweep, target.z - pos.z)
        segments.push({ kind: "arc", from: pos, to: target, center, clockwise, radiusStart, radiusEnd, feed: feedNow(false), line: lineNo, ...inSub() })
        sample(lineNo, target)
        cutLength += length
        pos = target
        note(pos)
      }
    } else if (motion === 73 || (motion >= 81 && motion <= 83)) {
      if (!absolute) {
        if (hasAxis || cycleStarted) errors.push(`line ${physical}: canned cycle in incremental mode`)
        return ending ? "end" : "next"
      }
      const zw = get("Z")
      const rw = get("R")
      const qw = get("Q")
      const pw = get("P")
      if (zw !== undefined) cycle.z = zw * unit + shift.z
      if (rw !== undefined) cycle.r = rw * unit + shift.z
      if (qw !== undefined) cycle.q = qw * unit
      if (pw !== undefined) cycle.p = pw * dwellFactor
      if (!(x !== undefined || y !== undefined || cycleStarted)) return ending ? "end" : "next"
      if (cycle.z === undefined || cycle.r === undefined) {
        errors.push(`line ${physical}: canned cycle without Z/R`)
        return ending ? "end" : "next"
      }
      const hx = x !== undefined ? x * unit + shift.x : pos.x
      const hy = y !== undefined ? y * unit + shift.y : pos.y
      const initialZ = pos.z
      const bottom = cycle.z
      const rz = cycle.r
      const at = (zz: number): P3 => ({ x: hx, y: hy, z: zz })
      if (Math.abs(hx - pos.x) > 1e-12 || Math.abs(hy - pos.y) > 1e-12) rapid(at(pos.z), lineNo)
      rapid(at(rz), lineNo)
      const dwell = (): void => {
        if (motion !== 81 && (cycle.p ?? 0) > 0) { segments.push({ kind: "dwell", seconds: cycle.p ?? 0, line: lineNo, ...inSub() }); sample(lineNo, pos) }
      }
      if (motion === 81 || motion === 82) {
        linear(at(bottom), lineNo)
        dwell()
      } else {
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
      }
      rapid(at(retractMode === 98 ? Math.max(initialZ, rz) : rz), lineNo)
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

  const run = (start: number, end: number, depth: number): Flow => {
    for (let index = start; index < end; index++) {
      const flow = execLine(lines[index]!, index, depth)
      if (flow !== "next") return flow
    }
    return "next"
  }

  run(0, mainEnd, 0)

  return { segments, errors, end: pos, cutLength, rapidLength, minZ, mCodes, tools, ended, unsupported, ...(states !== undefined ? { states } : {}) }
}
