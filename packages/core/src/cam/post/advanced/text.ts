/**
 * Word-level helpers shared by the advanced post-processor passes.
 *
 * The legacy code matched codes with `line.includes("G0")`, which also matched `G01`/`G02`/`G03` (so a feed move
 * was converted as a rapid) and `M3` matched `M30` (so the program end was dropped). The helpers here match whole
 * words instead and ignore the trailing `;` comment, which is the only intentional behaviour change.
 */

export interface Coords {
  x?: number
  y?: number
  z?: number
}

export interface ArcCenter {
  i?: number
  j?: number
  k?: number
}

/** The command part of a line: everything before a `;` comment. */
export const codePart = (line: string): string => {
  const at = line.indexOf(";")
  return at < 0 ? line : line.slice(0, at)
}

/** True when `line` has the word `<letter><n>` (with optional leading zeros), e.g. `has(l, "G", 1)` for `G1`/`G01`. */
export const has = (line: string, letter: string, n: number): boolean =>
  new RegExp(`(?<![A-Za-z0-9.])${letter}0*${n}(?!\\d|\\.\\d)`).test(codePart(line))

const num = (line: string, letter: string): number | undefined => {
  const m = line.match(new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`))
  return m ? parseFloat(m[1]!) : undefined
}

export const extractCoordinates = (line: string): Coords => {
  const coords: Coords = {}
  const x = num(line, "X")
  const y = num(line, "Y")
  const z = num(line, "Z")
  if (x !== undefined) coords.x = x
  if (y !== undefined) coords.y = y
  if (z !== undefined) coords.z = z
  return coords
}

export const extractArcCenter = (line: string): ArcCenter | null => {
  const center: ArcCenter = {}
  const i = num(line, "I")
  const j = num(line, "J")
  const k = num(line, "K")
  if (i !== undefined) center.i = i
  if (j !== undefined) center.j = j
  if (k !== undefined) center.k = k
  return i === undefined && j === undefined && k === undefined ? null : center
}

export const extractFeedrate = (line: string): number | null => num(line, "F") ?? null
export const extractRetractHeight = (line: string): number | null => num(line, "R") ?? null
export const extractPeckDepth = (line: string): number | null => num(line, "Q") ?? null
/** In a Fanuc `G84` the thread pitch is usually given as `F`. */
export const extractThreadPitch = (line: string): number | null => num(line, "F") ?? null

/** Cycle depth: the absolute value of `Z`. */
export const extractCycleDepth = (line: string): number | null => {
  const z = num(line, "Z")
  return z === undefined ? null : Math.abs(z)
}

/** `X+1.000 Y-2.000 Z+0.000`, as a Heidenhain conversational block wants it. */
export const formatHeidenhainCoords = (coords: Coords): string => {
  let result = ""
  if (coords.x !== undefined) result += "X" + (coords.x >= 0 ? "+" : "") + coords.x.toFixed(3) + " "
  if (coords.y !== undefined) result += "Y" + (coords.y >= 0 ? "+" : "") + coords.y.toFixed(3) + " "
  if (coords.z !== undefined) result += "Z" + (coords.z >= 0 ? "+" : "") + coords.z.toFixed(3) + " "
  return result.trim()
}

export const lineCount = (text: string): number => text.split("\n").length
