/**
 * Fanuc passes: the basic optimiser (legacy `fanucOptimizer`), the high-speed / corner-rounding add-ons, the
 * modal pass and the Fanuc validator. Haas reuses all of it.
 */
import type { OptimizationOptions, Validation } from "./options.ts"
import { codePart, has } from "./text.ts"

export interface BasicFanucResult {
  readonly code: string
  readonly improvements: string[]
  readonly stats: { readonly originalLines: number; readonly optimizedLines: number; readonly reductionPercent: number; readonly estimatedTimeReduction: number }
}

const NORMALISE = (line: string): string =>
  line.replace(/(?<![A-Za-z0-9.])G0([0-3])(?!\d)/g, "G$1")

const push = (improvements: string[], text: string): void => {
  if (!improvements.includes(text)) improvements.push(text)
}

/** Modal G-codes that stay active until changed; the repeated ones are dropped (G00 -> G0 ... for brevity). */
const optimizeForFanuc = (lines: string[], improvements: string[]): string[] => {
  const out: string[] = []
  const modal = { movement: "", plane: "", units: "", cutter: "", feedMode: "" }

  const apply = (line: string, key: keyof typeof modal, pattern: RegExp, announce?: string): string => {
    const m = codePart(line).match(pattern)
    if (!m) return line
    if (m[0] === modal[key]) {
      if (announce) push(improvements, announce)
      return line.replace(m[0], "")
    }
    modal[key] = m[0]
    return line
  }

  for (const original of lines) {
    let line = NORMALISE(original)
    line = apply(line, "movement", /(?<![A-Za-z0-9.])G[0-3](?!\d|\.\d)/, "Removed redundant modal G-codes")
    line = apply(line, "plane", /(?<![A-Za-z0-9.])G1[7-9](?!\d|\.\d)/)
    line = apply(line, "units", /(?<![A-Za-z0-9.])G2[01](?!\d|\.\d)/)
    line = apply(line, "cutter", /(?<![A-Za-z0-9.])G4[0-9](?!\d|\.\d)/)
    line = apply(line, "feedMode", /(?<![A-Za-z0-9.])G9[45](?!\d|\.\d)/)
    line = line.replace(/\s+/g, " ").trim()
    if (line) out.push(line)
  }
  return out
}

/** The basic Fanuc optimiser: redundant positions, repeated F/S words, consecutive rapids, modal G-codes. */
export const fanucBasicOptimize = (code: string): BasicFanucResult => {
  const lines = code.split("\n").filter((line) => line.trim())
  let optimized: string[] = []
  const improvements: string[] = []

  let curX: number | null = null
  let curY: number | null = null
  let curZ: number | null = null
  let curF: number | null = null
  let curS: number | null = null
  let consecutiveRapid = 0
  let consecutiveLinear = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith(";") || line.startsWith("(")) {
      optimized.push(line)
      continue
    }
    const body = codePart(line)
    const isRapid = has(body, "G", 0)
    const isLinear = has(body, "G", 1)

    const xm = body.match(/X([-\d.]+)/)
    const ym = body.match(/Y([-\d.]+)/)
    const zm = body.match(/Z([-\d.]+)/)
    const fm = body.match(/F([\d.]+)/)
    const sm = body.match(/S([\d.]+)/)
    const newX = xm ? parseFloat(xm[1]!) : null
    const newY = ym ? parseFloat(ym[1]!) : null
    const newZ = zm ? parseFloat(zm[1]!) : null
    const newF = fm ? parseFloat(fm[1]!) : null
    const newS = sm ? parseFloat(sm[1]!) : null

    if (isRapid || isLinear) {
      const noChange = (newX === null || newX === curX) && (newY === null || newY === curY) && (newZ === null || newZ === curZ)
      if (noChange && ((isRapid && consecutiveRapid > 0) || (isLinear && consecutiveLinear > 0))) {
        push(improvements, "Removed redundant position commands")
        continue
      }
      if (isRapid) { consecutiveRapid++; consecutiveLinear = 0 } else { consecutiveLinear++; consecutiveRapid = 0 }
    }

    let modified = line
    if (fm && newF === curF) {
      modified = modified.replace(/F[\d.]+/, "")
      push(improvements, "Removed redundant feed rate commands")
    }
    if (sm && newS === curS) {
      modified = modified.replace(/S[\d.]+/, "")
      push(improvements, "Removed redundant spindle speed commands")
    }

    if (newX !== null) curX = newX
    if (newY !== null) curY = newY
    if (newZ !== null) curZ = newZ
    if (newF !== null) curF = newF
    if (newS !== null) curS = newS

    // Consolidate a Z rapid followed by an XY rapid.
    if (isRapid && i < lines.length - 1) {
      const next = lines[i + 1]!.trim()
      const nextBody = codePart(next)
      if (has(nextBody, "G", 0) && !nextBody.includes("Z") && modified.includes("Z") && !next.startsWith(";")) {
        const nx = nextBody.match(/X([-\d.]+)/)
        const ny = nextBody.match(/Y([-\d.]+)/)
        if (nx || ny) {
          modified = modified.replace(/G0+/, "G0")
          if (nx) modified += ` X${nx[1]}`
          if (ny) modified += ` Y${ny[1]}`
          i++
          push(improvements, "Consolidated consecutive rapid moves")
        }
      }
    }

    modified = modified.replace(/\s+/g, " ").trim()
    if (modified) optimized.push(modified)
  }

  optimized = optimizeForFanuc(optimized, improvements)

  const originalLines = lines.length
  const optimizedLines = optimized.length
  const reductionPercent = parseFloat((((originalLines - optimizedLines) / originalLines) * 100).toFixed(2))
  if (improvements.length === 0) improvements.push("Code is already well optimized")

  return {
    code: optimized.join("\n"),
    improvements,
    stats: { originalLines, optimizedLines, reductionPercent, estimatedTimeReduction: (originalLines - optimizedLines) * 0.01 }
  }
}

/** Inserts the AICC / nano-smoothing / exact-stop block after the setup lines and the matching reset before M30/M2. */
export const applyFanucHighSpeedMode = (code: string, options: OptimizationOptions): string => {
  const lines = code.split("\n")
  const fanuc = options.controllerSpecific.fanuc

  let insertIndex = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("G90") || lines[i]!.includes("G21") || lines[i]!.includes("G17")) insertIndex = i + 1
    if (lines[i]!.includes("G0") || lines[i]!.includes("G1")) break
  }

  const commands: string[] = []
  if (fanuc.useAI) commands.push("G05.1 Q1 ; Attiva AI Contour Control")
  if (fanuc.useNanoSmoothing) commands.push("G05.1 Q3 ; Attiva Nano Smoothing")
  if (fanuc.useHighPrecisionMode) commands.push("G61.1 ; Modalità di arresto esatto")
  else commands.push("G64 P0.05 ; Modalità taglio con tolleranza di raccordo 0.05mm")

  commands.unshift("")
  commands.unshift("; ----- Attivazione modalità Alta Velocità -----")
  commands.push("; -----------------------------------------")
  commands.push("")
  lines.splice(insertIndex, 0, ...commands)

  const reset: string[] = ["; ----- Disattivazione modalità Alta Velocità -----"]
  if (fanuc.useAI) reset.push("G05.1 Q0 ; Disattiva AI Contour Control")
  if (fanuc.useNanoSmoothing) reset.push("G05.1 Q0 ; Disattiva Nano Smoothing")
  reset.push("G64 ; Ripristina modalità taglio normale")
  reset.push("; -----------------------------------------")

  for (let i = lines.length - 1; i >= 0; i--) {
    if (has(lines[i]!, "M", 30) || has(lines[i]!, "M", 2)) {
      lines.splice(i, 0, ...reset)
      return lines.join("\n")
    }
  }
  lines.push("", ...reset)
  return lines.join("\n")
}

/** Adds a 0.5 mm corner radius to consecutive feed moves that change both X and Y at the same Z. */
export const applyFanucCornerRounding = (code: string): string => {
  const lines = code.split("\n")
  const result: string[] = []
  let inContour = false
  let lastX: number | null = null
  let lastY: number | null = null
  let lastZ: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith(";") || line === "") {
      result.push(line)
      continue
    }
    const body = codePart(line)
    const linear = has(body, "G", 1)
    if (linear && !inContour) inContour = true

    const xm = body.match(/X([-\d.]+)/)
    const ym = body.match(/Y([-\d.]+)/)
    const zm = body.match(/Z([-\d.]+)/)
    if (xm) lastX = parseFloat(xm[1]!)
    if (ym) lastY = parseFloat(ym[1]!)
    if (zm) lastZ = parseFloat(zm[1]!)

    if (inContour && i < lines.length - 1) {
      const next = lines[i + 1]!.trim()
      const nextBody = codePart(next)
      if (linear && has(nextBody, "G", 1)) {
        const nx = nextBody.match(/X([-\d.]+)/)
        const ny = nextBody.match(/Y([-\d.]+)/)
        const nz = nextBody.match(/Z([-\d.]+)/)
        const nextX: number | null = nx ? parseFloat(nx[1]!) : lastX
        const nextY: number | null = ny ? parseFloat(ny[1]!) : lastY
        const nextZ: number | null = nz ? parseFloat(nz[1]!) : lastZ
        if (lastX !== null && lastY !== null && nextX !== null && nextY !== null) {
          if (lastX !== nextX && lastY !== nextY && lastZ === nextZ) {
            result.push(line + " R0.5 ; Corner rounding")
            continue
          }
        }
      }
    }

    result.push(line)
    if (inContour && has(body, "G", 0)) inContour = false
  }
  return result.join("\n")
}

/** Modal G0/G1 omission, repeated F/S removal and decimal compaction. */
export const applyAdvancedFanucOptimizations = (code: string, options: OptimizationOptions): string => {
  const result: string[] = []
  let modalG0 = false
  let modalG1 = false
  let currentF: number | null = null
  let currentS: number | null = null
  const fanuc = options.controllerSpecific.fanuc

  for (const raw of code.split("\n")) {
    let line = raw.trim()
    if (line.startsWith(";") || line === "") {
      result.push(line)
      continue
    }
    const body = codePart(line)

    if (fanuc.useModalGCodes) {
      if (has(body, "G", 0)) {
        if (modalG0) line = line.replace(/(?<![A-Za-z0-9.])G0*0(?!\d|\.\d)\s+/, "")
        else { modalG0 = true; modalG1 = false }
      } else if (has(body, "G", 1)) {
        if (modalG1) line = line.replace(/(?<![A-Za-z0-9.])G0*1(?!\d|\.\d)\s+/, "")
        else { modalG1 = true; modalG0 = false }
      } else if (has(body, "G", 2) || has(body, "G", 3) || /(?<![A-Za-z0-9.])G8\d(?!\d)/.test(body)) {
        // Arcs and canned cycles replace the active motion mode.
        modalG0 = false
        modalG1 = false
      }
    }

    if (options.optimizeFeedrates) {
      const fm = line.match(/F([\d.]+)/)
      if (fm) {
        const f = parseFloat(fm[1]!)
        if (currentF === f) line = line.replace(/F[\d.]+/, "")
        else currentF = f
      }
      const sm = line.match(/S([\d.]+)/)
      if (sm) {
        const s = parseFloat(sm[1]!)
        if (currentS === s) line = line.replace(/S[\d.]+/, "")
        else currentS = s
      }
    }

    if (fanuc.useDecimalFormat) line = line.replace(/(\d+)\.0+([^\d]|$)/g, "$1$2")
    result.push(line)
  }
  return result.join("\n")
}

/** Fanuc validation: line length, program start/end, arc parameters, malformed G-words. */
export const validateFanuc = (code: string): Validation => {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = code.split("\n")
  let hasStart = false
  let hasEnd = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    const body = codePart(line)
    if (line.length > 128) warnings.push(`Linea ${i + 1} è più lunga di 128 caratteri (${line.length})`)
    if (line.startsWith("%")) hasStart = true
    if (has(body, "M", 30) || has(body, "M", 2)) hasEnd = true
    if ((has(body, "G", 2) || has(body, "G", 3)) && !/[IJR][-+\d.]/.test(body)) errors.push(`Linea ${i + 1}: Arco mancante di parametri I/J o R`)
    if (body.includes("G") && /G\d+\.\d+[^\s\d.]/.test(body)) errors.push(`Linea ${i + 1}: Formato G-code non valido`)
  }

  if (!hasStart) warnings.push("Il programma non ha un simbolo di inizio (%)")
  if (!hasEnd) warnings.push("Il programma non ha un comando di fine (M30/M2)")
  if (lines.length > 10000) warnings.push(`Il programma è molto lungo (${lines.length} linee), potrebbe causare problemi di memoria`)
  return { isValid: errors.length === 0, errors, warnings }
}
