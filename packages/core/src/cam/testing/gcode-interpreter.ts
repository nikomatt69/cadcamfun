/**
 * Reference G-code interpreter. **Test-only helper**: it parses the text the
 * posts emit and replays it into plain segments, so tests can assert geometry
 * (depth, arc radii, path length, rapids at depth) independently of the IR and
 * of the emitter that produced the text.
 *
 * Supported: `G0 G1 G2 G3` (I/J or R), `G4`, `G17`, `G20/G21`, `G90/G91` (X Y Z; arc centres are always
 * relative to the start point), `G98/G99`, canned cycles `G73 G81 G82 G83` + `G80` (absolute only), modal
 * feed, rotary words `A/B/C` (degrees, carried on the segment they are written on), `M` codes recorded, and
 * subprograms: `O<n>` programs after the main one, `M98 P<n> [L<count>]` calls (nested up to
 * {@link MAX_CALL_DEPTH}), `M99` return, `M30`/`M2` ending the whole program.
 * Anything else with an effect on motion (other planes) is reported in `errors`. Output units are
 * always millimetres.
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
  const mCodes: string[] = []
  const tools: number[] = []
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

  const note = (p: P3): void => {
    if (p.z < minZ) minZ = p.z
  }
  const dist = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  // Rotary words are modal like any other: only the axes written on a line change.
  let rotary: RotaryAngles = {}
  const rotaryOf = (): RotaryAngles | undefined => (Object.keys(rotary).length === 0 ? undefined : { ...rotary })
  const inSub = (): { readonly subLine?: number } => (site === undefined ? {} : { subLine: physical })

  const rapid = (to: P3, line: number): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "rapid", from: pos, to, feed, line, ...inSub() } : { kind: "rapid", from: pos, to, feed, line, ...inSub(), rotary: angles })
    rapidLength += dist(pos, to)
    pos = to
    note(pos)
  }
  const linear = (to: P3, line: number): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "linear", from: pos, to, feed, line, ...inSub() } : { kind: "linear", from: pos, to, feed, line, ...inSub(), rotary: angles })
    cutLength += dist(pos, to)
    pos = to
    note(pos)
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
    let call: { readonly program: number; readonly times: number } | undefined
    for (const w of words) {
      if (w.letter === "G") {
        const g = Math.round(w.value * 10) / 10
        if ([0, 1, 2, 3, 73, 80, 81, 82, 83].includes(g)) {
          motion = g
          if (g === 73 || (g >= 81 && g <= 83)) cycleStarted = true
        } else if (g === 20) unit = 25.4
        else if (g === 21) unit = 1
        else if (g === 98 || g === 99) retractMode = g
        else if (g === 4) {
          const p = get("P") ?? get("X") ?? 0
          segments.push({ kind: "dwell", seconds: p * dwellFactor, line: lineNo, ...inSub() })
        } else if (g === 90) absolute = true
        else if (g === 91) absolute = false
        else if ([17, 94, 40, 49, 43, 54, 55, 56, 57, 58, 59].includes(g)) {
          // Accepted modal words without geometric effect here.
        } else errors.push(`line ${physical}: unsupported G${g}`)
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
        }
      } else if (w.letter === "T") {
        tools.push(Math.round(w.value))
      } else if (w.letter === "F") {
        feed = w.value * unit
      } else if (w.letter === "A" || w.letter === "B" || w.letter === "C") {
        // Rotary angles are degrees in both unit systems; they persist until changed.
        rotary = { ...rotary, [w.letter.toLowerCase()]: w.value }
      }
    }
    // A G4 line is a dwell only; it carries no motion words of its own.
    if (words.some((w) => w.letter === "G" && Math.round(w.value) === 4)) return ending ? "end" : "next"

    const x = get("X")
    const y = get("Y")
    const z = get("Z")
    const hasAxis = x !== undefined || y !== undefined || z !== undefined
    // `G91`: the axis words are distances from where the tool is (arc centres always are).
    const axis = (value: number | undefined, current: number): number => (value === undefined ? current : absolute ? value * unit : current + value * unit)
    const target: P3 = { x: axis(x, pos.x), y: axis(y, pos.y), z: axis(z, pos.z) }

    if (motion === 0 && hasAxis) rapid(target, lineNo)
    else if (motion === 1 && hasAxis) linear(target, lineNo)
    else if ((motion === 2 || motion === 3) && hasAxis) {
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
        segments.push({ kind: "arc", from: pos, to: target, center, clockwise, radiusStart, radiusEnd, feed, line: lineNo, ...inSub() })
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
      if (zw !== undefined) cycle.z = zw * unit
      if (rw !== undefined) cycle.r = rw * unit
      if (qw !== undefined) cycle.q = qw * unit
      if (pw !== undefined) cycle.p = pw * dwellFactor
      if (!(x !== undefined || y !== undefined || cycleStarted)) return ending ? "end" : "next"
      if (cycle.z === undefined || cycle.r === undefined) {
        errors.push(`line ${physical}: canned cycle without Z/R`)
        return ending ? "end" : "next"
      }
      const hx = x !== undefined ? x * unit : pos.x
      const hy = y !== undefined ? y * unit : pos.y
      const initialZ = pos.z
      const bottom = cycle.z
      const rz = cycle.r
      const at = (zz: number): P3 => ({ x: hx, y: hy, z: zz })
      if (Math.abs(hx - pos.x) > 1e-12 || Math.abs(hy - pos.y) > 1e-12) rapid(at(pos.z), lineNo)
      rapid(at(rz), lineNo)
      const dwell = (): void => {
        if (motion !== 81 && (cycle.p ?? 0) > 0) segments.push({ kind: "dwell", seconds: cycle.p ?? 0, line: lineNo, ...inSub() })
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

  return { segments, errors, end: pos, cutLength, rapidLength, minZ, mCodes, tools, ended }
}
