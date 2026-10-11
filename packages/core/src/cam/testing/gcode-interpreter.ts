/**
 * Reference G-code interpreter. **Test-only helper**: it parses the text the
 * posts emit and replays it into plain segments, so tests can assert geometry
 * (depth, arc radii, path length, rapids at depth) independently of the IR and
 * of the emitter that produced the text.
 *
 * Supported: `G0 G1 G2 G3` (I/J or R), `G4`, `G17`, `G20/G21`, `G90`, `G98/G99`,
 * canned cycles `G73 G81 G82 G83` + `G80`, modal feed, rotary words `A/B/C`
 * (degrees, carried on the segment they are written on), `M` codes recorded.
 * Anything else with an effect on motion (other planes, `G91`) is reported in
 * `errors`. Output units are always millimetres.
 */

export interface P3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type GSegment =
  | { readonly kind: "rapid" | "linear"; readonly from: P3; readonly to: P3; readonly feed: number; readonly line: number; readonly rotary?: RotaryAngles }
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
    }
  | { readonly kind: "dwell"; readonly seconds: number; readonly line: number }

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

  const rapid = (to: P3, line: number): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "rapid", from: pos, to, feed, line } : { kind: "rapid", from: pos, to, feed, line, rotary: angles })
    rapidLength += dist(pos, to)
    pos = to
    note(pos)
  }
  const linear = (to: P3, line: number): void => {
    if (dist(pos, to) < 1e-12) return
    const angles = rotaryOf()
    segments.push(angles === undefined ? { kind: "linear", from: pos, to, feed, line } : { kind: "linear", from: pos, to, feed, line, rotary: angles })
    cutLength += dist(pos, to)
    pos = to
    note(pos)
  }

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, index) => {
    const lineNo = index + 1
    const code = stripLine(raw)
    if (code === "" || code.startsWith("%")) return
    let words = tokenize(code)
    if (words[0]?.letter === "O") words = words.slice(1)
    if (words[0]?.letter === "N") words = words.slice(1)
    if (words.length === 0) return

    const get = (letter: string): number | undefined => words.find((w) => w.letter === letter)?.value
    let cycleStarted = false
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
          segments.push({ kind: "dwell", seconds: p * dwellFactor, line: lineNo })
        } else if ([17, 90, 94, 40, 49, 43, 54, 55, 56, 57, 58, 59].includes(g)) {
          // Accepted modal words without geometric effect here.
        } else errors.push(`line ${lineNo}: unsupported G${g}`)
      } else if (w.letter === "M") {
        mCodes.push(`M${Math.round(w.value)}`)
        if (w.value === 2 || w.value === 30) ended = true
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
    if (words.some((w) => w.letter === "G" && Math.round(w.value) === 4)) return

    const x = get("X")
    const y = get("Y")
    const z = get("Z")
    const hasAxis = x !== undefined || y !== undefined || z !== undefined
    const target: P3 = {
      x: x !== undefined ? x * unit : pos.x,
      y: y !== undefined ? y * unit : pos.y,
      z: z !== undefined ? z * unit : pos.z
    }

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
        if (d < 1e-12) errors.push(`line ${lineNo}: R arc with identical endpoints`)
        else {
          const radius = Math.abs(r) * unit
          const h2 = radius * radius - (d / 2) * (d / 2)
          if (h2 < -1e-9) errors.push(`line ${lineNo}: R too small for the chord`)
          const h = Math.sqrt(Math.max(0, h2))
          // Minor arc (R > 0): centre on the right of the chord for CW, left for CCW.
          const side = (clockwise ? -1 : 1) * (r > 0 ? 1 : -1)
          const mx = (pos.x + target.x) / 2
          const my = (pos.y + target.y) / 2
          center = { x: mx + (-dy / d) * h * side, y: my + (dx / d) * h * side }
        }
      } else errors.push(`line ${lineNo}: arc without I/J/R`)
      if (center !== undefined) {
        const radiusStart = Math.hypot(pos.x - center.x, pos.y - center.y)
        const radiusEnd = Math.hypot(target.x - center.x, target.y - center.y)
        const a0 = Math.atan2(pos.y - center.y, pos.x - center.x)
        const a1 = Math.atan2(target.y - center.y, target.x - center.x)
        let sweep = clockwise ? a0 - a1 : a1 - a0
        sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        if (Math.hypot(target.x - pos.x, target.y - pos.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
        const length = Math.hypot(radiusStart * sweep, target.z - pos.z)
        segments.push({ kind: "arc", from: pos, to: target, center, clockwise, radiusStart, radiusEnd, feed, line: lineNo })
        cutLength += length
        pos = target
        note(pos)
      }
    } else if (motion === 73 || (motion >= 81 && motion <= 83)) {
      const zw = get("Z")
      const rw = get("R")
      const qw = get("Q")
      const pw = get("P")
      if (zw !== undefined) cycle.z = zw * unit
      if (rw !== undefined) cycle.r = rw * unit
      if (qw !== undefined) cycle.q = qw * unit
      if (pw !== undefined) cycle.p = pw * dwellFactor
      if (!(x !== undefined || y !== undefined || cycleStarted)) return
      if (cycle.z === undefined || cycle.r === undefined) {
        errors.push(`line ${lineNo}: canned cycle without Z/R`)
        return
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
        if (motion !== 81 && (cycle.p ?? 0) > 0) segments.push({ kind: "dwell", seconds: cycle.p ?? 0, line: lineNo })
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
  })

  return { segments, errors, end: pos, cutLength, rapidLength, minZ, mCodes, tools, ended }
}
