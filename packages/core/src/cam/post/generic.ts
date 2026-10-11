import { emitProgram } from "./emitter.ts"
import type { Dialect, Post } from "./types.ts"

/** Plain ISO/LinuxCNC-style dialect: the reference output other posts are compared against. */
export const genericDialect: Dialect = {
  id: "generic",
  canned: true,
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  uppercaseComments: false,
  rotary: true,
  begin: () => [],
  setup: ["G90", "G17", "G94"],
  toolChange: (n) => [`T${n} M6`],
  end: "M30",
  finish: []
}

export const genericPost: Post = {
  id: "generic",
  emit: (program, options = {}) => emitProgram(program, options, genericDialect)
}
