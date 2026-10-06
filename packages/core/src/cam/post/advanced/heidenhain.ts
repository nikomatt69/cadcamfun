/**
 * Heidenhain conversational conversion (legacy `convertToHeidenhain` and its follow-up passes).
 *
 * Fixed relative to the legacy converter (which matched codes by substring and so mis-converted `G01` as a rapid
 * and `M30` as `M3`):
 *  - codes are matched as whole words;
 *  - the active motion mode is tracked, so modal coordinate-only lines are still converted;
 *  - canned-cycle positioning points do not carry the Z depth (the legacy rapid went to full depth);
 *  - arcs get `DR-`/`DR+` and the radius sign follows the arc size, using the tracked start point;
 *  - radius compensation (`G41`/`G42`/`G40`) is attached to the next motion block (`RL`/`RR`/`R0`), not a block of its own;
 *  - repeated drilling cycles with identical parameters are defined once and called through an `LBL` subprogram
 *    (the legacy pattern defined points without `M99`, so the cycle never ran, and kept the original blocks as well).
 */
import type { Validation } from "./options.ts"
import {
  codePart,
  extractArcCenter,
  extractCoordinates,
  extractCycleDepth,
  extractFeedrate,
  extractPeckDepth,
  extractRetractHeight,
  extractThreadPitch,
  formatHeidenhainCoords,
  has,
  type Coords
} from "./text.ts"

const POINT_RE = /^\d+ L (X.*) FMAX M99$/

/** Sweep angle of an arc (degrees, 0-360) from `start` to `end` around `center`. */
const sweepDegrees = (start: { x: number; y: number }, end: { x: number; y: number }, center: { x: number; y: number }, clockwise: boolean): number => {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x)
  const a1 = Math.atan2(end.y - center.y, end.x - center.x)
  let delta = clockwise ? a0 - a1 : a1 - a0
  while (delta <= 0) delta += Math.PI * 2
  while (delta > Math.PI * 2) delta -= Math.PI * 2
  return (delta * 180) / Math.PI
}

/** Converts standard G-code text to a Heidenhain conversational program. */
export const convertToHeidenhain = (code: string): string => {
  const lines = code.split("\n")
  const result: string[] = ["BEGIN PGM WORKPIECE MM"]

  // Stock size from a "Workpiece / Material / STOCK" comment of the form `100 x 50 x 20`.
  let maxX = 100
  let maxY = 100
  let maxZ = 100
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith(";") && (line.includes("Workpiece") || line.includes("Material") || line.includes("STOCK"))) {
      const m = line.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/)
      if (m) { maxX = parseInt(m[1]!); maxY = parseInt(m[2]!); maxZ = parseInt(m[3]!) }
    }
  }
  result.push("BLK FORM 0.1 Z X0 Y0 Z0")
  result.push(`BLK FORM 0.2 X+${maxX} Y+${maxY} Z+${maxZ}`)

  let toolNumber = 1
  for (const raw of lines) {
    const line = codePart(raw.trim())
    if (/T\d+/.test(line) && has(line, "M", 6)) {
      const m = line.match(/T(\d+)/)
      if (m) toolNumber = parseInt(m[1]!)
    }
  }
  result.push(`TOOL CALL ${toolNumber} Z S0 ; Initial tool call`)

  let n = 1
  const emit = (text: string): void => { result.push(`${n} ${text}`); n++ }

  let rapid = true
  let comp = "" // pending radius compensation word, attached to the next motion block
  let feed: number | null = null
  let emittedFeed: number | null = null
  const pos: { x: number | undefined; y: number | undefined; z: number | undefined } = { x: undefined, y: undefined, z: undefined }
  const track = (c: Coords): void => {
    if (c.x !== undefined) pos.x = c.x
    if (c.y !== undefined) pos.y = c.y
    if (c.z !== undefined) pos.z = c.z
  }
  const feedWord = (own: number | null): string => {
    if (own !== null) { feed = own; emittedFeed = own; return ` F${own}` }
    if (feed !== null && feed !== emittedFeed) { emittedFeed = feed; return ` F${feed}` }
    return ""
  }
  const takeComp = (): string => { const c = comp; comp = ""; return c ? ` ${c}` : "" }

  const cycleHeader = (cycle: string, q: ReadonlyArray<readonly [string, string | number, string]>): void => {
    emit(`CYCL DEF ${cycle}`)
    for (const [name, value, label] of q) emit(`${name}=${value} ; ${label}`)
  }
  const cyclePoint = (coords: Coords): void => {
    const { x, y } = coords
    const point = formatHeidenhainCoords({ ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) })
    if (point) emit(`L ${point} FMAX M99`)
    track(coords)
  }

  for (const raw of lines) {
    const line = raw.trim()
    // Units and distance-mode words are implicit in the Heidenhain header; what remains on the line is converted.
    const body = codePart(line).replace(/(?<![A-Za-z0-9.])G(?:20|21|90|91)(?!\d|\.\d)\s*/g, "").trim()

    if (line === "" || line.startsWith(";") || line.startsWith("%") || body === "") continue

    const coords = extractCoordinates(body)
    const hasCoords = Object.keys(coords).length > 0
    const f = extractFeedrate(body)

    if (has(body, "G", 0)) {
      rapid = true
      if (hasCoords) { emit(`L ${formatHeidenhainCoords(coords)}${takeComp()} FMAX`); track(coords) }
    } else if (has(body, "G", 1)) {
      rapid = false
      if (hasCoords) { emit(`L ${formatHeidenhainCoords(coords)}${takeComp()}${feedWord(f)}`); track(coords) }
      else if (f !== null) feed = f
    } else if (has(body, "G", 2) || has(body, "G", 3)) {
      rapid = false
      const clockwise = has(body, "G", 2)
      const center = extractArcCenter(body)
      const rWord = extractRetractHeight(body)
      if (hasCoords && (center || rWord !== null)) {
        let radius = rWord !== null && !center ? Math.abs(rWord) : Math.hypot(center?.i ?? 0, center?.j ?? 0)
        let sign = "+"
        const end = { x: coords.x ?? pos.x, y: coords.y ?? pos.y }
        if (center && pos.x !== undefined && pos.y !== undefined && end.x !== undefined && end.y !== undefined) {
          const c = { x: pos.x + (center.i ?? 0), y: pos.y + (center.j ?? 0) }
          sign = sweepDegrees({ x: pos.x, y: pos.y }, { x: end.x, y: end.y }, c, clockwise) > 180 ? "-" : "+"
        } else if (rWord !== null && !center) {
          sign = rWord < 0 ? "-" : "+"
          radius = Math.abs(rWord)
        }
        emit(`CR ${formatHeidenhainCoords(coords)} R${sign}${radius.toFixed(3)} DR${clockwise ? "-" : "+"}${takeComp()}${feedWord(f)}`)
        track(coords)
      }
    } else if (has(body, "G", 81)) {
      const depth = extractCycleDepth(body)
      const retract = extractRetractHeight(body)
      cycleHeader("200 DRILLING", [
        ["Q200", retract || 2, "SET-UP CLEARANCE"],
        ["Q201", `-${depth || 10}`, "DEPTH"],
        ["Q206", f || 150, "FEED RATE FOR PLUNGING"],
        ["Q202", depth || 10, "PLUNGING DEPTH"],
        ["Q210", 0, "DWELL TIME AT TOP"],
        ["Q203", 0, "SURFACE COORDINATE"],
        ["Q204", retract || 2, "2ND SET-UP CLEARANCE"],
        ["Q211", 0, "DWELL TIME AT DEPTH"]
      ])
      cyclePoint(coords)
    } else if (has(body, "G", 83)) {
      const depth = extractCycleDepth(body)
      const retract = extractRetractHeight(body)
      const peck = extractPeckDepth(body)
      cycleHeader("203 UNIVERSAL DRILLING", [
        ["Q200", retract || 2, "SET-UP CLEARANCE"],
        ["Q201", `-${depth || 10}`, "DEPTH"],
        ["Q206", f || 150, "FEED RATE FOR PLUNGING"],
        ["Q202", peck || 3, "PLUNGING DEPTH"],
        ["Q210", 0, "DWELL TIME AT TOP"],
        ["Q203", 0, "SURFACE COORDINATE"],
        ["Q204", retract || 2, "2ND SET-UP CLEARANCE"],
        ["Q212", 0, "DECREMENT"],
        ["Q213", 0, "BREAKS"],
        ["Q205", peck || 3, "MIN. PLUNGING DEPTH"],
        ["Q211", 0, "DWELL TIME AT DEPTH"],
        ["Q208", 500, "RETRACTION FEED RATE"],
        ["Q256", 0.2, "DIST. FOR CHIP BRKNG"]
      ])
      cyclePoint(coords)
    } else if (has(body, "G", 84)) {
      const depth = extractCycleDepth(body)
      const retract = extractRetractHeight(body)
      const pitch = extractThreadPitch(body)
      cycleHeader("207 RIGID TAPPING", [
        ["Q200", retract || 2, "SET-UP CLEARANCE"],
        ["Q201", `-${depth || 10}`, "DEPTH"],
        ["Q239", pitch || 1.5, "THREAD PITCH"],
        ["Q203", 0, "SURFACE COORDINATE"],
        ["Q204", retract || 2, "2ND SET-UP CLEARANCE"]
      ])
      cyclePoint(coords)
    } else if (has(body, "G", 80)) {
      // Cycle cancel: Heidenhain cycles are one-shot (M99), nothing to emit.
    } else if (has(body, "M", 3)) {
      const s = body.match(/S(\d+)/)
      if (s) emit(`TOOL CALL ${toolNumber} Z S${parseInt(s[1]!)}`)
    } else if (has(body, "M", 4)) {
      const s = body.match(/S(\d+)/)
      if (s) emit(`TOOL CALL ${toolNumber} Z S${parseInt(s[1]!)} M4`)
    } else if (has(body, "M", 5)) {
      emit("M5")
    } else if (has(body, "M", 8) || has(body, "M", 7)) {
      emit("M8")
    } else if (has(body, "M", 9)) {
      emit("M9")
    } else if (has(body, "M", 30) || has(body, "M", 2)) {
      emit("L Z+100 R0 FMAX M2")
    } else if (/T\d+/.test(body) && has(body, "M", 6)) {
      const t = body.match(/T(\d+)/)
      if (t) {
        const toolNum = parseInt(t[1]!)
        const s = body.match(/S(\d+)/)
        emit(`TOOL CALL ${toolNum} Z S${s ? parseInt(s[1]!) : 0}`)
        toolNumber = toolNum
      }
    } else if (has(body, "G", 43) && /H\d+/.test(body)) {
      // Tool length compensation is implicit in a Heidenhain TOOL CALL.
    } else if (has(body, "G", 41)) {
      comp = "RL"
    } else if (has(body, "G", 42)) {
      comp = "RR"
    } else if (has(body, "G", 40)) {
      comp = "R0"
    } else if (hasCoords && !/(^|\s)[GMT]\d/.test(body)) {
      // Modal line (`X10 Y5`): continue in the active motion mode.
      emit(`L ${formatHeidenhainCoords(coords)}${takeComp()}${rapid ? " FMAX" : feedWord(f)}`)
      track(coords)
    } else if (line !== "") {
      result.push(`; Unconverted: ${line}`)
    }
  }

  result.push("END PGM WORKPIECE MM")
  return result.join("\n")
}

/** Inserts `FUNCTION TCPM` after the first tool call and the matching reset before the program end. */
export const applyHeidenhainTCPMode = (code: string): string => {
  const lines = code.split("\n")
  let toolCall = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("TOOL CALL")) toolCall = i
    if (toolCall >= 0 && /L .*FMAX/.test(lines[i]!)) break
  }
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]!)
    if (i === (toolCall >= 0 ? toolCall : 4)) result.push("0 FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS ; Enable TCPM")
  }

  let endIndex = -1
  for (let i = result.length - 1; i >= 0; i--) {
    if (/ M2$| M30$/.test(result[i]!)) { endIndex = i; break }
  }
  if (endIndex < 0) endIndex = result.findIndex((l) => l.includes("END PGM"))
  if (endIndex >= 0) result.splice(endIndex, 0, "0 FUNCTION TCPM RESET ; Disable TCPM")
  return result.join("\n")
}

/**
 * Collapses runs of drilling blocks that share one cycle definition: the cycle is defined once, `CALL LBL 1`
 * runs it, and the hole positions live in the `LBL 1 ... LBL 0` subprogram placed before `END PGM`.
 */
export const applyHeidenhainFunctionBlocks = (code: string): string => {
  const lines = code.split("\n")
  interface Unit { start: number; end: number; key: string; point: string }
  const units: Unit[] = []

  for (let i = 0; i < lines.length; i++) {
    if (!/^\d+ CYCL DEF (200|203|207) /.test(lines[i]!)) continue
    let j = i + 1
    while (j < lines.length && /^\d+ Q\d+=/.test(lines[j]!)) j++
    const m = j < lines.length ? lines[j]!.match(POINT_RE) : null
    if (!m) continue
    const key = lines.slice(i, j).map((l) => l.replace(/^\d+ /, "")).join("\n")
    units.push({ start: i, end: j, key, point: m[1]! })
    i = j
  }

  const groups: Unit[][] = []
  for (const unit of units) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (last && prev && prev.key === unit.key && prev.end + 1 === unit.start) last.push(unit)
    else groups.push([unit])
  }

  const patterns = groups.filter((g) => g.length > 1)
  if (patterns.length === 0) return code

  const result: string[] = []
  const subprograms: string[] = []
  let cursor = 0
  patterns.forEach((group, index) => {
    const label = index + 1
    const first = group[0]!
    const last = group[group.length - 1]!
    result.push(...lines.slice(cursor, first.end)) // up to and including the cycle definition
    result.push(`0 CALL LBL ${label}`)
    subprograms.push(`0 LBL ${label} ; DRILL PATTERN`)
    for (const unit of group) subprograms.push(`0 L ${unit.point} R0 FMAX M99`)
    subprograms.push("0 LBL 0")
    cursor = last.end + 1
  })
  result.push(...lines.slice(cursor))

  const end = result.findIndex((l) => l.includes("END PGM"))
  if (end >= 0) result.splice(end, 0, ...subprograms)
  else result.push(...subprograms)
  return result.join("\n")
}

/** Renumbers the numbered blocks 1, 6, 11 ... (the legacy step of 5). */
export const applyAdvancedHeidenhainOptimizations = (code: string): string => {
  const result: string[] = []
  let count = 1
  for (const line of code.split("\n")) {
    if (line.startsWith(";") || line.trim() === "" || line.includes("BLK FORM") || line.includes("BEGIN PGM") || line.includes("END PGM")) {
      result.push(line)
      continue
    }
    const m = line.match(/^(\d+)(.*)$/)
    if (m) {
      result.push(count + m[2]!)
      count += 5
    } else result.push(line)
  }
  return result.join("\n")
}

const BLOCK_RE = /^\d+\s+(?:(?:L|CR|CC|CT|CP|C|CYCL|LBL|CALL|TOOL|FUNCTION|FN|STOP|PLANE|APPR|DEP|CHF|RND|TCH|M\d+)(?:\s|$)|Q\d+=)/

/** Heidenhain validation: BEGIN/END PGM, a tool call, block syntax. */
export const validateHeidenhain = (code: string): Validation => {
  const errors: string[] = []
  const warnings: string[] = []
  let hasBegin = false
  let hasEnd = false
  let hasToolCall = false
  const lines = code.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith("BEGIN PGM")) hasBegin = true
    if (line.startsWith("END PGM")) hasEnd = true
    if (line.includes("TOOL CALL")) hasToolCall = true
    if (/^\d+/.test(line) && !BLOCK_RE.test(line)) warnings.push(`Linea ${i + 1}: Sintassi potenzialmente errata`)
  }
  if (!hasBegin) errors.push("Manca BEGIN PGM")
  if (!hasEnd) errors.push("Manca END PGM")
  if (!hasToolCall) warnings.push("Nessuna chiamata utensile (TOOL CALL) trovata")
  return { isValid: errors.length === 0, errors, warnings }
}
