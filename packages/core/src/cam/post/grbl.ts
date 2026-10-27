import { emitProgram } from "./emitter.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * GRBL dialect: no tool changer (`M6` is not supported), so later tools pause with
 * `M0`; no canned cycles (always expanded); ends with `M2`.
 *
 * Source: Grbl v1.1 command reference (gnea/grbl wiki): G0-G3, G17-G19, G20/G21, G90/G91, G93/G94, G4, G54-G59, G80 only;
 * M0 M1 M2 M30, M3 M4 M5, M8 M9, and M7 only with the `ENABLE_M7` compile option (disabled by default): mist is written as M8.
 */
export const grblDialect: Dialect = {
  id: "grbl",
  canned: false,
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  uppercaseComments: false,
  /** GRBL is a 3-axis motion controller: rotary words are refused, not dropped. */
  rotary: false,
  noMist: true,
  begin: () => [],
  setup: ["G90", "G17", "G94"],
  toolChange: (n, first) => (first ? [`(TOOL T${n})`] : [`(CHANGE TO TOOL T${n})`, "M0"]),
  end: "M2",
  finish: []
}

export const grblPost: Post = {
  id: "grbl",
  emit: (program, options = {}) => emitProgram(program, options, grblDialect)
}
