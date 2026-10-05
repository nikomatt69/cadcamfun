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

/** The two display units the schema allows (`UnitsSchema`). */
export type DisplayUnits = "mm" | "inch"

/** Decimal places used when formatting a length; the spec's convention is fixed, never `toString`. */
export const DEFAULT_DECIMALS = 3

/** Millimetres -> display units. */
export const toDisplay = (mm: number, units: DisplayUnits): number => (units === "inch" ? mm / MM_PER_INCH : mm)

/** Display units -> millimetres. */
export const fromDisplay = (value: number, units: DisplayUnits): number => (units === "inch" ? value * MM_PER_INCH : value)

/**
 * Formats a length for the rulers and the status bar. Inch drawings get more
 * decimals because a 1/1000" tick is finer than the display's own resolution.
 */
export const formatLength = (mm: number, units: DisplayUnits = "mm", decimals?: number): string => {
  const places = decimals ?? (units === "inch" ? 4 : DEFAULT_DECIMALS)
  return `${toDisplay(mm, units).toFixed(places)} ${units}`
}

/** Formats an angle in radians as degrees; angles never cross a module boundary as radians. */
export const formatAngle = (radians: number, decimals = 1): string => `${((radians * 180) / Math.PI).toFixed(decimals)}°`

/** Parses a user-typed length back into millimetres; `undefined` when it is not a number. */
export const parseLength = (text: string, units: DisplayUnits = "mm"): number | undefined => {
  const trimmed = text.trim().replace(/[a-zA-Z°]+$/, "")
  const value = Number(trimmed)
  if (trimmed.length === 0 || Number.isNaN(value) || !Number.isFinite(value)) return undefined
  return fromDisplay(value, units)
}