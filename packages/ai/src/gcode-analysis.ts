/**
 * Deterministic static checks for G-code (the `cam_analyze_gcode` tool and the
 * `analyze-gcode` route). Never an LLM: every finding has a stable `code`.
 */
export interface MachineProfile {
  readonly workVolume?: { readonly x: number; readonly y: number; readonly z: number }
  readonly maxFeedRate?: number
  readonly maxSpindleSpeed?: number
}

export type Severity = "error" | "warning" | "info"

export interface GcodeIssue {
  readonly severity: Severity
  readonly code: string
  readonly line: number
  readonly message: string
}

export interface GcodeReport {
  readonly issues: ReadonlyArray<GcodeIssue>
  readonly stats: {
    readonly lines: number
    readonly rapidMoves: number
    readonly cutMoves: number
    readonly bounds: { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } } | null
    readonly toolChanges: number
  }
}

const WORD = /([A-Z])\s*(-?\d*\.?\d+)/g

export const analyzeGcode = (gcode: string, machine?: MachineProfile): GcodeReport => {
  const issues: GcodeIssue[] = []
  const add = (severity: Severity, code: string, line: number, message: string) => issues.push({ severity, code, line, message })
  const lines = gcode.split(/\r?\n/)
  let units: "mm" | "in" | undefined
  let absolute = true
  let motion: 0 | 1 | 2 | 3 | undefined
  let feed: number | undefined
  let spindleOn = false
  let rapidMoves = 0, cutMoves = 0, toolChanges = 0
  let ended = false
  const pos = { x: 0, y: 0, z: 0 }
  let min: { x: number; y: number; z: number } | null = null
  let max: { x: number; y: number; z: number } | null = null

  lines.forEach((raw, index) => {
    const lineNo = index + 1
    const text = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim().toUpperCase()
    if (!text || text.startsWith("%")) return
    const words: Array<[string, number]> = []
    for (const m of text.matchAll(WORD)) words.push([m[1]!, Number(m[2])])
    const has = (letter: string, value?: number) => words.some(([l, v]) => l === letter && (value === undefined || v === value))
    const value = (letter: string) => words.find(([l]) => l === letter)?.[1]

    if (has("G", 21)) units = "mm"
    if (has("G", 20)) units = "in"
    if (has("G", 90)) absolute = true
    if (has("G", 91)) absolute = false
    if (has("G", 0)) motion = 0
    if (has("G", 1)) motion = 1
    if (has("G", 2)) motion = 2
    if (has("G", 3)) motion = 3
    if (has("M", 3) || has("M", 4)) {
      spindleOn = true
      const s = value("S")
      if (machine?.maxSpindleSpeed !== undefined && s !== undefined && s > machine.maxSpindleSpeed) {
        add("error", "SPINDLE_OVER_LIMIT", lineNo, `Spindle speed S${s} exceeds the machine limit of ${machine.maxSpindleSpeed}.`)
      }
    }
    if (has("M", 5)) spindleOn = false
    if (has("M", 6)) toolChanges++
    if (has("M", 30) || has("M", 2)) ended = true
    const f = value("F")
    if (f !== undefined) {
      feed = f
      if (machine?.maxFeedRate !== undefined && f > machine.maxFeedRate) {
        add("warning", "FEED_OVER_LIMIT", lineNo, `Feed F${f} exceeds the machine limit of ${machine.maxFeedRate}.`)
      }
    }

    const moves = has("X") || has("Y") || has("Z")
    if (!moves || motion === undefined) return
    const next = { ...pos }
    for (const axis of ["x", "y", "z"] as const) {
      const v = value(axis.toUpperCase())
      if (v !== undefined) next[axis] = absolute ? v : pos[axis] + v
    }
    if (motion === 0) {
      rapidMoves++
      if (next.z < 0 && absolute) add("warning", "RAPID_BELOW_ZERO", lineNo, "Rapid move below Z0 (possible rapid through material).")
    } else {
      cutMoves++
      if (!spindleOn) add("error", "CUT_WITHOUT_SPINDLE", lineNo, "Cutting move before the spindle was started (M3/M4).")
      if (feed === undefined) add("error", "CUT_WITHOUT_FEED", lineNo, "Cutting move without a feed rate (F).")
    }
    const wv = machine?.workVolume
    if (wv && absolute && (next.x < 0 || next.y < 0 || next.x > wv.x || next.y > wv.y || next.z > wv.z || next.z < -wv.z)) {
      add("error", "OUT_OF_TRAVEL", lineNo, `Move to (${next.x}, ${next.y}, ${next.z}) leaves the work volume.`)
    }
    Object.assign(pos, next)
    min = min ? { x: Math.min(min.x, pos.x), y: Math.min(min.y, pos.y), z: Math.min(min.z, pos.z) } : { ...pos }
    max = max ? { x: Math.max(max.x, pos.x), y: Math.max(max.y, pos.y), z: Math.max(max.z, pos.z) } : { ...pos }
  })

  if (units === undefined) add("warning", "NO_UNITS", 1, "No unit mode (G20/G21) was set.")
  if (!ended && lines.some((l) => l.trim())) add("info", "NO_PROGRAM_END", lines.length, "The program has no end (M30/M2).")
  return { issues, stats: { lines: lines.length, rapidMoves, cutMoves, bounds: min && max ? { min, max } : null, toolChanges } }
}
