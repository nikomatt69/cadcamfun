/**
 * Fixed (canned) cycles: recognising them in G-code, the parameter form each one needs, and writing a line back.
 *
 * Port of the legacy `fixedCyclesParser` + `FixedCyclesUIRenderer` helpers. The legacy parser was a stateful
 * singleton: once a `G81` had been seen, *every* later `G1 X.. Y..` line counted as a continuation of the
 * cycle until a `G80`, so `isFixedCycle` answered for plain moves. Detection here is per line, stateless:
 * a line is a cycle when it starts with a cycle word.
 */

export const FixedCycleType = {
  DRILLING: "drilling",
  DRILLING_DWELL: "drilling_dwell",
  PECK_DRILLING: "peck_drilling",
  RIGHT_TAPPING: "right_tapping",
  BORING: "boring",
  BORING_DWELL: "boring_dwell",
  BACK_BORING: "back_boring",
  LEFT_TAPPING: "left_tapping",
  BORING_WITH_RETRACT: "boring_retract",
  CUSTOM: "custom"
} as const
export type FixedCycleType = (typeof FixedCycleType)[keyof typeof FixedCycleType]

export interface FixedCycleParams {
  x?: number
  y?: number
  z?: number
  /** Reference (retract) plane. */
  r?: number
  /** Peck increment. */
  q?: number
  /** Dwell, seconds. */
  p?: number
  f?: number
  l?: number
  /** Spindle speed (tapping). */
  s?: number
  /** Back-boring offsets. */
  i?: number
  j?: number
  k?: number
}

export interface FixedCycleResult {
  readonly type: FixedCycleType
  readonly params: FixedCycleParams
  readonly gCode: string
  readonly isValid: boolean
}

const WORDS: Readonly<Record<string, FixedCycleType>> = {
  G81: FixedCycleType.DRILLING,
  G82: FixedCycleType.DRILLING_DWELL,
  G83: FixedCycleType.PECK_DRILLING,
  G84: FixedCycleType.RIGHT_TAPPING,
  G85: FixedCycleType.BORING,
  G86: FixedCycleType.BORING_DWELL,
  G87: FixedCycleType.BACK_BORING,
  G74: FixedCycleType.LEFT_TAPPING,
  G89: FixedCycleType.BORING_WITH_RETRACT
}

const CODE_OF: Readonly<Record<FixedCycleType, string>> = {
  [FixedCycleType.DRILLING]: "G81",
  [FixedCycleType.DRILLING_DWELL]: "G82",
  [FixedCycleType.PECK_DRILLING]: "G83",
  [FixedCycleType.RIGHT_TAPPING]: "G84",
  [FixedCycleType.BORING]: "G85",
  [FixedCycleType.BORING_DWELL]: "G86",
  [FixedCycleType.BACK_BORING]: "G87",
  [FixedCycleType.LEFT_TAPPING]: "G74",
  [FixedCycleType.BORING_WITH_RETRACT]: "G89",
  [FixedCycleType.CUSTOM]: "G81"
}

/** The cycle word a line starts with (`G81`…), ignoring a leading line number. */
const cycleWord = (line: string): string | undefined => {
  const match = line.trim().match(/^(?:N\d+\s+)?(G\d+)\b/i)
  const word = match?.[1]?.toUpperCase()
  return word !== undefined && (word in WORDS || word === "G73") ? word : undefined
}

export const isFixedCycle = (line: string): boolean => cycleWord(line) !== undefined

export const parseFixedCycle = (line: string): FixedCycleResult | null => {
  const word = cycleWord(line)
  if (word === undefined) return null
  const params: FixedCycleParams = {}
  const re = /([A-Z])\s*([+-]?\d*\.?\d+)/gi
  const body = line.split(";")[0]!.replace(/\([^)]*\)/g, " ")
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    const value = parseFloat(m[2]!)
    const letter = m[1]!.toLowerCase()
    if (letter === "g" || letter === "n") continue
    if ("xyzrqpflsijk".includes(letter)) (params as Record<string, number>)[letter] = value
  }
  return { type: WORDS[word] ?? FixedCycleType.PECK_DRILLING, params, gCode: word, isValid: true }
}

export const cycleTitle = (type: FixedCycleType): string => ({
  [FixedCycleType.DRILLING]: "Drilling",
  [FixedCycleType.DRILLING_DWELL]: "Drilling with Dwell",
  [FixedCycleType.PECK_DRILLING]: "Peck Drilling",
  [FixedCycleType.RIGHT_TAPPING]: "Right Tapping",
  [FixedCycleType.BORING]: "Boring",
  [FixedCycleType.BORING_DWELL]: "Boring with Dwell",
  [FixedCycleType.BACK_BORING]: "Back Boring",
  [FixedCycleType.LEFT_TAPPING]: "Left Tapping",
  [FixedCycleType.BORING_WITH_RETRACT]: "Boring with Retract",
  [FixedCycleType.CUSTOM]: "Custom Cycle"
})[type]

export interface ParameterField {
  readonly name: keyof FixedCycleParams
  readonly label: string
  readonly description: string
  readonly defaultValue: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly unit?: string
  readonly required?: boolean
}

const COMMON: ReadonlyArray<ParameterField> = [
  { name: "x", label: "X", description: "Position X", defaultValue: 0 },
  { name: "y", label: "Y", description: "Position Y", defaultValue: 0 },
  { name: "z", label: "Z", description: "Final Depth", defaultValue: -10, unit: "mm", required: true },
  { name: "r", label: "R", description: "Reference Plane", defaultValue: 2, unit: "mm", required: true },
  { name: "f", label: "F", description: "Feed Rate", defaultValue: 100, unit: "mm/min", required: true }
]

const dwell = (required: boolean, value: number): ParameterField =>
  ({ name: "p", label: "P", description: "Dwell Time", defaultValue: value, min: 0, step: 0.1, unit: "s", ...(required ? { required: true } : {}) })
const spindle: ParameterField = { name: "s", label: "S", description: "Spindle Speed", defaultValue: 500, min: 1, unit: "rpm", required: true }

export const cycleParameterFields = (type: FixedCycleType): ReadonlyArray<ParameterField> => {
  switch (type) {
    case FixedCycleType.DRILLING_DWELL:
    case FixedCycleType.BORING_DWELL:
    case FixedCycleType.BORING_WITH_RETRACT: return [...COMMON, dwell(true, 0.5)]
    case FixedCycleType.PECK_DRILLING:
      return [...COMMON, { name: "q", label: "Q", description: "Increment Depth", defaultValue: 2, min: 0.1, step: 0.1, unit: "mm", required: true }, dwell(false, 0)]
    case FixedCycleType.RIGHT_TAPPING:
    case FixedCycleType.LEFT_TAPPING: return [...COMMON, dwell(false, 0), spindle]
    case FixedCycleType.BACK_BORING:
      return [
        ...COMMON,
        { name: "i", label: "I", description: "X Offset", defaultValue: 0, unit: "mm" },
        { name: "j", label: "J", description: "Y Offset", defaultValue: 0, unit: "mm" },
        { name: "k", label: "K", description: "Safety Distance", defaultValue: 2, unit: "mm", required: true }
      ]
    default: return COMMON
  }
}

/** One cycle line from its parameters (legacy `generateFixedCycleGCode`). */
export const generateFixedCycleGCode = (type: FixedCycleType, params: FixedCycleParams): string => {
  let gcode = CODE_OF[type]
  if (params.x !== undefined) gcode += ` X${params.x.toFixed(3)}`
  if (params.y !== undefined) gcode += ` Y${params.y.toFixed(3)}`
  if (params.z !== undefined) gcode += ` Z${params.z.toFixed(3)}`
  if (params.r !== undefined) gcode += ` R${params.r.toFixed(3)}`
  if (params.q !== undefined && params.q > 0) gcode += ` Q${params.q.toFixed(3)}`
  if (params.p !== undefined && params.p > 0) gcode += ` P${params.p.toFixed(3)}`
  if (params.f !== undefined) gcode += ` F${params.f.toFixed(0)}`
  if ((type === FixedCycleType.RIGHT_TAPPING || type === FixedCycleType.LEFT_TAPPING) && params.s !== undefined) gcode += ` S${params.s.toFixed(0)}`
  if (type === FixedCycleType.BACK_BORING) {
    if (params.i !== undefined && params.i !== 0) gcode += ` I${params.i.toFixed(3)}`
    if (params.j !== undefined && params.j !== 0) gcode += ` J${params.j.toFixed(3)}`
    if (params.k !== undefined) gcode += ` K${params.k.toFixed(3)}`
  }
  return gcode
}

/** The "Create Fixed Cycle" button: a `G81` at an element's centre down to `-depth`, retract plane 2. */
export const drillingCycleAt = (x: number, y: number, depth: number, feed: number): string =>
  `G81 X${x.toFixed(3)} Y${y.toFixed(3)} Z${(-depth).toFixed(3)} R${(2).toFixed(3)} F${feed} ; Drilling cycle`

/** Replaces the cycle lines of a program with `cycle` (and one `G80`), as legacy `handleFixedCycleGCode` did. */
export const replaceFixedCycles = (gcode: string, cycle: string): string => {
  const kept = gcode.split("\n").filter(line => !isFixedCycle(line) && !line.includes("G80"))
  return [...(gcode.includes("G8") ? kept : gcode.split("\n")), cycle, "G80 ; Cancel fixed cycle"].join("\n")
}

/** The program without any cycle (and without `G80`), "Remove All Fixed Cycles". */
export const removeFixedCycles = (gcode: string): string =>
  gcode.split("\n").filter(line => !isFixedCycle(line) && !line.includes("G80")).join("\n")

export const detectFixedCycles = (gcode: string): Array<{ gcode: string }> =>
  gcode.split("\n").filter(isFixedCycle).map(line => ({ gcode: line }))
