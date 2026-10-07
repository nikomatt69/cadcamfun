/**
 * Display units at the UI boundary (spec 06-desktop-ui.md §2, spec 01 §1).
 *
 * Everything inside the viewport — the document, the spatial index, the toolpath
 * IR — stays in millimetres and radians. Only the strings the user reads (the
 * rulers, the status bar, the properties panel) are converted here, so there is
 * exactly one place where inches can leak in.
 */

/** Millimetres in one inch, exact by definition. */
export const MM_PER_INCH = 25.4

/**
 * The display units. Each has its size in millimetres (exact) and the decimals that suit it; the editor itself always
 * works in millimetres, only what the user reads and types is converted.
 */
export const UNIT_TABLE = {
  mm: { label: "mm", mmPerUnit: 1, decimals: 3 },
  um: { label: "µm", mmPerUnit: 0.001, decimals: 1 },
  cm: { label: "cm", mmPerUnit: 10, decimals: 4 },
  m: { label: "m", mmPerUnit: 1000, decimals: 6 },
  inch: { label: "inch", mmPerUnit: MM_PER_INCH, decimals: 4 },
  thou: { label: "thou", mmPerUnit: 0.0254, decimals: 2 }
} as const

/** Every display unit (`UnitsSchema` of a stored drawing stays mm | inch; this is only what is shown). */
export type DisplayUnits = keyof typeof UNIT_TABLE
export const DISPLAY_UNITS = Object.keys(UNIT_TABLE) as ReadonlyArray<DisplayUnits>
export const isDisplayUnits = (value: unknown): value is DisplayUnits => typeof value === "string" && Object.hasOwn(UNIT_TABLE, value)

/** The unit a G-code program is written in: imperial displays (inch, thou) give inch programs, every other unit millimetres. */
export const programUnitsOf = (units: DisplayUnits): "mm" | "inch" => (units === "inch" || units === "thou" ? "inch" : "mm")

/** Decimal places used when formatting a length; the spec's convention is fixed, never `toString`. */
export const DEFAULT_DECIMALS = 3

/** Millimetres -> display units. */
export const toDisplay = (mm: number, units: DisplayUnits): number => mm / UNIT_TABLE[units].mmPerUnit

/** Display units -> millimetres. */
export const fromDisplay = (value: number, units: DisplayUnits): number => value * UNIT_TABLE[units].mmPerUnit

/**
 * Formats a length for the rulers and the status bar. Each unit has its own default decimals (inches get more
 * than millimetres: a 1/1000" tick is finer than the display's own resolution).
 */
export const formatLength = (mm: number, units: DisplayUnits = "mm", decimals?: number): string => {
  const places = decimals ?? UNIT_TABLE[units].decimals
  return `${toDisplay(mm, units).toFixed(places)} ${UNIT_TABLE[units].label}`
}

/** Formats an angle in radians as degrees; angles never cross a module boundary as radians. */
export const formatAngle = (radians: number, decimals = 1): string => `${((radians * 180) / Math.PI).toFixed(decimals)}°`

/** Parses a user-typed length back into millimetres; `undefined` when it is not a number. */
export const parseLength = (text: string, units: DisplayUnits = "mm"): number | undefined => {
  const trimmed = text.trim().replace(/[a-zA-Zµ°]+$/, "")
  const value = Number(trimmed)
  if (trimmed.length === 0 || Number.isNaN(value) || !Number.isFinite(value)) return undefined
  return fromDisplay(value, units)
}