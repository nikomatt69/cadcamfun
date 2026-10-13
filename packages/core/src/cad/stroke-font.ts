/**
 * A single-stroke font: every character is a few polylines along its centre line, the way a CNC engraver (and a plotter) draws text.
 *
 * It exists because a machine cannot cut a typeface outline it does not have: the CAM engraves `text3d` along these strokes, one
 * pass per stroke, with the tool the operation uses. Letters are drawn on a 4 x 6 grid (cap height 6); lower case is drawn as
 * upper case, as on every engraving font. A character with no glyph is not drawn and is reported to the caller, never replaced by a box.
 */
import type { Vec2 } from "./vec.ts"

type Stroke = ReadonlyArray<readonly [number, number]>

/** Width of a glyph cell and the gap that follows it, in grid units; a space is `SPACE_ADVANCE` wide. */
const CELL = 4
const ADVANCE = 5
const SPACE_ADVANCE = 3
/** Cap height of the grid, in grid units. */
export const STROKE_CAP_HEIGHT = 6
/** Distance between baselines, in cap heights. */
const LINE_PITCH = 1.5

const ring: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]
const bowl: Stroke = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]
const dot = (x: number, y: number): Stroke => [[x - 0.2, y], [x + 0.2, y], [x + 0.2, y + 0.4], [x - 0.2, y + 0.4], [x - 0.2, y]]

const GLYPHS: Readonly<Record<string, ReadonlyArray<Stroke>>> = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 3], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [ring],
  P: [bowl],
  Q: [ring, [[2, 2], [4, 0]]],
  R: [bowl, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 6], [4, 0]], [[4, 6], [0, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "0": [ring, [[1, 1], [3, 5]]],
  "1": [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  "7": [[[0, 6], [4, 6], [1, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [4, 3]]],
  ".": [dot(2, 0)],
  ",": [[[2, 1], [1.5, -1]]],
  ":": [dot(2, 0.6), dot(2, 3.6)],
  ";": [[[2, 1], [1.5, -1]], dot(2, 3.6)],
  "!": [[[2, 6], [2, 2]], dot(2, 0)],
  "?": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [2, 3], [2, 2]], dot(2, 0)],
  "-": [[[1, 3], [3, 3]]],
  "_": [[[0, 0], [4, 0]]],
  "+": [[[1, 3], [3, 3]], [[2, 2], [2, 4]]],
  "=": [[[0, 2], [4, 2]], [[0, 4], [4, 4]]],
  "/": [[[0, 0], [4, 6]]],
  "(": [[[3, 6], [2, 5], [2, 1], [3, 0]]],
  ")": [[[1, 6], [2, 5], [2, 1], [1, 0]]],
  "*": [[[2, 1], [2, 5]], [[0, 2], [4, 4]], [[0, 4], [4, 2]]],
  "'": [[[2, 6], [2, 4]]],
  "\"": [[[1, 6], [1, 4]], [[3, 6], [3, 4]]],
  "°": [[[1, 5], [1, 6], [2, 6], [2, 5], [1, 5]]],
  "#": [[[1, 0], [1, 6]], [[3, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]],
  "%": [[[0, 0], [4, 6]], [[0, 6], [1, 6], [1, 5], [0, 5], [0, 6]], [[3, 1], [4, 1], [4, 0], [3, 0], [3, 1]]],
  "<": [[[4, 5], [0, 3], [4, 1]]],
  ">": [[[0, 5], [4, 3], [0, 1]]]
}

/** Whether the font has a glyph for `char` (lower case counts as upper case; a space always has one). */
export const hasGlyph = (char: string): boolean => char === " " || Object.hasOwn(GLYPHS, char.toUpperCase())

export interface TextStrokes {
  /** The polylines to draw, in the plane of the text, `x` along the line of text and `y` up, from the lower-left corner of the first line. */
  readonly strokes: ReadonlyArray<ReadonlyArray<Vec2>>
  /** Extent of the text, in the units of `height`. */
  readonly width: number
  readonly height: number
  /** Characters with no glyph, each once: they are not drawn. */
  readonly unsupported: ReadonlyArray<string>
}

/**
 * The strokes that spell `text` with capitals `height` tall. A new line (`\n`) starts the next line below. `spacing` scales the gap
 * between letters (1 = the font's own).
 */
export const textStrokes = (text: string, height: number, spacing = 1): TextStrokes => {
  const scale = height / STROKE_CAP_HEIGHT
  const strokes: Vec2[][] = []
  const unsupported = new Set<string>()
  const lines = text.split("\n")
  let widest = 0
  lines.forEach((line, row) => {
    let pen = 0
    const base = -row * height * LINE_PITCH
    for (const char of line) {
      if (char === " ") { pen += SPACE_ADVANCE; continue }
      const glyph = GLYPHS[char.toUpperCase()]
      if (glyph === undefined) { unsupported.add(char); pen += ADVANCE; continue }
      for (const stroke of glyph) strokes.push(stroke.map(([x, y]) => ({ x: (pen + x) * scale, y: base + y * scale })))
      widest = Math.max(widest, pen + CELL)
      pen += CELL + (ADVANCE - CELL) * spacing
    }
  })
  const rows = lines.length
  return { strokes, width: Math.max(0, widest) * scale, height: height + (rows - 1) * height * LINE_PITCH, unsupported: [...unsupported] }
}
