import { emitProgram } from "./emitter.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * GRBL dialect: no tool changer (`M6` is not supported), so later tools pause with
 * `M0`; no canned cycles (always expanded); ends with `M2`.
 */
export const grblDialect: Dialect = {
  id: "grbl",
  canned: false,
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  uppercaseComments: false,
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
